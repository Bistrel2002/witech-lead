import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import {
  ensureTenantSendingDomain,
  refreshTenantSendingStatus,
  resetTenantSendingCaches,
  STATUS_CACHE_TTL_MS,
  PROVISION_RETRY_COOLDOWN_MS
} from '../src/services/tenantProvisioning.js';

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
  resetTenantSendingCaches();
});

/**
 * Models the two columns that matter and applies the writes, so a test can
 * assert that the API's answer and the stored row actually agree — the whole
 * point of the dead-end this fixes.
 */
function fakeDb({ subdomain = '9.mail.witechagency.com', status = 'pending' } = {}) {
  const calls = [];
  const row = { send_subdomain: subdomain, send_subdomain_status: status };
  return {
    calls,
    row,
    async run(sql, ...params) {
      calls.push({ sql, params });
      if (/UPDATE users SET send_subdomain = /.test(sql)) {
        [row.send_subdomain, row.send_subdomain_status] = params;
      } else if (/UPDATE users SET send_subdomain_status = /.test(sql)) {
        [row.send_subdomain_status] = params;
      }
      return { changes: 1 };
    },
    async get() { return { ...row }; }
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
  assert.equal(db.row.send_subdomain_status, 'verified');
});

test('never rejects even when persisting the failure status also fails', async () => {
  // Simulates a transient DB error (pool exhaustion, connection drop, statement
  // timeout, ...) hitting the write that records the 'failed' status itself.
  // All four call sites (signup, Google mock-callback, Google callback, Apple
  // mock-callback) invoke this fire-and-forget with no await/.catch(), so if
  // this rejects it becomes an unhandledRejection and can crash the whole
  // server for every tenant.
  const db = {
    async run() { throw new Error('connection terminated unexpectedly'); },
    async get() { return { send_subdomain: null }; }
  };
  await assert.doesNotReject(() => ensureTenantSendingDomain(9, db, {
    provision: async () => { throw new Error('AWS down'); }
  }));
});

// --- Critical 1: a tenant whose signup provisioning failed must recover -----
//
// Before this, a tenant left with send_subdomain NULL was bricked for good:
// nothing anywhere re-provisioned, refreshTenantSendingStatus returned early
// with a bare 'pending' it never persisted, so GET /api/sending-status
// reported "préparation en cours" forever while the row said 'failed' and
// every campaign failed silently.

test('re-provisions when the tenant has no subdomain at all', async () => {
  const db = fakeDb({ subdomain: null, status: 'failed' });
  let provisioned = 0;

  const status = await refreshTenantSendingStatus(9, db, {
    provision: async () => { provisioned++; return { subdomain: '9.mail.witechagency.com' }; },
    check: async () => 'pending'
  });

  assert.equal(provisioned, 1, 'the dead end must be retried, not reported as pending forever');
  assert.equal(db.row.send_subdomain, '9.mail.witechagency.com');
  assert.equal(status, 'pending');
  assert.equal(db.row.send_subdomain_status, 'pending');
});

test('re-provisions when the stored status is failed even though a subdomain exists', async () => {
  // SES reported DKIM FAILED. Re-running provisioning is idempotent: the
  // identity create tolerates AlreadyExists and the Route53 change is an
  // UPSERT, so this repairs half-written DNS.
  const db = fakeDb({ subdomain: '9.mail.witechagency.com', status: 'failed' });
  let provisioned = 0;

  const status = await refreshTenantSendingStatus(9, db, {
    provision: async () => { provisioned++; return { subdomain: '9.mail.witechagency.com' }; },
    check: async () => 'verified'
  });

  assert.equal(provisioned, 1);
  assert.equal(status, 'verified');
  assert.equal(db.row.send_subdomain_status, 'verified');
});

test('a failed re-provision is persisted, so the API and the row agree', async () => {
  // The original bug was precisely this disagreement: the API said 'pending'
  // (never written) while the row said 'failed', so the UI showed a spinner
  // for a tenant that was never going to send.
  const db = fakeDb({ subdomain: null, status: 'failed' });

  const status = await refreshTenantSendingStatus(9, db, {
    provision: async () => { throw new Error('ROUTE53_HOSTED_ZONE_ID missing'); },
    check: async () => { throw new Error('check must not run without a subdomain'); }
  });

  assert.equal(status, 'failed', 'the customer must be told the truth');
  assert.equal(db.row.send_subdomain_status, 'failed');
});

