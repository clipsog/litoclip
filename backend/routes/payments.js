const express = require('express');
const { v4: uuid } = require('uuid');
const Stripe = require('stripe');
const config = require('../config');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' }) : null;

// Get PayPal access token
async function getPayPalAccessToken() {
  const base = config.paypal.mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'PayPal auth failed');
  return data.access_token;
}

// Create PayPal order
async function createPayPalOrder(amountUsd, currency, campaignTitle, paymentId) {
  const token = await getPayPalAccessToken();
  const base = config.paypal.mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const res = await fetch(`${base}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: paymentId,
        description: `LitoClips campaign: ${campaignTitle}`,
        amount: {
          currency_code: currency.toUpperCase(),
          value: (amountUsd / 100).toFixed(2),
        },
      }],
      application_context: {
        return_url: `${config.frontendOrigin}/campaign-track.html?payment=paypal&payment_id=${paymentId}`,
        cancel_url: `${config.frontendOrigin}/brand-overview.html?payment=cancelled`,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'PayPal order creation failed');
  return data;
}

// POST /api/payments/create – create payment and return checkout URL / session
router.post('/create', requireAuth, async (req, res) => {
  const { campaignId, amountCents, currency, paymentMethod } = req.body || {};
  if (!campaignId || !amountCents || amountCents < 100) {
    return res.status(400).json({ error: 'Campaign ID and amount (min $1) required' });
  }
  const method = (paymentMethod || 'stripe').toLowerCase();
  const amount = parseInt(amountCents, 10);
  const curr = (currency || 'usd').toLowerCase();

  const campaign = await db.prepare('SELECT id, title, owner_id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });

  const paymentId = uuid();
  await db.prepare(`
    INSERT INTO payments (id, campaign_id, user_id, amount_cents, currency, payment_method, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(paymentId, campaignId, req.user.id, amount, curr, method);

  try {
    if (method === 'stripe' && stripe) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: curr,
            product_data: {
              name: `LitoClips: ${campaign.title}`,
              description: 'Campaign creation & clip service',
            },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${config.frontendOrigin}/campaign-track.html?id=${campaignId}&name=${encodeURIComponent(campaign.title)}&payment=success&payment_id=${paymentId}`,
        cancel_url: `${config.frontendOrigin}/brand-overview.html?payment=cancelled`,
        client_reference_id: paymentId,
        metadata: { campaign_id: campaignId, payment_id: paymentId },
      });
      await db.prepare('UPDATE payments SET stripe_checkout_session_id = ? WHERE id = ?').run(session.id, paymentId);
      return res.json({
        paymentId,
        method: 'stripe',
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    }

    if (method === 'paypal' && config.paypal.clientId) {
      const order = await createPayPalOrder(amount, curr, campaign.title, paymentId);
      await db.prepare('UPDATE payments SET paypal_order_id = ? WHERE id = ?').run(order.id, paymentId);
      const approveLink = order.links?.find(l => l.rel === 'approve')?.href;
      return res.json({
        paymentId,
        method: 'paypal',
        orderId: order.id,
        approveUrl: approveLink,
        checkoutUrl: approveLink,
      });
    }

    if (method === 'crypto') {
      const btc = config.crypto.btcAddress;
      const eth = config.crypto.ethAddress;
      const usdt = config.crypto.usdtAddress;
      if (!btc && !eth && !usdt) {
        return res.status(400).json({ error: 'Crypto payment not configured' });
      }
      const amountUsd = (amount / 100).toFixed(2);
      await db.prepare(`
        UPDATE payments SET
          crypto_address = ?,
          crypto_amount = ?,
          crypto_currency = 'USDT',
          metadata = ?
        WHERE id = ?
      `).run(usdt || eth || btc, amountUsd, JSON.stringify({ btc, eth, usdt }), paymentId);
      return res.json({
        paymentId,
        method: 'crypto',
        instructions: {
          usdt: usdt ? { address: usdt, amount: amountUsd, network: config.crypto.network || 'ERC20' } : null,
          eth: eth ? { address: eth, amount: amountUsd, network: 'ERC20' } : null,
          btc: btc ? { address: btc, network: 'Bitcoin' } : null,
        },
        amountUsd,
        message: 'Send payment to one of the addresses below. Payment will be verified manually.',
      });
    }

    return res.status(400).json({ error: 'Invalid payment method or not configured' });
  } catch (err) {
    await db.prepare('UPDATE payments SET status = ? WHERE id = ?').run('failed', paymentId);
    throw err;
  }
});

// POST /api/payments/paypal-capture – capture PayPal order (called from frontend after redirect)
router.post('/paypal-capture', requireAuth, async (req, res) => {
  const { orderId, paymentId } = req.body || {};
  if (!orderId || !paymentId) return res.status(400).json({ error: 'orderId and paymentId required' });
  const payment = await db.prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?').get(paymentId, req.user.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status === 'paid') return res.json({ ok: true, alreadyPaid: true });

  const token = await getPayPalAccessToken();
  const base = config.paypal.mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const captureRes = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await captureRes.json();
  if (!captureRes.ok) return res.status(400).json({ error: data.message || 'PayPal capture failed' });

  const captureId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  await db.prepare(`
    UPDATE payments SET status = ?, paid_at = datetime("now"), paypal_capture_id = ?
    WHERE id = ?
  `).run('paid', captureId || null, paymentId);
  await db.prepare('UPDATE campaigns SET status = ?, payment_status = ? WHERE id = ?').run('active', 'paid', payment.campaign_id);
  try {
    await db.prepare('UPDATE campaigns SET started_at = datetime("now") WHERE id = ? AND (started_at IS NULL OR started_at = "")').run(payment.campaign_id);
  } catch (_) {}
  const campaign = await db.prepare('SELECT title FROM campaigns WHERE id = ?').get(payment.campaign_id);
  const owner = await db.prepare('SELECT name, email FROM users WHERE id = ?').get(payment.user_id);
  try {
    await db.prepare(`
      INSERT INTO admin_alerts (id, type, entity_type, entity_id, title, message, read)
      VALUES (?, 'campaign_paid', 'campaign', ?, ?, ?, 0)
    `).run(
      uuid(),
      payment.campaign_id,
      'Campaign paid to start',
      (owner ? owner.name + ' (' + owner.email + ')' : 'User') + ' paid to start "' + (campaign?.title || 'Campaign') + '"'
    );
  } catch (_) {}

  res.json({ ok: true, campaignId: payment.campaign_id, campaignTitle: campaign?.title });
});

// GET /api/payments/config – return publishable keys / config for frontend
router.get('/config', (req, res) => {
  res.json({
    stripePublishableKey: config.stripe.publishableKey || null,
    paypalClientId: config.paypal.clientId || null,
    paypalMode: config.paypal.mode || 'sandbox',
    cryptoEnabled: !!(config.crypto.btcAddress || config.crypto.ethAddress || config.crypto.usdtAddress),
  });
});

// GET /api/payments/:id – get payment status
router.get('/:id', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: row.id,
    campaignId: row.campaign_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    paymentMethod: row.payment_method,
    status: row.status,
    paidAt: row.paid_at,
  });
});

module.exports = router;
