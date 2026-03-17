const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const config = require('../config');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function generateReferralCode() {
  return 'REF' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

// POST /api/auth/signup
router.post('/signup', (req, res) => {
  const { name, email, password, userType, firstName, lastName, position } = req.body || {};
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || name || '';
  if (!displayName || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email already registered' });
  const id = uuid();
  const referralCode = generateReferralCode();
  const passwordHash = bcrypt.hashSync(password, 10);
  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, name, user_type, referral_code, first_name, last_name, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  try {
    stmt.run(id, email, passwordHash, displayName, userType || 'creator', referralCode, firstName || null, lastName || null, position || null);
  } catch (e) {
    if (e.message && e.message.includes('no such column')) {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, user_type, referral_code)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, email, passwordHash, displayName, userType || 'creator', referralCode);
    } else throw e;
  }
  db.prepare('INSERT OR IGNORE INTO wallet_balances (user_id) VALUES (?)').run(id);
  db.prepare('INSERT OR IGNORE INTO gamification (user_id) VALUES (?)').run(id);
  db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(id);
  const token = jwt.sign({ userId: id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const user = { id, name: displayName, email, userType: userType || 'creator', referralCode, firstName: firstName || null, lastName: lastName || null, position: position || null };
  res.json({ token, user });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const row = db.prepare('SELECT id, password_hash, name, email, user_type, referral_code FROM users WHERE email = ?').get(email);
  if (!row || !bcrypt.compareSync(password, row.password_hash || '')) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ userId: row.id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const user = { id: row.id, name: row.name, email: row.email, userType: row.user_type, referralCode: row.referral_code };
  res.json({ token, user });
});

// POST /api/auth/logout (optional: blacklist token; we don't)
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const u = req.user;
  const full = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(u.id);
  const gam = db.prepare('SELECT level, xp, streak, best_streak FROM gamification WHERE user_id = ?').get(u.id);
  const nextLevelXP = 100 * (gam ? gam.level : 1);
  res.json({
    id: u.id,
    name: u.name,
    email: u.email,
    userType: u.user_type,
    referralCode: u.referral_code,
    isAdmin: !!(full && full.is_admin),
    level: gam ? gam.level : 1,
    xp: gam ? gam.xp : 0,
    xpToNextLevel: nextLevelXP,
    streak: gam ? gam.streak : 0,
    bestStreak: gam ? gam.best_streak : 0,
  });
});

// PUT /api/auth/profile (name)
router.put('/profile', requireAuth, (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), req.user.id);
  res.json({ ok: true });
});

// PUT /api/auth/email
router.put('/email', requireAuth, (req, res) => {
  const { email } = req.body || {};
  if (!email || !email.trim()) return res.status(400).json({ error: 'Email required' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.trim(), req.user.id);
  if (existing) return res.status(400).json({ error: 'Email already in use' });
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email.trim(), req.user.id);
  res.json({ ok: true });
});

// PUT /api/auth/password
router.put('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!row || !bcrypt.compareSync(currentPassword || '', row.password_hash || '')) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ ok: true });
});

// DELETE /api/auth/account
router.delete('/account', requireAuth, (req, res) => {
  const { password } = req.body || {};
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!row || !bcrypt.compareSync(password || '', row.password_hash || '')) {
    return res.status(401).json({ error: 'Password required to delete account' });
  }
  db.prepare('DELETE FROM submissions WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM campaign_joins WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM wallet_balances WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM payout_requests WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM social_accounts WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM gamification WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM achievements WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM notification_prefs WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

// GET /api/auth/notifications (preferences)
router.get('/notifications', requireAuth, (req, res) => {
  const row = db.prepare('SELECT email_notifications, push_notifications FROM notification_prefs WHERE user_id = ?').get(req.user.id);
  res.json(row || { email_notifications: 1, push_notifications: 1 });
});

// PUT /api/auth/notifications
router.put('/notifications', requireAuth, (req, res) => {
  const { emailNotifications, pushNotifications } = req.body || {};
  db.prepare(`
    INSERT INTO notification_prefs (user_id, email_notifications, push_notifications)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email_notifications = excluded.email_notifications,
      push_notifications = excluded.push_notifications
  `).run(req.user.id, emailNotifications !== undefined ? (emailNotifications ? 1 : 0) : 1, pushNotifications !== undefined ? (pushNotifications ? 1 : 0) : 1);
  res.json({ ok: true });
});

module.exports = router;
