const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// ---------- Users ----------
// GET /api/admin/users
router.get('/users', (req, res) => {
  const rows = db.prepare(`
    SELECT id, email, name, user_type, is_admin, referral_code, created_at
    FROM users ORDER BY created_at DESC
  `).all();
  res.json(rows.map(r => ({
    id: r.id,
    email: r.email,
    name: r.name,
    userType: r.user_type,
    isAdmin: !!r.is_admin,
    referralCode: r.referral_code,
    createdAt: r.created_at,
  })));
});

// ---------- Campaigns ----------
// GET /api/admin/campaigns
router.get('/campaigns', (req, res) => {
  const rows = db.prepare(`
    SELECT id, title, description, niche, platform, budget, rpm, status, cover_image, created_at
    FROM campaigns ORDER BY created_at DESC
  `).all();
  res.json(rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    niche: r.niche,
    platform: r.platform,
    budget: r.budget,
    rpm: r.rpm,
    status: r.status,
    cover_image: r.cover_image,
    createdAt: r.created_at,
  })));
});

// POST /api/admin/campaigns
router.post('/campaigns', (req, res) => {
  const { title, description, niche, platform, budget, rpm, cover_image } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const id = uuid();
  db.prepare(`
    INSERT INTO campaigns (id, title, description, niche, platform, budget, rpm, cover_image, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(id, title || '', description || '', niche || '', platform || '', budget || 0, rpm || 0, cover_image || '');
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  res.status(201).json({
    id: row.id,
    title: row.title,
    description: row.description,
    niche: row.niche,
    platform: row.platform,
    budget: row.budget,
    rpm: row.rpm,
    status: row.status,
    cover_image: row.cover_image,
    createdAt: row.created_at,
  });
});

// PUT /api/admin/campaigns/:id
router.put('/campaigns/:id', (req, res) => {
  const { title, description, niche, platform, budget, rpm, status, cover_image } = req.body || {};
  const id = req.params.id;
  const row = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Campaign not found' });
  db.prepare(`
    UPDATE campaigns SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      niche = COALESCE(?, niche),
      platform = COALESCE(?, platform),
      budget = COALESCE(?, budget),
      rpm = COALESCE(?, rpm),
      status = COALESCE(?, status),
      cover_image = COALESCE(?, cover_image)
    WHERE id = ?
  `).run(
    title ?? null, description ?? null, niche ?? null, platform ?? null,
    budget ?? null, rpm ?? null, status ?? null, cover_image ?? null, id
  );
  const updated = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  res.json(updated);
});

// ---------- Submissions (all; approve/reject; set views) ----------
// GET /api/admin/submissions
router.get('/submissions', (req, res) => {
  const status = req.query.status;
  let sql = `
    SELECT s.id, s.user_id, s.campaign_id, s.platform, s.post_url, s.status, s.views, s.likes, s.earnings, s.created_at,
           u.name as user_name, u.email as user_email, c.title as campaign_title
    FROM submissions s
    JOIN users u ON u.id = s.user_id
    JOIN campaigns c ON c.id = s.campaign_id
  `;
  const params = [];
  if (status && status !== 'all') {
    sql += ' WHERE s.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY s.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    campaignId: r.campaign_id,
    platform: r.platform,
    postUrl: r.post_url,
    status: r.status,
    views: r.views,
    likes: r.likes,
    earnings: r.earnings,
    createdAt: r.created_at,
    userName: r.user_name,
    userEmail: r.user_email,
    campaignTitle: r.campaign_title,
  })));
});

// PUT /api/admin/submissions/:id/status
router.put('/submissions/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be pending, approved, or rejected' });
  }
  const id = req.params.id;
  const row = db.prepare('SELECT id, user_id, campaign_id FROM submissions WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE submissions SET status = ? WHERE id = ?').run(status, id);
  if (status === 'approved') {
    const sub = db.prepare('SELECT views, earnings FROM submissions WHERE id = ?').get(id);
    const rpm = db.prepare('SELECT rpm FROM campaigns WHERE id = ?').get(row.campaign_id).rpm || 0;
    const earnings = (sub.views || 0) / 1000 * rpm;
    db.prepare('UPDATE submissions SET earnings = ? WHERE id = ?').run(earnings, id);
    db.prepare(`
      UPDATE wallet_balances SET
        available_balance = available_balance + ?,
        total_earnings = total_earnings + ?,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(earnings, earnings, row.user_id);
  }
  res.json({ ok: true, status });
});

