const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { optionalAuth, requireAuth, requireCreator } = require('../middleware/auth');
const { normalizeContentTypes, normalizeNicheTags, parseJsonArray } = require('../lib/creatorTaxonomy');
const { sendAdminNewCampaignEmail } = require('../services/mailer');

const router = express.Router();

async function ensureCampaignAccountPaymentSettingsTable() {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS campaign_account_payment_settings (
        campaign_id TEXT NOT NULL,
        campaign_account_id TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (campaign_id, campaign_account_id)
      )
    `).run();
  } catch (_) {
    /* best effort */
  }
}

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
  const notifyAcceptSponsor = !!acceptSponsorOffers;
  const notifyAllowWm = !!allowWatermark;
  const notifyWmPct = notifyAllowWm ? Math.min(100, Math.max(0, parseFloat(watermarkCouponPercent) || 10)) : 0;
  const platformsForEmail =
    Array.isArray(platforms) && platforms.length
      ? platforms.join(', ')
      : ((platform || '').trim() || '—');

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
  const owner = await db.prepare('SELECT name, email FROM users WHERE id = ?').get(ownerId);
  try {
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
  // Send admin email asynchronously so slow SMTP never blocks campaign creation response.
  Promise.resolve()
    .then(async () => {
      const emailResult = await sendAdminNewCampaignEmail({
        campaignId: id,
        campaignTitle: title.trim(),
        ownerName: owner && owner.name,
        ownerEmail: owner && owner.email,
        contentLink: contentLinkStored,
        platforms: platformsForEmail,
        numAccounts: num_accounts != null ? parseInt(num_accounts, 10) : null,
        allowWatermark: notifyAllowWm,
        watermarkCouponPercent: notifyWmPct,
        acceptSponsorOffers: notifyAcceptSponsor,
      });
      if (emailResult && emailResult.skipped) {
        console.warn('[campaigns.create] admin email skipped:', emailResult.reason || 'unknown reason');
      }
    })
    .catch((emailErr) => {
      console.warn('[campaigns.create] admin email failed:', emailErr && emailErr.message ? emailErr.message : emailErr);
    });
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
    let rows;
    try {
      rows = await db.prepare(`
        SELECT id, title, description, niche, goal, platform, platforms, num_accounts, budget, rpm, status, created_at, content_link,
               accept_sponsor_offers, allow_watermark, watermark_coupon_percent
        FROM campaigns WHERE owner_id = ? ORDER BY created_at DESC
      `).all(req.user.id);
    } catch (colErr) {
      if (colErr.message && colErr.message.includes('no such column')) {
        rows = await db.prepare(`
          SELECT id, title, description, niche, platform, platforms, num_accounts, budget, rpm, status, created_at, content_link
          FROM campaigns WHERE owner_id = ? ORDER BY created_at DESC
        `).all(req.user.id);
      } else throw colErr;
    }
    res.json(rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      niche: r.niche,
      goal: r.goal,
      platform: r.platform,
      platforms: r.platforms,
      num_accounts: r.num_accounts,
      budget: r.budget,
      status: r.status,
      contentLinks: r.content_link,
      createdAt: r.created_at,
      acceptSponsorOffers: r.accept_sponsor_offers != null ? !!r.accept_sponsor_offers : undefined,
      allowWatermark: r.allow_watermark != null ? !!r.allow_watermark : undefined,
      watermarkCouponPercent: r.watermark_coupon_percent != null ? r.watermark_coupon_percent : undefined,
    })));
  } catch (e) {
    if (e.message && e.message.includes('no such column') && e.message.includes('owner_id')) {
      res.json([]);
    } else throw e;
  }
});

// GET /api/campaigns/:id/details – editable campaign details (owner only)
router.get('/:id/details', requireAuth, async (req, res) => {
  let campaign;
  try {
    campaign = await db.prepare(`
      SELECT id, owner_id, title, description, niche, goal, platform, platforms, content_link
      FROM campaigns WHERE id = ?
    `).get(req.params.id);
  } catch (e) {
    if (e.message && e.message.includes('no such column')) {
      campaign = await db.prepare(`
        SELECT id, owner_id, title, description, niche, platform, platforms, content_link
        FROM campaigns WHERE id = ?
      `).get(req.params.id);
    } else {
      throw e;
    }
  }
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  res.json({
    id: campaign.id,
    title: campaign.title || '',
    description: campaign.description || '',
    niche: campaign.niche || '',
    goal: campaign.goal || '',
    platform: campaign.platform || '',
    platforms: campaign.platforms || '',
    contentLinks: campaign.content_link || '',
  });
});

// PUT /api/campaigns/:id/details – update editable campaign details (owner only)
router.put('/:id/details', requireAuth, async (req, res) => {
  let campaign;
  let supportsGoalColumn = true;
  try {
    campaign = await db.prepare(`
      SELECT id, owner_id, description, niche, goal, content_link
      FROM campaigns WHERE id = ?
    `).get(req.params.id);
  } catch (e) {
    if (e.message && e.message.includes('no such column')) {
      supportsGoalColumn = false;
      campaign = await db.prepare(`
        SELECT id, owner_id, description, niche, content_link
        FROM campaigns WHERE id = ?
      `).get(req.params.id);
    } else {
      throw e;
    }
  }
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });

  const nextDescription = String((req.body || {}).description || '').trim();
  const nextNiche = String((req.body || {}).niche || '').trim();
  const nextGoal = String((req.body || {}).goal || '').trim();
  const contentLinksInput = (req.body || {}).contentLinks;
  let nextContentLink = '';
  if (Array.isArray(contentLinksInput)) {
    nextContentLink = contentLinksInput.map((v) => String(v || '').trim()).filter(Boolean).join('\n');
  } else {
    nextContentLink = String(contentLinksInput || '').trim();
  }

  if (supportsGoalColumn) {
    await db.prepare(`
      UPDATE campaigns
      SET description = ?, niche = ?, goal = ?, content_link = ?
      WHERE id = ?
    `).run(
      nextDescription || null,
      nextNiche || null,
      nextGoal || null,
      nextContentLink || null,
      req.params.id
    );
  } else {
    await db.prepare(`
      UPDATE campaigns
      SET description = ?, niche = ?, content_link = ?
      WHERE id = ?
    `).run(
      nextDescription || null,
      nextNiche || null,
      nextContentLink || null,
      req.params.id
    );
  }

  try {
    const owner = await db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.user.id);
    const changes = [];
    if ((campaign.description || '') !== nextDescription) changes.push('narrative');
    if ((campaign.niche || '') !== nextNiche) changes.push('angle');
    if ((campaign.goal || '') !== nextGoal) changes.push('purpose');
    if ((campaign.content_link || '') !== nextContentLink) changes.push('content links');
    if (changes.length) {
      await db.prepare(`
        INSERT INTO admin_alerts (id, type, entity_type, entity_id, title, message, read)
        VALUES (?, 'campaign_details_updated', 'campaign', ?, ?, ?, 0)
      `).run(
        uuid(),
        req.params.id,
        'Campaign details updated',
        (owner ? owner.name + ' (' + owner.email + ')' : 'User') +
          ' updated campaign details: ' + changes.join(', ')
      );
    }
  } catch (_) {}

  res.json({
    ok: true,
    description: nextDescription,
    niche: nextNiche,
    goal: nextGoal,
    contentLinks: nextContentLink
  });
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

// DELETE /api/campaigns/:id (for pending campaigns)
router.delete('/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const campaign = await db.prepare('SELECT owner_id, status FROM campaigns WHERE id = ?').get(id);
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    
    // Postgres strict foreign-key cleanup
    try { await db.prepare('DELETE FROM payments WHERE campaign_id = ?').run(id); } catch (e) {}
    try { await db.prepare('DELETE FROM sponsor_deals WHERE campaign_id = ?').run(id); } catch (e) {}
    try { await db.prepare('DELETE FROM submissions WHERE campaign_id = ?').run(id); } catch (e) {}
    try { await db.prepare('DELETE FROM campaign_joins WHERE campaign_id = ?').run(id); } catch (e) {}
    try { await db.prepare('DELETE FROM campaign_posts WHERE campaign_id = ?').run(id); } catch (e) {}
    try { await db.prepare('DELETE FROM campaign_accounts WHERE campaign_id = ?').run(id); } catch (e) {}
    
    await db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
    
    // Also cleanup alerts which might reference its ID (no foreign key check, but good hygiene)
    try { await db.prepare("DELETE FROM admin_alerts WHERE entity_id = ? AND entity_type = 'campaign'").run(id); } catch (e) {}

    res.json({ ok: true, deleted: true });
  } catch (e) {
    console.error('DELETE /campaigns/:id 500 Error:', e);
    res.status(500).json({ error: e.message || 'Failed to delete' });
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
  let campaign;
  try {
    campaign = await db.prepare(
      'SELECT owner_id, accept_sponsor_offers, allow_watermark, watermark_coupon_percent FROM campaigns WHERE id = ?'
    ).get(req.params.id);
  } catch (e) {
    if (e.message && e.message.includes('no such column')) {
      campaign = await db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(req.params.id);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
      return res.json({
        acceptSponsorOffers: false,
        allowWatermark: false,
        watermarkCouponPercent: 0,
      });
    }
    throw e;
  }
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  res.json({
    acceptSponsorOffers: !!campaign.accept_sponsor_offers,
    allowWatermark: !!campaign.allow_watermark,
    watermarkCouponPercent: campaign.watermark_coupon_percent != null ? campaign.watermark_coupon_percent : 0,
  });
});

// GET /api/campaigns/:id/renewal-quote – next-week amount for owner (Stripe renewal on campaign-track)
router.get('/:id/renewal-quote', requireAuth, async (req, res) => {
  const BASE_PRICE = 19.99;
  const EXTRA_POST_PRICE = 2;
  const id = req.params.id;
  
  let row;
  try {
    row = await db.prepare(`
      SELECT id, owner_id, num_accounts, posts_per_day, allow_watermark, watermark_coupon_percent
      FROM campaigns WHERE id = ?
    `).get(id);
  } catch (e) {
    if (e.message && e.message.includes('no such column')) {
      try {
        row = await db.prepare(`
          SELECT id, owner_id, num_accounts, allow_watermark
          FROM campaigns WHERE id = ?
        `).get(id);
        if (row) row.posts_per_day = 3;
        if (row) row.watermark_coupon_percent = 10;
      } catch (e2) {
        return res.status(500).json({ error: 'Failed to load campaign schema fallback' });
      }
    } else {
      return res.status(500).json({ error: 'Failed to load campaign' });
    }
  }
  if (!row) return res.status(404).json({ error: 'Campaign not found' });
  if (row.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });

  let n = Math.max(1, parseInt(row.num_accounts, 10) || 1);
  await ensureCampaignAccountPaymentSettingsTable();
  try {
    const accountRows = await db.prepare('SELECT id FROM campaign_accounts WHERE campaign_id = ? ORDER BY created_at').all(id);
    if (Array.isArray(accountRows) && accountRows.length > 0) {
      const settingsRows = await db.prepare(`
        SELECT campaign_account_id, is_active
        FROM campaign_account_payment_settings
        WHERE campaign_id = ?
      `).all(id);
      const activeMap = {};
      (settingsRows || []).forEach((s) => { activeMap[s.campaign_account_id] = s.is_active !== 0; });
      const activeCount = accountRows.filter((a) => activeMap[a.id] !== false).length;
      n = Math.max(1, activeCount || accountRows.length);
    }
  } catch (_) {
    /* fallback to campaign.num_accounts */
  }
  const postsRaw = parseInt(row.posts_per_day, 10);
  const posts = Number.isFinite(postsRaw) ? Math.min(10, Math.max(3, postsRaw)) : 3;

  let baseUsd = (n * BASE_PRICE) + (n * Math.max(0, posts - 3) * EXTRA_POST_PRICE);
  
  let discountPercent = 0;
  if (row.allow_watermark) {
    const pct = Math.min(100, Math.max(0, parseFloat(row.watermark_coupon_percent) || 10));
    discountPercent = pct;
    baseUsd *= (1 - (pct / 100));
  }
  
  const amountCents = Math.max(100, Math.round(baseUsd * 100));
  res.json({
    amountCents,
    amountUsd: Math.round(baseUsd * 100) / 100,
    numAccounts: n,
    postsPerDay: posts,
    discountPercent,
    allowWatermark: !!row.allow_watermark,
    pricingTier: 'standard'
  });
});

// GET /api/campaigns/:id/payment-settings – owner payment controls for next renewal
router.get('/:id/payment-settings', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT owner_id, num_accounts FROM campaigns WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Campaign not found' });
  if (row.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  await ensureCampaignAccountPaymentSettingsTable();
  let accounts = [];
  try {
    const accountRows = await db.prepare('SELECT id, platform, handle FROM campaign_accounts WHERE campaign_id = ? ORDER BY created_at').all(req.params.id);
    const settingsRows = await db.prepare(`
      SELECT campaign_account_id, is_active
      FROM campaign_account_payment_settings
      WHERE campaign_id = ?
    `).all(req.params.id);
    const activeMap = {};
    (settingsRows || []).forEach((s) => { activeMap[s.campaign_account_id] = s.is_active !== 0; });
    accounts = (accountRows || []).map((a) => ({
      id: a.id,
      platform: a.platform,
      handle: a.handle,
      activeForPayment: activeMap[a.id] !== false,
    }));
  } catch (_) {
    accounts = [];
  }
  res.json({
    numAccounts: Math.max(1, parseInt(row.num_accounts, 10) || 1),
    accounts
  });
});

// PUT /api/campaigns/:id/payment-settings – update next renewal active accounts
router.put('/:id/payment-settings', requireAuth, async (req, res) => {
  const campaign = await db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
  await ensureCampaignAccountPaymentSettingsTable();
  const activeIds = Array.isArray((req.body || {}).activeAccountIds)
    ? (req.body || {}).activeAccountIds.map((x) => String(x))
    : [];
  try {
    const accountRows = await db.prepare('SELECT id, handle, platform FROM campaign_accounts WHERE campaign_id = ? ORDER BY created_at').all(req.params.id);
    const validIds = new Set((accountRows || []).map((a) => String(a.id)));
    if ((accountRows || []).length > 0) {
      const owner = await db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.user.id);
      const filtered = activeIds.filter((id) => validIds.has(id));
      if (filtered.length < 1) return res.status(400).json({ error: 'At least one account must stay active for next payment' });
      await db.prepare('DELETE FROM campaign_account_payment_settings WHERE campaign_id = ?').run(req.params.id);
      for (const a of accountRows) {
        const isActive = filtered.includes(String(a.id)) ? 1 : 0;
        await db.prepare(`
          INSERT INTO campaign_account_payment_settings (campaign_id, campaign_account_id, is_active)
          VALUES (?, ?, ?)
        `).run(req.params.id, a.id, isActive);
      }
      await db.prepare('UPDATE campaigns SET num_accounts = ? WHERE id = ?').run(filtered.length, req.params.id);
      try {
        const activeHandles = accountRows
          .filter((a) => filtered.includes(String(a.id)))
          .map((a) => '@' + String(a.handle || '').replace(/^@/, ''))
          .filter(Boolean)
          .join(', ');
        await db.prepare(`
          INSERT INTO admin_alerts (id, type, entity_type, entity_id, title, message, read)
          VALUES (?, 'campaign_payment_settings_updated', 'campaign', ?, ?, ?, 0)
        `).run(
          uuid(),
          req.params.id,
          'Campaign account choices updated',
          (owner ? owner.name + ' (' + owner.email + ')' : 'User') +
            ' updated active accounts for next renewal: ' + filtered.length + '/' + accountRows.length +
            (activeHandles ? (' — ' + activeHandles) : '')
        );
      } catch (_) {}
      return res.json({ ok: true, activeAccountIds: filtered, numAccounts: filtered.length });
    }
  } catch (_) {}
  const numRaw = parseInt((req.body || {}).numAccounts, 10);
  const num = Math.min(50, Math.max(1, Number.isFinite(numRaw) ? numRaw : 1));
  await db.prepare('UPDATE campaigns SET num_accounts = ? WHERE id = ?').run(num, req.params.id);
  res.json({ ok: true, numAccounts: num, activeAccountIds: [] });
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
  try {
    const owner = await db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.user.id);
    await db.prepare(`
      INSERT INTO admin_alerts (id, type, entity_type, entity_id, title, message, read)
      VALUES (?, 'campaign_sponsor_settings_updated', 'campaign', ?, ?, ?, 0)
    `).run(
      uuid(),
      req.params.id,
      'Campaign sponsor/watermark settings updated',
      (owner ? owner.name + ' (' + owner.email + ')' : 'User') +
        ' changed watermark to ' + (allow ? ('ON (' + coupon + '% discount)') : 'OFF') +
        ' and sponsor offers to ' + (accept ? 'ON' : 'OFF')
    );
  } catch (_) {}
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
