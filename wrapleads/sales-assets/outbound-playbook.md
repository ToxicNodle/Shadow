# HelioScout Outbound Playbook

How we turn 20,206 commercial solar leads into revenue.

---

## TL;DR

**Goal:** Sell 50 territory packs at $1,497 in 90 days = $74,850.

**Tactic:** Cold email US commercial solar installers (NAICS 238210), offer free 50-lead sample, convert to State Pack ($1,497) or National Pack ($4,997).

**Math:**
- 5,000 commercial solar installers in the US
- 30% cold-email open rate (B2B niche, high signal)
- 5% reply rate
- 25% sample-to-purchase conversion
- = ~19 sales per 1,000 emails sent

To hit 50 sales in 90 days: send ~2,700 emails total = 30/day.

---

## Step 1 — Build the installer prospect list

Sources (free):

1. **SBA dynamic small business search** — `https://web.sba.gov/pro-net/search/dsp_dsbs.cfm`
   Filter NAICS = 238210 (Electrical Contractors). ~5,000 results.

2. **State solar industry associations** — most publish member directories
   - California Solar & Storage Association (CALSSA)
   - Solar Energy Industries Association (SEIA) member list
   - Texas Solar Energy Society
   - Florida Solar Energy Industries Association

3. **SEIA national database** — `seia.org/membership/member-directory`

4. **EnergySage installer directory** — `energysage.com/local-installers/`

5. **NABCEP-certified installer list** — `nabcep.org/find-an-installer`

6. **NREL Open PV Project** — installer name appears in every installed system
   `openpv.nrel.gov`

For each prospect we want: company name, contact email, state, # employees, commercial vs residential focus (commercial-only installers are 100% in our ICP).

**Apollo / Clearbit** can enrich the SBA list with email addresses at ~$0.10/contact.

---

## What's new in the pack (Phase A — May 2026)

Every CSV row now includes:

1. **Provenance URL** — direct link to the EPA, USAspending.gov, or OSM source record. Anti-fraud signal no competitor can fake.
2. **3 persona-specific sales scripts** — `script_cfo`, `script_facilities`, `script_sustainability`. No more guessing who you're talking to.
3. **ITC deadline urgency** — only 34 days until the July 4, 2026 construction-start deadline. Every touchpoint now carries this time pressure.
4. **Exclusive guarantee** — 1 buyer per territory. 30-day refund if the data is stale.

Use these in the emails below — the ITC deadline is the #1 urgency lever right now.

---

## Step 2 — Cold email sequence (3 touches over 8 days)

### Email 1 — Day 0 (cold open)

Subject: `34 days until ITC deadline — {{state_count}} commercial solar leads in {{state}}`

> Hi {{first_name}},
>
> Quick context: the 30% ITC construction-start deadline is July 4, 2026. That's 34 days. Every property owner who hasn't started construction by then risks losing the full credit.
>
> We pulled 20,206 commercial properties from EPA's GHG Reporter, USAspending.gov, and OpenStreetMap — every one pre-qualified as a high-energy solar candidate. {{state}} has {{state_count}}.
>
> Each lead comes with: NAICS fit score (0-100), system-size estimate, 25-yr NPV, net payback after ITC + state stack, three persona-specific sales scripts (CFO / Facilities / Sustainability), and a provenance URL linking to the original government source record.
>
> I'll send you 50 free — no demo, no card. If they work, the full {{state}} pack is $1,497 one-time. Exclusive: 1 buyer per territory.
>
> Reply "YES {{state}}" and I'll send within the hour.
>
> — Barry Benson @ HelioScout
> helioscout.io/buy-solar-leads

**Personalization vars to swap:** `{{first_name}}` (Apollo lookup), `{{state}}` (from prospect list), `{{state_count}}` (lookup against our state-pack sizes — TX 3009, OH 992, etc.).

---

### Email 2 — Day 3 (data drop)

Subject: `re: 50 commercial solar leads in {{state}}`

> {{first_name}} —
>
> Following up on the 50-lead sample. To save you the reply, here it is:
> {{sample_download_link}}
>
> Each row in there has:
>   • Company name + city + NAICS code
>   • Solar fit score (0-100, NAICS-weighted)
>   • Estimated system kW + year-1 kWh + savings @ state rate
>   • Net payback after ITC + state-stack incentives
>   • 25-yr NPV (median)
>   • Industry-specific cold-open sales script
>
> If even 1 of these 50 closes for you, the math on a $1,497 state pack works.
>
> No need to reply unless you want the full pack.

