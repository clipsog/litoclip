const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { requireAuth, requireCreator } = require('../middleware/auth');

const router = express.Router();

// GET /api/social-accounts
router.get('/', requireAuth, requireCreator, (req, res) => {
  const rows = db.prepare('SELECT id, platform, handle, status, verification_code FROM social_accounts WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(rows.map(r => ({
    id: r.id,
    platform: r.platform,
    handle: r.handle,
    status: r.status,
    verificationCode: r.verification_code,
  })));
});

// POST /api/social-accounts/generate-code
router.post('/generate-code', requireAuth, requireCreator, (req, res) => {
  const { platform, handle } = req.body || {};
  if (!platform || !handle) return res.status(400).json({ error: 'platform and handle required' });
  const code = 'LITO' + Math.random().toString(10).slice(2, 8);
  const id = uuid();
  db.prepare(`
    INSERT INTO social_accounts (id, user_id, platform, handle, status, verification_code)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(id, req.user.id, platform.toLowerCase(), handle.trim(), code);
  res.json({ accountId: id, code });
});

// POST /api/social-accounts/verify
router.post('/verify', requireAuth, requireCreator, (req, res) => {
  const { accountId, code, skipApiCheck } = req.body || {};
  if (!accountId || !code) return res.status(400).json({ error: 'accountId and code required' });
  const row = db.prepare('SELECT id, verification_code FROM social_accounts WHERE id = ? AND user_id = ?').get(accountId, req.user.id);
  if (!row) return res.status(404).json({ error: 'Account not found' });
  if (row.verification_code !== code) return res.status(400).json({ error: 'Invalid code' });
  db.prepare('UPDATE social_accounts SET status = ?, verification_code = NULL WHERE id = ?').run('verified', accountId);
  res.json({ ok: true });
});

// DELETE /api/social-accounts/:id
router.delete('/:id', requireAuth, requireCreator, (req, res) => {
  const result = db.prepare('DELETE FROM social_accounts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
