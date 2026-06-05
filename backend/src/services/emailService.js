import nodemailer from 'nodemailer';
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
    secure: isSecure, // true for 465, false for other ports
    auth: {
      user: smtpConfig.smtp_user,
      pass: smtpConfig.smtp_pass
    },
    tls: {
      rejectUnauthorized: false // avoids issues with self-signed certificates
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
 * Compiles email body or subject by replacing merge tags
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

// Map to keep track of active background campaign runs so they can be monitored or managed
const activeCampaignRuns = new Set();

/**
 * Processes a campaign in the background sequentially with delay
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

    // 2. Fetch SMTP / Sender Settings
    const settingsList = await db.all('SELECT key, value FROM settings');
    const settings = settingsList.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    // Ensure SMTP configuration is set before attempting to run
    if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
      throw new Error('SMTP is not configured in settings. Cannot start campaign.');
    }

    // 3. Fetch prospects queued for this campaign
    // (Those that match the campaign criteria or are in logs as 'Pending')
    const prospects = await db.all(`
      SELECT l.*, cl.id as log_id 
      FROM campaign_logs cl 
      JOIN leads l ON cl.lead_id = l.id 
      WHERE cl.campaign_id = ? AND cl.status = 'Pending'
    `, campaignId);

    if (prospects.length === 0) {
      // Nothing to process, set campaign status to Completed
      await db.run(
        'UPDATE campaigns SET status = "Completed" WHERE id = ?',
        campaignId
      );
      activeCampaignRuns.delete(campaignId);
      return;
    }

    // 4. Update campaign status to Active
    await db.run(
      'UPDATE campaigns SET status = "Active", total_leads = ? WHERE id = ?',
      prospects.length,
      campaignId
    );

    const transporter = createTransport(settings);
    const fromAddress = settings.smtp_from || settings.smtp_user;
    const fromName = settings.smtp_name || "Wi'Tech Agency";

    let sentCount = 0;
    let failedCount = 0;

    for (const prospect of prospects) {
      // Check if campaign was canceled or paused in the DB
      const currentCampaignState = await db.get('SELECT status FROM campaigns WHERE id = ?', campaignId);
      if (currentCampaignState.status !== 'Active') {
        break; // Stop running
      }

      if (!prospect.email) {
        // Skip prospects without email and mark failed
        await db.run(
          "UPDATE campaign_logs SET status = 'Failed', error_message = 'No email address available' WHERE id = ?",
          prospect.log_id
        );
        failedCount++;
        await db.run(
          'UPDATE campaigns SET failed_count = ? WHERE id = ?',
          failedCount,
          campaignId
        );
        continue;
      }

      try {
        // Compile email content
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

        // Send Email
        await transporter.sendMail({
          from: `"${fromName}" <${fromAddress}>`,
          to: prospect.email,
          subject: subject,
          text: body
        });

        // Log Success
        await db.run(
          "UPDATE campaign_logs SET status = 'Sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?",
          prospect.log_id
        );

        // Update Lead Status
        await db.run(
          "UPDATE leads SET status = 'Contacted' WHERE id = ?",
          prospect.lead_id
        );

        sentCount++;
        
      } catch (err) {
        // Log Failure
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

      // Delay between emails (e.g., 5 seconds) to avoid spam filters
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Complete campaign run
    const finalCampaignState = await db.get('SELECT status FROM campaigns WHERE id = ?', campaignId);
    if (finalCampaignState.status === 'Active') {
      await db.run(
        'UPDATE campaigns SET status = "Completed" WHERE id = ?',
        campaignId
      );
    }

  } catch (error) {
    // Log fatal campaign error
    await db.run(
      'UPDATE campaigns SET status = "Failed" WHERE id = ?',
      campaignId
    );
  } finally {
    activeCampaignRuns.delete(campaignId);
  }
}
