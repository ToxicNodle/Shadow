/**
 * WrapLeads — Google Places National Sweep  (v1.0)
 * --------------------------------------------------
 * Automated multi-city, multi-query sweep of Google Places API targeting
 * fleet-owning businesses across all major US metros.  Runs unattended
 * and tracks progress so it can resume after interruption.
 *
 * Why this exists vs. ingest-google-places.js:
 *   The single-location script requires manual CLI invocation per city+query.
 *   This script runs the full sweep automatically — 30 metros × 8 search
 *   terms = up to 240 passes, ~48K businesses captured, fully hands-off.
 *
 * Usage:
 *   node ingest-google-places-sweep.js                  # run all metros
 *   node ingest-google-places-sweep.js --region south   # TX, FL, GA, NC, TN
 *   node ingest-google-places-sweep.js --region west    # CA, WA, CO, AZ, NV
 *   node ingest-google-places-sweep.js --region east    # NY, PA, VA, NC, FL
 *   node ingest-google-places-sweep.js --region midwest # IL, OH, MI, IN, MO
 *   node ingest-google-places-sweep.js --dry-run        # print plan, no API calls
 *   node ingest-google-places-sweep.js --resume         # skip already-done passes
 *
 * Env vars:
 *   GOOGLE_PLACES_API_KEY  — required
 *   DATABASE_URL           — optional (defaults to local dev URL)
 *
 * Cost estimate (Google free tier = $200/month credit):
 *   Text Search: $32/1000 requests.  Each pass does ~10 requests (200 results / 20 per page).
 *   240 passes × 10 requests = 2,400 requests × $0.032 = ~$77 total — within free tier.
 *   Place Details: $17/1000.  One per result.  240 passes × 200 results × $0.017 = ~$816.
 *   → To stay within $200/month, either skip Place Details (--no-details) or run ~120 passes/month.
 *   → Place Details gives phone + website — highly recommended for quality leads.
 */

require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL   = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';
const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const PLACES_BASE    = 'https://maps.googleapis.com/maps/api/place';
const GEOCODE_BASE   = 'https://maps.googleapis.com/maps/api/geocode/json';

// ----------------------------------------------------------------------------
// Config: metros × queries
// ----------------------------------------------------------------------------

const METROS = {
  // South / Southeast
  south: [
    { city: 'Houston, TX',      radius: 80000 },
    { city: 'Dallas, TX',       radius: 80000 },
    { city: 'San Antonio, TX',  radius: 60000 },
    { city: 'Austin, TX',       radius: 60000 },
    { city: 'Atlanta, GA',      radius: 80000 },
    { city: 'Tampa, FL',        radius: 60000 },
    { city: 'Miami, FL',        radius: 60000 },
    { city: 'Orlando, FL',      radius: 60000 },
    { city: 'Jacksonville, FL', radius: 60000 },
    { city: 'Charlotte, NC',    radius: 60000 },
    { city: 'Raleigh, NC',      radius: 60000 },
    { city: 'Nashville, TN',    radius: 60000 },
  ],

  // West Coast / Mountain
  west: [
    { city: 'Los Angeles, CA',  radius: 80000 },
    { city: 'San Diego, CA',    radius: 60000 },
    { city: 'San Francisco, CA', radius: 60000 },
    { city: 'Sacramento, CA',   radius: 60000 },
    { city: 'Seattle, WA',      radius: 60000 },
    { city: 'Portland, OR',     radius: 60000 },
    { city: 'Phoenix, AZ',      radius: 80000 },
    { city: 'Tucson, AZ',       radius: 50000 },
    { city: 'Denver, CO',       radius: 60000 },
    { city: 'Las Vegas, NV',    radius: 60000 },
    { city: 'Salt Lake City, UT', radius: 60000 },
    { city: 'Albuquerque, NM',  radius: 50000 },
  ],

  // Northeast / Mid-Atlantic
  east: [
    { city: 'New York, NY',     radius: 60000 },
    { city: 'Philadelphia, PA', radius: 60000 },
    { city: 'Baltimore, MD',    radius: 50000 },
    { city: 'Washington, DC',   radius: 60000 },
    { city: 'Richmond, VA',     radius: 50000 },
    { city: 'Pittsburgh, PA',   radius: 50000 },
    { city: 'Boston, MA',       radius: 60000 },
    { city: 'Hartford, CT',     radius: 50000 },
    { city: 'Albany, NY',       radius: 50000 },
    { city: 'Buffalo, NY',      radius: 50000 },
  ],

  // Midwest
  midwest: [
    { city: 'Chicago, IL',      radius: 80000 },
    { city: 'Detroit, MI',      radius: 60000 },
    { city: 'Columbus, OH',     radius: 60000 },
    { city: 'Cleveland, OH',    radius: 60000 },
    { city: 'Cincinnati, OH',   radius: 50000 },
    { city: 'Indianapolis, IN', radius: 60000 },
    { city: 'Milwaukee, WI',    radius: 50000 },
    { city: 'Minneapolis, MN',  radius: 60000 },
    { city: 'Kansas City, MO',  radius: 60000 },
    { city: 'St. Louis, MO',    radius: 60000 },
    { city: 'Omaha, NE',        radius: 50000 },
    { city: 'Louisville, KY',   radius: 50000 },
  ],
};

