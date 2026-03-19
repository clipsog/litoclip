# Deploy LitoClips backend to Render

Step-by-step guide to get your backend running on [Render](https://render.com) for **litoclips.com**.

---

## 1. Push your code to GitHub

Render deploys from Git. If you haven’t already:

1. Create a new repo on GitHub (e.g. `litoclips` or `litoclips`).
2. From your project folder:

   ```bash
   cd /path/to/litoclips
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

   (Use `master` if that’s your default branch.)

---

## 2. Create a Web Service on Render

1. Go to **[dashboard.render.com](https://dashboard.render.com)** and sign in (or sign up with GitHub).
2. Click **New +** → **Web Service**.
3. Connect your GitHub account if needed, then **select the repository** that contains your code (the one with the `backend` folder and `render.yaml`).
4. Render may detect the Blueprint. If it shows **Apply** or **Configure**, you can use the existing `render.yaml` and skip to **Step 3** to set env vars.
5. If you’re configuring manually instead of Blueprint:
   - **Name:** `litoclips-backend` (or any name).
   - **Region:** choose one close to your users.
   - **Branch:** `main` (or your default branch).
   - **Root Directory:** set to **`backend`** (required so Render runs from the folder that has `package.json`).
   - **Runtime:** **Node**.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. Under **Instance Type**, pick **Free** to start (or a paid plan for no cold starts and a persistent disk).

---

## 3. Set environment variables

In your Render service, open **Environment** (left sidebar or tab) and add these.  
**Do not commit real values to Git** — set them only in Render.

| Key | Value | Required |
|-----|--------|----------|
| `NODE_ENV` | `production` | Yes |
| `JWT_SECRET` | Generate one: `openssl rand -base64 32` (paste the output) | Yes |
| `FRONTEND_ORIGIN` | `https://litoclips.com` | Yes |
| `PORT` | Leave **empty** — Render sets this automatically | No |
| `STRIPE_SECRET_KEY` | Your Stripe secret key (e.g. `sk_live_YOUR_KEY_HERE` for live) | If using Stripe |
| `STRIPE_PUBLISHABLE_KEY` | Your Stripe publishable key (e.g. `pk_live_...`) | If using Stripe |
| `STRIPE_WEBHOOK_SECRET` | From Stripe Dashboard → Webhooks → your endpoint → Signing secret | If using Stripe |

**Google sign-in** (add these for "Sign in with Google"):

| Key | Value |
|-----|-------|
| `GOOGLE_CLIENT_ID` | From [Google Cloud Console](https://console.cloud.google.com/) → APIs & Credentials → Create OAuth 2.0 Client ID (Web application) |
| `GOOGLE_CLIENT_SECRET` | From the same OAuth client |
| `GOOGLE_CALLBACK_URL` | `https://YOUR_DOMAIN/auth/google/callback` — must match the domain where your API is served (e.g. `https://litoclips.com/auth/google/callback` if API is at litoclips.com) |

In Google Cloud Console → APIs & Credentials → your OAuth client → **Authorized redirect URIs**, add the same URL as `GOOGLE_CALLBACK_URL`.

Optional (add when you use them):

- `DATABASE_PATH` — see **Step 4** (SQLite / persistent disk).
- Discord: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_CALLBACK_URL` (e.g. `https://YOUR_RENDER_URL/auth/discord/callback`).
- PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE=live`.

Click **Save Changes** after adding variables.

---

## 4. Database (SQLite) and persistent disk

The app uses **SQLite** and stores the DB in a file. On Render’s **free** tier the filesystem is **ephemeral**: the database is wiped on every deploy or restart. That’s fine for a quick test; for real use you want persistence.

**Option A – Free tier (no persistence)**  
- Don’t set `DATABASE_PATH`; the app will use `./data.db` inside the container.  
- Data is lost on redeploy. Use only for testing.

**Option B – Persistent disk (paid plan)**  
1. In your Render service, go to **Disks** (or **Storage**).
2. **Add Disk**: name e.g. `data`, mount path **`/data`**, size as needed (e.g. 1 GB).
3. In **Environment**, add:
   - **Key:** `DATABASE_PATH`  
   - **Value:** `/data/data.db`
4. Redeploy so the app uses the disk. The DB file will survive deploys and restarts.

---

## 5. Deploy

1. Click **Create Web Service** (or **Save** if you already created it).
2. Render will clone the repo, run `npm install` in the `backend` folder, then `npm start`. The first deploy may take a few minutes.
3. When it’s live, Render shows a URL like **`https://litoclips-backend.onrender.com`** (or your custom domain). Open:
   - `https://YOUR_SERVICE_URL/api/health`  
   You should see something like: `{"ok":true,"env":"production"}`.

---

## 6. Point litoclips.com to the backend (two options)

Your frontend at **litoclips.com** must call the API. You can either put the API on the same domain or on a subdomain.

### Option A – Same domain (recommended: API at litoclips.com/api)

1. **Host the frontend and proxy to Render:**  
   Use a host that can serve static files and reverse-proxy (e.g. **Vercel**, **Netlify**, or a VPS with nginx):
   - **Static site** at `https://litoclips.com` from the `litoclips.com` folder.
   - **Proxy** `https://litoclips.com/api` (and `/auth`) to `https://litoclips-backend.onrender.com`.
2. In Render, add a **custom domain**: `litoclips.com` (or e.g. `api.litoclips.com` — see Option B).
3. On your DNS/host, point the chosen hostname to Render (CNAME or A record as Render instructs).
4. Keep **`FRONTEND_ORIGIN`** = `https://litoclips.com` so OAuth and Stripe redirects stay on your domain.

### Option B – Subdomain (e.g. api.litoclips.com)

1. In Render, add custom domain **`api.litoclips.com`** and follow Render’s DNS instructions (usually a CNAME to your Render service).
2. In your **frontend** you must send API requests to `https://api.litoclips.com` instead of `https://litoclips.com/api`. Right now the app uses `window.location.origin + '/api'`, so you’d need a small change (e.g. a config or build-time variable) so the frontend uses `https://api.litoclips.com/api`. Option A avoids that.

---

## 7. Stripe webhook for production

Once your API is reachable at a public URL (e.g. `https://litoclips.com/api` or `https://api.litoclips.com`):

1. **Stripe Dashboard** → **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL:**  
   - If API is at litoclips.com: `https://litoclips.com/api/payments/stripe-webhook`  
   - If API is at api.litoclips.com: `https://api.litoclips.com/api/payments/stripe-webhook`
3. Event: **checkout.session.completed**.
4. Copy the **Signing secret** (`whsec_...`) and add it in Render **Environment** as **`STRIPE_WEBHOOK_SECRET`**, then redeploy.

---

## 8. Create your first admin user

After the first user signs up via your deployed app:

1. You need to set that user as admin. With SQLite on Render you can’t run `sqlite3` locally against the server DB. Options:
   - **Temporary admin signup route:** Add a one-off route or script that sets `is_admin = 1` for a given email (protect it or remove after use), deploy, call it once, then remove.
   - **Render Shell (if available):** Open a shell in the running service and run a small Node script that opens `DATABASE_PATH` and runs `UPDATE users SET is_admin = 1 WHERE email = 'your@email.com'`.
   - Or use a SQLite GUI that can connect over SSH if Render provides it (not common on free tier).

I can provide a one-off **admin bootstrap** endpoint (e.g. guarded by a secret or only in development) that you call once then disable, if you want.

---

## Quick checklist

- [ ] Repo pushed to GitHub and connected in Render  
- [ ] Web Service with **Root Directory** = `backend`  
- [ ] **Build:** `npm install` — **Start:** `npm start`  
- [ ] Env: `NODE_ENV=production`, `JWT_SECRET`, `FRONTEND_ORIGIN=https://litoclips.com`  
- [ ] Stripe keys and `STRIPE_WEBHOOK_SECRET` set; webhook URL points to your live API  
- [ ] Optional: Persistent disk at `/data` and `DATABASE_PATH=/data/data.db`  
- [ ] Custom domain (litoclips.com or api.litoclips.com) and DNS set  
- [ ] `/api/health` returns `{"ok":true,"env":"production"}`  

If you tell me whether you’ll use **litoclips.com** or **api.litoclips.com** for the API, I can give you exact DNS and proxy steps next.
