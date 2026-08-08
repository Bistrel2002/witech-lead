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

// Regression: AWS sends a human-readable sentence in `Message` on a
// SubscriptionConfirmation, not JSON. Parsing it unconditionally threw, the
// outer catch swallowed it, and the confirmation branch was never reached —
// so every real subscription stayed PendingConfirmation forever. Every
// previous fixture omitted `Message`, which no real SNS payload ever does.
test('a real SubscriptionConfirmation (non-JSON Message) parses instead of throwing', () => {
  const parsed = parseSnsNotification(JSON.stringify({
    Type: 'SubscriptionConfirmation',
    MessageId: 'abc-123',
    TopicArn: 'arn:aws:sns:eu-west-3:304970596241:witech-ses-events',
    Message: 'You have chosen to subscribe to the topic arn:aws:sns:eu-west-3:1:t.\nTo confirm the subscription, visit the SubscribeURL included in this message.',
    SubscribeURL: 'https://sns.eu-west-3.amazonaws.com/?Action=ConfirmSubscription&Token=xyz'
  }));
  assert.equal(parsed.type, 'SubscriptionConfirmation');
  assert.equal(parsed.subscribeUrl, 'https://sns.eu-west-3.amazonaws.com/?Action=ConfirmSubscription&Token=xyz');
  assert.equal(parsed.message, null, 'a non-JSON Message becomes null, it must not throw');
});

test('a Notification with a non-JSON Message does not throw either', () => {
  const parsed = parseSnsNotification(JSON.stringify({
    Type: 'Notification',
    Message: 'plain text, not json'
  }));
  assert.equal(parsed.message, null);
});
