import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import { buildUnsubscribeToken } from '../src/services/unsubscribeService.js';
import {
  renderConfirmPage,
  renderDonePage,
  renderErrorPage,
  handleUnsubscribeGet,
  handleUnsubscribePost
} from '../src/routes/unsubscribeRoutes.js';

const ENV = {
  AWS_REGION: 'eu-west-3',
  MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
  TWILIO_ACCOUNT_SID: 'AC',
  TWILIO_AUTH_TOKEN: 't',
  TWILIO_SENDER_ID: 'WITECH',
  SES_WEBHOOK_TOKEN: 'webhook-token',
  UNSUBSCRIBE_SECRET: 'unsub-secret-for-tests',
  PUBLIC_API_URL: 'https://api.witechagency.com'
};

test.beforeEach(() => {
  Object.assign(process.env, ENV);
  resetPlatformConfigCache();
});

function fakeRes() {
  return {
    statusCode: 200,
    body: '',
    headers: {},
    status(code) { this.statusCode = code; return this; },
    set(k, v) { this.headers[k] = v; return this; },
    send(payload) { this.body = payload; return this; }
  };
}

function fakeDb(tenant) {
  const inserts = [];
  const reads = [];
  return {
    inserts,
    reads,
    async get(sql, ...params) { reads.push({ sql, params }); return tenant; },
    async run(sql, ...params) { inserts.push({ sql, params }); return { changes: 1 }; }
  };
}

test('pages are French and escape the email', () => {
  const html = renderConfirmPage('a<script>@b.fr');
  assert.ok(html.includes('Se désinscrire'), 'should carry the French action label');
  assert.ok(!html.includes('<script>'), 'must not inject raw HTML from the email');
  assert.ok(renderDonePage('a@b.fr').includes('désinscrit'));
  assert.ok(renderErrorPage().includes('invalide'));
});

test('GET renders the confirmation page and writes nothing', async () => {
  const db = fakeDb();
  const res = fakeRes();
  await handleUnsubscribeGet({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('a@b.fr'));
  assert.equal(db.inserts.length, 0, 'GET must never mutate');
});

test('GET with an invalid token returns 400 and the error page', async () => {
  const db = fakeDb();
  const res = fakeRes();
  await handleUnsubscribeGet({ params: { token: 'garbage' } }, res, { db });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('invalide'));
  assert.equal(db.inserts.length, 0);
});

test('POST records the suppression for that tenant', async () => {
  const db = fakeDb();
  const res = fakeRes();
  await handleUnsubscribePost({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db });
  assert.equal(res.statusCode, 200);
  assert.equal(db.inserts.length, 1);
  assert.ok(db.inserts[0].params.includes(7));
  assert.ok(db.inserts[0].params.includes('a@b.fr'));
  assert.ok(db.inserts[0].params.includes('manual'));
});

test('POST is idempotent — replaying still succeeds', async () => {
  const db = fakeDb();
  const token = buildUnsubscribeToken(7, 'a@b.fr');
  const first = fakeRes();
  const second = fakeRes();
  await handleUnsubscribePost({ params: { token } }, first, { db });
  await handleUnsubscribePost({ params: { token } }, second, { db });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
});

test('POST with an invalid token returns 400 and writes nothing', async () => {
  const db = fakeDb();
  const res = fakeRes();
  await handleUnsubscribePost({ params: { token: 'garbage' } }, res, { db });
  assert.equal(res.statusCode, 400);
  assert.equal(db.inserts.length, 0);
});

test('a database failure yields 500, not an unhandled rejection', async () => {
  const db = { async get() { return undefined; }, async run() { throw new Error('db down'); } };
  const res = fakeRes();
  await assert.doesNotReject(() =>
    handleUnsubscribePost({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db })
  );
  assert.equal(res.statusCode, 500);
});

// --- Important 1: the page must name the sender ----------------------------
//
// Voluntary suppression is deliberately per-tenant. A prospect scraped from
// Google Maps commonly sits in several tenants' lead tables and receives mail
// from three different customers, and every opt-out page is byte-identical on
// the same host. Saying only "de cet expéditeur" means they confirm once,
// believe they are done, and keep receiving mail — the exact reading a CNIL
// complaint would attack.

