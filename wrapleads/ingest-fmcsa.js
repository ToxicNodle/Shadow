/**
 * WrapLeads — FMCSA Carrier Ingest (Socrata Open Data API)
 * ---------------------------------------------------------
 * Pulls active carriers from data.transportation.gov — no CSV download,
 * no API key required. Filters by state and fleet size at the source.
 *
 * Dataset: https://data.transportation.gov/api/v3/views/az4n-8mr2/query.csv
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
const DATABASE_URL  = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';
const SOCRATA_BASE  = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const PAGE_SIZE     = 50000;  // Socrata max per request
const BATCH_SIZE    = 500;    // DB upsert batch size
const REQUEST_GAP   = 200;    // ms between API calls

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
  s = String(s).trim().slice(0, 8); // handles "20231020 1657" → "20231020"
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function apiGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' } }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('Timeout')); });
  });
}

// Fetch one page of carriers for a state.
async function fetchPage(state, offset) {
  const where = encodeURIComponent(
    `phy_state='${state}' AND status_code='A' AND power_units >= ${MIN_FLEET} AND power_units <= ${MAX_FLEET}`
  );
  const url = `${SOCRATA_BASE}?$where=${where}&$limit=${PAGE_SIZE}&$offset=${offset}`;
  return apiGet(url); // returns array of row objects
}

function mapRow(r) {
  return {
    source:            'fmcsa',
    source_id:         String(r.dot_number || '').trim(),
    name:              String(r.legal_name || '').trim(),
    dba_name:          r.dba_name || null,
    street:            r.phy_street || null,
    city:              r.phy_city || null,
    state:             r.phy_state ? String(r.phy_state).toUpperCase().slice(0, 2) : null,
    zip:               r.phy_zip || null,
    country:           r.phy_country || 'US',
    phone:             cleanPhone(r.phone),
    email:             r.email_address || null,
    fleet_size:        parseInt(r.power_units || '0', 10) || null,
    drivers:           parseInt(r.total_drivers || '0', 10) || null,
    cargo_types:       r.classdef || null,
    last_reported:     parseDate(r.mcs150_date),
    added_to_registry: parseDate(r.add_date),
    raw_data:          r,
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
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await pool.query('SELECT 1 FROM companies LIMIT 1');
  } catch {
    console.error('\nDatabase not ready — run schema.sql first:\n  psql $DATABASE_URL < schema.sql\n');
    process.exit(1);
  }

  console.log(`\nWrapLeads — FMCSA Ingest (data.transportation.gov)`);
  console.log(`States : ${TARGET_STATES.join(', ')}`);
  console.log(`Fleet  : ${MIN_FLEET}–${MAX_FLEET} power units`);
  console.log(`─────────────────────────────────────────────────\n`);

  const runRes = await pool.query(
    `INSERT INTO ingest_runs (source, file_name, started_at) VALUES ('fmcsa', $1, NOW()) RETURNING id`,
    [`socrata:${TARGET_STATES.join(',')}`]
  );
  const runId = runRes.rows[0].id;

  const start    = Date.now();
  let totalIn = 0, totalUp = 0, totalSkip = 0, totalFetch = 0;
  let dbBatch = [];

  for (const state of TARGET_STATES) {
    let stateCount = 0;
    let offset     = 0;
    process.stdout.write(`  ${state}  `);

    while (true) {
      let rows;
      try {
        rows = await fetchPage(state, offset);
      } catch (e) {
        process.stdout.write(` [error: ${e.message}]`);
        break;
      }

      for (const raw of rows) {
        const c = mapRow(raw);
        if (!c.source_id || !c.name) { totalSkip++; continue; }
        dbBatch.push(c);
        stateCount++;
        totalFetch++;

        if (dbBatch.length >= BATCH_SIZE) {
          const r = await flushBatch(pool, dbBatch);
          totalIn  += r.inserted;
          totalUp  += r.updated;
          dbBatch   = [];
          process.stdout.write('.');
        }
      }

      if (rows.length < PAGE_SIZE) break; // last page
      offset += PAGE_SIZE;
      await sleep(REQUEST_GAP);
    }

    console.log(` ${stateCount.toLocaleString()} carriers`);
  }

  if (dbBatch.length) {
    const r = await flushBatch(pool, dbBatch);
    totalIn += r.inserted;
    totalUp += r.updated;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  await pool.query(
    `UPDATE ingest_runs SET finished_at = NOW(), rows_read = $1, rows_inserted = $2, rows_updated = $3, rows_skipped = $4 WHERE id = $5`,
    [totalFetch, totalIn, totalUp, totalSkip, runId]
  );

  console.log(`\n─────────────────────────────────────────────────`);
  console.log(`Done in ${elapsed}s`);
  console.log(`  ${totalFetch.toLocaleString()} fetched  ·  ${totalIn.toLocaleString()} inserted  ·  ${totalUp.toLocaleString()} updated  ·  ${totalSkip.toLocaleString()} skipped`);

  const stats = await pool.query(`
    SELECT
      COUNT(*)::INT                                              AS total,
      COUNT(*) FILTER (WHERE fleet_size BETWEEN 25 AND 500)::INT AS sweet_spot,
      COUNT(DISTINCT state)::INT                                 AS states
    FROM companies WHERE source = 'fmcsa'
  `);
  const s = stats.rows[0];
  console.log(`\nDatabase now contains:`);
  console.log(`  ${s.total.toLocaleString()} total carriers across ${s.states} states`);
  console.log(`  ${s.sweet_spot.toLocaleString()} in the 25–500 truck wrap sweet spot\n`);

  await pool.end();
}

main().catch(e => { console.error('\n', e.message); process.exit(1); });
