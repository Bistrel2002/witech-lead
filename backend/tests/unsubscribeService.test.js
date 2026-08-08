import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import {
  normaliseEmail,
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  isSuppressed,
  recordUnsubscribe
} from '../src/services/unsubscribeService.js';

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

test('normaliseEmail trims and lowercases', () => {
  assert.equal(normaliseEmail('  Contact@Exemple.FR '), 'contact@exemple.fr');
  assert.equal(normaliseEmail(null), '');
  assert.equal(normaliseEmail(undefined), '');
});

test('a token round-trips back to its tenant and email', () => {
  const token = buildUnsubscribeToken(7, 'Contact@Exemple.FR');
  assert.deepEqual(verifyUnsubscribeToken(token), { userId: 7, email: 'contact@exemple.fr' });
});

test('a tampered payload is rejected', () => {
  const token = buildUnsubscribeToken(7, 'a@b.fr');
  const [, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 8, e: 'a@b.fr' })).toString('base64url');
  assert.equal(verifyUnsubscribeToken(`${forged}.${sig}`), null);
});

test('malformed tokens are rejected rather than throwing', () => {
  for (const bad of ['', 'nodot', 'a.b.c', '...', 'zzz.zzz', null, undefined]) {
    assert.equal(verifyUnsubscribeToken(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('the same tenant+email always yields the same token', () => {
  assert.equal(buildUnsubscribeToken(7, 'a@b.fr'), buildUnsubscribeToken(7, 'A@B.FR'));
});

test('different tenants get different tokens for the same email', () => {
  assert.notEqual(buildUnsubscribeToken(7, 'a@b.fr'), buildUnsubscribeToken(8, 'a@b.fr'));
});

test('buildUnsubscribeUrl uses the public API base', () => {
  const url = buildUnsubscribeUrl(7, 'a@b.fr');
  assert.ok(url.startsWith('https://api.witechagency.com/unsubscribe/'), url);
});

function fakeDb(rows = []) {
  const inserts = [];
  return {
    inserts,
    async get(sql, ...params) {
      if (!/FROM unsubscribes/i.test(sql)) throw new Error(`unexpected query: ${sql}`);
      const [email, userId] = params;
      const hit = rows.find((r) => r.email === email && (r.user_id === userId || r.user_id === null));
      return hit ? { id: 1 } : undefined;
    },
    async run(sql, ...params) {
      inserts.push({ sql, params });
      return { changes: 1 };
    }
  };
}

test('isSuppressed matches a row for this tenant', async () => {
  const db = fakeDb([{ user_id: 7, email: 'a@b.fr' }]);
  assert.equal(await isSuppressed(db, 7, 'A@B.fr'), true);
});

test('isSuppressed ignores another tenant row', async () => {
  const db = fakeDb([{ user_id: 9, email: 'a@b.fr' }]);
  assert.equal(await isSuppressed(db, 7, 'a@b.fr'), false);
});

test('isSuppressed matches a global row for every tenant', async () => {
  const db = fakeDb([{ user_id: null, email: 'a@b.fr' }]);
  assert.equal(await isSuppressed(db, 7, 'a@b.fr'), true);
  assert.equal(await isSuppressed(db, 99, 'a@b.fr'), true);
});

test('recordUnsubscribe normalises the email and passes the source', async () => {
  const db = fakeDb();
  await recordUnsubscribe(db, 7, ' A@B.FR ', 'manual');
  assert.equal(db.inserts.length, 1);
  assert.ok(db.inserts[0].params.includes('a@b.fr'));
  assert.ok(db.inserts[0].params.includes('manual'));
  assert.ok(db.inserts[0].params.includes(7));
});

test('recordUnsubscribe accepts a null tenant for a global suppression', async () => {
  const db = fakeDb();
  await recordUnsubscribe(db, null, 'a@b.fr', 'complaint');
  assert.ok(db.inserts[0].params.includes(null));
  assert.ok(db.inserts[0].params.includes('complaint'));
});
