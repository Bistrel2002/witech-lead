import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_SETTING_KEYS, filterSettingsPayload } from '../src/routes.js';

test('credential keys are not allowed', () => {
  for (const key of ['smtp_host', 'smtp_pass', 'twilio_account_sid', 'twilio_auth_token']) {
    assert.equal(ALLOWED_SETTING_KEYS.has(key), false, `${key} must not be writable`);
  }
});

test('filterSettingsPayload drops unknown and credential keys', () => {
  const { accepted, rejected } = filterSettingsPayload({
    company_name: 'Acme',
    smtp_pass: 'hunter2',
    twilio_auth_token: 'secret',
    not_a_real_key: 'x'
  });
  assert.deepEqual(Object.keys(accepted), ['company_name']);
  assert.deepEqual(rejected.sort(), ['not_a_real_key', 'smtp_pass', 'twilio_auth_token']);
});

test('filterSettingsPayload coerces values to strings', () => {
  const { accepted } = filterSettingsPayload({ company_name: 42 });
  assert.strictEqual(accepted.company_name, '42');
});

test('filterSettingsPayload on an empty payload yields nothing', () => {
  const { accepted, rejected } = filterSettingsPayload({});
  assert.deepEqual(accepted, {});
  assert.deepEqual(rejected, []);
});
