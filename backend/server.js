const express = require('express');
const cors = require('cors');
const dns = require('dns');
const config = require('./config');
const { ensureSchema } = require('./db');
const Stripe = require('stripe');

// Render can have broken outbound IPv6 for some SMTP endpoints; prefer IPv4 first.
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}

const authRoutes = require('./routes/auth');
const campaignsRoutes = require('./routes/campaigns');
const submissionsRoutes = require('./routes/submissions');
const walletRoutes = require('./routes/wallet');
const socialAccountsRoutes = require('./routes/socialAccounts');
const analyticsRoutes = require('./routes/analytics');
const gamificationRoutes = require('./routes/gamification');
const leaderboardsRoutes = require('./routes/leaderboards');
const affiliateRoutes = require('./routes/affiliate');
const notificationsRoutes = require('./routes/notifications');
const sponsorsRoutes = require('./routes/sponsors');
const adminRoutes = require('./routes/admin');
const brandApplicationsRoutes = require('./routes/brandApplications');
const paymentsRoutes = require('./routes/payments');
const supportRoutes = require('./routes/support');
const { optionalAuth } = require('./middleware/auth');

const app = express();
app.use(cors({ origin: config.frontendOrigin, credentials: true }));

// Health check for production (load balancers, monitoring)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, env: config.nodeEnv });
});

// Optional: serve frontend from same process (production same-origin)
if (config.frontendPath) {
  const path = require('path');
  const frontendDir = path.isAbsolute(config.frontendPath)
    ? config.frontendPath
    : path.join(__dirname, config.frontendPath);
  // Redirect clean URLs to .html; old dashboard routes → brand-overview
  const oldDashboardRoutes = ['/dashboard-creator', '/browse-campaigns', '/my-campaigns', '/submissions'];
  oldDashboardRoutes.forEach(route => {
    app.get(route, (req, res) => res.redirect(302, '/brand-overview.html'));
    app.get(route + '.html', (req, res) => res.redirect(302, '/brand-overview.html'));
  });
  ['/brand-overview', '/sponsor-dashboard', '/login', '/signup'].forEach(route => {
    app.get(route, (req, res) => res.redirect(302, route + '.html'));
  });
  app.use(express.static(frontendDir));
}

// Stripe webhook needs raw body – must be before express.json()
if (config.stripe.secretKey && config.stripe.webhookSecret) {
  const stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });
  app.post('/api/payments/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
    } catch (e) {
      return res.status(400).send(`Webhook Error: ${e.message}`);
    }
    if (event.type === 'checkout.session.completed') {
      const { db } = require('./db');
      const { v4: uuid } = require('uuid');
      const session = event.data.object;
      const paymentId = session.client_reference_id || session.metadata?.payment_id;
      const campaignId = session.metadata?.campaign_id;
      try {
        if (paymentId) {
          await db.prepare('UPDATE payments SET status = ?, paid_at = datetime("now") WHERE id = ?').run('paid', paymentId);
        }
        if (campaignId) {
          await db.prepare('UPDATE campaigns SET status = ?, payment_status = ? WHERE id = ?').run('active', 'paid', campaignId);
          try {
            await db.prepare('UPDATE campaigns SET started_at = datetime("now") WHERE id = ? AND (started_at IS NULL OR started_at = "")').run(campaignId);
          } catch (_) {}
          const campaign = await db.prepare('SELECT title, owner_id FROM campaigns WHERE id = ?').get(campaignId);
          const owner = campaign?.owner_id ? await db.prepare('SELECT name, email FROM users WHERE id = ?').get(campaign.owner_id) : null;
          await db.prepare(`
            INSERT INTO admin_alerts (id, type, entity_type, entity_id, title, message, read)
            VALUES (?, 'campaign_paid', 'campaign', ?, ?, ?, 0)
          `).run(
            uuid(),
            campaignId,
            'Campaign paid to start',
            (owner ? owner.name + ' (' + owner.email + ')' : 'User') + ' paid to start "' + (campaign?.title || 'Campaign') + '"'
          );
        }
      } catch (_) {}
    }
    res.json({ received: true });
  });
}

app.use(express.json());

// Attach req.user from Bearer JWT for all JSON API routes (requireAuth only checks req.user).
// Stripe webhook and /api/health are registered above and skip this.
app.use('/api', optionalAuth);

// OAuth callback routes at /auth/discord, /auth/google (must be before /api so redirects work)
try {
  const oauth = require('./oauth');
  app.use('/auth', oauth);
} catch (e) {
  console.warn('OAuth not loaded (missing env?):', e.message);
}

// API
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/submissions', submissionsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/social-accounts', socialAccountsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/leaderboards', leaderboardsRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/sponsors', sponsorsRoutes);
app.use('/api/brand-applications', brandApplicationsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);

// Optional: blog articles
app.get('/api/articles', (req, res) => {
  res.json([]);
});

// Global error handler (catches async errors and next(err))
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

ensureSchema().then(() => {
  app.listen(config.port, () => {
    console.log(`Backend running at http://localhost:${config.port}`);
    console.log(`  API: http://localhost:${config.port}/api`);
    console.log(`  Auth: http://localhost:${config.port}/api/auth`);
  });
}).catch(err => {
  console.error('Database init failed:', err);
  process.exit(1);
});
