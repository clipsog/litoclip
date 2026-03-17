# Stripe setup guide — step by step

Your app uses **Stripe Checkout**: the backend creates a session and returns a URL; the user pays on Stripe’s page, then Stripe sends a webhook to your server so you mark the payment and campaign as paid.

Do these steps **one at a time**. Use **test mode** first, then switch to **live** when you go to production.

---

## Step 1 — Create a Stripe account (if you don’t have one)

1. Go to **https://dashboard.stripe.com/register**.
2. Sign up with your email.
3. Complete any verification Stripe asks for.

You can do everything below in **Test mode** (toggle in the top-right of the dashboard: “Test mode” ON = test keys and test payments).

---

## Step 2 — Get your API keys

1. In the Stripe Dashboard, open **Developers → API keys** (or go to https://dashboard.stripe.com/apikeys).
2. Make sure **Test mode** is ON (toggle in the top right) while you’re testing.
3. You’ll see:
   - **Publishable key** — starts with `pk_test_...` (test) or `pk_live_...` (live).  
     This is safe to use in the frontend; your app gets it from `GET /api/payments/config`.
   - **Secret key** — click “Reveal” to see it. Starts with `sk_test_...` or `sk_live_...`.  
     **Never** put this in the frontend or in git; only in backend `.env`.

4. Copy both keys. You’ll add them to `.env` in the next step.

---

## Step 3 — Add keys to your backend `.env`

1. Open (or create) the file **`backend/.env`** in your project.
2. Add these lines (use your real keys from Step 2):

```env
# Stripe — use test keys first (pk_test_... and sk_test_...)
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
# Webhook secret — leave empty for now; we add it in Step 5
STRIPE_WEBHOOK_SECRET=
```

3. Save the file.
4. Restart your backend (`npm start` in the `backend` folder).

After this, the backend can create Checkout sessions. The webhook secret is required so Stripe’s “payment completed” event can safely update your database; we set that up next.

---

## Step 4 — Understand what the webhook does

When a customer completes payment on Stripe Checkout:

1. Stripe sends an HTTP POST request to **your** server at a URL you choose (e.g. `https://your-domain.com/api/payments/stripe-webhook`).
2. The body is a **event** (e.g. `checkout.session.completed`). Your server already handles this event in `server.js`: it marks the payment as `paid`, sets the campaign to `active` and `payment_status = paid`, sets `started_at` if needed, and creates an admin alert.

So you **must** give Stripe a webhook URL and listen for `checkout.session.completed`. For **local testing** you need a public URL; the easiest way is the **Stripe CLI**. For **production** you use your real HTTPS URL.

---

## Step 5a — Webhook for local testing (Stripe CLI)

1. **Install Stripe CLI**  
   - Mac (Homebrew): `brew install stripe/stripe-cli/stripe`  
   - Or download from https://stripe.com/docs/stripe-cli  

2. **Log in** (one time):

   ```bash
   stripe login
   ```

   A browser window opens; approve access.

3. **Forward webhooks to your local server**  
   With your backend running on port 37373 (or whatever `PORT` is in `.env`), run in a **separate terminal**:

   ```bash
   stripe listen --forward-to localhost:37373/api/payments/stripe-webhook
   ```

4. The CLI will print a line like:

   ```text
   Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxx
   ```

5. **Put that secret in `.env`**:

   ```env
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
   ```

6. **Restart your backend** so it loads the new `STRIPE_WEBHOOK_SECRET`.

Now when you run a test payment, Stripe sends the event through the CLI to your local server, and your code can mark the payment and campaign as paid.

---

## Step 5b — Webhook for production

1. In Stripe Dashboard, switch to **Live mode** (toggle in the top right) when you’re ready to go live.
2. Go to **Developers → Webhooks** (https://dashboard.stripe.com/webhooks).
3. Click **Add endpoint**.
4. **Endpoint URL:**  
   Your public HTTPS URL for the webhook, e.g.  
   `https://litoclips.com/api/payments/stripe-webhook`  
   (must be the URL where your backend is actually served; replace with your real domain.)
5. Under **Events to send**, choose **Select events** and select:
   - **checkout.session.completed**
6. Click **Add endpoint**.
7. On the new endpoint’s page, click **Reveal** under **Signing secret** and copy it (starts with `whsec_...`).
8. Add it to your **production** `.env` (on the server):

   ```env
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
   ```

9. Restart your backend in production.

Important: **Test mode** and **Live mode** have different webhook endpoints and different signing secrets. Use the CLI secret for local test; use the Dashboard “Reveal” secret for the live endpoint.

---

## Step 6 — Test a payment (test mode)

1. Ensure **Test mode** is ON in the Stripe Dashboard.
2. In `backend/.env` you have:
   - `STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE`
   - `STRIPE_PUBLISHABLE_KEY=pk_test_...`
   - `STRIPE_WEBHOOK_SECRET=whsec_...` (from `stripe listen` for local testing).
3. Backend is running; if local, `stripe listen --forward-to localhost:37373/api/payments/stripe-webhook` is running in another terminal.
4. In your app, create a campaign and go to the campaign track page. When you implement “Pay for next week” (or any “pay” action), the frontend should:
   - Call `POST /api/payments/create` with `{ campaignId, amountCents, currency, paymentMethod: 'stripe' }`.
   - Receive `{ checkoutUrl, paymentId, ... }` and redirect the user to `checkoutUrl`.
5. On Stripe’s Checkout page, use test card **4242 4242 4242 4242**, any future expiry, any CVC, any postal code.
6. After payment, Stripe redirects to your `success_url` (campaign-track page with `payment=success`) and sends `checkout.session.completed` to your webhook. Your backend then updates the payment and campaign.

If the webhook is missing or wrong, the payment will succeed on Stripe but the campaign won’t be marked paid in your DB. So always confirm the webhook is receiving events (Stripe CLI shows them; in production use Dashboard → Webhooks → endpoint → “Recent events”).

---

## Step 7 — Go live with Stripe

1. In Stripe Dashboard, complete **activation** for live payments (identity, bank account, etc.).
2. Switch to **Live mode** and go to **Developers → API keys**.
3. Copy the **live** publishable and secret keys (`pk_live_...`, `sk_live_...`).
4. In your **production** `.env` set:
   - `STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE`
   - `STRIPE_PUBLISHABLE_KEY=pk_live_...`
   - `STRIPE_WEBHOOK_SECRET=whsec_...` (from the **live** webhook endpoint you added in Step 5b).
5. Ensure your production backend is served over **HTTPS** and the webhook URL is the one you registered in the Dashboard.
6. Restart the backend and run a small real payment to confirm the webhook runs and the campaign is marked paid.

---

## Quick reference

| What | Where |
|------|--------|
| API keys | Stripe Dashboard → Developers → API keys |
| Test cards | https://stripe.com/docs/testing |
| Webhooks (prod) | Developers → Webhooks → Add endpoint → URL + `checkout.session.completed` |
| Your webhook URL (prod) | `https://YOUR_DOMAIN/api/payments/stripe-webhook` |
| Local webhook | `stripe listen --forward-to localhost:37373/api/payments/stripe-webhook` |

Your backend already:
- Creates a Checkout session and returns `checkoutUrl` when you call `POST /api/payments/create` with `paymentMethod: 'stripe'`.
- Exposes `GET /api/payments/config` so the frontend can get `stripePublishableKey` if you ever need it on the client.
- Handles `checkout.session.completed` in `server.js` and updates `payments`, `campaigns`, and admin alerts.

If you want, next we can wire the **“Pay for next week”** button on the campaign track page to call `POST /api/payments/create` and redirect to Stripe Checkout.
