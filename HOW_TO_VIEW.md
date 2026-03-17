# How to view LitoClips (no Discord/OAuth needed)

You can see the full site and dashboard without setting up Discord or Google OAuth.

## 1. View the marketing site

- Open **`shardcreators.com/index.html`** in your browser (double-click or use “Open with”).
- Or serve the folder (e.g. VS Code Live Server on `shardcreators.com`) and open the root URL.

## 2. Preview as a logged-in creator (no backend)

- On the homepage, click **“Preview without login”** (blue/secondary button under the main CTAs).
- Or go directly to: **`index.html?bypass=1`** (or `?demo=1`).
- You’ll appear logged in as “Demo User” and can open:
  - **Dashboard** → creator dashboard, browse campaigns, my campaigns, submissions, wallet, settings.
- Links like Discord/Google still point to `#` or your backend; they won’t work until you configure OAuth.

## 3. Full experience (login, campaigns, submissions, admin)

1. **Start the backend** (from project root):
   ```bash
   cd backend
   npm install
   npm run init-db
   npm start
   ```
2. **Sign up with email** on the site (Login → Sign Up). No Discord/Google required.
3. **Optional – make yourself admin** (so you can open the admin dashboard):
   ```bash
   cd backend
   sqlite3 data.db "UPDATE users SET is_admin = 1 WHERE email = 'your@email.com';"
   ```
4. **Open the admin dashboard**: go to **`admin.html`** (same folder as `index.html`), or click **Admin** in the header when logged in as an admin.
   - **Overview**: counts (users, campaigns, submissions, payouts).
   - **Campaigns**: add campaigns, see list.
   - **Submissions**: see all submissions, set views, set status (pending/approved/rejected).
   - **Payouts**: list and approve/reject payout requests.
   - **Users**: list users, “Make admin”.

## Summary

| What you want              | What to do                                              |
|---------------------------|---------------------------------------------------------|
| See the marketing pages   | Open `index.html` or serve `shardcreators.com`.         |
| See dashboard (no API)    | Use “Preview without login” or `index.html?bypass=1`.    |
| Real login + data + admin | Run backend, sign up, optionally set admin, use `admin.html`. |
