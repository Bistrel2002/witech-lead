import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import { buildEmailPayload, compileTemplate, assertChannelSendable, appendUnsubscribeNotice } from '../src/services/emailService.js';

test.beforeEach(() => {
  Object.assign(process.env, {
    AWS_REGION: 'eu-west-3',
    MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
    ROUTE53_HOSTED_ZONE_ID: 'Z1',
    TWILIO_ACCOUNT_SID: 'AC',
    TWILIO_AUTH_TOKEN: 't',
    TWILIO_SENDER_ID: 'WITECH',
    SES_WEBHOOK_TOKEN: 'test-webhook-token',
    UNSUBSCRIBE_SECRET: 'unsub-secret-test',
    PUBLIC_API_URL: 'https://api.example.com'
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

// --- Minor 12: no fallback may name the platform operator ------------------

test('a tenant with no signature falls back to their own name, not the operator', () => {
  // This mail leaves under the tenant's name and their own subdomain. Signing
  // it "L'équipe Wi'Tech" put the operator's agency into a paying customer's
  // outbound prospecting — and only ever for the customers who had configured
  // the least.
  const out = compileTemplate('{{sender_signature}}', {
    sender_name: 'Alice Martin',
    sender_signature: ''
  });
  assert.equal(out, 'Cordialement,\nAlice Martin');
});

test('a tenant with neither signature nor name gets a neutral sign-off', () => {
  const out = compileTemplate('{{sender_signature}}', {});
  assert.equal(out, 'Cordialement,');
});

test('no sender-side fallback ever mentions the operator', () => {
  const out = compileTemplate(
    '{{sender_name}}|{{sender_signature}}|{{sender_phone}}',
    { company_name: 'Plomberie Dupont' }
  );
  assert.doesNotMatch(out, /Wi'Tech/i);
});

test('an explicit signature is still used verbatim', () => {
  const out = compileTemplate('{{sender_signature}}', {
    sender_name: 'Alice Martin',
    sender_signature: "Bien à vous,\nAlice — Agence Alice"
  });
  assert.equal(out, "Bien à vous,\nAlice — Agence Alice");
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

test('compileTemplate substitutes the unsubscribe link', () => {
  const out = compileTemplate('Bonjour\n{{unsubscribe_link}}', {
    unsubscribe_link: 'https://api.example.com/unsubscribe/abc'
  });
  assert.equal(out, 'Bonjour\nhttps://api.example.com/unsubscribe/abc');
});

test('appendUnsubscribeNotice adds the link when the template omits it', () => {
  const out = appendUnsubscribeNotice('Bonjour', 'https://api.example.com/unsubscribe/abc');
  assert.ok(out.startsWith('Bonjour'));
  assert.ok(out.includes('https://api.example.com/unsubscribe/abc'));
  assert.ok(/désinscrire/i.test(out), 'notice should be French');
});

test('appendUnsubscribeNotice does not double-append', () => {
  const url = 'https://api.example.com/unsubscribe/abc';
  const already = `Bonjour\n\nPour ne plus recevoir: ${url}`;
  assert.equal(appendUnsubscribeNotice(already, url), already);
});

test('buildEmailPayload sets both List-Unsubscribe headers', () => {
  const payload = buildEmailPayload({
    user,
    prospect: { email: 'p@e.fr' },
    subject: 's',
    body: 'b',
    unsubscribeUrl: 'https://api.example.com/unsubscribe/abc'
  });
  const headers = payload.Content.Simple.Headers;
  const byName = Object.fromEntries(headers.map((h) => [h.Name, h.Value]));
  assert.equal(byName['List-Unsubscribe'], '<https://api.example.com/unsubscribe/abc>');
  assert.equal(byName['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
});

test('buildEmailPayload omits Headers when no unsubscribe URL is supplied', () => {
  const payload = buildEmailPayload({ user, prospect: { email: 'p@e.fr' }, subject: 's', body: 'b' });
  assert.equal(payload.Content.Simple.Headers, undefined);
});
