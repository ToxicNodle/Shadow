/**
 * DSIRE — Database of State Incentives for Renewables & Efficiency.
 *
 * Maintained by NC State University. Gold-standard policy data for
 * federal, state, utility, and local clean-energy incentives. Free API
 * at https://programs.dsireusa.org/api/v1/getprograms.json.
 *
 * We use this to dynamically resolve which incentives are active for a
 * given state / zip, instead of relying on the hand-curated table in
 * lib/solar-incentives.js. The static table remains as a fallback when
 * the DSIRE API is unreachable.
 *
 * Cache TTL: 6 hours (DSIRE updates daily). In-memory only — adequate for
 * a single Node process; a multi-instance deploy should add a Redis or
 * Postgres cache layer.
 */

'use strict';

const BASE = 'https://programs.dsireusa.org/api/v1';
const UA = 'WrapLeads-SolarScout/1.0';

// In-memory cache keyed by state code.
const CACHE = new Map();
const TTL_MS = 6 * 60 * 60 * 1000;

function cacheGet(key) {
  const e = CACHE.get(key);
  if (!e) return null;
  if (Date.now() - e.at > TTL_MS) { CACHE.delete(key); return null; }
  return e.value;
}
function cacheSet(key, value) {
  CACHE.set(key, { value, at: Date.now() });
}

/**
 * Fetch all active programs for a state. Programs are categorized by
 * DSIRE into Financial Incentives (rebates, tax credits, grants) and
 * Regulatory Policies (net metering, RPS, interconnection rules).
 *
 * @param {string} state — USPS 2-letter code, e.g. 'AZ'
 * @returns {Promise<{financial: Program[], regulatory: Program[]}>}
 */
async function getProgramsForState(state) {
  if (!state) return { financial: [], regulatory: [] };
  const us = state.toUpperCase();
  const cached = cacheGet(us);
  if (cached) return cached;

  try {
    const url = `${BASE}/getprograms.json?state=${us}`;
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`DSIRE ${r.status}`);
    const data = await r.json();

    const financial = [];
    const regulatory = [];
    for (const p of (data?.data?.programs || [])) {
      const program = normalize(p);
      if (!program.is_active) continue;
      if (/Tax Credit|Rebate|Grant|Loan|Performance|Bond|Sales Tax|Property Tax/i.test(program.category)) {
        financial.push(program);
      } else if (/Net Metering|Interconnection|RPS|Standard|Public Benefit/i.test(program.category)) {
        regulatory.push(program);
      } else if (/Financial Incentive/i.test(program.type)) {
        financial.push(program);
      } else {
        regulatory.push(program);
      }
    }
    const result = { financial, regulatory };
    cacheSet(us, result);
    return result;
  } catch (e) {
    // Cache the failure briefly so we don't hammer the API on outages.
    cacheSet(us, { financial: [], regulatory: [], error: e.message });
    return { financial: [], regulatory: [], error: e.message };
  }
}

function normalize(p) {
  return {
    id:               p.id,
    name:             p.name,
    state:            p.state,
    code:             p.code || null,
    administrator:    p.administrator || null,
    category:         p.category_name || p.category || '',
    type:             p.type_name || p.type || '',
    technologies:     (p.technologies || []).map(t => t.name || t),
    sectors:          (p.sectors || []).map(s => s.name || s),
    summary:          p.summary || null,
    start_date:       p.start_date || null,
    end_date:         p.end_date || null,
    is_active:        !p.end_date || new Date(p.end_date) >= new Date(),
    website:          p.website || null,
    last_updated:     p.last_updated || null,
  };
}

/**
 * Resolve the subset of programs relevant for commercial solar at a
 * specific property. Filters by technology (Solar / Solar Photovoltaics)
 * and sector (Commercial / Industrial / Schools / Local Government, etc.).
 *
 * @param {Object} opts
 * @param {string} opts.state
 * @param {string} [opts.taxAppetite] from naics-solar-fit ('corporate' | 'pass_through' | 'mixed' | 'tax_exempt')
 */
async function programsForLead({ state, taxAppetite = 'corporate' }) {
  const { financial, regulatory, error } = await getProgramsForState(state);
  const solarFilter = (p) =>
    p.technologies.some(t => /solar|photovoltaic/i.test(t));
  const sectorFilter = (p) => {
    if (taxAppetite === 'tax_exempt') {
      return p.sectors.some(s => /Nonprofit|Schools|Local Government|Federal Government|State Government|Tribal/i.test(s));
    }
    return p.sectors.some(s => /Commercial|Industrial|Agricultural|Multi-?Family|For-Profit/i.test(s));
  };
  return {
    financial:  financial.filter(p => solarFilter(p) && sectorFilter(p)),
    regulatory: regulatory.filter(p => solarFilter(p) && sectorFilter(p)),
    error,
  };
}

/**
 * Pick the single most compelling urgency hook from the live DSIRE data.
 * Programs with a near-term end_date get top priority.
 */
function urgencyFromDsire(programs) {
  if (!programs?.financial?.length) return null;
  const dated = programs.financial.filter(p => p.end_date);
  if (!dated.length) return null;
  const soonest = dated.sort((a, b) => new Date(a.end_date) - new Date(b.end_date))[0];
  const days = Math.round((new Date(soonest.end_date) - Date.now()) / 86400000);
  if (days < 0) return null;
  if (days < 90)  return `${soonest.name} closes in ${days} days (${soonest.administrator || 'program admin'}) — applications need to be filed well ahead of expiration.`;
  if (days < 365) return `${soonest.name} expires ${soonest.end_date} — current funding cycle is the safest bet for project approval.`;
  return null;
}

module.exports = { getProgramsForState, programsForLead, urgencyFromDsire };
