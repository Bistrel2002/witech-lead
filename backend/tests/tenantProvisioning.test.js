import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import { ensureTenantSendingDomain, refreshTenantSendingStatus } from '../src/services/tenantProvisioning.js';

test.beforeEach(() => {
  Object.assign(process.env, {
    AWS_REGION: 'eu-west-3',
    MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
    ROUTE53_HOSTED_ZONE_ID: 'Z1',
    TWILIO_ACCOUNT_SID: 'AC',
    TWILIO_AUTH_TOKEN: 't',
    TWILIO_SENDER_ID: 'WITECH'
  });
  resetPlatformConfigCache();
});

function fakeDb({ subdomain = '9.mail.witechagency.com' } = {}) {
  const calls = [];
  return {
    calls,
    async run(sql, ...params) { calls.push({ sql, params }); return { changes: 1 }; },
    async get() { return { send_subdomain: subdomain }; }
  };
}

test('stores the subdomain and pending status on success', async () => {
  const db = fakeDb();
  await ensureTenantSendingDomain(9, db, {
    provision: async () => ({ subdomain: '9.mail.witechagency.com', dkimTokens: ['a'], recordsWritten: 3 })
  });
  const update = db.calls.find((c) => /UPDATE users/.test(c.sql));
  assert.ok(update, 'should update the user row');
  assert.ok(update.params.includes('9.mail.witechagency.com'));
  assert.ok(update.params.includes('pending'));
});

test('marks failed and does not throw when AWS errors', async () => {
  const db = fakeDb();
  await assert.doesNotReject(() => ensureTenantSendingDomain(9, db, {
    provision: async () => { throw new Error('AWS down'); }
  }));
  const update = db.calls.find((c) => /UPDATE users/.test(c.sql));
  assert.ok(update.params.includes('failed'));
});

test('refresh persists the verified status', async () => {
  const db = fakeDb();
  const status = await refreshTenantSendingStatus(9, db, { check: async () => 'verified' });
  assert.equal(status, 'verified');
  const update = db.calls.find((c) => /UPDATE users/.test(c.sql));
  assert.ok(update.params.includes('verified'));
});

test('refresh returns pending when the user has no subdomain yet', async () => {
  const db = fakeDb({ subdomain: null });
  const status = await refreshTenantSendingStatus(9, db, { check: async () => 'verified' });
  assert.equal(status, 'pending');
  assert.equal(db.calls.length, 0, 'must not write a status it never checked');
});
