/**
 * Tax-incentive stacking calculator for commercial solar.
 *
 * Stacks the federal ITC, accelerated depreciation (MACRS), IRA bonus
 * adders (energy-community, domestic-content, low-income), state-level
 * programs (NY-Sun, NJ TREC, IL SREC, MD SREC, etc.), and rural USDA REAP
 * grants where applicable. Returns the resulting net cost + payback so the
 * AI opener can quote a specific dollar number instead of a vague pitch.
 *
 * Values reflect 2024-25 federal policy and the most common state programs
 * — the math is correct in shape; rates should be re-checked annually.
 */

'use strict';

// Federal Investment Tax Credit — Section 48 commercial solar.
const ITC_BASE_RATE = 0.30; // 30% for projects starting construction through 2032

// IRA bonus adders — additive to ITC base.
const IRA_BONUSES = {
  energy_community: 0.10,  // brownfields, fossil-fuel communities, statistical areas with above-average coal/oil employment loss
  domestic_content: 0.10,  // ≥40% domestic steel/iron + manufactured product threshold
  low_income:       0.10,  // category 1, residential 5MW or below, low-income community
};

// State-level lookup keyed by USPS code. Each entry returns an estimated
// per-kW or per-kWh incentive on top of federal. Numbers are deliberately
// conservative midpoints — real values vary by utility, year, and queue.
const STATE_PROGRAMS = {
  NY: { name: 'NY-Sun MW Block (Commercial)',          per_kw: 230,  notes: 'Block declines as capacity fills — check current block.' },
  NJ: { name: 'NJ TREC (SuSI Successor)',              per_kwh_year: 0.085, term_years: 15, notes: 'Per kWh over 15 years; ~$0.05–0.12 depending on project class.' },
  MA: { name: 'MA SMART',                              per_kwh_year: 0.075, term_years: 10, notes: 'Tariff-based; capacity blocks declining.' },
  IL: { name: 'Illinois Shines (Adjustable Block)',    per_kwh_year: 0.055, term_years: 15, notes: 'REC contracts for distributed generation.' },
  MD: { name: 'Maryland SREC II',                      per_kwh_year: 0.045, term_years: 15, notes: 'SREC trading market.' },
  CA: { name: 'NEM 3.0 / SGIP storage adder',          per_kw: 0,    notes: 'Reduced export rates — pair with SGIP storage incentive for ROI.' },
  AZ: { name: 'APS / SRP commercial rate optimization', per_kw: 0,   notes: 'No state incentive; focus on TOU rate arbitrage.' },
  TX: { name: 'TX no state income tax + ERCOT exposure', per_kw: 0,  notes: 'Federal-only stack; CenterPoint/AEP rebates locally.' },
  FL: { name: 'FL Property Tax Exclusion + Net Metering', per_kw: 0, notes: 'No state incentive; favorable net metering (1:1 retail).' },
  CT: { name: 'CT NRES (Non-Residential Renewable Energy Solutions)', per_kwh_year: 0.115, term_years: 20, notes: 'Buy-all-sell-all tariff.' },
  CO: { name: 'Xcel Solar*Rewards Commercial',         per_kw: 100,  notes: 'Production-based incentive; varies by utility.' },
  OR: { name: 'Energy Trust of Oregon Solar Incentive', per_kw: 230, notes: 'Cap declining each year.' },
};

// USDA REAP — Rural Energy for America Program. Up to 50% grant for eligible
// rural small businesses; we conservatively assume 25% effective grant rate
// for the typical commercial property that qualifies (size + rurality test).
function usdaReapApplies(zip) {
  if (!zip) return false;
  const z = parseInt(String(zip).slice(0, 5), 10);
  if (isNaN(z)) return false;
  // Rough heuristic: most rural ZIP3 ranges in the US. Not authoritative —
  // installers should validate via USDA Eligibility Map before quoting.
  const rural3 = [4, 5, 6, 13, 14, 16, 17, 24, 25, 26, 27, 28, 29, 35, 36, 37, 38, 39, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 62, 63, 64, 65, 66, 67, 68, 69, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 86, 87, 88, 89, 95, 96, 99];
  return rural3.includes(Math.floor(z / 100));
}

