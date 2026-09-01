import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import twilio from 'twilio';
import { getDb } from '../database/db.js';
import { getPlatformConfig } from '../config/platformConfig.js';
import { isSendable, BLOCK_REASONS, RECONTACT_COOLDOWN_DAYS, MAX_CONTACT_ATTEMPTS } from './outreachPolicy.js';
import { buildFromAddress } from './sendingDomainService.js';
import { buildUnsubscribeUrl, isSuppressed } from './unsubscribeService.js';

let sesClientInstance = null;

function getSesClient() {
  if (!sesClientInstance) {
    sesClientInstance = new SESv2Client({ region: getPlatformConfig().aws.region });
  }
  return sesClientInstance;
}

/**
 * Quotes are stripped rather than escaped: a display name is cosmetic, and
 * stripping is the one transformation that cannot produce a malformed header.
 */
function sanitizeDisplayName(name) {
  return String(name || "Wi'Tech Agency").replace(/["\\\r\n]/g, '');
}

export function buildEmailPayload({ user, prospect, subject, body, unsubscribeUrl }) {
  const cfg = getPlatformConfig();
  const simple = {
    Subject: { Data: subject, Charset: 'UTF-8' },
    Body: { Text: { Data: body, Charset: 'UTF-8' } }
  };
  if (unsubscribeUrl) {
    // Gmail and Outlook require both of these from bulk senders; the SESv2
    // Simple content shape supports Headers directly, so no raw MIME needed.
    simple.Headers = [
      { Name: 'List-Unsubscribe', Value: `<${unsubscribeUrl}>` },
      { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }
    ];
  }
  const payload = {
    FromEmailAddress: `"${sanitizeDisplayName(user.name)}" <${buildFromAddress(user.send_subdomain)}>`,
    ReplyToAddresses: [user.email],
    Destination: { ToAddresses: [prospect.email] },
    Content: { Simple: simple }
  };
  if (cfg.aws.sesConfigurationSet) {
    payload.ConfigurationSetName = cfg.aws.sesConfigurationSet;
  }
  return payload;
}

/**
 * SMS is built but deliberately switched off, product-wide.
 *
 * The shared Twilio Sender ID is alphanumeric and therefore one-way: it cannot
 * receive the `STOP` replies French law requires for marketing SMS. An SMS
 * campaign would consequently carry no unsubscribe link, no STOP keyword and
 * no route into the `unsubscribes` table — the one guarantee the whole opt-out
 * feature exists to make. The owner's decision (2026-08-06) is to launch
 * email-only and re-enable SMS once STOP handling exists, so the sending code
 * in `runCampaignBackground` and the Twilio config stay in place.
 *
 * Exported so the campaign-creation guard in routes.js refuses with exactly
 * the same sentence the send path would.
 */
export const SMS_UNAVAILABLE_MESSAGE =
  "Le canal SMS n'est pas encore disponible : il sera activé une fois la gestion des réponses STOP en place, comme l'exige la réglementation française. Utilisez l'e-mail pour le moment.";

/**
 * Throws with a customer-readable French message when this campaign must not
 * send. Pure: takes the joined campaign+user row, touches nothing else.
 */
export function assertChannelSendable(campaign, channel) {
  if (campaign.sending_paused_at) {
    throw new Error(
      "Envoi suspendu pour ce compte suite à un taux de plainte trop élevé. Contactez le support."
    );
  }
  if (channel === 'email') {
    if (!campaign.send_subdomain || campaign.send_subdomain_status !== 'verified') {
      throw new Error(
        "Votre domaine d'envoi n'est pas encore vérifié. Réessayez dans quelques minutes."
      );
    }
    return;
  }
  if (channel === 'sms') {
    // Defence in depth. Creation already refuses SMS, but a campaign created
    // before this guard existed must not resume sending either.
    throw new Error(SMS_UNAVAILABLE_MESSAGE);
  }
  throw new Error(`Canal non supporté : ${channel}.`);
}

/**
 * Compiles template by replacing merge tags
 */
export function compileTemplate(text, data) {
  if (!text) return '';
  let compiled = text;

  // Sender-side fallbacks must never name the operator. This text goes out
  // under the TENANT's name, from the TENANT's subdomain, to the TENANT's
  // prospects — so defaulting to "Wi'Tech Agency" / "L'équipe Wi'Tech" put
  // the platform operator's agency name inside a paying customer's outbound
  // mail, and did it precisely for the customers who had configured the
  // least. Derive the fallback from the tenant, or say nothing.
  const senderName = data.sender_name || '';
  const replacements = {
    company_name: data.company_name || 'votre entreprise',
    website: data.website || 'votre site internet',
    phone: data.phone || 'votre numéro',
    city: data.city || 'votre ville',
    sender_name: senderName,
    sender_phone: data.sender_phone || '',
    sender_signature: data.sender_signature || (senderName ? `Cordialement,\n${senderName}` : 'Cordialement,'),
    unsubscribe_link: data.unsubscribe_link || ''
  };

  Object.entries(replacements).forEach(([key, val]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
    compiled = compiled.replace(regex, val);
  });

  return compiled;
}

/**
 * The compliance backstop. A tenant editing a template — or writing one from
 * scratch — must not be able to send a message with no way out of the list, so
 * if the compiled body does not already carry the link we append it.
 */
export function appendUnsubscribeNotice(body, unsubscribeUrl) {
  if (!unsubscribeUrl) return body;
  if (body && body.includes(unsubscribeUrl)) return body;
  return `${body || ''}\n\n---\nPour vous désinscrire et ne plus recevoir de messages de notre part : ${unsubscribeUrl}`;
}

// Map to keep track of active background campaign runs
const activeCampaignRuns = new Set();

/**
 * Processes a campaign (Email or SMS) in the background sequentially with delay
 *
 * `deps` exists only so the send loop can be driven by a test: the compliance
 * backstop (suppression check before send, Skipped bookkeeping, unsubscribe
 * URL on every message) lives in here, and it was previously verifiable only
 * by reading. Production callers pass nothing and get the real database, the
 * real SES client and the real 5-second stagger.
 */
/* Lead statuses a campaign run is allowed to set, and from where.
 *
 * A campaign only ever moves a prospect forward from the two "not yet worked"
 * states. Re-running a campaign over a list that already contains a booked
 * meeting must not drag that prospect back to "Contacted" — the salesperson's
 * own progress outranks anything an automated send knows.
 */
const CAMPAIGN_MAY_OVERWRITE = new Set(['New', 'Call Only']);

async function advanceLeadStatus(db, leadId, nextStatus) {
  const lead = await db.get('SELECT status FROM leads WHERE id = ?', leadId);
  if (!lead) return false;
  if (!CAMPAIGN_MAY_OVERWRITE.has(lead.status)) return false;
  if (lead.status === nextStatus) return false;
  await db.run('UPDATE leads SET status = ? WHERE id = ?', nextStatus, leadId);
  return true;
}

/* One line in the prospect's exchange history, using the types the app's own
 * discussion panel offers (Note, Email, Call, WhatsApp, Meeting). */
async function recordDiscussion(db, leadId, type, content) {
  try {
    await db.run(
      'INSERT INTO lead_discussions (lead_id, type, content) VALUES (?, ?, ?)',
      leadId, type, content
    );
  } catch (err) {
    // History is a record of what happened, not a precondition for it. A
    // campaign must never abort because its journal write failed.
    console.error(`CampaignService: could not record history for lead ${leadId}:`, err.message);
  }
}

export async function runCampaignBackground(campaignId, deps = {}) {
  if (activeCampaignRuns.has(campaignId)) return;
  activeCampaignRuns.add(campaignId);

  const db = deps.db ?? await getDb();
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  try {
    // 1. Fetch Campaign, its Template, and its Owner
    const campaign = await db.get(
      `SELECT c.*, t.subject, t.body,
              u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
              u.sender_signature AS user_signature,
              u.send_subdomain, u.send_subdomain_status, u.sending_paused_at
       FROM campaigns c
       JOIN templates t ON c.template_id = t.id
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
      campaignId
    );

    if (!campaign) {
      throw new Error(`Campaign ID ${campaignId} not found`);
    }

    const channel = campaign.channel || 'email';
    console.log(`CampaignService: Starting campaign run for ID ${campaignId} on channel [${channel}]...`);

    assertChannelSendable(campaign, channel);

    // 3. Fetch prospects queued for this campaign
    const prospects = await db.all(`
      SELECT l.*, cl.id as log_id
      FROM campaign_logs cl
      JOIN leads l ON cl.lead_id = l.id
      WHERE cl.campaign_id = ? AND cl.status = 'Pending'
    `, campaignId);

    if (prospects.length === 0) {
      await db.run("UPDATE campaigns SET status = 'Completed' WHERE id = ?", campaignId);
      activeCampaignRuns.delete(campaignId);
      return;
    }

    // 4. Update campaign status to Active
    await db.run(
      'UPDATE campaigns SET status = \'Active\', total_leads = ? WHERE id = ?',
      prospects.length,
      campaignId
    );

    // Initialize clients
    const cfg = getPlatformConfig();
    const sesClient = deps.sesClient ?? getSesClient();
    const twilioClient = channel === 'sms'
      ? (deps.twilioClient ?? twilio(cfg.twilio.accountSid, cfg.twilio.authToken))
      : null;

    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const prospect of prospects) {
      // Check if campaign was canceled or paused
      const currentCampaignState = await db.get('SELECT status FROM campaigns WHERE id = ?', campaignId);
      if (currentCampaignState.status !== 'Active') {
        break; // Stop running
      }

      // Channel-specific lead field validation
      if (channel === 'email' && !prospect.email) {
        await db.run(
          "UPDATE campaign_logs SET status = 'Failed', error_message = 'No email address available' WHERE id = ?",
          prospect.log_id
        );

        // Unreachable by email is not the same as worthless. A prospect with a
        // phone number is still workable — it just needs a human — so it moves
        // to its own column instead of staying mixed in with the untouched
        // ones. With neither address nor number there is nothing left to try.
        if (prospect.phone) {
          await advanceLeadStatus(db, prospect.id, 'Call Only');
          await recordDiscussion(
            db,
            prospect.id,
            'Note',
            `Campagne « ${campaign.name} » — aucune adresse e-mail, à contacter par téléphone`
          );
        } else {
          await advanceLeadStatus(db, prospect.id, 'Closed Lost');
          await recordDiscussion(
            db,
            prospect.id,
            'Note',
            `Campagne « ${campaign.name} » — ni e-mail ni téléphone, prospect inexploitable`
          );
        }

        failedCount++;
        await db.run('UPDATE campaigns SET failed_count = ? WHERE id = ?', failedCount, campaignId);
        continue;
      }

      if (channel === 'sms' && !prospect.phone) {
        await db.run(
          "UPDATE campaign_logs SET status = 'Failed', error_message = 'No phone number available' WHERE id = ?",
          prospect.log_id
        );
        failedCount++;
        await db.run('UPDATE campaigns SET failed_count = ? WHERE id = ?', failedCount, campaignId);
        continue;
      }

      /* Re-contact policy, checked here and not only when the campaign was
       * built. A campaign can sit queued for days before it runs, and two
       * campaigns can be queued for the same prospect before either does, so
       * the filter at creation time is a courtesy and this is the guard.
       *
       * Skipped rather than Failed: declining to over-contact somebody is the
       * policy working, and counting it as a failure would make a
       * well-behaved tenant look broken in the health metrics. */
      if (channel === 'email') {
        const verdict = await isSendable(db, prospect.id);
        if (!verdict.ok) {
          const why = verdict.reason === BLOCK_REASONS.MAX_ATTEMPTS
            ? `Déjà contacté ${MAX_CONTACT_ATTEMPTS} fois`
            : `Recontact possible dans ${verdict.daysRemaining} j (délai ${RECONTACT_COOLDOWN_DAYS} j)`;
          await db.run(
            "UPDATE campaign_logs SET status = 'Skipped', error_message = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?",
            why,
            prospect.log_id
          );
          skippedCount++;
          await db.run('UPDATE campaigns SET skipped_count = ? WHERE id = ?', skippedCount, campaignId);
          continue;
        }
      }

      if (channel === 'email' && await isSuppressed(db, campaign.user_id, prospect.email)) {
        // Skipped, not Failed: honouring an opt-out is a correct outcome, and
        // counting it as a failure would corrupt the campaign health metrics
        // the operator uses to spot genuinely broken tenants.
        //
        // sent_at is set even though nothing was sent: it is the moment this
        // prospect was resolved. Left NULL, the row reads "En attente" in the
        // time column beside an "Ignoré" badge on the same line.
        await db.run(
          "UPDATE campaign_logs SET status = 'Skipped', error_message = 'Destinataire désinscrit', sent_at = CURRENT_TIMESTAMP WHERE id = ?",
          prospect.log_id
        );
        // Counted, because total_leads counts this prospect. A skip that
        // increments nothing leaves the campaign for ever showing
        // "7 / 10 cibles — 70%" with no account of the missing three, and the
        // customer concludes we silently dropped their emails.
        skippedCount++;
        await db.run(
          'UPDATE campaigns SET skipped_count = ? WHERE id = ?',
          skippedCount,
          campaignId
        );
        continue;
      }

      try {
        const unsubscribeUrl = channel === 'email'
          ? buildUnsubscribeUrl(campaign.user_id, prospect.email)
          : null;

        const templateData = {
          company_name: prospect.name,
          website: prospect.website,
          phone: prospect.phone,
          city: prospect.city,
          // Not the operator's name: see the fallback note in compileTemplate.
          sender_name: campaign.user_name || '',
          sender_phone: campaign.user_phone || '',
          sender_signature: campaign.user_signature || '',
          unsubscribe_link: unsubscribeUrl || ''
        };

        const subject = compileTemplate(campaign.subject, templateData);
        const compiledBody = compileTemplate(campaign.body, templateData);
        const body = channel === 'email'
          ? appendUnsubscribeNotice(compiledBody, unsubscribeUrl)
          : compiledBody;

        if (channel === 'email') {
          await sesClient.send(new SendEmailCommand(buildEmailPayload({
            user: {
              name: campaign.user_name,
              email: campaign.user_email,
              send_subdomain: campaign.send_subdomain
            },
            prospect,
            subject,
            body,
            unsubscribeUrl
          })));
        } else {
          await twilioClient.messages.create({
            body,
            from: cfg.twilio.senderId,
            to: prospect.phone
          });
        }

        // Log Success
        await db.run(
          "UPDATE campaign_logs SET status = 'Sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?",
          prospect.log_id
        );

        // prospect.lead_id was undefined here: the prospect row is
        // "SELECT l.*, cl.id AS log_id", which carries no lead_id column, so
        // every one of these updates matched nothing. 89 delivered emails had
        // left their prospect sitting on "New" before this was corrected.
        await advanceLeadStatus(db, prospect.id, 'Contacted');
        await recordDiscussion(
          db,
          prospect.id,
          'Email',
          `Campagne « ${campaign.name} » — e-mail envoyé à ${prospect.email}`
        );
        sentCount++;

      } catch (err) {
        console.error(`CampaignService: Error sending to lead ${prospect.name}:`, err.message);
        await db.run(
          "UPDATE campaign_logs SET status = 'Failed', error_message = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?",
          err.message,
          prospect.log_id
        );
        failedCount++;
      }

      // Update Campaign metrics
      await db.run(
        'UPDATE campaigns SET sent_count = ?, failed_count = ? WHERE id = ?',
        sentCount,
        failedCount,
        campaignId
      );

      // Delay between messages (5 seconds stagger queue)
      await sleep(5000);
    }

    // Complete campaign run
    const finalCampaignState = await db.get('SELECT status FROM campaigns WHERE id = ?', campaignId);
    if (finalCampaignState.status === 'Active') {
      await db.run("UPDATE campaigns SET status = 'Completed' WHERE id = ?", campaignId);
    }

  } catch (error) {
    console.error(`CampaignService: Fatal error in campaign ID ${campaignId}:`, error.message);
    await db.run("UPDATE campaigns SET status = 'Failed' WHERE id = ?", campaignId);
  } finally {
    activeCampaignRuns.delete(campaignId);
  }
}