---

### Email 3 — Day 8 (last touch)

Subject: `last note re: solar leads`

> Hi {{first_name}} — last touch.
>
> If commercial solar lead-gen isn't on your plate this quarter, no worries — I'll stop. If it IS and you want the full {{state}} pack (all {{state_count}} leads with full enrichment) for $1,497, just reply YES and I'll send the Stripe link.
>
> Either way, thanks for reading.
>
> — Barry Benson

---

## Step 3 — Conversion → fulfillment

When prospect replies "YES" or hits the sales-page form:

1. **Free sample** — auto-delivered via `POST /solar/store/sample` (already wired). CSV at `/solar/store/sample.csv` as a backup.

2. **Paid pack** — for now, manual:
   - Reply with Stripe payment-link URL (created in Stripe dashboard, no code needed)
   - Common link prefab: `https://buy.stripe.com/<id>` for each price
   - Once paid → email them the state's CSV from `sales-assets/territory-packs/helioscout-{STATE}-{N}leads.csv`

3. **Future automation** — wire `POST /solar/store/checkout/:pack` that creates Stripe Checkout sessions + webhook that auto-attaches the CSV on payment success. Defer until we close 5+ manual sales (validation first).

---

## Step 4 — Pricing rationale

| Tier | Price | Cost basis | Margin |
|---|---|---|---|
| Sample (50 leads) | Free | $0 (already generated) | n/a (lead magnet) |
| Single Metro Pack | $497 | $0 marginal | ~99% |
| State Pack | $1,497 | $0 marginal + Apollo enrichment if buyer requests (~$50) | ~95% |
| National Pack | $4,997 | $0 marginal | ~99% |
| HelioScout Pro (subscription) | $499/mo | Infra + AI tokens (~$30/mo per user) | ~94% |

**Anchors used:**
- ZoomInfo: $15k/yr/seat for B2B contact data — we're an order of magnitude cheaper
- Apollo.io Pro: $99/mo — but they don't pre-qualify for solar fit
- BuiltWith: $2,300/yr for technographic lead data — adjacent comp
- Lead411: $99/mo — comparable to our subscription tier

We're positioned mid-market: cheaper than ZoomInfo, more specialized than Apollo, comparable to Lead411 but with solar-specific enrichment.

---

## Step 5 — Objection handling

**"I already have a CRM full of leads."**
→ "Right — these aren't replacement leads, they're EPA-verified commercial accounts ranked by solar fit. Even one closed deal from the pack pays for it 100x."

**"I do residential, not commercial."**
→ "Then this isn't for you yet — but we're working on a residential pack sourced from county property records + utility-rate data. Want me to ping you when it ships?"

**"$1,497 is steep."**
→ "Compared to what? A single commercial solar deal grosses $30k-$150k for the installer. If 1 of 500 leads closes — your conversion rate is 0.2% — you've made 20x your money back."

**"Why aren't there phone numbers?"**
→ "Two reasons: (1) Most installers already have an Apollo or ZoomInfo seat that does great contact enrichment — adding our $X to their stack vs charging $20K for a one-stop solution is the wrong trade. (2) Our value is the qualification layer — fit scores + ROI math + sales scripts. We tell you which 500 doors to knock on, not how to find the doorbell."

**"How fresh is the data?"**
→ "EPA GHGRP refreshes annually (last pull: latest available reporting year). USAspending is daily. OSM is community-updated. Buyers get 30-day re-pulls included for state packs, quarterly for national."

---

## Step 6 — Tracking

A spreadsheet is fine for first 50 sales.

Columns:
`date_emailed | company | contact | state | replied? | requested_sample? | converted_to_pack? | revenue | notes`

After 50 sales, we wire it into HubSpot or just `outreach_audit_log` rows in our own DB.

---

## Targets

| Period | Sales | Revenue | Note |
|---|---|---|---|
| Month 1 | 10 | $14,970 | Validate the pitch, refine email subject lines |
| Month 2 | 20 | $29,940 | Double down on best-performing variant |
| Month 3 | 50 (cumulative) | $74,850 | Switch to automated checkout |

After hitting $75K in lead-pack revenue, reinvest:
- ~$10K Apollo / Clearbit seats (better installer prospect data)
- ~$5K paid ads (Google Search "commercial solar leads" + LinkedIn)
- ~$5K Stripe + e-sign automation (eliminate manual delivery)
- Remainder → engineering velocity (next vertical, residential pack)
