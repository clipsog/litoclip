const express = require('express');
const config = require('../config');
const { db } = require('../db');
const { requireAuth, requireCreator } = require('../middleware/auth');

const router = express.Router();

// GET /api/affiliate/dashboard
router.get('/dashboard', requireAuth, requireCreator, async (req, res) => {
  const u = await db.prepare('SELECT referral_code FROM users WHERE id = ?').get(req.user.id);
  const code = u?.referral_code || '';
  const referred = (await db.prepare('SELECT COUNT(*) as c FROM users WHERE referred_by = ?').get(req.user.id)).c;
  const commissions = await db.prepare(`
    SELECT SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid,
           SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending
    FROM affiliate_commissions WHERE referrer_id = ?
  `).get(req.user.id);
  res.json({
    referralCode: code,
    referralLink: `${config.frontendOrigin}/?ref=${code}`,
    referred,
    totalEarned: commissions?.paid || 0,
    pending: commissions?.pending || 0,
    paidOut: commissions?.paid || 0,
  });
});

module.exports = router;
