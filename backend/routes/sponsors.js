const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { requireAuth, requireCreator, requireSponsor } = require('../middleware/auth');

const router = express.Router();
const MIN_DEPOSIT_CENTS = 5000; // $50 minimum

function getWallet(userId) {
  let row = db.prepare('SELECT * FROM sponsor_wallets WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO sponsor_wallets (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM sponsor_wallets WHERE user_id = ?').get(userId);
  }
  return row;
}

// GET /api/sponsors/wallet – sponsor balance
router.get('/wallet', requireAuth, requireSponsor, (req, res) => {
  const w = getWallet(req.user.id);
  res.json({
    balanceCents: w.balance_cents || 0,
    totalDepositedCents: w.total_deposited_cents || 0,
    totalSpentCents: w.total_spent_cents || 0,
  });
});

// POST /api/sponsors/deposit – create deposit (pending; payment flow TBD)
router.post('/deposit', requireAuth, requireSponsor, (req, res) => {
  const { amountCents } = req.body || {};
  const amount = parseInt(amountCents, 10) || 0;
  if (amount < MIN_DEPOSIT_CENTS) {
    return res.status(400).json({ error: `Minimum deposit is $${MIN_DEPOSIT_CENTS / 100}` });
  }
  const id = uuid();
  db.prepare(`
    INSERT INTO sponsor_deposits (id, user_id, amount_cents, status)
    VALUES (?, ?, ?, 'pending')
  `).run(id, req.user.id, amount);
  res.status(201).json({ id, amountCents: amount, status: 'pending' });
});

// POST /api/sponsors/offers – create offer
router.post('/offers', requireAuth, requireSponsor, (req, res) => {
  const { name, watermarkText, cpmCents, budgetCents } = req.body || {};
  if (!name || !watermarkText || !cpmCents || !budgetCents) {
    return res.status(400).json({ error: 'name, watermarkText, cpmCents, budgetCents required' });
  }
  const cpm = Math.max(0, parseInt(cpmCents, 10));
  const budget = Math.max(0, parseInt(budgetCents, 10));
  const id = uuid();
  db.prepare(`
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
router.get('/offers', requireAuth, requireSponsor, (req, res) => {
  const rows = db.prepare(`
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

// GET /api/sponsors/campaigns – list campaigns that accept sponsor offers (for sponsors to browse)
router.get('/campaigns', requireAuth, requireSponsor, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.title, c.platform, c.platforms, c.accept_sponsor_offers, c.allow_watermark
    FROM campaigns c
    WHERE c.status = 'active' AND c.accept_sponsor_offers = 1
    ORDER BY c.created_at DESC
  `).all();
  res.json(rows.map(r => ({
    id: r.id,
    title: r.title,
    platform: r.platform,
    platforms: r.platforms ? JSON.parse(r.platforms || '[]') : [],
    acceptSponsorOffers: !!r.accept_sponsor_offers,
    allowWatermark: !!r.allow_watermark,
  })));
});

// POST /api/sponsors/deals – sponsor sends offer to campaign
router.post('/deals', requireAuth, requireSponsor, (req, res) => {
  const { offerId, campaignId } = req.body || {};
  if (!offerId || !campaignId) {
    return res.status(400).json({ error: 'offerId and campaignId required' });
  }
  const offer = db.prepare('SELECT * FROM sponsor_offers WHERE id = ? AND user_id = ?').get(offerId, req.user.id);
  if (!offer) return res.status(404).json({ error: 'Offer not found' });
  if (offer.status !== 'active') return res.status(400).json({ error: 'Offer not active' });
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!campaign.accept_sponsor_offers) return res.status(400).json({ error: 'Campaign does not accept sponsor offers' });
  const w = getWallet(req.user.id);
  if ((w.balance_cents || 0) < offer.budget_cents) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }
  const id = uuid();
  db.prepare(`
    INSERT INTO sponsor_deals (id, offer_id, campaign_id, status, budget_reserved_cents)
    VALUES (?, ?, ?, 'active', ?)
  `).run(id, offerId, campaignId, offer.budget_cents);
  db.prepare('UPDATE sponsor_wallets SET balance_cents = balance_cents - ? WHERE user_id = ?').run(offer.budget_cents, req.user.id);
  res.status(201).json({
    id,
    offerId,
    campaignId,
    status: 'active',
    budgetReservedCents: offer.budget_cents,
  });
});

// GET /api/sponsors/deals – list my deals
router.get('/deals', requireAuth, requireSponsor, (req, res) => {
  const rows = db.prepare(`
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
