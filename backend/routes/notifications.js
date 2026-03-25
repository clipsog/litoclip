const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications?limit=10
router.get('/', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '5', 10), 50);
  const rows = await db.prepare(`
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

// GET /api/notifications/unread-count
router.get('/unread-count', requireAuth, async (req, res) => {
  const row = await db.prepare(`
    SELECT COUNT(1) as c FROM notifications WHERE user_id = ? AND (read = 0 OR read IS NULL)
  `).get(req.user.id);
  res.json({ unread: row?.c || 0 });
});

// POST /api/notifications/mark-read { ids: string[] }
router.post('/mark-read', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const clean = ids.map(String).filter(Boolean);
  if (!clean.length) return res.json({ ok: true, updated: 0 });

  const placeholders = clean.map(() => '?').join(', ');
  const result = await db.prepare(`
    UPDATE notifications SET read = 1
    WHERE user_id = ? AND id IN (${placeholders})
  `).run(req.user.id, ...clean);
  res.json({ ok: true, updated: result?.changes || 0 });
});

// POST /api/notifications/mark-all-read
router.post('/mark-all-read', requireAuth, async (req, res) => {
  const result = await db.prepare(`
    UPDATE notifications SET read = 1 WHERE user_id = ? AND (read = 0 OR read IS NULL)
  `).run(req.user.id);
  res.json({ ok: true, updated: result?.changes || 0 });
});

module.exports = router;
