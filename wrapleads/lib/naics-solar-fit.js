/**
 * NAICS → solar opportunity profile (v2 — energy intensity + tax appetite + ESG).
 *
 * Maps NAICS industry codes to a structured fit dossier the rest of the
 * solar stack consumes:
 *   - fit:               0–100 base score
 *   - load_profile:      'flat_24_7' | 'daytime_peak' | 'industrial_shift' | 'weekday_office' | 'seasonal' | 'intermittent'
 *   - energy_intensity:  'very_high' | 'high' | 'moderate' | 'low'
 *   - tax_appetite:      'corporate' | 'pass_through' | 'mixed' | 'tax_exempt'
 *   - ownership_model:   recommended buying structure
 *   - esg_pressure:      'extreme' | 'high' | 'moderate' | 'low' | 'none'
 *   - kwhDriver:         short reason
 *   - pitchHook:         industry-specific AI prompt line
 *   - sales_script:      a concrete script opener for outbound
 *
 * Used by:
 *   - lib/solar-router.js  /solar/discover scoring + dossier in detail view
 *   - wrapleads-server.js  AI prompt for outbound emails
 *
 * Sources: EPA ENERGY STAR Portfolio Manager median EUI tables, EIA CBECS
 * 2018 data, DOE Better Buildings sector benchmarks. Numbers are
 * directional — real EUI varies by climate zone and building age.
 */

'use strict';

// Load profile families. Used by the AI prompt to phrase the savings angle
// correctly ("24/7 baseload aligns with summer demand peak" vs "weekday-only
// office load means net-metering arbitrage matters more than self-consumption").
const LOAD_PROFILES = {
  flat_24_7: {
    label: 'Continuous 24/7 baseload',
    self_consumption_match: 0.45, // % of generation consumed on-site
    pitch: '24/7 process load matches solar generation during the day and pulls grid power at night — battery storage adds 8-15% to lifetime ROI.',
  },
  daytime_peak: {
    label: 'Daytime-peak commercial',
    self_consumption_match: 0.75,
    pitch: 'Your peak electrical demand sits squarely on the solar generation curve — every kWh produced offsets the most expensive grid power.',
  },
  industrial_shift: {
    label: 'Single/dual-shift manufacturing',
    self_consumption_match: 0.70,
    pitch: 'Production shifts run during sun hours — high self-consumption + demand-charge reduction.',
  },
  weekday_office: {
    label: 'Weekday office load',
    self_consumption_match: 0.55,
    pitch: 'Weekday office HVAC load aligns with solar; weekend over-production exports back at your utility\'s net-metering rate.',
  },
  seasonal: {
    label: 'Seasonal / event-driven',
    self_consumption_match: 0.40,
    pitch: 'Peak event months align with summer sun — winter excess banks against the next season under net metering.',
  },
  intermittent: {
    label: 'Intermittent / low daytime load',
    self_consumption_match: 0.25,
    pitch: 'Lower self-consumption — ROI depends heavily on local net-metering rate.',
  },
};

// Ownership model decision tree:
//   - corporate tax appetite + heavy load     → direct purchase (capture full ITC + MACRS)
//   - pass-through (LLC) + heavy load        → direct purchase, owner uses ITC personally
//   - tax-exempt (church/school/government)   → PPA or lease (third-party owner monetizes ITC, host pays cents-per-kWh)
//   - mixed                                   → quote both, let installer recommend
const OWNERSHIP_MODELS = {
  direct_purchase: 'Direct purchase — full ITC + MACRS depreciation goes to the owner. Best IRR if buyer has federal tax appetite.',
  ppa:             'Power Purchase Agreement (PPA) — third-party installer owns the system, host pays per-kWh below grid rate. Ideal for non-profits, schools, churches, government.',
  lease:           'Capital or operating lease — host gets all kWh, owner monetizes ITC. Good middle path for tax-exempt + cash-conservative buyers.',
  inverted_lease:  'Inverted lease — partnership flip structure. For sophisticated investors only; recommend tax counsel.',
  cash_or_ppa:     'Cash purchase if buyer has tax appetite; otherwise PPA — quote both.',
};

