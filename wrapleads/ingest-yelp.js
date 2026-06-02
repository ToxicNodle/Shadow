/**
 * WrapLeads — Yelp Fusion Local Business Ingest  (v1.0)
 * -------------------------------------------------------
 * Searches Yelp's Fusion API for fleet-owning local service businesses —
 * HVAC, plumbing, electrical, landscaping, construction, delivery, moving —
 * the businesses that FMCSA misses because they operate locally.
 *
 * Yelp is the best free source for small-fleet local service businesses.
 * Results include phone, address, website, review count, and rating — all
 * useful signals for wrap shop sales. Upserted into the companies table
 * under source='yelp'.
 *
 * Free tier: 500 API calls/day. Each call returns up to 50 results.
 * 500 calls × 50 results = up to 25,000 businesses/day at zero cost.
 *
 * Get a free API key: https://www.yelp.com/developers/v3/manage_app
 *
 * Usage:
 *   YELP_API_KEY=xxx node ingest-yelp.js
 *   YELP_API_KEY=xxx node ingest-yelp.js --region south
 *   YELP_API_KEY=xxx node ingest-yelp.js --query "hvac" --location "Dallas, TX"
 *   YELP_API_KEY=xxx node ingest-yelp.js --dry-run
 *   YELP_API_KEY=xxx node ingest-yelp.js --resume
 *
 * Env vars:
 *   YELP_API_KEY  — required (free at yelp.com/developers)
 *   DATABASE_URL  — optional (defaults to local dev URL)
 */

require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';
const YELP_API_KEY = process.env.YELP_API_KEY || '';
const YELP_BASE    = 'https://api.yelp.com/v3/businesses/search';
const BATCH_SIZE   = 100;
const PAGE_PAUSE   = 300; // ms between pages
const PASS_PAUSE   = 400; // ms between city+query passes

// ----------------------------------------------------------------------------
// Metros
// ----------------------------------------------------------------------------
const METROS = {
  south: [
    'Houston, TX', 'Dallas, TX', 'San Antonio, TX', 'Austin, TX',
    'Atlanta, GA', 'Tampa, FL', 'Miami, FL', 'Orlando, FL',
    'Jacksonville, FL', 'Charlotte, NC', 'Raleigh, NC', 'Nashville, TN',
  ],
  west: [
    'Los Angeles, CA', 'San Diego, CA', 'San Francisco, CA', 'Sacramento, CA',
    'Seattle, WA', 'Portland, OR', 'Phoenix, AZ', 'Tucson, AZ',
    'Denver, CO', 'Las Vegas, NV', 'Salt Lake City, UT', 'Albuquerque, NM',
  ],
  east: [
    'New York, NY', 'Philadelphia, PA', 'Baltimore, MD', 'Washington, DC',
    'Richmond, VA', 'Pittsburgh, PA', 'Boston, MA', 'Hartford, CT',
    'Albany, NY', 'Buffalo, NY',
  ],
  midwest: [
    'Chicago, IL', 'Detroit, MI', 'Columbus, OH', 'Cleveland, OH',
    'Cincinnati, OH', 'Indianapolis, IN', 'Milwaukee, WI', 'Minneapolis, MN',
    'Kansas City, MO', 'St. Louis, MO', 'Omaha, NE', 'Louisville, KY',
  ],
};

const ALL_METROS = Object.values(METROS).flat();

// Yelp categories that map to fleet businesses
const SEARCH_TERMS = [
  'hvac',
  'plumbing',
  'electrical',
  'landscaping',
  'roofing',
  'pest control',
  'moving company',
  'delivery service',
  'food trucks',
  'construction',
  'cleaning service',
  'auto transport',
];

// ----------------------------------------------------------------------------
// Args
// ----------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const out = { region: 'all', query: null, location: null, dryRun: false, resume: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region')   out.region   = args[++i] || 'all';
    if (args[i] === '--query')    out.query    = args[++i] || null;
    if (args[i] === '--location') out.location = args[++i] || null;
    if (args[i] === '--dry-run')  out.dryRun   = true;
    if (args[i] === '--resume')   out.resume   = true;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Yelp search — pages up to 1000 results max (Yelp hard limit)