// PUT /api/admin/submissions/:id/engagement – set views/likes (e.g. after manual check or cron)
router.put('/submissions/:id/engagement', (req, res) => {
  const { views, likes } = req.body || {};
  const id = req.params.id;
  const row = db.prepare('SELECT id, user_id, campaign_id, earnings FROM submissions WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const v = typeof views === 'number' ? views : (typeof views === 'string' ? parseInt(views, 10) : null);
  const l = typeof likes === 'number' ? likes : (typeof likes === 'string' ? parseInt(likes, 10) : null);
  if (v != null) db.prepare('UPDATE submissions SET views = ? WHERE id = ?').run(v, id);
  if (l != null) db.prepare('UPDATE submissions SET likes = ? WHERE id = ?').run(l, id);
  const campaign = db.prepare('SELECT rpm FROM campaigns WHERE id = ?').get(row.campaign_id);
  const rpm = campaign ? campaign.rpm : 0;
  const newViews = v != null ? v : db.prepare('SELECT views FROM submissions WHERE id = ?').get(id).views;
  const earnings = (newViews || 0) / 1000 * rpm;
  db.prepare('UPDATE submissions SET earnings = ? WHERE id = ?').run(earnings, id);
  res.json({ ok: true, views: v != null ? v : newViews, likes: l, earnings });
});

// ---------- Payouts ----------
// GET /api/admin/payouts
router.get('/payouts', (req, res) => {
  const status = req.query.status;
  let sql = `
    SELECT p.id, p.user_id, p.amount, p.payment_method, p.payment_details, p.status, p.notes, p.created_at,
           u.name as user_name, u.email as user_email
    FROM payout_requests p
    JOIN users u ON u.id = p.user_id
  `;
  const params = [];
  if (status && status !== 'all') {
    sql += ' WHERE p.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY p.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    amount: r.amount,
    paymentMethod: r.payment_method,
    paymentDetails: r.payment_details ? JSON.parse(r.payment_details) : null,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    userName: r.user_name,
    userEmail: r.user_email,
  })));
});

// PUT /api/admin/payouts/:id
router.put('/payouts/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be pending, approved, or rejected' });
  }
  const id = req.params.id;
  const row = db.prepare('SELECT id, user_id, amount FROM payout_requests WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE payout_requests SET status = ? WHERE id = ?').run(status, id);
  if (status === 'rejected') {
    db.prepare(`
      UPDATE wallet_balances SET available_balance = available_balance + ?, updated_at = datetime('now') WHERE user_id = ?
    `).run(row.amount, row.user_id);
  }
  if (status === 'approved') {
    db.prepare(`
      UPDATE wallet_balances SET total_paid = total_paid + ?, updated_at = datetime('now') WHERE user_id = ?
    `).run(row.amount, row.user_id);
  }
  res.json({ ok: true, status });
});

