/**
 * Solar production + economics math.
 *
 * Lightweight PVWatts-style model so every commercial-solar lead can be
 * scored with a real kW system size, annual kWh production, and dollar
 * savings — no external API call required. When NREL PVWatts is available
 * (via NREL_API_KEY) we can swap `estimateProduction` for the upstream call,
 * but the in-process model is good enough for ranking + pitch personalization.
 *
 * Inputs are intentionally forgiving: any missing field falls back to a
 * conservative default so the function never returns null. The math is
 * NOT engineering-grade — it's "good enough for the first sales touch."
 */

'use strict';

// US-average commercial rate when we have no utility data ($/kWh).
const DEFAULT_RATE = 0.13;

// Watts per sqft of usable rooftop area, assuming modern bifacial commercial
// panels (~21% efficiency) and a typical 50–60% usable-area factor on a flat
// roof (setbacks, HVAC, racking pitch). Real-world commercial installs
// generally land between 10–15 W/sqft of gross building footprint.
const W_PER_SQFT = 12;

// Solar insolation by US latitude band (kWh/m²/day annual average). Used to
// scale annual production by location. Pulled from NREL TMY3 normals — close
// enough for first-touch ROI math.
const INSOLATION_BY_LAT = [
  { lat: 25, kwh_m2_day: 5.6 }, // South FL / South TX / Phoenix
  { lat: 30, kwh_m2_day: 5.4 }, // Houston / Jacksonville / Tucson
  { lat: 35, kwh_m2_day: 5.1 }, // Atlanta / Albuquerque / Charlotte
  { lat: 40, kwh_m2_day: 4.6 }, // Denver / Indianapolis / Philadelphia
  { lat: 45, kwh_m2_day: 4.1 }, // Portland OR / Minneapolis / Bangor
  { lat: 50, kwh_m2_day: 3.5 }, // Seattle / Alaska panhandle
];

function insolationFor(lat) {
  if (lat === null || lat === undefined) return 4.8; // US median
  const abs = Math.abs(lat);
  let prev = INSOLATION_BY_LAT[0];
  for (const band of INSOLATION_BY_LAT) {
    if (abs <= band.lat) {
      // Linear interpolation between bands for a smooth gradient.
      if (band === prev) return band.kwh_m2_day;
      const span = band.lat - prev.lat;
      const t = (abs - prev.lat) / span;
      return prev.kwh_m2_day + (band.kwh_m2_day - prev.kwh_m2_day) * t;
    }
    prev = band;
  }
  return 3.5;
}

// Roof-type derate — flat / membrane / metal handle full-spec rooftop systems;
// shingle introduces structural and racking penalties.
const ROOF_DERATE = {
  flat:     1.00,
  membrane: 1.00,
  metal:    0.95,
  shingle:  0.75,
  unknown:  0.85,
};

/**
 * Estimate system size in DC kW from rooftop footprint.
 * @param {number} buildingSqft total building footprint
 * @param {string} roofType     'flat' | 'membrane' | 'metal' | 'shingle' | 'unknown'
 * @returns {number} kW DC
 */
function estimateSystemKw(buildingSqft, roofType) {
  if (!buildingSqft || buildingSqft < 1000) return 0;
  const derate = ROOF_DERATE[roofType] ?? ROOF_DERATE.unknown;
  // Cap at 2 MW per single roof — beyond that we'd need ground-mount land or
  // a second array, which deserves a different conversation.
  return Math.min(2000, Math.round((buildingSqft * W_PER_SQFT / 1000) * derate));
}

/**
 * Estimate annual production in kWh.
 *   kWh = systemKw × insolation(kWh/m²/day) × 365 × overall system derate
 */
function estimateProduction(systemKw, lat) {
  if (!systemKw) return 0;
  const sun = insolationFor(lat);
  // PVWatts overall system derate ~0.86 covers inverter losses, soiling,
  // mismatch, wiring, etc.
  const overall = 0.86;
  return Math.round(systemKw * sun * 365 * overall);
}

/**
 * Estimate annual dollar savings from offsetting consumption at the given
 * commercial rate. Caps at 110% of estimated annual consumption so we don't
 * over-promise on small-load buildings.
 */
function estimateSavings({ annualKwhProduced, annualKwhConsumed = null, ratePerKwh = DEFAULT_RATE }) {
  if (!annualKwhProduced) return 0;
  const cap = annualKwhConsumed ? annualKwhConsumed * 1.1 : Infinity;
  const offset = Math.min(annualKwhProduced, cap);
  return Math.round(offset * ratePerKwh);
}

// Rough installed-cost benchmarks — $/W DC for commercial flat-roof in 2024-25.
// Used to estimate gross system cost so the broker has a meaningful $ figure
// to anchor the pitch even before they've quoted with their installer network.
function estimateSystemCost(systemKw) {
  if (!systemKw) return 0;
  let pricePerWatt = 2.40; // mid-size commercial mean
  if (systemKw < 50)   pricePerWatt = 3.10;
  else if (systemKw < 200)  pricePerWatt = 2.60;
  else if (systemKw < 1000) pricePerWatt = 2.10;
  else                      pricePerWatt = 1.90;
  return Math.round(systemKw * 1000 * pricePerWatt);
}

/**
 * Convenience: produce a fully-populated proposal-shape object for a lead.
 * Safe to call with sparse input — every missing piece falls back to a
 * conservative default.
 */
function fullEstimate({ buildingSqft, roofType, latitude, utilityRate, estAnnualKwh }) {
  const systemKw       = estimateSystemKw(buildingSqft, roofType);
  const annualKwh      = estimateProduction(systemKw, latitude);
  const savingsPerYear = estimateSavings({
    annualKwhProduced: annualKwh,
    annualKwhConsumed: estAnnualKwh,
    ratePerKwh: utilityRate || DEFAULT_RATE,
  });
  const grossCost      = estimateSystemCost(systemKw);
  const paybackYears   = savingsPerYear > 0 ? +(grossCost / savingsPerYear).toFixed(1) : null;

  return {
    system_kw:           systemKw,
    annual_kwh:          annualKwh,
    annual_savings_usd:  savingsPerYear,
    gross_cost_usd:      grossCost,
    payback_years_gross: paybackYears, // before tax incentives
    insolation:          insolationFor(latitude),
    rate_per_kwh:        utilityRate || DEFAULT_RATE,
  };
}

module.exports = {
  estimateSystemKw,
  estimateProduction,
  estimateSavings,
  estimateSystemCost,
  fullEstimate,
  insolationFor,
  DEFAULT_RATE,
};
