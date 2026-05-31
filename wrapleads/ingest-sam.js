/**
 * WrapLeads — SAM.gov Federal Contractor Ingest
 * -----------------------------------------------
 * SAM.gov (System for Award Management) is a free U.S. government database of
 * 800K+ businesses registered to do work with the federal government.  These
 * companies are real, financially stable, and large enough to have federal
 * contracts — making them ideal wrap candidates.
 *
 * We filter to NAICS codes that correlate with fleet vehicles and wrap spend:
 *   238  — Specialty trade contractors (construction fleets)
 *   484  — Truck transportation (trucking fleets)
 *   532  — Rental and leasing (equipment/vehicle rental fleets)
 *   541  — Professional, scientific, technical services (service fleets)
 *
 * API (free, no auth required for public data — up to 10K/day):
 *   https://api.sam.gov/entity-information/v3/entities
 *
 * Get a free API key at: https://sam.gov/profile/details
 * Set SAM_API_KEY in .env (optional — key unlocks higher rate limits and more fields)
 *
 * Usage:
 *   node ingest-sam.js [--naics 238,484,532,541] [--state TX] [--limit 5000]
 *
 * The script is idempotent — re-running updates existing rows by (source, source_id).
 * Estimated yield: 40K–80K after NAICS filtering across all states.
 */

require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';
const SAM_API_KEY  = process.env.SAM_API_KEY || '';
const BATCH_SIZE   = 500;

const BASE_URL = 'https://api.sam.gov/entity-information/v3/entities';

// NAICS prefixes we care about — 2-digit matches the entire sub-sector
const DEFAULT_NAICS = ['238', '484', '532', '541'];

// SAM.gov returns up to 10,000 records per query with pagination
const PAGE_SIZE = 100;

// ----------------------------------------------------------------------------
// Arg parsing
// ----------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    naics:  DEFAULT_NAICS,
    state:  null,   // filter to a single US state (2-letter code)
    limit:  50000,  // safety ceiling
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--naics' && args[i + 1]) {
      opts.naics = args[++i].split(',').map(s => s.trim());
    } else if (args[i] === '--state' && args[i + 1]) {
      opts.state = args[++i].toUpperCase();
    } else if (args[i] === '--limit' && args[i + 1]) {
      opts.limit = parseInt(args[++i], 10);
    }
  }
  return opts;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function classifyNaics(naics) {
  const code = String(naics || '');
  if (code.startsWith('238')) return 'construction_general';
  if (code.startsWith('484')) return 'trucking_general';
  if (code.startsWith('532')) return 'fleet_leasing';
  if (code.startsWith('541')) return 'professional_services';
  return 'general';
}

function plural(n, s, p) { return n === 1 ? `${n} ${s}` : `${n.toLocaleString()} ${p}`; }

// ----------------------------------------------------------------------------
// SAM.gov API fetch (one page)
// ----------------------------------------------------------------------------
async function fetchPage(naicsPrefix, stateFilter, offset) {
  const params = new URLSearchParams({
    api_key:                SAM_API_KEY || 'DEMO_KEY',
    primaryNaics:           naicsPrefix,
    registrationStatus:     'A',        // Active only
    purposeOfRegistration:  'Z2,Z1',   // All awards (Z2) + federal assistance (Z1)
    entityType:             'Business or Organization',
    limit:                  String(PAGE_SIZE),
    offset:                 String(offset),
    // Request only the fields we need to minimise payload
    includeSections:        'entityRegistration,physicalAddress,generalInformation',
  });
  if (stateFilter) params.set('physicalAddressProvinceOrStateCode', stateFilter);

  const url = `${BASE_URL}?${params}`;
  const res  = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 429) throw new Error('Rate limited by SAM.gov — wait 60s and retry');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SAM.gov API error ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// ----------------------------------------------------------------------------
// Map SAM entity → companies row
// ----------------------------------------------------------------------------
function mapEntity(entity) {
  const reg  = entity.entityRegistration  || {};
  const addr = entity.physicalAddress     || {};
  const info = entity.generalInformation  || {};

  const sourceId = reg.ueiSAM || reg.ueiDUNS || reg.duns;
  if (!sourceId) return null;

  const name = reg.legalBusinessName || reg.dbaName;
  if (!name) return null;

  const naics = (info.primaryNaics || '').replace(/[^0-9]/g, '');

  return {
    source:            'sam_gov',
    source_id:         sourceId,
    name:              name.trim(),
    dba_name:          reg.dbaName || null,
    street:            [addr.addressLine1, addr.addressLine2].filter(Boolean).join(' ') || null,
    city:              addr.city || null,
    state:             addr.stateOrProvinceCode || null,
    zip:               addr.zipCode || null,
    country:           addr.countryCode || 'US',
    phone:             null, // SAM public API does not expose phone
    website:           null,
    industry:          classifyNaics(naics),
    naics_code:        naics || null,
    raw_data:          JSON.stringify({ reg, addr, info }),
  };
}