/**
 * Calculate the full incentive stack for a project.
 *
 * @param {Object} opts
 * @param {number} opts.grossCost       gross installed cost $
 * @param {number} opts.systemKw        DC kW
 * @param {number} opts.annualKwh       annual production
 * @param {string} opts.state           USPS state code
 * @param {string} opts.zip
 * @param {Object} opts.bonuses         { energy_community, domestic_content, low_income }
 * @returns { stackedRate, federalCredit, stateIncentive, depreciationBenefit,
 *           usdaGrant, netCost, lineItems }
 */
function calculateStack({ grossCost, systemKw, annualKwh, state, zip, bonuses = {} }) {
  const lineItems = [];

  // ── ITC ───────────────────────────────────────────────────────────────
  let itcRate = ITC_BASE_RATE;
  if (bonuses.energy_community) itcRate += IRA_BONUSES.energy_community;
  if (bonuses.domestic_content) itcRate += IRA_BONUSES.domestic_content;
  if (bonuses.low_income)       itcRate += IRA_BONUSES.low_income;
  const federalCredit = Math.round(grossCost * itcRate);
  lineItems.push({
    label: `Federal ITC (Section 48) — ${(itcRate * 100).toFixed(0)}%`,
    amount: federalCredit,
    notes: itcRate > ITC_BASE_RATE ? `Includes IRA bonus adders: ${[
      bonuses.energy_community && 'energy community',
      bonuses.domestic_content && 'domestic content',
      bonuses.low_income && 'low-income',
    ].filter(Boolean).join(', ')}` : null,
  });

  // ── MACRS depreciation ────────────────────────────────────────────────
  // 5-year MACRS on (gross cost - 50% × ITC). Tax-rate assumed at 21%
  // federal corporate (the most common commercial buyer profile).
  const depreciableBasis = grossCost - (federalCredit * 0.5);
  const depreciationBenefit = Math.round(depreciableBasis * 0.21);
  lineItems.push({
    label: 'MACRS 5-yr depreciation @ 21% corp tax',
    amount: depreciationBenefit,
    notes: `Basis reduced by 50% of ITC per IRC §50(c). State depreciation may stack.`,
  });

  // ── State / utility program ──────────────────────────────────────────
  const state_us = (state || '').toUpperCase();
  const program = STATE_PROGRAMS[state_us];
  let stateIncentive = 0;
  let programLabel = null;
  if (program) {
    if (program.per_kw && systemKw) {
      stateIncentive = Math.round(program.per_kw * systemKw);
    } else if (program.per_kwh_year && annualKwh) {
      // NPV of an N-year per-kWh payment stream, discounted at 6%.
      const r = 0.06;
      const annual = program.per_kwh_year * annualKwh;
      const npv = annual * ((1 - Math.pow(1 + r, -program.term_years)) / r);
      stateIncentive = Math.round(npv);
    }
    programLabel = program.name;
    if (stateIncentive > 0) {
      lineItems.push({
        label: programLabel,
        amount: stateIncentive,
        notes: program.notes || null,
      });
    } else if (program.notes) {
      lineItems.push({
        label: programLabel,
        amount: 0,
        notes: program.notes,
      });
    }
  }

  // ── USDA REAP grant (if rural) ───────────────────────────────────────
  let usdaGrant = 0;
  if (usdaReapApplies(zip)) {
    // Conservative 25% — actual awards range 25–50% based on competitive scoring.
    usdaGrant = Math.round(grossCost * 0.25);
    lineItems.push({
      label: 'USDA REAP grant (estimated)',
      amount: usdaGrant,
      notes: 'Rural-eligible ZIP — confirm via USDA REAP Eligibility Map; awards 25–50% of project cost.',
    });
  }

  const totalIncentives = federalCredit + depreciationBenefit + stateIncentive + usdaGrant;
  const netCost = Math.max(0, grossCost - totalIncentives);

  return {
    gross_cost:           grossCost,
    federal_credit:       federalCredit,
    federal_credit_rate:  itcRate,
    depreciation_benefit: depreciationBenefit,
    state_incentive:      stateIncentive,
    state_program:        programLabel,
    usda_grant:           usdaGrant,
    total_incentives:     totalIncentives,
    net_cost:             netCost,
    effective_subsidy_pct: grossCost > 0 ? +(totalIncentives / grossCost * 100).toFixed(1) : 0,
    line_items:           lineItems,
  };
}

