const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../db');
const { parseUserRoles, hasCreatorRole, hasSponsorRole } = require('../lib/userRoles');

async function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  const xToken = req.headers['x-auth-token'];
  let token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token && xToken) token = xToken;
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    let user;
    try {
      user = await db.prepare('SELECT id, email, name, user_type, referral_code, user_roles FROM users WHERE id = ?').get(decoded.userId);
    } catch (e) {
      user = await db.prepare('SELECT id, email, name, user_type, referral_code FROM users WHERE id = ?').get(decoded.userId);
    }
    if (user) {
      user.roles = parseUserRoles(user);
    }
    req.user = user || null;
  } catch (e) {
    req.user = null;
    if (e.message && !e.message.includes('jwt') && !e.message.includes('expired')) {
      console.error('optionalAuth db error:', e.message);
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireCreator(req, res, next) {
  if (!req.user || !hasCreatorRole(req.user)) {
    return res.status(403).json({ error: 'Creator access required' });
  }
  next();
}

function requireSponsor(req, res, next) {
  if (!req.user || !hasSponsorRole(req.user)) {
    return res.status(403).json({ error: 'Sponsor access required' });
  }
  next();
}

async function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const withAdmin = await db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
    if (!withAdmin || !withAdmin.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { optionalAuth, requireAuth, requireCreator, requireSponsor, requireAdmin, parseUserRoles, hasCreatorRole, hasSponsorRole };
