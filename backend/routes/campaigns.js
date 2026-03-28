const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { optionalAuth, requireAuth, requireCreator } = require('../middleware/auth');
const { normalizeContentTypes, normalizeNicheTags, parseJsonArray } = require('../lib/creatorTaxonomy');

const router = express.Router();

function mapDraftRowToClient(r) {
  if (!r) return null;
  let p = {};
  try {
    p = typeof r.payload === 'string' ? JSON.parse(r.payload || '{}') : (r.payload || {});
  } catch (e) {
    p = {};
  }
  const ts = r.updated_at != null ? r.updated_at : r.created_at;
  let savedAt = Date.now();
  try {
    if (ts != null) savedAt = new Date(ts).getTime();
  } catch (e) {}
  const titleFromRow = (r.title != null && String(r.title).trim()) ? String(r.title).trim() : '';
  return Object.assign({}, p, {
    id: r.id,
    savedAt,
    title: titleFromRow || (p.title || ''),
  });
}

// POST /api/campaigns – create a new campaign (authenticated)
router.post('/', requireAuth, async (req, res) => {
  const { title, description, niche, platform, budget, rpm, content_link, content_links, platforms, num_accounts, goal, payment_schedule, requirePayment, posts_per_day, acceptSponsorOffers, allowWatermark, watermarkCouponPercent } = req.body || {};
  let contentLinkStored = (content_link || '').trim();
  if (Array.isArray(content_links) && content_links.length) {
    const merged = content_links.map((u) => String(u || '').trim()).filter(Boolean);
    if (merged.length) contentLinkStored = merged.join('\n');
  }
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
    const acceptSponsor = !!acceptSponsorOffers;
    const allowWatermarkVal = allowWatermark ? 1 : 0;
    const watermarkCouponVal = allowWatermark ? Math.min(100, Math.max(0, parseFloat(watermarkCouponPercent) || 10)) : 0;
    try {
      await db.prepare(`
        INSERT INTO campaigns (id, title, description, niche, platform, budget, rpm, status, owner_id, content_link, platforms, num_accounts, goal, payment_schedule, payment_status, posts_per_day, accept_sponsor_offers, allow_watermark, watermark_coupon_percent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        title.trim(),
        (description || '').trim() || null,
        (niche || '').trim() || null,
        (platform || '').trim() || null,
        budget != null ? parseFloat(budget) : 0,
        rpm != null ? parseFloat(rpm) : 0,
        status,
        ownerId,
        contentLinkStored || null,
        platformsStr,
        num_accounts != null ? parseInt(num_accounts, 10) : null,
        (goal || '').trim() || null,
        (payment_schedule || '').trim() || null,
        paymentStatus,
        postsPerDayVal,
        acceptSponsor ? 1 : 0,
        allowWatermarkVal,
        watermarkCouponVal
      );
    } catch (colErr) {
      if (colErr.message && (
        colErr.message.includes('posts_per_day') ||
        colErr.message.includes('allow_watermark') ||
        colErr.message.includes('watermark_coupon_percent')
      )) {
        await db.prepare(`
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
          status,
          ownerId,
          contentLinkStored || null,
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
        await db.prepare(`
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
          status,
          ownerId,
          contentLinkStored || null,
          platformsStr,
          num_accounts != null ? parseInt(num_accounts, 10) : null,
          (goal || '').trim() || null,
          (payment_schedule || '').trim() || null
        );
      } catch (e2) {
        await db.prepare(`
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
    const owner = await db.prepare('SELECT name, email FROM users WHERE id = ?').get(ownerId);
    const alertId = uuid();
    await db.prepare(`
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
  try {
    const ownerRow = await db.prepare('SELECT creator_content_types, creator_niche_tags FROM users WHERE id = ?').get(ownerId);
    const bodyTypes = normalizeContentTypes(req.body?.contentTypes);
    const bodyTags = normalizeNicheTags(req.body?.nicheTags);
    const defTypes = parseJsonArray(ownerRow?.creator_content_types);
    const defTags = parseJsonArray(ownerRow?.creator_niche_tags);
    const finalTypes = bodyTypes.length ? bodyTypes : defTypes;
    const finalTags = bodyTags.length ? bodyTags : defTags;
    await db.prepare('UPDATE campaigns SET content_types = ?, niche_tags = ? WHERE id = ?').run(
      JSON.stringify(finalTypes),
      JSON.stringify(finalTags),
      id
    );
  } catch (_) {
    /* columns may be missing on very old DBs */
  }
  res.status(201).json({ id, title: title.trim(), status, needsPayment });
});

// GET /api/campaigns – list all (optional auth for joined flag)
router.get('/', optionalAuth, async (req, res) => {
  const rows = await db.prepare(`
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
router.get('/created', requireAuth, async (req, res) => {
  try {
    const rows = await db.prepare(`
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
router.get('/my-campaigns', requireAuth, requireCreator, async (req, res) => {
  const rows = await db.prepare(`
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

// GET /api/campaigns/my-sponsor-offers – sponsor offers/deals for user's campaigns (dashboard)
router.get('/my-sponsor-offers', requireAuth, async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT sd.id, sd.offer_id, sd.campaign_id, sd.status, sd.budget_reserved_cents, sd.spent_cents, sd.created_at,
             so.name as offer_name, so.watermark_text, so.cpm_cents,
             c.title as campaign_title
      FROM sponsor_deals sd
      JOIN sponsor_offers so ON so.id = sd.offer_id
      JOIN campaigns c ON c.id = sd.campaign_id
      WHERE c.owner_id = ?
      ORDER BY sd.created_at DESC
    `).all(req.user.id);
    res.json(rows.map(r => ({
      id: r.id, offerId: r.offer_id, campaignId: r.campaign_id, campaignTitle: r.campaign_title,
      offerName: r.offer_name, watermarkText: r.watermark_text, cpmCents: r.cpm_cents,
      status: r.status, budgetReservedCents: r.budget_reserved_cents,
      spentCents: r.spent_cents || 0, createdAt: r.created_at,
    })));
  } catch (e) {
    res.json([]);
  }
});

// GET /api/campaigns/saved-drafts — start-campaign wizard drafts (authenticated owner)
router.get('/saved-drafts', requireAuth, async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT id, title, payload, created_at, updated_at FROM campaign_drafts WHERE owner_id = ? ORDER BY updated_at DESC
    `).all(req.user.id);
    res.json(rows.map(mapDraftRowToClient));
  } catch (e) {
    console.error('saved-drafts list', e);
    res.status(500).json({ error: 'Failed to load saved drafts' });
  }
});

// POST /api/campaigns/saved-drafts
router.post('/saved-drafts', requireAuth, async (req, res) => {
  const body = req.body || {};
  const id = uuid();
  const rawTitle = body.title != null ? String(body.title).trim() : '';
  const title = rawTitle || 'Untitled campaign';
  const payloadObj = {
    step: body.step,
    title: body.title,
    acceptSponsorOffers: body.acceptSponsorOffers,
    includeWatermark: body.includeWatermark,
    content: body.content,
    contentLinks: body.contentLinks,
    narrative: body.narrative,
    goal: body.goal,
    postsPerDay: body.postsPerDay,
    rows: body.rows,
  };
  const payload = JSON.stringify(payloadObj);
  try {
    await db.prepare(`
      INSERT INTO campaign_drafts (id, owner_id, title, payload) VALUES (?, ?, ?, ?)
    `).run(id, req.user.id, title, payload);
    const row = await db.prepare(`
      SELECT id, title, payload, created_at, updated_at FROM campaign_drafts WHERE id = ?
    `).get(id);
    res.status(201).json(mapDraftRowToClient(row));
  } catch (e) {
    console.error('saved-drafts create', e);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// DELETE /api/campaigns/saved-drafts/:draftId
router.delete('/saved-drafts/:draftId', requireAuth, async (req, res) => {
  const draftId = req.params.draftId;
  try {
    const result = await db.prepare(`
      DELETE FROM campaign_drafts WHERE id = ? AND owner_id = ?
    `).run(draftId, req.user.id);
    const n = result.changes != null ? result.changes : 0;
    if (!n) return res.status(404).json({ error: 'Draft not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('saved-drafts delete', e);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// GET /api/campaigns/:id/accounts – linked accounts (creator must own campaign)
router.get('/:id/accounts', requireAuth, async (req, res) => {
  const campaignId = req.params.id;
  const campaign = await db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  try {
    const rows = await db.prepare('SELECT id, platform, handle, created_at FROM campaign_accounts WHERE campaign_id = ? ORDER BY created_at')
      .all(campaignId);
    res.json(rows.map(r => ({ id: r.id, platform: r.platform, handle: r.handle, createdAt: r.created_at })));
  } catch (e) {
    res.json([]);
  }
});

// GET /api/campaigns/:id/posts – daily posts (creator must own campaign)
router.get('/:id/posts', requireAuth, async (req, res) => {
  const campaignId = req.params.id;
  const campaign = await db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  try {
    const rows = await db.prepare(`
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
router.get('/:id/sponsor-settings', requireAuth, async (req, res) => {
  const campaign = await db.prepare('SELECT owner_id, accept_sponsor_offers, allow_watermark, watermark_coupon_percent FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  res.json({
    acceptSponsorOffers: !!campaign.accept_sponsor_offers,
    allowWatermark: !!campaign.allow_watermark,
    watermarkCouponPercent: campaign.watermark_coupon_percent || 0,
  });
});

// GET /api/campaigns/:id/renewal-quote – next-week amount for owner (Stripe renewal on campaign-track)
router.get('/:id/renewal-quote', requireAuth, async (req, res) => {
  const WZ_FIRST = 8.99;
  const WZ_M2 = 13.99;
  const WZ_EXTRA = 2;
  const id = req.params.id;
  let row;
  try {
    row = await db.prepare(`
      SELECT id, owner_id, num_accounts, posts_per_day, allow_watermark, started_at
      FROM campaigns WHERE id = ?
    `).get(id);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load campaign' });
  }
  if (!row) return res.status(404).json({ error: 'Campaign not found' });
  if (row.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });

  const n = Math.max(1, parseInt(row.num_accounts, 10) || 1);
  const postsRaw = parseInt(row.posts_per_day, 10);
  const posts = Number.isFinite(postsRaw) ? Math.min(10, Math.max(3, postsRaw)) : 3;

  let inFirstPricingWindow = true;
  if (row.started_at) {
    const startMs = new Date(row.started_at).getTime();
    if (!Number.isNaN(startMs)) {
      inFirstPricingWindow = (Date.now() - startMs) < 7 * 24 * 60 * 60 * 1000;
    }
  }

  let amountUsd;
  if (inFirstPricingWindow) {
    let base = n * WZ_FIRST;
    if (row.allow_watermark) base *= 0.9;
    amountUsd = base;
  } else {
    amountUsd = n * (WZ_M2 + Math.max(0, posts - 3) * WZ_EXTRA);
  }

  const amountCents = Math.max(100, Math.round(amountUsd * 100));
  res.json({
    amountCents,
    amountUsd: Math.round(amountUsd * 100) / 100,
    numAccounts: n,
    postsPerDay: posts,
    pricingTier: inFirstPricingWindow ? 'first_week' : 'month_2_plus',
  });
});

// PUT /api/campaigns/:id/sponsor-settings – update (creator, own campaign)
router.put('/:id/sponsor-settings', requireAuth, async (req, res) => {
  const { acceptSponsorOffers, allowWatermark, watermarkCouponPercent } = req.body || {};
  const campaign = await db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  const accept = acceptSponsorOffers === true || acceptSponsorOffers === 1;
  const allow = allowWatermark === true || allowWatermark === 1;
  const coupon = Math.min(100, Math.max(0, parseFloat(watermarkCouponPercent) || 0));
  await db.prepare(`
    UPDATE campaigns SET accept_sponsor_offers = ?, allow_watermark = ?, watermark_coupon_percent = ?
    WHERE id = ?
  `).run(accept ? 1 : 0, allow ? 1 : 0, coupon, req.params.id);
  res.json({ acceptSponsorOffers: accept, allowWatermark: allow, watermarkCouponPercent: coupon });
});

// GET /api/campaigns/:id/sponsor-deals – list sponsor deals for this campaign (owner only)
router.get('/:id/sponsor-deals', requireAuth, async (req, res) => {
  const campaign = await db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  try {
    const rows = await db.prepare(`
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
router.post('/:id/join', requireAuth, requireCreator, async (req, res) => {
  const campaignId = req.params.id;
  const campaign = await db.prepare('SELECT id FROM campaigns WHERE id = ? AND status = ?').get(campaignId, 'active');
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  try {
    await db.prepare('INSERT INTO campaign_joins (user_id, campaign_id) VALUES (?, ?)').run(req.user.id, campaignId);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(400).json({ error: 'Already joined' });
    throw e;
  }
  res.json({ ok: true });
});

module.exports = router;