/**
 * Compute net payback in years after applying the full incentive stack.
 * Net cost / annual savings.
 */
function netPaybackYears(netCost, annualSavings) {
  if (!annualSavings || annualSavings <= 0) return null;
  return +(netCost / annualSavings).toFixed(1);
}

// ── Deadlines & urgency metadata ─────────────────────────────────────────
// Each entry surfaces a time-sensitive narrative the AI prompt can inject
// into outbound email so every pitch carries a localized "act now" reason.
const DEADLINES = {
  federal: {
    label: 'Federal ITC 30% step-down',
    expires_at: '2032-12-31',
    urgency: 'The 30% federal ITC begins stepping down in 2033 — projects that start construction now lock in the full rate even if installed later.',
  },
  domestic_content: {
    label: 'IRA Domestic Content +10%',
    expires_at: null,
    urgency: 'Domestic-content bonus (+10% ITC) requires steel/iron + manufactured-product thresholds — supply chain commitments take 60-90 days to confirm, so qualifying projects need a head start.',
  },
  energy_community: {
    label: 'IRA Energy Community +10%',
    expires_at: null,
    urgency: 'Your property may sit inside an IRA Energy Community boundary — the +10% ITC adder requires confirmation against the latest Treasury map (updated annually).',
  },
};

// State / utility program block urgencies. These are the "the local block
// fills up" deadlines that drive real procurement urgency.
const PROGRAM_URGENCY = {
  NY: { msg: 'NY-Sun MW Block capacity declines on a rolling basis — each block clearing drops the per-kW incentive by ~10%.' },
  NJ: { msg: 'NJ TREC SuSI commits 15 years of payments — but project class assignments are recalibrated every 6 months.' },
  IL: { msg: 'Illinois Shines REC contracts are awarded in capacity blocks — current block expected to clear within the next 90 days.' },
  MA: { msg: 'MA SMART block declines each capacity tranche — confirm interconnection slot before next block opens.' },
  MD: { msg: 'MD SREC market prices are recalculated quarterly — lock your interconnection ahead of the next adjustment.' },
  CA: { msg: 'CA NEM 3.0 export credits compress payback unless paired with storage — the SGIP storage rebate queue is moving fast.' },
  CO: { msg: 'Xcel Solar*Rewards Commercial program caps annually — limited remaining capacity for 2026.' },
  OR: { msg: 'Energy Trust of Oregon caps decline annually — apply before the next fiscal-year reset.' },
};

// SREC / PBI spot-market values (approximate, mid-2024). Used to add a
// secondary revenue line to the economics estimate.
const SREC_MARKETS = {
  NJ: { price_per_mwh: 80,  market: 'NJ SuSI / TREC (2024 vintage)',     active: true },
  MA: { price_per_mwh: 60,  market: 'MA SREC II (legacy) + SMART',       active: true },
  IL: { price_per_mwh: 50,  market: 'Illinois Shines Adjustable Block',  active: true },
  MD: { price_per_mwh: 45,  market: 'MD SREC II',                        active: true },
  OH: { price_per_mwh: 8,   market: 'OH SREC (depressed)',               active: false },
  PA: { price_per_mwh: 30,  market: 'PA SREC',                           active: true },
  DC: { price_per_mwh: 380, market: 'DC SREC (highest in US)',           active: true },
  VA: { price_per_mwh: 70,  market: 'VA RPS / SREC',                     active: true },
  DE: { price_per_mwh: 35,  market: 'DE SREC',                           active: true },
};

/**
 * Return the SREC/PBI revenue NPV for a given state + annual production.
 * SREC revenue typically lasts 5-15 years; we conservatively use a 10-year
 * stream discounted at 7%.
 */
function srecRevenueNpv(state, annualKwh) {
  const market = SREC_MARKETS[(state || '').toUpperCase()];
  if (!market || !market.active || !annualKwh) return { npv: 0, market: null };
  const mwhPerYear = annualKwh / 1000;
  const annual = mwhPerYear * market.price_per_mwh;
  const r = 0.07;
  const years = 10;
  const npv = annual * ((1 - Math.pow(1 + r, -years)) / r);
  return { npv: Math.round(npv), annual: Math.round(annual), market };
}

