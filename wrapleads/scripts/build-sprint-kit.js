#!/usr/bin/env node
/**
 * Build the Revenue Sprint Kit — everything needed to ship the lead bundle
 * and collect first dollars from commercial solar installers this week.
 *
 * Produces under sales-assets/sprint-kit/:
 *   - installer-prospects.csv         (36 named US commercial solar contractors)
 *   - cold-emails/*.md                (5 ready-to-send email variants)
 *   - stripe-payment-links.md         (3-pack Stripe Dashboard setup, 5-minute clicks)
 *   - gumroad-setup.md                (zero-Stripe-needed backup checkout path)
 *   - welcome-packet.md               (what the buyer sees after purchase)
 *   - revenue-tracker.csv             (track sends, replies, sales, $$)
 *   - README.md                       (execute-today checklist)
 *
 * Each prospect row includes a guessed sales/info email pattern so the owner
 * can paste the list into Apollo / Hunter / their own outreach tool and
 * verify in one pass.
 *
 * Usage:  node scripts/build-sprint-kit.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'sales-assets', 'sprint-kit');

// 36 real US commercial solar contractors from Siteline's 2025 list, plus
// 14 additional named installers from EnergySage / NABCEP / SolarReviews
// research. Each row carries: company, state, likely_domain, primary_focus.
//
// Domains are best-guesses based on company name; verify before sending.
// State coverage is HQ state — most of these operate regionally.
const PROSPECTS = [
  // Siteline "Top 36" — proven commercial focus
  { company: 'A.M. Sun Solar',                state: 'CA', domain: 'amsunsolar.com',                focus: 'commercial + agricultural' },
  { company: 'AFC Solar',                     state: 'TX', domain: 'afcsolar.com',                  focus: 'commercial EPC' },
  { company: 'All Energy Solar',              state: 'MN', domain: 'allenergysolar.com',            focus: 'commercial + residential' },
  { company: 'American Sentry Solar',         state: 'MD', domain: 'americansentry.com',            focus: 'commercial + residential' },
  { company: 'Arch Solar',                    state: 'WI', domain: 'archsolar.com',                 focus: 'commercial + residential' },
  { company: 'Berkowatts Electric',           state: 'NJ', domain: 'berkowatts.com',                focus: 'commercial electrical + solar' },
  { company: 'Boston Solar',                  state: 'MA', domain: 'bostonsolar.us',                focus: 'commercial + residential' },
  { company: 'Brooklyn SolarWorks',           state: 'NY', domain: 'brooklynsolarworks.com',        focus: 'urban commercial + residential' },
  { company: 'Creative Energies',             state: 'WY', domain: 'cesolar.com',                   focus: 'commercial + residential' },
  { company: 'Freedom Solar Power',           state: 'TX', domain: 'freedomsolarpower.com',         focus: 'commercial + residential (24k+ installs)' },
  { company: 'Geoscape Solar',                state: 'NJ', domain: 'geoscapesolar.com',             focus: 'commercial + residential' },
  { company: 'Got Electric',                  state: 'MD', domain: 'gotelectric.com',               focus: 'commercial electrical' },
  { company: 'Harmon Electric',               state: 'AZ', domain: 'harmonelectric.com',            focus: 'commercial electrical + solar' },
  { company: 'Harvest Power',                 state: 'NY', domain: 'harvestpower.solar',            focus: 'commercial + agricultural' },
  { company: 'ISO Solar',                     state: 'PR', domain: 'isosolar.com',                  focus: 'commercial PR/Caribbean' },
  { company: 'Jefferson Electric',            state: 'IN', domain: 'jeffersonelectric.com',         focus: 'commercial electrical + solar' },
  { company: 'John Mills Electric',           state: 'NY', domain: 'johnmillselectric.com',         focus: 'commercial electrical' },
  { company: 'M Bar C Construction',          state: 'CA', domain: 'mbarcconstruction.com',         focus: 'parking-canopy + commercial' },
  { company: 'M.L. Schmitt',                  state: 'MA', domain: 'mlschmitt.com',                 focus: 'commercial electrical' },
  { company: 'New Era Electric',              state: 'CA', domain: 'newera-electric.com',           focus: 'commercial + industrial' },
  { company: 'Positive Energy Solar',         state: 'NM', domain: 'positiveenergysolar.com',       focus: 'commercial + residential' },
  { company: 'Puget Sound Solar',             state: 'WA', domain: 'pugetsoundsolar.com',           focus: 'commercial + residential' },
  { company: 'Renova Energy',                 state: 'CA', domain: 'renovaenergy.com',              focus: 'commercial + residential' },
  { company: 'Renu Energy Solutions',         state: 'NC', domain: 'renuenergysolutions.com',       focus: 'commercial + residential' },
  { company: 'Resolute Performance Contracting', state: 'AZ', domain: 'resolutepc.com',             focus: 'commercial + industrial' },
  { company: 'ReVision Energy',               state: 'ME', domain: 'revisionenergy.com',            focus: 'commercial + residential (B Corp)' },
  { company: 'RevoluSun Mountain States',     state: 'ID', domain: 'revolusun.com',                 focus: 'commercial + residential' },
  { company: 'RevoluSun Smart Home',          state: 'HI', domain: 'revolusun.com',                 focus: 'commercial + residential' },
  { company: 'Sandbar Solar',                 state: 'CA', domain: 'sandbarsolar.com',              focus: 'commercial + residential' },
  { company: 'Scudder Solar Energy Systems',  state: 'CA', domain: 'scuddersolar.com',              focus: 'commercial + residential' },
  { company: 'Solar by CIR',                  state: 'NY', domain: 'solarbycir.com',                focus: 'commercial + residential' },
  { company: 'Solar Holler',                  state: 'WV', domain: 'solarholler.com',               focus: 'commercial + residential (B Corp)' },
  { company: 'Solar States',                  state: 'PA', domain: 'solar-states.com',              focus: 'commercial + residential (B Corp)' },
  { company: 'SUNation Energy',               state: 'NY', domain: 'sunation.com',                  focus: 'commercial + residential' },
  { company: 'Sunrise Power Solutions',       state: 'NY', domain: 'sunrisepowersolutions.com',     focus: 'commercial + residential' },
  { company: 'Teichert Solar',                state: 'CA', domain: 'teichertsolar.com',             focus: 'commercial + industrial (100+ MW)' },

  // Additional named commercial-focus from EnergySage / SolarReviews / NABCEP
  { company: 'Big Sun Solar',                 state: 'TX', domain: 'bigsunsolar.com',               focus: 'commercial EPC (San Antonio, Austin)' },
  { company: 'IntegrateSun',                  state: 'TX', domain: 'integratesun.com',              focus: 'commercial + residential (Houston)' },
  { company: 'Sunshine Renewable Solutions',  state: 'TX', domain: 'sunshinerenewable.com',         focus: 'commercial Houston' },
  { company: 'Native Solar',                  state: 'TX', domain: 'nativesolar.com',               focus: 'commercial + residential (Austin)' },
  { company: 'Lighthouse Solar',              state: 'TX', domain: 'lighthousesolar.com',           focus: 'commercial + residential' },
  { company: 'Sunworks',                      state: 'CA', domain: 'sunworksusa.com',               focus: 'commercial + agricultural' },
  { company: 'Ameresco',                      state: 'MA', domain: 'ameresco.com',                  focus: 'large commercial EPC' },
  { company: 'CleanCapital',                  state: 'NY', domain: 'cleancapital.com',              focus: 'commercial solar + developer' },
  { company: 'PosiGen',                       state: 'CT', domain: 'posigen.com',                   focus: 'commercial + residential (LMI)' },
  { company: 'Cypress Creek Renewables',      state: 'NC', domain: 'cypresscreekrenewables.com',    focus: 'utility + commercial' },
  { company: 'Standard Solar',                state: 'MD', domain: 'standardsolar.com',             focus: 'commercial + community solar' },
  { company: 'Pivot Energy',                  state: 'CO', domain: 'pivotenergy.net',               focus: 'commercial + community solar' },
  { company: 'Sunrock Distributed Generation', state: 'NC', domain: 'sunrockdg.com',                focus: 'commercial DG' },
  { company: 'PurePoint Energy',              state: 'CT', domain: 'purepointenergy.com',           focus: 'commercial + residential' },
];

const EMAIL_PATTERNS = ['sales', 'info', 'hello', 'contact'];

function csvEsc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildProspectCsv() {
  const cols = [
    'company', 'state', 'domain', 'focus',
    'email_sales', 'email_info', 'website',
    'last_emailed', 'replied', 'requested_sample', 'purchased', 'amount_usd', 'notes',
  ];
  const lines = [cols.join(',')];
  for (const p of PROSPECTS) {
    lines.push([
      csvEsc(p.company), csvEsc(p.state), csvEsc(p.domain), csvEsc(p.focus),
      csvEsc(`sales@${p.domain}`), csvEsc(`info@${p.domain}`), csvEsc(`https://${p.domain}`),
      '', '', '', '', '', '',
    ].join(','));
  }
  return lines.join('\n') + '\n';
}

// ── Cold-email templates ────────────────────────────────────────────────
const EMAIL_VARIANT_A = `Subject: 50 EPA-verified {{state}} solar leads — free, no demo

Hi {{first_name}},

We pulled 20,206 US commercial properties from EPA's Greenhouse Gas Reporting list, USAspending.gov federal awardees, and OpenStreetMap industrial buildings. Every one is a high-fit commercial solar candidate.

{{state}} alone has {{state_count}} of them.

I'll send 50 fully-enriched samples — with NAICS fit scores, system-size estimates, 25-yr NPV math, and a sales script per lead — free, no card, no demo.

If you want the full {{state}} pack after that, it's $1,497 one-time. National pack is $4,997.

Reply YES and I'll send the CSV today.

— Jake
helioscout.app
`;

const EMAIL_VARIANT_B = `Subject: Built you a {{state}} commercial solar lead list

Hey {{first_name}},

Saw {{company}} is doing real commercial work in {{state}} — congrats on the {{focus}} focus.

Two things:

1. We just released a free 50-lead sample of EPA-verified commercial solar prospects (cold storage, manufacturing, data centers, hospitals, warehouses). All public-domain sourced so you can verify provenance row-by-row.

2. The full {{state}} pack is $1,497 — ~{{state_count}} verified facilities, every row scored + ROI-modeled.

Reply for the free sample. No demo call, no email gate, just the CSV in your inbox.

— Jake @ HelioScout
`;

const EMAIL_VARIANT_C = `Subject: ITC deadline July 2026 — {{state_count}} {{state}} prospects waiting

{{first_name}} —

Heads up on the federal ITC construction-start deadline: July 4, 2026. Every commercial solar buyer is on the clock now, and the highest-fit accounts are getting hit hardest.

I run HelioScout. We've pulled 20,206 commercial properties (EPA + USAspending + OSM, all public-domain) and pre-qualified them by NAICS fit, building size, and load profile.

{{state}} pack: ~{{state_count}} leads, scored, with Monte Carlo NPV + sales scripts. $1,497 one-time.

Or grab the free 50-lead sample first — reply YES.

— Jake
`;

const EMAIL_VARIANT_D = `Subject: Quick — exclusive {{state}} commercial solar leads (no sharing)

Hi {{first_name}},

The shared-lead industry sells your "exclusive" $400 lead to 5 of your competitors. We don't.

HelioScout territory packs are **one buyer per pack** + 30-day refund on stale rows. EPA-verified provenance on every lead.

{{state}} pack is $1,497 for ~{{state_count}} pre-qualified commercial properties — cold storage, manufacturing, data centers, hospitals.

50-lead free sample if you want to vet first. Reply for either.

— Jake @ HelioScout
`;

const EMAIL_VARIANT_E_FOLLOWUP = `Subject: re: {{state}} solar lead pack

{{first_name}} — quick bump.

Sending the free 50-lead sample (no reply needed):

https://helioscout.app/solar/store/sample.csv

Each row: company + city + NAICS fit score + system-size estimate + 25-yr NPV + sales script.

If the quality lands, the full {{state}} pack ($1,497) is one Stripe link away. Reply YES.

— Jake
`;

const STRIPE_SETUP = `# Stripe Payment Links Setup (5 minutes, zero code)

Goal: 3 working "buy now" URLs you can paste into emails, the sales page, anywhere.

## Step 1 — Create the products in Stripe Dashboard

1. Log in → **Product catalog** → **+ Add product**.
2. Create three products:

   | Product name                       | One-time price |
   |---|---|
   | HelioScout — Single Metro Pack     | \\$497          |
   | HelioScout — State Pack            | \\$1,497        |
   | HelioScout — National Pack (20k)   | \\$4,997        |

3. For each: set **Pricing model = One-time**, currency = USD. Save.

## Step 2 — Generate Payment Links

For each product:
1. Open the product → **+ Create payment link**.
2. Tax behavior: **No tax** (we're not collecting sales tax on lead data).
3. After-payment: **Show a confirmation page** with message: *"Thanks! Your lead pack will arrive by email within 1 business hour."*
4. **Collect customer's name, email, and which US state they want** (custom fields → text input → required).
5. Save.

Stripe gives you a permanent URL like \`https://buy.stripe.com/eVqaEW2X6cI95oo5lO0wU00\`.

## Step 3 — Paste those URLs into:

- \`dist-public/buy-solar-leads.html\` — replace the existing \`data-pack\` buttons' click handlers to just \`window.location = "<your-link>"\`.
- Cold-email templates (replace any "Reply YES" with the direct link).
- Your email signature.

## Step 4 — Set the env vars for auto-fulfillment

When you're ready to wire the auto-CSV delivery webhook:

\`\`\`bash
export STRIPE_SECRET_KEY=sk_live_...
export STRIPE_WEBHOOK_SECRET=whsec_...
export STRIPE_PRICE_METRO=price_...
export STRIPE_PRICE_STATE=price_...
export STRIPE_PRICE_NATIONAL=price_...
\`\`\`

The price IDs come from the URLs of each product in the Stripe Dashboard.

## Webhook URL

Point Stripe's webhook (Settings → Developers → Webhooks → + Add endpoint) at:
\`https://<your-domain>/stripe/webhook\`

Listen for: \`checkout.session.completed\`. Our \`fulfillLeadPack()\` handler does the rest — looks up the right CSV and emails it.

---

**For first $1 in the next hour:** you don't need the webhook. Just take the payment, then manually email the CSV from \`sales-assets/territory-packs/\` to the buyer. Wire automation after sale #5.
`;

const GUMROAD_SETUP = `# Gumroad Setup (Stripe-free backup, 10 minutes)

If Stripe approval is slow or you want a zero-infra option, Gumroad takes a payment + auto-delivers a file.

## Setup

1. Create a Gumroad account at https://gumroad.com.
2. **Create product** → **Digital product** → **File**.
3. Upload \`sales-assets/territory-packs/helioscout-TX-3009leads.csv\` (or whichever state you want to lead with).
4. Title: **HelioScout TX Commercial Solar Lead Pack (3,009 leads)**.
5. Description (paste from \`gumroad-product-description.md\` below).
6. Price: \\$1,497 (or whichever tier).
7. Repeat for each state pack + the national pack (\`helioscout-all-leads.zip\`).

## Pros
- Zero code, zero webhook setup.
- Built-in checkout, file delivery, receipt, refund flow.
- Gumroad takes ~10% — net per state pack ≈ \\$1,347.

## Cons
- 10% take rate vs Stripe ~2.9% + \\$0.30.
- Gumroad branding in checkout.
- Slightly less professional than your own checkout.

## When to use Gumroad vs Stripe
- **First 10 sales**: Gumroad. Zero setup, validate demand.
- **Sales 10–50**: Migrate to Stripe Payment Links. Better margin, more pro feel.
- **Sales 50+**: The full \`/solar/store/checkout\` flow with auto-fulfillment webhook.
`;

const GUMROAD_DESCRIPTION = `# Gumroad Product Description (paste this)

**HelioScout {STATE_NAME} Commercial Solar Lead Pack — {COUNT} verified facilities**

Every commercial property in {STATE_NAME} pulled from public US government data sources and ranked for solar fit. Each row includes:

- Company name + city + state + NAICS code + sector label
- Solar fit score (0–100) computed across 93 NAICS profiles
- Estimated system kW (rooftop-sized from building footprint)
- Year-1 kWh production + dollar savings at state-average commercial rate
- Net payback after federal ITC + state incentive stack
- 25-year NPV estimate
- Industry-specific cold-open sales script

**Data sources** (all public-domain, attribution per row):
- EPA Greenhouse Gas Reporting Program — every facility emitting >25k tCO2e/yr
- USAspending.gov federal contract recipients in high-energy NAICS
- OpenStreetMap industrial building polygons across top US metros

**What you get:** A single CSV file, downloaded immediately on purchase. Spreadsheet-ready, Apollo / ZoomInfo enrichment-friendly, exclusive to your purchase (no shared-lead model).

**Why $1,497?** Comparable B2B data feeds (ZoomInfo, Lead411) cost $15K+/year. Apollo's commercial-solar filters require Pro tier and don't include solar-specific qualification. Per-lead cost is well under $1/lead — vs $200–$500 industry average for shared exclusive leads.

**Refund:** 30-day money-back if you don't get at least one qualified conversation from the pack. Email support@helioscout.app with your outreach log.

**File format:** CSV, ~{SIZE}KB, opens in Excel / Google Sheets / any CRM importer.
`;

const WELCOME_PACKET = `# Welcome Packet (auto-send on Stripe webhook OR paste manually)

Subject: Your HelioScout {STATE} lead pack is here

Hi {NAME},

Thanks for grabbing the **{STATE} pack** ({COUNT} leads). Here's your download:

📎 {STATE}-pack.csv — attached
🔗 Backup link (in case attachment fails): https://helioscout.app/solar/store/checkout-success/{TOKEN}

## What's in the CSV

Every row is a real US commercial property — pulled from public-domain US gov data — pre-scored for solar fit. Columns:

| Column | What it means |
|---|---|
| **company** | Property / facility name |
| **city, state** | Location |
| **naics_code, naics_sector** | Industry classification + human label |
| **solar_fit_score** | 0–100 ranking across our 93-profile NAICS model |
| **energy_intensity** | Very high / high / moderate / low |
| **tax_appetite** | Corporate / pass-through / mixed / tax-exempt → drives the ownership pitch |
| **recommended_ownership** | direct_purchase / ppa / lease |
| **est_system_kw** | Estimated rooftop PV system size in DC kW |
| **est_annual_kwh** | Year-1 production estimate |
| **est_annual_savings_usd** | Year-1 dollar savings at state-average commercial rate |
| **est_net_payback_yrs** | Years to payback after ITC + state incentive stack |
| **est_25yr_npv_p50_usd** | Median 25-year NPV |
| **sales_script** | A ready-to-use NAICS-aware opener for your first call/email |
| **pitch_angle** | Source attribution + data-provenance note |

## Suggested workflow

1. **Sort by solar_fit_score DESC** in your spreadsheet tool. Work the top 100 first.
2. **Enrich contact info** via Apollo / Hunter / Clearbit — companies are real, contacts need finding (we deliberately don't bundle scraped contact info).
3. **Use the per-row sales_script** as the opener — it's industry-specific and references real ROI math.
4. **For tax-exempt entities** (schools, churches, gov't, non-profits) — pitch a PPA, not a direct purchase. The CSV flags these in the \`tax_appetite\` column.

## Trust

Every lead in this pack traces back to a public US gov data source. If you want a verification spot-check, email support@helioscout.app with 3 row IDs and we'll send you the source URLs.

## 30-day refund

If you don't get at least one qualified conversation from this pack within 30 days, reply to this email with a sample of your outreach (5 sends + response notes) and we'll refund. No friction.

## What's next

If this pack lands, the National Pack (all 20,206 facilities) is \\$4,997 — pre-purchase discount of \\$500 in the first 14 days. Just reply.

— Jake
HelioScout · Commercial Solar Intelligence
`;

const REVENUE_TRACKER = `date,company,state,prospect_email,template_used,reply_status,sample_requested,paid,amount,stripe_session,notes
,,,,,,,,,,
# Paste this into Google Sheets. One row per outbound send.
# template_used: A / B / C / D / E
# reply_status: no_reply / interested / not_interested / referred / bounced
# sample_requested: y / n
# paid: y / n
# amount: 497 / 1497 / 4997 / per_deal
# stripe_session: paste the Stripe session ID for cross-reference
`;

const README = `# HelioScout Revenue Sprint Kit

**Goal:** First $1,497 in lead-pack revenue within 7 days. Stack to $74,850 (50 state packs) by day 90.

## Execute today (≤ 60 minutes)

### 1. Set up Stripe Payment Links (5 min)
Open \`stripe-payment-links.md\` → follow the 4 steps.

If you don't have a Stripe account yet OR want zero-friction first sale: open \`gumroad-setup.md\` and use Gumroad instead. Switch later.

### 2. Personalize the cold emails (10 min)
Open \`cold-emails/\` → 5 variants (A through E-followup).

Replace tokens: \`{{first_name}}\`, \`{{company}}\`, \`{{state}}\`, \`{{state_count}}\`, \`{{focus}}\`.

\`{{state_count}}\` cheat sheet (from existing CSV packs):

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
Open \`installer-prospects.csv\` — 50 named US commercial solar installers with guessed sales/info emails.

- Sort by your strongest state first (TX or CA = highest lead counts).
- Pull the top 25 rows.
- Quick verify each domain on Google (some change over time).
- For each company, find a real contact email — LinkedIn Sales Nav, Apollo free tier, or \`hunter.io/email-finder\`.

### 4. Send 25 emails (20 min)
Paste Email A from \`cold-emails/01-email-a.md\` into Gmail. Personalize tokens. Send 25 in one sitting.

Don't BCC bulk — Google flags it. Send individually (use Apollo's send-from-Gmail feature, Hubspot Sequences free tier, or Lemlist trial if you want sequencer help).

Log each one in \`revenue-tracker.csv\` (paste into Google Sheets first).

### 5. Schedule the follow-up (5 min)
Email E (the day-3 bump) goes out 72 hours later. Set a calendar reminder.

### 6. Reply triage (10 min, ongoing)
- **YES, send sample** → reply with the free 50-lead sample CSV attached, plus Stripe Payment Link for the full state pack. Track in tracker.
- **Interested, more info** → send the welcome-packet text (\`welcome-packet.md\`).
- **Not interested / bounce** → mark in tracker, move on.
- **Buys** → manually email the right state CSV from \`sales-assets/territory-packs/\`. Wire auto-fulfillment after sale 5.

## Week 1 target

- Sent: 100 emails (Mon–Fri)
- Sample requests: 8–12 (10% reply rate is normal)
- Paid sales: 1–3 → \\$1,497–\\$4,491 → covers Claude Max for 6+ months

## Week 4 target

- Cumulative sent: 400 emails
- Sample requests: 35–50
- Paid sales: 8–12 → \\$12k–\\$18k → enough to fund a contractor pass on WrapOS features

## Week 12 target (90 days)

- 50 paid packs avg \\$1,497 = **\\$74,850**
- Add 5 National Pack sales \\$4,997 each = **+\\$24,985**
- Pay-per-deal tier launched (Phase B from the master plan)

## When to invest the revenue back

| Milestone | Reinvest into |
|---|---|
| First \\$1k | Apollo trial seat (\\$99) — better installer prospecting |
| First \\$5k | Stripe Connect + auto-fulfillment webhook (eliminate manual delivery) |
| First \\$15k | HubSpot integration (Phase B1 from master plan) |
| First \\$30k | Pay-per-closed-deal tier launch + Stripe usage billing |
| First \\$50k | Salesforce integration + dedicated outbound SDR contractor |

## Files in this kit

- \`installer-prospects.csv\` — 50 prospects
- \`cold-emails/\` — 5 ready-to-send variants
- \`stripe-payment-links.md\` — Stripe setup
- \`gumroad-setup.md\` — Gumroad fallback
- \`gumroad-product-description.md\` — paste-ready Gumroad copy
- \`welcome-packet.md\` — what buyers see after purchase
- \`revenue-tracker.csv\` — Google-Sheets-ready
`;

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'cold-emails'), { recursive: true });

  fs.writeFileSync(path.join(OUT, 'installer-prospects.csv'), buildProspectCsv());
  fs.writeFileSync(path.join(OUT, 'cold-emails', '01-email-a-cold.md'), EMAIL_VARIANT_A);
  fs.writeFileSync(path.join(OUT, 'cold-emails', '02-email-b-named.md'), EMAIL_VARIANT_B);
  fs.writeFileSync(path.join(OUT, 'cold-emails', '03-email-c-itc-urgency.md'), EMAIL_VARIANT_C);
  fs.writeFileSync(path.join(OUT, 'cold-emails', '04-email-d-anti-shared.md'), EMAIL_VARIANT_D);
  fs.writeFileSync(path.join(OUT, 'cold-emails', '05-email-e-followup.md'), EMAIL_VARIANT_E_FOLLOWUP);
  fs.writeFileSync(path.join(OUT, 'stripe-payment-links.md'), STRIPE_SETUP);
  fs.writeFileSync(path.join(OUT, 'gumroad-setup.md'), GUMROAD_SETUP);
  fs.writeFileSync(path.join(OUT, 'gumroad-product-description.md'), GUMROAD_DESCRIPTION);
  fs.writeFileSync(path.join(OUT, 'welcome-packet.md'), WELCOME_PACKET);
  fs.writeFileSync(path.join(OUT, 'revenue-tracker.csv'), REVENUE_TRACKER);
  fs.writeFileSync(path.join(OUT, 'README.md'), README);

  console.log('✓ Revenue Sprint Kit built →', path.relative(process.cwd(), OUT));
  console.log('');
  console.log('Files:');
  for (const f of fs.readdirSync(OUT).sort()) {
    const stat = fs.statSync(path.join(OUT, f));
    if (stat.isDirectory()) {
      console.log(`  ${f}/`);
      for (const sub of fs.readdirSync(path.join(OUT, f)).sort()) {
        console.log(`    ${sub}`);
      }
    } else {
      const sz = (stat.size / 1024).toFixed(1) + ' KB';
      console.log(`  ${f.padEnd(40)} ${sz.padStart(8)}`);
    }
  }
  console.log('');
  console.log(`✓ ${PROSPECTS.length} prospects · 5 email variants · Stripe + Gumroad setup · welcome packet`);
}

main();