// All metros combined for the default run
const ALL_METROS = Object.values(METROS).flat();

// Fleet-relevant business categories (ordered by wrap-shop value)
const SEARCH_QUERIES = [
  'trucking company',
  'HVAC contractor',
  'plumbing company',
  'electrical contractor',
  'landscaping company',
  'construction company',
  'food truck',
  'pest control',
  'delivery service',
  'moving company',
];

const MAX_PER_PASS    = 200;   // Google max per text search
const DETAIL_PAUSE_MS = 60;    // polite pause between Place Details calls
const PAGE_PAUSE_MS   = 2200;  // Google requires ~2s between paged requests
const PASS_PAUSE_MS   = 500;   // brief pause between passes (rate limit safety)

// ----------------------------------------------------------------------------
// Arg parsing
// ----------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    region:     'all',
    dryRun:     false,
    resume:     false,
    noDetails:  false,
    maxPasses:  Infinity,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region')    out.region    = args[++i] || 'all';
    if (args[i] === '--dry-run')   out.dryRun    = true;
    if (args[i] === '--resume')    out.resume    = true;
    if (args[i] === '--no-details') out.noDetails = true;
    if (args[i] === '--max-passes') out.maxPasses = parseInt(args[++i]) || Infinity;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Geocode
// ----------------------------------------------------------------------------
const geocodeCache = new Map();
async function geocode(cityState) {
  if (geocodeCache.has(cityState)) return geocodeCache.get(cityState);
  const url = `${GEOCODE_BASE}?address=${encodeURIComponent(cityState)}&key=${PLACES_API_KEY}`;
  const r   = await fetch(url);
  const d   = await r.json();
  if (d.status !== 'OK' || !d.results.length) {
    throw new Error(`Geocode failed for "${cityState}": ${d.status}`);
  }
  const loc = d.results[0].geometry.location;
  geocodeCache.set(cityState, loc);
  return loc;
}

// ----------------------------------------------------------------------------
// Text search
// ----------------------------------------------------------------------------
async function* searchPlaces(query, lat, lng, radius) {
  let pageToken = null;
  let fetched   = 0;
  let page      = 0;

  do {
    page++;
    let url = `${PLACES_BASE}/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${radius}&key=${PLACES_API_KEY}`;
    if (pageToken) url += `&pagetoken=${pageToken}`;

    const r = await fetch(url);
    const d = await r.json();

    if (d.status === 'ZERO_RESULTS') break;
    if (d.status !== 'OK' && d.status !== 'NEXT_PAGE_TOKEN') {
      throw new Error(`Places search failed: ${d.status} — ${d.error_message || ''}`);
    }

    for (const place of (d.results || [])) {
      if (fetched >= MAX_PER_PASS) return;
      yield place;
      fetched++;
    }

    pageToken = d.next_page_token || null;
    if (pageToken) await sleep(PAGE_PAUSE_MS);
  } while (pageToken && fetched < MAX_PER_PASS);
}

// ----------------------------------------------------------------------------
// Place details
// ----------------------------------------------------------------------------
async function getDetails(placeId) {
  const url = `${PLACES_BASE}/details/json?place_id=${placeId}&fields=formatted_phone_number,website,url&key=${PLACES_API_KEY}`;
  const r   = await fetch(url);
  const d   = await r.json();
  if (d.status !== 'OK') return {};
  return d.result || {};
}

// ----------------------------------------------------------------------------
// Address component parser
// ----------------------------------------------------------------------------
function parseComponents(components = []) {
  const get  = (type) => (components.find(c => c.types.includes(type)) || {}).long_name || '';
  const sname = (type) => (components.find(c => c.types.includes('administrative_area_level_1')) || {}).short_name || '';
  const num  = get('street_number');
  const road = get('route');
  return {
    street: [num, road].filter(Boolean).join(' ') || null,
    city:   get('locality') || get('sublocality') || null,
    state:  sname('administrative_area_level_1') || null,
    zip:    get('postal_code') || null,
  };
}

// ----------------------------------------------------------------------------
// Batch upsert
// ----------------------------------------------------------------------------
const BATCH_SIZE = 100;

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

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatNum(n) { return n.toLocaleString(); }

