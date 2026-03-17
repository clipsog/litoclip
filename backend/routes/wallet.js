const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { requireAuth, requireCreator } = require('../middleware/auth');

const router = express.Router();

// GET /api/wallet/balance and GET /api/wallet (same)
function getBalance(userId) {
  const row = db.prepare('SELECT * FROM wallet_balances WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO wallet_balances (user_id) VALUES (?)').run(userId);
    return { availableBalance: 0, pendingBalance: 0, pendingPayouts: 0, totalPaid: 0, totalEarnings: 0 };
  }
  const pendingPayouts = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payout_requests WHERE user_id = ? AND status = ?').get(userId, 'pending');
  return {
    availableBalance: row.available_balance || 0,
    pendingBalance: row.pending_balance || 0,
    pendingPayouts: pendingPayouts?.total || 0,
    totalPaid: row.total_paid || 0,
    totalEarnings: row.total_earnings || 0,
  };
}

router.get('/balance', requireAuth, requireCreator, (req, res) => {
  res.json(getBalance(req.user.id));
});

router.get('/', requireAuth, requireCreator, (req, res) => {
  res.json(getBalance(req.user.id));
});

// GET /api/wallet/payouts
router.get('/payouts', requireAuth, requireCreator, (req, res) => {
  const rows = db.prepare('SELECT id, amount, payment_method, status, created_at FROM payout_requests WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(rows.map(r => ({
    id: r.id,
    amount: r.amount,
    paymentMethod: r.payment_method,
    status: r.status,
    createdAt: r.created_at,
  })));
});

// POST /api/wallet/withdraw
router.post('/withdraw', requireAuth, requireCreator, (req, res) => {
  const { amount, paymentMethod, paymentDetails, notes } = req.body || {};
  if (!amount || amount < 10) return res.status(400).json({ error: 'Minimum withdrawal is $10' });
  const bal = getBalance(req.user.id);
  if (amount > bal.availableBalance) return res.status(400).json({ error: 'Insufficient balance' });
  const id = uuid();
  db.prepare(`
    INSERT INTO payout_requests (id, user_id, amount, payment_method, payment_details, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(id, req.user.id, amount, paymentMethod || 'paypal', JSON.stringify(paymentDetails || {}), notes || '');
  db.prepare('UPDATE wallet_balances SET available_balance = available_balance - ?, updated_at = datetime("now") WHERE user_id = ?').run(amount, req.user.id);
  res.json({ ok: true, id });
});

module.exports = router;
