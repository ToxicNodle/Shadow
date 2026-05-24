/**
 * Utility tariff + net-metering intelligence.
 *
 * Maps utility-company names to their current net-metering structure: do
 * they pay back excess generation at retail, wholesale, or a fixed feed-in
 * tariff? Are they running NEM 1/2/3? What's the rate-class differentiation
 * for commercial vs industrial?
 *
 * This feeds the AI email generator so we can write things like
 *   "PG&E NEM 3.0 caps export credits at avoided-cost (~$0.05/kWh) —
 *    pair the PV with storage to capture full retail rate during peak."
 * instead of a generic "you'll save on your electric bill" line.
 *
 * Values reflect mid-2024 published tariffs. Real net-metering rules change
 * frequently — re-verify before quoting.
 */

'use strict';

// Utility name patterns (lowercase, regex-friendly) mapped to tariff profiles.
// Match by includes() against the lowercased utility name we get from the
// NREL Utility Rates API.
const UTILITIES = [
  {
    match: /pacific gas|pg&e|pge/i,
    name: 'Pacific Gas & Electric (PG&E)',
    state: 'CA',
    nem_version: 'NEM 3.0',
    export_basis: 'avoided_cost',
    avg_export_credit_per_kwh: 0.055,
    retail_rate_commercial: 0.32,
    notes: 'Heavy export-credit haircut under NEM 3.0 — battery storage is essential for ROI.',
    storage_recommended: true,
    deadline_message: 'Lock in interconnection queue position before fall 2026 NEM 3.0 revisions.',
  },
  {
    match: /southern california edison|sce(?:[^\w]|$)/i,
    name: 'Southern California Edison (SCE)',
    state: 'CA',
    nem_version: 'NEM 3.0',
    export_basis: 'avoided_cost',
    avg_export_credit_per_kwh: 0.058,
    retail_rate_commercial: 0.28,
    notes: 'NEM 3.0 export rates below $0.06/kWh — storage attach rates above 90% for ROI-positive commercial deals.',
    storage_recommended: true,
  },
  {
    match: /san diego gas|sdge|sdg&e/i,
    name: 'San Diego Gas & Electric (SDG&E)',
    state: 'CA',
    nem_version: 'NEM 3.0',
    export_basis: 'avoided_cost',
    avg_export_credit_per_kwh: 0.052,
    retail_rate_commercial: 0.36,
    notes: 'Highest commercial retail rates in CA — solar+storage payback is excellent despite NEM 3.0.',
    storage_recommended: true,
  },
  {
    match: /arizona public service|aps(?:[^\w]|$)/i,
    name: 'Arizona Public Service (APS)',
    state: 'AZ',
    nem_version: 'EPR (export rate)',
    export_basis: 'avoided_cost',
    avg_export_credit_per_kwh: 0.075,
    retail_rate_commercial: 0.13,
    notes: 'TOU-with-demand-charges rate is the commercial sweet spot. Self-consumption beats export.',
  },
  {
    match: /srp|salt river project/i,
    name: 'Salt River Project (SRP)',
    state: 'AZ',
    nem_version: 'No retail NEM (E-27 export rate)',
    export_basis: 'feed_in',
    avg_export_credit_per_kwh: 0.029,
    retail_rate_commercial: 0.12,
    notes: 'SRP buys back at wholesale only — self-consumption + demand charge reduction is the ROI play.',
    storage_recommended: true,
  },
  {
    match: /florida power|fpl/i,
    name: 'Florida Power & Light (FPL)',
    state: 'FL',
    nem_version: 'NEM 1:1 (capped at 90% of consumption)',
    export_basis: 'retail',
    avg_export_credit_per_kwh: 0.12,
    retail_rate_commercial: 0.12,
    notes: 'Full retail net-metering — favorable for solar without storage.',
    deadline_message: 'NEM 1:1 cap is under review — file interconnection before legislative changes hit.',
  },
  {
    match: /duke energy/i,
    name: 'Duke Energy',
    state: 'NC|FL|IN|OH|KY|SC',
    nem_version: 'NEM 2.0 (reduced export credit)',
    export_basis: 'avoided_cost_blended',
    avg_export_credit_per_kwh: 0.07,
    retail_rate_commercial: 0.11,
    notes: 'NC HB 951 mandate increasing utility solar procurement — favorable PPA market.',
  },
  {
    match: /xcel energy/i,
    name: 'Xcel Energy',
    state: 'CO|MN|WI|NM|ND|SD|MI|TX',
    nem_version: 'Solar*Rewards production-based',
    export_basis: 'mixed',
    avg_export_credit_per_kwh: 0.085,
    retail_rate_commercial: 0.11,
    notes: 'Solar*Rewards production incentive available for commercial — confirm capacity block.',
  },
  {
    match: /con ?ed|consolidated edison/i,
    name: 'Con Edison',
    state: 'NY',
    nem_version: 'NY VDER (Value of Distributed Energy Resources)',
    export_basis: 'vder_stack',
    avg_export_credit_per_kwh: 0.13,
    retail_rate_commercial: 0.21,
    notes: 'VDER stack pays better than legacy net-metering for commercial. Combine with NY-Sun MW Block.',
  },
  {
    match: /pseg|public service enterprise/i,
    name: 'PSEG (NJ + Long Island)',
    state: 'NJ|NY',
    nem_version: 'NJ TREC / NY-Sun',
    export_basis: 'tariff_plus_rec',
    avg_export_credit_per_kwh: 0.165,
    retail_rate_commercial: 0.17,
    notes: 'NJ TREC pays for 15 years on top of net metering. NY-Sun MW Block in PSEG-LI.',
  },
  {
    match: /com ?ed|commonwealth edison/i,
    name: 'Commonwealth Edison (ComEd)',
    state: 'IL',
    nem_version: 'NEM + Illinois Shines REC',
    export_basis: 'retail_plus_rec',
    avg_export_credit_per_kwh: 0.155,
    retail_rate_commercial: 0.105,
    notes: 'Illinois Shines Adjustable Block REC contract layers on top of retail NEM. Block-by-block.',
  },
  {
    match: /eversource/i,
    name: 'Eversource',
    state: 'CT|MA|NH',
    nem_version: 'MA SMART / CT NRES',
    export_basis: 'tariff',
    avg_export_credit_per_kwh: 0.16,
    retail_rate_commercial: 0.22,
    notes: 'MA SMART blocks declining each year — capacity-block urgency real.',
    deadline_message: 'MA SMART capacity blocks fill quickly — secure your spot in the current block.',
  },
  {
    match: /national grid/i,
    name: 'National Grid',
    state: 'MA|NY|RI',
    nem_version: 'NY-Sun / MA SMART',
    export_basis: 'tariff',
    avg_export_credit_per_kwh: 0.155,
    retail_rate_commercial: 0.21,
    notes: 'Multi-state mix; MA SMART for MA territory, NY-Sun MW Block for NY.',
  },
  {
    match: /entergy/i,
    name: 'Entergy',
    state: 'AR|LA|MS|TX',
    nem_version: 'NEM (with caps)',
    export_basis: 'retail',
    avg_export_credit_per_kwh: 0.09,
    retail_rate_commercial: 0.09,
    notes: 'Low retail rate but full NEM. ROI depends on demand-charge structure.',
  },
];

const FALLBACK = {
  name: null,
  nem_version: 'unknown',
  export_basis: 'unknown',
  avg_export_credit_per_kwh: 0.08,
  retail_rate_commercial: 0.13,
  notes: 'No tariff data on file — quote should be confirmed with the utility before contract.',
  storage_recommended: false,
};

function lookup(utilityName) {
  if (!utilityName) return { ...FALLBACK };
  for (const u of UTILITIES) {
    if (u.match.test(utilityName)) return u;
  }
  return { ...FALLBACK, name: utilityName };
}

module.exports = { lookup, UTILITIES, FALLBACK };
