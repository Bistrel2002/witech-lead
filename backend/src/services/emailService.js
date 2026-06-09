import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { getDb } from '../database/db.js';

/**
 * Creates a Nodemailer transport from SMTP configurations
 */
function createTransport(smtpConfig) {
  const port = parseInt(smtpConfig.smtp_port) || 587;
  const isSecure = port === 465;

  return nodemailer.createTransport({
    host: smtpConfig.smtp_host,
    port: port,
    secure: isSecure,
    auth: {
      user: smtpConfig.smtp_user,
      pass: smtpConfig.smtp_pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Tests connection with SMTP settings
 */
export async function testSmtpConnection(config) {
  try {
    if (!config.smtp_host || !config.smtp_user || !config.smtp_pass) {
      throw new Error('SMTP host, user, and password are required');
    }
    const transporter = createTransport(config);
    await transporter.verify();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Compiles template by replacing merge tags
 */
export function compileTemplate(text, data) {
  if (!text) return '';
  let compiled = text;
  
  const replacements = {
    company_name: data.company_name || 'votre entreprise',
    website: data.website || 'votre site internet',
    phone: data.phone || 'votre numéro',
    city: data.city || 'votre ville',
    sender_name: data.sender_name || "Wi'Tech Agency",
    sender_signature: data.sender_signature || "Cordialement,\nL'équipe Wi'Tech"
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
 * Processes a campaign (Email, SMS, or WhatsApp) in the background sequentially with delay
 */
export async function runCampaignBackground(campaignId) {
  if (activeCampaignRuns.has(campaignId)) return;
  activeCampaignRuns.add(campaignId);

  const db = await getDb();
  
  try {
    // 1. Fetch Campaign and its Template
    const campaign = await db.get(
      'SELECT c.*, t.subject, t.body FROM campaigns c JOIN templates t ON c.template_id = t.id WHERE c.id = ?',
      campaignId
    );

    if (!campaign) {
      throw new Error(`Campaign ID ${campaignId} not found`);
    }

    const channel = campaign.channel || 'email';
    console.log(`CampaignService: Starting campaign run for ID ${campaignId} on channel [${channel}]...`);

    // 2. Fetch Settings
    const settingsList = await db.all('SELECT key, value FROM settings');
    const settings = settingsList.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    // Validate channel configurations
    if (channel === 'email') {
      if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
        throw new Error('SMTP is not configured in settings. Cannot run email campaign.');
      }
    } else {
      if (!settings.twilio_account_sid || !settings.twilio_auth_token) {
        throw new Error('Twilio Account SID or Auth Token is missing in settings. Cannot run message campaign.');
      }
      if (channel === 'sms' && !settings.twilio_phone_number) {
        throw new Error('Twilio SMS Sender Phone Number is missing in settings.');
      }
      if (channel === 'whatsapp' && !settings.twilio_whatsapp_number) {
        throw new Error('Twilio WhatsApp Sender Phone Number is missing in settings.');
      }
    }

    // 3. Fetch prospects queued for this campaign
    const prospects = await db.all(`
      SELECT l.*, cl.id as log_id 
      FROM campaign_logs cl 
      JOIN leads l ON cl.lead_id = l.id 
      WHERE cl.campaign_id = ? AND cl.status = 'Pending'
    `, campaignId);

    if (prospects.length === 0) {
      await db.run('UPDATE campaigns SET status = "Completed" WHERE id = ?', campaignId);
      activeCampaignRuns.delete(campaignId);
      return;
    }

    // 4. Update campaign status to Active
    await db.run(
      'UPDATE campaigns SET status = "Active", total_leads = ? WHERE id = ?',
      prospects.length,
      campaignId
    );

    // Initialize clients
    let transporter = null;
    let twilioClient = null;

    if (channel === 'email') {
      transporter = createTransport(settings);
    } else {
      twilioClient = twilio(settings.twilio_account_sid, settings.twilio_auth_token);
    }

    const fromAddress = settings.smtp_from || settings.smtp_user;
    const fromName = settings.smtp_name || "Wi'Tech Agency";

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

      if ((channel === 'sms' || channel === 'whatsapp') && !prospect.phone) {
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
          sender_name: settings.smtp_name,
          sender_signature: settings.sender_signature
        };

        const subject = compileTemplate(campaign.subject, templateData);
        const body = compileTemplate(campaign.body, templateData);

        if (channel === 'email') {
          // Send Email
          await transporter.sendMail({
            from: `"${fromName}" <${fromAddress}>`,
            to: prospect.email,
            subject: subject,
            text: body
          });
        } else if (channel === 'sms') {
          // Send SMS
          await twilioClient.messages.create({
            body: body,
            from: settings.twilio_phone_number,
            to: prospect.phone
          });
        } else if (channel === 'whatsapp') {
          // Send WhatsApp (prepend whatsapp: prefix as required by Twilio)
          const cleanPhone = prospect.phone.replace(/\s+/g, '');
          const formattedTo = cleanPhone.startsWith('+') ? cleanPhone : `+33${cleanPhone.slice(1)}`;
          
          await twilioClient.messages.create({
            body: body,
            from: `whatsapp:${settings.twilio_whatsapp_number.trim()}`,
            to: `whatsapp:${formattedTo}`
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
      await db.run('UPDATE campaigns SET status = "Completed" WHERE id = ?', campaignId);
    }

  } catch (error) {
    console.error(`CampaignService: Fatal error in campaign ID ${campaignId}:`, error.message);
    await db.run('UPDATE campaigns SET status = "Failed" WHERE id = ?', campaignId);
  } finally {
    activeCampaignRuns.delete(campaignId);
  }
}
