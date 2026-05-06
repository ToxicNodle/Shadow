/**
 * WrapLeads — FMCSA API Carrier Ingest
 * -------------------------------------
 * Fetches active carriers state-by-state from the FMCSA QC REST API.
 * No CSV download needed — runs entirely over HTTP in a few minutes.
 *
 * Free API key (instant):
 *   https://ask.fmcsa.dot.gov/app/answers/detail/a_id/4455
 *   Add to Railway env as FMCSA_API_KEY=your_key_here
 *
 * Usage:
 *   node ingest-fmcsa.js
 *   node ingest-fmcsa.js --states IN,OH,IL,MI,KY,TN
 *   node ingest-fmcsa.js --states TX --min-fleet 10 --max-fleet 500
 *
 * Defaults to 10 core Midwest states. Idempotent — safe to re-run.
 */

require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API_KEY      = process.env.FMCSA_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';
const BASE_URL     = 'https://mobile.fmcsa.dot.gov/qc/services';
const PAGE_SIZE    = 100;   // FMCSA max
const BATCH_SIZE   = 200;   // DB upsert batch
const REQUEST_GAP  = 120;   // ms between API calls (stay polite)

const DEFAULT_STATES = ['IN','OH','IL','MI','KY','TN','WI','MO','MN','IA'];

// ---------------------------------------------------------------------------
// CLI args  --states A,B  --min-fleet N  --max-fleet N
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}
const TARGET_STATES = getArg('--states', DEFAULT_STATES.join(',')).split(',').map(s => s.trim().toUpperCase());
const MIN_FLEET     = parseInt(getArg('--min-fleet', '1'), 10);
const MAX_FLEET     = parseInt(getArg('--max-fleet', '9999'), 10);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanPhone(s) {
  if (!s) return null;
  const d = String(s).replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') {
    const e = d.slice(1);
    return `${e.slice(0,3)}-${e.slice(3,6)}-${e.slice(6)}`;
  }
  return d.length >= 7 ? d : null;
}

function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' } }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Timeout')); });
  });
}

// Fetch one page of carriers for a state. Returns { carriers[], hasMore }.
async function fetchPage(state, start) {
  const url = `${BASE_URL}/carriers?state=${state}&start=${start}&size=${PAGE_SIZE}&webKey=${API_KEY}`;
  const data = await get(url);
  const content = data?.content;
  if (!content) return { carriers: [], hasMore: false };

  // API returns array or single object depending on result count
  let raw = content.carrier || [];
  if (!Array.isArray(raw)) raw = [raw];

  return { carriers: raw, hasMore: raw.length === PAGE_SIZE };
}

