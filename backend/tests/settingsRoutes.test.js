import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_SETTING_KEYS, filterSettingsPayload } from '../src/routes.js';

test('credential keys are not allowed', () => {
  for (const key of ['smtp_host', 'smtp_pass', 'twilio_account_sid', 'twilio_auth_token']) {
    assert.equal(ALLOWED_SETTING_KEYS.has(key), false, `${key} must not be writable`);
  }
});

test('filterSettingsPayload now rejects everything, branding included', () => {
  const { accepted, rejected } = filterSettingsPayload({
    company_name: 'Acme',
    smtp_pass: 'hunter2'
  });
  assert.deepEqual(accepted, {});
  assert.deepEqual(rejected.sort(), ['company_name', 'smtp_pass']);
});

test('filterSettingsPayload on an empty payload yields nothing', () => {
  const { accepted, rejected } = filterSettingsPayload({});
  assert.deepEqual(accepted, {});
  assert.deepEqual(rejected, []);
});
