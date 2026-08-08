import crypto from 'node:crypto';
import { getPlatformConfig } from '../config/platformConfig.js';

/**
 * Unsubscribe links carry a stateless HMAC token instead of a stored id.
 * No token table, nothing to migrate, and a link stays valid forever — a
 * recipient who finds a months-old email can still opt out, which is exactly
 * what the regulation intends.
 */

export function normaliseEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function sign(payloadB64) {
  return crypto
    .createHmac('sha256', getPlatformConfig().unsubscribe.secret)
    .update(payloadB64)
    .digest('base64url');
}

export function buildUnsubscribeToken(userId, email) {
  const payload = JSON.stringify({ u: userId, e: normaliseEmail(email) });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyUnsubscribeToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, providedSig] = parts;
  if (!payloadB64 || !providedSig) return null;

  const expectedSig = sign(payloadB64);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  // Length check first: timingSafeEqual throws on unequal lengths.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const { u, e } = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (typeof u !== 'number' || typeof e !== 'string' || !e) return null;
    return { userId: u, email: normaliseEmail(e) };
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(userId, email) {
  const { publicApiUrl } = getPlatformConfig();
  return `${publicApiUrl}/unsubscribe/${buildUnsubscribeToken(userId, email)}`;
}

export async function isSuppressed(db, userId, email) {
  const row = await db.get(
    'SELECT id FROM unsubscribes WHERE email = ? AND (user_id = ? OR user_id IS NULL) LIMIT 1',
    normaliseEmail(email), userId
  );
  return Boolean(row);
}

export async function recordUnsubscribe(db, userId, email, source) {
  await db.run(
    `INSERT INTO unsubscribes (user_id, email, source) VALUES (?, ?, ?)
     ON CONFLICT DO NOTHING`,
    userId, normaliseEmail(email), source
  );
}
