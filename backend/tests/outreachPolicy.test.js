import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate,
  partitionEligible,
  lapseSilentProspects,
  describeOutreach,
  withOutreach,
  describeRelaunch,
  MAX_CAMPAIGN_RUNS,
  BLOCK_REASONS,
  RECONTACT_COOLDOWN_DAYS,
  MAX_CONTACT_ATTEMPTS,
  NO_REPLY_LAPSE_DAYS
} from '../src/services/outreachPolicy.js';

/**
 * The re-contact policy decides who may be emailed and when, so it is the
 * one piece of this product that stands between daily prospecting over a
 * fixed list and mailing the same forty businesses five times a week.
 * Boundaries are asserted on both sides — a cooldown that is off by a day
 * is the whole rule.
 */

const NOW = new Date('2026-08-20T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);

// --- evaluate: the rule itself ---------------------------------------------

test('a prospect never contacted is eligible', () => {
  assert.equal(evaluate(undefined, NOW).ok, true);
  assert.equal(evaluate({ attempts: 0, lastSentAt: null }, NOW).ok, true);
});

test('a prospect contacted once is blocked inside the cooldown', () => {
  const v = evaluate({ attempts: 1, lastSentAt: daysAgo(1) }, NOW);
  assert.equal(v.ok, false);
  assert.equal(v.reason, BLOCK_REASONS.COOLDOWN);
  assert.equal(v.daysRemaining, RECONTACT_COOLDOWN_DAYS - 1);
});

test('the cooldown boundary opens exactly on the fourth day', () => {
  // Just inside: still blocked. Just past: allowed. Off by one here means
  // either a wasted day of prospecting or a recipient contacted too soon.
  const justInside = evaluate({ attempts: 1, lastSentAt: daysAgo(RECONTACT_COOLDOWN_DAYS - 0.01) }, NOW);
  const justPast = evaluate({ attempts: 1, lastSentAt: daysAgo(RECONTACT_COOLDOWN_DAYS + 0.01) }, NOW);
  assert.equal(justInside.ok, false);
  assert.equal(justPast.ok, true);
});

test('a prospect contacted the maximum number of times is blocked for good', () => {
  // Age must not rescue it: the cap is total, not per window.
  const v = evaluate({ attempts: MAX_CONTACT_ATTEMPTS, lastSentAt: daysAgo(365) }, NOW);
  assert.equal(v.ok, false);
  assert.equal(v.reason, BLOCK_REASONS.MAX_ATTEMPTS);
});

test('the attempt cap takes precedence over the cooldown', () => {
  const v = evaluate({ attempts: MAX_CONTACT_ATTEMPTS, lastSentAt: daysAgo(0.5) }, NOW);
  assert.equal(v.reason, BLOCK_REASONS.MAX_ATTEMPTS);
});

// --- partitionEligible: what a campaign is allowed to target ---------------

function fakeDb(sentRows = [], leads = []) {
  const calls = [];
  return {
    calls,
    async all(sql, ...params) {
      calls.push({ sql, params });
      // Ordered deliberately: the lapse query selects FROM leads but contains
      // "FROM campaign_logs ... GROUP BY lead_id" in its subquery, so matching
      // on that first would route it to the wrong branch.
      if (/FROM leads l/i.test(sql)) return leads;
      if (/FROM campaign_logs/i.test(sql) && /GROUP BY lead_id/i.test(sql)) {
        const ids = params.map(Number);
        const grouped = new Map();
        for (const r of sentRows) {
          if (!ids.includes(r.lead_id)) continue;
          const cur = grouped.get(r.lead_id) ?? { lead_id: r.lead_id, attempts: 0, last_sent_at: null };
          cur.attempts += 1;
          if (!cur.last_sent_at || r.sent_at > cur.last_sent_at) cur.last_sent_at = r.sent_at;
          grouped.set(r.lead_id, cur);
        }
        return [...grouped.values()];
      }
      return [];
    },
    async run(sql, ...params) { calls.push({ sql, params }); return { changes: 1 }; }
  };
}

test('a campaign keeps fresh prospects and drops the protected ones', async () => {
  const db = fakeDb([
    { lead_id: 2, sent_at: daysAgo(1) },                              // trop récent
    { lead_id: 3, sent_at: daysAgo(9) }, { lead_id: 3, sent_at: daysAgo(5) } // quota atteint
  ]);
  const { eligible, blocked } = await partitionEligible(db, [1, 2, 3, 4], NOW);

  assert.deepEqual(eligible, [1, 4]);
  assert.equal(blocked.length, 2);
  assert.equal(blocked.find((b) => b.leadId === 2).reason, BLOCK_REASONS.COOLDOWN);
  assert.equal(blocked.find((b) => b.leadId === 3).reason, BLOCK_REASONS.MAX_ATTEMPTS);
});

test('a prospect emailed once, five days ago, may be emailed again', async () => {
  // The whole point of the feature: re-contact is delayed, not forbidden.
  const db = fakeDb([{ lead_id: 1, sent_at: daysAgo(RECONTACT_COOLDOWN_DAYS + 1) }]);
  const { eligible } = await partitionEligible(db, [1], NOW);
  assert.deepEqual(eligible, [1]);
});

test('only delivered sends count towards the policy', async () => {
  // Queued and failed rows carry a sent_at from the column default. Counting
  // them would make a prospect look contacted the moment it was queued.
  const db = fakeDb([]);
  const { eligible } = await partitionEligible(db, [1], NOW);
  assert.deepEqual(eligible, [1]);
  const query = db.calls.find((c) => /FROM campaign_logs/i.test(c.sql));
  assert.match(query.sql, /status = 'Sent'/);
});

test('an empty target list issues no query', async () => {
  const db = fakeDb([]);
  const { eligible, blocked } = await partitionEligible(db, [], NOW);
  assert.deepEqual(eligible, []);
  assert.deepEqual(blocked, []);
  assert.equal(db.calls.length, 0);
});

// --- lapseSilentProspects: closing what nobody moved -----------------------

test('a silent prospect is closed and the reason is recorded', async () => {
  const db = fakeDb([], [{ id: 11 }, { id: 12 }]);
  const closed = await lapseSilentProspects(db);

  assert.equal(closed, 2);
  const updates = db.calls.filter((c) => /UPDATE leads SET status/i.test(c.sql));
  assert.equal(updates.length, 2);
  assert.match(updates[0].sql, /'Closed Lost'/);

  const notes = db.calls.filter((c) => /INSERT INTO lead_discussions/i.test(c.sql));
  assert.equal(notes.length, 2);
  assert.match(notes[0].params[2], new RegExp(String(NO_REPLY_LAPSE_DAYS)));
});

test('the sweep only ever considers prospects still on Contacted', async () => {
  // A prospect the salesperson moved to "RDV fixé" is alive and must never be
  // closed by a timer.
  const db = fakeDb([], []);
  await lapseSilentProspects(db);
  const query = db.calls.find((c) => /FROM leads l/i.test(c.sql));
  assert.match(query.sql, /l\.status = 'Contacted'/);
  assert.match(query.sql, new RegExp(`interval '${NO_REPLY_LAPSE_DAYS} days'`));
});

test('a failed note never stops the sweep', async () => {
  const db = fakeDb([], [{ id: 11 }, { id: 12 }]);
  const realRun = db.run.bind(db);
  db.run = async (sql, ...params) => {
    if (/INSERT INTO lead_discussions/i.test(sql)) throw new Error('journal indisponible');
    return realRun(sql, ...params);
  };
  assert.equal(await lapseSilentProspects(db), 2);
});

// --- describeOutreach: what the badge is built from -------------------------

test('a prospect never contacted reports nothing to show', () => {
  const d = describeOutreach(undefined, NOW);
  assert.equal(d.attempts, 0);
  assert.equal(d.eligible, true);
  assert.equal(d.daysUntilRecontact, null);
});

test('after a first send the badge counts 1 and the days left', () => {
  const d = describeOutreach({ attempts: 1, lastSentAt: daysAgo(1) }, NOW);
  assert.equal(d.attempts, 1);
  assert.equal(d.maxAttempts, MAX_CONTACT_ATTEMPTS);
  assert.equal(d.eligible, false);
  assert.equal(d.daysUntilRecontact, RECONTACT_COOLDOWN_DAYS - 1);
});

test('once the cooldown is served the countdown disappears', () => {
  // The badge must stop saying "relance dans 0 j" and start saying the
  // prospect can be worked again.
  const d = describeOutreach({ attempts: 1, lastSentAt: daysAgo(RECONTACT_COOLDOWN_DAYS + 1) }, NOW);
  assert.equal(d.eligible, true);
  assert.equal(d.daysUntilRecontact, null);
});

test('after the second send there is no countdown, only the cap', () => {
  const d = describeOutreach({ attempts: MAX_CONTACT_ATTEMPTS, lastSentAt: daysAgo(1) }, NOW);
  assert.equal(d.attempts, MAX_CONTACT_ATTEMPTS);
  assert.equal(d.eligible, false);
  assert.equal(d.reason, BLOCK_REASONS.MAX_ATTEMPTS);
  assert.equal(d.daysUntilRecontact, null);
});

test('withOutreach decorates a whole list in one query', async () => {
  const db = fakeDb([
    { lead_id: 1, sent_at: daysAgo(2) },
    { lead_id: 3, sent_at: daysAgo(8) }, { lead_id: 3, sent_at: daysAgo(6) }
  ]);
  const decorated = await withOutreach(db, [{ id: 1 }, { id: 2 }, { id: 3 }], NOW);

  assert.equal(decorated[0].outreach.attempts, 1);
  assert.equal(decorated[0].outreach.daysUntilRecontact, RECONTACT_COOLDOWN_DAYS - 2);
  assert.equal(decorated[1].outreach.attempts, 0);
  assert.equal(decorated[2].outreach.reason, BLOCK_REASONS.MAX_ATTEMPTS);

  // One aggregate for the page, not one query per row.
  assert.equal(db.calls.filter((c) => /FROM campaign_logs/i.test(c.sql)).length, 1);
});

test('withOutreach leaves an empty list alone', async () => {
  const db = fakeDb([]);
  assert.deepEqual(await withOutreach(db, [], NOW), []);
  assert.equal(db.calls.length, 0);
});

// --- describeRelaunch: the campaign-level cycle -----------------------------

test('a campaign never run offers no relaunch', () => {
  const r = describeRelaunch({ run_count: 0, last_run_at: null }, NOW);
  assert.equal(r.state, 'never_run');
  assert.equal(r.canRelaunch, false);
});

test('after one run the relaunch is held for the cooldown', () => {
  const r = describeRelaunch({ run_count: 1, last_run_at: daysAgo(1) }, NOW);
  assert.equal(r.state, 'cooling');
  assert.equal(r.canRelaunch, false);
  assert.equal(r.daysRemaining, RECONTACT_COOLDOWN_DAYS - 1);
});

test('the relaunch opens exactly on the fourth day', () => {
  // Both sides of the boundary: a day early is a wasted click, a day late is
  // a wasted day of prospecting.
  assert.equal(describeRelaunch({ run_count: 1, last_run_at: daysAgo(RECONTACT_COOLDOWN_DAYS - 0.01) }, NOW).canRelaunch, false);
  assert.equal(describeRelaunch({ run_count: 1, last_run_at: daysAgo(RECONTACT_COOLDOWN_DAYS + 0.01) }, NOW).canRelaunch, true);
});

test('a campaign ready to relaunch reports no days remaining', () => {
  const r = describeRelaunch({ run_count: 1, last_run_at: daysAgo(10) }, NOW);
  assert.equal(r.state, 'ready');
  assert.equal(r.canRelaunch, true);
  assert.equal(r.daysRemaining, 0);
});

test('after the second run the campaign is complete for good', () => {
  // Age must never reopen it: two waves is the whole life of a campaign.
  const r = describeRelaunch({ run_count: MAX_CAMPAIGN_RUNS, last_run_at: daysAgo(400) }, NOW);
  assert.equal(r.state, 'complete');
  assert.equal(r.canRelaunch, false);
  assert.equal(r.daysRemaining, null);
});

test('a campaign run more times than the cap stays complete', () => {
  // Campaigns from before the cap existed can exceed it.
  const r = describeRelaunch({ run_count: 5, last_run_at: daysAgo(30) }, NOW);
  assert.equal(r.state, 'complete');
  assert.equal(r.canRelaunch, false);
});

test('the campaign cooldown matches the prospect cooldown', () => {
  // If a campaign could relaunch before its prospects may be re-contacted,
  // the relaunch would produce a wave in which everybody is skipped.
  const campaign = describeRelaunch({ run_count: 1, last_run_at: daysAgo(2) }, NOW);
  const prospect = evaluate({ attempts: 1, lastSentAt: daysAgo(2) }, NOW);
  assert.equal(campaign.daysRemaining, prospect.daysRemaining);
});
