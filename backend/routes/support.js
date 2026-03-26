const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// POST /api/support/requests
// Records a support request (for admin notification + email workflow).
router.post('/requests', async (req, res) => {
  const { message, page } = req.body || {};
  const msg = String(message || '').trim();

  if (!msg) return res.status(400).json({ error: 'message required' });

  const userId = req.user && req.user.id ? req.user.id : null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const id = uuid();
  const pageStr = page ? String(page).slice(0, 300) : null;
  const snippet = msg.length > 900 ? msg.slice(0, 900) + '...' : msg;
  const title = (req.user.email ? ('Support request from ' + req.user.email) : 'Support request');
  const body = pageStr ? (snippet + ' (Page: ' + pageStr + ')') : snippet;

  await db.prepare(`
    INSERT INTO admin_alerts (id, type, entity_type, entity_id, title, message, read)
    VALUES (?, 'support_request', 'user', ?, ?, ?, 0)
  `).run(id, userId, title, body);

  res.status(201).json({ ok: true, id });
});

module.exports = router;

