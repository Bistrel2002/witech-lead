/**
 * Platform-level secrets and configuration for outreach sending.
 *
 * These are operator-owned values injected via environment (Vault-backed in
 * production). They are never exposed through any user-facing API and never
 * stored in the `settings` table.
 */

/* What sending genuinely cannot work without.
 *
 * The three Twilio variables used to be in this list, which meant an operator
 * had to open a Twilio account and buy a sender ID before the server would
 * consider itself configured — for a channel the product refuses outright.
 * SMS is blocked in two places, at campaign creation and again at send time,
 * pending STOP handling; the Twilio client is never constructed for a campaign
 * that can run. Requiring its credentials was setup work for a feature nobody
 * can reach.
 *
 * They are still read below and validated again the day SMS returns. */
const REQUIRED_VARS = [
  'AWS_REGION',
  'MAIL_ROOT_DOMAIN',
  'SES_WEBHOOK_TOKEN',
  'UNSUBSCRIBE_SECRET',
  'PUBLIC_API_URL'
];

/* Checked only when an SMS campaign is actually attempted. Kept here so
 * re-enabling SMS is one line moved, not a hunt through the codebase. */
export const SMS_REQUIRED_VARS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_SENDER_ID'
];

let cached = null;

export function resetPlatformConfigCache() {
  cached = null;
}

export function getPlatformConfig() {
  if (cached) return cached;

  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Configuration plateforme incomplète. Variables manquantes : ${missing.join(', ')}.`
    );
  }

  cached = Object.freeze({
    aws: Object.freeze({
      region: process.env.AWS_REGION,
      sesConfigurationSet: process.env.SES_CONFIGURATION_SET || null
    }),
    mail: Object.freeze({
      rootDomain: process.env.MAIL_ROOT_DOMAIN,
      fromLocalPart: process.env.MAIL_FROM_LOCAL_PART || 'no-reply'
    }),
    twilio: Object.freeze({
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      senderId: process.env.TWILIO_SENDER_ID
    }),
    webhook: Object.freeze({
      // Shared secret the SES bounce/complaint webhook requires as ?token=...
      // on every request. SNS cannot present a session cookie, so this is the
      // only thing standing between an unauthenticated attacker and the
      // ability to post fake bounce/complaint events for any tenant.
      token: process.env.SES_WEBHOOK_TOKEN
    }),
    // Public base URL of THIS backend. Unsubscribe links are served by the
    // backend, not the frontend, so FRONTEND_URL is the wrong value here.
    publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/+$/, ''),
    unsubscribe: Object.freeze({
      // Signs unsubscribe tokens. Rotating it invalidates every link already
      // sent, so treat it as permanent once the first campaign has gone out.
      secret: process.env.UNSUBSCRIBE_SECRET
    })
  });

  return cached;
}
