# Backend Architecture: LitoClips Reference & Our Implementation

This document describes **how the original platform structured its backend** (inferred from the frontend) and how **our backend** is built to support LitoClips.

---

## 1. Original Structure (Inferred)

### 1.1 API Base URL
- **Landing / auth:** `{origin}/api/auth` (login, signup, logout, me)
- **Dashboard:** `{origin}/api` (all other endpoints)
- **Local dev:** Frontend expects `http://localhost:37373/api` and `http://localhost:37373/api/auth`

### 1.2 Authentication
- **Email/password:** POST `/api/auth/login`, POST `/api/auth/signup`, POST `/api/auth/logout`
- **Session:** JWT in `Authorization: Bearer <token>`; user stored in `localStorage` (user, token, userType)
- **OAuth:**
  - **Discord:** Redirect to `https://discord.com/api/oauth2/authorize?client_id=...&redirect_uri=https://www.litoclips.com/auth/discord/callback&response_type=code&scope=identify+email`
  - **Google:** Redirect to `https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=https://www.litoclips.com/auth/google/callback&...`
  - Callbacks live on the **server** (`/auth/discord/callback`, `/auth/google/callback`); server exchanges `code` for tokens, creates/updates user, issues JWT.
- **Profile:** PUT `/api/auth/profile` (name), PUT `/api/auth/email`, PUT `/api/auth/password`, DELETE `/api/auth/account`
- **Notifications:** GET/PUT `/api/auth/notifications` (preferences)

### 1.3 Gamification
- GET `/api/gamification/profile` → `{ level, xp, nextLevelXP, rank?, streak?, ... }`
- GET `/api/gamification/achievements` → list of achievements
- GET `/api/leaderboards?metric=views|earnings&limit=N`
- GET `/api/leaderboards/my-position`

### 1.4 Campaigns (Creator)
- GET `/api/campaigns` → list of campaigns (browse); optional filters
- GET `/api/campaigns/my-campaigns` → campaigns the user has joined
- POST `/api/campaigns/:id/join` → join a campaign

**Campaign object (from frontend):** id, title, description, niche, platform(s), budget, RPM, cover_image/coverImage/image, createdAt, etc.

### 1.5 Submissions
- GET `/api/submissions` or `/api/submissions?status=all|approved|pending|rejected`
- POST `/api/submissions` → body: `{ campaignId, platform, postUrl, accountInfo?: { username } }`
- POST `/api/submissions/batch` → body: `{ submissions: [{ campaignId, platform, postUrl, accountInfo? }] }`
- POST `/api/submissions/:id/refresh-engagement` (optional; refresh views/likes from platform)

**Submission object:** id, campaignId, platform, postUrl, status (pending|approved|rejected), views, likes, earnings, createdAt, etc.

### 1.6 Analytics
- GET `/api/analytics/creator` → overview: totalEarnings, totalViews, activeCampaigns, successRate, totalSubmissions, approvedSubmissions
- GET `/api/analytics/creator/timeline?period=7d|30d|90d` → time-series for charts
- GET `/api/analytics/creator/platforms` → breakdown by platform (TikTok, YouTube, etc.)
- GET `/api/analytics/campaign/:campaignId` → per-campaign stats
- GET `/api/analytics/leaderboard?metric=views|earnings`

### 1.7 Wallet
- GET `/api/wallet/balance` or GET `/api/wallet` → `{ availableBalance, pendingBalance, pendingPayouts, totalPaid, totalEarnings }`
- GET `/api/wallet/payouts` → list of payout requests (amount, paymentMethod, status, createdAt)
- POST `/api/wallet/withdraw` → body: `{ amount, paymentMethod, paymentDetails?, notes }`
  - **paymentDetails** (from wallet.html): PayPal `{ email }`, Wise `{ email, currency }`, Bank `{ accountName, bankName, accountNumber, routingNumber, country }`, Crypto `{ cryptoType, address, network }`

### 1.8 Social Accounts (TikTok, YouTube, Instagram, X)
- GET `/api/social-accounts` → list of linked accounts (platform, handle, status: verified|pending|failed, verificationCode if pending)
- POST `/api/social-accounts/generate-code` → body: `{ platform, handle }` → `{ accountId, code }`
- POST `/api/social-accounts/verify` → body: `{ accountId, code, skipApiCheck? }`
- DELETE `/api/social-accounts/:id`

(Verification is typically: user adds a code to their bio; backend may call platform APIs to check, or manual “skip API check”.)

### 1.9 Affiliate / Referrals
- GET `/api/affiliate/dashboard` → referral stats (referred count, earned, pending, paid, link, code)
- User has `referralCode`; referral link = `/?ref=CODE`

### 1.10 Notifications
- GET `/api/notifications?limit=5` (creator dashboard)

### 1.11 Blog (Optional)
- GET `/api/articles` (blog page)