test('a verified tenant is never re-provisioned', async () => {
  const db = fakeDb({ subdomain: '9.mail.witechagency.com', status: 'verified' });
  let provisioned = 0;

  const status = await refreshTenantSendingStatus(9, db, {
    provision: async () => { provisioned++; return { subdomain: 'x' }; },
    check: async () => 'verified'
  });

  assert.equal(provisioned, 0);
  assert.equal(status, 'verified');
});

// --- Critical 1 guard + Minor 5: neither AWS call may be driven by poll rate -

test('a repeat call inside the cache TTL does not hit SES again', async () => {
  // GET /api/sending-status ran a live GetEmailIdentity per request for every
  // non-verified tenant. SESv2 identity operations share a low account-wide
  // quota, so one polling browser tab could throttle provisioning for
  // everybody.
  const db = fakeDb({ subdomain: '9.mail.witechagency.com', status: 'pending' });
  let checks = 0;
  let clock = 1_000_000;
  const deps = { check: async () => { checks++; return 'pending'; }, now: () => clock };

  await refreshTenantSendingStatus(9, db, deps);
  await refreshTenantSendingStatus(9, db, deps);
  clock += STATUS_CACHE_TTL_MS - 1;
  await refreshTenantSendingStatus(9, db, deps);

  assert.equal(checks, 1, 'three polls inside the TTL must cost one SES call');
});

test('the status is re-checked once the cache TTL has elapsed', async () => {
  const db = fakeDb({ subdomain: '9.mail.witechagency.com', status: 'pending' });
  let checks = 0;
  let clock = 1_000_000;
  const deps = { check: async () => { checks++; return 'pending'; }, now: () => clock };

  await refreshTenantSendingStatus(9, db, deps);
  clock += STATUS_CACHE_TTL_MS + 1;
  await refreshTenantSendingStatus(9, db, deps);

  assert.equal(checks, 2);
});

test('re-provisioning is not retried again inside the cooldown', async () => {
  // Without a cooldown, every status poll for a broken tenant would fire a
  // fresh CreateEmailIdentity + Route53 ChangeResourceRecordSets — a
  // re-provision storm against the two AWS APIs with the tightest limits,
  // triggered by nothing more than an open Settings page.
  const db = fakeDb({ subdomain: null, status: 'failed' });
  let provisioned = 0;
  let clock = 1_000_000;
  const deps = {
    provision: async () => { provisioned++; throw new Error('AWS down'); },
    check: async () => 'pending',
    now: () => clock
  };

  await refreshTenantSendingStatus(9, db, deps);
  clock += STATUS_CACHE_TTL_MS + 1; // past the status cache, still in cooldown
  const status = await refreshTenantSendingStatus(9, db, deps);

  assert.equal(provisioned, 1, 'a second poll must not fire a second provision');
  assert.equal(status, 'failed', 'and it still reports the stored truth');
});

test('re-provisioning is retried once the cooldown has elapsed', async () => {
  const db = fakeDb({ subdomain: null, status: 'failed' });
  let provisioned = 0;
  let clock = 1_000_000;
  const deps = {
    provision: async () => {
      provisioned++;
      if (provisioned === 1) throw new Error('AWS down');
      return { subdomain: '9.mail.witechagency.com' };
    },
    check: async () => 'pending',
    now: () => clock
  };

  await refreshTenantSendingStatus(9, db, deps);
  clock += PROVISION_RETRY_COOLDOWN_MS + 1;
  const status = await refreshTenantSendingStatus(9, db, deps);

  assert.equal(provisioned, 2);
  assert.equal(db.row.send_subdomain, '9.mail.witechagency.com');
  assert.equal(status, 'pending');
});

test('a transient SES check failure does not overwrite the stored status', async () => {
  const db = fakeDb({ subdomain: '9.mail.witechagency.com', status: 'pending' });

  const status = await refreshTenantSendingStatus(9, db, {
    check: async () => { throw new Error('Throttling'); }
  });

  assert.equal(status, 'pending');
  assert.equal(db.row.send_subdomain_status, 'pending');
  assert.equal(
    db.calls.filter((c) => /UPDATE users/.test(c.sql)).length,
    0,
    'must not write a status it never established'
  );
});

test('an unknown user is reported as pending without touching AWS', async () => {
  const db = { calls: [], async get() { return undefined; }, async run() { return { changes: 0 }; } };
  const status = await refreshTenantSendingStatus(404, db, {
    provision: async () => { throw new Error('must not provision an unknown user'); },
    check: async () => { throw new Error('must not check an unknown user'); }
  });
  assert.equal(status, 'pending');
});
