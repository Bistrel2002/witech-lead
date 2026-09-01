import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import { runCampaignBackground } from '../src/services/emailService.js';

/**
 * End-to-end coverage of runCampaignBackground's send loop.
 *
 * The compliance backstop lives inside this function: the suppression check,
 * the Skipped bookkeeping, and the unsubscribe URL that every outgoing email
 * must carry. None of it was exercised — a refactor moving the suppression
 * check three lines down would ship green and surface first as an AWS
 * complaint. These tests drive the real loop with an injected fake database
 * and a fake SES client, so no AWS credentials are involved.
 */

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

const CAMPAIGN = {
  id: 1,
  user_id: 7,
  channel: 'email',
  status: 'Active',
  subject: 'Bonjour {{company_name}}',
  body: 'Bonjour {{company_name}}, une idée pour vous.\n{{sender_signature}}',
  user_name: 'Alice Martin',
  user_email: 'alice@agence-alice.fr',
  user_phone: null,
  user_signature: 'Bien à vous,\nAlice',
  send_subdomain: '7.mail.witechagency.com',
  send_subdomain_status: 'verified',
  sending_paused_at: null
};

/**
 * Fake db that answers the handful of statements the loop issues and records
 * every call in order, so tests can assert on sequencing and not just on the
 * final state.
 */
function fakeDb({ campaign = CAMPAIGN, prospects = [], suppressed = [], leadStatuses = {} } = {}) {
  const calls = [];
  const suppressedSet = new Set(suppressed.map((e) => e.toLowerCase()));
  let campaignStatus = campaign.status ?? 'Active';
  // Lead rows the loop reads back before deciding whether it may advance them.
  const leads = new Map(prospects.map((p) => [p.id, leadStatuses[p.id] ?? 'New']));

  return {
    calls,
    get campaignStatus() { return campaignStatus; },
    async get(sql, ...params) {
      calls.push({ kind: 'get', sql, params });
      if (/FROM campaigns c/i.test(sql)) return { ...campaign, status: campaignStatus };
      if (/SELECT status FROM campaigns/i.test(sql)) return { status: campaignStatus };
      if (/FROM unsubscribes/i.test(sql)) {
        return suppressedSet.has(String(params[0]).toLowerCase()) ? { id: 99 } : undefined;
      }
      if (/SELECT status FROM leads/i.test(sql)) {
        const status = leads.get(params[0]);
        return status === undefined ? undefined : { status };
      }
      return undefined;
    },
    async all(sql, ...params) {
      calls.push({ kind: 'all', sql, params });
      if (/FROM campaign_logs/i.test(sql)) return prospects;
      return [];
    },
    async run(sql, ...params) {
      calls.push({ kind: 'run', sql, params });
      const status = /UPDATE campaigns SET status = '(\w+)'/i.exec(sql);
      if (status) campaignStatus = status[1];
      if (/UPDATE leads SET status/i.test(sql)) leads.set(params[1], params[0]);
      return { changes: 1 };
    }
  };
}

function fakeSes() {
  const sent = [];
  return {
    sent,
    async send(command) { sent.push(command.input); return { MessageId: 'm-1' }; }
  };
}

/* Mirrors "SELECT l.*, cl.id AS log_id" exactly. It deliberately carries no
 * lead_id: the real query has no such column, and a fixture that invented one
 * is what let `UPDATE leads ... WHERE id = prospect.lead_id` pass every test
 * while matching zero rows in production. */
const prospect = (n, over = {}) => ({
  id: n, log_id: 100 + n,
  name: `Prospect ${n}`, email: `p${n}@exemple.fr`,
  phone: '0102030405', website: null, city: 'Nantes',
  ...over
});

/** Runs the loop with the delay stubbed out, and returns the fakes. */
async function runCampaign(options) {
  const db = fakeDb(options);
  db.leadStatusAfter = (id) => {
    const updates = db.calls.filter(
      (c) => c.kind === 'run' && /UPDATE leads SET status/i.test(c.sql) && c.params[1] === id
    );
    return updates.length ? updates[updates.length - 1].params[0] : null;
  };
  const ses = fakeSes();
  await runCampaignBackground(1, { db, sesClient: ses, sleep: async () => {} });
  return { db, ses };
}

const runsOn = (db, pattern) => db.calls.filter((c) => c.kind === 'run' && pattern.test(c.sql));
const lastCampaignUpdate = (db, column) => {
  const matching = runsOn(db, new RegExp(`UPDATE campaigns SET[^W]*${column}`, 'i'));
  return matching.length ? matching[matching.length - 1] : null;
};

// --- Important 2: a skipped recipient must not vanish from the counters -----

