const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../db');

function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = db.prepare('SELECT id, email, name, user_type, referral_code FROM users WHERE id = ?').get(decoded.userId);
    req.user = user || null;
  } catch {
    req.user = null;
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
  if (!req.user || req.user.user_type !== 'creator') {
    return res.status(403).json({ error: 'Creator access required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const withAdmin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (!withAdmin || !withAdmin.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { optionalAuth, requireAuth, requireCreator, requireAdmin };