test('GET names the sending tenant, preferring the company name', async () => {
  const db = fakeDb({ company_name: 'Agence Alice', name: 'Alice Martin' });
  const res = fakeRes();
  await handleUnsubscribeGet({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('Agence Alice'), 'the page must name the sender');
  assert.ok(!res.body.includes('Alice Martin'), 'company_name wins over name');
});

test('GET falls back to the tenant personal name when there is no company name', async () => {
  const db = fakeDb({ company_name: null, name: 'Alice Martin' });
  const res = fakeRes();
  await handleUnsubscribeGet({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db });
  assert.ok(res.body.includes('Alice Martin'));
});

test('GET resolves the tenant from the token, scoped by id', async () => {
  const db = fakeDb({ company_name: 'Agence Alice', name: null });
  const res = fakeRes();
  await handleUnsubscribeGet({ params: { token: buildUnsubscribeToken(42, 'a@b.fr') } }, res, { db });
  assert.equal(db.reads.length, 1);
  assert.match(db.reads[0].sql, /FROM users/i);
  assert.deepEqual(db.reads[0].params, [42]);
});

test('GET escapes the sender name it renders', async () => {
  const db = fakeDb({ company_name: '<script>alert(1)</script>', name: null });
  const res = fakeRes();
  await handleUnsubscribeGet({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db });
  assert.ok(!res.body.includes('<script>'), 'a tenant-controlled name must not inject HTML');
});

test('GET on a deleted tenant still renders, with generic wording', async () => {
  const db = fakeDb(undefined);
  const res = fakeRes();
  await handleUnsubscribeGet({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db });
  assert.equal(res.statusCode, 200, 'a missing tenant must not 500 a public page');
  assert.ok(res.body.includes('cet expéditeur'));
  assert.ok(res.body.includes('a@b.fr'));
});

test('GET survives the tenant lookup failing outright', async () => {
  const db = { async get() { throw new Error('db down'); }, async run() {} };
  const res = fakeRes();
  await assert.doesNotReject(() =>
    handleUnsubscribeGet({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db })
  );
  assert.equal(res.statusCode, 200, 'the recipient must still be able to opt out');
  assert.ok(res.body.includes('cet expéditeur'));
});

test('GET reads but still never writes', async () => {
  const db = fakeDb({ company_name: 'Agence Alice', name: null });
  const res = fakeRes();
  await handleUnsubscribeGet({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db });
  assert.equal(db.inserts.length, 0, 'GET must never mutate — corporate scanners follow links');
  assert.ok(db.reads.every((r) => /^\s*SELECT/i.test(r.sql)), 'GET may only SELECT');
});

test('POST names the sender on the confirmation page too', async () => {
  const db = fakeDb({ company_name: 'Agence Alice', name: null });
  const res = fakeRes();
  await handleUnsubscribePost({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('Agence Alice'));
});

// --- Minor 5: no throw may escape a public unauthenticated handler ---------

test('a throw from token verification cannot escape either handler', async () => {
  // verifyUnsubscribeToken reaches getPlatformConfig to sign, which throws
  // outright when the platform config is incomplete. On a public route with
  // no .catch, that becomes an unhandled rejection and Node 20 exits the
  // process — a config typo would take the whole API down from the outside.
  //
  // The token has to be structurally valid ("<payload>.<signature>") to get
  // that far: a token with no separator is rejected before the config is ever
  // touched, which is the 400 case asserted separately below.
  delete process.env.UNSUBSCRIBE_SECRET;
  resetPlatformConfigCache();

  const db = fakeDb();
  const getRes = fakeRes();
  const postRes = fakeRes();
  const req = { params: { token: 'cGF5bG9hZA.c2lnbmF0dXJl' } };

  await assert.doesNotReject(() => handleUnsubscribeGet(req, getRes, { db }));
  await assert.doesNotReject(() => handleUnsubscribePost(req, postRes, { db }));
  assert.equal(getRes.statusCode, 500, 'an internal failure is a 500, not a 400');
  assert.equal(postRes.statusCode, 500, 'an internal failure is a 500, not a 400');
  assert.equal(db.inserts.length, 0, 'and nothing may be recorded on that path');
});

test('a malformed token is still a 400, never a 500', async () => {
  // The distinction matters: 400 tells the recipient their link is broken and
  // to copy it again, 500 tells them to come back later. Collapsing an
  // unverifiable token into "server error" would send them away for good.
  const db = fakeDb();
  for (const token of ['garbage', '', 'a.b.c', 'onlypayload.']) {
    const res = fakeRes();
    await handleUnsubscribeGet({ params: { token } }, res, { db });
    assert.equal(res.statusCode, 400, `${JSON.stringify(token)} must read as a bad link`);
    assert.ok(res.body.includes('invalide'));
  }
  assert.equal(db.inserts.length, 0);
});