test('a suppressed prospect is counted in skipped_count', async () => {
  // total_leads counts every prospect, so a suppressed one that increments
  // nothing at all leaves the campaign reading "7 / 10 cibles — 70%" for ever,
  // and the customer concludes the platform silently dropped three emails.
  const { db } = await runCampaign({
    prospects: [prospect(1), prospect(2), prospect(3)],
    suppressed: ['p2@exemple.fr']
  });

  const update = lastCampaignUpdate(db, 'skipped_count');
  assert.ok(update, 'the skip path must write skipped_count');
  assert.equal(update.params[0], 1);
  assert.equal(update.params[1], 1, 'scoped to this campaign');
});

test('skipped prospects inflate neither sent_count nor failed_count', async () => {
  const { db, ses } = await runCampaign({
    prospects: [prospect(1), prospect(2), prospect(3)],
    suppressed: ['p2@exemple.fr']
  });

  assert.equal(ses.sent.length, 2, 'the suppressed prospect must not be mailed');
  const metrics = runsOn(db, /SET sent_count = \?, failed_count = \?/i);
  const last = metrics[metrics.length - 1];
  assert.deepEqual(last.params.slice(0, 2), [2, 0]);
});

test('every suppressed prospect is counted, not just the first', async () => {
  const { db } = await runCampaign({
    prospects: [prospect(1), prospect(2), prospect(3), prospect(4)],
    suppressed: ['p1@exemple.fr', 'p3@exemple.fr', 'p4@exemple.fr']
  });
  assert.equal(lastCampaignUpdate(db, 'skipped_count').params[0], 3);
});

test('the Skipped log row carries a timestamp', async () => {
  // Without sent_at the row shows "En attente" in the time column next to an
  // "Ignoré" badge on the same line — two contradictory statements about the
  // same prospect.
  const { db } = await runCampaign({
    prospects: [prospect(1)],
    suppressed: ['p1@exemple.fr']
  });

  const skip = runsOn(db, /status = 'Skipped'/)[0];
  assert.ok(skip, 'the suppressed prospect must be logged Skipped');
  assert.match(skip.sql, /sent_at\s*=\s*CURRENT_TIMESTAMP/i);
});

test('a campaign with nothing suppressed never touches skipped_count', async () => {
  const { db } = await runCampaign({ prospects: [prospect(1), prospect(2)] });
  assert.equal(lastCampaignUpdate(db, 'skipped_count'), null);
});

// --- Important 4: the compliance backstop, asserted rather than read -------

test('the suppression check runs before the send, not after', async () => {
  // Ordering is the whole point. A refactor moving this check below the send
  // would still record Skipped and still look correct in the counters, while
  // mailing every address that had opted out.
  const { db } = await runCampaign({ prospects: [prospect(1)] });

  const checkIndex = db.calls.findIndex((c) => /FROM unsubscribes/i.test(c.sql));
  // Anchored on the write that marks a send, not on any statement mentioning
  // 'Sent': the re-contact policy reads campaign_logs WHERE status = 'Sent'
  // earlier in the loop, and a looser pattern matches that instead.
  const sendMarkerIndex = db.calls.findIndex(
    (c) => /UPDATE campaign_logs SET status = 'Sent'/i.test(c.sql)
  );
  assert.ok(checkIndex >= 0, 'the suppression check must actually run');
  assert.ok(sendMarkerIndex >= 0);
  assert.ok(checkIndex < sendMarkerIndex, 'suppression must be checked before sending');
});

test('a suppressed prospect reaches no SES call at all', async () => {
  const { ses } = await runCampaign({
    prospects: [prospect(1)],
    suppressed: ['p1@exemple.fr']
  });
  assert.equal(ses.sent.length, 0);
});

test('the suppression check is scoped to the sending tenant and the recipient', async () => {
  const { db } = await runCampaign({ prospects: [prospect(1)] });
  const check = db.calls.find((c) => /FROM unsubscribes/i.test(c.sql));
  assert.deepEqual(check.params, ['p1@exemple.fr', 7]);
});

test('the Skipped write targets the right log row, with the right status', async () => {
  const { db } = await runCampaign({
    prospects: [prospect(1), prospect(2)],
    suppressed: ['p2@exemple.fr']
  });

  const skips = runsOn(db, /status = 'Skipped'/);
  assert.equal(skips.length, 1, 'exactly one row is skipped');
  assert.equal(skips[0].params[skips[0].params.length - 1], 102, 'prospect 2\'s log row');
  assert.match(skips[0].sql, /UPDATE campaign_logs/i);
  assert.doesNotMatch(skips[0].sql, /'Failed'/, 'an honoured opt-out is not a failure');
});

