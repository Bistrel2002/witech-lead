/**
 * Platform-level secrets and configuration for outreach sending.
 *
 * These are operator-owned values injected via environment (Vault-backed in
 * production). They are never exposed through any user-facing API and never
 * stored in the `settings` table.
 */

const REQUIRED_VARS = [
  'AWS_REGION',
  'MAIL_ROOT_DOMAIN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_SENDER_ID',
  'SES_WEBHOOK_TOKEN'
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
    })
  });

  return cached;
}
