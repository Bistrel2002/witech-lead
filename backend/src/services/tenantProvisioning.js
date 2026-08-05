import { provisionSendingDomain, checkDomainVerification } from './sendingDomainService.js';

/**
 * Provisioning is fire-and-forget: a transient AWS failure must never block a
 * signup. A tenant left in 'failed' is retried by refreshTenantSendingStatus.
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
    await db.run(
      'UPDATE users SET send_subdomain_status = ? WHERE id = ?',
      'failed', userId
    );
  }
}

export async function refreshTenantSendingStatus(userId, db, deps = {}) {
  const check = deps.check ?? checkDomainVerification;
  const user = await db.get('SELECT send_subdomain FROM users WHERE id = ?', userId);
  if (!user?.send_subdomain) return 'pending';

  try {
    const status = await check(user.send_subdomain);
    await db.run(
      'UPDATE users SET send_subdomain_status = ? WHERE id = ?',
      status, userId
    );
    return status;
  } catch (error) {
    console.error(`Provisioning: status check failed for user ${userId}:`, error.message);
    return 'pending';
  }
}
