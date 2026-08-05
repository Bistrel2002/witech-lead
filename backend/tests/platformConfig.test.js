import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlatformConfig, resetPlatformConfigCache } from '../src/config/platformConfig.js';

const REQUIRED = {
  AWS_REGION: 'eu-west-3',
  MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'tokentest',
  TWILIO_SENDER_ID: 'WITECH',
  SES_WEBHOOK_TOKEN: 'webhook-secret-test-token'
};

function withEnv(overrides, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, REQUIRED, overrides);
  resetPlatformConfigCache();
  try {
    return fn();
  } finally {
    process.env = saved;
    resetPlatformConfigCache();
  }
}

test('returns the configured values', () => {
  withEnv({}, () => {
    const cfg = getPlatformConfig();
    assert.equal(cfg.aws.region, 'eu-west-3');
    assert.equal(cfg.mail.rootDomain, 'mail.witechagency.com');
    assert.equal(cfg.twilio.senderId, 'WITECH');
    assert.equal(cfg.webhook.token, 'webhook-secret-test-token');
  });
});

test('defaults the From local part to no-reply', () => {
  withEnv({}, () => {
    assert.equal(getPlatformConfig().mail.fromLocalPart, 'no-reply');
  });
});

test('sesConfigurationSet is null when unset', () => {
  withEnv({ SES_CONFIGURATION_SET: undefined }, () => {
    assert.equal(getPlatformConfig().aws.sesConfigurationSet, null);
  });
});

test('throws and names every missing variable', () => {
  withEnv({ AWS_REGION: undefined, TWILIO_AUTH_TOKEN: undefined }, () => {
    assert.throws(() => getPlatformConfig(), (err) => {
      assert.match(err.message, /AWS_REGION/);
      assert.match(err.message, /TWILIO_AUTH_TOKEN/);
      assert.doesNotMatch(err.message, /MAIL_ROOT_DOMAIN/);
      return true;
    });
  });
});

test('throws when SES_WEBHOOK_TOKEN is missing', () => {
  withEnv({ SES_WEBHOOK_TOKEN: undefined }, () => {
    assert.throws(() => getPlatformConfig(), /SES_WEBHOOK_TOKEN/);
  });
});

test('the returned object is frozen', () => {
  withEnv({}, () => {
    const cfg = getPlatformConfig();
    assert.throws(() => { cfg.mail.rootDomain = 'evil.com'; }, TypeError);
  });
});
