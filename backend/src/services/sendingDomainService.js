import {
  SESv2Client,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  PutEmailIdentityMailFromAttributesCommand
} from '@aws-sdk/client-sesv2';
import { Route53Client, ChangeResourceRecordSetsCommand } from '@aws-sdk/client-route-53';
import { getPlatformConfig } from '../config/platformConfig.js';

/**
 * Each tenant sends from its own subdomain so that one customer's spam
 * complaints cannot damage another customer's deliverability.
 */

export function buildSubdomain(userId) {
  return `${userId}.${getPlatformConfig().mail.rootDomain}`;
}

export function buildFromAddress(subdomain) {
  return `${getPlatformConfig().mail.fromLocalPart}@${subdomain}`;
}

export function dkimRecordsFor(subdomain, tokens) {
  return tokens.map((token) => ({
    name: `${token}._domainkey.${subdomain}`,
    type: 'CNAME',
    value: `${token}.dkim.amazonses.com`
  }));
}

/**
 * A custom MAIL FROM subdomain gives us SPF alignment, which materially
 * improves inbox placement for cold outreach.
 */
export function mailFromRecordsFor(subdomain) {
  const { region } = getPlatformConfig().aws;
  const mailFrom = `bounce.${subdomain}`;
  return [
    { name: mailFrom, type: 'MX', value: `10 feedback-smtp.${region}.amazonses.com` },
    { name: mailFrom, type: 'TXT', value: '"v=spf1 include:amazonses.com ~all"' }
  ];
}

export function createSesClient() {
  return new SESv2Client({ region: getPlatformConfig().aws.region });
}

export function createRoute53Client() {
  return new Route53Client({ region: getPlatformConfig().aws.region });
}

async function fetchDkimTokens(sesClient, subdomain) {
  try {
    const created = await sesClient.send(new CreateEmailIdentityCommand({
      EmailIdentity: subdomain,
      DkimSigningAttributes: { NextSigningKeyLength: 'RSA_2048_BIT' }
    }));
    return created?.DkimAttributes?.Tokens ?? [];
  } catch (error) {
    if (error.name !== 'AlreadyExistsException') throw error;
    const existing = await sesClient.send(new GetEmailIdentityCommand({ EmailIdentity: subdomain }));
    return existing?.DkimAttributes?.Tokens ?? [];
  }
}

export async function provisionSendingDomain(userId, deps = {}) {
  const sesClient = deps.sesClient ?? createSesClient();
  const route53Client = deps.route53Client ?? createRoute53Client();
  const subdomain = buildSubdomain(userId);

  const dkimTokens = await fetchDkimTokens(sesClient, subdomain);

  await sesClient.send(new PutEmailIdentityMailFromAttributesCommand({
    EmailIdentity: subdomain,
    MailFromDomain: `bounce.${subdomain}`,
    BehaviorOnMxFailure: 'USE_DEFAULT_VALUE'
  }));

  const records = [
    ...dkimRecordsFor(subdomain, dkimTokens),
    ...mailFromRecordsFor(subdomain)
  ];

  await route53Client.send(new ChangeResourceRecordSetsCommand({
    HostedZoneId: process.env.ROUTE53_HOSTED_ZONE_ID,
    ChangeBatch: {
      Comment: `Witech Lead sending domain for user ${userId}`,
      Changes: records.map((record) => ({
        Action: 'UPSERT',
        ResourceRecordSet: {
          Name: record.name,
          Type: record.type,
          TTL: 1800,
          ResourceRecords: [{ Value: record.value }]
        }
      }))
    }
  }));

  return { subdomain, dkimTokens, recordsWritten: records.length };
}

export async function checkDomainVerification(subdomain, deps = {}) {
  const sesClient = deps.sesClient ?? createSesClient();
  const identity = await sesClient.send(new GetEmailIdentityCommand({ EmailIdentity: subdomain }));
  if (identity?.VerifiedForSendingStatus) return 'verified';
  if (identity?.DkimAttributes?.Status === 'FAILED') return 'failed';
  return 'pending';
}
