/**
 * Ultra-qualify a raw lead in one pass.
 *
 * Takes a sparse input (a domain, an address, a lat/lng, or all three) and
 * runs the full intelligence stack in parallel:
 *
 *    1. Firmographic enrichment   (Clearbit / Apollo)  → NAICS, employees, revenue
 *    2. Google Solar API          (when configured)    → real roof segments + production
 *    3. PVWatts fallback math     (always)             → kW + kWh + savings
 *    4. NREL Utility Rates        (when configured)    → utility + commercial $/kWh
 *    5. Incentive stacking        (always)             → ITC + MACRS + state + SREC + municipal
 *    6. NAICS Fit profile         (always)             → load profile, tax appetite, ownership model, ESG pressure
 *    7. Tariff intelligence       (always)             → net-metering rules, deadline-driven urgency
 *
 * Returns a single "Ultra-Qualified Lead Alert" object that the AI prompt,
 * the discover view, and the sales-team-alerting webhook all consume.
 */

'use strict';

const solarMath = require('./solar-math');
const incentives = require('./solar-incentives');
const naicsFit = require('./naics-solar-fit');
const tariffs = require('./solar-tariffs');
const googleSolar = require('./google-solar-api');
const enrichFirmo = require('./enrich-firmographic');
const dsire = require('./dsire-api');
const { lookupRate } = require('./scrapers/utility-rate');

/**
 * @param {Object} input
 * @param {string} [input.domain]
 * @param {string} [input.company]
 * @param {string} [input.street]
 * @param {string} [input.city]
 * @param {string} [input.state]
 * @param {string} [input.zip]
 * @param {number} [input.latitude]
 * @param {number} [input.longitude]
 * @param {number} [input.building_sqft]   override
 * @param {string} [input.roof_type]       override
 * @returns {Object} fully-qualified lead alert
 */
