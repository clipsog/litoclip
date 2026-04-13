const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const config = require('../config');
const { db } = require('../db');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { normalizeContentTypes, normalizeNicheTags, parseJsonArray } = require('../lib/creatorTaxonomy');
const { parseUserRoles, hasCreatorRole } = require('../lib/userRoles');

const router = express.Router();

router.use(optionalAuth);

function generateReferralCode() {
  return 'REF' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

router.post('/signup', async (req, res) => {
  const { name, email, password, userType, firstName, lastName, position, creatorContentTypes, creatorNicheTags } = req.body || {};
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || name || '';
  if (!displayName || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password required' });
  }
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email already registered' });
  const id = uuid();
  const referralCode = generateReferralCode();
  const passwordHash = bcrypt.hashSync(password, 10);
  const ut = ['creator', 'brand', 'sponsor'].includes(userType) ? userType : 'creator';
  const ct = normalizeContentTypes(creatorContentTypes);
  const nicheTags = normalizeNicheTags(creatorNicheTags);
  if (ut === 'creator') {
    if (ct.length < 1) return res.status(400).json({ error: 'Select at least one content type' });
    if (nicheTags.length < 1) return res.status(400).json({ error: 'Add at least one niche tag' });
  }
  try {
    await db.prepare(`
    INSERT INTO users (id, email, password_hash, name, user_type, referral_code, first_name, last_name, user_position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, passwordHash, displayName, ut, referralCode, firstName || null, lastName || null, position || null);
  } catch (e) {
    if (e.message && e.message.includes('no such column')) {
      await db.prepare(`
        INSERT INTO users (id, email, password_hash, name, user_type, referral_code)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, email, passwordHash, displayName, ut, referralCode);
    } else throw e;
  }
  await db.prepare('INSERT OR IGNORE INTO wallet_balances (user_id) VALUES (?)').run(id);
  await db.prepare('INSERT OR IGNORE INTO gamification (user_id) VALUES (?)').run(id);
  await db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(id);
  if (ut === 'sponsor') {
    try { await db.prepare('INSERT OR IGNORE INTO sponsor_wallets (user_id) VALUES (?)').run(id); } catch (_) {}
  }
  if (ut === 'creator') {
    try {
      await db.prepare('UPDATE users SET creator_content_types = ?, creator_niche_tags = ? WHERE id = ?').run(JSON.stringify(ct), JSON.stringify(nicheTags), id);
    } catch (_) {}
  }
  try {
    await db.prepare('UPDATE users SET user_roles = ? WHERE id = ?').run(JSON.stringify([ut]), id);
  } catch (_) {}
  const token = jwt.sign({ userId: id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const user = {
    id, name: displayName, email, userType: ut, referralCode,
    firstName: firstName || null, lastName: lastName || null, position: position || null,
    userRoles: [ut],
    creatorContentTypes: ut === 'creator' ? ct : undefined,
    creatorNicheTags: ut === 'creator' ? nicheTags : undefined,
  };
  res.json({ token, user });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  let row;
  try {
    row = await db.prepare('SELECT id, password_hash, name, email, user_type, referral_code, user_roles, is_admin FROM users WHERE email = ?').get(email);
  } catch (e) {
    try {
      row = await db.prepare('SELECT id, password_hash, name, email, user_type, referral_code, user_roles FROM users WHERE email = ?').get(email);
    } catch (e2) {
      row = await db.prepare('SELECT id, password_hash, name, email, user_type, referral_code FROM users WHERE email = ?').get(email);
    }
  }
  if (!row || !bcrypt.compareSync(password, row.password_hash || '')) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ userId: row.id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const userRoles = parseUserRoles(row);
  const user = {
    id: row.id, name: row.name, email: row.email, userType: row.user_type, referralCode: row.referral_code,
    userRoles,
    isAdmin: !!(row.is_admin === 1 || row.is_admin === true),
  };
  res.json({ token, user });
});

router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const u = req.user;
  let full;
  try {
    full = await db.prepare('SELECT is_admin, first_name, last_name, user_position, creator_content_types, creator_niche_tags FROM users WHERE id = ?').get(u.id);
  } catch (_) {
    full = await db.prepare('SELECT is_admin, first_name, last_name, user_position FROM users WHERE id = ?').get(u.id);
  }
  const gam = await db.prepare('SELECT level, xp, streak, best_streak FROM gamification WHERE user_id = ?').get(u.id);
  const nextLevelXP = 100 * (gam ? gam.level : 1);
  const position = full && full.user_position ? full.user_position : null;
  const creatorContentTypes = full && full.creator_content_types != null ? parseJsonArray(full.creator_content_types) : [];
  const creatorNicheTags = full && full.creator_niche_tags != null ? parseJsonArray(full.creator_niche_tags) : [];
  res.json({
    id: u.id,
    name: u.name,
    email: u.email,
    userType: u.user_type,
    referralCode: u.referral_code,
    isAdmin: !!(full && full.is_admin),
    firstName: full && full.first_name ? full.first_name : null,
    lastName: full && full.last_name ? full.last_name : null,
    position,
    needsOnboarding: !position || position === '',
    creatorContentTypes: u.user_type === 'creator' ? creatorContentTypes : undefined,
    creatorNicheTags: u.user_type === 'creator' ? creatorNicheTags : undefined,
    level: gam ? gam.level : 1,
    xp: gam ? gam.xp : 0,
    xpToNextLevel: nextLevelXP,
    streak: gam ? gam.streak : 0,
    bestStreak: gam ? gam.best_streak : 0,
  });
});

