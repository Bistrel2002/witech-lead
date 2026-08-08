import { provisionSendingDomain, checkDomainVerification } from './sendingDomainService.js';

/**
 * How long a resolved sending status is reused before SES is asked again.
 *
 * GET /api/sending-status used to run a live GetEmailIdentity on every single
 * request for every non-verified tenant. SESv2 identity operations share a low
 * account-wide quota, so one customer leaving the Settings page open could
 * throttle identity calls — including provisioning — for every other tenant.
 * DKIM propagation takes ~15 minutes, so a 30s cache is invisible to the
 * customer and bounds the call rate per tenant regardless of poll rate.
 */
export const STATUS_CACHE_TTL_MS = 30_000;

/**
 * Minimum gap between two re-provisioning attempts for the same tenant.
 *
 * Re-provisioning is far heavier than a status check — CreateEmailIdentity
 * plus a Route53 ChangeResourceRecordSets — and both APIs are rate limited.
 * Without this, a broken tenant's every status poll would fire a fresh pair of
 * write calls: a re-provision storm triggered by nothing more than an open
 * browser tab, and one that would make the underlying AWS throttling worse
 * rather than better.
 */
export const PROVISION_RETRY_COOLDOWN_MS = 5 * 60_000;

/** userId -> { status, at } */
const statusCache = new Map();
/** userId -> timestamp of the last provisioning attempt */
const lastProvisionAttempt = new Map();

/** Test seam: these caches are module state and would otherwise leak across tests. */
export function resetTenantSendingCaches() {
  statusCache.clear();
  lastProvisionAttempt.clear();
}

/**
 * Provisioning is fire-and-forget: a transient AWS failure must never block a
 * signup. A tenant left in 'failed' — or one whose row never got a subdomain
 * at all — is retried by refreshTenantSendingStatus, which every call of
 * GET /api/sending-status goes through.
 */
export async function ensureTenantSendingDomain(userId, db, deps = {}) {
  const provision = deps.provision ?? provisionSendingDomain;
  try {
    const { subdomain } = await provision(userId);
    await db.run(
      'UPDATE users SET send_subdomain = ?, send_subdomain_status = ? WHERE id = ?',
      subdomain, 'pending', userId
    );
  } catch (error) {
    console.error(`Provisioning: failed for user ${userId}:`, error.message);
    // This write must never throw either: every call site invokes this
    // function fire-and-forget (no await, no .catch()), so an unguarded
    // rejection here would surface as an unhandledRejection and crash the
    // whole server for every tenant, not just the one whose signup failed.
    try {
      await db.run(
        'UPDATE users SET send_subdomain_status = ? WHERE id = ?',
        'failed', userId
      );
    } catch (writeError) {
      console.error(`Provisioning: failed to persist failure status for user ${userId}:`, writeError.message);
    }
  }
}

function remember(userId, status, now) {
  statusCache.set(userId, { status, at: now() });
  return status;
}

/**
 * Resolves a tenant's sending status, repairing the tenant if needed, and
 * persists whatever it concludes so the API and the stored row always agree.
 *
 * That agreement is the fix for a permanent dead end. Previously this returned
 * a bare 'pending' whenever `send_subdomain` was NULL, without writing it and
 * without ever re-provisioning — and nothing else in the codebase
 * re-provisioned either. So a tenant whose signup hit a throttle, an expired
 * key or a missing ROUTE53_HOSTED_ZONE_ID was bricked for good: the row said
 * 'failed', the API said 'pending', the UI showed "préparation en cours,
 * quelques minutes" forever, and every campaign they launched failed silently.
 */
export async function refreshTenantSendingStatus(userId, db, deps = {}) {
  const check = deps.check ?? checkDomainVerification;
  const provision = deps.provision ?? provisionSendingDomain;
  const now = deps.now ?? Date.now;

  const cached = statusCache.get(userId);
  if (cached && now() - cached.at < STATUS_CACHE_TTL_MS) return cached.status;

  const user = await db.get(
    'SELECT send_subdomain, send_subdomain_status FROM users WHERE id = ?',
    userId
  );
  if (!user) return 'pending';

  const storedStatus = user.send_subdomain_status || 'pending';
  let subdomain = user.send_subdomain;

  if (!subdomain || storedStatus === 'failed') {
    const lastAttempt = lastProvisionAttempt.get(userId);
    if (lastAttempt !== undefined && now() - lastAttempt < PROVISION_RETRY_COOLDOWN_MS) {
      // Still cooling down. Report what is actually stored — never a rosier
      // guess, which is what made this state invisible in the first place.
      return remember(userId, storedStatus, now);
    }

    lastProvisionAttempt.set(userId, now());
    try {
      // Idempotent by construction: CreateEmailIdentity tolerates
      // AlreadyExistsException (falling back to GetEmailIdentity for the DKIM
      // tokens) and the Route53 change is an UPSERT, so re-running this also
      // repairs a tenant whose DNS was only half written.
      ({ subdomain } = await provision(userId));
      await db.run(
        'UPDATE users SET send_subdomain = ?, send_subdomain_status = ? WHERE id = ?',
        subdomain, 'pending', userId
      );
    } catch (error) {
      console.error(`Provisioning: re-provision failed for user ${userId}:`, error.message);
      try {
        await db.run(
          'UPDATE users SET send_subdomain_status = ? WHERE id = ?',
          'failed', userId
        );
      } catch (writeError) {
        console.error(`Provisioning: failed to persist failure status for user ${userId}:`, writeError.message);
      }
      return remember(userId, 'failed', now);
    }
  }

  try {
    const status = await check(subdomain);
    await db.run(
      'UPDATE users SET send_subdomain_status = ? WHERE id = ?',
      status, userId
    );
    return remember(userId, status, now);
  } catch (error) {
    console.error(`Provisioning: status check failed for user ${userId}:`, error.message);
    // Neither persist nor cache a status we failed to establish: a transient
    // SES throttle must not overwrite a good stored value, and must not pin a
    // stale answer for the next 30 seconds either.
    return storedStatus;
  }
}
