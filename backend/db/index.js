const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const dbPath = path.isAbsolute(config.databasePath)
  ? config.databasePath
  : path.join(__dirname, '..', config.databasePath);

const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

function runSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
}

function migrate() {
  try {
    db.prepare('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0').run();
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS brand_applications (
      id TEXT PRIMARY KEY,
      company_name TEXT,
      contact_email TEXT NOT NULL,
      contact_name TEXT,
      notes TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const cols = [
    { name: 'brand_type', sql: 'ALTER TABLE brand_applications ADD COLUMN brand_type TEXT' },
    { name: 'platforms', sql: 'ALTER TABLE brand_applications ADD COLUMN platforms TEXT' },
    { name: 'budget', sql: 'ALTER TABLE brand_applications ADD COLUMN budget REAL' },
    { name: 'rpm', sql: 'ALTER TABLE brand_applications ADD COLUMN rpm REAL' },
    { name: 'other_specifications', sql: 'ALTER TABLE brand_applications ADD COLUMN other_specifications TEXT' }
  ];
  cols.forEach(({ name, sql }) => {
    try {
      db.prepare(sql).run();
    } catch (e) {
      if (!e.message.includes('duplicate column')) throw e;
    }
  });
  // Campaign owner (for creator-run campaigns)
  try {
    db.prepare('ALTER TABLE campaigns ADD COLUMN owner_id TEXT REFERENCES users(id)').run();
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
  // Self-serve campaign fields
  const campaignCols = [
    { sql: 'ALTER TABLE campaigns ADD COLUMN content_link TEXT' },
    { sql: 'ALTER TABLE campaigns ADD COLUMN platforms TEXT' },
    { sql: 'ALTER TABLE campaigns ADD COLUMN num_accounts INTEGER' },
    { sql: 'ALTER TABLE campaigns ADD COLUMN goal TEXT' },
    { sql: 'ALTER TABLE campaigns ADD COLUMN payment_schedule TEXT' },
    { sql: 'ALTER TABLE campaigns ADD COLUMN posts_per_day INTEGER DEFAULT 3' },
  ];
  campaignCols.forEach(({ sql }) => {
    try {
      db.prepare(sql).run();
    } catch (e) {
      if (!e.message.includes('duplicate column')) throw e;
    }
  });
  // Onboarding profile fields
  const userCols = [
    { sql: 'ALTER TABLE users ADD COLUMN first_name TEXT' },
    { sql: 'ALTER TABLE users ADD COLUMN last_name TEXT' },
    { sql: 'ALTER TABLE users ADD COLUMN position TEXT' },
  ];
  userCols.forEach(({ sql }) => {
    try {
      db.prepare(sql).run();
    } catch (e) {
      if (!e.message.includes('duplicate column')) throw e;
    }
  });
  // Payments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'usd',
      payment_method TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      stripe_payment_intent_id TEXT,
      stripe_checkout_session_id TEXT,
      paypal_order_id TEXT,
      paypal_capture_id TEXT,
      crypto_address TEXT,
      crypto_amount TEXT,
      crypto_currency TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      paid_at TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_payments_campaign ON payments(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
  `);
  // Campaign payment status
  try {
    db.prepare('ALTER TABLE campaigns ADD COLUMN payment_status TEXT DEFAULT "paid"').run();
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
  // Campaign started_at (when payment completed)
  try {
    db.prepare('ALTER TABLE campaigns ADD COLUMN started_at TEXT').run();
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
  // Admin alerts (notifications when users start campaigns)
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      title TEXT,
      message TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_admin_alerts_read ON admin_alerts(read);
    CREATE INDEX IF NOT EXISTS idx_admin_alerts_created ON admin_alerts(created_at);
  `);
  // Campaign accounts (accounts we create for a campaign - TikTok, IG handles, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_accounts (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      handle TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
    CREATE INDEX IF NOT EXISTS idx_campaign_accounts_campaign ON campaign_accounts(campaign_id);
  `);
  // Campaign posts (daily posts - admin inputs post URL and views)
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_posts (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      campaign_account_id TEXT,
      platform TEXT NOT NULL,
      post_url TEXT NOT NULL,
      views INTEGER DEFAULT 0,
      post_date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (campaign_account_id) REFERENCES campaign_accounts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_campaign_posts_campaign ON campaign_posts(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_posts_date ON campaign_posts(post_date);
  `);
}

function ensureSchema() {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (!table) runSchema();
  else migrate();
}

module.exports = { db, runSchema, ensureSchema };
