const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { optionalAuth, requireAuth, requireCreator } = require('../middleware/auth');

const router = express.Router();

// POST /api/campaigns – create a new campaign (authenticated)
router.post('/', requireAuth, (req, res) => {
  const { title, description, niche, platform, budget, rpm, content_link, platforms, num_accounts, goal, payment_schedule, requirePayment, posts_per_day } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Campaign title is required' });
  }
  const id = uuid();
  const ownerId = req.user.id;
  const platformsStr = Array.isArray(platforms) ? JSON.stringify(platforms) : (platforms || null);
  const needsPayment = !!requirePayment;
  const status = needsPayment ? 'pending_payment' : 'active';
  const paymentStatus = needsPayment ? 'pending' : 'paid';

  try {
    const postsPerDayVal = posts_per_day != null ? Math.min(10, Math.max(1, parseInt(posts_per_day, 10))) : null;
    try {
      db.prepare(`
        INSERT INTO campaigns (id, title, description, niche, platform, budget, rpm, status, owner_id, content_link, platforms, num_accounts, goal, payment_schedule, payment_status, posts_per_day)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        title.trim(),
        (description || '').trim() || null,
        (niche || '').trim() || null,
        (platform || '').trim() || null,
        budget != null ? parseFloat(budget) : 0,
        rpm != null ? parseFloat(rpm) : 0,
        ownerId,
        (content_link || '').trim() || null,
        platformsStr,
        num_accounts != null ? parseInt(num_accounts, 10) : null,
        (goal || '').trim() || null,
        (payment_schedule || '').trim() || null,
        paymentStatus,
        postsPerDayVal
      );
    } catch (colErr) {
      if (colErr.message && colErr.message.includes('posts_per_day')) {
        db.prepare(`
          INSERT INTO campaigns (id, title, description, niche, platform, budget, rpm, status, owner_id, content_link, platforms, num_accounts, goal, payment_schedule, payment_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          title.trim(),
          (description || '').trim() || null,
          (niche || '').trim() || null,
          (platform || '').trim() || null,
          budget != null ? parseFloat(budget) : 0,
          rpm != null ? parseFloat(rpm) : 0,
          ownerId,
          (content_link || '').trim() || null,
          platformsStr,
          num_accounts != null ? parseInt(num_accounts, 10) : null,
          (goal || '').trim() || null,
          (payment_schedule || '').trim() || null,
          paymentStatus
        );
      } else {
        throw colErr;
      }
    }
  } catch (e) {
    if (e.message && e.message.includes('no such column')) {
      try {
        db.prepare(`
          INSERT INTO campaigns (id, title, description, niche, platform, budget, rpm, status, owner_id, content_link, platforms, num_accounts, goal, payment_schedule)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          title.trim(),
          (description || '').trim() || null,
          (niche || '').trim() || null,
          (platform || '').trim() || null,
          budget != null ? parseFloat(budget) : 0,
          rpm != null ? parseFloat(rpm) : 0,
          ownerId,
          (content_link || '').trim() || null,
          platformsStr,
          num_accounts != null ? parseInt(num_accounts, 10) : null,
          (goal || '').trim() || null,
          (payment_schedule || '').trim() || null,
          status
        );
      } catch (e2) {
        db.prepare(`
          INSERT INTO campaigns (id, title, description, niche, platform, budget, rpm, status, owner_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          title.trim(),
          (description || '').trim() || null,
          (niche || '').trim() || null,
          (platform || '').trim() || null,
          budget != null ? parseFloat(budget) : 0,
          rpm != null ? parseFloat(rpm) : 0,
          ownerId,
          status
        );
      }
    } else throw e;
  }
  // Notify admins when a user starts a campaign
  try {
    const owner = db.prepare('SELECT name, email FROM users WHERE id = ?').get(ownerId);
    const alertId = uuid();
    db.prepare(`
      INSERT INTO admin_alerts (id, type, entity_type, entity_id, title, message, read)
      VALUES (?, 'campaign_created', 'campaign', ?, ?, ?, 0)
    `).run(
      alertId,
      id,
      'New campaign: ' + title.trim(),
      (owner ? owner.name + ' (' + owner.email + ')' : 'User') + ' started campaign "' + title.trim() + '"'
    );
  } catch (e) {
    // Ignore if admin_alerts table doesn't exist yet
  }
  res.status(201).json({ id, title: title.trim(), status, needsPayment });
});

// GET /api/campaigns – list all (optional auth for joined flag)
router.get('/', optionalAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, title, description, niche, platform, budget, rpm, status, cover_image, created_at
    FROM campaigns WHERE status = 'active' ORDER BY created_at DESC
  `).all();
  const campaigns = rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    niche: r.niche,
    platform: r.platform,
    budget: r.budget,
    RPM: r.rpm,
    status: r.status,
    cover_image: r.cover_image,
    coverImage: r.cover_image,
    image: r.cover_image,
    createdAt: r.created_at,
  }));
  res.json(campaigns);
});

// GET /api/campaigns/created – campaigns the user created (as owner)
router.get('/created', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, title, description, niche, platform, budget, rpm, status, created_at
      FROM campaigns WHERE owner_id = ? ORDER BY created_at DESC
    `).all(req.user.id);
    res.json(rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      niche: r.niche,
      platform: r.platform,
      budget: r.budget,
      status: r.status,
      createdAt: r.created_at,
    })));
  } catch (e) {
    if (e.message && e.message.includes('no such column') && e.message.includes('owner_id')) {
      res.json([]);
    } else throw e;
  }
});

