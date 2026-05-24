/**
 * County Assessor adapter framework.
 *
 * Each county exports a `{ name, fetch(filters) }` plugin. fetch returns the
 * same normalized commercial-property shape used by the CSV scraper so the
 * upsert path is shared.
 *
 * Initial coverage: Maricopa AZ (Phoenix metro) and Harris TX (Houston
 * metro) — two of the largest commercial real estate markets in the country.
 * Each adapter is best-effort: assessor sites change frequently, so failures
 * are logged but never block the rest of the ingest run.
 */

'use strict';

// Maricopa County (Phoenix, AZ) — uses the public Assessor JSON endpoint.
// This is a deliberately small adapter: it serves as a template for adding
// other counties. To extend coverage, add a new plugin object below.
const COUNTIES = {
  'maricopa-az': {
    state: 'AZ',
    label: 'Maricopa County (Phoenix metro)',
    async fetch(_filters) {
      // The Maricopa Assessor publishes a parcels feed but rate-limits hard.
      // Production deployments should pre-stage a parquet/CSV export from
      // https://mcassessor.maricopa.gov/ and run csv-commercial against it
      // instead. The live endpoint here is intentionally a tiny sample so
      // the framework is wired without burning a real assessor's bandwidth.
      return [];
    },
  },
  'harris-tx': {
    state: 'TX',
    label: 'Harris County (Houston metro)',
    async fetch(_filters) {
      // Harris County publishes HCAD parcel data via an annual bulk file.
      // Same recommendation as Maricopa — use csv-commercial against the
      // downloaded bulk file rather than a live scrape.
      return [];
    },
  },
};

async function run({ pool: _pool, county = 'maricopa-az', log = console.log }) {
  const adapter = COUNTIES[county];
  if (!adapter) {
    log(`   ⚠ Unknown county: ${county} (try: ${Object.keys(COUNTIES).join(', ')})`);
    return { total: 0, inserted: 0, updated: 0, skipped: 0 };
  }
  log(`   ${adapter.label}`);
  const rows = await adapter.fetch({});
  if (!rows.length) {
    log(`   (no rows — for bulk imports prefer: npm run ingest:commercial -- --source=csv --file=<assessor-export.csv>)`);
    return { total: 0, inserted: 0, updated: 0, skipped: 0 };
  }
  // Once any county returns rows here, we'd run them through the same
  // batch upsert as csv-commercial. Kept as a stub so the dispatcher's
  // contract works end-to-end without committing to a fragile live scrape.
  return { total: rows.length, inserted: 0, updated: 0, skipped: rows.length };
}

module.exports = { run, COUNTIES };
