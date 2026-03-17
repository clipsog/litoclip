const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { requireAuth, requireCreator } = require('../middleware/auth');

const router = express.Router();

// GET /api/submissions ? status=all|pending|approved|rejected
router.get('/', requireAuth, requireCreator, (req, res) => {
  const status = req.query.status;
  let sql = 'SELECT id, user_id, campaign_id, platform, post_url, status, views, likes, earnings, created_at FROM submissions WHERE user_id = ?';
  const params = [req.user.id];
  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  const submissions = rows.map(r => ({
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
  }));
  res.json(submissions);
});

// POST /api/submissions
router.post('/', requireAuth, requireCreator, (req, res) => {
  const { campaignId, platform, postUrl, accountInfo } = req.body || {};
  if (!campaignId || !platform || !postUrl) {
    return res.status(400).json({ error: 'campaignId, platform and postUrl required' });
  }
  const joined = db.prepare('SELECT 1 FROM campaign_joins WHERE user_id = ? AND campaign_id = ?').get(req.user.id, campaignId);
  if (!joined) return res.status(403).json({ error: 'Join the campaign first' });
  const id = uuid();
  db.prepare(`
    INSERT INTO submissions (id, user_id, campaign_id, platform, post_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.user.id, campaignId, platform, postUrl);
  const row = db.prepare('SELECT id, user_id, campaign_id, platform, post_url, status, views, likes, earnings, created_at FROM submissions WHERE id = ?').get(id);
  res.status(201).json({
    id: row.id,
    userId: row.user_id,
    campaignId: row.campaign_id,
    platform: row.platform,
    postUrl: row.post_url,
    status: row.status,
    views: row.views,
    likes: row.likes,
    earnings: row.earnings,
    createdAt: row.created_at,
  });
});

// POST /api/submissions/batch
router.post('/batch', requireAuth, requireCreator, (req, res) => {
  const { submissions: items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'submissions array required' });
  }
  const created = [];
  for (const s of items) {
    const { campaignId, platform, postUrl, accountInfo } = s;
    if (!campaignId || !platform || !postUrl) continue;
    const joined = db.prepare('SELECT 1 FROM campaign_joins WHERE user_id = ? AND campaign_id = ?').get(req.user.id, campaignId);
    if (!joined) continue;
    const id = uuid();
    db.prepare(`
      INSERT INTO submissions (id, user_id, campaign_id, platform, post_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, req.user.id, campaignId, platform, postUrl);
    const row = db.prepare('SELECT id, platform, post_url, status, views, likes, earnings, created_at FROM submissions WHERE id = ?').get(id);
    created.push(row);
  }
  res.status(201).json({ submissions: created });
});

// POST /api/submissions/:id/refresh-engagement (stub)
router.post('/:id/refresh-engagement', requireAuth, requireCreator, (req, res) => {
  const row = db.prepare('SELECT id FROM submissions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
