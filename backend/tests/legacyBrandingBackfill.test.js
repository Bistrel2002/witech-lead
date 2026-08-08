import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillLegacyBranding } from '../src/database/db.js';

/**
 * A minimal stand-in for the DatabaseAdapter. It records what was called AND
 * models a tiny `users` table, so a test can assert on which rows a statement
 * actually touches rather than only on the SQL text.
 *
 * The row scoping is derived from the statement itself (does it restrict to
 * the oldest id?) rather than hardcoded, so the mock cannot flatter an
 * unscoped UPDATE into looking correct.
 */
function makeMockDb({ legacyRows, users = [] }) {
  const calls = { all: [], run: [], transactions: 0 };
  const db = {
    calls,
    users,
    async all(sql, ...params) {
      calls.all.push({ sql, params });
      return legacyRows;
    },
    async run(sql, ...params) {
      calls.run.push({ sql, params });

      if (/^\s*UPDATE\s+users/i.test(sql)) {
        const scopedToOldest =
          /\(\s*SELECT\s+MIN\(\s*id\s*\)\s+FROM\s+users\s*\)/i.test(sql) ||
          /ORDER BY\s+id(\s+ASC)?\s+LIMIT\s+1/i.test(sql);
        const oldestId = users.length ? Math.min(...users.map((u) => u.id)) : null;
        const [companyName, companyWebsite, senderSignature] = params;

        for (const user of users) {
          if (scopedToOldest && user.id !== oldestId) continue;
          // Models COALESCE(col, ?): only fills a column that is still NULL.
          user.company_name ??= companyName;
          user.company_website ??= companyWebsite;
          user.sender_signature ??= senderSignature;
        }
      }

      return { lastID: null, changes: 0 };
    },
    async transaction(fn) {
      calls.transactions++;
      return fn(db);
    }
  };
  return db;
}

const LEGACY_ROWS = [
  { key: 'company_name', value: "Wi'Tech Agency" },
  { key: 'company_website', value: 'https://www.witechagency.com' },
  { key: 'sender_signature', value: 'Cordialement' }
];

test('backfillLegacyBranding copies legacy settings onto users, then deletes them', async () => {
  const db = makeMockDb({ legacyRows: LEGACY_ROWS });

  await backfillLegacyBranding(db);

  // Must have run exactly one UPDATE (the backfill) and one DELETE
  // (retiring the legacy rows) — this is the part the original
  // implementation was missing: without the DELETE, a fresh signup that
  // still has NULL branding columns would get silently re-matched against
  // these same stale global values on every subsequent server boot.
  assert.equal(db.calls.run.length, 2, 'expected an UPDATE and a DELETE');

  const [updateCall, deleteCall] = db.calls.run;
  assert.match(updateCall.sql, /UPDATE users/i);
  assert.match(deleteCall.sql, /DELETE FROM settings/i);
  assert.match(deleteCall.sql, /company_name/);
  assert.match(deleteCall.sql, /company_website/);
  assert.match(deleteCall.sql, /sender_signature/);
});

test('backfillLegacyBranding is a no-op once the legacy settings rows are gone (second boot)', async () => {
  const db = makeMockDb({ legacyRows: [] });

  await backfillLegacyBranding(db);

  // No legacy rows left means nothing to copy and nothing to delete —
  // a brand-new signup with NULL branding columns must NOT be touched.
  assert.equal(db.calls.run.length, 0, 'expected no UPDATE or DELETE when settings has no legacy branding rows');
});

// --- Important 3: the backfill must not fan the legacy branding out to every tenant ---

test('backfillLegacyBranding touches only the oldest user, never other tenants', async () => {
  // The legacy global branding belonged to whoever was using the product
  // before multi-tenancy — that is the oldest user, and only them. Copying it
  // onto every NULL-branding row would write one tenant's signature and
  // company details permanently into every other tenant's outbound mail:
  // the exact cross-tenant leak this branch exists to close.
  const users = [
    { id: 1, company_name: null, company_website: null, sender_signature: null },
    { id: 2, company_name: null, company_website: null, sender_signature: null },
    { id: 3, company_name: null, company_website: null, sender_signature: null }
  ];
  const db = makeMockDb({ legacyRows: LEGACY_ROWS, users });

  await backfillLegacyBranding(db);

  assert.deepEqual(users[0], {
    id: 1,
    company_name: "Wi'Tech Agency",
    company_website: 'https://www.witechagency.com',
    sender_signature: 'Cordialement'
  }, 'the oldest user should inherit the legacy branding');

  for (const other of users.slice(1)) {
    assert.equal(other.company_name, null, `user ${other.id} must keep NULL company_name`);
    assert.equal(other.company_website, null, `user ${other.id} must keep NULL company_website`);
    assert.equal(other.sender_signature, null, `user ${other.id} must keep NULL sender_signature`);
  }
});

test('backfillLegacyBranding does not overwrite branding the oldest user already set', async () => {
  const users = [
    { id: 1, company_name: 'Agence Alice', company_website: null, sender_signature: 'Alice' }
  ];
  const db = makeMockDb({ legacyRows: LEGACY_ROWS, users });

  await backfillLegacyBranding(db);

  assert.equal(users[0].company_name, 'Agence Alice');
  assert.equal(users[0].sender_signature, 'Alice');
  assert.equal(users[0].company_website, 'https://www.witechagency.com', 'only the still-NULL column is filled');
});

// --- Minor 1: the UPDATE and the DELETE must be atomic ---

test('the UPDATE and the DELETE run inside a single transaction', async () => {
  // If the DELETE lands without the UPDATE, the legacy branding is lost
  // forever; if the UPDATE lands without the DELETE, the next boot re-runs
  // the copy against a different set of NULL rows.
  const db = makeMockDb({ legacyRows: LEGACY_ROWS, users: [{ id: 1 }] });

  await backfillLegacyBranding(db);

  assert.equal(db.calls.transactions, 1, 'expected the write pair to be wrapped in one transaction');
});
