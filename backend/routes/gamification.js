const express = require('express');
const { db } = require('../db');
const { requireAuth, requireCreator } = require('../middleware/auth');

const router = express.Router();

// GET /api/gamification/profile
router.get('/profile', requireAuth, requireCreator, async (req, res) => {
  let row = await db.prepare('SELECT level, xp, streak, best_streak FROM gamification WHERE user_id = ?').get(req.user.id);
  if (!row) {
    await db.prepare('INSERT INTO gamification (user_id) VALUES (?)').run(req.user.id);
    row = { level: 1, xp: 0, streak: 0, best_streak: 0 };
  }
  const nextLevelXP = 100 * row.level;
  res.json({
    level: row.level,
    xp: row.xp,
    nextLevelXP,
    streak: row.streak,
    bestStreak: row.best_streak,
  });
});

// GET /api/gamification/achievements
router.get('/achievements', requireAuth, requireCreator, async (req, res) => {
  const rows = await db.prepare('SELECT type, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC').all(req.user.id);
  res.json(rows.map(r => ({ type: r.type, unlockedAt: r.unlocked_at })));
});

module.exports = router;
