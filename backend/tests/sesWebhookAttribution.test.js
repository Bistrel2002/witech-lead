import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import { buildEmailPayload } from '../src/services/emailService.js';
import { mailFromRecordsFor } from '../src/services/sendingDomainService.js';
import { extractDeliveryEvent, extractSendingDomain, handleSesEvent } from '../src/routes/sesWebhookRoutes.js';

/**
 * Attribution round-trip.
 *
 * Every other webhook test hand-writes `mail.source` in exactly the shape the
 * parser wants, so none of them can catch the parser drifting away from what
 * we actually put on the wire. These tests build the source from the real
 * producers instead — `buildEmailPayload`'s FromEmailAddress and
 * `mailFromRecordsFor`'s MAIL FROM domain — and assert the lookup key that
 * comes back out is byte-for-byte the tenant's `send_subdomain`.
 *
 * When this attribution misses, nothing throws and nothing is logged as an
 * error: `sending_events` simply stays empty, no tenant is ever auto-paused,
 * and the first symptom is AWS suspending the whole platform account.
 */

const TOKEN = 'attribution-test-token';

test.beforeEach(() => {
  Object.assign(process.env, {
    AWS_REGION: 'eu-west-3',
    MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
    ROUTE53_HOSTED_ZONE_ID: 'Z1',
    TWILIO_ACCOUNT_SID: 'AC',
    TWILIO_AUTH_TOKEN: 't',
    TWILIO_SENDER_ID: 'WITECH',
    SES_WEBHOOK_TOKEN: TOKEN,
    UNSUBSCRIBE_SECRET: 'unsub-secret-test',
    PUBLIC_API_URL: 'https://api.example.com'
  });
  resetPlatformConfigCache();
});

const TENANT = {
  name: 'Alice Martin',
  email: 'alice@agence-alice.fr',
  send_subdomain: '7.mail.witechagency.com'
};

function sentPayload() {
  return buildEmailPayload({
    user: TENANT,
    prospect: { email: 'prospect@exemple.fr' },
    subject: 'Bonjour',
    body: 'Texte'
  });
}

function complaintFor(source) {
  return {
    eventType: 'Complaint',
    mail: { source },
    complaint: { complainedRecipients: [{ emailAddress: 'prospect@exemple.fr' }] }
  };
}

test('a complaint quoting the exact From header we sent resolves to the tenant subdomain', () => {
  // SES may echo the formatted Source verbatim, display name and angle
  // brackets included: `"Alice Martin" <no-reply@7.mail.witechagency.com>`.
  const source = sentPayload().FromEmailAddress;
  assert.match(source, /^".+" <.+@.+>$/, 'guard: the payload really is the formatted form');

  const event = extractDeliveryEvent(complaintFor(source));

  assert.equal(event.sendingDomain, TENANT.send_subdomain);
});

test('a complaint quoting the custom MAIL FROM envelope resolves to the tenant subdomain', () => {
  // AWS documents `mail.source` as the envelope MAIL FROM, and provisioning
  // configures a custom MAIL FROM of `bounce.{subdomain}` for SPF alignment,
  // so the envelope carries one label the SES identity does not.
  const mailFromDomain = mailFromRecordsFor(TENANT.send_subdomain)[0].name;
  assert.equal(mailFromDomain, `bounce.${TENANT.send_subdomain}`, 'guard: MAIL FROM shape unchanged');

  const event = extractDeliveryEvent(complaintFor(`no-reply@${mailFromDomain}`));

  assert.equal(event.sendingDomain, TENANT.send_subdomain);
});

test('a bounce quoting the formatted From header resolves to the tenant subdomain', () => {
  const event = extractDeliveryEvent({
    eventType: 'Bounce',
    mail: { source: sentPayload().FromEmailAddress },
    bounce: { bouncedRecipients: [{ emailAddress: 'prospect@exemple.fr' }] }
  });

  assert.equal(event.sendingDomain, TENANT.send_subdomain);
});

test('the plain envelope form still resolves unchanged', () => {
  const event = extractDeliveryEvent(complaintFor(`no-reply@${TENANT.send_subdomain}`));
  assert.equal(event.sendingDomain, TENANT.send_subdomain);
});

test('extractSendingDomain normalises the shapes SES can hand us', () => {
  assert.equal(extractSendingDomain('no-reply@7.mail.witechagency.com'), '7.mail.witechagency.com');
  assert.equal(extractSendingDomain('"Alice Martin" <no-reply@7.mail.witechagency.com>'), '7.mail.witechagency.com');
  assert.equal(extractSendingDomain('<no-reply@7.mail.witechagency.com>'), '7.mail.witechagency.com');
  assert.equal(extractSendingDomain(' no-reply@7.mail.witechagency.com '), '7.mail.witechagency.com');
  assert.equal(extractSendingDomain('no-reply@bounce.7.mail.witechagency.com'), '7.mail.witechagency.com');
  assert.equal(extractSendingDomain('no-reply@7.MAIL.WitechAgency.com'), '7.mail.witechagency.com');
  // A display name containing '@' must not be mistaken for the address.
  assert.equal(extractSendingDomain('"a@b" <no-reply@7.mail.witechagency.com>'), '7.mail.witechagency.com');
  assert.equal(extractSendingDomain('no-at-sign'), null);
  assert.equal(extractSendingDomain(''), null);
  assert.equal(extractSendingDomain(null), null);
});

// --- The failure must be discoverable ---------------------------------------

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; }
  };
}

test('an unattributable event logs a warning naming the domain', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  try {
    const req = {
      query: { token: TOKEN },
      body: JSON.stringify({
        Type: 'Notification',
        MessageId: 'sns-unknown-1',
        Message: JSON.stringify(complaintFor('no-reply@999.mail.witechagency.com'))
      })
    };
    const res = fakeRes();
    await handleSesEvent(req, res, {
      expectedToken: TOKEN,
      getDb: async () => ({ async get() { return undefined; } })
    });

    assert.equal(res.body, 'unknown domain');
    assert.equal(warnings.length, 1, 'the silent-miss path must leave a trace');
    assert.match(warnings[0], /999\.mail\.witechagency\.com/);
  } finally {
    console.warn = originalWarn;
  }
});

test('end to end: a complaint built from a real payload reaches the right tenant row', async () => {
  const looked = [];
  const inserted = [];
  const db = {
    async get(sql, ...params) {
      if (/FROM users WHERE send_subdomain/.test(sql)) {
        looked.push(params[0]);
        return params[0] === TENANT.send_subdomain ? { id: 7 } : undefined;
      }
      if (/FROM sending_events WHERE message_id/.test(sql)) return undefined;
      if (/COUNT\(\*\) FILTER/.test(sql)) return { complaints: 1, total: 1 };
      throw new Error(`unhandled get: ${sql}`);
    },
    async run(sql, ...params) {
      if (/INSERT INTO sending_events/.test(sql)) inserted.push(params);
      return { changes: 1 };
    }
  };

  const res = fakeRes();
  await handleSesEvent({
    query: { token: TOKEN },
    body: JSON.stringify({
      Type: 'Notification',
      MessageId: 'sns-real-1',
      Message: JSON.stringify(complaintFor(sentPayload().FromEmailAddress))
    })
  }, res, { expectedToken: TOKEN, getDb: async () => db });

  assert.deepEqual(looked, [TENANT.send_subdomain], 'looked the tenant up by its stored subdomain');
  assert.equal(res.body, 'recorded');
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0][0], 7, 'the event is attributed to user 7');
});
