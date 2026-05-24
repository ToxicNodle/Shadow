/**
 * NREL Utility Rates enrichment.
 *
 * Hits NREL's free Utility Rates API to resolve the commercial electric rate
 * ($/kWh) and utility name for a given lat/lng. Used downstream by the solar
 * production estimator to compute dollar savings without per-utility plugins.
 *
 * https://developer.nrel.gov/docs/electricity/utility-rates-v3/
 *
 * Falls back to a hard-coded US average ($0.13/kWh commercial) if no key is
 * set so the rest of the pipeline still works in dev environments.
 */

'use strict';

const NREL_KEY = process.env.NREL_API_KEY || '';
const RATES_URL = 'https://developer.nrel.gov/api/utility_rates/v3.json';
const DEFAULT_COMMERCIAL_RATE = 0.13;

async function lookupRate(lat, lng) {
  if (!NREL_KEY) {
    return { utility: null, commercial_rate: DEFAULT_COMMERCIAL_RATE, source: 'default' };
  }
  try {
    const url = `${RATES_URL}?api_key=${NREL_KEY}&lat=${lat}&lon=${lng}`;
    const r = await fetch(url);
    if (!r.ok) return { utility: null, commercial_rate: DEFAULT_COMMERCIAL_RATE, source: 'default' };
    const d = await r.json();
    return {
      utility: d.outputs?.utility_name || null,
      commercial_rate: Number(d.outputs?.commercial) || DEFAULT_COMMERCIAL_RATE,
      residential_rate: Number(d.outputs?.residential) || null,
      industrial_rate: Number(d.outputs?.industrial) || null,
      source: 'nrel',
    };
  } catch {
    return { utility: null, commercial_rate: DEFAULT_COMMERCIAL_RATE, source: 'default' };
  }
}

// Backfill utility_provider for companies that have lat/lng but no utility.
async function run({ pool, limit = 200, log = console.log }) {
  const { rows } = await pool.query(`
    SELECT id, latitude, longitude
    FROM companies
    WHERE source LIKE 'google_places_solar' OR source = 'osm_industrial'
       OR source LIKE 'commercial_csv_%' OR source = 'permit_feed'
    AND latitude IS NOT NULL AND longitude IS NOT NULL
    AND utility_provider IS NULL
    LIMIT $1
  `, [limit]);

  log(`   Resolving utility for ${rows.length} companies…`);
  let updated = 0;
  for (const row of rows) {
    const rate = await lookupRate(row.latitude, row.longitude);
    if (rate.utility || rate.commercial_rate) {
      await pool.query(
        `UPDATE companies SET utility_provider = COALESCE($1, utility_provider),
           raw_data = COALESCE(raw_data, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
         WHERE id = $3`,
        [rate.utility, JSON.stringify({ nrel_rate: rate }), row.id]
      );
      updated++;
    }
    // Respect NREL rate limits — 1000/hour, 30k/day. 100ms is comfortable.
    await new Promise(res => setTimeout(res, 100));
  }
  return { total: rows.length, inserted: 0, updated, skipped: rows.length - updated };
}

module.exports = { run, lookupRate, DEFAULT_COMMERCIAL_RATE };
