const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const config = require('../config');
const { db } = require('../db');

const router = express.Router();

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch (_) {
      out[k] = v;
    }
  });
  return out;
}

function generateReferralCode() {
  return 'REF' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

/** One-time browser consent before OAuth signup (new accounts only). */
router.get('/terms-consent', (req, res) => {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `litoclips_terms_consent=1; Path=/; Max-Age=900; HttpOnly; SameSite=Lax${secure}`
  );
  res.status(204).end();
});

async function findOrCreateUser(profile, opts) {
  const termsConsent = !!(opts && opts.termsConsent);
  const { id: providerId, email, name } = profile;
  if (!email) return { error: 'no_email' };
  let user = await db.prepare('SELECT id, name, email, user_type, referral_code FROM users WHERE email = ?').get(email);
  if (user) return { user };
  if (!termsConsent) return { error: 'terms_required' };
  const userId = uuid();
  const referralCode = generateReferralCode();
  const termsAt = new Date().toISOString();
  try {
    await db.prepare(`
      INSERT INTO users (id, email, password_hash, name, user_type, referral_code, terms_accepted_at)
      VALUES (?, ?, ?, ?, 'creator', ?, ?)
    `).run(userId, email, '', name || email.split('@')[0], referralCode, termsAt);
  } catch (e) {
    if (e.message && e.message.includes('no such column')) {
      await db.prepare(`
        INSERT INTO users (id, email, password_hash, name, user_type, referral_code)
        VALUES (?, ?, ?, ?, 'creator', ?)
      `).run(userId, email, '', name || email.split('@')[0], referralCode);
      try {
        await db.prepare('UPDATE users SET terms_accepted_at = ? WHERE id = ?').run(termsAt, userId);
      } catch (_) {}
    } else {
      throw e;
    }
  }
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
      callbackURL: config.discord.callbackURL,
      scope: ['identify', 'email'],
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.email;
        if (!email) return done(null, null, { message: 'discord_no_email' });
        const cookies = parseCookies(req);
        const termsConsent = cookies.litoclips_terms_consent === '1';
        const result = await findOrCreateUser({
          id: profile.id,
          email,
          name: profile.username || profile.global_name,
        }, { termsConsent });
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
      callbackURL: config.google.callbackURL,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(null, null, { message: 'google_no_email' });
        const cookies = parseCookies(req);
        const termsConsent = cookies.litoclips_terms_consent === '1';
        const result = await findOrCreateUser({
          id: profile.id,
          email,
          name: profile.displayName || profile.name?.givenName,
        }, { termsConsent });
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
  if (!config.discord.clientID) return res.redirect(`${config.frontendOrigin}?error=discord_not_configured`);
  passport.authenticate('discord')(req, res, next);
});

router.get('/discord/callback', (req, res, next) => {
  if (!config.discord.clientID) return res.redirect(`${config.frontendOrigin}?error=discord_not_configured`);
  passport.authenticate('discord', (err, user, info) => {
    if (err) return res.redirect(`${config.frontendOrigin}?error=discord_failed`);
    if (!user) {
      const msg = (info && info.message) || 'discord_failed';
      const base = (config.frontendOrigin || '').replace(/\/$/, '');
      if (msg === 'terms_required') {
        return res.redirect(`${base}/signup.html?error=terms_required`);
      }
      return res.redirect(`${config.frontendOrigin}?error=${msg}`);
    }
    const token = jwt.sign({ userId: user.id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    const userType = user.userType || 'creator';
    const base = (config.frontendOrigin || '').replace(/\/$/, '');
    res.redirect(`${base}/index.html?token=${token}&userType=${userType}`);
  })(req, res, next);
});

router.get('/google', (req, res, next) => {
  if (!config.google.clientID) return res.redirect(`${config.frontendOrigin}?error=google_not_configured`);
  const q = req.query.state;
  const typeStates = ['creator', 'brand', 'sponsor'];
  // `admin` = user started from Admin login; callback sends them to login.html?next=admin with token
  const state = q === 'admin' || typeStates.includes(q) ? q : 'creator';
  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  if (!config.google.clientID) return res.redirect(`${config.frontendOrigin}?error=google_not_configured`);
  passport.authenticate('google', async (err, user, info) => {
    if (err) return res.redirect(`${config.frontendOrigin}?error=google_failed`);
    if (!user) {
      const msg = (info && info.message) || 'google_failed';
      const base = (config.frontendOrigin || '').replace(/\/$/, '');
      if (msg === 'terms_required') {
        return res.redirect(`${base}/signup.html?error=terms_required`);
      }
      return res.redirect(`${config.frontendOrigin}?error=${msg}`);
    }
    const oauthState = req.query.state;
    const typeState = ['creator', 'brand', 'sponsor'].includes(oauthState) ? oauthState : null;
    if (typeState) {
      try {
        const row = await db.prepare('SELECT password_hash, user_type FROM users WHERE id = ?').get(user.id);
        if (row && (!row.password_hash || row.password_hash === '') && row.user_type === 'creator') {
          await db.prepare('UPDATE users SET user_type = ? WHERE id = ?').run(typeState, user.id);
          user.userType = typeState;
          if (typeState === 'sponsor') {
            try { await db.prepare('INSERT OR IGNORE INTO sponsor_wallets (user_id) VALUES (?)').run(user.id); } catch (_) {}
          }
        }
      } catch (_) {}
    }
    const token = jwt.sign({ userId: user.id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    const userType = user.userType || 'creator';
    const base = (config.frontendOrigin || '').replace(/\/$/, '');
    if (oauthState === 'admin') {
      return res.redirect(`${base}/login.html?token=${encodeURIComponent(token)}&next=admin`);
    }
    res.redirect(`${base}/index.html?token=${token}&userType=${userType}`);
  })(req, res, next);
});

module.exports = router;
