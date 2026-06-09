import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../../../database.sqlite');
let dbInstance = null;
let pgPoolInstance = null;

// Database Adapter to abstract SQLite vs PostgreSQL
class DatabaseAdapter {
  constructor(client, isPg = false) {
    this.client = client;
    this.isPg = isPg;
  }

  _convertSql(sql) {
    if (!this.isPg) return sql;

    let pgSql = sql;
    // Replace SQLite INSERT OR IGNORE / REPLACE with PostgreSQL ON CONFLICT
    if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+settings/i.test(pgSql)) {
      pgSql = pgSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO\s+settings\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i, 
        'INSERT INTO settings ($1) VALUES ($2) ON CONFLICT (key) DO NOTHING');
    } else if (/^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+settings/i.test(pgSql)) {
      pgSql = pgSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO\s+settings\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i, 
        'INSERT INTO settings ($1) VALUES ($2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value');
    }

    // Map ? to $1, $2, etc.
    let index = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${index++}`);
    return pgSql;
  }

  async get(sql, ...params) {
    if (this.isPg) {
      const pgSql = this._convertSql(sql);
      const res = await this.client.query(pgSql, params);
      return res.rows[0];
    } else {
      return this.client.get(sql, ...params);
    }
  }

  async all(sql, ...params) {
    if (this.isPg) {
      const pgSql = this._convertSql(sql);
      const res = await this.client.query(pgSql, params);
      return res.rows;
    } else {
      return this.client.all(sql, ...params);
    }
  }

  async run(sql, ...params) {
    if (this.isPg) {
      let pgSql = this._convertSql(sql);
      const isInsert = /^\s*insert\s+/i.test(sql);
      if (isInsert && !/returning\s+/i.test(pgSql)) {
        pgSql += ' RETURNING id';
      }
      const res = await this.client.query(pgSql, params);
      const lastID = (isInsert && res.rows[0]) ? res.rows[0].id : null;
      return { lastID, changes: res.rowCount };
    } else {
      return this.client.run(sql, ...params);
    }
  }

  async exec(sql) {
    if (this.isPg) {
      await this.client.query(sql);
    } else {
      await this.client.exec(sql);
    }
  }
}

export async function getDb() {
  if (dbInstance) return dbInstance;

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
    console.log("Database: Connecting to PostgreSQL...");
    if (!pgPoolInstance) {
      pgPoolInstance = new pg.Pool({
        connectionString: dbUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
    }
    dbInstance = new DatabaseAdapter(pgPoolInstance, true);
    
    // Initialize DB schema for Postgres
    await initPostgresDb(dbInstance);
  } else {
    console.log("Database: Connecting to local SQLite database...");
    const sqliteDb = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    dbInstance = new DatabaseAdapter(sqliteDb, false);
    await initSqliteDb(dbInstance);
  }

  return dbInstance;
}

// Separate database connector for the French business directory
export async function getFrenchDb() {
  const frenchDbUrl = process.env.FRENCH_DB_URL;
  if (frenchDbUrl && (frenchDbUrl.startsWith('postgres://') || frenchDbUrl.startsWith('postgresql://'))) {
    const pool = new pg.Pool({
      connectionString: frenchDbUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    return new DatabaseAdapter(pool, true);
  }
  // Fall back to main db if not configured separately
  return await getDb();
}

async function initSqliteDb(db) {
  // Create users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT,
      role TEXT DEFAULT 'user',
      google_id TEXT,
      apple_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create leads table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      website TEXT,
      phone TEXT,
      email TEXT,
      google_maps_url TEXT,
      status TEXT DEFAULT 'New',
      city TEXT,
      notes TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Migrate: add new columns to leads table
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
      user_id INTEGER,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create campaigns table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      template_id INTEGER,
      status TEXT DEFAULT 'Pending',
      total_leads INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      channel TEXT DEFAULT 'email',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(template_id) REFERENCES templates(id) ON DELETE SET NULL
    )
  `);

  // Ensure channel column exists in campaigns for SQLite (older databases)
  try {
    await db.exec(`ALTER TABLE campaigns ADD COLUMN channel TEXT DEFAULT 'email'`);
  } catch (_) {
    // Already exists
  }

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

  // Insert default settings
  const defaultSettings = [
    { key: 'smtp_host', value: '' },
    { key: 'smtp_port', value: '587' },
    { key: 'smtp_user', value: '' },
    { key: 'smtp_pass', value: '' },
    { key: 'smtp_from', value: '' },
    { key: 'smtp_name', value: "Wi'Tech Agency" },
    { key: 'company_name', value: "Wi'Tech Agency" },
    { key: 'company_website', value: 'https://www.witechagency.com' },
    { key: 'sender_signature', value: "Cordialement,\nL'équipe Wi'Tech Agency\nhttps://www.witechagency.com" },
    { key: 'twilio_account_sid', value: '' },
    { key: 'twilio_auth_token', value: '' },
    { key: 'twilio_phone_number', value: '' },
    { key: 'twilio_whatsapp_number', value: '' }
  ];

  for (const setting of defaultSettings) {
    await db.run(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      setting.key,
      setting.value
    );
  }

  // Seed default templates
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

  // Migration: add user_id column to leads, templates, and campaigns for SQLite
  const userIdColumns = [
    { table: 'leads', colDef: 'INTEGER REFERENCES users(id) ON DELETE CASCADE' },
    { table: 'templates', colDef: 'INTEGER REFERENCES users(id) ON DELETE CASCADE' },
    { table: 'campaigns', colDef: 'INTEGER REFERENCES users(id) ON DELETE CASCADE' }
  ];

  for (const m of userIdColumns) {
    try {
      await db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.colDef}`);
    } catch (_) {
      // Column already exists – ignore
    }
  }

  // Backfill existing NULL user_ids to the oldest registered user (admin)
  try {
    const oldestUser = await db.get('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    if (oldestUser && oldestUser.id) {
      await db.run('UPDATE leads SET user_id = ? WHERE user_id IS NULL', oldestUser.id);
      await db.run('UPDATE templates SET user_id = ? WHERE user_id IS NULL', oldestUser.id);
      await db.run('UPDATE campaigns SET user_id = ? WHERE user_id IS NULL', oldestUser.id);
    }
  } catch (err) {
    console.error('Error backfilling user_id for SQLite:', err);
  }
}

async function initPostgresDb(db) {
  // Create users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user',
      google_id VARCHAR(255),
      apple_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create leads table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      website VARCHAR(255),
      phone VARCHAR(50),
      email VARCHAR(255),
      google_maps_url TEXT,
      status VARCHAR(50) DEFAULT 'New',
      city VARCHAR(100),
      notes TEXT,
      rating REAL,
      review_count INTEGER DEFAULT 0,
      address TEXT,
      has_ssl INTEGER DEFAULT 0,
      is_mobile_friendly INTEGER DEFAULT 0,
      has_chat_widget INTEGER DEFAULT 0,
      social_handles TEXT,
      load_time_ms INTEGER,
      tech_stack VARCHAR(100),
      scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create templates table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create campaigns table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
      status VARCHAR(50) DEFAULT 'Pending',
      total_leads INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      channel VARCHAR(50) DEFAULT 'email',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create campaign_logs table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_logs (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      status VARCHAR(50),
      error_message TEXT,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create lead_discussions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS lead_discussions (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create settings table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT
    )
  `);

  // Create indexing for optimization
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
    CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(category);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign ON campaign_logs(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_lead_discussions_lead ON lead_discussions(lead_id);
  `);

  // Insert default settings
  const defaultSettings = [
    { key: 'smtp_host', value: '' },
    { key: 'smtp_port', value: '587' },
    { key: 'smtp_user', value: '' },
    { key: 'smtp_pass', value: '' },
    { key: 'smtp_from', value: '' },
    { key: 'smtp_name', value: "Wi'Tech Agency" },
    { key: 'company_name', value: "Wi'Tech Agency" },
    { key: 'company_website', value: 'https://www.witechagency.com' },
    { key: 'sender_signature', value: "Cordialement,\nL'équipe Wi'Tech Agency\nhttps://www.witechagency.com" },
    { key: 'twilio_account_sid', value: '' },
    { key: 'twilio_auth_token', value: '' },
    { key: 'twilio_phone_number', value: '' },
    { key: 'twilio_whatsapp_number', value: '' }
  ];

  for (const setting of defaultSettings) {
    const existing = await db.get('SELECT key FROM settings WHERE key = ?', setting.key);
    if (!existing) {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', setting.key, setting.value);
    }
  }

  // Seed default templates
  const templatesCount = await db.get('SELECT COUNT(*) as count FROM templates');
  if (Number(templatesCount.count) === 0) {
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

  // Migration: add user_id column to leads, templates, and campaigns for PostgreSQL
  const userIdColumns = [
    { table: 'leads', colDef: 'INTEGER REFERENCES users(id) ON DELETE CASCADE' },
    { table: 'templates', colDef: 'INTEGER REFERENCES users(id) ON DELETE CASCADE' },
    { table: 'campaigns', colDef: 'INTEGER REFERENCES users(id) ON DELETE CASCADE' }
  ];

  for (const m of userIdColumns) {
    try {
      // In PG we can use ADD COLUMN IF NOT EXISTS or catch the error
      await db.exec(`ALTER TABLE ${m.table} ADD COLUMN IF NOT EXISTS user_id ${m.colDef}`);
    } catch (_) {
      // Column already exists – ignore
    }
  }

  // Backfill existing NULL user_ids to the oldest registered user (admin) in PostgreSQL
  try {
    const oldestUser = await db.get('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    if (oldestUser && oldestUser.id) {
      await db.run('UPDATE leads SET user_id = $1 WHERE user_id IS NULL', oldestUser.id);
      await db.run('UPDATE templates SET user_id = $1 WHERE user_id IS NULL', oldestUser.id);
      await db.run('UPDATE campaigns SET user_id = $1 WHERE user_id IS NULL', oldestUser.id);
    }
  } catch (err) {
    console.error('Error backfilling user_id for PostgreSQL:', err);
  }
}
