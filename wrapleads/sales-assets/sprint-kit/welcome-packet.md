# Welcome Packet (auto-send on Stripe webhook OR paste manually)

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
| **script_cfo** | Tailored opener for CFO / finance decision-makers |
| **script_facilities** | Tailored opener for facilities / operations managers |
| **script_sustainability** | Tailored opener for sustainability / ESG directors |
| **provenance_url** | Direct link to the original EPA / USAspending / OSM source record |
| **pitch_angle** | Source attribution + data-provenance note |

## Suggested workflow

1. **Sort by solar_fit_score DESC** in your spreadsheet tool. Work the top 100 first.
2. **Enrich contact info** via Apollo / Hunter / Clearbit — companies are real, contacts need finding (we deliberately don't bundle scraped contact info).
3. **Match the right script to the right persona:**
   - Emailing a CFO/VP Finance? Use `script_cfo` — leads with ROI + tax benefits.
   - Emailing a Facilities Director? Use `script_facilities` — leads with operational zero-disruption angle.
   - Emailing a Sustainability Director? Use `script_sustainability` — leads with ESG/emissions reduction.
4. **Click the provenance_url** to verify any lead yourself — links to the EPA facility record, USAspending award, or OSM building.
5. **For tax-exempt entities** (schools, churches, gov't, non-profits) — pitch a PPA, not a direct purchase. The CSV flags these in the `tax_appetite` column.
6. **Lead with ITC urgency** — the 30% construction-start deadline is July 4, 2026. Only 34 days left. Every pitch should mention this.

## Trust

Every lead in this pack traces back to a public US gov data source. The `provenance_url` column links directly to the original record — EPA GHGRP facility detail, USAspending.gov award page, or OpenStreetMap building. Click any one to verify.

**This pack is exclusive to you.** We sell each state territory to 1 buyer only. No shared leads, no 5 competitors calling the same prospect.

## 30-day refund

If you don't get at least one qualified conversation from this pack within 30 days, reply to this email with a sample of your outreach (5 sends + response notes) and we'll refund. No friction.

## What's next

If this pack lands, the National Pack (all 20,206 facilities) is \$4,997 — pre-purchase discount of \$500 in the first 14 days. Just reply.

— Barry Benson
HelioScout · Commercial Solar Intelligence
