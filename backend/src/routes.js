import express from 'express';
import { getDb } from './database/db.js';
import { scrapeWebsite, scrapeGoogleMapsFromLink } from './services/scraperService.js';
import { testSmtpConnection, runCampaignBackground } from './services/emailService.js';

const router = express.Router();

// Database-level deduplication cleanup helper
export async function eliminateDuplicates(db) {
  const beforeCount = await db.get('SELECT COUNT(*) as count FROM leads');
  await db.run(`
    DELETE FROM leads 
    WHERE id NOT IN (
      SELECT MIN(id) 
      FROM leads 
      GROUP BY name, category, COALESCE(website, ''), COALESCE(phone, ''), COALESCE(city, '')
    )
  `);
  const afterCount = await db.get('SELECT COUNT(*) as count FROM leads');
  return beforeCount.count - afterCount.count;
}

// ==========================================
// LEADS ENDPOINTS
// ==========================================

// Get all leads
router.get('/leads', async (req, res) => {
  try {
    const db = await getDb();
    const { category, city, status, hasEmail, hasWebsite } = req.query;
    
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (city) {
      query += ' AND city = ?';
      params.push(city);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (hasEmail === 'true') {
      query += " AND email IS NOT NULL AND email != ''";
    } else if (hasEmail === 'false') {
      query += " AND (email IS NULL OR email = '')";
    }
    if (hasWebsite === 'true') {
      query += " AND website IS NOT NULL AND website != ''";
    } else if (hasWebsite === 'false') {
      query += " AND (website IS NULL OR website = '')";
    }

    query += ' ORDER BY id DESC';
    const leads = await db.all(query, ...params);
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export leads as CSV
router.get('/leads/export/csv', async (req, res) => {
  try {
    const db = await getDb();
    const { category, city, status, hasEmail, hasWebsite } = req.query;

    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (city) {
      query += ' AND city = ?';
      params.push(city);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (hasEmail === 'true') {
      query += " AND email IS NOT NULL AND email != ''";
    } else if (hasEmail === 'false') {
      query += " AND (email IS NULL OR email = '')";
    }
    if (hasWebsite === 'true') {
      query += " AND website IS NOT NULL AND website != ''";
    } else if (hasWebsite === 'false') {
      query += " AND (website IS NULL OR website = '')";
    }

    query += ' ORDER BY id DESC';
    const leads = await db.all(query, ...params);

    // Build CSV
    const csvHeaders = 'Nom,Catégorie,Ville,Site Web,Email,Téléphone,Adresse,Note,Statut,SSL,Mobile';
    const escapeCSV = (val) => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    const csvRows = leads.map(l =>
      [
        escapeCSV(l.name),
        escapeCSV(l.category),
        escapeCSV(l.city),
        escapeCSV(l.website),
        escapeCSV(l.email),
        escapeCSV(l.phone),
        escapeCSV(l.address),
        escapeCSV(l.rating),
        escapeCSV(l.status),
        l.has_ssl ? 'Oui' : 'Non',
        l.is_mobile_friendly ? 'Oui' : 'Non'
      ].join(',')
    );

    const csvContent = csvHeaders + '\n' + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads_export.csv"');
    res.send('\uFEFF' + csvContent); // BOM for Excel UTF-8 compat
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create lead
router.post('/leads', async (req, res) => {
  const { name, category, website, phone, email, google_maps_url, city, notes, rating, review_count, address, has_ssl, is_mobile_friendly, has_chat_widget, social_handles, load_time_ms, tech_stack } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'Name and Category are required' });
  }

  try {
    const db = await getDb();

    // Check duplicate before manual creation
    const existing = await db.get(
      `SELECT id FROM leads 
       WHERE name = ? AND category = ? AND (city = ? OR website = ?)`,
      name,
      category,
      city || null,
      website || null
    );
    if (existing) {
      return res.status(400).json({ error: 'Ce prospect existe déjà dans la base de données.' });
    }

    const result = await db.run(
      `INSERT INTO leads (name, category, website, phone, email, google_maps_url, city, notes, rating, review_count, address, has_ssl, is_mobile_friendly, has_chat_widget, social_handles, load_time_ms, tech_stack) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      name, category, website, phone, email, google_maps_url, city, notes, rating || null, review_count || 0, address || null, has_ssl || 0, is_mobile_friendly || 0, has_chat_widget || 0, social_handles || null, load_time_ms || null, tech_stack || null
    );
    const newLead = await db.get('SELECT * FROM leads WHERE id = ?', result.lastID);
    res.status(201).json(newLead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update lead
router.put('/leads/:id', async (req, res) => {
  const { id } = req.params;
  const { name, category, website, phone, email, status, city, notes, rating, review_count, address, has_ssl, is_mobile_friendly, has_chat_widget, social_handles, load_time_ms, tech_stack } = req.body;

  try {
    const db = await getDb();
    await db.run(
      `UPDATE leads 
       SET name = ?, category = ?, website = ?, phone = ?, email = ?, status = ?, city = ?, notes = ?,
           rating = ?, review_count = ?, address = ?, has_ssl = ?, is_mobile_friendly = ?,
           has_chat_widget = ?, social_handles = ?, load_time_ms = ?, tech_stack = ?
       WHERE id = ?`,
      name, category, website, phone, email, status, city, notes, rating, review_count, address, has_ssl, is_mobile_friendly, has_chat_widget, social_handles, load_time_ms, tech_stack, id
    );
    const updatedLead = await db.get('SELECT * FROM leads WHERE id = ?', id);
    res.json(updatedLead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete lead
router.delete('/leads/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    await db.run('DELETE FROM leads WHERE id = ?', id);
    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk Import Google Maps / Simulated Search Leads / Custom File Leads
router.post('/leads/import', async (req, res) => {
  const { customLeads } = req.body;

  try {
    const db = await getDb();
    let leadsToInsert = [];

    if (customLeads && Array.isArray(customLeads)) {
      leadsToInsert = customLeads;
    } else {
      return res.status(400).json({ error: 'Please upload custom leads' });
    }

    const insertedLeads = [];
    let skippedCount = 0;

    for (const lead of leadsToInsert) {
      if (!lead.name || !lead.category) continue; // Skip malformed rows

      // Strict duplicate checking: skip if a lead with same name + category + (city OR website) exists
      const existing = await db.get(
        `SELECT id FROM leads 
         WHERE name = ? AND category = ? AND (city = ? OR website = ?)`,
        lead.name,
        lead.category,
        lead.city || null,
        lead.website || null
      );

      if (existing) {
        skippedCount++;
        continue;
      }

      // Format social handles if it's an object
      let socialHandlesVal = lead.social_handles;
      if (socialHandlesVal && typeof socialHandlesVal === 'object') {
        socialHandlesVal = JSON.stringify(socialHandlesVal);
      }

      const result = await db.run(
        `INSERT INTO leads (
          name, category, website, phone, email, google_maps_url, city, notes, status,
          rating, review_count, address, has_ssl, is_mobile_friendly, has_chat_widget,
          social_handles, load_time_ms, tech_stack
        ) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        lead.name,
        lead.category,
        lead.website || null,
        lead.phone || null,
        lead.email || null,
        lead.google_maps_url || null,
        lead.city || null,
        lead.notes || null,
        lead.status || 'New',
        lead.rating !== undefined ? lead.rating : null,
        lead.review_count !== undefined ? lead.review_count : 0,
        lead.address || null,
        lead.has_ssl !== undefined ? lead.has_ssl : 0,
        lead.is_mobile_friendly !== undefined ? lead.is_mobile_friendly : 0,
        lead.has_chat_widget !== undefined ? lead.has_chat_widget : 0,
        socialHandlesVal || null,
        lead.load_time_ms !== undefined ? lead.load_time_ms : null,
        lead.tech_stack || null
      );
      
      const newLead = await db.get('SELECT * FROM leads WHERE id = ?', result.lastID);
      insertedLeads.push(newLead);
    }

    // Trigger automatic database deduplication cleanup to ensure zero duplicates exist
    const finalCleanCount = await eliminateDuplicates(db);
    
    res.status(201).json({ 
      message: `Successfully imported ${insertedLeads.length} leads.`, 
      insertedCount: insertedLeads.length - finalCleanCount,
      skippedCount: skippedCount + finalCleanCount,
      leads: insertedLeads 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Scrape and import from Google Maps Link directly, filtering out non-website and categorizing
router.post('/leads/scrape-maps-link', async (req, res) => {
  const { mapsUrl } = req.body;
  if (!mapsUrl) {
    return res.status(400).json({ error: 'Un lien Google Maps est requis' });
  }

  try {
    const db = await getDb();
    const { category, city, leads } = await scrapeGoogleMapsFromLink(mapsUrl);

    if (leads.length === 0) {
      return res.status(400).json({ error: "Aucun établissement n'a été trouvé dans cette zone." });
    }

    const insertedLeads = [];
    for (const lead of leads) {
      // Direct duplicate check to avoid inserting duplicates if they run multiple times
      const existing = await db.get('SELECT id FROM leads WHERE name = ? AND category = ? AND city = ?', lead.name, lead.category, lead.city);
      if (existing) continue;

      const result = await db.run(
        `INSERT INTO leads (name, category, website, phone, email, google_maps_url, city, notes, status, rating, review_count, address) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        lead.name, lead.category, lead.website, lead.phone, lead.email, lead.google_maps_url, lead.city, lead.notes, 'New', lead.rating || null, lead.review_count || 0, lead.address || null
      );
      const newLead = await db.get('SELECT * FROM leads WHERE id = ?', result.lastID);
      insertedLeads.push(newLead);
    }

    // Trigger automatic database deduplication cleanup to ensure zero duplicates exist
    await eliminateDuplicates(db);

    res.status(201).json({
      message: `Scraping réussi : ${insertedLeads.length} prospects importés dans la catégorie "${category}"`,
      category,
      city,
      leads: insertedLeads
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cleanup duplicate leads from database
router.post('/leads/cleanup', async (req, res) => {
  try {
    const db = await getDb();
    const deletedCount = await eliminateDuplicates(db);
    res.json({ 
      success: true, 
      deletedCount, 
      message: `${deletedCount} doublons ont été supprimés avec succès.` 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Scrape website emails for a single lead
router.post('/leads/:id/scrape', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    const lead = await db.get('SELECT * FROM leads WHERE id = ?', id);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (!lead.website) {
      return res.status(400).json({ error: 'Lead has no website to scrape' });
    }

    // Trigger website email finder crawler
    const scrapedData = await scrapeWebsite(lead.website);

    if (scrapedData.error) {
      return res.status(400).json({ error: scrapedData.error });
    }

    // Prepare note with crawler log
    const crawlerLog = `\n[System Crawler Log ${new Date().toLocaleDateString()}]: Crawled pages: ${scrapedData.pagesCrawled.join(', ')}.`;
    const newNotes = (lead.notes || '') + crawlerLog;

    // Update lead in SQLite with enrichment data
    await db.run(
      `UPDATE leads 
       SET email = COALESCE(?, email), 
           phone = COALESCE(?, phone),
           notes = ?,
           has_ssl = ?,
           social_handles = COALESCE(?, social_handles),
           has_chat_widget = ?,
           tech_stack = COALESCE(?, tech_stack),
           load_time_ms = ?
       WHERE id = ?`,
      scrapedData.email,
      scrapedData.phone,
      newNotes,
      scrapedData.has_ssl,
      scrapedData.social_handles,
      scrapedData.has_chat_widget,
      scrapedData.tech_stack,
      scrapedData.load_time_ms,
      id
    );

    const updatedLead = await db.get('SELECT * FROM leads WHERE id = ?', id);
    res.json({ message: 'Scrape complete', lead: updatedLead, crawlerDetails: scrapedData });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// TEMPLATES ENDPOINTS
// ==========================================

router.get('/templates', async (req, res) => {
  try {
    const db = await getDb();
    const templates = await db.all('SELECT * FROM templates ORDER BY id DESC');
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/templates', async (req, res) => {
  const { name, subject, body } = req.body;
  if (!name || !subject || !body) {
    return res.status(400).json({ error: 'Name, Subject, and Body are required' });
  }
  try {
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO templates (name, subject, body) VALUES (?, ?, ?)',
      name, subject, body
    );
    const newTemplate = await db.get('SELECT * FROM templates WHERE id = ?', result.lastID);
    res.status(201).json(newTemplate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/templates/:id', async (req, res) => {
  const { id } = req.params;
  const { name, subject, body } = req.body;
  try {
    const db = await getDb();
    await db.run(
      'UPDATE templates SET name = ?, subject = ?, body = ? WHERE id = ?',
      name, subject, body, id
    );
    const updated = await db.get('SELECT * FROM templates WHERE id = ?', id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/templates/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    await db.run('DELETE FROM templates WHERE id = ?', id);
    res.json({ message: 'Template deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// CAMPAIGNS ENDPOINTS
// ==========================================

// Get campaigns with template summaries
router.get('/campaigns', async (req, res) => {
  try {
    const db = await getDb();
    const campaigns = await db.all(`
      SELECT c.*, t.name as template_name 
      FROM campaigns c 
      LEFT JOIN templates t ON c.template_id = t.id 
      ORDER BY c.id DESC
    `);
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create campaign and queue leads
router.post('/campaigns', async (req, res) => {
  const { name, template_id, category, lead_ids } = req.body;
  if (!name || !template_id) {
    return res.status(400).json({ error: 'Campaign name and template_id are required' });
  }

  try {
    const db = await getDb();
    
    // Determine target prospects
    let targets = [];
    if (lead_ids && Array.isArray(lead_ids)) {
      targets = await db.all(
        `SELECT id FROM leads WHERE id IN (${lead_ids.map(() => '?').join(',')})`,
        ...lead_ids
      );
    } else if (category) {
      targets = await db.all('SELECT id FROM leads WHERE category = ?', category);
    } else {
      return res.status(400).json({ error: 'Must provide either lead_ids or a category' });
    }

    if (targets.length === 0) {
      return res.status(400).json({ error: 'No matching leads found for this campaign' });
    }

    // Insert Campaign
    const result = await db.run(
      'INSERT INTO campaigns (name, template_id, total_leads) VALUES (?, ?, ?)',
      name, template_id, targets.length
    );
    const campaignId = result.lastID;

    // Queue Leads into logs
    for (const lead of targets) {
      await db.run(
        "INSERT INTO campaign_logs (campaign_id, lead_id, status) VALUES (?, ?, 'Pending')",
        campaignId, lead.id
      );
    }

    const newCampaign = await db.get('SELECT * FROM campaigns WHERE id = ?', campaignId);
    res.status(201).json(newCampaign);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get campaign details with outreach logs
router.get('/campaigns/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    const campaign = await db.get(`
      SELECT c.*, t.name as template_name 
      FROM campaigns c 
      LEFT JOIN templates t ON c.template_id = t.id 
      WHERE c.id = ?
    `, id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const logs = await db.all(`
      SELECT cl.*, l.name as lead_name, l.email as lead_email 
      FROM campaign_logs cl
      JOIN leads l ON cl.lead_id = l.id
      WHERE cl.campaign_id = ?
      ORDER BY cl.id ASC
    `, id);

    res.json({ campaign, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start campaign processing in background
router.post('/campaigns/:id/start', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    const campaign = await db.get('SELECT * FROM campaigns WHERE id = ?', id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Update status to Active
    await db.run('UPDATE campaigns SET status = "Active" WHERE id = ?', id);
    
    // Trigger in the background
    runCampaignBackground(parseInt(id));

    res.json({ message: 'Campaign started in background' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pause active campaign
router.post('/campaigns/:id/pause', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    await db.run('UPDATE campaigns SET status = "Paused" WHERE id = ?', id);
    res.json({ message: 'Campaign paused' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// SETTINGS ENDPOINTS
// ==========================================

// Get all settings
router.get('/settings', async (req, res) => {
  try {
    const db = await getDb();
    const settings = await db.all('SELECT * FROM settings');
    const settingsMap = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsMap);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings
router.post('/settings', async (req, res) => {
  const settingsData = req.body;
  try {
    const db = await getDb();
    for (const [key, value] of Object.entries(settingsData)) {
      await db.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        key, String(value)
      );
    }
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test SMTP connection credentials
router.post('/settings/test-smtp', async (req, res) => {
  const config = req.body;
  try {
    const result = await testSmtpConnection(config);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

// Nodemon reload trigger 2
