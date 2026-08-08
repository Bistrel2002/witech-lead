import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import {
  validateChannel,
  findOwnedCampaign,
  loadCampaignForStart,
  handleUnsubscribeLinkPreview
} from '../src/routes.js';
import { assertChannelSendable } from '../src/services/emailService.js';
import { verifyUnsubscribeToken } from '../src/services/unsubscribeService.js';

test.beforeEach(() => {
  Object.assign(process.env, {
    AWS_REGION: 'eu-west-3',
    MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
    TWILIO_ACCOUNT_SID: 'AC',
    TWILIO_AUTH_TOKEN: 't',
    TWILIO_SENDER_ID: 'WITECH',
    SES_WEBHOOK_TOKEN: 'tok',
    UNSUBSCRIBE_SECRET: 'unsub-secret-for-tests',
    PUBLIC_API_URL: 'https://api.witechagency.com'
  });
  resetPlatformConfigCache();
});

// --- Minor 11: reject an unusable channel at creation, not at send time -----

test('validateChannel accepts the one channel that can actually be delivered', () => {
  assert.deepEqual(validateChannel('email'), { ok: true, channel: 'email' });
});

test('validateChannel defaults to email when the channel is omitted', () => {
  assert.deepEqual(validateChannel(undefined), { ok: true, channel: 'email' });
  assert.deepEqual(validateChannel(null), { ok: true, channel: 'email' });
  assert.deepEqual(validateChannel(''), { ok: true, channel: 'email' });
});

test('validateChannel normalises case and surrounding space', () => {
  assert.deepEqual(validateChannel(' EMAIL '), { ok: true, channel: 'email' });
});

// --- Critical 1: SMS is disabled in-product until STOP handling exists ------

test('campaign creation refuses channel sms', () => {
  // The UI greys SMS out, but the UI is not a security control: a direct API
  // call must not be able to create an SMS campaign. Without STOP handling,
  // an SMS campaign is unsolicited French B2B marketing with no opt-out of
  // any kind and no route into the suppression table.
  const result = validateChannel('sms');
  assert.equal(result.ok, false);
  assert.match(result.error, /SMS/);
  assert.match(result.error, /pas encore disponible/i);
});

test('campaign creation refuses sms whatever its casing or padding', () => {
  for (const spelling of [' SMS ', 'Sms', 'sMs']) {
    const result = validateChannel(spelling);
    assert.equal(result.ok, false, `${spelling} must be refused`);
    assert.match(result.error, /pas encore disponible/i);
  }
});

test('the refusal for sms and the refusal for a bogus channel are not the same message', () => {
  // A customer who picks an unavailable-but-planned channel needs to be told
  // it is coming, not that they sent garbage.
  assert.notEqual(validateChannel('sms').error, validateChannel('telegram').error);
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
  // be one the sender then refuses at run time — and, now, the reverse: a
  // channel the sender refuses must not be creatable.
  const ready = { send_subdomain: '7.mail.witechagency.com', send_subdomain_status: 'verified', sending_paused_at: null };
  for (const channel of ['email']) {
    const { channel: normalized } = validateChannel(channel);
    assert.doesNotThrow(() => assertChannelSendable(ready, normalized));
  }
  assert.equal(validateChannel('sms').ok, false);
  assert.throws(() => assertChannelSendable(ready, 'sms'));
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

// --- Important 3: the preview's manual send path needs a real opt-out link --
//
// The frontend cannot mint an unsubscribe token: the HMAC secret is
// server-side and must stay there. The "Ouvrir Gmail" / mailto path is a real
// send to a real prospect, so the preview asks the backend for a real link.

function previewRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}

function leadsDb(rows = []) {
  const queries = [];
  return {
    queries,
    async get(sql, ...params) {
      queries.push({ sql, params });
      const [userId, email] = params;
      return rows.find(
        (r) => r.user_id === userId && r.email.toLowerCase() === String(email).toLowerCase()
      );
    }
  };
}

test('the preview link is minted for the authenticated tenant', async () => {
  const db = leadsDb([{ id: 3, user_id: 7, email: 'prospect@exemple.fr' }]);
  const res = previewRes();
  await handleUnsubscribeLinkPreview(
    { user: { id: 7 }, query: { email: 'prospect@exemple.fr' } }, res, { db }
  );

  assert.equal(res.statusCode, 200);
  const token = res.payload.url.split('/unsubscribe/')[1];
  assert.deepEqual(verifyUnsubscribeToken(token), { userId: 7, email: 'prospect@exemple.fr' });
});

test('the preview link cannot be minted for another tenant', async () => {
  // The tenant id comes from the session, never from the request body: a
  // client-supplied user_id must not be able to forge a link that would
  // unsubscribe an address from someone else's list.
  const db = leadsDb([{ id: 3, user_id: 7, email: 'prospect@exemple.fr' }]);
  const res = previewRes();
  await handleUnsubscribeLinkPreview(
    { user: { id: 7 }, query: { email: 'prospect@exemple.fr', user_id: 9 } }, res, { db }
  );

  const token = res.payload.url.split('/unsubscribe/')[1];
  assert.equal(verifyUnsubscribeToken(token).userId, 7);
});

test('the preview link is refused for an address that is not the caller\'s lead', async () => {
  const db = leadsDb([{ id: 3, user_id: 7, email: 'prospect@exemple.fr' }]);
  const res = previewRes();
  await handleUnsubscribeLinkPreview(
    { user: { id: 7 }, query: { email: 'someone@ailleurs.fr' } }, res, { db }
  );
  assert.equal(res.statusCode, 404);
  assert.ok(res.payload.error);
});

test('the preview link requires an email', async () => {
  const db = leadsDb([]);
  const res = previewRes();
  await handleUnsubscribeLinkPreview({ user: { id: 7 }, query: {} }, res, { db });
  assert.equal(res.statusCode, 400);
  assert.equal(db.queries.length, 0);
});

test('the preview link matches the address case-insensitively', async () => {
  // Leads are scraped, so their stored casing is whatever the website used;
  // the token normalises anyway, and a case mismatch must not read as "not
  // your lead".
  const db = leadsDb([{ id: 3, user_id: 7, email: 'Prospect@Exemple.FR' }]);
  const res = previewRes();
  await handleUnsubscribeLinkPreview(
    { user: { id: 7 }, query: { email: 'prospect@exemple.fr' } }, res, { db }
  );
  assert.equal(res.statusCode, 200);
});

test('a failure minting the preview link does not escape as a rejection', async () => {
  const db = { async get() { throw new Error('db down'); } };
  const res = previewRes();
  await assert.doesNotReject(() =>
    handleUnsubscribeLinkPreview(
      { user: { id: 7 }, query: { email: 'prospect@exemple.fr' } }, res, { db }
    )
  );
  assert.equal(res.statusCode, 500);
});
