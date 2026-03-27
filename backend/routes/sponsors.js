const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { requireAuth, requireSponsor } = require('../middleware/auth');

const router = express.Router();
const MIN_DEPOSIT_CENTS = 5000; // $50 minimum

const WATERMARK_DIR = path.join(__dirname, '..', 'data', 'sponsor-watermarks');
const WATERMARK_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_WATERMARK_BYTES = 2 * 1024 * 1024;

function ensureWatermarkDir() {
  if (!fs.existsSync(WATERMARK_DIR)) fs.mkdirSync(WATERMARK_DIR, { recursive: true });
}

function watermarkFilePath(userId) {
  return path.join(WATERMARK_DIR, userId);
}

const uploadWatermark = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      ensureWatermarkDir();
      cb(null, WATERMARK_DIR);
    },
    filename: (req, file, cb) => {
      cb(null, req.user.id);
    },
  }),
  limits: { fileSize: MAX_WATERMARK_BYTES },
  fileFilter: (req, file, cb) => {
    if (WATERMARK_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Use PNG, JPEG, WebP, or GIF only.'));
  },
});

function handleWatermarkUpload(req, res, next) {
  uploadWatermark.single('watermark')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 2 MB or smaller.' : (err.message || 'Upload failed');
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    next();
  });
}

async function getWallet(userId) {
  let row = await db.prepare('SELECT * FROM sponsor_wallets WHERE user_id = ?').get(userId);
  if (!row) {
    await db.prepare('INSERT INTO sponsor_wallets (user_id) VALUES (?)').run(userId);
    row = await db.prepare('SELECT * FROM sponsor_wallets WHERE user_id = ?').get(userId);
  }
  return row;
}

// GET /api/sponsors/wallet – sponsor balance
router.get('/wallet', requireAuth, requireSponsor, async (req, res) => {
  const w = await getWallet(req.user.id);
  res.json({
    balanceCents: w.balance_cents || 0,
    totalDepositedCents: w.total_deposited_cents || 0,
    totalSpentCents: w.total_spent_cents || 0,
    hasWatermarkImage: !!(w.watermark_image_mime && String(w.watermark_image_mime).trim()),
  });
});

// POST /api/sponsors/watermark – upload or replace watermark image (multipart field: watermark)
router.post('/watermark', requireAuth, requireSponsor, handleWatermarkUpload, async (req, res) => {
  const mime = req.file.mimetype;
  await getWallet(req.user.id);
  await db.prepare(`
    UPDATE sponsor_wallets SET watermark_image_mime = ?, watermark_image_updated_at = datetime('now'), updated_at = datetime('now')
    WHERE user_id = ?
  `).run(mime, req.user.id);
  res.status(201).json({ ok: true, mimeType: mime });
});

// GET /api/sponsors/watermark – raw image bytes (Authorization: Bearer …)
router.get('/watermark', requireAuth, requireSponsor, async (req, res) => {
  const w = await getWallet(req.user.id);
  if (!w.watermark_image_mime) return res.status(404).json({ error: 'No watermark uploaded' });
  const fp = watermarkFilePath(req.user.id);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'No watermark uploaded' });
  res.setHeader('Content-Type', w.watermark_image_mime);
  res.setHeader('Cache-Control', 'private, max-age=300');
  fs.createReadStream(fp).pipe(res);
});

