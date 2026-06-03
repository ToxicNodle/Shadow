# HelioScout Revenue Sprint Kit

**Goal:** First $1,497 in lead-pack revenue within 7 days. Stack to $74,850 (50 state packs) by day 90.

## Execute today (≤ 60 minutes)

### 1. Set up Stripe Payment Links (5 min)
Open `stripe-payment-links.md` → follow the 4 steps.

If you don't have a Stripe account yet OR want zero-friction first sale: open `gumroad-setup.md` and use Gumroad instead. Switch later.

### 2. Personalize the cold emails (10 min)
Open `cold-emails/` → 5 variants (A through E-followup).

Replace tokens: `{{first_name}}`, `{{company}}`, `{{state}}`, `{{state_count}}`, `{{focus}}`.

`{{state_count}}` cheat sheet (from existing CSV packs):

| State | Lead count |
|---|---:|
| TX | 3,009 |
| CA | 1,594 |
| OH | 992 |
| PA | 866 |
| IL | 644 |
| FL | 583 |
| GA | 550 |
| NY | 527 |
| AZ | 475 |
| NJ | 450 |

### 3. Pick your first 25 prospects (10 min)
Open `installer-prospects.csv` — 50 named US commercial solar installers with guessed sales/info emails.

- Sort by your strongest state first (TX or CA = highest lead counts).
- Pull the top 25 rows.
- Quick verify each domain on Google (some change over time).
- For each company, find a real contact email — LinkedIn Sales Nav, Apollo free tier, or `hunter.io/email-finder`.

### 4. Send 25 emails (20 min)
Paste Email A from `cold-emails/01-email-a.md` into Gmail. Personalize tokens. Send 25 in one sitting.

Don't BCC bulk — Google flags it. Send individually (use Apollo's send-from-Gmail feature, Hubspot Sequences free tier, or Lemlist trial if you want sequencer help).

Log each one in `revenue-tracker.csv` (paste into Google Sheets first).

### 5. Schedule the follow-up (5 min)
Email E (the day-3 bump) goes out 72 hours later. Set a calendar reminder.

### 6. Reply triage (10 min, ongoing)
- **YES, send sample** → reply with the free 50-lead sample CSV attached, plus Stripe Payment Link for the full state pack. Track in tracker.
- **Interested, more info** → send the welcome-packet text (`welcome-packet.md`).
- **Not interested / bounce** → mark in tracker, move on.
- **Buys** → manually email the right state CSV from `sales-assets/territory-packs/`. Wire auto-fulfillment after sale 5.

## Week 1 target

- Sent: 100 emails (Mon–Fri)
- Sample requests: 8–12 (10% reply rate is normal)
- Paid sales: 1–3 → \$1,497–\$4,491 → covers Claude Max for 6+ months

## Week 4 target

- Cumulative sent: 400 emails
- Sample requests: 35–50
- Paid sales: 8–12 → \$12k–\$18k → enough to fund a contractor pass on WrapOS features

## Week 12 target (90 days)

- 50 paid packs avg \$1,497 = **\$74,850**
- Add 5 National Pack sales \$4,997 each = **+\$24,985**
- Pay-per-deal tier launched (Phase B from the master plan)

## When to invest the revenue back

| Milestone | Reinvest into |
|---|---|
| First \$1k | Apollo trial seat (\$99) — better installer prospecting |
| First \$5k | Stripe Connect + auto-fulfillment webhook (eliminate manual delivery) |
| First \$15k | HubSpot integration (Phase B1 from master plan) |
| First \$30k | Pay-per-closed-deal tier launch + Stripe usage billing |
| First \$50k | Salesforce integration + dedicated outbound SDR contractor |

## Files in this kit

- `installer-prospects.csv` — 50 prospects
- `cold-emails/` — 5 ready-to-send variants
- `stripe-payment-links.md` — Stripe setup
- `gumroad-setup.md` — Gumroad fallback
- `gumroad-product-description.md` — paste-ready Gumroad copy
- `welcome-packet.md` — what buyers see after purchase
- `revenue-tracker.csv` — Google-Sheets-ready