function mapCarrier(c) {
  return {
    source:            'fmcsa',
    source_id:         String(c.dotNumber || '').trim(),
    name:              String(c.legalName || c.name || '').trim(),
    dba_name:          c.dbaName || null,
    street:            c.phyStreet || null,
    city:              c.phyCity || null,
    state:             c.phyState ? String(c.phyState).toUpperCase().slice(0, 2) : null,
    zip:               c.phyZipcode || null,
    country:           c.phyCountry || 'US',
    phone:             cleanPhone(c.telephone),
    email:             c.emailAddress || null,
    fleet_size:        parseInt(c.powerUnits || c.totalPowerUnits || '0', 10) || null,
    drivers:           parseInt(c.driverTotal || '0', 10) || null,
    cargo_types:       c.cargoCarried || null,
    last_reported:     parseDate(c.mcs150Date),
    added_to_registry: parseDate(c.addDate),
    raw_data:          c,
  };
}

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------
async function flushBatch(pool, batch) {
  const cols = [
    'source','source_id','name','dba_name','street','city','state','zip','country',
    'phone','email','fleet_size','drivers','cargo_types','last_reported','added_to_registry','raw_data',
  ];
  const values = [];
  const placeholders = batch.map((row, i) => {
    const offset = i * cols.length;
    cols.forEach(c => values.push(c === 'raw_data' ? JSON.stringify(row[c]) : row[c]));
    return '(' + cols.map((_, j) => `$${offset + j + 1}`).join(',') + ')';
  });

  const sql = `
    INSERT INTO companies (${cols.join(',')})
    VALUES ${placeholders.join(',')}
    ON CONFLICT (source, source_id) DO UPDATE SET
      name              = EXCLUDED.name,
      dba_name          = EXCLUDED.dba_name,
      street            = EXCLUDED.street,
      city              = EXCLUDED.city,
      state             = EXCLUDED.state,
      zip               = EXCLUDED.zip,
      phone             = EXCLUDED.phone,
      email             = EXCLUDED.email,
      fleet_size        = EXCLUDED.fleet_size,
      drivers           = EXCLUDED.drivers,
      cargo_types       = EXCLUDED.cargo_types,
      last_reported     = EXCLUDED.last_reported,
      added_to_registry = EXCLUDED.added_to_registry,
      raw_data          = EXCLUDED.raw_data,
      updated_at        = NOW()
    RETURNING (xmax = 0) AS was_inserted
  `;

  const r = await pool.query(sql, values);
  let inserted = 0, updated = 0;
  for (const row of r.rows) { if (row.was_inserted) inserted++; else updated++; }
  return { inserted, updated };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!API_KEY) {
    console.error('\nFMCSA_API_KEY not set.');
    console.error('Get a free key in ~2 minutes:');
    console.error('  https://ask.fmcsa.dot.gov/app/answers/detail/a_id/4455\n');
    console.error('Then add to Railway: Settings → Variables → FMCSA_API_KEY=your_key\n');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await pool.query('SELECT 1 FROM companies LIMIT 1');
  } catch {
    console.error('\nDatabase not ready — run schema.sql first:\n  psql $DATABASE_URL < schema.sql\n');
    process.exit(1);
  }

  console.log(`\nWrapLeads — FMCSA API Ingest`);
  console.log(`States : ${TARGET_STATES.join(', ')}`);
  console.log(`Fleet  : ${MIN_FLEET}–${MAX_FLEET} power units`);
  console.log(`─────────────────────────────────────\n`);

  const runRes = await pool.query(
    `INSERT INTO ingest_runs (source, file_name, started_at) VALUES ('fmcsa', $1, NOW()) RETURNING id`,
    [`api:${TARGET_STATES.join(',')}`]
  );
  const runId = runRes.rows[0].id;

  const start = Date.now();
  let totalFetched = 0, totalInserted = 0, totalUpdated = 0, totalSkipped = 0;
  let dbBatch = [];

  for (const state of TARGET_STATES) {
    let stateCount = 0;
    let pageStart = 1;
    process.stdout.write(`  ${state}  `);

    while (true) {
      let result;
      try {
        result = await fetchPage(state, pageStart);
      } catch (e) {
        process.stdout.write(` [error: ${e.message}]`);
        break;
      }

      for (const raw of result.carriers) {
        if (raw.statusCode && raw.statusCode !== 'A') { totalSkipped++; continue; }

        const c = mapCarrier(raw);
        if (!c.source_id || !c.name) { totalSkipped++; continue; }

        const fleet = c.fleet_size || 0;
        if (fleet < MIN_FLEET || fleet > MAX_FLEET) { totalSkipped++; continue; }

        dbBatch.push(c);
        stateCount++;
        totalFetched++;

        if (dbBatch.length >= BATCH_SIZE) {
          const r = await flushBatch(pool, dbBatch);
          totalInserted += r.inserted;
          totalUpdated  += r.updated;
          dbBatch = [];
          process.stdout.write('.');
        }
      }

      if (!result.hasMore) break;
      pageStart += PAGE_SIZE;
      await sleep(REQUEST_GAP);
    }

    console.log(` ${stateCount.toLocaleString()} carriers`);
  }

  if (dbBatch.length) {
    const r = await flushBatch(pool, dbBatch);
    totalInserted += r.inserted;
    totalUpdated  += r.updated;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  await pool.query(
    `UPDATE ingest_runs SET finished_at = NOW(), rows_read = $1, rows_inserted = $2, rows_updated = $3, rows_skipped = $4 WHERE id = $5`,
    [totalFetched, totalInserted, totalUpdated, totalSkipped, runId]
  );

  console.log(`\n─────────────────────────────────────`);
  console.log(`Done in ${elapsed}s`);
  console.log(`  ${totalFetched.toLocaleString()} carriers fetched`);
  console.log(`  ${totalInserted.toLocaleString()} inserted  ${totalUpdated.toLocaleString()} updated  ${totalSkipped.toLocaleString()} skipped`);

  const stats = await pool.query(`
    SELECT
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE fleet_size BETWEEN 25 AND 500)::INT AS sweet_spot,
      COUNT(DISTINCT state)::INT AS states
    FROM companies WHERE source = 'fmcsa'
  `);
  const s = stats.rows[0];
  console.log(`\nDatabase now contains:`);
  console.log(`  ${s.total.toLocaleString()} total carriers across ${s.states} states`);
  console.log(`  ${s.sweet_spot.toLocaleString()} in the 25–500 truck wrap sweet spot\n`);

  await pool.end();
}

main().catch(e => { console.error('\n', e.message); process.exit(1); });
