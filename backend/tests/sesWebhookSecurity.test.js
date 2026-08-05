import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedSnsHost,
  isValidWebhookToken,
  pauseIfComplaintRateExceeded,
  handleSesEvent
} from '../src/routes/sesWebhookRoutes.js';

const TOKEN = 'correct-horse-battery-staple-token';

/**
 * Minimal in-memory fake of the DatabaseAdapter surface the webhook uses
 * (get/run), so these tests never touch a live database. Query text is
 * pattern-matched the same way the other test files in this suite fake out
 * AWS clients (see sendingDomainService.test.js's fakeSes).
 */
function fakeDb({ users = [], events = [] } = {}) {
  const calls = { get: [], run: [] };
  return {
    calls,
    events,
    async get(sql, ...params) {
      calls.get.push({ sql, params });
      if (/FROM users WHERE send_subdomain/.test(sql)) {
        const user = users.find((u) => u.send_subdomain === params[0]);
        return user ? { id: user.id } : undefined;
      }
      if (/FROM sending_events WHERE message_id/.test(sql)) {
        const row = events.find((e) => e.message_id === params[0]);
        return row ? { id: row.id } : undefined;
      }
      if (/COUNT\(\*\) FILTER/.test(sql)) {
        const userId = params[0];
        const rows = events.filter((e) => e.user_id === userId);
        return { complaints: rows.filter((e) => e.event_type === 'Complaint').length, total: rows.length };
      }
      throw new Error(`fakeDb.get: unhandled query: ${sql}`);
    },
    async run(sql, ...params) {
      calls.run.push({ sql, params });
      if (/INSERT INTO sending_events/.test(sql)) {
        const [user_id, event_type, recipient, sending_domain, message_id] = params;
        if (message_id && events.some((e) => e.message_id === message_id)) {
          const err = new Error('duplicate key value violates unique constraint "idx_sending_events_message_id"');
          err.code = '23505';
          throw err;
        }
        events.push({ id: events.length + 1, user_id, event_type, recipient, sending_domain, message_id });
        return { lastID: events.length, changes: 1 };
      }
      if (/UPDATE users SET sending_paused_at/.test(sql)) {
        const user = users.find((u) => u.id === params[0]);
        if (user) user.sending_paused_at = 'PAUSED';
        return { changes: user ? 1 : 0 };
      }
      if (/UPDATE campaigns SET status/.test(sql)) {
        return { changes: 0 };
      }
      throw new Error(`fakeDb.run: unhandled query: ${sql}`);
    }
  };
}

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; }
  };
}

function fakeHttpGet(calls) {
  return async (url) => { calls.push(url); return { status: 200 }; };
}

function unusableGetDb() {
  return async () => { throw new Error('getDb must not be called before the token check'); };
}

function bounceNotification({ messageId, domain = '7.mail.witechagency.com', recipient = 'x@y.fr' } = {}) {
  return JSON.stringify({
    Type: 'Notification',
    MessageId: messageId,
    Message: JSON.stringify({
      eventType: 'Bounce',
      mail: { source: `no-reply@${domain}` },
      bounce: { bouncedRecipients: [{ emailAddress: recipient }] }
    })
  });
}

// --- Critical 1: unauthenticated token gate ---------------------------------

test('rejects a request with no token: 403, and never touches the database', async () => {
  const req = { query: {}, body: bounceNotification({ messageId: 'm1' }) };
  const res = fakeRes();
  await handleSesEvent(req, res, { expectedToken: TOKEN, getDb: unusableGetDb() });
  assert.equal(res.statusCode, 403);
});

test('rejects a request with the wrong token: 403, and never touches the database', async () => {
  const req = { query: { token: 'not-the-token' }, body: bounceNotification({ messageId: 'm1' }) };
  const res = fakeRes();
  await handleSesEvent(req, res, { expectedToken: TOKEN, getDb: unusableGetDb() });
  assert.equal(res.statusCode, 403);
});

test('a correct token is accepted and processing proceeds', async () => {
  const db = fakeDb({ users: [{ id: 1, send_subdomain: '7.mail.witechagency.com' }] });
  const req = { query: { token: TOKEN }, body: bounceNotification({ messageId: 'm1' }) };
  const res = fakeRes();
  await handleSesEvent(req, res, { expectedToken: TOKEN, getDb: async () => db });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'recorded');
  assert.equal(db.events.length, 1);
});

test('isValidWebhookToken never throws on mismatched lengths and rejects them', () => {
  assert.equal(isValidWebhookToken('short', 'a-much-longer-expected-token'), false);
  assert.equal(isValidWebhookToken('', TOKEN), false);
  assert.equal(isValidWebhookToken(undefined, TOKEN), false);
  assert.equal(isValidWebhookToken(TOKEN, TOKEN), true);
});

// --- Critical 2: SSRF allowlist on SubscribeURL -----------------------------

test('isAllowedSnsHost accepts only https sns.<region>.amazonaws.com hosts', () => {
  assert.equal(isAllowedSnsHost('https://sns.eu-west-3.amazonaws.com/?Action=ConfirmSubscription'), true);
  assert.equal(isAllowedSnsHost('http://sns.eu-west-3.amazonaws.com/'), false); // not https
  assert.equal(isAllowedSnsHost('https://169.254.169.254/latest/meta-data/'), false); // metadata SSRF target
  assert.equal(isAllowedSnsHost('https://evil.com/sns.eu-west-3.amazonaws.com'), false); // path spoof
  assert.equal(isAllowedSnsHost('https://sns.eu-west-3.amazonaws.com.evil.com/'), false); // suffix spoof
  assert.equal(isAllowedSnsHost('not a url'), false);
});

