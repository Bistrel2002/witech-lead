import pg from 'pg';

let dbInstance = null;
let pgPoolInstance = null;

// Database Adapter for PostgreSQL
class DatabaseAdapter {
  constructor(client, { reserved = false } = {}) {
    this.client = client;
    this.isPg = true; // Kept for backward compatibility checks
    // True when `client` is a single checked-out connection rather than a
    // pool, i.e. we are already inside a transaction.
    this.reserved = reserved;
  }

  _convertSql(sql) {
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
    const pgSql = this._convertSql(sql);
    const res = await this.client.query(pgSql, params);
    return res.rows[0];
  }

  async all(sql, ...params) {
    const pgSql = this._convertSql(sql);
    const res = await this.client.query(pgSql, params);
    return res.rows;
  }

  async run(sql, ...params) {
    let pgSql = this._convertSql(sql);
    const isInsert = /^\s*insert\s+/i.test(sql);
    const isSettings = /into\s+settings/i.test(pgSql);
    if (isInsert && !/returning\s+/i.test(pgSql) && !isSettings) {
      pgSql += ' RETURNING id';
    }
    const res = await this.client.query(pgSql, params);
    const lastID = (isInsert && res.rows[0] && !isSettings) ? res.rows[0].id : null;
    return { lastID, changes: res.rowCount };
  }

  async exec(sql) {
    await this.client.query(sql);
  }

