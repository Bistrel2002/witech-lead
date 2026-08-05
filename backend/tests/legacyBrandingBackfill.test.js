import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillLegacyBranding } from '../src/database/db.js';

// A minimal stand-in for the DatabaseAdapter that just records what was
// called, so this test can assert on behavior without a live Postgres.
function makeMockDb({ legacyRows }) {
  const calls = { all: [], run: [] };
  return {
    calls,
    async all(sql, ...params) {
      calls.all.push({ sql, params });
      return legacyRows;
    },
    async run(sql, ...params) {
      calls.run.push({ sql, params });
      return { lastID: null, changes: 0 };
    }
  };
}

test('backfillLegacyBranding copies legacy settings onto users, then deletes them', async () => {
  const db = makeMockDb({
    legacyRows: [
      { key: 'company_name', value: "Wi'Tech Agency" },
      { key: 'company_website', value: 'https://www.witechagency.com' },
      { key: 'sender_signature', value: 'Cordialement' }
    ]
  });

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
