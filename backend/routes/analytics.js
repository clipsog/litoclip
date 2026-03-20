const express = require('express');
const { db } = require('../db');
const { requireAuth, requireCreator } = require('../middleware/auth');

const router = express.Router();

// GET /api/analytics/creator – overview
router.get('/creator', requireAuth, requireCreator, async (req, res) => {
  const uid = req.user.id;
  const submissions = await db.prepare(`
    SELECT status, views, earnings FROM submissions WHERE user_id = ?
  `).all(uid);
  const totalViews = submissions.reduce((s, r) => s + (r.views || 0), 0);
  const totalEarnings = submissions.reduce((s, r) => s + (r.earnings || 0), 0);
  const approved = submissions.filter(r => r.status === 'approved').length;
  const totalSubs = submissions.length;
  const activeCampaigns = (await db.prepare('SELECT COUNT(DISTINCT campaign_id) as c FROM campaign_joins WHERE user_id = ?').get(uid)).c;
  const successRate = totalSubs ? Math.round((approved / totalSubs) * 100) : 0;
  res.json({
    totalEarnings,
    totalViews,
    activeCampaigns,
    successRate,
    totalSubmissions: totalSubs,
    approvedSubmissions: approved,
  });
});

// GET /api/analytics/creator/timeline?period=7d|30d|90d
router.get('/creator/timeline', requireAuth, requireCreator, async (req, res) => {
  const period = req.query.period || '7d';
  const days = period === '90d' ? 90 : period === '30d' ? 30 : 7;
  const rows = await db.prepare(`
    SELECT date(created_at) as d, SUM(views) as views
    FROM submissions WHERE user_id = ? AND created_at >= datetime('now', ?)
    GROUP BY date(created_at) ORDER BY d
  `).all(req.user.id, `-${days} days`);
  res.json({ labels: rows.map(r => r.d), data: rows.map(r => r.views || 0) });
});

// GET /api/analytics/creator/platforms
router.get('/creator/platforms', requireAuth, requireCreator, async (req, res) => {
  const rows = await db.prepare(`
    SELECT platform, SUM(views) as views FROM submissions WHERE user_id = ? GROUP BY platform
  `).all(req.user.id);
  const platforms = ['TikTok', 'YouTube', 'Instagram', 'X / Twitter'];
  res.json(platforms.map(p => ({
    platform: p,
    views: rows.find(r => r.platform && p.toLowerCase().includes(r.platform.toLowerCase()))?.views || 0,
  })));
});

// GET /api/analytics/campaign/:campaignId
router.get('/campaign/:campaignId', requireAuth, requireCreator, async (req, res) => {
  const joined = await db.prepare('SELECT 1 FROM campaign_joins WHERE user_id = ? AND campaign_id = ?').get(req.user.id, req.params.campaignId);
  if (!joined) return res.status(404).json({ error: 'Not found' });
  const rows = await db.prepare('SELECT views, earnings FROM submissions WHERE campaign_id = ? AND user_id = ?').all(req.params.campaignId, req.user.id);
  const totalViews = rows.reduce((s, r) => s + (r.views || 0), 0);
  const totalEarnings = rows.reduce((s, r) => s + (r.earnings || 0), 0);
  res.json({ totalViews, totalEarnings });
});

// GET /api/analytics/leaderboard?metric=views|earnings
router.get('/leaderboard', requireAuth, requireCreator, async (req, res) => {
  const metric = req.query.metric || 'views';
  const col = metric === 'earnings' ? 'earnings' : 'views';
  const rows = await db.prepare(`
    SELECT user_id, SUM(${col}) as total FROM submissions GROUP BY user_id ORDER BY total DESC LIMIT 20
  `).all();
  const userIds = rows.map(r => r.user_id);
  const names = {};
  for (const id of userIds) {
    const u = await db.prepare('SELECT name FROM users WHERE id = ?').get(id);
    if (u) names[id] = u.name;
  }
  res.json(rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    name: names[r.user_id] || 'Anonymous',
    [metric]: r.total,
  })));
});

module.exports = router;
