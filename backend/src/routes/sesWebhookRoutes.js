import express from 'express';
import axios from 'axios';
import { getDb } from '../database/db.js';

const router = express.Router();

/** Complaint rate above which a tenant is paused, once past the sample floor. */
const COMPLAINT_RATE_THRESHOLD = 0.05;
const COMPLAINT_SAMPLE_FLOOR = 20;

export function parseSnsNotification(rawBody) {
  const envelope = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  return {
    type: envelope.Type,
    subscribeUrl: envelope.SubscribeURL || null,
    message: envelope.Message ? JSON.parse(envelope.Message) : null
  };
}

export function extractDeliveryEvent(message) {
  if (!message || !message.eventType) return null;
  const source = message.mail?.source;
  if (!source) return null;

  const sendingDomain = source.split('@')[1] || null;
  if (!sendingDomain) return null;

  if (message.eventType === 'Complaint') {
    return {
      eventType: 'Complaint',
      recipient: message.complaint?.complainedRecipients?.[0]?.emailAddress ?? null,
      sendingDomain
    };
  }
  if (message.eventType === 'Bounce') {
    return {
      eventType: 'Bounce',
      recipient: message.bounce?.bouncedRecipients?.[0]?.emailAddress ?? null,
      sendingDomain
    };
  }
  return null;
}

async function pauseIfComplaintRateExceeded(db, userId) {
  const counts = await db.get(
    `SELECT
       COUNT(*) FILTER (WHERE event_type = 'Complaint') AS complaints,
       COUNT(*) AS total
     FROM sending_events WHERE user_id = ?`,
    userId
  );
  const total = Number(counts?.total || 0);
  const complaints = Number(counts?.complaints || 0);
  if (total < COMPLAINT_SAMPLE_FLOOR) return;
  if (complaints / total < COMPLAINT_RATE_THRESHOLD) return;

  await db.run(
    'UPDATE users SET sending_paused_at = CURRENT_TIMESTAMP WHERE id = ? AND sending_paused_at IS NULL',
    userId
  );
  await db.run(
    "UPDATE campaigns SET status = 'Paused' WHERE user_id = ? AND status = 'Active'",
    userId
  );
  console.warn(`Sending: paused user ${userId} (${complaints}/${total} complaints)`);
}

router.post('/events', async (req, res) => {
  try {
    const parsed = parseSnsNotification(req.body);

    if (parsed.type === 'SubscriptionConfirmation' && parsed.subscribeUrl) {
      await axios.get(parsed.subscribeUrl);
      return res.status(200).send('subscription confirmed');
    }

    const event = extractDeliveryEvent(parsed.message);
    if (!event) return res.status(200).send('ignored');

    const db = await getDb();
    const user = await db.get('SELECT id FROM users WHERE send_subdomain = ?', event.sendingDomain);
    if (!user) return res.status(200).send('unknown domain');

    await db.run(
      'INSERT INTO sending_events (user_id, event_type, recipient, sending_domain) VALUES (?, ?, ?, ?)',
      user.id, event.eventType, event.recipient, event.sendingDomain
    );

    if (event.eventType === 'Complaint') {
      await pauseIfComplaintRateExceeded(db, user.id);
    }

    res.status(200).send('recorded');
  } catch (error) {
    console.error('SES webhook error:', error.message);
    // 200 regardless: SNS retries aggressively on non-2xx and we do not want a
    // poison message replayed forever.
    res.status(200).send('error logged');
  }
});

export default router;