test('every email carries a real unsubscribe URL in both List-Unsubscribe headers', async () => {
  const { ses } = await runCampaign({ prospects: [prospect(1), prospect(2), prospect(3)] });

  assert.equal(ses.sent.length, 3);
  for (const input of ses.sent) {
    const headers = Object.fromEntries(
      (input.Content.Simple.Headers || []).map((h) => [h.Name, h.Value])
    );
    assert.match(
      headers['List-Unsubscribe'] || '',
      /^<https:\/\/api\.witechagency\.com\/unsubscribe\/.+>$/,
      'every iteration must build a non-null unsubscribe URL'
    );
    assert.equal(headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  }
});

test('each recipient gets their own unsubscribe token, not a shared one', async () => {
  const { ses } = await runCampaign({ prospects: [prospect(1), prospect(2)] });
  const links = ses.sent.map(
    (i) => i.Content.Simple.Headers.find((h) => h.Name === 'List-Unsubscribe').Value
  );
  assert.notEqual(links[0], links[1]);
});

test('the body reaching SES is the one appendUnsubscribeNotice produced', async () => {
  // The auto-appended notice is the guarantee that no tenant can send a
  // non-compliant email even by writing a template from scratch. It is only
  // worth anything if it survives all the way into the SES payload.
  const { ses } = await runCampaign({ prospects: [prospect(1)] });

  const input = ses.sent[0];
  const body = input.Content.Simple.Body.Text.Data;
  const link = input.Content.Simple.Headers
    .find((h) => h.Name === 'List-Unsubscribe').Value.slice(1, -1);

  assert.ok(body.includes(link), 'the visible link must match the header link');
  assert.match(body, /désinscrire/i, 'and be introduced in French');
  assert.ok(body.startsWith('Bonjour Prospect 1'), 'the tenant template still leads');
});

test('the compiled body never names the platform operator', async () => {
  const { ses } = await runCampaign({
    prospects: [prospect(1)],
    campaign: { ...CAMPAIGN, user_signature: null, user_name: null }
  });
  const body = ses.sent[0].Content.Simple.Body.Text.Data;
  assert.doesNotMatch(body, /Wi'Tech/i);
});


// --- Feature 1: a campaign run must move its prospects, and say why ---------

test('a delivered email moves the prospect to Contacted', async () => {
  // This is the regression that mattered: the update targeted
  // prospect.lead_id, a column "SELECT l.*, cl.id AS log_id" does not
  // produce, so it matched nothing. 89 delivered emails had left their
  // prospect on "New".
  const { db } = await runCampaign({ prospects: [prospect(1)] });
  assert.equal(db.leadStatusAfter(1), 'Contacted');
});

test('a delivered email is written to the prospect history as an Email', async () => {
  const { db } = await runCampaign({ prospects: [prospect(1)] });
  const entries = db.calls.filter(
    (c) => c.kind === 'run' && /INSERT INTO lead_discussions/i.test(c.sql)
  );
  assert.equal(entries.length, 1);
  const [leadId, type, content] = entries[0].params;
  assert.equal(leadId, 1);
  assert.equal(type, 'Email');
  assert.match(content, /Campagne/);
  assert.match(content, /p1@exemple\.fr/);
});

test('no email but a phone number routes the prospect to Call Only', async () => {
  const { db } = await runCampaign({
    prospects: [prospect(1, { email: null, phone: '0102030405' })]
  });
  assert.equal(db.leadStatusAfter(1), 'Call Only');
});

test('neither email nor phone closes the prospect as lost', async () => {
  const { db } = await runCampaign({
    prospects: [prospect(1, { email: null, phone: null })]
  });
  assert.equal(db.leadStatusAfter(1), 'Closed Lost');
});

test('a campaign never drags a prospect back from a later stage', async () => {
  // Re-running a campaign over a list that already contains a booked meeting
  // must not reset that prospect to Contacted: the salesperson's own progress
  // outranks anything the send loop knows.
  const { db } = await runCampaign({
    prospects: [prospect(1)],
    leadStatuses: { 1: 'Meeting Scheduled' }
  });
  assert.equal(db.leadStatusAfter(1), null);
});

test('a suppressed prospect keeps its status untouched', async () => {
  // An opt-out says nothing about whether the prospect is workable, so the
  // run must leave the column it sits in alone.
  const { db } = await runCampaign({
    prospects: [prospect(1)],
    suppressed: ['p1@exemple.fr']
  });
  assert.equal(db.leadStatusAfter(1), null);
});

test('history failures never abort the run', async () => {
  const db = fakeDb({ prospects: [prospect(1), prospect(2)] });
  const realRun = db.run.bind(db);
  db.run = async (sql, ...params) => {
    if (/INSERT INTO lead_discussions/i.test(sql)) throw new Error('journal indisponible');
    return realRun(sql, ...params);
  };
  const ses = fakeSes();
  await runCampaignBackground(1, { db, sesClient: ses, sleep: async () => {} });
  // Both emails still went out despite every journal write throwing.
  assert.equal(ses.sent.length, 2);
});