// ----------------------------------------------------------------------------
async function* searchYelp(term, location) {
  let offset = 0;
  const limit = 50; // Yelp max per page

  while (offset < 1000) {
    const url = `${YELP_BASE}?term=${encodeURIComponent(term)}&location=${encodeURIComponent(location)}&limit=${limit}&offset=${offset}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${YELP_API_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (r.status === 429) {
      await sleep(5000);
      continue; // retry after rate limit
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`Yelp API ${r.status}: ${body.slice(0, 200)}`);
    }

    const d = await r.json();
    const businesses = d.businesses || [];
    if (!businesses.length) break;

    for (const biz of businesses) yield biz;

    if (businesses.length < limit || offset + limit >= d.total) break;
    offset += limit;
    await sleep(PAGE_PAUSE);
  }
}

// ----------------------------------------------------------------------------
// Parse Yelp business → DB row
// ----------------------------------------------------------------------------
function parseYelpBusiness(biz, term, location) {
  const loc = biz.location || {};
  const street = [loc.address1, loc.address2, loc.address3].filter(Boolean).join(', ') || null;
  return {
    source:    'yelp',
    source_id: biz.id,
    name:      biz.name || null,
    street,
    city:      loc.city || null,
    state:     loc.state || null,
    zip:       loc.zip_code || null,
    country:   'US',
    phone:     biz.display_phone || biz.phone || null,
    email:     null,
    website:   biz.url || null,
    industry:  term.slice(0, 80),
    raw_data:  {
      yelp_rating:       biz.rating,
      yelp_review_count: biz.review_count,
      yelp_categories:   (biz.categories || []).map(c => c.alias),
      is_closed:         biz.is_closed,
      _sweep_location:   location,
      _sweep_term:       term,
    },
  };
}

// ----------------------------------------------------------------------------
// Batch upsert
// ----------------------------------------------------------------------------
async function flushBatch(pool, batch) {
  const cols = [
    'source','source_id','name','street','city','state','zip','country',
    'phone','email','website','industry','raw_data',
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
      name     = EXCLUDED.name,
      phone    = COALESCE(EXCLUDED.phone, companies.phone),
      website  = COALESCE(EXCLUDED.website, companies.website),
      raw_data = EXCLUDED.raw_data,
      updated_at = NOW()
    RETURNING (xmax = 0) AS was_inserted
  `;

  const res = await pool.query(sql, values);
  let inserted = 0, updated = 0;
  for (const row of res.rows) {
    if (row.was_inserted) inserted++; else updated++;
  }
  return { inserted, updated };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmt(n) { return n.toLocaleString(); }
function pad(s, len) { return String(s).padEnd(len, ' ').slice(0, len); }

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  const args = parseArgs();

  if (!YELP_API_KEY) {
    console.error('❌ YELP_API_KEY is not set. Get a free key at https://www.yelp.com/developers/v3/manage_app');
    process.exit(1);
  }

  // Single-query mode vs sweep mode
  if (args.query && args.location) {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query('SELECT 1 FROM companies LIMIT 1');
    } catch {
      console.error('❌ Database not ready');
      process.exit(1);
    }

    console.log(`\n🍽️ WrapLeads — Yelp Ingest`);
    console.log(`   Query:    "${args.query}"`);
    console.log(`   Location: ${args.location}\n`);

    if (args.dryRun) { console.log('   DRY RUN\n'); return; }

    let batch = [], inserted = 0, updated = 0, total = 0;
    for await (const biz of searchYelp(args.query, args.location)) {
      total++;
      batch.push(parseYelpBusiness(biz, args.query, args.location));
      if (batch.length >= BATCH_SIZE) {
        const r = await flushBatch(pool, batch);
        inserted += r.inserted; updated += r.updated; batch = [];
      }
    }
    if (batch.length) { const r = await flushBatch(pool, batch); inserted += r.inserted; updated += r.updated; }
    console.log(`✓ ${fmt(total)} found — ${fmt(inserted)} inserted, ${fmt(updated)} updated\n`);
    await pool.end();
    return;
  }

  // Sweep mode
  const metros = args.region === 'all' ? ALL_METROS : (METROS[args.region] || []);
  if (!metros.length) {
    console.error(`Unknown region "${args.region}". Use: all, south, west, east, midwest`);
    process.exit(1);
  }

  const passes = [];
  for (const loc of metros) {
    for (const term of SEARCH_TERMS) {
      passes.push({ location: loc, term });
    }
  }

  console.log(`\n🍽️ WrapLeads — Yelp National Sweep`);
  console.log(`   Region:  ${args.region}`);
  console.log(`   Metros:  ${metros.length}`);
  console.log(`   Queries: ${SEARCH_TERMS.length}`);
  console.log(`   Passes:  ${passes.length}`);
  if (args.dryRun) {
    console.log('\n   DRY RUN — no API calls will be made.\n');
    for (const p of passes.slice(0, 10)) console.log(`     ${pad(p.location, 24)} × "${p.term}"`);
    if (passes.length > 10) console.log(`     ... and ${passes.length - 10} more`);
    return;
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  try { await pool.query('SELECT 1 FROM companies LIMIT 1'); } catch {
    console.error('❌ Database not ready'); process.exit(1);
  }

  const doneSet = new Set();
  if (args.resume) {
    const res = await pool.query(
      `SELECT file_name FROM ingest_runs WHERE source = 'yelp' AND finished_at IS NOT NULL`
    );
    for (const row of res.rows) doneSet.add(row.file_name);
    console.log(`   Resuming: ${doneSet.size} already-completed passes\n`);
  }

  const start = Date.now();
  let totalInserted = 0, totalUpdated = 0, passCount = 0, skipped = 0;

  for (const { location, term } of passes) {
    const passKey = `yelp:${term}@${location}`;
    if (args.resume && doneSet.has(passKey)) { skipped++; continue; }

    passCount++;
    const pct = Math.round((passCount / passes.length) * 100);
    process.stdout.write(`\r[${String(passCount).padStart(3,'0')}/${passes.length}] ${pct}%  ${pad(location,22)}  "${term}"  `);

    const runRes = await pool.query(
      `INSERT INTO ingest_runs (source, file_name, started_at) VALUES ('yelp', $1, NOW()) RETURNING id`,
      [passKey]
    );
    const runId = runRes.rows[0].id;

    let batch = [], passInserted = 0, passUpdated = 0, passTotal = 0;

    try {
      for await (const biz of searchYelp(term, location)) {
        passTotal++;
        batch.push(parseYelpBusiness(biz, term, location));
        if (batch.length >= BATCH_SIZE) {
          const r = await flushBatch(pool, batch);
          passInserted += r.inserted; passUpdated += r.updated; batch = [];
        }
      }
      if (batch.length) {
        const r = await flushBatch(pool, batch);
        passInserted += r.inserted; passUpdated += r.updated;
      }

      await pool.query(
        `UPDATE ingest_runs SET finished_at = NOW(), rows_read = $1, rows_inserted = $2, rows_updated = $3 WHERE id = $4`,
        [passTotal, passInserted, passUpdated, runId]
      );
      totalInserted += passInserted; totalUpdated += passUpdated;
    } catch (e) {
      await pool.query(`UPDATE ingest_runs SET finished_at = NOW(), notes = $1 WHERE id = $2`, [e.message, runId]);
      console.error(`\n   ⚠ Pass failed (${location} / "${term}"): ${e.message}`);
    }

    await sleep(PASS_PAUSE);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
  console.log(`\n✓ Yelp sweep complete in ${elapsed}s`);
  console.log(`   ${fmt(passCount)} passes run  (${skipped} skipped)`);
  console.log(`   ${fmt(totalInserted)} new businesses inserted`);
  console.log(`   ${fmt(totalUpdated)} updated\n`);

  const stats = await pool.query(`SELECT COUNT(*)::INT AS total FROM companies WHERE source = 'yelp'`);
  console.log(`   Total Yelp businesses in DB: ${fmt(stats.rows[0].total)}\n`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
