import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import {
  buildSubdomain,
  buildFromAddress,
  dkimRecordsFor,
  mailFromRecordsFor,
  provisionSendingDomain,
  checkDomainVerification
} from '../src/services/sendingDomainService.js';

const ENV = {
  AWS_REGION: 'eu-west-3',
  MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
  ROUTE53_HOSTED_ZONE_ID: 'Z123',
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'tok',
  TWILIO_SENDER_ID: 'WITECH',
  SES_WEBHOOK_TOKEN: 'test-webhook-token',
  UNSUBSCRIBE_SECRET: 'unsub-secret-test',
  PUBLIC_API_URL: 'https://api.example.com'
};

test.beforeEach(() => {
  Object.assign(process.env, ENV);
  resetPlatformConfigCache();
});

function fakeSes(responses) {
  const sent = [];
  return {
    sent,
    async send(command) {
      sent.push(command.constructor.name);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next ?? {};
    }
  };
}

test('builds the tenant subdomain from the user id', () => {
  assert.equal(buildSubdomain(42), '42.mail.witechagency.com');
});

test('builds the no-reply From address', () => {
  assert.equal(buildFromAddress('42.mail.witechagency.com'), 'no-reply@42.mail.witechagency.com');
});

test('maps DKIM tokens to CNAME records', () => {
  const records = dkimRecordsFor('42.mail.witechagency.com', ['aaa', 'bbb']);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], {
    name: 'aaa._domainkey.42.mail.witechagency.com',
    type: 'CNAME',
    value: 'aaa.dkim.amazonses.com'
  });
});

test('builds MX and SPF records for the custom MAIL FROM subdomain', () => {
  const records = mailFromRecordsFor('42.mail.witechagency.com');
  const mx = records.find((r) => r.type === 'MX');
  const txt = records.find((r) => r.type === 'TXT');
  assert.equal(mx.name, 'bounce.42.mail.witechagency.com');
  assert.match(mx.value, /feedback-smtp\.eu-west-3\.amazonses\.com$/);
  assert.equal(txt.name, 'bounce.42.mail.witechagency.com');
  assert.match(txt.value, /v=spf1 include:amazonses\.com ~all/);
});

test('provisioning creates the identity and writes every DNS record', async () => {
  const sesClient = fakeSes([
    { DkimAttributes: { Tokens: ['aaa', 'bbb', 'ccc'] } },
    {}
  ]);
  const changes = [];
  const route53Client = {
    async send(command) {
      changes.push(command.input.ChangeBatch.Changes);
      return {};
    }
  };

  const result = await provisionSendingDomain(7, { sesClient, route53Client });

  assert.equal(result.subdomain, '7.mail.witechagency.com');
  assert.deepEqual(result.dkimTokens, ['aaa', 'bbb', 'ccc']);
  // 3 DKIM CNAMEs + 1 MX + 1 SPF TXT
  assert.equal(result.recordsWritten, 5);
  assert.equal(changes[0].length, 5);
  assert.deepEqual(sesClient.sent, ['CreateEmailIdentityCommand', 'PutEmailIdentityMailFromAttributesCommand']);
});

test('provisioning tolerates an identity that already exists', async () => {
  const alreadyExists = new Error('Already exists');
  alreadyExists.name = 'AlreadyExistsException';
  const sesClient = fakeSes([
    alreadyExists,
    { DkimAttributes: { Tokens: ['aaa'] } },
    {}
  ]);
  const route53Client = { async send() { return {}; } };

  const result = await provisionSendingDomain(7, { sesClient, route53Client });

  assert.deepEqual(result.dkimTokens, ['aaa']);
  assert.equal(sesClient.sent[1], 'GetEmailIdentityCommand');
});

test('verification maps SES status to our own vocabulary', async () => {
  assert.equal(
    await checkDomainVerification('7.mail.witechagency.com', {
      sesClient: fakeSes([{ VerifiedForSendingStatus: true }])
    }),
    'verified'
  );
  assert.equal(
    await checkDomainVerification('7.mail.witechagency.com', {
      sesClient: fakeSes([{ VerifiedForSendingStatus: false, DkimAttributes: { Status: 'PENDING' } }])
    }),
    'pending'
  );
  assert.equal(
    await checkDomainVerification('7.mail.witechagency.com', {
      sesClient: fakeSes([{ VerifiedForSendingStatus: false, DkimAttributes: { Status: 'FAILED' } }])
    }),
    'failed'
  );
});
