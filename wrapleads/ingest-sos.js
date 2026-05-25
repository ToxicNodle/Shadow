/**
 * WrapLeads — State SOS Registry Ingest  (v0.4)
 * -----------------------------------------------
 * Ingests business entity CSV exports from six Midwest/South Secretary of State
 * portals into the companies table.
 *
 * Where to get the files:
 *   Indiana:   https://bsd.sos.in.gov/publicbusiness (search → export CSV)
 *   Ohio:      https://businesssearch.ohiosos.gov (search → export)
 *   Illinois:  https://www.ilsos.gov/data/bus_corp_data.html (free bulk BCA download)
 *   Michigan:  https://cofs.lara.state.mi.us/CorpWeb/CorpSearch/CorpSearch.aspx (bulk data)
 *   Kentucky:  https://apps.sos.ky.gov/business/obdb/
 *   Tennessee: https://tnbear.tn.gov/ECommerce/FilingSearch.aspx (bulk data download)
 *
 * Usage:
 *   node ingest-sos.js indiana    path/to/indiana-sos.csv
 *   node ingest-sos.js ohio       path/to/ohio-sos.csv
 *   node ingest-sos.js illinois   path/to/illinois-sos.csv
 *   node ingest-sos.js michigan   path/to/michigan-sos.csv
 *   node ingest-sos.js kentucky   path/to/kentucky-sos.csv
 *   node ingest-sos.js tennessee  path/to/tennessee-sos.csv
 *
 * Column aliasing handles portal-specific CSV formats and catches header
 * variations across portal versions.  The script is idempotent — re-running
 * with the same file updates existing rows by (source, source_id).
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
    // https://bsd.sos.in.gov/publicbusiness → search → export CSV
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
    // https://businesssearch.ohiosos.gov → search → export CSV
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
  sos_il: {
    // Illinois SOS CSV headers
    // https://www.ilsos.gov/data/bus_corp_data.html → BCA downloads (free bulk)
    source_id:  ['FILE NUMBER', 'File Number', 'FILE_NUMBER', 'ID'],
    name:       ['CORPORATION NAME', 'Corporation Name', 'ENTITY_NAME', 'NAME'],
    city:       ['CITY', 'City', 'PRINCIPAL_CITY'],
    state:      ['STATE', 'State', 'PRINCIPAL_STATE'],
    zip:        ['ZIP CODE', 'Zip Code', 'ZIP'],
    street:     ['ADDRESS 1', 'Address 1', 'STREET', 'ADDRESS'],
    status:     ['STATUS', 'Status', 'ENTITY_STATUS'],
    type:       ['CORP TYPE', 'Corp Type', 'ENTITY_TYPE'],
    formed:     ['DATE INCORPORATED', 'Date Incorporated', 'INCORPORATION_DATE', 'FORMED'],
  },
  sos_mi: {
    // Michigan SOS / LARA CSV headers
    // https://cofs.lara.state.mi.us/CorpWeb/CorpSearch/CorpSearch.aspx → bulk data
    source_id:  ['ID Number', 'ID_NUMBER', 'CORP_ID', 'CID'],
    name:       ['Name', 'ENTITY_NAME', 'CORP_NAME', 'CORPORATION_NAME'],
    city:       ['City', 'CITY', 'REGISTERED_CITY'],
    state:      ['State', 'STATE', 'REGISTERED_STATE'],
    zip:        ['Zip', 'ZIP', 'REGISTERED_ZIP'],
    street:     ['Street', 'STREET', 'ADDRESS'],
    status:     ['Status', 'STATUS', 'ENTITY_STATUS'],
    type:       ['Type', 'TYPE', 'ENTITY_TYPE'],
    formed:     ['Date Filed', 'DATE_FILED', 'FILING_DATE', 'FORMED'],
  },
  sos_ky: {
    // Kentucky SOS CSV headers
    // https://apps.sos.ky.gov/business/obdb/
    source_id:  ['Organization Number', 'ORGANIZATION_NUMBER', 'ORG_NUMBER', 'ID'],
    name:       ['Organization Name', 'ORGANIZATION_NAME', 'ENTITY_NAME', 'NAME'],
    city:       ['Principal City', 'CITY', 'PRINCIPAL_CITY'],
    state:      ['Principal State', 'STATE', 'PRINCIPAL_STATE'],
    zip:        ['Principal Zip', 'ZIP', 'PRINCIPAL_ZIP'],
    street:     ['Principal Address', 'ADDRESS', 'PRINCIPAL_ADDRESS'],
    status:     ['Status', 'STATUS', 'ENTITY_STATUS'],
    type:       ['Organization Type', 'ORGANIZATION_TYPE', 'ENTITY_TYPE'],
    formed:     ['Organization Date', 'ORGANIZATION_DATE', 'DATE_FORMED', 'FORMED'],
  },
  sos_tn: {
    // Tennessee SOS CSV headers
    // https://tnbear.tn.gov/ECommerce/FilingSearch.aspx → bulk data download
    source_id:  ['Control Number', 'CONTROL_NUMBER', 'SOS_ID', 'ID'],
    name:       ['Name', 'ENTITY_NAME', 'BUSINESS_NAME', 'FILING_NAME'],
    city:       ['Principal City', 'CITY', 'PRINCIPAL_OFFICE_CITY'],
    state:      ['Principal State', 'STATE', 'PRINCIPAL_OFFICE_STATE'],
    zip:        ['Principal Zip', 'ZIP', 'PRINCIPAL_OFFICE_ZIP'],
    street:     ['Principal Street', 'STREET', 'ADDRESS'],
    status:     ['Status', 'STATUS', 'ENTITY_STATUS'],
    type:       ['Business Type', 'BUSINESS_TYPE', 'ENTITY_TYPE'],
    formed:     ['Formation Date', 'FORMATION_DATE', 'DATE_FORMED', 'FORMED'],
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

function classifySosIndustry(name) {
  const n = (name || '').toUpperCase();
  if (/CONSTRUCTION|CONTRACTING|CONTRACTOR|BUILDERS|BUILDER|ROOFING|MECHANICAL|ELECTRICAL|PLUMBING|HVAC/.test(n))
    return 'construction_general';
  if (/DESIGN|ARCHITECT|INTERIOR|STUDIO|CREATIVE/.test(n))
    return 'design_general';
  if (/TRANSPORT|TRUCKING|HAULING|LOGISTICS|FREIGHT|COURIER|DELIVERY/.test(n))
    return 'trucking_general';
  return 'general';
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

  const SOURCE_MAP = {
    indiana:   'sos_in',  in:  'sos_in',
    ohio:      'sos_oh',  oh:  'sos_oh',
    illinois:  'sos_il',  il:  'sos_il',
    michigan:  'sos_mi',  mi:  'sos_mi',
    kentucky:  'sos_ky',  ky:  'sos_ky',
    tennessee: 'sos_tn',  tn:  'sos_tn',
  };
  const source = SOURCE_MAP[stateArg];

  if (!source || !csvPath) {
    console.error('Usage: node ingest-sos.js <state> <path-to-csv>');
    console.error('');
    console.error('Supported states:');
    console.error('  indiana    https://bsd.sos.in.gov/publicbusiness');
    console.error('  ohio       https://businesssearch.ohiosos.gov');
    console.error('  illinois   https://www.ilsos.gov/data/bus_corp_data.html');
    console.error('  michigan   https://cofs.lara.state.mi.us/CorpWeb/CorpSearch/CorpSearch.aspx');
    console.error('  kentucky   https://apps.sos.ky.gov/business/obdb/');
    console.error('  tennessee  https://tnbear.tn.gov/ECommerce/FilingSearch.aspx');
    process.exit(1);
  }

  const absPath = path.resolve(csvPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const fields   = FIELD_MAPS[source];
  const fileSize = fs.statSync(absPath).size;
  const STATE_LABELS = {
    sos_in: 'Indiana SOS',   sos_oh: 'Ohio SOS',
    sos_il: 'Illinois SOS',  sos_mi: 'Michigan SOS',
    sos_ky: 'Kentucky SOS',  sos_tn: 'Tennessee SOS',
  };
  const STATE_ABBR = {
    sos_in: 'IN', sos_oh: 'OH', sos_il: 'IL',
    sos_mi: 'MI', sos_ky: 'KY', sos_tn: 'TN',
  };
  const label     = STATE_LABELS[source];
  const stateAbbr = STATE_ABBR[source];

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
        state:            pickField(row, fields.state) || stateAbbr,
        zip:              pickField(row, fields.zip),
        country:          'US',
        industry:         classifySosIndustry(name),
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
