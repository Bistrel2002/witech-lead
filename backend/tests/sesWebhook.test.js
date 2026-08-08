import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSnsNotification, extractDeliveryEvent } from '../src/routes/sesWebhookRoutes.js';

test('recognises a subscription confirmation', () => {
  const parsed = parseSnsNotification(JSON.stringify({
    Type: 'SubscriptionConfirmation',
    SubscribeURL: 'https://sns.example/confirm'
  }));
  assert.equal(parsed.type, 'SubscriptionConfirmation');
  assert.equal(parsed.subscribeUrl, 'https://sns.example/confirm');
});

test('unwraps the double-encoded SNS Message field', () => {
  const parsed = parseSnsNotification(JSON.stringify({
    Type: 'Notification',
    Message: JSON.stringify({ eventType: 'Complaint' })
  }));
  assert.equal(parsed.type, 'Notification');
  assert.equal(parsed.message.eventType, 'Complaint');
});

test('carries the SNS MessageId through for dedup', () => {
  const parsed = parseSnsNotification(JSON.stringify({
    Type: 'Notification',
    MessageId: 'sns-abc-123',
    Message: JSON.stringify({ eventType: 'Complaint' })
  }));
  assert.equal(parsed.messageId, 'sns-abc-123');
});

test('messageId is null when SNS does not supply one', () => {
  const parsed = parseSnsNotification(JSON.stringify({
    Type: 'Notification',
    Message: JSON.stringify({ eventType: 'Complaint' })
  }));
  assert.equal(parsed.messageId, null);
});

test('extracts a complaint with its recipient and sending domain', () => {
  const event = extractDeliveryEvent({
    eventType: 'Complaint',
    mail: { source: 'no-reply@7.mail.witechagency.com' },
    complaint: { complainedRecipients: [{ emailAddress: 'p@exemple.fr' }] }
  });
  assert.deepEqual(event, {
    eventType: 'Complaint',
    recipient: 'p@exemple.fr',
    sendingDomain: '7.mail.witechagency.com'
  });
});

test('extracts a bounce', () => {
  const event = extractDeliveryEvent({
    eventType: 'Bounce',
    mail: { source: 'no-reply@9.mail.witechagency.com' },
    bounce: { bouncedRecipients: [{ emailAddress: 'x@y.fr' }] }
  });
  assert.equal(event.eventType, 'Bounce');
  assert.equal(event.sendingDomain, '9.mail.witechagency.com');
});

test('ignores event types we do not act on', () => {
  assert.equal(extractDeliveryEvent({ eventType: 'Delivery', mail: { source: 'a@b.c' } }), null);
});

test('returns null rather than throwing on a malformed event', () => {
  assert.equal(extractDeliveryEvent({}), null);
  assert.equal(extractDeliveryEvent({ eventType: 'Bounce' }), null);
});
