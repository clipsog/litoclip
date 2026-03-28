function run(sqlite) {
  try {
    sqlite.prepare('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0').run();
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS brand_applications (
      id TEXT PRIMARY KEY, company_name TEXT, contact_email TEXT NOT NULL, contact_name TEXT,
      notes TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  [
    'ALTER TABLE brand_applications ADD COLUMN brand_type TEXT',
    'ALTER TABLE brand_applications ADD COLUMN platforms TEXT',
    'ALTER TABLE brand_applications ADD COLUMN budget REAL',
    'ALTER TABLE brand_applications ADD COLUMN rpm REAL',
    'ALTER TABLE brand_applications ADD COLUMN other_specifications TEXT',
  ].forEach(sql => { try { sqlite.prepare(sql).run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; } });
  try { sqlite.prepare('ALTER TABLE campaigns ADD COLUMN owner_id TEXT REFERENCES users(id)').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  [
    'ALTER TABLE campaigns ADD COLUMN content_link TEXT',
    'ALTER TABLE campaigns ADD COLUMN platforms TEXT',
    'ALTER TABLE campaigns ADD COLUMN num_accounts INTEGER',
    'ALTER TABLE campaigns ADD COLUMN goal TEXT',
    'ALTER TABLE campaigns ADD COLUMN payment_schedule TEXT',
    'ALTER TABLE campaigns ADD COLUMN posts_per_day INTEGER DEFAULT 3',
  ].forEach(sql => { try { sqlite.prepare(sql).run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; } });
  [
    'ALTER TABLE users ADD COLUMN first_name TEXT',
    'ALTER TABLE users ADD COLUMN last_name TEXT',
    'ALTER TABLE users ADD COLUMN position TEXT',
  ].forEach(sql => { try { sqlite.prepare(sql).run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; } });
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, user_id TEXT NOT NULL, amount_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'usd', payment_method TEXT NOT NULL, status TEXT DEFAULT 'pending',
      stripe_payment_intent_id TEXT, stripe_checkout_session_id TEXT, paypal_order_id TEXT, paypal_capture_id TEXT,
      crypto_address TEXT, crypto_amount TEXT, crypto_currency TEXT, metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')), paid_at TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id), FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_payments_campaign ON payments(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
  `);
  try { sqlite.prepare('ALTER TABLE campaigns ADD COLUMN payment_status TEXT DEFAULT "paid"').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try { sqlite.prepare('ALTER TABLE campaigns ADD COLUMN started_at TEXT').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS admin_alerts (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      title TEXT, message TEXT, read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_admin_alerts_read ON admin_alerts(read);
    CREATE INDEX IF NOT EXISTS idx_admin_alerts_created ON admin_alerts(created_at);
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS campaign_accounts (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, platform TEXT NOT NULL, handle TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
    CREATE INDEX IF NOT EXISTS idx_campaign_accounts_campaign ON campaign_accounts(campaign_id);
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS campaign_posts (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, campaign_account_id TEXT, platform TEXT NOT NULL,
      post_url TEXT NOT NULL, views INTEGER DEFAULT 0, post_date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id), FOREIGN KEY (campaign_account_id) REFERENCES campaign_accounts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_campaign_posts_campaign ON campaign_posts(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_posts_date ON campaign_posts(post_date);
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sponsor_wallets (
      user_id TEXT PRIMARY KEY, balance_cents INTEGER DEFAULT 0, total_deposited_cents INTEGER DEFAULT 0,
      total_spent_cents INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS sponsor_deposits (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, status TEXT DEFAULT 'pending',
      stripe_payment_id TEXT, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS sponsor_offers (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, watermark_text TEXT NOT NULL,
      cpm_cents INTEGER NOT NULL, budget_cents INTEGER NOT NULL, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS sponsor_deals (
      id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, campaign_id TEXT NOT NULL, status TEXT DEFAULT 'active',
      budget_reserved_cents INTEGER NOT NULL, spent_cents INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (offer_id) REFERENCES sponsor_offers(id), FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
    CREATE INDEX IF NOT EXISTS idx_sponsor_deals_campaign ON sponsor_deals(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_sponsor_deals_offer ON sponsor_deals(offer_id);
  `);
  try { sqlite.prepare('ALTER TABLE campaigns ADD COLUMN accept_sponsor_offers INTEGER DEFAULT 0').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try { sqlite.prepare('ALTER TABLE campaigns ADD COLUMN allow_watermark INTEGER DEFAULT 0').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try { sqlite.prepare('ALTER TABLE campaigns ADD COLUMN watermark_coupon_percent REAL DEFAULT 0').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try { sqlite.prepare('ALTER TABLE campaign_posts ADD COLUMN sponsor_deal_id TEXT REFERENCES sponsor_deals(id)').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try { sqlite.prepare('ALTER TABLE campaign_posts ADD COLUMN views_sponsor_credited INTEGER DEFAULT 0').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try { sqlite.prepare('ALTER TABLE sponsor_wallets ADD COLUMN watermark_image_mime TEXT').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try { sqlite.prepare('ALTER TABLE sponsor_wallets ADD COLUMN watermark_image_updated_at TEXT').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try { sqlite.prepare('ALTER TABLE users ADD COLUMN creator_content_types TEXT').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try { sqlite.prepare('ALTER TABLE users ADD COLUMN creator_niche_tags TEXT').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try { sqlite.prepare('ALTER TABLE campaigns ADD COLUMN content_types TEXT').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try { sqlite.prepare('ALTER TABLE campaigns ADD COLUMN niche_tags TEXT').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try { sqlite.prepare('ALTER TABLE users ADD COLUMN user_roles TEXT').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
  try {
    const need = sqlite.prepare(`SELECT id, user_type FROM users WHERE user_roles IS NULL OR TRIM(COALESCE(user_roles, '')) = ''`).all();
    need.forEach((u) => {
      const t = u.user_type && ['creator', 'brand', 'sponsor'].includes(u.user_type) ? u.user_type : 'creator';
      sqlite.prepare('UPDATE users SET user_roles = ? WHERE id = ?').run(JSON.stringify([t]), u.id);
    });
  } catch (e) { /* ignore */ }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS campaign_drafts (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      title TEXT,
      payload TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_campaign_drafts_owner ON campaign_drafts(owner_id);
  `);
  try { sqlite.prepare('ALTER TABLE campaigns ADD COLUMN content_bank TEXT').run(); } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
}

module.exports = { run };
