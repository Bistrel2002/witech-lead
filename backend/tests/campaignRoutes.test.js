import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import { validateChannel, findOwnedCampaign, loadCampaignForStart } from '../src/routes.js';
import { assertChannelSendable } from '../src/services/emailService.js';

test.beforeEach(() => {
  Object.assign(process.env, {
    AWS_REGION: 'eu-west-3',
    MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
    TWILIO_ACCOUNT_SID: 'AC',
    TWILIO_AUTH_TOKEN: 't',
    TWILIO_SENDER_ID: 'WITECH',
    SES_WEBHOOK_TOKEN: 'tok'
  });
  resetPlatformConfigCache();
});

// --- Minor 11: reject an unusable channel at creation, not at send time -----

test('validateChannel accepts the two supported channels', () => {
  assert.deepEqual(validateChannel('email'), { ok: true, channel: 'email' });
  assert.deepEqual(validateChannel('sms'), { ok: true, channel: 'sms' });
});

test('validateChannel defaults to email when the channel is omitted', () => {
  assert.deepEqual(validateChannel(undefined), { ok: true, channel: 'email' });
  assert.deepEqual(validateChannel(null), { ok: true, channel: 'email' });
  assert.deepEqual(validateChannel(''), { ok: true, channel: 'email' });
});

test('validateChannel normalises case and surrounding space', () => {
  assert.deepEqual(validateChannel(' EMAIL '), { ok: true, channel: 'email' });
  assert.deepEqual(validateChannel('Sms'), { ok: true, channel: 'sms' });
});

test('validateChannel rejects a channel the sender cannot honour', () => {
  // Previously any string was stored and only blew up in the background run,
  // where the customer never saw the reason.
  for (const bad of ['whatsapp', 'telegram', 'EMAIL;DROP', 42, {}]) {
    const result = validateChannel(bad);
    assert.equal(result.ok, false, `${JSON.stringify(bad)} must be rejected`);
    assert.match(result.error, /non supporté/);
  }
});

test('a channel validateChannel accepts is one assertChannelSendable understands', () => {
  // Guards the seam between the two: a channel accepted at creation must not
  // be one the sender then refuses at run time.
  const ready = { send_subdomain: '7.mail.witechagency.com', send_subdomain_status: 'verified', sending_paused_at: null };
  for (const channel of ['email', 'sms']) {
    const { channel: normalized } = validateChannel(channel);
    assert.doesNotThrow(() => assertChannelSendable(ready, normalized));
  }
});

// --- Important 7: campaign ownership on the two lead-queueing routes --------

function fakeDb(rows = []) {
  const queries = [];
  return {
    queries,
    async get(sql, ...params) {
      queries.push({ sql, params });
      const [id, userId] = params;
      return rows.find((r) => String(r.id) === String(id) && r.user_id === userId);
    }
  };
}

test('findOwnedCampaign returns the campaign when the caller owns it', async () => {
  const db = fakeDb([{ id: 5, user_id: 1, name: 'A' }]);
  const campaign = await findOwnedCampaign(db, 5, 1);
  assert.equal(campaign.name, 'A');
});

test('findOwnedCampaign refuses another tenant\'s campaign', async () => {
  // Tenant A could otherwise queue their own leads into tenant B's campaign:
  // B's SES identity then mails A's prospects, and the resulting complaints
  // count toward B's auto-pause.
  const db = fakeDb([{ id: 5, user_id: 2, name: 'B owns this' }]);
  assert.equal(await findOwnedCampaign(db, 5, 1), null);
});

test('findOwnedCampaign scopes the lookup by user_id in SQL, not after the fact', async () => {
  const db = fakeDb([{ id: 5, user_id: 1 }]);
  await findOwnedCampaign(db, 5, 1);
  assert.match(db.queries[0].sql, /FROM campaigns/i);
  assert.match(db.queries[0].sql, /user_id\s*=/i);
  assert.deepEqual(db.queries[0].params, [5, 1]);
});

test('findOwnedCampaign returns null for a missing campaign id without querying', async () => {
  const db = fakeDb([{ id: 5, user_id: 1 }]);
  for (const empty of [undefined, null, '']) {
    assert.equal(await findOwnedCampaign(db, empty, 1), null);
  }
  assert.equal(db.queries.length, 0);
});

// --- Important 1: the customer must be told why a campaign cannot start -----

test('loadCampaignForStart selects every column assertChannelSendable reads', async () => {
  // If this row stops carrying the user columns, assertChannelSendable would
  // silently see undefined and wave through a tenant who cannot send.
  const db = fakeDb([{ id: 5, user_id: 1 }]);
  await loadCampaignForStart(db, 5, 1);
  const { sql, params } = db.queries[0];
  for (const column of ['send_subdomain', 'send_subdomain_status', 'sending_paused_at']) {
    assert.match(sql, new RegExp(column), `the join must expose ${column}`);
  }
  assert.match(sql, /c\.user_id\s*=/i, 'and must still be scoped to the caller');
  assert.deepEqual(params, [5, 1]);
});

test('an unverified tenant starting a campaign gets the real French reason', () => {
  const campaign = {
    id: 5, user_id: 1, channel: 'email',
    send_subdomain: '7.mail.witechagency.com',
    send_subdomain_status: 'pending',
    sending_paused_at: null
  };
  assert.throws(
    () => assertChannelSendable(campaign, campaign.channel),
    /Votre domaine d'envoi n'est pas encore vérifié/
  );
});

test('a paused tenant starting a campaign gets the suspension reason', () => {
  const campaign = {
    id: 5, user_id: 1, channel: 'sms',
    send_subdomain: '7.mail.witechagency.com',
    send_subdomain_status: 'verified',
    sending_paused_at: '2026-08-01T00:00:00Z'
  };
  assert.throws(
    () => assertChannelSendable(campaign, campaign.channel),
    /Envoi suspendu pour ce compte/
  );
});
