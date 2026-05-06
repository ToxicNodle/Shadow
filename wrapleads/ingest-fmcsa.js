/**
 * WrapLeads — FMCSA Motor Carrier Census Ingest
 * --------------------------------------------
 * The FMCSA's Motor Carrier Census is a public dataset of every interstate
 * trucking company registered in the U.S. — name, address, phone, fleet size
 * (POWER UNITS), driver count, and more. Roughly 600,000 active carriers.
 *
 * Where to get the file:
 *   https://ai.fmcsa.dot.gov/SMS/Tools/Downloads.aspx
 *   Look for "Motor Carrier Census" or "SAFER snapshot" — pick the latest
 *   monthly file. Unzip if needed.
 *
 *   Alternative: https://catalog.data.gov/dataset?q=motor+carrier+census
 *
 * Usage:
 *   node ingest-fmcsa.js path/to/census.csv
 *
 * The script is idempotent — running it again with a newer file UPDATES the
 * existing rows by (source, source_id) where source_id = DOT number.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';
const BATCH_SIZE = 500;

// ----------------------------------------------------------------------------
// Field mapping
// FMCSA's column names have changed several times over the years. We accept
// any of these aliases for each logical field. The first non-empty match wins.
// ----------------------------------------------------------------------------
const FIELDS = {
  source_id:         ['DOT_NUMBER', 'USDOT_NUMBER', 'DOT', 'CARRIER_ID'],
  name:              ['LEGAL_NAME', 'CARRIER_NAME', 'NAME'],
  dba_name:          ['DBA_NAME', 'DBA'],
  street:            ['PHY_STREET', 'PHYSICAL_ADDRESS', 'PHY_ADDR'],
  city:              ['PHY_CITY', 'PHYSICAL_CITY'],
  state:             ['PHY_STATE', 'PHYSICAL_STATE', 'OIC_STATE'],
  zip:               ['PHY_ZIP', 'PHYSICAL_ZIP', 'PHY_ZIPCODE'],
  country:           ['PHY_COUNTRY', 'PHYSICAL_COUNTRY'],
  phone:             ['TELEPHONE', 'PHONE', 'TELEPHONE_NUMBER'],
  email:             ['EMAIL_ADDRESS', 'EMAIL', 'EMAIL_ADDR'],
  fleet_size:        ['NBR_POWER_UNIT', 'POWER_UNITS', 'POWERUNITS', 'PWRUNITS', 'TOTAL_POWER_UNITS'],
  drivers:           ['DRIVER_TOTAL', 'TOTAL_DRIVERS', 'DRIVERS', 'NBR_DRIVERS'],
  cargo_types:       ['CARGO_CARRIED', 'CARGO_CLASSIFICATIONS', 'CARGO'],
  last_reported:     ['MCS150_DATE', 'MCS_150_DATE', 'MCS150DATE'],
  added_to_registry: ['ADD_DATE', 'ADDED_DATE', 'DATE_ADDED'],
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function pickField(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim();
  }
  return null;
}

function parseFmcsaDate(s) {
  if (!s) return null;
  s = String(s).trim();
  // FMCSA uses YYYYMMDD, MM/DD/YYYY, or YYYY-MM-DD
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseIntOrNull(s) {
  if (s === null || s === undefined || s === '') return null;
  const n = parseInt(String(s).replace(/[^\d-]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function cleanPhone(s) {
  if (!s) return null;
  const digits = String(s).replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (digits.length === 10) return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1);
    return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  }
  return digits;
}

function pluralize(n, single, plural) {
  return n === 1 ? `${n} ${single}` : `${n.toLocaleString()} ${plural}`;
}

function progressBar(label, current, total) {
  const pct = total ? Math.min(100, Math.floor((current / total) * 100)) : 0;
  const filled = Math.floor(pct / 2);
  const bar = '█'.repeat(filled) + '░'.repeat(50 - filled);
  return `${label} [${bar}] ${pct}%`;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node ingest-fmcsa.js <path-to-csv>');
    console.error('');
    console.error('Get the file from: https://ai.fmcsa.dot.gov/SMS/Tools/Downloads.aspx');
    console.error('Look for "Motor Carrier Census" — pick the latest monthly snapshot.');
    process.exit(1);
  }

  const absPath = path.resolve(csvPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const fileSize = fs.statSync(absPath).size;
  console.log(`\n📋 WrapLeads — FMCSA Census Ingest`);
  console.log(`   File: ${absPath}`);
  console.log(`   Size: ${(fileSize / 1024 / 1024).toFixed(1)} MB\n`);

  const pool = new Pool({ connectionString: DATABASE_URL });

  // Verify schema is set up
  try {
    await pool.query('SELECT 1 FROM companies LIMIT 1');
  } catch (e) {
    console.error('❌ Database not ready. Make sure Postgres is running:');
    console.error('   docker compose up -d');
    console.error('   (Or apply schema.sql manually if not using Docker.)');
    process.exit(1);
  }

  // Start an ingest_runs row so we have a record of this import
  const runRes = await pool.query(
    `INSERT INTO ingest_runs (source, file_name, started_at) VALUES ('fmcsa', $1, NOW()) RETURNING id`,
    [path.basename(absPath)]
  );
  const runId = runRes.rows[0].id;

  const start = Date.now();
  let total = 0, inserted = 0, updated = 0, skipped = 0;
  let batch = [];
  let bytesRead = 0;
  let lastLog = Date.now();

  const stream = fs.createReadStream(absPath);
  stream.on('data', chunk => { bytesRead += chunk.length; });

  const parser = stream.pipe(parse({
    columns: header => header.map(h => String(h).trim().toUpperCase()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  }));

  try {
    for await (const row of parser) {
      total++;

      const source_id = pickField(row, FIELDS.source_id);
      const name = pickField(row, FIELDS.name);
      if (!source_id || !name) { skipped++; continue; }

      batch.push({
        source: 'fmcsa',
        source_id,
        name,
        dba_name: pickField(row, FIELDS.dba_name),
        street: pickField(row, FIELDS.street),
        city: pickField(row, FIELDS.city),
        state: (pickField(row, FIELDS.state) || '').toUpperCase().slice(0, 2) || null,
        zip: pickField(row, FIELDS.zip),
        country: pickField(row, FIELDS.country) || 'US',
        phone: cleanPhone(pickField(row, FIELDS.phone)),
        email: pickField(row, FIELDS.email),
        fleet_size: parseIntOrNull(pickField(row, FIELDS.fleet_size)),
        drivers: parseIntOrNull(pickField(row, FIELDS.drivers)),
        cargo_types: pickField(row, FIELDS.cargo_types),
        last_reported: parseFmcsaDate(pickField(row, FIELDS.last_reported)),
        added_to_registry: parseFmcsaDate(pickField(row, FIELDS.added_to_registry)),
        raw_data: row,
      });

      if (batch.length >= BATCH_SIZE) {
        const r = await flushBatch(pool, batch);
        inserted += r.inserted;
        updated += r.updated;
        batch = [];
      }

      // Throttle progress logs to once per second
      if (Date.now() - lastLog > 1000) {
        const elapsed = (Date.now() - start) / 1000;
        const rate = Math.round(total / elapsed);
        process.stdout.write(`\r${progressBar('Reading', bytesRead, fileSize)}  ${total.toLocaleString()} rows  ${rate}/s     `);
        lastLog = Date.now();
      }
    }

    if (batch.length) {
      const r = await flushBatch(pool, batch);
      inserted += r.inserted;
      updated += r.updated;
    }

    const elapsed = (Date.now() - start) / 1000;

    await pool.query(
      `UPDATE ingest_runs SET finished_at = NOW(), rows_read = $1, rows_inserted = $2, rows_updated = $3, rows_skipped = $4 WHERE id = $5`,
      [total, inserted, updated, skipped, runId]
    );

    process.stdout.write('\r' + ' '.repeat(120) + '\r');
    console.log(`✓ Done in ${elapsed.toFixed(1)}s\n`);
    console.log(`   ${pluralize(total, 'row', 'rows')} read`);
    console.log(`   ${pluralize(inserted, 'new carrier', 'new carriers')} inserted`);
    console.log(`   ${pluralize(updated, 'existing carrier', 'existing carriers')} updated`);
    console.log(`   ${pluralize(skipped, 'row', 'rows')} skipped (missing DOT or name)\n`);

    // Summary stats
    const stats = await pool.query(`
      SELECT
        COUNT(*)::INT AS total,
        COUNT(*) FILTER (WHERE fleet_size BETWEEN 25 AND 500)::INT AS sweet_spot,
        COUNT(DISTINCT state)::INT AS states
      FROM companies WHERE source = 'fmcsa'
    `);
    const s = stats.rows[0];
    console.log(`📊 Database now contains:`);
    console.log(`   ${s.total.toLocaleString()} total carriers across ${s.states} states/territories`);
    console.log(`   ${s.sweet_spot.toLocaleString()} in the 25-500 truck "wrap sweet spot"\n`);
  } catch (e) {
    console.error('\n❌ Ingest failed:', e.message);
    await pool.query(`UPDATE ingest_runs SET finished_at = NOW(), notes = $1 WHERE id = $2`, [e.message, runId]);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// ----------------------------------------------------------------------------
// Bulk insert with ON CONFLICT upsert. Returns { inserted, updated }.
// ----------------------------------------------------------------------------
async function flushBatch(pool, batch) {
  const cols = [
    'source','source_id','name','dba_name','street','city','state','zip','country',
    'phone','email','fleet_size','drivers','cargo_types','last_reported','added_to_registry','raw_data'
  ];
  const values = [];
  const placeholders = batch.map((row, i) => {
    const offset = i * cols.length;
    cols.forEach((c) => values.push(c === 'raw_data' ? JSON.stringify(row[c]) : row[c]));
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
  for (const row of r.rows) {
    if (row.was_inserted) inserted++; else updated++;
  }
  return { inserted, updated };
}

main().catch(e => { console.error(e); process.exit(1); });