// GET /api/campaigns/my-campaigns
router.get('/my-campaigns', requireAuth, requireCreator, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.title, c.description, c.niche, c.platform, c.budget, c.rpm, c.cover_image, c.created_at, cj.joined_at
    FROM campaign_joins cj
    JOIN campaigns c ON c.id = cj.campaign_id
    WHERE cj.user_id = ?
    ORDER BY cj.joined_at DESC
  `).all(req.user.id);
  const campaigns = rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    niche: r.niche,
    platform: r.platform,
    budget: r.budget,
    RPM: r.rpm,
    cover_image: r.cover_image,
    coverImage: r.cover_image,
    createdAt: r.created_at,
    joinedAt: r.joined_at,
  }));
  res.json(campaigns);
});

// GET /api/campaigns/:id/accounts – linked accounts (creator must own campaign)
router.get('/:id/accounts', requireAuth, (req, res) => {
  const campaignId = req.params.id;
  const campaign = db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  try {
    const rows = db.prepare('SELECT id, platform, handle, created_at FROM campaign_accounts WHERE campaign_id = ? ORDER BY created_at')
      .all(campaignId);
    res.json(rows.map(r => ({ id: r.id, platform: r.platform, handle: r.handle, createdAt: r.created_at })));
  } catch (e) {
    res.json([]);
  }
});

// GET /api/campaigns/:id/posts – daily posts (creator must own campaign)
router.get('/:id/posts', requireAuth, (req, res) => {
  const campaignId = req.params.id;
  const campaign = db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  try {
    const rows = db.prepare(`
      SELECT p.id, p.platform, p.post_url, p.views, p.post_date, p.created_at, a.handle as account_handle
      FROM campaign_posts p
      LEFT JOIN campaign_accounts a ON a.id = p.campaign_account_id
      WHERE p.campaign_id = ?
      ORDER BY p.post_date DESC, p.created_at DESC
    `).all(campaignId);
    res.json(rows.map(r => ({
      id: r.id, platform: r.platform, postUrl: r.post_url, views: r.views || 0,
      postDate: r.post_date, createdAt: r.created_at, accountHandle: r.account_handle
    })));
  } catch (e) {
    res.json([]);
  }
});

// GET /api/campaigns/:id/sponsor-settings – sponsor opt-in (creator, own campaign)
router.get('/:id/sponsor-settings', requireAuth, (req, res) => {
  const campaign = db.prepare('SELECT owner_id, accept_sponsor_offers, allow_watermark, watermark_coupon_percent FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  res.json({
    acceptSponsorOffers: !!campaign.accept_sponsor_offers,
    allowWatermark: !!campaign.allow_watermark,
    watermarkCouponPercent: campaign.watermark_coupon_percent || 0,
  });
});

// PUT /api/campaigns/:id/sponsor-settings – update (creator, own campaign)
router.put('/:id/sponsor-settings', requireAuth, (req, res) => {
  const { acceptSponsorOffers, allowWatermark, watermarkCouponPercent } = req.body || {};
  const campaign = db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  const accept = acceptSponsorOffers === true || acceptSponsorOffers === 1;
  const allow = allowWatermark === true || allowWatermark === 1;
  const coupon = Math.min(100, Math.max(0, parseFloat(watermarkCouponPercent) || 0));
  db.prepare(`
    UPDATE campaigns SET accept_sponsor_offers = ?, allow_watermark = ?, watermark_coupon_percent = ?
    WHERE id = ?
  `).run(accept ? 1 : 0, allow ? 1 : 0, coupon, req.params.id);
  res.json({ acceptSponsorOffers: accept, allowWatermark: allow, watermarkCouponPercent: coupon });
});

// GET /api/campaigns/:id/sponsor-deals – list sponsor deals for this campaign (owner only)
router.get('/:id/sponsor-deals', requireAuth, (req, res) => {
  const campaign = db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  try {
    const rows = db.prepare(`
      SELECT sd.id, sd.offer_id, sd.status, sd.budget_reserved_cents, sd.spent_cents, sd.created_at,
             so.name as offer_name, so.watermark_text, so.cpm_cents
      FROM sponsor_deals sd
      JOIN sponsor_offers so ON so.id = sd.offer_id
      WHERE sd.campaign_id = ?
      ORDER BY sd.created_at DESC
    `).all(req.params.id);
    res.json(rows.map(r => ({
      id: r.id, offerId: r.offer_id, offerName: r.offer_name, watermarkText: r.watermark_text,
      cpmCents: r.cpm_cents, status: r.status, budgetReservedCents: r.budget_reserved_cents,
      spentCents: r.spent_cents || 0, createdAt: r.created_at,
    })));
  } catch (e) {
    res.json([]);
  }
});

// POST /api/campaigns/:id/join
router.post('/:id/join', requireAuth, requireCreator, (req, res) => {
  const campaignId = req.params.id;
  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ? AND status = ?').get(campaignId, 'active');
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  try {
    db.prepare('INSERT INTO campaign_joins (user_id, campaign_id) VALUES (?, ?)').run(req.user.id, campaignId);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(400).json({ error: 'Already joined' });
    throw e;
  }
  res.json({ ok: true });
});

module.exports = router;
