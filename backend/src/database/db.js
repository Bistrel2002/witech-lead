import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../../../database.sqlite');

let dbInstance = null;

export async function getDb() {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await initDb(dbInstance);
  return dbInstance;
}

async function initDb(db) {
  // Create leads table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      website TEXT,
      phone TEXT,
      email TEXT,
      google_maps_url TEXT,
      status TEXT DEFAULT 'New',
      city TEXT,
      notes TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate: add new columns to leads table (SQLite safe – errors if column already exists)
  const newColumns = [
    'rating REAL',
    'review_count INTEGER DEFAULT 0',
    'address TEXT',
    'has_ssl INTEGER DEFAULT 0',
    'is_mobile_friendly INTEGER DEFAULT 0',
    'has_chat_widget INTEGER DEFAULT 0',
    'social_handles TEXT',
    'load_time_ms INTEGER',
    'tech_stack TEXT'
  ];

  for (const colDef of newColumns) {
    try {
      await db.exec(`ALTER TABLE leads ADD COLUMN ${colDef}`);
    } catch (_) {
      // Column already exists – ignore
    }
  }

  // Create templates table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create campaigns table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      template_id INTEGER,
      status TEXT DEFAULT 'Pending',
      total_leads INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(template_id) REFERENCES templates(id)
    )
  `);

  // Create campaign_logs table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      lead_id INTEGER,
      status TEXT,
      error_message TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY(lead_id) REFERENCES leads(id)
    )
  `);

  // Create lead_discussions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS lead_discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(lead_id) REFERENCES leads(id)
    )
  `);

  // Create settings table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Insert default settings if they don't exist
  const defaultSettings = [
    { key: 'smtp_host', value: '' },
    { key: 'smtp_port', value: '587' },
    { key: 'smtp_user', value: '' },
    { key: 'smtp_pass', value: '' },
    { key: 'smtp_from', value: '' },
    { key: 'smtp_name', value: "Wi'Tech Agency" },
    { key: 'company_name', value: "Wi'Tech Agency" },
    { key: 'company_website', value: 'https://www.witechagency.com' },
    { key: 'sender_signature', value: "Cordialement,\nL'équipe Wi'Tech Agency\nhttps://www.witechagency.com" }
  ];

  for (const setting of defaultSettings) {
    await db.run(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      setting.key,
      setting.value
    );
  }

  // Seed default templates if empty
  const templatesCount = await db.get('SELECT COUNT(*) as count FROM templates');
  if (templatesCount.count === 0) {
    await db.run(
      'INSERT INTO templates (name, subject, body) VALUES (?, ?, ?)',
      "Wi'Tech - Proposition d'Accompagnement Web",
      "Optimisation de votre visibilité web - {{company_name}}",
      "Bonjour {{company_name}},\n\nJe me permets de vous contacter après avoir visité votre site web ({{website}}).\n\nChez Wi'Tech Agency, nous accompagnons les entreprises dans la création de sites web modernes, ultra-performants et l'automatisation de leurs processus internes pour booster leur productivité.\n\nEn analysant rapidement votre présence en ligne, nous avons identifié des opportunités d'amélioration qui pourraient vous aider à attirer plus de clients directement depuis Google.\n\nSeriez-vous disponible pour un court appel de 10 minutes cette semaine afin d'en discuter ?\n\nExcellente journée,\n\n{{sender_signature}}"
    );
    
    await db.run(
      'INSERT INTO templates (name, subject, body) VALUES (?, ?, ?)',
      "Wi'Tech - Automatisation de vos processus (n8n)",
      "Gagnez 10h par semaine sur vos tâches répétitives - {{company_name}}",
      "Bonjour {{company_name}},\n\nJe suis tombé sur votre entreprise et je me demandais comment vous gériez actuellement vos flux de données et vos tâches administratives quotidiennes.\n\nWi'Tech est spécialisée dans l'automatisation des processus métiers à l'aide d'outils performants comme n8n et Power Automate. Nous aidons les professionnels à connecter leurs outils (CRM, emails, facturation) pour éliminer les tâches manuelles répétitives.\n\nSi vous souhaitez libérer du temps pour votre cœur de métier, nous pouvons réaliser un audit gratuit de vos processus.\n\nRépondez simplement à cet email pour planifier un échange.\n\nCordialement,\n\n{{sender_signature}}"
    );
  }
}
