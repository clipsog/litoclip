require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';

if (nodeEnv === 'production' && (!jwtSecret || jwtSecret === 'dev-secret-change-in-production')) {
  console.error('Production requires a strong JWT_SECRET. Set JWT_SECRET in your environment.');
  process.exit(1);
}

module.exports = {
  port: parseInt(process.env.PORT || '37373', 10),
  nodeEnv,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5500',
  /** When set (e.g. path to litoclips.com), backend serves frontend so API and site are same-origin */
  frontendPath: process.env.FRONTEND_PATH || null,
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  databasePath: process.env.DATABASE_PATH || './data.db',
  discord: {
    clientID: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    callbackURL: process.env.DISCORD_CALLBACK_URL || 'http://localhost:37373/auth/discord/callback',
  },
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:37373/auth/google/callback',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    mode: process.env.PAYPAL_MODE || 'sandbox',
  },
  crypto: {
    btcAddress: process.env.CRYPTO_BTC_ADDRESS || '',
    ethAddress: process.env.CRYPTO_ETH_ADDRESS || '',
    usdtAddress: process.env.CRYPTO_USDT_ADDRESS || '',
    network: process.env.CRYPTO_NETWORK || 'ethereum',
  },
};