// DELETE /api/sponsors/watermark – remove stored watermark
router.delete('/watermark', requireAuth, requireSponsor, async (req, res) => {
  const fp = watermarkFilePath(req.user.id);
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (_) {}
  await getWallet(req.user.id);
  await db.prepare(`
    UPDATE sponsor_wallets SET watermark_image_mime = NULL, watermark_image_updated_at = NULL, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(req.user.id);
  res.json({ ok: true });
});

// POST /api/sponsors/deposit – create deposit (pending; payment flow TBD)
router.post('/deposit', requireAuth, requireSponsor, async (req, res) => {
  const { amountCents } = req.body || {};
  const amount = parseInt(amountCents, 10) || 0;
  if (amount < MIN_DEPOSIT_CENTS) {
    return res.status(400).json({ error: `Minimum deposit is $${MIN_DEPOSIT_CENTS / 100}` });
  }
  const id = uuid();
  await db.prepare(`
    INSERT INTO sponsor_deposits (id, user_id, amount_cents, status)
    VALUES (?, ?, ?, 'pending')
  `).run(id, req.user.id, amount);
  res.status(201).json({ id, amountCents: amount, status: 'pending' });
});

// POST /api/sponsors/offers – create offer
router.post('/offers', requireAuth, requireSponsor, async (req, res) => {
  const { name, watermarkText, cpmCents, budgetCents } = req.body || {};
  if (!name || !watermarkText || !cpmCents || !budgetCents) {
    return res.status(400).json({ error: 'name, watermarkText, cpmCents, budgetCents required' });
  }
  const cpm = Math.max(0, parseInt(cpmCents, 10));
  const budget = Math.max(0, parseInt(budgetCents, 10));
  const id = uuid();
  await db.prepare(`
    INSERT INTO sponsor_offers (id, user_id, name, watermark_text, cpm_cents, budget_cents, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
  `).run(id, req.user.id, String(name).trim(), String(watermarkText).trim(), cpm, budget);
  res.status(201).json({
    id,
    name: String(name).trim(),
    watermarkText: String(watermarkText).trim(),
    cpmCents: cpm,
    budgetCents: budget,
    status: 'active',
  });
});

// GET /api/sponsors/offers – list my offers
router.get('/offers', requireAuth, requireSponsor, async (req, res) => {
  const rows = await db.prepare(`
    SELECT id, name, watermark_text, cpm_cents, budget_cents, status, created_at
    FROM sponsor_offers WHERE user_id = ?
  `).all(req.user.id);
  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    watermarkText: r.watermark_text,
    cpmCents: r.cpm_cents,
    budgetCents: r.budget_cents,
    status: r.status,
    createdAt: r.created_at,
  })));
});

// Mock campaigns for demo when no real campaigns exist
const MOCK_CAMPAIGNS = [
  { id: 'mock-gaming-1', creatorName: 'Alex Rivera', title: 'Gaming Clip Highlights', platform: 'tiktok', platforms: ['tiktok'], acceptSponsorOffers: true, allowWatermark: true },
  { id: 'mock-podcast-1', creatorName: 'Jamie Chen', title: 'Podcast Clips & Snippets', platform: 'youtube', platforms: ['youtube', 'tiktok'], acceptSponsorOffers: true, allowWatermark: false },
  { id: 'mock-lifestyle-1', creatorName: 'Morgan Lee', title: 'Lifestyle & Vlog Moments', platform: 'instagram', platforms: ['instagram', 'tiktok'], acceptSponsorOffers: true, allowWatermark: true },
  { id: 'mock-tech-1', creatorName: 'Sam Torres', title: 'Tech Reviews & Tips', platform: 'youtube', platforms: ['youtube'], acceptSponsorOffers: true, allowWatermark: true },
  { id: 'mock-music-1', creatorName: 'Jordan Blake', title: 'Music Covers & Originals', platform: 'tiktok', platforms: ['tiktok', 'instagram'], acceptSponsorOffers: true, allowWatermark: false },
];

// Mock posts for demo campaigns
const MOCK_POSTS = [
  { id: 'mock-post-1', platform: 'tiktok', postUrl: 'https://tiktok.com/@example/video/1', views: 12400, postDate: '2025-03-10', accountHandle: '@alexgaming' },
  { id: 'mock-post-2', platform: 'tiktok', postUrl: 'https://tiktok.com/@example/video/2', views: 8200, postDate: '2025-03-09', accountHandle: '@alexgaming' },
  { id: 'mock-post-3', platform: 'youtube', postUrl: 'https://youtube.com/shorts/abc123', views: 15600, postDate: '2025-03-08', accountHandle: '@jamiepodcast' },
];

// GET /api/sponsors/campaigns – list campaigns that accept sponsor offers (for sponsors to browse)
router.get('/campaigns', requireAuth, requireSponsor, async (req, res) => {
  let rows = [];
  try {
    rows = await db.prepare(`
      SELECT c.id, c.title, c.platform, c.platforms, c.accept_sponsor_offers, c.allow_watermark, u.name as creator_name
      FROM campaigns c
      LEFT JOIN users u ON u.id = c.owner_id
      WHERE c.status = 'active' AND c.accept_sponsor_offers = 1
      ORDER BY c.created_at DESC
    `).all();
  } catch (e) {
    // DB may not be ready
  }
  const campaigns = rows.map(r => ({
    id: r.id,
    creatorName: r.creator_name || 'Creator',
    title: r.title,
    platform: r.platform,
    platforms: r.platforms ? (typeof r.platforms === 'string' ? JSON.parse(r.platforms || '[]') : r.platforms) : [],
    acceptSponsorOffers: !!r.accept_sponsor_offers,
    allowWatermark: !!r.allow_watermark,
  }));
  // When no real campaigns, include mock campaigns for demo/preview
  if (campaigns.length === 0) {
    return res.json(MOCK_CAMPAIGNS);
  }
  res.json(campaigns);
});

// GET /api/sponsors/campaigns/:id/posts – view campaign posts (videos) for sponsors
router.get('/campaigns/:id/posts', requireAuth, requireSponsor, async (req, res) => {
  const campaignId = req.params.id;
  if ((campaignId || '').startsWith('mock-')) {
    return res.json(MOCK_POSTS);
  }
  const campaign = await db.prepare('SELECT id, accept_sponsor_offers FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!campaign.accept_sponsor_offers) return res.status(403).json({ error: 'Campaign does not accept sponsors' });
  try {
    const rows = await db.prepare(`
      SELECT p.id, p.platform, p.post_url, p.views, p.post_date, a.handle as account_handle
      FROM campaign_posts p
      LEFT JOIN campaign_accounts a ON a.id = p.campaign_account_id
      WHERE p.campaign_id = ?
      ORDER BY p.post_date DESC, p.created_at DESC
    `).all(campaignId);
    res.json(rows.map(r => ({
      id: r.id, platform: r.platform, postUrl: r.post_url, views: r.views || 0,
      postDate: r.post_date, accountHandle: r.account_handle
    })));
  } catch (e) {
    res.json([]);
  }
});

// POST /api/sponsors/deals – sponsor sends offer to campaign
router.post('/deals', requireAuth, requireSponsor, async (req, res) => {
  const { offerId, campaignId } = req.body || {};
  if (!offerId || !campaignId) {
    return res.status(400).json({ error: 'offerId and campaignId required' });
  }
  const offer = await db.prepare('SELECT * FROM sponsor_offers WHERE id = ? AND user_id = ?').get(offerId, req.user.id);
  if (!offer) return res.status(404).json({ error: 'Offer not found' });
  if (offer.status !== 'active') return res.status(400).json({ error: 'Offer not active' });
  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!campaign.accept_sponsor_offers) return res.status(400).json({ error: 'Campaign does not accept sponsor offers' });
  const w = await getWallet(req.user.id);
  if ((w.balance_cents || 0) < offer.budget_cents) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }
  const id = uuid();
  await db.prepare(`
    INSERT INTO sponsor_deals (id, offer_id, campaign_id, status, budget_reserved_cents)
    VALUES (?, ?, ?, 'active', ?)
  `).run(id, offerId, campaignId, offer.budget_cents);
  await db.prepare('UPDATE sponsor_wallets SET balance_cents = balance_cents - ? WHERE user_id = ?').run(offer.budget_cents, req.user.id);
  res.status(201).json({
    id,
    offerId,
    campaignId,
    status: 'active',
    budgetReservedCents: offer.budget_cents,
  });
});

// GET /api/sponsors/deals – list my deals
router.get('/deals', requireAuth, requireSponsor, async (req, res) => {
  const rows = await db.prepare(`
    SELECT sd.id, sd.offer_id, sd.campaign_id, sd.status, sd.budget_reserved_cents, sd.spent_cents, sd.created_at,
           so.name as offer_name, so.watermark_text, c.title as campaign_title
    FROM sponsor_deals sd
    JOIN sponsor_offers so ON so.id = sd.offer_id
    JOIN campaigns c ON c.id = sd.campaign_id
    WHERE so.user_id = ?
  `).all(req.user.id);
  res.json(rows.map(r => ({
    id: r.id,
    offerId: r.offer_id,
    campaignId: r.campaign_id,
    offerName: r.offer_name,
    watermarkText: r.watermark_text,
    campaignTitle: r.campaign_title,
    status: r.status,
    budgetReservedCents: r.budget_reserved_cents,
    spentCents: r.spent_cents || 0,
    createdAt: r.created_at,
  })));
});

module.exports = router;
