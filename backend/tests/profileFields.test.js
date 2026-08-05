import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_EDITABLE_FIELDS, pickProfileFields } from '../src/routes/authRoutes.js';

test('signature and branding are editable per user', () => {
  for (const field of ['company_name', 'company_website', 'sender_signature']) {
    assert.ok(PROFILE_EDITABLE_FIELDS.includes(field), `${field} should be editable`);
  }
});

test('privileged columns are not editable', () => {
  for (const field of ['role', 'id', 'password_hash', 'send_subdomain', 'send_subdomain_status']) {
    assert.equal(PROFILE_EDITABLE_FIELDS.includes(field), false, `${field} must not be editable`);
  }
});

test('pickProfileFields keeps only present editable keys', () => {
  const picked = pickProfileFields({
    name: 'Alice',
    role: 'admin',
    sender_signature: 'Cordialement',
    unknown: 1
  });
  assert.deepEqual(picked, { name: 'Alice', sender_signature: 'Cordialement' });
});

test('pickProfileFields preserves an explicit empty string', () => {
  assert.deepEqual(pickProfileFields({ sender_signature: '' }), { sender_signature: '' });
});
