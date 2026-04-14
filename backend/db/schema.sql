-- Users (user_type: creator | brand; is_admin: 1 = platform admin)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT NOT NULL,
  user_type TEXT NOT NULL DEFAULT 'creator',
  user_roles TEXT,
  is_admin INTEGER DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  terms_accepted_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (referred_by) REFERENCES users(id)
);

-- Brand applications (from your form / manual entry; admin reviews)
CREATE TABLE IF NOT EXISTS brand_applications (
  id TEXT PRIMARY KEY,
  company_name TEXT,
  contact_email TEXT NOT NULL,
  contact_name TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Campaigns (brand campaigns creators can join)
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
  created_at TEXT DEFAULT (datetime('now'))
);

-- Creator joins a campaign
CREATE TABLE IF NOT EXISTS campaign_joins (
  user_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, campaign_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- Submissions (creator posts for a campaign)
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  post_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  earnings REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- Wallet balance per user
CREATE TABLE IF NOT EXISTS wallet_balances (
  user_id TEXT PRIMARY KEY,
  available_balance REAL DEFAULT 0,
  pending_balance REAL DEFAULT 0,
  total_earnings REAL DEFAULT 0,
  total_paid REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Payout requests
CREATE TABLE IF NOT EXISTS payout_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_details TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Social accounts (TikTok, YouTube, Instagram, X)
CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  verification_code TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Gamification: level, xp, streak
CREATE TABLE IF NOT EXISTS gamification (
  user_id TEXT PRIMARY KEY,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Achievements
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  unlocked_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  payload TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- User notification preferences
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id TEXT PRIMARY KEY,
  email_notifications INTEGER DEFAULT 1,
  push_notifications INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Affiliate commissions
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL,
  referred_id TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (referrer_id) REFERENCES users(id),
  FOREIGN KEY (referred_id) REFERENCES users(id)
);

-- Brand "save for later" wizard drafts (per user, not localStorage)
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_campaign ON submissions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_campaign_joins_user ON campaign_joins(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_user ON social_accounts(user_id);
