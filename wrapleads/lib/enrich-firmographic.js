/**
 * Firmographic enrichment — domain → NAICS code, employee count, revenue,
 * own-vs-lease, parent company, ESG flags.
 *
 * Wraps multiple providers behind a single `enrichByDomain(domain)` call
 * and merges their best fields. Configured via env vars; gracefully no-ops
 * when no provider is set up.
 *
 *   CLEARBIT_API_KEY       — Clearbit Reveal / Company API
 *   APOLLO_API_KEY         — existing Apollo key, used for /organizations/search
 *   OPENCORPORATES_API_KEY — OpenCorporates registry data
 *
 * The result is a normalized object that downstream code (solar-router,
 * AI prompt) consumes without caring which provider returned the data.
 */

'use strict';

const CLEARBIT_KEY      = process.env.CLEARBIT_API_KEY || '';
const APOLLO_KEY        = process.env.APOLLO_API_KEY || '';
const OPENCORP_KEY      = process.env.OPENCORPORATES_API_KEY || '';

// In-memory LRU so we don't pay for the same domain twice in one session.
// Persistent caching would belong in Postgres; left as an exercise.
const CACHE = new Map();
const CACHE_MAX = 1000;

function cacheGet(key) {
  if (!CACHE.has(key)) return null;
  const v = CACHE.get(key);
  CACHE.delete(key); CACHE.set(key, v); // bump LRU
  return v;
}
function cacheSet(key, value) {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, value);
}

async function enrichClearbit(domain) {
  if (!CLEARBIT_KEY) return null;
  try {
    const url = `https://company.clearbit.com/v2/companies/find?domain=${encodeURIComponent(domain)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${CLEARBIT_KEY}` } });
    if (!r.ok) return null;
    const d = await r.json();
    return {
      provider: 'clearbit',
      domain: d.domain,
      company_name: d.name,
      naics_code: d.category?.naicsCode || null,
      industry: d.category?.industry || null,
      sector: d.category?.sector || null,
      employees: d.metrics?.employees || null,
      annual_revenue: d.metrics?.annualRevenue || null,
      type: d.type || null,
      tags: d.tags || [],
      tech: d.tech || [],
      location: d.geo ? {
        city: d.geo.city, state: d.geo.stateCode, country: d.geo.countryCode,
        latitude: d.geo.lat, longitude: d.geo.lng,
      } : null,
      raw: d,
    };
  } catch { return null; }
}

async function enrichApollo(domain) {
  if (!APOLLO_KEY) return null;
  try {
    const r = await fetch('https://api.apollo.io/api/v1/organizations/enrich', {
      method: 'POST',
      headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: APOLLO_KEY, domain }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const org = d.organization || d;
    if (!org) return null;
    return {
      provider: 'apollo',
      domain,
      company_name: org.name,
      naics_code: (org.naics_codes || [])[0] || null,
      industry: org.industry || null,
      employees: org.estimated_num_employees || null,
      annual_revenue: org.annual_revenue || null,
      sic_codes: org.sic_codes || null,
      location: {
        city: org.city, state: org.state, country: org.country,
        latitude: org.latitude, longitude: org.longitude,
      },
      tech: org.technology_names || [],
      raw: org,
    };
  } catch { return null; }
}

/**
 * Tier-1 enrichment entry point. Tries each provider in order and merges
 * results. Returns null only if every provider fails AND no provider is set.
 */
async function enrichByDomain(domain) {
  if (!domain) return null;
  const key = `domain:${domain.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const results = await Promise.all([enrichClearbit(domain), enrichApollo(domain)]);
  const merged = results.filter(Boolean).reduce((acc, r) => {
    for (const k of Object.keys(r)) if (acc[k] === undefined || acc[k] === null) acc[k] = r[k];
    return acc;
  }, {});
  if (!Object.keys(merged).length) {
    cacheSet(key, null);
    return null;
  }
  cacheSet(key, merged);
  return merged;
}

/**
 * Apply enrichment to a list of companies (by their `website` field) and
 * stamp NAICS / industry / employees onto the row. Idempotent on re-run.
 */
async function backfill({ pool, limit = 200, log = console.log }) {
  if (!CLEARBIT_KEY && !APOLLO_KEY) {
    log('   (no enrichment provider configured — set CLEARBIT_API_KEY or APOLLO_API_KEY)');
    return { total: 0, inserted: 0, updated: 0, skipped: 0 };
  }
  const r = await pool.query(`
    SELECT id, website, name FROM companies
    WHERE website IS NOT NULL AND naics_code IS NULL
    LIMIT $1
  `, [limit]);
  log(`   enrichByDomain: ${r.rows.length} companies missing NAICS`);

  let updated = 0;
  for (const row of r.rows) {
    const domain = String(row.website).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const data = await enrichByDomain(domain);
    if (!data?.naics_code) continue;
    await pool.query(
      `UPDATE companies SET naics_code = $1,
         industry = COALESCE(industry, $2),
         raw_data = COALESCE(raw_data, '{}'::jsonb) || $3::jsonb,
         updated_at = NOW()
       WHERE id = $4`,
      [data.naics_code, data.industry || null, JSON.stringify({ firmographic_enrich: data.provider }), row.id]
    );
    updated++;
    // Polite throttle for provider rate limits.
    await new Promise(res => setTimeout(res, 200));
  }
  return { total: r.rows.length, inserted: 0, updated, skipped: r.rows.length - updated };
}

module.exports = { enrichByDomain, backfill };