test('a disallowed SubscribeURL is rejected without making the HTTP request', async () => {
  const calls = [];
  const req = {
    query: { token: TOKEN },
    body: JSON.stringify({ Type: 'SubscriptionConfirmation', SubscribeURL: 'http://169.254.169.254/latest/meta-data/' })
  };
  const res = fakeRes();
  await handleSesEvent(req, res, { expectedToken: TOKEN, httpGet: fakeHttpGet(calls), getDb: unusableGetDb() });
  assert.equal(calls.length, 0);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'subscribe url rejected');
});

test('a genuine SNS SubscribeURL is allowed and confirmed', async () => {
  const calls = [];
  const req = {
    query: { token: TOKEN },
    body: JSON.stringify({
      Type: 'SubscriptionConfirmation',
      SubscribeURL: 'https://sns.eu-west-3.amazonaws.com/?Action=ConfirmSubscription&Token=abc'
    })
  };
  const res = fakeRes();
  await handleSesEvent(req, res, { expectedToken: TOKEN, httpGet: fakeHttpGet(calls), getDb: unusableGetDb() });
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'https://sns.eu-west-3.amazonaws.com/?Action=ConfirmSubscription&Token=abc');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'subscription confirmed');
});

// --- Important 3: dedup on redelivered SNS notifications --------------------

test('a redelivered notification (same MessageId) is recorded once and counts stay put', async () => {
  const db = fakeDb({ users: [{ id: 1, send_subdomain: '7.mail.witechagency.com' }] });
  const getDbFn = async () => db;
  const notif = bounceNotification({ messageId: 'sns-msg-1' });

  const res1 = fakeRes();
  await handleSesEvent({ query: { token: TOKEN }, body: notif }, res1, { expectedToken: TOKEN, getDb: getDbFn });
  const res2 = fakeRes();
  await handleSesEvent({ query: { token: TOKEN }, body: notif }, res2, { expectedToken: TOKEN, getDb: getDbFn });

  assert.equal(res1.body, 'recorded');
  assert.equal(res2.body, 'duplicate');
  assert.equal(db.events.length, 1);
});

test('a duplicate that slips past the pre-check (unique index race) does not throw out of the handler', async () => {
  // Simulate two redeliveries whose pre-check both miss (a genuine race);
  // the second INSERT hits the unique index and must be swallowed as a
  // normal "error logged" 200, not an unhandled rejection.
  const db = fakeDb({ users: [{ id: 1, send_subdomain: '7.mail.witechagency.com' }], events: [
    { id: 1, user_id: 1, event_type: 'Bounce', recipient: 'x@y.fr', sending_domain: '7.mail.witechagency.com', message_id: 'race-1' }
  ] });
  // Force the pre-check to miss even though the row already exists, to
  // simulate the race window.
  db.get = async function (sql, ...params) {
    if (/FROM sending_events WHERE message_id/.test(sql)) return undefined;
    if (/FROM users WHERE send_subdomain/.test(sql)) return { id: 1 };
    if (/COUNT\(\*\) FILTER/.test(sql)) return { complaints: 0, total: 0 };
    throw new Error(`unhandled: ${sql}`);
  };
  const req = { query: { token: TOKEN }, body: bounceNotification({ messageId: 'race-1' }) };
  const res = fakeRes();
  await assert.doesNotReject(() => handleSesEvent(req, res, { expectedToken: TOKEN, getDb: async () => db }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'error logged');
});

// --- pauseIfComplaintRateExceeded: floor and boundary arithmetic ------------

test('does not pause below the sample floor, even at a 100% complaint rate', async () => {
  const events = Array.from({ length: 19 }, (_, i) => ({ user_id: 1, event_type: 'Complaint', message_id: `f${i}` }));
  const db = fakeDb({ users: [{ id: 1, sending_paused_at: null }], events });
  await pauseIfComplaintRateExceeded(db, 1);
  assert.equal(db.calls.run.length, 0);
});

test('pauses exactly at the 5% boundary once past the sample floor', async () => {
  // 20 total, 1 complaint => 1/20 = 0.05 === threshold, must pause (>= not >).
  const events = [
    { user_id: 1, event_type: 'Complaint' },
    ...Array.from({ length: 19 }, () => ({ user_id: 1, event_type: 'Bounce' }))
  ];
  const db = fakeDb({ users: [{ id: 1, sending_paused_at: null }], events });
  await pauseIfComplaintRateExceeded(db, 1);
  const paused = db.calls.run.some((c) => /UPDATE users SET sending_paused_at/.test(c.sql));
  assert.equal(paused, true);
});

test('does not pause just below the 5% boundary', async () => {
  // 21 total, 1 complaint => 1/21 ≈ 0.0476 < 0.05.
  const events = [
    { user_id: 1, event_type: 'Complaint' },
    ...Array.from({ length: 20 }, () => ({ user_id: 1, event_type: 'Bounce' }))
  ];
  const db = fakeDb({ users: [{ id: 1, sending_paused_at: null }], events });
  await pauseIfComplaintRateExceeded(db, 1);
  const paused = db.calls.run.some((c) => /UPDATE users SET sending_paused_at/.test(c.sql));
  assert.equal(paused, false);
});
