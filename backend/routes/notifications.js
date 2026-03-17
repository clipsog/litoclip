const express = require('express');
const { db } = require('../db');
const { requireAuth, requireCreator } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications?limit=5
router.get('/', requireAuth, requireCreator, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '5', 10), 50);
  const rows = db.prepare(`
    SELECT id, type, read, payload, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(req.user.id, limit);
  res.json(rows.map(r => ({
    id: r.id,
    type: r.type,
    read: !!r.read,
    payload: r.payload ? JSON.parse(r.payload) : null,
    createdAt: r.created_at,
  })));
});

module.exports = router;
