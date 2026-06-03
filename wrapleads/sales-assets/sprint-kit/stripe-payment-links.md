# Stripe Payment Links Setup (5 minutes, zero code)

Goal: 3 working "buy now" URLs you can paste into emails, the sales page, anywhere.

## Step 1 — Create the products in Stripe Dashboard

1. Log in → **Product catalog** → **+ Add product**.
2. Create three products:

   | Product name                       | One-time price |
   |---|---|
   | HelioScout — Single Metro Pack     | \$497          |
   | HelioScout — State Pack            | \$1,497        |
   | HelioScout — National Pack (20k)   | \$4,997        |

3. For each: set **Pricing model = One-time**, currency = USD. Save.

## Step 2 — Generate Payment Links

For each product:
1. Open the product → **+ Create payment link**.
2. Tax behavior: **No tax** (we're not collecting sales tax on lead data).
3. After-payment: **Show a confirmation page** with message: *"Thanks! Your lead pack will arrive by email within 1 business hour."*
4. **Collect customer's name, email, and which US state they want** (custom fields → text input → required).
5. Save.

Stripe gives you a permanent URL like `https://buy.stripe.com/eVqaEW2X6cI95oo5lO0wU00`.

## Step 3 — Paste those URLs into:

- `dist-public/buy-solar-leads.html` — replace the existing `data-pack` buttons' click handlers to just `window.location = "<your-link>"`.
- Cold-email templates (replace any "Reply YES" with the direct link).
- Your email signature.

## Step 4 — Set the env vars for auto-fulfillment

When you're ready to wire the auto-CSV delivery webhook:

```bash
export STRIPE_SECRET_KEY=sk_live_...
export STRIPE_WEBHOOK_SECRET=whsec_...
export STRIPE_PRICE_METRO=price_...
export STRIPE_PRICE_STATE=price_...
export STRIPE_PRICE_NATIONAL=price_...
```

The price IDs come from the URLs of each product in the Stripe Dashboard.

## Webhook URL

Point Stripe's webhook (Settings → Developers → Webhooks → + Add endpoint) at:
`https://<your-domain>/stripe/webhook`

Listen for: `checkout.session.completed`. Our `fulfillLeadPack()` handler does the rest — looks up the right CSV and emails it.

---

**For first $1 in the next hour:** you don't need the webhook. Just take the payment, then manually email the CSV from `sales-assets/territory-packs/` to the buyer. Wire automation after sale #5.