// ---------- Brand applications (form submissions + manual) ----------
// GET /api/admin/brand-applications
router.get('/brand-applications', (req, res) => {
  const status = req.query.status;
  let sql = `SELECT id, company_name, contact_email, contact_name, brand_type, platforms, budget, rpm, other_specifications, notes, status, created_at FROM brand_applications`;
  const params = [];
  if (status && status !== 'all') {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// POST /api/admin/brand-applications (manual entry)
router.post('/brand-applications', (req, res) => {
  const { company_name, contact_email, contact_name, brand_type, platforms, budget, rpm, other_specifications, notes } = req.body || {};
  if (!contact_email) return res.status(400).json({ error: 'contact_email required' });
  const id = uuid();
  const platformsStr = Array.isArray(platforms) ? platforms.join(',') : (platforms || '');
  db.prepare(`
    INSERT INTO brand_applications (id, company_name, contact_email, contact_name, brand_type, platforms, budget, rpm, other_specifications, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(id, company_name || '', contact_email, contact_name || '', brand_type || '', platformsStr, budget != null ? Number(budget) : null, rpm != null ? Number(rpm) : null, other_specifications || '', notes || '');
  const row = db.prepare('SELECT * FROM brand_applications WHERE id = ?').get(id);
  res.status(201).json(row);
});

// PUT /api/admin/brand-applications/:id
router.put('/brand-applications/:id', (req, res) => {
  const { status, notes } = req.body || {};
  const id = req.params.id;
  const row = db.prepare('SELECT id FROM brand_applications WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (status) db.prepare('UPDATE brand_applications SET status = ? WHERE id = ?').run(status, id);
  if (notes !== undefined) db.prepare('UPDATE brand_applications SET notes = ? WHERE id = ?').run(notes, id);
  const updated = db.prepare('SELECT * FROM brand_applications WHERE id = ?').get(id);
  res.json(updated);
});

// ---------- Admin alerts (campaign created notifications) ----------
// GET /api/admin/alerts
router.get('/alerts', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, type, entity_type, entity_id, title, message, read, created_at
      FROM admin_alerts ORDER BY created_at DESC LIMIT 50
    `).all();
    res.json(rows.map(r => ({
      id: r.id, type: r.type, entityType: r.entity_type, entityId: r.entity_id,
      title: r.title, message: r.message, read: !!r.read, createdAt: r.created_at
    })));
  } catch (e) {
    res.json([]);
  }
});

// PUT /api/admin/alerts/:id/read
router.put('/alerts/:id/read', (req, res) => {
  try {
    db.prepare('UPDATE admin_alerts SET read = 1 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Not found' });
  }
});

// ---------- Users with campaigns (organized by user) ----------
// GET /api/admin/users-with-campaigns
router.get('/users-with-campaigns', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, name, email, created_at FROM users ORDER BY created_at DESC
    `).all();
    let campaigns;
    try {
      campaigns = db.prepare(`
        SELECT id, title, platform, platforms, status, owner_id, content_link, num_accounts, goal, created_at, started_at
        FROM campaigns WHERE owner_id IS NOT NULL ORDER BY created_at DESC
      `).all();
    } catch (e) {
      try {
        campaigns = db.prepare(`
          SELECT id, title, platform, platforms, status, owner_id, content_link, num_accounts, goal, created_at
          FROM campaigns WHERE owner_id IS NOT NULL ORDER BY created_at DESC
        `).all();
      } catch (e2) {
        campaigns = db.prepare(`
          SELECT id, title, platform, status, owner_id, content_link, num_accounts, goal, created_at
          FROM campaigns WHERE owner_id IS NOT NULL ORDER BY created_at DESC
        `).all();
      }
    }
    const byUser = {};
    users.forEach(u => {
      byUser[u.id] = { id: u.id, name: u.name, email: u.email, createdAt: u.created_at, campaigns: [] };
    });
    campaigns.forEach(c => {
      if (byUser[c.owner_id]) {
        let platformsStr = c.platforms;
        if (typeof platformsStr === 'string' && platformsStr.startsWith('[')) {
          try { platformsStr = JSON.parse(platformsStr).join(', '); } catch (_) {}
        }
        byUser[c.owner_id].campaigns.push({
          id: c.id, title: c.title, platform: c.platform, platforms: platformsStr || c.platform,
          contentLink: c.content_link, numAccounts: c.num_accounts, goal: c.goal, createdAt: c.created_at,
          startedAt: c.started_at || c.created_at
        });
      }
    });
    res.json(Object.values(byUser).filter(u => u.campaigns.length > 0).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (e) {
    res.json([]);
  }
});

// ---------- Campaign accounts (admin adds accounts we created) ----------
// GET /api/admin/campaigns/:id/accounts
router.get('/campaigns/:id/accounts', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, platform, handle, created_at FROM campaign_accounts WHERE campaign_id = ? ORDER BY created_at')
      .all(req.params.id);
    res.json(rows.map(r => ({ id: r.id, platform: r.platform, handle: r.handle, createdAt: r.created_at })));
  } catch (e) {
    res.json([]);
  }
});

// POST /api/admin/campaigns/:id/accounts
router.post('/campaigns/:id/accounts', (req, res) => {
  const { platform, handle } = req.body || {};
  if (!platform || !handle || !handle.trim()) return res.status(400).json({ error: 'platform and handle required' });
  const campaignId = req.params.id;
  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const id = uuid();
  db.prepare('INSERT INTO campaign_accounts (id, campaign_id, platform, handle) VALUES (?, ?, ?, ?)')
    .run(id, campaignId, platform.trim().toLowerCase(), handle.trim());
  const row = db.prepare('SELECT * FROM campaign_accounts WHERE id = ?').get(id);
  res.status(201).json({ id: row.id, platform: row.platform, handle: row.handle });
});

// ---------- Campaign posts (admin inputs daily post links) ----------
// GET /api/admin/campaigns/:id/posts
router.get('/campaigns/:id/posts', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.id, p.platform, p.post_url, p.views, p.post_date, p.created_at, p.sponsor_deal_id, p.views_sponsor_credited, a.handle as account_handle
      FROM campaign_posts p
      LEFT JOIN campaign_accounts a ON a.id = p.campaign_account_id
      WHERE p.campaign_id = ?
      ORDER BY p.post_date DESC, p.created_at DESC
    `).all(req.params.id);
    res.json(rows.map(r => ({
      id: r.id, platform: r.platform, postUrl: r.post_url, views: r.views || 0,
      postDate: r.post_date, createdAt: r.created_at, accountHandle: r.account_handle,
      sponsorDealId: r.sponsor_deal_id || null, viewsSponsorCredited: r.views_sponsor_credited || 0
    })));
  } catch (e) {
    res.json([]);
  }
});