### 1.12 External Integrations
- **Discord OAuth** – app in Discord Developer Portal; client_id, client_secret, redirect_uri
- **Google OAuth** – Google Cloud Console; client_id, client_secret, redirect_uri
- **Payments** – likely PayPal, Wise, bank, crypto (provider APIs or manual processing)
- **Database** – unknown (Postgres, MySQL, etc.)
- **Hosting** – app + API on same origin (e.g. litoclips.com)

### 1.13 How Admin Was Likely Handled (Inferred – We Didn’t Clone Admin UI)
We only cloned the **creator** side and landing. Admin/brand tooling was not in the mirror, so this is educated guesswork:

- **Monitoring views**
  - Submissions have `views`, `likes`, `earnings`. The frontend has “Refresh engagement” per submission.
  - Likely: (1) a **cron or queue job** that calls TikTok/YouTube/Instagram/X APIs (or a third-party aggregator) to fetch view counts for each submission URL and updates the DB; or (2) **manual entry** by staff; or (3) creators self-report and admins approve. The “refresh” button suggests the backend can re-fetch from somewhere (or re-run a job for that submission).

- **Adding campaigns**
  - Campaigns have title, description, niche, platform, budget, RPM, status. So *someone* creates them.
  - Likely: (1) a **brand dashboard** (we have a placeholder brand-overview only) where brands create campaigns after approval; or (2) an **admin panel** where staff create campaigns on behalf of brands; or (3) both (brand drafts, admin approves/publishes).

- **Monitoring brand applications**
  - The landing “I’m a Brand” CTA goes to a **Google Form** (external link), not in-app signup.
  - So “brand applying” = fill form → someone reviews → then either manual onboarding (create brand account, create campaign for them) or they get access to a brand dashboard. No in-app brand application flow is visible in the clone.

- **Other admin tasks**
  - Approve/reject submissions (so submissions have `status`).
  - Process payouts (mark payout_requests as paid, move money).
  - Possibly: ban users, edit campaigns, view all creators/brands.

**Summary:** No admin UI was cloned. Likely they had a separate admin app or `/admin` routes, plus cron/jobs for views and manual steps for brands (form → human → create campaign/account). We add our own admin API (see below); you can add a simple admin UI or use the API from scripts/Postman.

---

## 2. Our Backend: What We Build

We implement **our own** versions of the above so the LitoClips frontend works.

### 2.1 Stack
- **Runtime:** Node.js
- **Framework:** Express
- **Database:** SQLite (single file, no extra DB server) via `better-sqlite3`
- **Auth:** JWT (access token); optional refresh flow later
- **OAuth:** Passport.js + `passport-discord`, `passport-google-oauth20` (our own Discord/Google app credentials)
- **Payments:** Stored in DB only (payout requests); no real PayPal/Wise/crypto yet – you plug those in later

### 2.2 Project Layout
```
backend/
├── package.json
├── .env.example
├── server.js              # Entry: Express app, CORS, mount routes
├── config.js              # Port, DB path, JWT secret, OAuth URLs
├── db/
│   ├── schema.sql         # Tables: users, campaigns, submissions, wallet_*, social_accounts, etc.
│   └── index.js           # DB connection, run schema
├── middleware/
│   └── auth.js            # JWT verify; attach user to req
├── routes/
│   ├── auth.js            # /api/auth/* (login, signup, logout, me, profile, email, password, account, notifications)
│   ├── campaigns.js       # /api/campaigns, /api/campaigns/my-campaigns, /api/campaigns/:id/join
│   ├── submissions.js     # /api/submissions (GET, POST, batch, refresh-engagement)
│   ├── wallet.js          # /api/wallet, /api/wallet/balance, /api/wallet/payouts, /api/wallet/withdraw
│   ├── socialAccounts.js  # /api/social-accounts (CRUD, generate-code, verify)
│   ├── analytics.js       # /api/analytics/creator, timeline, platforms, campaign/:id, leaderboard
│   ├── gamification.js    # /api/gamification/profile, /api/gamification/achievements
│   ├── leaderboards.js    # /api/leaderboards, /api/leaderboards/my-position
│   ├── affiliate.js       # /api/affiliate/dashboard
│   └── notifications.js   # /api/notifications
├── oauth/
│   └── index.js           # Discord & Google strategies; /auth/discord, /auth/google, callbacks
└── README.md              # How to run, env vars, creating Discord/Google apps
```

