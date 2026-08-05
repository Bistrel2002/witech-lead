import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import { buildEmailPayload, compileTemplate, assertChannelSendable } from '../src/services/emailService.js';

test.beforeEach(() => {
  Object.assign(process.env, {
    AWS_REGION: 'eu-west-3',
    MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
    ROUTE53_HOSTED_ZONE_ID: 'Z1',
    TWILIO_ACCOUNT_SID: 'AC',
    TWILIO_AUTH_TOKEN: 't',
    TWILIO_SENDER_ID: 'WITECH'
  });
  resetPlatformConfigCache();
});

const user = {
  name: 'Alice Martin',
  email: 'alice@agence-alice.fr',
  send_subdomain: '7.mail.witechagency.com'
};

test('From uses the tenant subdomain, Reply-To the real inbox', () => {
  const payload = buildEmailPayload({
    user,
    prospect: { email: 'prospect@exemple.fr' },
    subject: 'Bonjour',
    body: 'Texte'
  });
  assert.equal(payload.FromEmailAddress, '"Alice Martin" <no-reply@7.mail.witechagency.com>');
  assert.deepEqual(payload.ReplyToAddresses, ['alice@agence-alice.fr']);
  assert.deepEqual(payload.Destination.ToAddresses, ['prospect@exemple.fr']);
});

test('subject and body land in the SES simple content shape', () => {
  const payload = buildEmailPayload({
    user,
    prospect: { email: 'p@e.fr' },
    subject: 'Sujet',
    body: 'Corps'
  });
  assert.equal(payload.Content.Simple.Subject.Data, 'Sujet');
  assert.equal(payload.Content.Simple.Body.Text.Data, 'Corps');
});

test('a double quote in the display name cannot break the From header', () => {
  const payload = buildEmailPayload({
    user: { ...user, name: 'Ali"ce' },
    prospect: { email: 'p@e.fr' },
    subject: 's',
    body: 'b'
  });
  assert.equal(payload.FromEmailAddress, '"Alice" <no-reply@7.mail.witechagency.com>');
});

test('compileTemplate substitutes the sender signature', () => {
  const out = compileTemplate('Bonjour {{company_name}}\n{{sender_signature}}', {
    company_name: 'Plomberie Dupont',
    sender_signature: 'Cordialement, Alice'
  });
  assert.equal(out, 'Bonjour Plomberie Dupont\nCordialement, Alice');
});

const verified = { send_subdomain: '7.mail.witechagency.com', send_subdomain_status: 'verified', sending_paused_at: null };

test('a verified tenant may send email', () => {
  assert.doesNotThrow(() => assertChannelSendable(verified, 'email'));
});

test('an unverified tenant is blocked with a readable message', () => {
  assert.throws(
    () => assertChannelSendable({ ...verified, send_subdomain_status: 'pending' }, 'email'),
    /pas encore vérifié/
  );
});

test('a tenant with no subdomain at all is blocked', () => {
  assert.throws(
    () => assertChannelSendable({ ...verified, send_subdomain: null }, 'email'),
    /pas encore vérifié/
  );
});

test('a paused tenant is blocked on every channel', () => {
  const paused = { ...verified, sending_paused_at: '2026-08-05T10:00:00Z' };
  assert.throws(() => assertChannelSendable(paused, 'email'), /suspendu/);
  assert.throws(() => assertChannelSendable(paused, 'sms'), /suspendu/);
});

test('sms does not require a verified email domain', () => {
  assert.doesNotThrow(() => assertChannelSendable({ sending_paused_at: null }, 'sms'));
});

test('whatsapp is rejected as unsupported', () => {
  assert.throws(() => assertChannelSendable({ sending_paused_at: null }, 'whatsapp'), /non supporté/);
});