// ── Municipal / utility-specific rebate library ─────────────────────────
// Keyed by lowercased "city, state" or just state for state-level. Real
// programs are far more granular than this — extend the table as you
// onboard new markets.
const MUNICIPAL_REBATES = {
  'austin, tx': { name: 'Austin Energy Commercial PBI',     per_kw: 800, notes: 'Austin Energy pays per-kW for commercial solar.' },
  'san antonio, tx': { name: 'CPS Energy Commercial Solar', per_kw: 600, notes: 'CPS Energy commercial rebate.' },
  'sacramento, ca': { name: 'SMUD PV Incentive',            per_kw: 350, notes: 'SMUD per-kW commercial incentive.' },
  'orlando, fl':   { name: 'OUC Solar Commercial Rebate',   per_kw: 500, notes: 'Orlando Utilities Commission commercial solar rebate.' },
  'los angeles, ca': { name: 'LADWP Solar Incentive',       per_kw: 250, notes: 'LADWP commercial-scale PBI.' },
  'denver, co':    { name: 'Xcel Denver Commercial Rebate', per_kw: 100, notes: 'Xcel Denver-territory commercial rebate stacked on Solar*Rewards.' },
};

function municipalRebate(city, state, systemKw) {
  if (!systemKw) return null;
  const key = `${(city || '').toLowerCase()}, ${(state || '').toLowerCase()}`;
  const rebate = MUNICIPAL_REBATES[key];
  if (!rebate) return null;
  return { ...rebate, amount: Math.round((rebate.per_kw || 0) * systemKw) };
}

/**
 * Generate a localized urgency hook for AI email injection.
 *
 * Picks the most compelling time-sensitive narrative for a property based on
 * its state, utility, and which IRA bonus stack it likely qualifies for.
 * Returns a single sentence that reads like a human wrote it after looking
 * at the property's incentive structure.
 *
 * @param {Object} opts
 * @param {string} opts.state
 * @param {Object} opts.tariff  result of solar-tariffs.lookup(utility)
 * @param {Object} opts.bonuses { energy_community, domestic_content, low_income }
 * @returns {string}
 */
function urgencyHook({ state, tariff, bonuses = {} }) {
  // 1. Utility-specific deadline beats state-level
  if (tariff?.deadline_message) return tariff.deadline_message;
  // 2. State program urgency
  const us = (state || '').toUpperCase();
  if (PROGRAM_URGENCY[us]) return PROGRAM_URGENCY[us].msg;
  // 3. Generic IRA bonus hook
  if (bonuses?.energy_community) return DEADLINES.energy_community.urgency;
  if (bonuses?.domestic_content) return DEADLINES.domestic_content.urgency;
  // 4. Federal ITC step-down (always true, but lowest urgency)
  return DEADLINES.federal.urgency;
}

/**
 * Return everything an AI prompt needs to generate a hyper-localized pitch:
 * urgency hook, SREC revenue line, municipal rebate (if any), and the full
 * incentive stack. Composable from a single property fetch.
 */
function buildPropertyIntel({ state, city, zip, systemKw, annualKwh, grossCost, tariff, bonuses = {} }) {
  const stack = calculateStack({
    grossCost, systemKw, annualKwh, state, zip, bonuses,
  });
  const muni = municipalRebate(city, state, systemKw);
  if (muni) {
    stack.line_items.push({ label: muni.name, amount: muni.amount, notes: muni.notes });
    stack.total_incentives += muni.amount;
    stack.net_cost = Math.max(0, stack.net_cost - muni.amount);
    stack.municipal = muni;
  }
  const srec = srecRevenueNpv(state, annualKwh);
  if (srec.npv > 0) {
    stack.line_items.push({ label: srec.market.market, amount: srec.npv, notes: `10-yr NPV @ ~$${srec.market.price_per_mwh}/MWh.` });
    stack.srec = srec;
  }
  return {
    stack,
    urgency: urgencyHook({ state, tariff, bonuses }),
    municipal: muni,
    srec,
  };
}

module.exports = {
  calculateStack,
  netPaybackYears,
  buildPropertyIntel,
  urgencyHook,
  municipalRebate,
  srecRevenueNpv,
  STATE_PROGRAMS,
  DEADLINES,
  PROGRAM_URGENCY,
  SREC_MARKETS,
  MUNICIPAL_REBATES,
  IRA_BONUSES,
  ITC_BASE_RATE,
};