function pad(s, len) { return String(s).padEnd(len, ' ').slice(0, len); }

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  const args = parseArgs();

  if (!PLACES_API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY is not set. Add it to .env');
    process.exit(1);
  }

  const metros  = args.region === 'all' ? ALL_METROS : (METROS[args.region] || []);
  if (!metros.length) {
    console.error(`Unknown region "${args.region}". Use: all, south, west, east, midwest`);
    process.exit(1);
  }

  // Build pass list (metro × query cartesian product)
  const passes = [];
  for (const metro of metros) {
    for (const query of SEARCH_QUERIES) {
      passes.push({ city: metro.city, radius: metro.radius, query });
    }
  }

  const totalPasses = Math.min(passes.length, args.maxPasses);
  console.log(`\n📍 WrapLeads — Google Places National Sweep`);
  console.log(`   Region:   ${args.region}`);
  console.log(`   Metros:   ${metros.length}`);
  console.log(`   Queries:  ${SEARCH_QUERIES.length}`);
  console.log(`   Passes:   ${totalPasses}${args.maxPasses < passes.length ? ` (capped from ${passes.length})` : ''}`);
  console.log(`   Details:  ${args.noDetails ? 'disabled (faster, less data)' : 'enabled (phone + website)'}`);
  console.log(`   Resume:   ${args.resume ? 'yes (skip completed passes)' : 'no'}`);
  if (args.dryRun) {
    console.log(`\n   DRY RUN — no API calls will be made.\n`);
    console.log('   Planned passes:');
    for (const p of passes.slice(0, totalPasses)) {
      console.log(`     ${pad(p.city, 24)} × "${p.query}"`);
    }
    return;
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query('SELECT 1 FROM companies LIMIT 1');
  } catch {
    console.error('❌ Database not ready. Run: docker compose up -d');
    process.exit(1);
  }

  // Build a set of already-completed passes (for --resume)
  const doneSet = new Set();
  if (args.resume) {
    const res = await pool.query(
      `SELECT file_name FROM ingest_runs
       WHERE source = 'google_places' AND finished_at IS NOT NULL`
    );
    for (const row of res.rows) doneSet.add(row.file_name);
    console.log(`   Resuming: ${doneSet.size} already-completed passes found.\n`);
  }

  const overallStart = Date.now();
  let totalInserted = 0, totalUpdated = 0, passCount = 0, skippedPasses = 0;

  for (let i = 0; i < passes.length && passCount < args.maxPasses; i++) {
    const { city, radius, query } = passes[i];
    const passKey = `sweep:${query}@${city}`;

    if (args.resume && doneSet.has(passKey)) {
      skippedPasses++;
      continue;
    }

    passCount++;
    const pctDone = Math.round((passCount / totalPasses) * 100);
    process.stdout.write(`\r[${String(passCount).padStart(3,'0')}/${totalPasses}] ${pctDone}%  ${pad(city,22)}  "${query}"  `);

    const runRes = await pool.query(
      `INSERT INTO ingest_runs (source, file_name, started_at) VALUES ('google_places', $1, NOW()) RETURNING id`,
      [passKey]
    );
    const runId = runRes.rows[0].id;

    let passInserted = 0, passUpdated = 0, passTotal = 0;

    try {
      const { lat, lng } = await geocode(city);
      let batch = [];

      for await (const place of searchPlaces(query, lat, lng, radius)) {
        passTotal++;

        const placeId = place.place_id;
        if (!placeId || !place.name) continue;

        let details = {};
        if (!args.noDetails) {
          try {
            await sleep(DETAIL_PAUSE_MS);
            details = await getDetails(placeId);
          } catch { /* non-critical */ }
        }

        const addr = parseComponents(place.address_components || []);

        batch.push({
          source:    'google_places',
          source_id: placeId,
          name:      place.name,
          street:    addr.street,
          city:      addr.city,
          state:     addr.state,
          zip:       addr.zip,
          country:   'US',
          phone:     details.formatted_phone_number || null,
          email:     null,
          website:   details.website || null,
          industry:  query.slice(0, 80),
          raw_data:  { ...place, details, _sweep_city: city, _sweep_query: query },
        });

        if (batch.length >= BATCH_SIZE) {
          const r = await flushBatch(pool, batch);
          passInserted += r.inserted;
          passUpdated  += r.updated;
          batch = [];
        }
      }

      if (batch.length) {
        const r = await flushBatch(pool, batch);
        passInserted += r.inserted;
        passUpdated  += r.updated;
      }

      await pool.query(
        `UPDATE ingest_runs SET finished_at = NOW(), rows_read = $1,
         rows_inserted = $2, rows_updated = $3 WHERE id = $4`,
        [passTotal, passInserted, passUpdated, runId]
      );

      totalInserted += passInserted;
      totalUpdated  += passUpdated;

    } catch (e) {
      await pool.query(
        `UPDATE ingest_runs SET finished_at = NOW(), notes = $1 WHERE id = $2`,
        [e.message, runId]
      );
      console.error(`\n   ⚠ Pass failed (${city} / "${query}"): ${e.message}`);
    }

    await sleep(PASS_PAUSE_MS);
  }

  const elapsed = ((Date.now() - overallStart) / 1000).toFixed(1);
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
  console.log(`\n✓ Sweep complete in ${elapsed}s`);
  console.log(`   ${formatNum(passCount)} passes run  (${skippedPasses} skipped)`);
  console.log(`   ${formatNum(totalInserted)} new businesses inserted`);
  console.log(`   ${formatNum(totalUpdated)} existing businesses updated`);
  console.log(`\n   Businesses appear in Discover under source = "Google Places".\n`);

  const stats = await pool.query(
    `SELECT COUNT(*)::INT AS total FROM companies WHERE source = 'google_places'`
  );
  console.log(`   Total Google Places businesses in DB: ${formatNum(stats.rows[0].total)}\n`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