### 2.3 Database Entities (Our Schema)
- **users** – id, email, passwordHash, name, userType (creator|brand), referralCode, referredBy, createdAt
- **campaigns** – id, brandId (or external), title, description, niche, platform, budget, rpm, status, createdAt
- **campaign_joins** – userId, campaignId, joinedAt
- **submissions** – id, userId, campaignId, platform, postUrl, status, views, likes, earnings, createdAt
- **wallet_balances** – userId, availableBalance, pendingBalance, totalEarnings, totalPaid
- **payout_requests** – id, userId, amount, paymentMethod, paymentDetails (JSON), status, createdAt
- **social_accounts** – id, userId, platform, handle, status, verificationCode, createdAt
- **achievements** – id, userId, type, unlockedAt
- **gamification** – userId, level, xp, streak, bestStreak (or in users table)
- **notifications** – id, userId, type, read, createdAt
- **affiliate_commissions** – id, referrerId, referredId, amount, status, createdAt

### 2.4 What We Replace
| Piece           | Original (inferred)  | Ours                          |
|----------------|----------------------|-------------------------------|
| API host       | litoclips.com        | localhost:37373 or your domain |
| Auth           | Their JWT + OAuth     | Our JWT + our Discord/Google apps |
| Database       | Unknown               | SQLite (file)                 |
| Discord/Google | Their client IDs      | Your apps + .env              |
| Payments       | Real providers        | DB-only (stub); add later     |
| Social verify  | Their API usage       | Code-in-bio + optional stub   |

### 2.5 Frontend Changes for “Our” Backend
- Frontend already uses `http://localhost:37373/api` when on localhost.
- OAuth redirect URIs must be set to **your** URLs (e.g. `http://localhost:37373/auth/discord/callback` for dev).
- Replace any hardcoded OAuth links in the frontend with `/auth/discord` and `/auth/google` (or configurable base URL) so the browser hits your backend, which then redirects to Discord/Google.

---

## 3. Summary: Full Structure of What They Did

1. **Monolith API** – One backend serving both landing and dashboard at `{origin}/api` and `{origin}/api/auth`.
2. **JWT auth** – Token in header; used for /me, dashboard, submissions, wallet, settings.
3. **OAuth callbacks on server** – Discord and Google redirect to server routes; server creates/updates user and returns a session (e.g. redirect to frontend with token or set cookie).
4. **Relational data** – Users, campaigns, joins, submissions, wallet, payouts, social accounts, gamification, referrals.
5. **Payments** – Payout requests stored; actual payouts likely via PayPal/Wise/bank/crypto (we only store requests).
6. **Social verification** – Generate code, user puts in bio, verify (with or without platform API).
7. **Analytics** – Aggregated from submissions (views, earnings) and optional timeline/leaderboards.

By implementing the routes and schema above, we replicate this structure with our own database, auth, and OAuth apps, and leave payments and external verification as stubs you can complete later.

---

## 4. Our Admin API

Admins are **your** users with `is_admin = 1` in the DB. All admin routes require a valid JWT for a user who is an admin.

### 4.1 How to make the first admin
After creating your first user (e.g. sign up via the app), set them as admin in SQLite:
```bash
sqlite3 backend/data.db "UPDATE users SET is_admin = 1 WHERE email = 'your@email.com';"
```
Or use the API after one admin exists: `PUT /api/admin/users/:userId/admin` with body `{ "isAdmin": true }`.

### 4.2 Admin endpoints (all under `/api/admin`, require Admin JWT)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/campaigns` | List all campaigns |
| POST | `/api/admin/campaigns` | Create campaign (body: title, description, niche, platform, budget, rpm, cover_image) |
| PUT | `/api/admin/campaigns/:id` | Update campaign |
| GET | `/api/admin/submissions` | List all submissions (?status=pending\|approved\|rejected\|all) |
| PUT | `/api/admin/submissions/:id/status` | Set status to pending/approved/rejected. On approve, earnings = (views/1000)*RPM and are added to creator wallet. |
| PUT | `/api/admin/submissions/:id/engagement` | Set views/likes for a submission (e.g. after manual check or cron). Recomputes submission earnings from campaign RPM. |
| GET | `/api/admin/payouts` | List all payout requests (?status=...) |
| PUT | `/api/admin/payouts/:id` | Set payout status (pending/approved/rejected). Rejected returns amount to available balance; approved updates total_paid. |
| GET | `/api/admin/brand-applications` | List brand applications (?status=...) |
| POST | `/api/admin/brand-applications` | Create one (e.g. when you receive a form submission). Body: company_name, contact_email, contact_name, notes |
| PUT | `/api/admin/brand-applications/:id` | Update status/notes |
| PUT | `/api/admin/users/:id/admin` | Set is_admin true/false for a user |

### 4.3 Monitoring views in practice
- **Manual:** Use `PUT /api/admin/submissions/:id/engagement` with `{ "views": 12345 }` after you check the post URL. Then approve the submission so earnings are added.
- **Automated (later):** Add a cron or queue job that, for each submission with post_url, calls TikTok/YouTube/Instagram/X APIs (or a third-party service), then calls the same engagement endpoint or updates the DB directly.