// POST /api/admin/campaigns/:id/posts
router.post('/campaigns/:id/posts', (req, res) => {
  const { platform, post_url, views, post_date, campaign_account_id, sponsor_deal_id } = req.body || {};
  if (!platform || !post_url || !post_url.trim() || !post_date) {
    return res.status(400).json({ error: 'platform, post_url, and post_date required' });
  }
  const campaignId = req.params.id;
  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const id = uuid();
  try {
    db.prepare(`
      INSERT INTO campaign_posts (id, campaign_id, campaign_account_id, platform, post_url, views, post_date, sponsor_deal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, campaignId, campaign_account_id || null, platform.trim().toLowerCase(), post_url.trim(), views || 0, post_date, sponsor_deal_id || null);
  } catch (e) {
    if (e.message && e.message.includes('sponsor_deal_id')) {
      db.prepare(`
        INSERT INTO campaign_posts (id, campaign_id, campaign_account_id, platform, post_url, views, post_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, campaignId, campaign_account_id || null, platform.trim().toLowerCase(), post_url.trim(), views || 0, post_date);
    } else throw e;
  }
  const row = db.prepare('SELECT * FROM campaign_posts WHERE id = ?').get(id);
  res.status(201).json({
    id: row.id, platform: row.platform, postUrl: row.post_url, views: row.views,
    postDate: row.post_date, sponsorDealId: row.sponsor_deal_id || null,
    accountHandle: row.campaign_account_id ? db.prepare('SELECT handle FROM campaign_accounts WHERE id = ?').get(row.campaign_account_id)?.handle : null
  });
});

