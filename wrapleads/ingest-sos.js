/**
 * WrapLeads — State SOS Registry Ingest  (v0.3)
 * -----------------------------------------------
 * Ingests business entity CSV exports from Indiana and Ohio Secretary of State
 * portals into the companies table with source='sos_in' or 'sos_oh'.
 *
 * Where to get the files:
 *   Indiana: https://bsd.sos.in.gov/publicbusiness (search → export CSV)
 *            Filter by entity status "Active" and entity type "Domestic/Foreign LLC"
 *            or "For-Profit Corporation" to focus on real operating businesses.
 *   Ohio:    https://businesssearch.ohiosos.gov (search → export)
 *            Filter by agent state, entity type, and status "Active".
 *
 * Usage:
 *   node ingest-sos.js indiana path/to/indiana-sos.csv
 *   node ingest-sos.js ohio    path/to/ohio-sos.csv
 *
 * Column aliasing handles both export formats and catches variations across
 * portal versions.  The script is idempotent — re-running with the same file
 * updates existing rows by (source, source_id).
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { Pool }  = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';
const BATCH_SIZE   = 500;

// ----------------------------------------------------------------------------
// Column maps — each SOS portal uses different header names
// ----------------------------------------------------------------------------
const FIELD_MAPS = {
  sos_in: {
    // Indiana SOS CSV headers (as of 2024 portal export)
    source_id:  ['Entity Number', 'ENTITY_NUMBER', 'BUSINESS_ID', 'ID'],
    name:       ['Entity Name', 'ENTITY_NAME', 'BUSINESS_NAME', 'NAME'],
    city:       ['Principal City', 'CITY', 'PRINCIPAL_CITY', 'BUSINESS_CITY'],
    state:      ['Principal State', 'STATE', 'PRINCIPAL_STATE', 'BUSINESS_STATE'],
    zip:        ['Principal Zip', 'ZIP', 'PRINCIPAL_ZIP', 'BUSINESS_ZIP'],
    street:     ['Principal Address', 'ADDRESS', 'PRINCIPAL_ADDRESS', 'BUSINESS_ADDRESS'],
    status:     ['Status', 'ENTITY_STATUS', 'BUSINESS_STATUS'],
    type:       ['Entity Type', 'ENTITY_TYPE', 'BUSINESS_TYPE'],
    formed:     ['Formation Date', 'FORMATION_DATE', 'FORMED_DATE', 'DATE_FORMED'],
  },
  sos_oh: {
    // Ohio SOS CSV headers
    source_id:  ['Charter Number', 'CHARTER_NUMBER', 'CHARTER_NO', 'ID'],
    name:       ['Name', 'ENTITY_NAME', 'BUSINESS_NAME', 'COMPANY_NAME'],
    city:       ['City', 'CITY', 'AGENT_CITY'],
    state:      ['State', 'STATE', 'AGENT_STATE'],
    zip:        ['Zip', 'ZIP', 'AGENT_ZIP'],
    street:     ['Address', 'ADDRESS', 'AGENT_ADDRESS'],
    status:     ['Status', 'ENTITY_STATUS', 'STATUS'],
    type:       ['Type', 'ENTITY_TYPE', 'COMPANY_TYPE'],
    formed:     ['Filing Date', 'FILING_DATE', 'DATE_FILED', 'FORMED'],
  },
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function pickField(row, keys) {
  // Normalise header keys by trimming whitespace and collapsing spaces
  const normRow = {};
  for (const [k, v] of Object.entries(row)) {
    normRow[k.trim()] = v;
  }
  for (const k of keys) {
    if (normRow[k] !== undefined && normRow[k] !== '') return String(normRow[k]).trim();
  }
  return null;
}

function parseSosDate(s) {
  if (!s) return null;
  s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
    const [m, d, y] = s.split('-');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function progressBar(label, current, total) {
  const pct    = total ? Math.min(100, Math.floor((current / total) * 100)) : 0;
  const filled = Math.floor(pct / 2);
  const bar    = '█'.repeat(filled) + '░'.repeat(50 - filled);
  return `${label} [${bar}] ${pct}%`;
}

function pluralize(n, s, p) {
  return n === 1 ? `${n} ${s}` : `${n.toLocaleString()} ${p}`;
}

// ----------------------------------------------------------------------------
// Batch insert / update
// ----------------------------------------------------------------------------
async function flushBatch(pool, batch) {
  const cols = [
    'source','source_id','name','street','city','state','zip','country',
    'industry','added_to_registry','raw_data',
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
      name             = EXCLUDED.name,
      street           = EXCLUDED.street,
      city             = EXCLUDED.city,
      state            = EXCLUDED.state,
      zip              = EXCLUDED.zip,
      industry         = EXCLUDED.industry,
      added_to_registry = EXCLUDED.added_to_registry,
      raw_data         = EXCLUDED.raw_data,
      updated_at       = NOW()
    RETURNING (xmax = 0) AS was_inserted
  `;

  const r = await pool.query(sql, values);
  let inserted = 0, updated = 0;
  for (const row of r.rows) {
    if (row.was_inserted) inserted++; else updated++;
  }
  return { inserted, updated };
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  const stateArg = (process.argv[2] || '').toLowerCase();
  const csvPath  = process.argv[3];

  const SOURCE_MAP = { indiana: 'sos_in', ohio: 'sos_oh', in: 'sos_in', oh: 'sos_oh' };
  const source = SOURCE_MAP[stateArg];

  if (!source || !csvPath) {
    console.error('Usage: node ingest-sos.js <indiana|ohio> <path-to-csv>');
    console.error('');
    console.error('Get Indiana data: https://bsd.sos.in.gov/publicbusiness');
    console.error('Get Ohio data:    https://businesssearch.ohiosos.gov');
    process.exit(1);
  }

  const absPath = path.resolve(csvPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const fields   = FIELD_MAPS[source];
  const fileSize = fs.statSync(absPath).size;
  const label    = source === 'sos_in' ? 'Indiana SOS' : 'Ohio SOS';

  console.log(`\n📋 WrapLeads — ${label} Ingest`);
  console.log(`   File: ${absPath}`);
  console.log(`   Size: ${(fileSize / 1024 / 1024).toFixed(1)} MB\n`);

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await pool.query('SELECT 1 FROM companies LIMIT 1');
  } catch {
    console.error('❌ Database not ready. Run: docker compose up -d');
    process.exit(1);
  }

  const runRes = await pool.query(
    `INSERT INTO ingest_runs (source, file_name, started_at) VALUES ($1, $2, NOW()) RETURNING id`,
    [source, path.basename(absPath)]
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
    columns: header => header.map(h => String(h).trim()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
  }));

  try {
    for await (const row of parser) {
      total++;

      const source_id = pickField(row, fields.source_id);
      const name      = pickField(row, fields.name);
      if (!source_id || !name) { skipped++; continue; }

      // Skip inactive entities
      const status = pickField(row, fields.status) || '';
      if (status && !/active/i.test(status)) { skipped++; continue; }

      batch.push({
        source,
        source_id,
        name,
        street:           pickField(row, fields.street),
        city:             pickField(row, fields.city),
        state:            source === 'sos_in' ? 'IN' : 'OH',
        zip:              pickField(row, fields.zip),
        country:          'US',
        industry:         'general',                  // no fleet data in SOS
        added_to_registry: parseSosDate(pickField(row, fields.formed)),
        raw_data:         row,
      });

      if (batch.length >= BATCH_SIZE) {
        const r = await flushBatch(pool, batch);
        inserted += r.inserted;
        updated  += r.updated;
        batch = [];
      }

      if (Date.now() - lastLog > 1000) {
        const elapsed = (Date.now() - start) / 1000;
        const rate    = Math.round(total / elapsed);
        process.stdout.write(`\r${progressBar('Reading', bytesRead, fileSize)}  ${total.toLocaleString()} rows  ${rate}/s     `);
        lastLog = Date.now();
      }
    }

    if (batch.length) {
      const r = await flushBatch(pool, batch);
      inserted += r.inserted;
      updated  += r.updated;
    }

    const elapsed = (Date.now() - start) / 1000;
    await pool.query(
      `UPDATE ingest_runs SET finished_at = NOW(), rows_read = $1, rows_inserted = $2,
       rows_updated = $3, rows_skipped = $4 WHERE id = $5`,
      [total, inserted, updated, skipped, runId]
    );

    process.stdout.write('\r' + ' '.repeat(120) + '\r');
    console.log(`✓ Done in ${elapsed.toFixed(1)}s\n`);
    console.log(`   ${pluralize(total, 'row', 'rows')} read`);
    console.log(`   ${pluralize(inserted, 'new business', 'new businesses')} inserted`);
    console.log(`   ${pluralize(updated, 'existing business', 'existing businesses')} updated`);
    console.log(`   ${pluralize(skipped, 'row', 'rows')} skipped (missing ID, name, or inactive)\n`);

    const stats = await pool.query(
      `SELECT COUNT(*)::INT AS total FROM companies WHERE source = $1`, [source]
    );
    console.log(`📊 Database now contains ${stats.rows[0].total.toLocaleString()} ${label} businesses.\n`);
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
