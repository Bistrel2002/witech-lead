import express from 'express';
import { getDb, getFrenchDb } from './database/db.js';
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
      GROUP BY user_id, name, category, COALESCE(website, ''), COALESCE(phone, ''), COALESCE(city, '')
    )
  `);
  const afterCount = await db.get('SELECT COUNT(*) as count FROM leads');
  return beforeCount.count - afterCount.count;
}

// Helper for parsing CSV line correctly (respecting quotes, commas, semicolons)
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((c === ',' || c === ';') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

// Helper to ensure french_businesses table is provisioned
async function ensureFrenchBusinessesTable(db) {
  if (db.isPg) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS french_businesses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        city VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(255),
        website VARCHAR(255),
        address TEXT,
        rating REAL,
        review_count INTEGER DEFAULT 0
      )
    `);
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_french_biz_cat_city ON french_businesses(category, city);
    `);
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS french_businesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        city TEXT,
        phone TEXT,
        email TEXT,
        website TEXT,
        address TEXT,
        rating REAL,
        review_count INTEGER DEFAULT 0
      )
    `);
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_french_biz_cat_city ON french_businesses(category, city);
    `);
  }
}

// ==========================================
// LEADS ENDPOINTS
// ==========================================

// French Business Database Lookup
// French Business Database Lookup (handles GET for raw searches and POST for importing/mapping leads)
router.all('/leads/french-db-lookup', async (req, res) => {
  const { category, city, saveToDb, campaignId, limit } = req.method === 'POST' ? req.body : req.query;
  const lim = parseInt(limit, 10) || 50;
  try {
    const fDb = await getFrenchDb();
    const db = await getDb();
    
    // Check if french_businesses table exists
    let hasTable = true;
    try {
      const check = await fDb.get(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'french_businesses')"
      );
      hasTable = check.exists;
    } catch (_) {
      hasTable = false;
    }

    if (!hasTable) {
      return res.json(req.method === 'POST' ? { message: "La base de données nationale est vide.", leads: [] } : []);
    }

    let query = 'SELECT * FROM french_businesses WHERE 1=1';
    const params = [];

    if (category) {
      query += ' AND category ILIKE ?';
      params.push(`%${category}%`);
    }
    if (city) {
      query += ' AND city ILIKE ?';
      params.push(`%${city}%`);
    }

    query += ` LIMIT ${lim}`;

    const businesses = await fDb.all(query, ...params);
    
    // If it's a GET request, return raw businesses directly
    if (req.method === 'GET') {
      return res.json(businesses);
    }

    // If POST, process CRM insertion & campaign linking
    const processedLeads = [];
    for (const biz of businesses) {
      let targetLead = await db.get(
        'SELECT * FROM leads WHERE name = ? AND category = ? AND (city = ? OR website = ?) AND user_id = ?', 
        biz.name, biz.category, biz.city || null, biz.website || null, req.user.id
      );

      // Save to main DB if requested or linking to campaign
      if (!targetLead && (saveToDb !== false || campaignId)) {
        const insertRes = await db.run(
          `INSERT INTO leads (
            user_id, name, category, website, phone, email, google_maps_url, city, notes, status, 
            rating, review_count, address, social_handles
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          req.user.id, biz.name, biz.category, biz.website, biz.phone, biz.email, biz.google_maps_url, 
          biz.city, biz.notes || 'Prospect issu de la base nationale.', 'New', biz.rating || null, biz.review_count || 0, biz.address || null,
          biz.social_handles || '{}'
        );
        targetLead = await db.get('SELECT * FROM leads WHERE id = ?', insertRes.lastID);
      }

      if (targetLead) {
        processedLeads.push(targetLead);

        if (campaignId) {
          const alreadyLinked = await db.get(
            'SELECT id FROM campaign_logs WHERE campaign_id = ? AND lead_id = ?', 
            campaignId, targetLead.id
          );
          if (!alreadyLinked) {
            await db.run(
              'INSERT INTO campaign_logs (campaign_id, lead_id, status) VALUES (?, ?, ?)',
              campaignId, targetLead.id, 'Pending'
            );
            await db.run(
              'UPDATE campaigns SET total_leads = total_leads + 1 WHERE id = ?',
              campaignId
            );
          }
        }
      } else {
        // If not saving, return the raw business details
        processedLeads.push(biz);
      }
    }

    res.json({
      message: `Recherche nationale complétée : ${processedLeads.length} prospects identifiés.`,
      category,
      city,
      leads: processedLeads
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stream CSV Importer into French Business Database
router.post('/leads/french-db-import', async (req, res) => {
  try {
    const db = await getFrenchDb();
    await ensureFrenchBusinessesTable(db);

    let buffer = '';
    let headers = null;
    let batch = [];
    const BATCH_SIZE = 500;
    let totalImported = 0;

    const flushBatch = async () => {
      if (batch.length === 0) return;
      
      if (db.isPg) {
        let query = 'INSERT INTO french_businesses (name, category, city, phone, email, website, address, rating, review_count) VALUES ';
        const values = [];
        let index = 1;
        
        for (const row of batch) {
          query += `($${index}, $${index+1}, $${index+2}, $${index+3}, $${index+4}, $${index+5}, $${index+6}, $${index+7}, $${index+8}),`;
          values.push(
            row.name,
            row.category || null,
            row.city || null,
            row.phone || null,
            row.email || null,
            row.website || null,
            row.address || null,
            row.rating || null,
            row.review_count || 0
          );
          index += 9;
        }
        query = query.slice(0, -1);
        await db.client.query(query, values);
      } else {
        await db.exec('BEGIN TRANSACTION');
        for (const row of batch) {
          await db.run(
            `INSERT INTO french_businesses (name, category, city, phone, email, website, address, rating, review_count) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            row.name, row.category, row.city, row.phone, row.email, row.website, row.address, row.rating, row.review_count
          );
        }
        await db.exec('COMMIT');
      }
      
      totalImported += batch.length;
      batch = [];
    };

    req.on('data', async (chunk) => {
      req.pause();
      buffer += chunk.toString();
      let lines = buffer.split(/\r?\n/);
      buffer = lines.pop();

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        const columns = parseCsvLine(line);
        if (!headers) {
          headers = columns.map(h => h.toLowerCase());
          continue;
        }

        const rowData = {};
        headers.forEach((h, idx) => {
          rowData[h] = columns[idx] || '';
        });

        const name = rowData.name || rowData.nom || rowData.business_name || columns[0];
        if (!name) continue;

        const category = rowData.category || rowData.catégorie || rowData.sector || rowData.secteur || columns[1] || '';
        const city = rowData.city || rowData.ville || columns[2] || '';
        const phone = rowData.phone || rowData.téléphone || rowData.tel || columns[3] || '';
        const email = rowData.email || columns[4] || '';
        const website = rowData.website || rowData.site || rowData.site_web || columns[5] || '';
        const address = rowData.address || rowData.adresse || columns[6] || '';
        const rating = parseFloat(rowData.rating || rowData.note || columns[7] || 0);
        const review_count = parseInt(rowData.review_count || rowData.reviews || columns[8] || 0, 10);

        batch.push({ name, category, city, phone, email, website, address, rating, review_count });

        if (batch.length >= BATCH_SIZE) {
          try {
            await flushBatch();
          } catch (err) {
            console.error('Failed to flush batch:', err);
          }
        }
      }
      req.resume();
    });

    req.on('end', async () => {
      if (buffer.trim()) {
        const columns = parseCsvLine(buffer.trim());
        if (headers) {
          const rowData = {};
          headers.forEach((h, idx) => {
            rowData[h] = columns[idx] || '';
          });
          const name = rowData.name || rowData.nom || columns[0];
          if (name) {
            const category = rowData.category || rowData.catégorie || columns[1] || '';
            const city = rowData.city || rowData.ville || columns[2] || '';
            const phone = rowData.phone || rowData.téléphone || columns[3] || '';
            const email = rowData.email || columns[4] || '';
            const website = rowData.website || rowData.site || columns[5] || '';
            const address = rowData.address || rowData.adresse || columns[6] || '';
            const rating = parseFloat(rowData.rating || 0);
            const review_count = parseInt(rowData.review_count || 0, 10);
            batch.push({ name, category, city, phone, email, website, address, rating, review_count });
          }
        }
      }

      try {
        await flushBatch();
        res.json({ success: true, count: totalImported, message: `${totalImported} établissements importés avec succès.` });
      } catch (err) {
        res.status(500).json({ error: 'Erreur lors de la finalisation: ' + err.message });
      }
    });

    req.on('error', (err) => {
      res.status(500).json({ error: 'Erreur de flux: ' + err.message });
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all leads
router.get('/leads', async (req, res) => {
  try {
    const db = await getDb();
    const { category, city, status, hasEmail, hasWebsite } = req.query;
    
    let query = 'SELECT * FROM leads WHERE user_id = ?';
    const params = [req.user.id];

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

    let query = 'SELECT * FROM leads WHERE user_id = ?';
    const params = [req.user.id];

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
    const csvHeaders = 'Nom,Catégorie,Ville,Site Web,Email,Téléphone,Adresse,Note,Statut';
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
        escapeCSV(l.status)
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
  const { name, category, website, phone, email, google_maps_url, city, notes, rating, review_count, address, social_handles } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'Name and Category are required' });
  }

  try {
    const db = await getDb();

    // Check duplicate before manual creation for this specific user
    const existing = await db.get(
      `SELECT id FROM leads 
       WHERE name = ? AND category = ? AND (city = ? OR website = ?) AND user_id = ?`,
      name,
      category,
      city || null,
      website || null,
      req.user.id
    );
    if (existing) {
      return res.status(400).json({ error: 'Ce prospect existe déjà dans votre base de données.' });
    }

    const result = await db.run(
      `INSERT INTO leads (user_id, name, category, website, phone, email, google_maps_url, city, notes, rating, review_count, address, social_handles) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      req.user.id, name, category, website, phone, email, google_maps_url, city, notes, rating || null, review_count || 0, address || null, social_handles || null
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
  const { name, category, website, phone, email, status, city, notes, rating, review_count, address, social_handles } = req.body;

  try {
    const db = await getDb();
    
    // Verify lead ownership first
    const lead = await db.get('SELECT id FROM leads WHERE id = ? AND user_id = ?', id, req.user.id);
    if (!lead) {
      return res.status(404).json({ error: 'Prospect introuvable ou non autorisé.' });
    }

    await db.run(
      `UPDATE leads 
       SET name = ?, category = ?, website = ?, phone = ?, email = ?, status = ?, city = ?, notes = ?,
           rating = ?, review_count = ?, address = ?, social_handles = ?
       WHERE id = ? AND user_id = ?`,
      name, category, website, phone, email, status, city, notes, rating, review_count, address, social_handles, id, req.user.id
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
    
    // Verify lead ownership first
    const lead = await db.get('SELECT id FROM leads WHERE id = ? AND user_id = ?', id, req.user.id);
    if (!lead) {
      return res.status(404).json({ error: 'Prospect introuvable ou non autorisé.' });
    }

    // Delete associated discussions first to prevent orphaned records
    await db.run('DELETE FROM lead_discussions WHERE lead_id = ?', id);
    await db.run('DELETE FROM leads WHERE id = ? AND user_id = ?', id, req.user.id);
    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get discussions for a specific lead
router.get('/leads/:id/discussions', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();

    // Verify lead ownership first
    const lead = await db.get('SELECT id FROM leads WHERE id = ? AND user_id = ?', id, req.user.id);
    if (!lead) {
      return res.status(404).json({ error: 'Prospect introuvable ou non autorisé.' });
    }

    const discussions = await db.all('SELECT * FROM lead_discussions WHERE lead_id = ? ORDER BY created_at DESC', id);
    res.json(discussions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a discussion entry for a lead
router.post('/leads/:id/discussions', async (req, res) => {
  const { id } = req.params;
  const { type, content, created_at } = req.body;
  if (!type || !content) {
    return res.status(400).json({ error: 'Type and content are required' });
  }
  try {
    const db = await getDb();

    // Verify lead ownership first
    const lead = await db.get('SELECT id FROM leads WHERE id = ? AND user_id = ?', id, req.user.id);
    if (!lead) {
      return res.status(404).json({ error: 'Prospect introuvable ou non autorisé.' });
    }

    const result = await db.run(
      'INSERT INTO lead_discussions (lead_id, type, content, created_at) VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))',
      id, type, content, created_at || null
    );
    const newDiscussion = await db.get('SELECT * FROM lead_discussions WHERE id = ?', result.lastID);
    res.status(201).json(newDiscussion);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a specific discussion entry
router.delete('/leads/discussions/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();

    // Verify lead ownership of the discussion's parent lead first
    const discussion = await db.get(
      'SELECT d.id FROM lead_discussions d JOIN leads l ON d.lead_id = l.id WHERE d.id = ? AND l.user_id = ?',
      id, req.user.id
    );
    if (!discussion) {
      return res.status(404).json({ error: 'Note introuvable ou non autorisée.' });
    }

    await db.run('DELETE FROM lead_discussions WHERE id = ?', id);
    res.json({ message: 'Discussion entry deleted successfully' });
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

      // Strict duplicate checking: skip if a lead with same name + category + (city OR website) exists for this user
      const existing = await db.get(
        `SELECT id FROM leads 
         WHERE name = ? AND category = ? AND (city = ? OR website = ?) AND user_id = ?`,
        lead.name,
        lead.category,
        lead.city || null,
        lead.website || null,
        req.user.id
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
          user_id, name, category, website, phone, email, google_maps_url, city, notes, status,
          rating, review_count, address, social_handles
        ) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        req.user.id,
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
        socialHandlesVal || null
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
  const { mapsUrl, category, city, radius, saveToDb, campaignId, maxLeads } = req.body;
  if (!mapsUrl) {
    return res.status(400).json({ error: 'Un lien Google Maps est requis' });
  }

  try {
    const db = await getDb();
    const result = await scrapeGoogleMapsFromLink(mapsUrl, category, city, radius, maxLeads);
    const finalCategory = result.category;
    const finalCity = result.city;
    const leads = result.leads;

    if (leads.length === 0) {
      return res.status(400).json({ error: "Aucun établissement n'a été trouvé dans cette zone." });
    }

    const processedLeads = [];
    for (const lead of leads) {
      // 1. Check duplicate in local CRM db for this specific user
      let targetLead = await db.get(
        'SELECT * FROM leads WHERE name = ? AND category = ? AND (city = ? OR website = ?) AND user_id = ?', 
        lead.name, lead.category, lead.city || null, lead.website || null, req.user.id
      );

      // 2. Insert to DB if requested or if it doesn't exist and we need to link it to a campaign
      if (!targetLead && (saveToDb !== false || campaignId)) {
        const insertRes = await db.run(
          `INSERT INTO leads (
            user_id, name, category, website, phone, email, google_maps_url, city, notes, status, 
            rating, review_count, address, social_handles
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          req.user.id, lead.name, lead.category, lead.website, lead.phone, lead.email, lead.google_maps_url, 
          lead.city, lead.notes, 'New', lead.rating || null, lead.review_count || 0, lead.address || null,
          lead.social_handles || '{}'
        );
        targetLead = await db.get('SELECT * FROM leads WHERE id = ?', insertRes.lastID);
      }

      if (targetLead) {
        processedLeads.push(targetLead);

        // 3. Add to Campaign if requested
        if (campaignId) {
          // Check if already in campaign
          const alreadyLinked = await db.get(
            'SELECT id FROM campaign_logs WHERE campaign_id = ? AND lead_id = ?', 
            campaignId, targetLead.id
          );
          if (!alreadyLinked) {
            await db.run(
              'INSERT INTO campaign_logs (campaign_id, lead_id, status) VALUES (?, ?, ?)',
              campaignId, targetLead.id, 'Pending'
            );
            // Increment total leads in campaign
            await db.run(
              'UPDATE campaigns SET total_leads = total_leads + 1 WHERE id = ?',
              campaignId
            );
          }
        }
      } else {
        // If not saving to DB and not linking, return raw listing
        processedLeads.push(lead);
      }
    }

    // Trigger automatic database deduplication cleanup to ensure zero duplicates exist
    await eliminateDuplicates(db);

    res.status(201).json({
      message: `Scraping réussi : ${processedLeads.length} prospects traités dans la catégorie "${finalCategory}"`,
      category: finalCategory,
      city: finalCity,
      leads: processedLeads
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
    const lead = await db.get('SELECT * FROM leads WHERE id = ? AND user_id = ?', id, req.user.id);
    
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

    // Update lead in database with enrichment data
    await db.run(
      `UPDATE leads 
       SET email = COALESCE(?, email), 
           phone = COALESCE(?, phone),
           notes = ?,
           social_handles = COALESCE(?, social_handles)
       WHERE id = ? AND user_id = ?`,
      scrapedData.email,
      scrapedData.phone,
      newNotes,
      scrapedData.social_handles,
      id,
      req.user.id
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
    const templates = await db.all('SELECT * FROM templates WHERE user_id = ? ORDER BY id DESC', req.user.id);
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
      'INSERT INTO templates (user_id, name, subject, body) VALUES (?, ?, ?, ?)',
      req.user.id, name, subject, body
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
    
    // Verify template ownership first
    const template = await db.get('SELECT id FROM templates WHERE id = ? AND user_id = ?', id, req.user.id);
    if (!template) {
      return res.status(404).json({ error: 'Modèle introuvable ou non autorisé.' });
    }

    await db.run(
      'UPDATE templates SET name = ?, subject = ?, body = ? WHERE id = ? AND user_id = ?',
      name, subject, body, id, req.user.id
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

    // Verify template ownership first
    const template = await db.get('SELECT id FROM templates WHERE id = ? AND user_id = ?', id, req.user.id);
    if (!template) {
      return res.status(404).json({ error: 'Modèle introuvable ou non autorisé.' });
    }

    await db.run('DELETE FROM templates WHERE id = ? AND user_id = ?', id, req.user.id);
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
      WHERE c.user_id = ?
      ORDER BY c.id DESC
    `, req.user.id);
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create campaign and queue leads
router.post('/campaigns', async (req, res) => {
  const { name, template_id, category, lead_ids, channel } = req.body;
  if (!name || !template_id) {
    return res.status(400).json({ error: 'Campaign name and template_id are required' });
  }

  try {
    const db = await getDb();

    // Verify template ownership first
    const template = await db.get('SELECT id FROM templates WHERE id = ? AND user_id = ?', template_id, req.user.id);
    if (!template) {
      return res.status(404).json({ error: 'Modèle introuvable ou non autorisé.' });
    }
    
    // Determine target prospects belonging to this user
    let targets = [];
    if (lead_ids && Array.isArray(lead_ids)) {
      targets = await db.all(
        `SELECT id FROM leads WHERE id IN (${lead_ids.map(() => '?').join(',')}) AND user_id = ?`,
        ...lead_ids, req.user.id
      );
    } else if (category) {
      targets = await db.all('SELECT id FROM leads WHERE category = ? AND user_id = ?', category, req.user.id);
    } else {
      return res.status(400).json({ error: 'Must provide either lead_ids or a category' });
    }

    if (targets.length === 0) {
      return res.status(400).json({ error: 'No matching leads found for this campaign' });
    }

    // Insert Campaign
    const result = await db.run(
      'INSERT INTO campaigns (user_id, name, template_id, total_leads, channel) VALUES (?, ?, ?, ?, ?)',
      req.user.id, name, template_id, targets.length, channel || 'email'
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
      WHERE c.id = ? AND c.user_id = ?
    `, id, req.user.id);

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
    const campaign = await db.get('SELECT * FROM campaigns WHERE id = ? AND user_id = ?', id, req.user.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Update status to Active
    await db.run("UPDATE campaigns SET status = 'Active' WHERE id = ? AND user_id = ?", id, req.user.id);
    
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
    const campaign = await db.get('SELECT * FROM campaigns WHERE id = ? AND user_id = ?', id, req.user.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    await db.run("UPDATE campaigns SET status = 'Paused' WHERE id = ? AND user_id = ?", id, req.user.id);
    res.json({ message: 'Campaign paused' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restart/Retry failed or completed campaign
router.post('/campaigns/:id/restart', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    const campaign = await db.get('SELECT * FROM campaigns WHERE id = ? AND user_id = ?', id, req.user.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status === 'Completed') {
      // Restart completely from scratch
      await db.run(
        "UPDATE campaign_logs SET status = 'Pending', error_message = NULL WHERE campaign_id = ?",
        id
      );
      await db.run(
        "UPDATE campaigns SET status = 'Active', sent_count = 0, failed_count = 0 WHERE id = ? AND user_id = ?",
        id, req.user.id
      );
    } else {
      // Retry failed logs
      await db.run(
        "UPDATE campaign_logs SET status = 'Pending', error_message = NULL WHERE campaign_id = ? AND status = 'Failed'",
        id
      );
      await db.run(
        "UPDATE campaigns SET status = 'Active', failed_count = 0 WHERE id = ? AND user_id = ?",
        id, req.user.id
      );
    }

    // Trigger background process
    runCampaignBackground(parseInt(id));

    res.json({ message: 'Campaign restarted in background' });
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
