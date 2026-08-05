import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { getDb } from '../database/db.js';
import { getPlatformConfig } from '../config/platformConfig.js';

const router = express.Router();

/** Complaint rate above which a tenant is paused, once past the sample floor. */
const COMPLAINT_RATE_THRESHOLD = 0.05;
const COMPLAINT_SAMPLE_FLOOR = 20;

/** Timeout for the outbound GET that confirms an SNS subscription. */
const SNS_CONFIRM_TIMEOUT_MS = 5000;

export function parseSnsNotification(rawBody) {
  const envelope = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  return {
    type: envelope.Type,
    subscribeUrl: envelope.SubscribeURL || null,
    messageId: envelope.MessageId || null,
    message: envelope.Message ? JSON.parse(envelope.Message) : null
  };
}

export function extractDeliveryEvent(message) {
  if (!message || !message.eventType) return null;
  const source = message.mail?.source;
  if (!source) return null;

  const sendingDomain = source.split('@')[1] || null;
  if (!sendingDomain) return null;

  if (message.eventType === 'Complaint') {
    return {
      eventType: 'Complaint',
      recipient: message.complaint?.complainedRecipients?.[0]?.emailAddress ?? null,
      sendingDomain
    };
  }
  if (message.eventType === 'Bounce') {
    return {
      eventType: 'Bounce',
      recipient: message.bounce?.bouncedRecipients?.[0]?.emailAddress ?? null,
      sendingDomain
    };
  }
  return null;
}

/**
 * The only outbound request this route ever makes is confirming an SNS
 * subscription — but `SubscribeURL` arrives in an unauthenticated,
 * attacker-controlled body. Without this allowlist a POST claiming
 * `SubscribeURL: "http://169.254.169.254/..."` would make the server (which
 * runs with IAM credentials for SES/Route53) issue an arbitrary outbound GET,
 * with success/failure distinguishable in the response — a blind SSRF
 * oracle. Only genuine SNS confirmation endpoints are allowed: https, host
 * ending in `.amazonaws.com` with an `sns.<region>` prefix.
 */
export function isAllowedSnsHost(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return /^sns\.[a-z0-9-]+\.amazonaws\.com$/i.test(parsed.hostname);
}

/**
 * Length-safe constant-time comparison of the shared webhook token.
 * The length check must happen first: `timingSafeEqual` throws on
 * mismatched buffer lengths, which would otherwise crash the handler (or
 * leak length via the difference between "threw" and "returned false") for
 * a malformed/missing token.
 */
export function isValidWebhookToken(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function pauseIfComplaintRateExceeded(db, userId) {
  const counts = await db.get(
    `SELECT
       COUNT(*) FILTER (WHERE event_type = 'Complaint') AS complaints,
       COUNT(*) AS total
     FROM sending_events WHERE user_id = ?`,
    userId
  );
  const total = Number(counts?.total || 0);
  const complaints = Number(counts?.complaints || 0);
  if (total < COMPLAINT_SAMPLE_FLOOR) return;
  if (complaints / total < COMPLAINT_RATE_THRESHOLD) return;

  await db.run(
    'UPDATE users SET sending_paused_at = CURRENT_TIMESTAMP WHERE id = ? AND sending_paused_at IS NULL',
    userId
  );
  await db.run(
    "UPDATE campaigns SET status = 'Paused' WHERE user_id = ? AND status = 'Active'",
    userId
  );
  console.warn(`Sending: paused user ${userId} (${complaints}/${total} complaints)`);
}

async function defaultHttpGet(url) {
  return axios.get(url, { timeout: SNS_CONFIRM_TIMEOUT_MS });
}

/**
 * Handles a single POST to /api/ses/events. Exported (rather than kept as an
 * inline router callback) so tests can drive it directly with injected
 * fakes for `getDb`/`httpGet`/`expectedToken` — no live database or network
 * required.
 */
export async function handleSesEvent(req, res, deps = {}) {
  const { getDb: getDbFn = getDb, httpGet = defaultHttpGet } = deps;

  let expectedToken;
  try {
    expectedToken = Object.prototype.hasOwnProperty.call(deps, 'expectedToken')
      ? deps.expectedToken
      : getPlatformConfig().webhook.token;
  } catch (error) {
    console.error('SES webhook: platform config unavailable:', error.message);
    return res.status(500).send('configuration error');
  }

  // Runs before any parsing, DB access, or the SubscriptionConfirmation
  // branch: without a valid shared-secret token, the tenant is looked up
  // purely by `send_subdomain`, which is NOT a secret (it's `{userId}.mail.
  // witechagency.com`, sequential and visible in every campaign's From
  // header and in public DNS). Without this gate anyone could post synthetic
  // Complaint events for a known tenant and trip the auto-pause below — an
  // unauthenticated denial-of-service against a named customer.
  const providedToken = req.query?.token;
  if (!isValidWebhookToken(providedToken, expectedToken)) {
    return res.status(403).send('forbidden');
  }

  try {
    const parsed = parseSnsNotification(req.body);

    if (parsed.type === 'SubscriptionConfirmation' && parsed.subscribeUrl) {
      if (!isAllowedSnsHost(parsed.subscribeUrl)) {
        console.warn(`SES webhook: rejected SubscribeURL outside the SNS host allowlist: ${parsed.subscribeUrl}`);
        return res.status(200).send('subscribe url rejected');
      }
      await httpGet(parsed.subscribeUrl);
      return res.status(200).send('subscription confirmed');
    }

    const event = extractDeliveryEvent(parsed.message);
    if (!event) return res.status(200).send('ignored');

    const db = await getDbFn();
    const user = await db.get('SELECT id FROM users WHERE send_subdomain = ?', event.sendingDomain);
    if (!user) return res.status(200).send('unknown domain');

    // SNS delivers at-least-once: a redelivered notification must not be
    // counted twice toward the complaint threshold, or AWS's own retry
    // mechanics could false-positive-pause an innocent tenant. The
    // pre-check covers the common case; the unique index on message_id
    // (see db.js) is the backstop for a race between two redeliveries, and
    // any resulting constraint violation is caught below rather than
    // escaping the handler.
    if (parsed.messageId) {
      const existing = await db.get(
        'SELECT id FROM sending_events WHERE message_id = ?',
        parsed.messageId
      );
      if (existing) return res.status(200).send('duplicate');
    }

    await db.run(
      'INSERT INTO sending_events (user_id, event_type, recipient, sending_domain, message_id) VALUES (?, ?, ?, ?, ?)',
      user.id, event.eventType, event.recipient, event.sendingDomain, parsed.messageId
    );

    if (event.eventType === 'Complaint') {
      await pauseIfComplaintRateExceeded(db, user.id);
    }

    res.status(200).send('recorded');
  } catch (error) {
    console.error('SES webhook error:', error.message);
    // 200 regardless: SNS retries aggressively on non-2xx and we do not want a
    // poison message replayed forever. (The 403 token rejection above is
    // deliberately NOT part of this contract — that path is never SNS.)
    res.status(200).send('error logged');
  }
}

router.post('/events', (req, res) => handleSesEvent(req, res));

export default router;