router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const { name, firstName, lastName, position, creatorContentTypes, creatorNicheTags } = body;
    const updates = [];
    const vals = [];
    const safeStr = (v) => (v != null && typeof v === 'string' && v.trim()) ? v.trim() : null;
    if (name !== undefined && name !== null && typeof name === 'string' && name.trim()) {
      updates.push('name = ?'); vals.push(name.trim());
    }
    if (firstName !== undefined) { updates.push('first_name = ?'); vals.push(safeStr(firstName)); }
    if (lastName !== undefined) { updates.push('last_name = ?'); vals.push(safeStr(lastName)); }
    if (position !== undefined) { updates.push('user_position = ?'); vals.push(safeStr(position)); }
    if (hasCreatorRole(req.user)) {
      if (creatorContentTypes !== undefined) {
        const n = normalizeContentTypes(creatorContentTypes);
        if (n.length < 1) return res.status(400).json({ error: 'Select at least one content type' });
        updates.push('creator_content_types = ?'); vals.push(JSON.stringify(n));
      }
      if (creatorNicheTags !== undefined) {
        const n = normalizeNicheTags(creatorNicheTags);
        if (n.length < 1) return res.status(400).json({ error: 'Add at least one niche tag' });
        updates.push('creator_niche_tags = ?'); vals.push(JSON.stringify(n));
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'At least one field required' });
    vals.push(req.user.id);
    await db.prepare('UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?').run(...vals);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /profile error:', err.message, err.stack);
    res.status(500).json({ error: err.message || 'Profile update failed', code: 'PROFILE_UPDATE_FAILED' });
  }
});

router.put('/email', requireAuth, async (req, res) => {
  const { email } = req.body || {};
  if (!email || !email.trim()) return res.status(400).json({ error: 'Email required' });
  const existing = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.trim(), req.user.id);
  if (existing) return res.status(400).json({ error: 'Email already in use' });
  await db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email.trim(), req.user.id);
  res.json({ ok: true });
});

router.put('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!row || !bcrypt.compareSync(currentPassword || '', row.password_hash || '')) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ ok: true });
});