// ----------------------------------------------------------------------------
// Batch upsert
// ----------------------------------------------------------------------------
async function flushBatch(pool, batch) {
  const cols = [
    'source','source_id','name','street','city','state','zip','country',
    'industry','raw_data',
  ];
  const values = [];
  const placeholders = batch.map((row, i) => {
    const offset = i * cols.length;
    cols.forEach(c => values.push(row[c] ?? null));
    return '(' + cols.map((_, j) => `$${offset + j + 1}`).join(',') + ')';
  });

  const sql = `
    INSERT INTO companies (${cols.join(',')})
    VALUES ${placeholders.join(',')}
    ON CONFLICT (source, source_id) DO UPDATE SET
      name       = EXCLUDED.name,
      street     = EXCLUDED.street,
      city       = EXCLUDED.city,
      state      = EXCLUDED.state,
      zip        = EXCLUDED.zip,
      industry   = EXCLUDED.industry,
      raw_data   = EXCLUDED.raw_data,
      updated_at = NOW()
    RETURNING (xmax = 0) AS was_inserted
  `;

  const r = await pool.query(sql, values);
  let inserted = 0, updated = 0;
  for (const row of r.rows) { if (row.was_inserted) inserted++; else updated++; }
  return { inserted, updated };
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  const opts = parseArgs();

  console.log('\n📋 WrapLeads — SAM.gov Federal Contractor Ingest');
  console.log(`   NAICS prefixes : ${opts.naics.join(', ')}`);
  console.log(`   State filter   : ${opts.state || '(all states)'}`);
  console.log(`   Row limit      : ${opts.limit.toLocaleString()}`);
  if (!SAM_API_KEY) {
    console.log('   ⚠  SAM_API_KEY not set — using DEMO_KEY (very limited rate)');
    console.log('      Get a free key at https://sam.gov/profile/details\n');
  } else {
    console.log('   API key        : set ✓\n');
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query('SELECT 1 FROM companies LIMIT 1');
  } catch {
    console.error('❌ Database not ready. Run: docker compose up -d');
    process.exit(1);
  }

  // Ensure naics_code column exists (additive migration)
  await pool.query(`
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS naics_code TEXT;
  `).catch(() => {});

  const runRes = await pool.query(
    `INSERT INTO ingest_runs (source, file_name, started_at) VALUES ($1, $2, NOW()) RETURNING id`,
    ['sam_gov', `sam-${opts.naics.join('-')}${opts.state ? '-' + opts.state : ''}`]
  );
  const runId = runRes.rows[0].id;

  const start = Date.now();
  let totalFetched = 0, inserted = 0, updated = 0, skipped = 0;
  let batch = [];

  for (const naicsPrefix of opts.naics) {
    if (totalFetched >= opts.limit) break;

    let offset = 0;
    let totalForNaics = null;

    process.stdout.write(`\n  NAICS ${naicsPrefix}`);

    while (true) {
      if (totalFetched >= opts.limit) break;

      let data;
      try {
        data = await fetchPage(naicsPrefix, opts.state, offset);
      } catch (err) {
        if (err.message.includes('Rate limited')) {
          console.log('\n  ⏳ Rate limited — waiting 60s...');
          await sleep(60_000);
          data = await fetchPage(naicsPrefix, opts.state, offset);
        } else {
          throw err;
        }
      }

      const entities = data.entityData || [];
      if (totalForNaics === null) {
        totalForNaics = data.totalRecords || 0;
        process.stdout.write(` (${totalForNaics.toLocaleString()} total)`);
      }

      if (entities.length === 0) break;

      for (const entity of entities) {
        const row = mapEntity(entity);
        if (!row) { skipped++; continue; }
        batch.push(row);
        totalFetched++;

        if (batch.length >= BATCH_SIZE) {
          const r = await flushBatch(pool, batch);
          inserted += r.inserted;
          updated  += r.updated;
          batch = [];
          process.stdout.write('.');
        }
      }

      offset += entities.length;
      if (offset >= totalForNaics) break;

      // Polite delay — SAM.gov allows ~10 req/s with API key
      await sleep(SAM_API_KEY ? 150 : 1000);
    }
  }

  // Flush remainder
  if (batch.length) {
    const r = await flushBatch(pool, batch);
    inserted += r.inserted;
    updated  += r.updated;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  await pool.query(
    `UPDATE ingest_runs SET finished_at = NOW(), rows_read = $1, rows_inserted = $2,
     rows_updated = $3, rows_skipped = $4 WHERE id = $5`,
    [totalFetched, inserted, updated, skipped, runId]
  );

  console.log(`\n\n✓ Done in ${elapsed}s\n`);
  console.log(`   ${plural(totalFetched, 'entity', 'entities')} fetched from SAM.gov`);
  console.log(`   ${plural(inserted, 'new company', 'new companies')} inserted`);
  console.log(`   ${plural(updated, 'existing company', 'existing companies')} updated`);
  console.log(`   ${plural(skipped, 'entity', 'entities')} skipped (missing ID or name)\n`);

  const stats = await pool.query(
    `SELECT COUNT(*)::INT AS total FROM companies WHERE source = 'sam_gov'`
  );
  console.log(`📊 Database now contains ${stats.rows[0].total.toLocaleString()} SAM.gov companies.\n`);

  await pool.end();
}

main().catch(e => { console.error('\n❌ Ingest failed:', e.message); process.exit(1); });
