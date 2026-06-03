# Gumroad Setup (Stripe-free backup, 10 minutes)

If Stripe approval is slow or you want a zero-infra option, Gumroad takes a payment + auto-delivers a file.

## Setup

1. Create a Gumroad account at https://gumroad.com.
2. **Create product** → **Digital product** → **File**.
3. Upload `sales-assets/territory-packs/helioscout-TX-3009leads.csv` (or whichever state you want to lead with).
4. Title: **HelioScout TX Commercial Solar Lead Pack (3,009 leads)**.
5. Description (paste from `gumroad-product-description.md` below).
6. Price: \$1,497 (or whichever tier).
7. Repeat for each state pack + the national pack (`helioscout-all-leads.zip`).

## Pros
- Zero code, zero webhook setup.
- Built-in checkout, file delivery, receipt, refund flow.
- Gumroad takes ~10% — net per state pack ≈ \$1,347.

## Cons
- 10% take rate vs Stripe ~2.9% + \$0.30.
- Gumroad branding in checkout.
- Slightly less professional than your own checkout.

## When to use Gumroad vs Stripe
- **First 10 sales**: Gumroad. Zero setup, validate demand.
- **Sales 10–50**: Migrate to Stripe Payment Links. Better margin, more pro feel.
- **Sales 50+**: The full `/solar/store/checkout` flow with auto-fulfillment webhook.
