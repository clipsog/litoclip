const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const config = require('../config');
const { db } = require('../db');

const router = express.Router();

function normalizeCallbackURL(url) {
  if (!url) return url;
  const s = String(url);
  // If it's already using the proxied path, don't rewrite it (avoid `/api/api/...`).
  if (s.includes('/api/auth/')) return url;

  // If a deployment only proxies `/api/*`, `/auth/.../callback` will 404.
  // Transparently switch to `/api/auth/.../callback` to match available routes.
  return s.replace(/\/auth\/(google|discord)\/callback\/?$/, '/api/auth/$1/callback');
}

function getFrontendOriginRoot(frontendOrigin) {
  // Make callback redirects resilient if FRONTEND_ORIGIN is mis-set with a path.
  // Example: "https://litoclips.com/signup.html" should still redirect to the origin root.
  try {
    return new URL(frontendOrigin).origin;
  } catch (e) {
    if (!frontendOrigin) return '';
    return String(frontendOrigin).replace(/\/$/, '').replace(/\/.*$/, '');
  }
}

function generateReferralCode() {
  return 'REF' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function findOrCreateUser(profile) {
  const { id: providerId, email, name } = profile;
  if (!email) return { error: 'no_email' };
  let user = await db.prepare('SELECT id, name, email, user_type, referral_code FROM users WHERE email = ?').get(email);
  if (user) return { user };
  const userId = uuid();
  const referralCode = generateReferralCode();
  await db.prepare(`
    INSERT INTO users (id, email, password_hash, name, user_type, referral_code)
    VALUES (?, ?, ?, ?, 'creator', ?)
  `).run(userId, email, '', name || email.split('@')[0], referralCode);
  await db.prepare('INSERT OR IGNORE INTO wallet_balances (user_id) VALUES (?)').run(userId);
  await db.prepare('INSERT OR IGNORE INTO gamification (user_id) VALUES (?)').run(userId);
  await db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(userId);
  user = { id: userId, name: name || email.split('@')[0], email, userType: 'creator', referralCode };
  return { user };
}

if (config.discord.clientID && config.discord.clientSecret) {
  const DiscordStrategy = require('passport-discord').Strategy;
  passport.use(new DiscordStrategy(
    {
      clientID: config.discord.clientID,
      clientSecret: config.discord.clientSecret,
      callbackURL: normalizeCallbackURL(config.discord.callbackURL),
      scope: ['identify', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.email;
        if (!email) return done(null, null, { message: 'discord_no_email' });
        const result = await findOrCreateUser({
          id: profile.id,
          email,
          name: profile.username || profile.global_name,
        });
        if (result.error) return done(null, null, { message: result.error });
        done(null, result.user);
      } catch (e) {
        done(e);
      }
    }
  ));
}

if (config.google.clientID && config.google.clientSecret) {
  const GoogleStrategy = require('passport-google-oauth20').Strategy;
  passport.use(new GoogleStrategy(
    {
      clientID: config.google.clientID,
      clientSecret: config.google.clientSecret,
      callbackURL: normalizeCallbackURL(config.google.callbackURL),
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(null, null, { message: 'google_no_email' });
        const result = await findOrCreateUser({
          id: profile.id,
          email,
          name: profile.displayName || profile.name?.givenName,
        });
        if (result.error) return done(null, null, { message: result.error });
        done(null, result.user);
      } catch (e) {
        done(e);
      }
    }
  ));
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

router.use(passport.initialize());

router.get('/discord', (req, res, next) => {
  const baseOrigin = getFrontendOriginRoot(config.frontendOrigin);
  if (!config.discord.clientID) return res.redirect(`${baseOrigin}?error=discord_not_configured`);
  passport.authenticate('discord')(req, res, next);
});

router.get('/discord/callback', (req, res, next) => {
  const baseOrigin = getFrontendOriginRoot(config.frontendOrigin);
  if (!config.discord.clientID) return res.redirect(`${baseOrigin}?error=discord_not_configured`);
  passport.authenticate('discord', (err, user, info) => {
    const baseOrigin = getFrontendOriginRoot(config.frontendOrigin);
    if (err) return res.redirect(`${baseOrigin}?error=discord_failed`);
    if (!user) {
      const msg = (info && info.message) || 'discord_failed';
      return res.redirect(`${baseOrigin}?error=${msg}`);
    }
    const token = jwt.sign({ userId: user.id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    const userType = user.userType || 'creator';
    res.redirect(`${baseOrigin}/index.html?token=${token}&userType=${userType}`);
  })(req, res, next);
});

router.get('/google', (req, res, next) => {
  const baseOrigin = getFrontendOriginRoot(config.frontendOrigin);
  if (!config.google.clientID) return res.redirect(`${baseOrigin}?error=google_not_configured`);
  const state = ['creator', 'brand', 'sponsor'].includes(req.query.state) ? req.query.state : 'creator';
  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  const baseOrigin = getFrontendOriginRoot(config.frontendOrigin);
  if (!config.google.clientID) return res.redirect(`${baseOrigin}?error=google_not_configured`);
  passport.authenticate('google', async (err, user, info) => {
    console.log('[oauth] /google/callback hit', {
      err: err ? String(err) : null,
      hasUser: !!user,
      frontendOrigin: config.frontendOrigin,
      baseOrigin
    });
    if (err) return res.redirect(`${baseOrigin}?error=google_failed`);
    if (!user) {
      const msg = (info && info.message) || 'google_failed';
      const baseOrigin = getFrontendOriginRoot(config.frontendOrigin);
      return res.redirect(`${baseOrigin}?error=${msg}`);
    }
    const state = ['creator', 'brand', 'sponsor'].includes(req.query.state) ? req.query.state : null;
    if (state) {
      try {
        const row = await db.prepare('SELECT password_hash, user_type FROM users WHERE id = ?').get(user.id);
        if (row && (!row.password_hash || row.password_hash === '') && row.user_type === 'creator') {
          await db.prepare('UPDATE users SET user_type = ? WHERE id = ?').run(state, user.id);
          user.userType = state;
          if (state === 'sponsor') {
            try { await db.prepare('INSERT OR IGNORE INTO sponsor_wallets (user_id) VALUES (?)').run(user.id); } catch (_) {}
          }
        }
      } catch (_) {}
    }
    const token = jwt.sign({ userId: user.id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    const userType = user.userType || 'creator';
    const baseOrigin = getFrontendOriginRoot(config.frontendOrigin);
    const redirectUrl = `${baseOrigin}/index.html?token=${token}&userType=${userType}`;
    console.log('[oauth] /google/callback redirecting to', redirectUrl);
    res.redirect(redirectUrl);
  })(req, res, next);
});

module.exports = router;