async function qualify(input = {}) {
  const startedAt = Date.now();

  // ── 1. Firmographic enrichment ──────────────────────────────────────
  const firmo = input.domain ? await enrichFirmo.enrichByDomain(input.domain).catch(() => null) : null;
  const naicsCode = input.naics_code || firmo?.naics_code || null;

  // ── 2 & 3. Google Solar API (best-case) or PVWatts fallback math ───
  const lat = input.latitude || firmo?.location?.latitude || null;
  const lng = input.longitude || firmo?.location?.longitude || null;
  const buildingSqft = input.building_sqft || null;
  const roofType = input.roof_type || 'unknown';
  let googleInsights = null;
  let econ = null;

  // ── 4. Utility rate ────────────────────────────────────────────────
  let utilityInfo = { utility: null, commercial_rate: solarMath.DEFAULT_RATE };
  if (lat && lng) {
    utilityInfo = await lookupRate(lat, lng).catch(() => utilityInfo);
  }
  const ratePerKwh = utilityInfo.commercial_rate;

  if (googleSolar.isConfigured() && lat && lng) {
    googleInsights = await googleSolar.findClosestBuilding({ latitude: lat, longitude: lng }).catch(() => null);
    if (googleInsights) econ = googleSolar.toEstimate(googleInsights, { ratePerKwh });
  }
  if (!econ) {
    econ = solarMath.fullEstimate({
      buildingSqft, roofType, latitude: lat, utilityRate: ratePerKwh, estAnnualKwh: null,
    });
    econ.source = 'pvwatts_fallback';
  }

  // ── 5. Incentive stack + 7. Tariff intel ───────────────────────────
  const tariff = tariffs.lookup(utilityInfo.utility);
  // Live DSIRE lookup gives us real expiration-date urgency from federal
  // and state programs. Returns a single sentence usable in the AI prompt.
  const dsirePrograms = input.state ? await dsire.programsForLead({
    state: input.state,
    taxAppetite: naicsFit.profileFor({ naics_code: naicsCode, industry: firmo?.industry || input.industry })?.tax_appetite,
  }) : { financial: [], regulatory: [] };
  const dsireUrgency = dsire.urgencyFromDsire(dsirePrograms);
  const intel = incentives.buildPropertyIntel({
    state: input.state,
    city:  input.city,
    zip:   input.zip,
    systemKw: econ.system_kw,
    annualKwh: econ.annual_kwh,
    grossCost: econ.gross_cost_usd,
    tariff,
    bonuses: { energy_community: false, domestic_content: false, low_income: false },
    dsireUrgency,
  });
  const netPayback = incentives.netPaybackYears(intel.stack.net_cost, econ.annual_savings_usd);

  // ── 6. NAICS Fit ───────────────────────────────────────────────────
  const fit = naicsFit.profileFor({ naics_code: naicsCode, industry: firmo?.industry || input.industry });

  // ── Composite qualification gate ───────────────────────────────────
  const gates = {
    has_naics_fit:       Boolean(fit && fit.fit >= 70),
    has_real_geometry:   Boolean(econ.system_kw >= 25),
    // Guard against the vacuous case where gross_cost = 0 (no system size)
    // making 0 >= 0 * 0.35 trivially true. The gate must reflect a real
    // dollar comparison.
    incentive_coverage:  econ.gross_cost_usd > 0 &&
                          intel.stack.total_incentives >= econ.gross_cost_usd * 0.35,
    payback_under_10y:   netPayback !== null && netPayback > 0 && netPayback <= 10,
    has_contactable:     Boolean(firmo?.company_name) || Boolean(input.company),
  };
  const score = Object.values(gates).filter(Boolean).length;
  const status = score >= 4 ? 'Ultra-Qualified'
               : score === 3 ? 'Qualified'
               : score === 2 ? 'Marginal'
               : 'Disqualified';

  // ── Lead-alert message (ready for sales rep handoff) ───────────────
  const companyName = firmo?.company_name || input.company || (input.domain || 'Unknown Company');
  const alert = formatLeadAlert({ companyName, naicsCode, fit, econ, intel, tariff, netPayback, status, gates });

  return {
    qualified_at:        new Date().toISOString(),
    duration_ms:         Date.now() - startedAt,
    status,
    score,
    gates,
    company_name:        companyName,
    domain:              input.domain || null,
    naics_code:          naicsCode,
    naics_fit:           fit,
    location: { city: input.city, state: input.state, zip: input.zip, latitude: lat, longitude: lng },
    economics:           econ,
    google_solar:        googleInsights ? {
                           panel_count: googleInsights.best_panel_count,
                           panels_capacity_watts: googleInsights.panel_capacity_watts,
                           roof_segments: googleInsights.roof_segment_stats?.length || 0,
                           imagery_date: googleInsights.imagery_date,
                           sunshine_hours_per_year: googleInsights.max_sunshine_hours_per_year,
                         } : null,
    utility:             { name: utilityInfo.utility, rate_per_kwh: ratePerKwh, source: utilityInfo.source },
    tariff,
    incentive_stack:     intel.stack,
    net_payback_years:   netPayback,
    urgency:             intel.urgency,
    dsire_programs:      dsirePrograms.financial?.slice(0, 5).map(p => ({ name: p.name, end_date: p.end_date, administrator: p.administrator })) || [],
    firmographic:        firmo ? { provider: firmo.provider, employees: firmo.employees, annual_revenue: firmo.annual_revenue } : null,
    lead_alert:          alert,
  };
}

function formatLeadAlert({ companyName, naicsCode, fit, econ, intel, tariff, netPayback, status }) {
  const fmtMoney = (n) => `$${Math.round(n).toLocaleString()}`;
  const fmtKwh   = (n) => `${Math.round(n).toLocaleString()} kWh`;
  const naicsLabel = naicsCode ? `NAICS ${naicsCode}` : 'NAICS unknown';
  const fitLabel = fit ? ` — ${fit.code} (${fit.energy_intensity} energy intensity)` : '';
  const urgency = intel.urgency || '';
  const ownership = fit?.ownership_model_explainer || '';
  const rate = tariff?.retail_rate_commercial ? `$${tariff.retail_rate_commercial.toFixed(2)}/kWh` : 'utility rate TBD';

  return [
    `🚨 Lead Alert: ${companyName} (${naicsLabel}${fitLabel})`,
    `Roof space fits a ${econ.system_kw}kW system producing ~${fmtKwh(econ.annual_kwh)}/year.`,
    `Local utility commercial rate ≈ ${rate}. Estimated annual savings: ${fmtMoney(econ.annual_savings_usd)}.`,
    `Gross install: ${fmtMoney(econ.gross_cost_usd)} → Net after incentive stack (${intel.stack.effective_subsidy_pct}%): ${fmtMoney(intel.stack.net_cost)}.`,
    netPayback !== null ? `Projected ${netPayback}-year net payback.` : '',
    ownership ? `Recommended ownership: ${ownership}` : '',
    urgency ? `Urgency: ${urgency}` : '',
    `Status: ${status}.`,
  ].filter(Boolean).join('\n');
}

module.exports = { qualify };
