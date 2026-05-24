/**
 * WrapLeads — Commercial Building Ingest (Solar Scout)
 * ----------------------------------------------------
 *
 * Unified entry point for all commercial-property scrapers. Routes to the
 * right adapter and writes a single ingest_runs row.
 *
 * Examples:
 *   npm run ingest:commercial -- --source=places  --region="Phoenix, AZ"
 *   npm run ingest:commercial -- --source=osm     --region="bbox:33.3,-112.3,33.7,-111.9"
 *   npm run ingest:commercial -- --source=csv     --file=./loopnet-export.csv
 *   npm run ingest:commercial -- --source=permits --city=la --days=60
 *   npm run ingest:commercial -- --source=utility --limit=200
 *   npm run ingest:commercial -- --source=assessor --county=maricopa-az
 *
 * After a successful run you can verify via:
 *   psql -c "SELECT source, COUNT(*) FROM companies GROUP BY source ORDER BY 2 DESC;"
 */

'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';

const ADAPTERS = {
  places:   () => require('./lib/scrapers/places-commercial'),
  osm:      () => require('./lib/scrapers/osm-overpass'),
  csv:      () => require('./lib/scrapers/csv-commercial'),
  permits:  () => require('./lib/scrapers/permit-feeds'),
  utility:  () => require('./lib/scrapers/utility-rate'),
  assessor: () => require('./lib/scrapers/assessor-scrape'),
  intent:   () => require('./lib/scrapers/intent-signals'),
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    source: '',
    region: '',
    file: '',
    city: 'all',
    county: 'maricopa-az',
    days: 90,
    limit: 200,
    radius: 80000,
    maxPerQuery: 60,
    queries: null,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--source='))     out.source = arg.slice(9);
    else if (arg === '--source')         out.source = args[++i] || '';
    else if (arg.startsWith('--region=')) out.region = arg.slice(9);
    else if (arg === '--region')         out.region = args[++i] || '';
    else if (arg.startsWith('--file='))   out.file   = arg.slice(7);
    else if (arg === '--file')           out.file   = args[++i] || '';
    else if (arg.startsWith('--city='))   out.city   = arg.slice(7);
    else if (arg === '--city')           out.city   = args[++i] || 'all';
    else if (arg.startsWith('--county='))   out.county = arg.slice(9);
    else if (arg === '--county')         out.county = args[++i] || '';
    else if (arg.startsWith('--days='))   out.days   = parseInt(arg.slice(7), 10);
    else if (arg === '--days')           out.days   = parseInt(args[++i], 10);
    else if (arg.startsWith('--limit='))  out.limit  = parseInt(arg.slice(8), 10);
    else if (arg === '--limit')          out.limit  = parseInt(args[++i], 10);
    else if (arg.startsWith('--radius=')) out.radius = parseInt(arg.slice(9), 10);
    else if (arg === '--radius')         out.radius = parseInt(args[++i], 10);
    else if (arg.startsWith('--max='))    out.maxPerQuery = parseInt(arg.slice(6), 10);
    else if (arg === '--max')            out.maxPerQuery = parseInt(args[++i], 10);
    else if (arg.startsWith('--queries=')) out.queries = arg.slice(10).split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--queries')        out.queries = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
  }
  return out;
}

async function main() {
  const args = parseArgs();
  if (!args.source || !ADAPTERS[args.source]) {
    console.error(`\n❌ --source is required. One of: ${Object.keys(ADAPTERS).join(', ')}\n`);
    console.error('Examples:');
    console.error('  --source=places  --region="Phoenix, AZ"');
    console.error('  --source=osm     --region="bbox:33.3,-112.3,33.7,-111.9"');
    console.error('  --source=csv     --file=./loopnet-export.csv');
    console.error('  --source=permits --city=la --days=60');
    console.error('  --source=utility --limit=200');
    console.error('  --source=assessor --county=maricopa-az\n');
    process.exit(1);
  }

  console.log(`\n🏢 WrapLeads — Commercial Building Ingest (${args.source})\n`);
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await pool.query('SELECT 1 FROM companies LIMIT 1');
  } catch {
    console.error('❌ Database not ready. Run: npm run db:up\n');
    process.exit(1);
  }

  const runRes = await pool.query(
    `INSERT INTO ingest_runs (source, file_name, started_at) VALUES ($1, $2, NOW()) RETURNING id`,
    [`commercial_${args.source}`, JSON.stringify({ region: args.region, file: args.file, city: args.city, county: args.county, days: args.days, limit: args.limit })]
  );
  const runId = runRes.rows[0].id;

  const start = Date.now();
  try {
    const adapter = ADAPTERS[args.source]();
    const result = await adapter.run({
      pool,
      region:      args.region,
      file:        args.file,
      city:        args.city,
      county:      args.county,
      days:        args.days,
      limit:       args.limit,
      radius:      args.radius,
      maxPerQuery: args.maxPerQuery,
      queries:     args.queries,
      log:         console.log,
    });

    const elapsed = (Date.now() - start) / 1000;
    await pool.query(
      `UPDATE ingest_runs SET finished_at = NOW(), rows_read = $1, rows_inserted = $2,
         rows_updated = $3, rows_skipped = $4 WHERE id = $5`,
      [result.total ?? 0, result.inserted ?? 0, result.updated ?? 0, result.skipped ?? 0, runId]
    );

    console.log(`\n✓ Done in ${elapsed.toFixed(1)}s`);
    console.log(`   ${(result.total ?? 0).toLocaleString()} records read`);
    console.log(`   ${(result.inserted ?? 0).toLocaleString()} new`);
    console.log(`   ${(result.updated ?? 0).toLocaleString()} updated`);
    console.log(`   ${(result.skipped ?? 0).toLocaleString()} skipped\n`);
    console.log(`   These appear in Solar Scout with solar-score computed live.\n`);
  } catch (e) {
    console.error('\n❌ Ingest failed:', e.message);
    await pool.query(
      `UPDATE ingest_runs SET finished_at = NOW(), notes = $1 WHERE id = $2`,
      [e.message, runId]
    );
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
