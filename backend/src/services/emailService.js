import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import twilio from 'twilio';
import { getDb } from '../database/db.js';
import { getPlatformConfig } from '../config/platformConfig.js';
import { buildFromAddress } from './sendingDomainService.js';

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

export function buildEmailPayload({ user, prospect, subject, body }) {
  const cfg = getPlatformConfig();
  const payload = {
    FromEmailAddress: `"${sanitizeDisplayName(user.name)}" <${buildFromAddress(user.send_subdomain)}>`,
    ReplyToAddresses: [user.email],
    Destination: { ToAddresses: [prospect.email] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: body, Charset: 'UTF-8' } }
      }
    }
  };
  if (cfg.aws.sesConfigurationSet) {
    payload.ConfigurationSetName = cfg.aws.sesConfigurationSet;
  }
  return payload;
}

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
  if (channel !== 'sms') {
    throw new Error(`Canal non supporté : ${channel}.`);
  }
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
    sender_signature: data.sender_signature || (senderName ? `Cordialement,\n${senderName}` : 'Cordialement,')
  };

  Object.entries(replacements).forEach(([key, val]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
    compiled = compiled.replace(regex, val);
  });

  return compiled;
}

// Map to keep track of active background campaign runs
const activeCampaignRuns = new Set();

/**
 * Processes a campaign (Email or SMS) in the background sequentially with delay
 */
export async function runCampaignBackground(campaignId) {
  if (activeCampaignRuns.has(campaignId)) return;
  activeCampaignRuns.add(campaignId);

  const db = await getDb();

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
    const twilioClient = channel === 'sms'
      ? twilio(cfg.twilio.accountSid, cfg.twilio.authToken)
      : null;

    let sentCount = 0;
    let failedCount = 0;

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

      try {
        const templateData = {
          company_name: prospect.name,
          website: prospect.website,
          phone: prospect.phone,
          city: prospect.city,
          // Not the operator's name: see the fallback note in compileTemplate.
          sender_name: campaign.user_name || '',
          sender_phone: campaign.user_phone || '',
          sender_signature: campaign.user_signature || ''
        };

        const subject = compileTemplate(campaign.subject, templateData);
        const body = compileTemplate(campaign.body, templateData);

        if (channel === 'email') {
          await getSesClient().send(new SendEmailCommand(buildEmailPayload({
            user: {
              name: campaign.user_name,
              email: campaign.user_email,
              send_subdomain: campaign.send_subdomain
            },
            prospect,
            subject,
            body
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

        // Update Lead Status
        await db.run("UPDATE leads SET status = 'Contacted' WHERE id = ?", prospect.lead_id);
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
      await new Promise(resolve => setTimeout(resolve, 5000));
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