// PATCH /api/admin/campaigns/:cid/posts/:pid – update views (and optionally sponsor_deal_id); runs sponsor CPM payout
router.patch('/campaigns/:cid/posts/:pid', (req, res) => {
  const { views, sponsor_deal_id } = req.body || {};
  const post = db.prepare(`
    SELECT p.id, p.campaign_id, p.views, p.views_sponsor_credited, p.sponsor_deal_id
    FROM campaign_posts p WHERE p.id = ? AND p.campaign_id = ?
  `).get(req.params.pid, req.params.cid);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const dealId = sponsor_deal_id !== undefined ? (sponsor_deal_id || null) : post.sponsor_deal_id;
  if (sponsor_deal_id !== undefined) {
    try { db.prepare('UPDATE campaign_posts SET sponsor_deal_id = ? WHERE id = ?').run(dealId, post.id); } catch (_) {}
  }
  if (typeof views === 'number' || (typeof views === 'string' && views !== '')) {
    const newViews = Math.max(0, parseInt(views, 10) || 0);
    db.prepare('UPDATE campaign_posts SET views = ? WHERE id = ?').run(newViews, post.id);
    // Sponsor CPM payout when post has a deal
    if (dealId) {
      const deal = db.prepare('SELECT sd.*, so.cpm_cents FROM sponsor_deals sd JOIN sponsor_offers so ON so.id = sd.offer_id WHERE sd.id = ?').get(dealId);
      if (deal && deal.status === 'active' && deal.cpm_cents > 0) {
        const prevCredited = post.views_sponsor_credited || 0;
        const deltaViews = Math.max(0, newViews - prevCredited);
        const remainingBudget = Math.max(0, (deal.budget_reserved_cents || 0) - (deal.spent_cents || 0));
        const payoutCents = Math.min(Math.floor((deltaViews / 1000) * deal.cpm_cents), remainingBudget);
        if (payoutCents > 0) {
          const campaign = db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(post.campaign_id);
          const creatorId = campaign?.owner_id;
          const payoutDollars = payoutCents / 100;
          const newCredited = prevCredited + Math.floor((payoutCents / deal.cpm_cents) * 1000);
          db.prepare('UPDATE sponsor_deals SET spent_cents = spent_cents + ? WHERE id = ?').run(payoutCents, dealId);
          db.prepare('UPDATE campaign_posts SET views_sponsor_credited = ? WHERE id = ?').run(newCredited, post.id);
          db.prepare('UPDATE sponsor_wallets SET total_spent_cents = total_spent_cents + ? WHERE user_id = (SELECT user_id FROM sponsor_offers WHERE id = ?)').run(payoutCents, deal.offer_id);
          if (creatorId) {
            const w = db.prepare('SELECT * FROM wallet_balances WHERE user_id = ?').get(creatorId);
            if (w) {
              db.prepare('UPDATE wallet_balances SET available_balance = available_balance + ?, total_earnings = total_earnings + ?, updated_at = datetime("now") WHERE user_id = ?').run(payoutDollars, payoutDollars, creatorId);
            } else {
              db.prepare('INSERT INTO wallet_balances (user_id, available_balance, total_earnings) VALUES (?, ?, ?)').run(creatorId, payoutDollars, payoutDollars);
            }
          }
          const spent = (deal.spent_cents || 0) + payoutCents;
          if (spent >= (deal.budget_reserved_cents || 0)) {
            db.prepare("UPDATE sponsor_deals SET status = 'exhausted' WHERE id = ?").run(dealId);
          }
        }
      }
    }
  }
  const updated = db.prepare('SELECT * FROM campaign_posts WHERE id = ?').get(post.id);
  res.json({
    id: updated.id, views: updated.views, postDate: updated.post_date,
    sponsorDealId: updated.sponsor_deal_id || null, viewsSponsorCredited: updated.views_sponsor_credited || 0
  });
});

// ---------- Make user admin (first admin: set in DB or run a one-off) ----------
// PUT /api/admin/users/:id/admin
router.put('/users/:id/admin', (req, res) => {
  const { isAdmin } = req.body || {};
  const id = req.params.id;
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, id);
  res.json({ ok: true, isAdmin: !!isAdmin });
});

module.exports = router;
