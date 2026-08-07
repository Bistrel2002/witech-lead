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

function fakeDb() {
  const inserts = [];
  return {
    inserts,
    async get() { return undefined; },
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
