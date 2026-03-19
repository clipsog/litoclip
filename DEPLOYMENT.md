# Going live: production deployment checklist

Use this checklist to run LitoClips in production (backend + frontend).

---

## 1. Environment variables

Create a `.env` file in `backend/` (or set env vars on your host). **Never commit `.env`** (it should be in `.gitignore`).

| Variable | Required in prod | Notes |
|----------|------------------|--------|
| `NODE_ENV` | Yes | Set to `production`. |
| `JWT_SECRET` | **Yes** | Strong random secret (e.g. `openssl rand -base64 32`). Server **refuses to start** in production if this is missing or still the dev default. |
| `PORT` | Optional | Default `37373`. Your host may set this (e.g. Railway/Render use `PORT`). |
| `FRONTEND_ORIGIN` | Yes | Full public URL of the site, e.g. `https://litoclips.com`. Used for CORS and OAuth/payment redirects. |
| `DATABASE_PATH` | Optional | Path to SQLite file. Use an absolute path in production so it survives restarts (e.g. `/var/data/litoclips/data.db`). Ensure the directory exists and the process can write to it. |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | If using Discord login | Set `DISCORD_CALLBACK_URL` to `https://your-domain/auth/discord/callback`. Add this URL in Discord Developer Portal → OAuth2 → Redirects. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | If using Google login | Set `GOOGLE_CALLBACK_URL` to `https://your-domain/auth/google/callback`. Add this URL in Google Cloud Console → APIs & Credentials → OAuth 2.0 → Authorized redirect URIs. |
| `STRIPE_SECRET_KEY` | If using Stripe | Use **live** key from Stripe Dashboard. |
| `STRIPE_PUBLISHABLE_KEY` | If using Stripe | Use **live** publishable key. |
| `STRIPE_WEBHOOK_SECRET` | If using Stripe | Create a webhook in Stripe Dashboard for **live** mode, endpoint `https://your-domain/api/payments/stripe-webhook`, event `checkout.session.completed`. Copy the signing secret into this variable. |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | If using PayPal | Use **live** credentials and set `PAYPAL_MODE=live`. Return/cancel URLs in the app use `FRONTEND_ORIGIN` (e.g. `.../campaign-track.html?payment=...`). |

Optional: `JWT_EXPIRES_IN` (default `7d`), `CRYPTO_*` for crypto payment addresses.

---

## 2. How to serve the frontend

The frontend uses `window.location.origin + '/api'` when not on localhost, so it expects the API at the **same origin** (e.g. `https://litoclips.com/api`).

### Option A – Backend serves frontend (single process)

1. Set `FRONTEND_PATH` to the path of the frontend folder (e.g. `../litoclips.com` or absolute path).
2. Set `FRONTEND_ORIGIN` to your public URL (e.g. `https://litoclips.com`).
3. Put a reverse proxy (e.g. nginx, Caddy) in front that terminates HTTPS and proxies to Node. Node listens on `PORT` (e.g. 37373); the proxy forwards `https://litoclips.com` and `https://litoclips.com/api` to that port.

Result: one Node process serves both static HTML/JS and the API; same origin, no CORS issues.

### Option B – Separate static host + API subdomain

1. Serve the `litoclips.com` folder from your CDN or static host at `https://litoclips.com`.
2. Expose the API at e.g. `https://api.litoclips.com`.
3. Set `FRONTEND_ORIGIN=https://litoclips.com`.
4. **Frontend change:** the current code uses `window.location.origin + '/api'`, which would point to `https://litoclips.com/api` (wrong). You’d need to point the frontend to `https://api.litoclips.com/api` (e.g. via a single config value or build-time env like `VITE_API_URL` or a small `config.js` loaded from the static site). Option A avoids this.

---

## 3. HTTPS

- Run production behind HTTPS only. Use a reverse proxy (nginx, Caddy, Cloudflare) or your platform’s TLS (e.g. Railway, Render).
- If you use Discord/Google OAuth or Stripe/PayPal, they require HTTPS for callbacks and webhooks.

---

## 4. Database

- SQLite: ensure `DATABASE_PATH` points to a persistent volume. Run migrations (schema is applied on startup via `ensureSchema()`).
- Back up `data.db` regularly. No migrations are run automatically beyond the built-in schema ensure; add new columns/migrations in your code and deploy.

---

## 5. First admin user

After the first user signs up, set them as admin:

```bash
sqlite3 /path/to/data.db "UPDATE users SET is_admin = 1 WHERE email = 'your@email.com';"
```

---

## 6. Security summary

- **JWT_SECRET:** Must be set and strong in production (enforced on startup).
- **Secrets:** Keep Stripe/PayPal/Discord/Google secrets only in backend env; never in frontend or repo.
- **Admin:** Only users with `is_admin = 1` can access `/api/admin/*`.
- **CORS:** Backend allows only `FRONTEND_ORIGIN`; set it to your real frontend URL.

---

## 7. Quick production .env example

```env
NODE_ENV=production
PORT=37373
JWT_SECRET=<generate with: openssl rand -base64 32>
FRONTEND_ORIGIN=https://litoclips.com
DATABASE_PATH=/var/data/litoclips/data.db

# Optional: serve frontend from backend (use path to litoclips.com)
FRONTEND_PATH=../litoclips.com

# OAuth – use production callback URLs
DISCORD_CALLBACK_URL=https://litoclips.com/auth/discord/callback
GOOGLE_CALLBACK_URL=https://litoclips.com/auth/google/callback

# Stripe live
STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal live
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
```

OAuth routes are mounted at `/auth`: `/auth/discord`, `/auth/discord/callback`, `/auth/google`, `/auth/google/callback`. So when the backend is behind a proxy at `https://litoclips.com`, use `https://litoclips.com/auth/discord/callback` and `https://litoclips.com/auth/google/callback`.

---

## 8. Health check

- **GET /api/health** returns `{ ok: true, env: "production" }`. Use this for load balancers and monitoring.

---

## 9. Process management

- Use a process manager (e.g. PM2, systemd) or your platform’s runner so the Node process restarts on crash and on deploy.
- Example (PM2): `pm2 start server.js -n litoclips --cwd /path/to/backend`.

You’re ready to go live once NODE_ENV, JWT_SECRET, FRONTEND_ORIGIN, and (if used) live payment and OAuth URLs are set correctly.