  /**
   * Runs `fn` against an adapter bound to one reserved connection, wrapped in
   * BEGIN/COMMIT (ROLLBACK on throw).
   *
   * The reservation is the whole point: `pg.Pool.query()` checks out a
   * connection per call and returns it immediately, so issuing BEGIN, the
   * writes, and COMMIT as separate pool queries can spread them across
   * different backends — the BEGIN would isolate nothing and the writes would
   * each autocommit. Anything needing atomicity must go through here.
   */
  async transaction(fn) {
    if (this.reserved || typeof this.client.connect !== 'function') {
      // Already inside a transaction: join the caller's rather than nesting.
      return fn(this);
    }
    const client = await this.client.connect();
    const scoped = new DatabaseAdapter(client, { reserved: true });
    try {
      await client.query('BEGIN');
      const result = await fn(scoped);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Database: ROLLBACK failed:', rollbackError.message);
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function getDb() {
  if (dbInstance) return dbInstance;

  const dbUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/witech_crm';
  console.log("Database: Connecting to PostgreSQL...");
  if (!pgPoolInstance) {
    pgPoolInstance = new pg.Pool({
      connectionString: dbUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  dbInstance = new DatabaseAdapter(pgPoolInstance);
  
  // Initialize DB schema for Postgres
  await initPostgresDb(dbInstance);

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
    return new DatabaseAdapter(pool);
  }
  // Fall back to main db if not configured separately
  return await getDb();
}

/**
 * One-time backfill: copies the legacy global branding rows (company_name,
 * company_website, sender_signature — which used to live in `settings`)
 * onto the OLDEST user, then deletes those rows from `settings`.
 *
 * "Oldest user only" is the entire correctness condition. Those legacy
 * `settings` rows are one specific person's branding: whoever was using the
 * product back when branding was global — the first registered account.
 * Copying them onto every user with NULL branding would stamp that tenant's
 * signature, company name and website permanently onto every other tenant's
 * row, so every one of them would start mailing prospects under someone
 * else's identity. That is the exact cross-tenant leak this migration exists
 * to close, and doing it in a backfill would bake it into per-tenant data
 * where no later fix can distinguish it from a value the tenant chose. The
 * `user_id` backfill further down this file scopes itself the same way.
 *
 * The DELETE is not optional cleanup: `initPostgresDb` runs on every server
 * boot, not once. Without it, a customer who signs up between two boots
 * starts with NULL branding columns; on the next restart this backfill
 * would find the (never-deleted) legacy rows still in `settings` and
 * silently copy the *previous global tenant's* signature onto the new
 * user's NULL columns via the `WHERE ... IS NULL` match — reintroducing
 * the exact cross-tenant leak this task exists to fix. Deleting the legacy
 * rows once they're copied makes `legacyBranding` empty on every later
 * boot, so this whole function becomes a no-op forever after the first
 * run following this migration.
 */
export async function backfillLegacyBranding(db) {
  const legacyBranding = await db.all(
    "SELECT key, value FROM settings WHERE key IN ('company_name', 'company_website', 'sender_signature')"
  );
  if (legacyBranding.length === 0) return;

  const legacy = legacyBranding.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
  // Atomic: if the DELETE landed without the UPDATE the legacy branding would
  // be lost for good, and if the UPDATE landed without the DELETE the next
  // boot would replay the copy against whatever rows are NULL by then.
  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE users
         SET company_name     = COALESCE(company_name, ?),
             company_website  = COALESCE(company_website, ?),
             sender_signature = COALESCE(sender_signature, ?)
       WHERE id = (SELECT MIN(id) FROM users)
         AND (company_name IS NULL
              OR company_website IS NULL
              OR sender_signature IS NULL)`,
      legacy.company_name || null,
      legacy.company_website || null,
      legacy.sender_signature || null
    );

    // Retire the legacy rows so this function is a no-op on every future boot.
    await tx.run(
      "DELETE FROM settings WHERE key IN ('company_name', 'company_website', 'sender_signature')"
    );
  });
}

async function initPostgresDb(db) {
  // Create users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name VARCHAR(255),
      phone VARCHAR(50),
      role VARCHAR(50) DEFAULT 'user',
      google_id VARCHAR(255),
      apple_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Per-tenant branding. These were global settings rows until 2026-08;
  // sharing them across tenants leaked one customer's signature into another's
  // outbound campaigns.
  await db.exec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company_website TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sender_signature TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS send_subdomain TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS send_subdomain_status VARCHAR(20) DEFAULT 'pending';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sending_paused_at TIMESTAMP;
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
      social_handles TEXT,
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

  // Bounce/complaint feedback from SES, used to auto-pause abusive tenants.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sending_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      event_type VARCHAR(30) NOT NULL,
      recipient VARCHAR(255),
      sending_domain VARCHAR(255),
      message_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // SNS delivers at-least-once. message_id (SNS's own MessageId) lets the
  // webhook dedup a redelivered notification so a single genuine complaint
  // is never double-counted toward the auto-pause threshold. ADD COLUMN IF
  // NOT EXISTS migrates installs that created this table before message_id
  // existed.
  await db.exec(`
    ALTER TABLE sending_events ADD COLUMN IF NOT EXISTS message_id VARCHAR(255);
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sending_events_user ON sending_events(user_id, event_type);
  `);
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sending_events_message_id
      ON sending_events(message_id) WHERE message_id IS NOT NULL;
  `);

  // Opt-out suppressions. user_id NULL means global — set when a recipient
  // files a spam complaint, since an address that complains endangers the
  // reputation of the whole shared sending infrastructure.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS unsubscribes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      source VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Two partial indexes rather than one composite: in PostgreSQL NULL is not
  // equal to NULL, so a plain UNIQUE(user_id, email) would happily accept
  // unlimited duplicate global rows.
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unsubscribes_tenant
      ON unsubscribes(user_id, email) WHERE user_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unsubscribes_global
      ON unsubscribes(email) WHERE user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_unsubscribes_email ON unsubscribes(email);
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

  // Branding (company_name, company_website, sender_signature) used to be
  // seeded here as global settings rows. They now live on `users` (see
  // backfillLegacyBranding below) and ALLOWED_SETTING_KEYS in routes.js is
  // empty, so nothing may be written to or seeded into `settings` any more.

  // One-time cleanup: sending credentials used to live here and were readable
  // by every authenticated tenant. They are now platform-owned.
  // Keys are enumerated rather than matched with LIKE: in PostgreSQL the `_`
  // in 'smtp_%' is a single-character wildcard, so a pattern match here would
  // be both wider than intended and easy to misread.
  await db.run(
    `DELETE FROM settings WHERE key IN (
       'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_name',
       'twilio_account_sid', 'twilio_auth_token', 'twilio_phone_number', 'twilio_whatsapp_number'
     )`
  );

  await backfillLegacyBranding(db);

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

  // Migration: add phone column to users for PostgreSQL
  try {
    await db.exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)');
  } catch (_) {
    // Ignore if column already exists
  }

  // Migration: add user_id column to leads, templates, and campaigns for PostgreSQL
  const userIdColumns = [
    { table: 'leads', colDef: 'INTEGER REFERENCES users(id) ON DELETE CASCADE' },
    { table: 'templates', colDef: 'INTEGER REFERENCES users(id) ON DELETE CASCADE' },
    { table: 'campaigns', colDef: 'INTEGER REFERENCES users(id) ON DELETE CASCADE' }
  ];

  for (const m of userIdColumns) {
    try {
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