// ESG pressure tiers. Manufacturers under Tier-1/2 supplier scrutiny + data
// centers facing tenant ESG demands score highest.
const ESG_TIERS = {
  extreme: 'Public + Tier-1 supplier to Fortune 500 — Scope 3 emissions reporting is mandatory.',
  high:    'Customer-facing brand or supplier under Scope 3 pressure.',
  moderate:'Some ESG awareness; mostly cost-driven.',
  low:     'Minimal external ESG pressure; price-driven.',
  none:    'No ESG considerations.',
};

// Industry-specific profiles. Keyed by NAICS code (full or prefix). Walked
// from most specific (6-digit) to least specific (2-digit prefix) at lookup.
const PROFILES = {
  // ── HIGH-FIT: refrigerated warehousing & cold storage ─────────────────
  '493120': {
    fit: 96, load_profile: 'flat_24_7', energy_intensity: 'very_high',
    tax_appetite: 'corporate', ownership_model: 'direct_purchase',
    esg_pressure: 'high', kwhDriver: '24/7 refrigeration is the most energy-intense commercial vertical',
    pitchHook: 'Cold-storage demand charges peak with summer ambient temperatures — exactly when PV produces most. Battery attach drives full ROI.',
    sales_script: 'We help cold-storage facilities offset up to 40% of their peak refrigeration energy costs without changing operations. Worth a 15-minute call?',
  },

  // ── HIGH-FIT: data centers ────────────────────────────────────────────
  '518210': {
    fit: 95, load_profile: 'flat_24_7', energy_intensity: 'very_high',
    tax_appetite: 'corporate', ownership_model: 'direct_purchase',
    esg_pressure: 'extreme', kwhDriver: 'Server load + cooling runs 24/7/365',
    pitchHook: 'PUE pressure from colo tenants + the corporate Scope 3 mandate from your enterprise customers — solar PPA + storage is the cleanest path to "100% renewable" branding.',
    sales_script: 'Your colo tenants are likely already asking about a renewable PPA — we can structure one without you owning the asset. Quick call?',
  },

  // ── HIGH-FIT: manufacturing (31-33) ──────────────────────────────────
  '311':    { fit: 88, load_profile: 'industrial_shift', energy_intensity: 'very_high', tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'high',    kwhDriver: 'food manufacturing — refrigeration + process heat', pitchHook: 'Food manufacturers face Tier-1 supplier ESG audits and continuous process loads — solar+storage cuts both peak demand charges and Scope 2 emissions.', sales_script: 'We work with food manufacturers under Scope 3 supplier pressure — solar usually answers two corporate mandates at once. Worth a quick conversation?' },
  '312':    { fit: 80, load_profile: 'industrial_shift', energy_intensity: 'high',      tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'high',    kwhDriver: 'beverage manufacturing — high refrigeration', pitchHook: 'Refrigerated process lines + brand-visibility on sustainability — solar story doubles as customer-facing credibility.' },
  '321':    { fit: 75, load_profile: 'industrial_shift', energy_intensity: 'high',      tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'moderate',kwhDriver: 'wood products manufacturing', pitchHook: 'Sawmills + millwork facilities have heavy daytime electrical draw matching PV.' },
  '322':    { fit: 85, load_profile: 'flat_24_7',        energy_intensity: 'very_high', tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'high',    kwhDriver: 'pulp / paper / packaging — continuous high MW load', pitchHook: 'Pulp + paper sit in EPA carbon reporting boundaries — solar contracts can defer Scope 2 reporting requirements.', sales_script: 'Pulp & paper buyers are coming under intense ESG pressure from CPG brands — let\'s talk about a 1MW+ flat-roof system.' },
  '325':    { fit: 80, load_profile: 'flat_24_7',        energy_intensity: 'very_high', tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'extreme', kwhDriver: 'chemicals — continuous high-MW process loads', pitchHook: 'Chemical manufacturing combines very high baseload with the strongest Scope 1+2+3 reporting demands of any sector.' },
  '331':    { fit: 70, load_profile: 'industrial_shift', energy_intensity: 'very_high', tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'high',    kwhDriver: 'primary metals — extreme MW demand', pitchHook: 'Primary metals are top targets for Inflation Reduction Act 45X advanced-manufacturing credits stacked with solar ITC.' },
  '332':    { fit: 80, load_profile: 'industrial_shift', energy_intensity: 'high',      tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'high',    kwhDriver: 'fabricated metal products', pitchHook: 'Fabricators serving auto / aerospace get pulled into customer Scope 3 mandates — solar is the easiest credit.' },
  '333':    { fit: 80, load_profile: 'industrial_shift', energy_intensity: 'high',      tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'high',    kwhDriver: 'machinery manufacturing', pitchHook: 'Daytime shifts + heavy electrical = strong self-consumption ratio + MACRS-depreciable capex.' },
  '336':    { fit: 82, load_profile: 'industrial_shift', energy_intensity: 'very_high', tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'extreme', kwhDriver: 'transportation equipment / auto suppliers', pitchHook: 'OEMs are auditing Tier-1/2 suppliers on Scope 3 — solar PPA is the fastest way to satisfy without capex.', sales_script: 'OEMs are pushing carbon disclosures down to suppliers — we help auto/aerospace suppliers comply without breaking ground on capex. Worth talking?' },

  // ── HIGH-FIT: warehousing & distribution (49) ────────────────────────
  '493110': { fit: 84, load_profile: 'daytime_peak', energy_intensity: 'moderate', tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'high',    kwhDriver: 'general warehousing — flat-roof palace', pitchHook: 'Massive flat-roof footprints are the most cost-efficient $/W commercial PV installs in the market.', sales_script: 'Distribution centers are the easiest commercial solar installs we do — large clear flat roofs, ground-level interconnect.' },
  '493190': { fit: 80, load_profile: 'daytime_peak', energy_intensity: 'moderate', tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'moderate', kwhDriver: 'other warehousing', pitchHook: 'Standard warehouse footprint — solid ROI segment.' },
  '4811':   { fit: 78, load_profile: 'daytime_peak', energy_intensity: 'high',     tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'moderate', kwhDriver: 'scheduled air transport — hangar roofs', pitchHook: 'Hangar roofs are massive single-plane PV substrates with minimal shading.' },
  '4841':   { fit: 76, load_profile: 'daytime_peak', energy_intensity: 'moderate', tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'high',     kwhDriver: 'general freight trucking', pitchHook: 'Solar + EV-ready truck pads positions you for the diesel-to-electric fleet transition.' },
  '4225':   { fit: 82, load_profile: 'daytime_peak', energy_intensity: 'moderate', tax_appetite: 'corporate', ownership_model: 'direct_purchase', esg_pressure: 'high',     kwhDriver: 'general warehousing & storage',  pitchHook: 'Built-to-last 30-year buildings match the solar payback horizon perfectly.', sales_script: 'Distribution facilities like yours often hit 4-5 year payback even before storage. Quick call to share numbers for your roof?' },

  // ── MID-HIGH: hospitality, healthcare, education ─────────────────────
  '6221':   { fit: 78, load_profile: 'flat_24_7',     energy_intensity: 'high',      tax_appetite: 'mixed',      ownership_model: 'cash_or_ppa',     esg_pressure: 'high',     kwhDriver: 'general hospitals — 24/7 critical loads', pitchHook: 'Hospital boards face ESG pressure + tax-exempt structures — PPA models give you all the kWh without capex.' },
  '6222':   { fit: 75, load_profile: 'flat_24_7',     energy_intensity: 'high',      tax_appetite: 'mixed',      ownership_model: 'cash_or_ppa',     esg_pressure: 'high',     kwhDriver: 'psychiatric & substance abuse hospitals', pitchHook: '24/7 facility load; tax-exempt nonprofits should consider PPA structures.' },
  '7211':   { fit: 76, load_profile: 'flat_24_7',     energy_intensity: 'high',      tax_appetite: 'corporate',  ownership_model: 'direct_purchase', esg_pressure: 'moderate', kwhDriver: 'hotels — 24/7 guest + amenity load', pitchHook: 'Pool heating + 24/7 HVAC + guest-facing sustainability story.' },
  '6111':   { fit: 72, load_profile: 'weekday_office',energy_intensity: 'moderate',  tax_appetite: 'tax_exempt', ownership_model: 'ppa',             esg_pressure: 'moderate', kwhDriver: 'K-12 schools — school-day load', pitchHook: 'Schools are tax-exempt — pitch a PPA where the installer owns the asset and the school buys kWh below grid rate.', sales_script: 'Schools can\'t use the federal tax credit directly — but a PPA gives you all the kWh, zero capex, locked-in rate. Want to see how it works?' },
  '6112':   { fit: 70, load_profile: 'weekday_office',energy_intensity: 'moderate',  tax_appetite: 'tax_exempt', ownership_model: 'ppa',             esg_pressure: 'moderate', kwhDriver: 'community colleges', pitchHook: 'Tax-exempt — PPA structure.' },
  '6113':   { fit: 78, load_profile: 'weekday_office',energy_intensity: 'high',      tax_appetite: 'mixed',      ownership_model: 'cash_or_ppa',     esg_pressure: 'high',     kwhDriver: 'colleges & universities', pitchHook: 'Universities have research-arm tax footprint + ESG mandates — direct purchase or PPA depending on entity structure.' },

  // ── MID: offices, retail, real estate ───────────────────────────────
  '5311':   { fit: 60, load_profile: 'weekday_office', energy_intensity: 'low',     tax_appetite: 'pass_through', ownership_model: 'direct_purchase', esg_pressure: 'low',     kwhDriver: 'lessors of residential buildings', pitchHook: 'Common-area meters only — small but quick approval.' },
  '5312':   { fit: 70, load_profile: 'weekday_office', energy_intensity: 'moderate',tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',    kwhDriver: 'lessors of nonresidential buildings', pitchHook: 'Portfolio-level deal — solar across multiple buildings, single procurement, tenant pass-through.', sales_script: 'CRE portfolios get a big ROI lift by stacking ITC across multiple buildings in one procurement. Worth a portfolio review?' },
  '5121':   { fit: 65, load_profile: 'daytime_peak',  energy_intensity: 'high',     tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',    kwhDriver: 'motion picture / sound — studio HVAC', pitchHook: 'Studio HVAC + lighting load aligns with production-day solar generation.' },
  '4451':   { fit: 75, load_profile: 'daytime_peak',  energy_intensity: 'high',     tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',    kwhDriver: 'grocery stores — refrigeration', pitchHook: 'Refrigeration is your #1 line item — solar directly attacks demand charges.', sales_script: 'Grocery refrigeration drives the biggest demand charges in commercial real estate — solar usually cuts them 30%+. Quick call?' },
  '4452':   { fit: 75, load_profile: 'daytime_peak',  energy_intensity: 'high',     tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'moderate',kwhDriver: 'specialty food stores',     pitchHook: 'Same refrigeration-driven savings as grocery.' },

  // ── MID-LOW: professional services ───────────────────────────────────
  '54':     { fit: 50, load_profile: 'weekday_office',energy_intensity: 'low',      tax_appetite: 'pass_through', ownership_model: 'direct_purchase', esg_pressure: 'low',     kwhDriver: 'professional / scientific / technical services', pitchHook: 'Office-only load — modest fit but easy capex approval at partner level.' },
  '52':     { fit: 55, load_profile: 'weekday_office',energy_intensity: 'moderate', tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',    kwhDriver: 'finance / insurance', pitchHook: 'Big banks have ESG mandates that often outpace ROI — brand-credibility win at HQ buildings.' },

  // ── TAX-EXEMPT segments → PPA/lease ──────────────────────────────────
  '8131':   { fit: 60, load_profile: 'seasonal',      energy_intensity: 'moderate', tax_appetite: 'tax_exempt',   ownership_model: 'ppa',             esg_pressure: 'low',     kwhDriver: 'religious organizations — Sunday + event load', pitchHook: 'Churches can\'t use the federal ITC — a PPA gives you the kWh and a third-party owner monetizes the credit.', sales_script: 'For churches we recommend a Power Purchase Agreement — you pay below grid rate per kWh, the installer takes the tax credit. Most churches save 15-30% from day one.' },
  '92':     { fit: 70, load_profile: 'weekday_office',energy_intensity: 'moderate', tax_appetite: 'tax_exempt',   ownership_model: 'ppa',             esg_pressure: 'high',    kwhDriver: 'public administration / government', pitchHook: 'Municipal procurement + carbon goals + tax-exempt status → PPA or lease.', sales_script: 'Municipalities are required to publish renewable goals but can\'t use the ITC — let\'s talk about a PPA structure.' },
  '813':    { fit: 55, load_profile: 'weekday_office',energy_intensity: 'low',      tax_appetite: 'tax_exempt',   ownership_model: 'ppa',             esg_pressure: 'low',     kwhDriver: 'religious / nonprofit / civic / professional orgs', pitchHook: 'Tax-exempt — quote PPA and lease side-by-side.' },
};

// 2-digit prefix fallback when we don't have a specific code on file.
const PREFIX_PROFILES = {
  '11': { fit: 65, load_profile: 'seasonal',          energy_intensity: 'moderate', tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'moderate', kwhDriver: 'agriculture / forestry', pitchHook: 'USDA REAP grants apply for rural agribusiness — stack with ITC for 50%+ cost reduction.' },
  '21': { fit: 75, load_profile: 'flat_24_7',         energy_intensity: 'high',     tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',     kwhDriver: 'mining / extraction', pitchHook: 'Remote sites with diesel gensets are perfect for solar + storage hybrids.' },
  '22': { fit: 60, load_profile: 'flat_24_7',         energy_intensity: 'very_high',tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',     kwhDriver: 'utilities', pitchHook: 'Utility-scale — different sales motion entirely.' },
  '23': { fit: 50, load_profile: 'intermittent',      energy_intensity: 'low',      tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'low',      kwhDriver: 'construction', pitchHook: 'Permanent yard + jobsite trailer-mounted solar opportunities.' },
  '31': { fit: 80, load_profile: 'industrial_shift',  energy_intensity: 'high',     tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',     kwhDriver: 'manufacturing', pitchHook: 'Process load matches solar curve — high-ROI segment.' },
  '32': { fit: 82, load_profile: 'industrial_shift',  energy_intensity: 'high',     tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',     kwhDriver: 'manufacturing', pitchHook: 'Continuous process electrical load + supplier ESG mandates.' },
  '33': { fit: 82, load_profile: 'industrial_shift',  energy_intensity: 'high',     tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',     kwhDriver: 'manufacturing', pitchHook: 'Heavy equipment + daytime shifts + IRA 45X stacking.' },
  '42': { fit: 78, load_profile: 'daytime_peak',      energy_intensity: 'moderate', tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'moderate', kwhDriver: 'wholesale trade', pitchHook: 'Distribution centers + warehouses, ideal flat-roof targets.' },
  '44': { fit: 65, load_profile: 'daytime_peak',      energy_intensity: 'moderate', tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'moderate', kwhDriver: 'retail trade', pitchHook: 'Big-box HVAC peak demand savings.' },
  '45': { fit: 65, load_profile: 'daytime_peak',      energy_intensity: 'moderate', tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'moderate', kwhDriver: 'retail trade', pitchHook: 'Same as 44 — big-box HVAC savings.' },
  '48': { fit: 78, load_profile: 'daytime_peak',      energy_intensity: 'high',     tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',     kwhDriver: 'transportation', pitchHook: 'Logistics warehouses + EV-ready fleet pads.' },
  '49': { fit: 90, load_profile: 'flat_24_7',         energy_intensity: 'very_high',tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',     kwhDriver: 'warehousing / cold storage', pitchHook: 'Refrigerated warehousing has the strongest ROI in commercial solar.' },
  '51': { fit: 80, load_profile: 'flat_24_7',         energy_intensity: 'very_high',tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'extreme',  kwhDriver: 'data centers / information', pitchHook: 'Tier-3+ data centers face PUE + tenant ESG pressure.' },
  '52': { fit: 55, load_profile: 'weekday_office',    energy_intensity: 'moderate', tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',     kwhDriver: 'finance / insurance', pitchHook: 'Brand-credibility + ESG mandate at HQ buildings.' },
  '53': { fit: 70, load_profile: 'weekday_office',    energy_intensity: 'moderate', tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',     kwhDriver: 'real estate', pitchHook: 'Portfolio play across multiple buildings, single procurement.' },
  '54': { fit: 50, load_profile: 'weekday_office',    energy_intensity: 'low',      tax_appetite: 'pass_through', ownership_model: 'direct_purchase', esg_pressure: 'low',      kwhDriver: 'professional services', pitchHook: 'Smaller project but easy capex approval.' },
  '55': { fit: 60, load_profile: 'weekday_office',    energy_intensity: 'moderate', tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'high',     kwhDriver: 'management of companies / HQ', pitchHook: 'HQ campuses with ESG goals + tax appetite — direct purchase strong.' },
  '56': { fit: 55, load_profile: 'daytime_peak',      energy_intensity: 'low',      tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'low',      kwhDriver: 'admin & support services', pitchHook: 'Office HVAC load only.' },
  '61': { fit: 72, load_profile: 'weekday_office',    energy_intensity: 'moderate', tax_appetite: 'tax_exempt',   ownership_model: 'ppa',             esg_pressure: 'moderate', kwhDriver: 'education', pitchHook: 'Schools are tax-exempt — pitch PPA, not direct purchase.' },
  '62': { fit: 75, load_profile: 'flat_24_7',         energy_intensity: 'high',     tax_appetite: 'mixed',        ownership_model: 'cash_or_ppa',     esg_pressure: 'high',     kwhDriver: 'healthcare', pitchHook: '24/7 critical load + entity-structure-dependent.' },
  '71': { fit: 60, load_profile: 'seasonal',          energy_intensity: 'moderate', tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'moderate', kwhDriver: 'arts / entertainment', pitchHook: 'Event venues with high peak-demand HVAC.' },
  '72': { fit: 72, load_profile: 'flat_24_7',         energy_intensity: 'high',     tax_appetite: 'corporate',    ownership_model: 'direct_purchase', esg_pressure: 'moderate', kwhDriver: 'hospitality / food', pitchHook: 'Hotels + restaurants — daytime cooking + 24/7 HVAC.' },
  '81': { fit: 55, load_profile: 'weekday_office',    energy_intensity: 'low',      tax_appetite: 'mixed',        ownership_model: 'cash_or_ppa',     esg_pressure: 'low',      kwhDriver: 'other services', pitchHook: 'Mixed entity types — quote both ownership models.' },
  '92': { fit: 75, load_profile: 'weekday_office',    energy_intensity: 'moderate', tax_appetite: 'tax_exempt',   ownership_model: 'ppa',             esg_pressure: 'high',     kwhDriver: 'public administration', pitchHook: 'Municipal procurement + carbon goals + tax-exempt → PPA.' },
};

function enrich(p) {
  if (!p) return null;
  return {
    ...p,
    load_profile_details: LOAD_PROFILES[p.load_profile] || null,
    ownership_model_explainer: OWNERSHIP_MODELS[p.ownership_model] || null,
    esg_explainer: ESG_TIERS[p.esg_pressure] || null,
  };
}

function lookup(naicsCode) {
  if (!naicsCode) return null;
  const code = String(naicsCode).trim();
  if (PROFILES[code]) return enrich({ ...PROFILES[code], code });
  for (let len = code.length - 1; len >= 2; len--) {
    const prefix = code.slice(0, len);
    if (PROFILES[prefix]) return enrich({ ...PROFILES[prefix], code: prefix });
  }
  const two = code.slice(0, 2);
  if (PREFIX_PROFILES[two]) return enrich({ ...PREFIX_PROFILES[two], code: two, generic: true });
  return null;
}

// Industry text fallback when no NAICS code is on file (e.g. Google Places
// only gives us a search term: "warehouse", "cold storage", etc.).
const INDUSTRY_TEXT_HINTS = [
  { match: /cold storage|refrigerat/i,             naics: '493120' },
  { match: /data center|colocation|colo facility/i, naics: '518210' },
  { match: /distribution|logistics center/i,        naics: '4225' },
  { match: /warehouse/i,                            naics: '493110' },
  { match: /manufactur|fabricat|plant/i,            naics: '333' },
  { match: /school|community college/i,             naics: '6111' },
  { match: /college|university/i,                   naics: '6113' },
  { match: /hospital|medical center/i,              naics: '6221' },
  { match: /hotel|motel|resort/i,                   naics: '7211' },
  { match: /grocery|supermarket/i,                  naics: '4451' },
  { match: /self storage|mini storage/i,            naics: '5311' },
  { match: /church|temple|mosque|synagogue/i,       naics: '8131' },
  { match: /government|city of|county of|state of/i,naics: '92'     },
];

function inferNaicsFromIndustry(industry) {
  if (!industry) return null;
  for (const h of INDUSTRY_TEXT_HINTS) if (h.match.test(industry)) return h.naics;
  return null;
}

// Convenience: from a property record, return everything the AI prompt needs.
function profileFor({ naics_code, industry }) {
  const code = naics_code || inferNaicsFromIndustry(industry);
  return lookup(code);
}

module.exports = {
  lookup,
  enrich,
  profileFor,
  inferNaicsFromIndustry,
  PROFILES,
  PREFIX_PROFILES,
  LOAD_PROFILES,
  OWNERSHIP_MODELS,
  ESG_TIERS,
};
