const express = require('express');
const { db } = require('../db');
const { requireAuth, requireCreator } = require('../middleware/auth');

const router = express.Router();

// GET /api/leaderboards?metric=views|earnings&limit=10
router.get('/', requireAuth, requireCreator, async (req, res) => {
  const metric = req.query.metric || 'views';
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 100);
  const col = metric === 'earnings' ? 'earnings' : 'views';
  const rows = await db.prepare(`
    SELECT user_id, SUM(${col}) as total FROM submissions GROUP BY user_id ORDER BY total DESC LIMIT ?
  `).all(limit);
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

// GET /api/leaderboards/my-position
router.get('/my-position', requireAuth, requireCreator, async (req, res) => {
  const metric = req.query.metric || 'views';
  const col = metric === 'earnings' ? 'earnings' : 'views';
  const myTotal = (await db.prepare(`SELECT COALESCE(SUM(${col}), 0) as total FROM submissions WHERE user_id = ?`).get(req.user.id)).total;
  const above = (await db.prepare(`
    SELECT COUNT(DISTINCT user_id) as c FROM (
      SELECT user_id, SUM(${col}) as t FROM submissions GROUP BY user_id HAVING t > ?
    )
  `).get(myTotal)).c;
  res.json({ position: above + 1, [metric]: myTotal });
});

module.exports = router;
