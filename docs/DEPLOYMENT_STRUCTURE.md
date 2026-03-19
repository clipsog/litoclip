# LitoClips Deployment Structure

## Recommended: Backend (Render) + Frontend (Vercel)

This is the **best fit** for your current setup.

```
┌─────────────────────────────────────────────────────────┐
│  litoclips.com                                          │
│  (Vercel: serves static frontend + proxies /api, /auth) │
└─────────────────────────────────────────────────────────┘
         │
         │  /api/*  and  /auth/*  → proxied to Render
         ▼
┌─────────────────────────────────────────────────────────┐
│  Render (litoclip)                                      │
│  Node/Express: API, OAuth, database                     │
└─────────────────────────────────────────────────────────┘
```

### Why this structure?

| | Render only | Vercel + Render (recommended) |
|---|---|---|
| **Frontend** | Would need FRONTEND_PATH, but Render only deploys `backend/` folder | Vercel CDN = fast, global |
| **API** | ✅ | ✅ Same (Render) |
| **OAuth** | Same origin | Same origin (proxy keeps litoclips.com) |
| **Deploys** | One | Two (but Vercel auto-deploys on push) |
| **Clean URLs** | Backend redirects | vercel.json rewrites |

---

## Vercel Setup (Frontend)

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**
2. Import your repo (`clipsog/litoclip`)
3. **Root Directory:** set to `shardcreators.com`
4. **Framework Preset:** Other (static)
5. **Build Command:** leave empty (static site)
6. **Output Directory:** leave empty or `.`
7. **Environment:**
   - Not needed for static files (API URL uses `window.location.origin`)

### Custom domain
- Add `litoclips.com` in Vercel → Settings → Domains
- Point your DNS to Vercel (they’ll show the CNAME)

### API proxy
Add to `shardcreators.com/vercel.json` (already done):

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://YOUR-RENDER-URL.onrender.com/api/:path*" },
    { "source": "/auth/:path*", "destination": "https://YOUR-RENDER-URL.onrender.com/auth/:path*" },
    { "source": "/dashboard-creator", "destination": "/dashboard-creator.html" },
    { "source": "/brand-overview", "destination": "/brand-overview.html" },
    { "source": "/sponsor-dashboard", "destination": "/sponsor-dashboard.html" },
    { "source": "/login", "destination": "/login.html" },
    { "source": "/signup", "destination": "/signup.html" }
  ]
}
```

**Important:** The proxy uses `litoclip.onrender.com` (from the Render service name). If your service has a different URL, update it in both `vercel.json` and `shardcreators.com/vercel.json`.

---

## Render Setup (Backend)

- **Root Directory:** `backend`
- **Build:** `npm install`
- **Start:** `npm start`

### Env vars
- `NODE_ENV=production`
- `JWT_SECRET=...`
- `FRONTEND_ORIGIN=https://litoclips.com`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL=https://litoclips.com/auth/google/callback`

### Custom domain
- You can leave the default `*.onrender.com` URL if Vercel proxies to it
- Or add a custom domain for the API if you prefer

---

## Alternative: All on Render

If you want a single service:

1. Change Render **Root Directory** to `.` (project root)
2. **Build Command:** `cd backend && npm install`
3. **Start Command:** `cd backend && npm start`
4. Add env: `FRONTEND_PATH=../shardcreators.com`
5. Backend will serve static files and API from the same origin

**Downside:** Frontend goes through Node; no CDN for static assets.

---

## Quick check

- **Frontend:** https://litoclips.com (Vercel)
- **API:** https://litoclips.com/api/health (proxied to Render)
- **OAuth:** https://litoclips.com/auth/google (proxied to Render)
