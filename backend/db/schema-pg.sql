-- PostgreSQL schema for LitoClips (Supabase-compatible)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT NOT NULL,
  user_type TEXT NOT NULL DEFAULT 'creator',
  is_admin INTEGER DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_by TEXT REFERENCES users(id),
  first_name TEXT,
  last_name TEXT,
  user_position TEXT,
  creator_content_types TEXT,
  creator_niche_tags TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brand_applications (
  id TEXT PRIMARY KEY,
  company_name TEXT,
  contact_email TEXT NOT NULL,
  contact_name TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  brand_type TEXT,
  platforms TEXT,
  budget REAL,
  rpm REAL,
  other_specifications TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  niche TEXT,
  platform TEXT,
  budget REAL DEFAULT 0,
  rpm REAL DEFAULT 0,
  status TEXT DEFAULT 'active',
  cover_image TEXT,
  owner_id TEXT REFERENCES users(id),
  content_link TEXT,
  platforms TEXT,
  num_accounts INTEGER,
  goal TEXT,
  payment_schedule TEXT,
  posts_per_day INTEGER DEFAULT 3,
  payment_status TEXT DEFAULT 'paid',
  started_at TIMESTAMPTZ,
  accept_sponsor_offers INTEGER DEFAULT 0,
  allow_watermark INTEGER DEFAULT 0,
  watermark_coupon_percent REAL DEFAULT 0,
  content_types TEXT,
  niche_tags TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_joins (
  user_id TEXT NOT NULL REFERENCES users(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  platform TEXT NOT NULL,
  post_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  earnings REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_balances (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  available_balance REAL DEFAULT 0,
  pending_balance REAL DEFAULT 0,
  total_earnings REAL DEFAULT 0,
  total_paid REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payout_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_details TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  verification_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gamification (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  payload TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  email_notifications INTEGER DEFAULT 1,
  push_notifications INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES users(id),
  referred_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  user_id TEXT NOT NULL REFERENCES users(id),
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT,
  message TEXT,
  read INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_accounts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_posts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  campaign_account_id TEXT REFERENCES campaign_accounts(id),
  platform TEXT NOT NULL,
  post_url TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  post_date DATE NOT NULL,
  sponsor_deal_id TEXT,
  views_sponsor_credited INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sponsor_wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  balance_cents INTEGER DEFAULT 0,
  total_deposited_cents INTEGER DEFAULT 0,
  total_spent_cents INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  watermark_image_mime TEXT,
  watermark_image_updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sponsor_deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sponsor_offers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  watermark_text TEXT NOT NULL,
  cpm_cents INTEGER NOT NULL,
  budget_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sponsor_deals (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES sponsor_offers(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  status TEXT DEFAULT 'active',
  budget_reserved_cents INTEGER NOT NULL,
  spent_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_drafts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_campaign ON submissions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_campaign_joins_user ON campaign_joins(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_user ON social_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_campaign ON payments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_read ON admin_alerts(read);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_created ON admin_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_campaign_accounts_campaign ON campaign_accounts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_posts_campaign ON campaign_posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_posts_date ON campaign_posts(post_date);
CREATE INDEX IF NOT EXISTS idx_sponsor_deals_campaign ON sponsor_deals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_deals_offer ON sponsor_deals(offer_id);
CREATE INDEX IF NOT EXISTS idx_campaign_drafts_owner ON campaign_drafts(owner_id);
