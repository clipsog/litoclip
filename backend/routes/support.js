const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// POST /api/support/requests
router.post('/requests', async (req, res) => {
  const { message, subject, page } = req.body || {};
  const msg = String(message || '').trim();
  const subj = subject != null ? String(subject || '').trim() : '';

  if (!msg) return res.status(400).json({ error: 'message required' });

  const userId = req.user && req.user.id ? req.user.id : null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const id = uuid();
  const pageStr = page ? String(page).slice(0, 300) : null;
  const snippet = msg.length > 900 ? msg.slice(0, 900) + '...' : msg;
  const title = subj || (req.user.email ? ('Support request from ' + req.user.email) : 'Support request');
  const body = pageStr ? (snippet + ' (Page: ' + pageStr + ')') : snippet;

  await db.prepare(`
    INSERT INTO admin_alerts (id, type, entity_type, entity_id, title, message, read)
    VALUES (?, 'support_request', 'user', ?, ?, ?, 0)
  `).run(id, userId, title, body);

  res.status(201).json({ ok: true, id });
});

// GET /api/support/inbox
// Returns the user's support request + reply history.
router.get('/inbox', async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT id, type, title, message, read, created_at
      FROM admin_alerts
      WHERE entity_type = 'user'
        AND entity_id = ?
        AND (type = 'support_request' OR type = 'support_reply')
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id);

    res.json(rows.map(r => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      read: !!r.read,
      createdAt: r.created_at,
    })));
  } catch (e) {
    res.json([]);
  }
});

// GET /api/support/replies/unread-count
router.get('/replies/unread-count', async (req, res) => {
  try {
    const row = await db.prepare(`
      SELECT COUNT(1) as c
      FROM notifications
      WHERE user_id = ?
        AND type = 'support_reply'
        AND (read = 0 OR read IS NULL)
    `).get(req.user.id);
    res.json({ unread: row?.c || 0 });
  } catch (e) {
    res.json({ unread: 0 });
  }
});

// POST /api/support/replies/mark-read-all
router.post('/replies/mark-read-all', async (req, res) => {
  try {
    await db.prepare(`
      UPDATE notifications
      SET read = 1
      WHERE user_id = ?
        AND type = 'support_reply'
        AND (read = 0 OR read IS NULL)
    `).run(req.user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;

