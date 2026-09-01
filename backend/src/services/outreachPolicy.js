/* How often the same prospect may be emailed, and when it stops being worth
 * chasing.
 *
 * Daily prospecting over a fixed list means the same businesses come back
 * round again and again. Without a rule, a prospect that was emailed on
 * Monday is emailed again on Tuesday, and the campaign that felt productive
 * is really the same forty people receiving the same message five times —
 * which is how a sending domain earns spam complaints.
 *
 * The policy:
 *
 *   - a prospect is emailed at most MAX_CONTACT_ATTEMPTS times, ever
 *   - consecutive attempts are at least RECONTACT_COOLDOWN_DAYS apart
 *   - a prospect still sitting on "Contacted" NO_REPLY_LAPSE_DAYS after its
 *     last send is closed as lost
 *
 * That last rule keys on the status never having been touched. Moving a
 * prospect to "RDV fixé" or anything else by hand is the signal that it is
 * alive; a prospect nobody has moved in two weeks is not a lead, it is a
 * row. Only 'Contacted' lapses — a prospect the salesperson advanced is
 * theirs, and this must never reach in and close it.
 */

export const RECONTACT_COOLDOWN_DAYS = 4;
export const MAX_CONTACT_ATTEMPTS = 2;
export const NO_REPLY_LAPSE_DAYS = 14;

export const BLOCK_REASONS = {
  MAX_ATTEMPTS: 'max_attempts',
  COOLDOWN: 'cooldown'
};

/* Delivered sends per prospect, and when the most recent one went out.
 *
 * Only 'Sent' rows count. A queued row carries a sent_at from the column
 * default, so counting anything else would make a prospect look contacted
 * the moment it was added to a campaign. */
export async function getOutreachState(db, leadIds) {
  const state = new Map();
  if (!leadIds || leadIds.length === 0) return state;

  const placeholders = leadIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT lead_id,
            COUNT(*) AS attempts,
            MAX(sent_at) AS last_sent_at
       FROM campaign_logs
      WHERE status = 'Sent'
        AND lead_id IN (${placeholders})
      GROUP BY lead_id`,
    ...leadIds
  );

  for (const row of rows) {
    state.set(Number(row.lead_id), {
      attempts: Number(row.attempts),
      lastSentAt: row.last_sent_at ? new Date(row.last_sent_at) : null
    });
  }
  return state;
}

/** Days elapsed since `date`, or null when there is no date. */
function daysSince(date, now) {
  if (!date) return null;
  return (now.getTime() - date.getTime()) / 86400000;
}

/**
 * Decide a single prospect against the policy.
 * Returns { ok } or { ok: false, reason, attempts, daysRemaining }.
 */
export function evaluate(entry, now = new Date()) {
  const attempts = entry?.attempts ?? 0;
  if (attempts === 0) return { ok: true, attempts: 0 };

  if (attempts >= MAX_CONTACT_ATTEMPTS) {
    return { ok: false, reason: BLOCK_REASONS.MAX_ATTEMPTS, attempts };
  }

  const elapsed = daysSince(entry.lastSentAt, now);
  if (elapsed !== null && elapsed < RECONTACT_COOLDOWN_DAYS) {
    return {
      ok: false,
      reason: BLOCK_REASONS.COOLDOWN,
      attempts,
      daysRemaining: Math.max(0, Math.ceil(RECONTACT_COOLDOWN_DAYS - elapsed))
    };
  }

  return { ok: true, attempts };
}

/**
 * Split candidate lead ids into those a campaign may target now and those it
 * may not, with the reason for each exclusion so the caller can explain
 * itself rather than silently shrinking the campaign.
 */
export async function partitionEligible(db, leadIds, now = new Date()) {
  const state = await getOutreachState(db, leadIds);
  const eligible = [];
  const blocked = [];

  for (const id of leadIds) {
    const verdict = evaluate(state.get(Number(id)), now);
    if (verdict.ok) eligible.push(id);
    else blocked.push({ leadId: id, ...verdict });
  }
  return { eligible, blocked };
}

/**
 * Authoritative check at send time.
 *
 * The filter applied when a campaign is created is not enough on its own: a
 * campaign can sit queued for days, and two campaigns can be queued for the
 * same prospect before either runs. This is the one that actually protects
 * the recipient.
 */
export async function isSendable(db, leadId, now = new Date()) {
  const state = await getOutreachState(db, [leadId]);
  return evaluate(state.get(Number(leadId)), now);
}

/**
 * Close prospects that were contacted and never moved.
 *
 * Idempotent, so it is safe to run on every boot and on a timer, and safe
 * with more than one backend instance running it at once.
 */
export async function lapseSilentProspects(db) {
  const rows = await db.all(
    `SELECT l.id
       FROM leads l
       JOIN (
         SELECT lead_id, MAX(sent_at) AS last_sent_at
           FROM campaign_logs
          WHERE status = 'Sent'
          GROUP BY lead_id
       ) s ON s.lead_id = l.id
      WHERE l.status = 'Contacted'
        AND s.last_sent_at < now() - interval '${NO_REPLY_LAPSE_DAYS} days'`
  );

  for (const { id } of rows) {
    await db.run("UPDATE leads SET status = 'Closed Lost' WHERE id = ?", id);
    try {
      await db.run(
        'INSERT INTO lead_discussions (lead_id, type, content) VALUES (?, ?, ?)',
        id,
        'Note',
        `Sans réponse ${NO_REPLY_LAPSE_DAYS} jours après le dernier envoi — classé perdu automatiquement.`
      );
    } catch (err) {
      console.error(`OutreachPolicy: could not record lapse note for lead ${id}:`, err.message);
    }
  }
  return rows.length;
}

/**
 * The outreach standing of one prospect, shaped for display.
 *
 * Derived here rather than in the browser so the interface never restates
 * the rule. If the cooldown or the cap changes, the badge follows without
 * anyone remembering to update it.
 */
export function describeOutreach(entry, now = new Date()) {
  const attempts = entry?.attempts ?? 0;
  const verdict = evaluate(entry, now);
  return {
    attempts,
    maxAttempts: MAX_CONTACT_ATTEMPTS,
    lastSentAt: entry?.lastSentAt ? entry.lastSentAt.toISOString() : null,
    eligible: verdict.ok,
    reason: verdict.reason ?? null,
    // Only meaningful while waiting out the cooldown; null once the prospect
    // is either sendable or out of attempts for good.
    daysUntilRecontact: verdict.daysRemaining ?? null
  };
}

/** Attach describeOutreach() to each lead, in one query for the whole set. */
export async function withOutreach(db, leads, now = new Date()) {
  if (!leads.length) return leads;
  const state = await getOutreachState(db, leads.map((l) => l.id));
  return leads.map((lead) => ({
    ...lead,
    outreach: describeOutreach(state.get(Number(lead.id)), now)
  }));
}
