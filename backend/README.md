# Creator Platform Backend

Your own backend for the rebranded creator platform. Implements auth (email + Discord/Google OAuth), campaigns, submissions, wallet, social accounts, analytics, gamification, and affiliate stubs.

**To view the site without Discord/OAuth:** see **HOW_TO_VIEW.md** in the project root (preview mode, admin dashboard, and full backend flow).

## Quick start

```bash
cd backend
cp .env.example .env
# Edit .env: set JWT_SECRET, and optionally Discord/Google OAuth credentials
npm install
npm run init-db
npm start
```

Server runs at **http://localhost:37373**. The frontend is already configured to use `http://localhost:37373/api` when on localhost.

## Serving the frontend

1. **Option A – VS Code Live Server / similar**  
   Serve the `shardcreators.com` folder (or parent) at e.g. `http://localhost:5500`.  
   Set in `.env`: `FRONTEND_ORIGIN=http://localhost:5500`.

2. **Option B – Same origin**  
   Serve both API and static files from the same app (add static middleware in `server.js` for production).

After OAuth login, the backend redirects to `FRONTEND_ORIGIN?token=...`. Your frontend should read `token` from the URL, store it in `localStorage`, then redirect to the dashboard or home.

## OAuth (Discord & Google)

- **Discord:** [Discord Developer Portal](https://discord.com/developers/applications) → New Application → OAuth2 → Redirects: add `http://localhost:37373/auth/discord/callback`. Copy Client ID and Client Secret into `.env`.
- **Google:** [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create OAuth 2.0 Client (Web) → Authorized redirect URI: `http://localhost:37373/auth/google/callback`. Copy Client ID and Secret into `.env`.

Update the **frontend** login/signup links so they point to your backend in dev, e.g.:

- `http://localhost:37373/auth/discord` instead of `https://discord.com/...&redirect_uri=...shardcreators.com...`
- `http://localhost:37373/auth/google` instead of `https://accounts.google.com/...&redirect_uri=...shardcreators.com...`

So when the user clicks “Continue with Discord/Google”, they go to your backend, which redirects to Discord/Google and then back to your callback, which issues a JWT and redirects to the frontend with `?token=...`.

## Database

SQLite file at `./data.db` (or path in `DATABASE_PATH`). Schema is applied on first run. Seed a demo campaign with `npm run init-db`.

## Payments (Stripe, PayPal, Crypto)

Campaign creation can require payment. Configure in `.env`:

- **Stripe:** Set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET`. Create a webhook at https://dashboard.stripe.com/webhooks pointing to `https://your-domain/api/payments/stripe-webhook` with event `checkout.session.completed`.
- **PayPal:** Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_MODE` (sandbox or live).
- **Crypto:** Set `CRYPTO_BTC_ADDRESS`, `CRYPTO_ETH_ADDRESS`, and/or `CRYPTO_USDT_ADDRESS` for manual crypto payments. Users receive payment instructions; mark as paid manually or via admin.

Endpoints: `POST /api/payments/create`, `GET /api/payments/config`, `GET /api/payments/:id`, `POST /api/payments/paypal-capture`.

## Admin

Admin routes live under **`/api/admin`** and require a user with `is_admin = 1`.  
Make your first admin in SQLite after signup:
```bash
sqlite3 data.db "UPDATE users SET is_admin = 1 WHERE email = 'your@email.com';"
```
Then use the same JWT as that user to call admin endpoints (list users, campaigns, submissions; create/update campaigns; approve/reject submissions; set views/likes; manage payouts and brand applications).  
See **BACKEND_ARCHITECTURE.md** (section 4) for the full admin API.

## API summary

See **BACKEND_ARCHITECTURE.md** in the project root for the full list of endpoints and how they map to the frontend.