// POST /api/auth/add-role — add sponsor or creator role (dual-role accounts)
router.post('/add-role', requireAuth, async (req, res) => {
  const { role, creatorContentTypes, creatorNicheTags } = req.body || {};
  if (!['sponsor', 'creator'].includes(role)) {
    return res.status(400).json({ error: 'role must be sponsor or creator' });
  }
  let row;
  try {
    row = await db.prepare('SELECT id, user_type, user_roles FROM users WHERE id = ?').get(req.user.id);
  } catch (e) {
    row = await db.prepare('SELECT id, user_type FROM users WHERE id = ?').get(req.user.id);
  }
  let roles = parseUserRoles(row);
  if (role === 'sponsor') {
    if (roles.includes('sponsor')) {
      return res.json({ ok: true, userRoles: roles });
    }
    roles = [...new Set([...roles, 'sponsor'])];
    await db.prepare('UPDATE users SET user_roles = ? WHERE id = ?').run(JSON.stringify(roles), req.user.id);
    try { await db.prepare('INSERT OR IGNORE INTO sponsor_wallets (user_id) VALUES (?)').run(req.user.id); } catch (_) {}
    req.user.roles = roles;
    return res.json({ ok: true, userRoles: roles });
  }
  if (role === 'creator') {
    if (hasCreatorRole({ roles })) {
      return res.json({ ok: true, userRoles: roles });
    }
    const ct = normalizeContentTypes(creatorContentTypes || []);
    const nt = normalizeNicheTags(creatorNicheTags || []);
    if (ct.length < 1 || nt.length < 1) {
      return res.status(400).json({
        error: 'Adding creator role requires creatorContentTypes and creatorNicheTags (at least one each). Use onboarding or Settings.',
      });
    }
    roles = [...new Set([...roles, 'creator'])];
    await db.prepare('UPDATE users SET user_roles = ?, creator_content_types = ?, creator_niche_tags = ? WHERE id = ?').run(
      JSON.stringify(roles),
      JSON.stringify(ct),
      JSON.stringify(nt),
      req.user.id
    );
    req.user.roles = roles;
    return res.json({ ok: true, userRoles: roles });
  }
  res.status(400).json({ error: 'Invalid role' });
});

router.delete('/account', requireAuth, async (req, res) => {
  const { password } = req.body || {};
  const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!row || !bcrypt.compareSync(password || '', row.password_hash || '')) {
    return res.status(401).json({ error: 'Password required to delete account' });
  }
  await db.prepare('DELETE FROM submissions WHERE user_id = ?').run(req.user.id);
  await db.prepare('DELETE FROM campaign_joins WHERE user_id = ?').run(req.user.id);
  await db.prepare('DELETE FROM wallet_balances WHERE user_id = ?').run(req.user.id);
  await db.prepare('DELETE FROM payout_requests WHERE user_id = ?').run(req.user.id);
  await db.prepare('DELETE FROM social_accounts WHERE user_id = ?').run(req.user.id);
  await db.prepare('DELETE FROM gamification WHERE user_id = ?').run(req.user.id);
  await db.prepare('DELETE FROM achievements WHERE user_id = ?').run(req.user.id);
  await db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user.id);
  await db.prepare('DELETE FROM notification_prefs WHERE user_id = ?').run(req.user.id);
  await db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

router.get('/notifications', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT email_notifications, push_notifications FROM notification_prefs WHERE user_id = ?').get(req.user.id);
  res.json(row || { email_notifications: 1, push_notifications: 1 });
});

router.put('/notifications', requireAuth, async (req, res) => {
  const { emailNotifications, pushNotifications } = req.body || {};
  await db.prepare(`
    INSERT INTO notification_prefs (user_id, email_notifications, push_notifications)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email_notifications = excluded.email_notifications,
      push_notifications = excluded.push_notifications
  `).run(req.user.id, emailNotifications !== undefined ? (emailNotifications ? 1 : 0) : 1, pushNotifications !== undefined ? (pushNotifications ? 1 : 0) : 1);
  res.json({ ok: true });
});

module.exports = router;
