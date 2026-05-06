/**
 * WrapLeads — Google Places Ingest  (v0.3)
 * -----------------------------------------
 * Searches Google Places API for local service businesses (plumbers, HVAC,
 * electricians, landscapers, food trucks, etc.) that own vehicle fleets —
 * targets wrap shops can't easily find in the FMCSA Census because they
 * aren't interstate carriers.
 *
 * Requires a Google Places API key with Places API (New) enabled.
 *   https://console.cloud.google.com/apis/library/places.googleapis.com
 *
 * Usage:
 *   node ingest-google-places.js --query "plumbing" --location "Indianapolis, IN" --radius 80000
 *   node ingest-google-places.js --query "hvac contractor" --location "Columbus, OH"
 *   node ingest-google-places.js --query "electrician" --location "Louisville, KY" --radius 60000
 *
 * Options:
 *   --query    Business type to search (required)
 *   --location City, State to center the search (required)
 *   --radius   Search radius in meters (default: 80000 = ~50 miles)
 *   --max      Maximum results to fetch, rounded to nearest 20 (default: 200)
 *
 * Env var:
 *   GOOGLE_PLACES_API_KEY — required
 *
 * The script is idempotent — re-running with the same location + place_id
 * upserts existing rows and adds new ones.
 */

require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL    = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';
const PLACES_API_KEY  = process.env.GOOGLE_PLACES_API_KEY || '';
const PLACES_BASE     = 'https://maps.googleapis.com/maps/api/place';
const GEOCODE_BASE    = 'https://maps.googleapis.com/maps/api/geocode/json';
const BATCH_SIZE      = 100;
const DETAIL_PAUSE_MS = 50; // be polite to the API

// ----------------------------------------------------------------------------
// Arg parsing
// ----------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const out = { query: '', location: '', radius: 80000, max: 200 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--query')    out.query    = args[++i] || '';
    if (args[i] === '--location') out.location = args[++i] || '';
    if (args[i] === '--radius')   out.radius   = parseInt(args[++i]) || 80000;
    if (args[i] === '--max')      out.max      = parseInt(args[++i]) || 200;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Geocode a "City, State" string → {lat, lng}
// ----------------------------------------------------------------------------
async function geocode(address) {
  const url = `${GEOCODE_BASE}?address=${encodeURIComponent(address)}&key=${PLACES_API_KEY}`;
  const r   = await fetch(url);
  const d   = await r.json();
  if (d.status !== 'OK' || !d.results.length) {
    throw new Error(`Geocode failed for "${address}": ${d.status}`);
  }
  return d.results[0].geometry.location; // {lat, lng}
}

// ----------------------------------------------------------------------------
// Text search for nearby businesses
// ----------------------------------------------------------------------------
async function* searchPlaces(query, lat, lng, radius, max) {
  let pageToken = null;
  let fetched = 0;
  let page = 0;

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
      if (fetched >= max) return;
      yield place;
      fetched++;
    }

    pageToken = d.next_page_token || null;
    if (pageToken) await new Promise(r => setTimeout(r, 2000)); // Google requires ~2s between paged requests
  } while (pageToken && fetched < max);
}

// ----------------------------------------------------------------------------
// Fetch place details (phone, website) — uses one API call per place
// ----------------------------------------------------------------------------
async function getDetails(placeId) {
  const url = `${PLACES_BASE}/details/json?place_id=${placeId}&fields=formatted_phone_number,website,url&key=${PLACES_API_KEY}`;
  const r   = await fetch(url);
  const d   = await r.json();
  if (d.status !== 'OK') return {};
  return d.result || {};
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

  const r = await pool.query(sql, values);
  let inserted = 0, updated = 0;
  for (const row of r.rows) {
    if (row.was_inserted) inserted++; else updated++;
  }
  return { inserted, updated };
}

// ----------------------------------------------------------------------------
// Parse a Google Places address_components into street/city/state/zip
// ----------------------------------------------------------------------------
function parseComponents(components = []) {
  const get = (type) => (components.find(c => c.types.includes(type)) || {}).long_name || '';
  const num  = get('street_number');
  const road = get('route');
  return {
    street: [num, road].filter(Boolean).join(' ') || null,
    city:   get('locality') || get('sublocality') || null,
    state:  (components.find(c => c.types.includes('administrative_area_level_1')) || {}).short_name || null,
    zip:    get('postal_code') || null,
  };
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  const args = parseArgs();

  if (!args.query || !args.location) {
    console.error('Usage: node ingest-google-places.js --query "plumbing" --location "Indianapolis, IN"');
    console.error('       GOOGLE_PLACES_API_KEY must be set in .env');
    process.exit(1);
  }
  if (!PLACES_API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY is not set. Add it to .env');
    process.exit(1);
  }

  console.log(`\n📍 WrapLeads — Google Places Ingest`);
  console.log(`   Query:    "${args.query}"`);
  console.log(`   Location: ${args.location}`);
  console.log(`   Radius:   ${(args.radius / 1000).toFixed(0)} km`);
  console.log(`   Max:      ${args.max} results\n`);

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await pool.query('SELECT 1 FROM companies LIMIT 1');
  } catch {
    console.error('❌ Database not ready. Run: docker compose up -d');
    process.exit(1);
  }

  const runRes = await pool.query(
    `INSERT INTO ingest_runs (source, file_name, started_at) VALUES ('google_places', $1, NOW()) RETURNING id`,
    [`places:${args.query}@${args.location}`]
  );
  const runId = runRes.rows[0].id;

  const start = Date.now();
  let total = 0, inserted = 0, updated = 0, skipped = 0;
  let batch = [];

  try {
    const { lat, lng } = await geocode(args.location);
    console.log(`   Center: ${lat.toFixed(4)}, ${lng.toFixed(4)}\n`);

    for await (const place of searchPlaces(args.query, lat, lng, args.radius, args.max)) {
      total++;
      process.stdout.write(`\r   Fetching place ${total}...                  `);

      const placeId = place.place_id;
      if (!placeId || !place.name) { skipped++; continue; }

      // Fetch phone/website details (costs 1 Places API call per business)
      let details = {};
      try {
        await new Promise(r => setTimeout(r, DETAIL_PAUSE_MS));
        details = await getDetails(placeId);
      } catch { /* non-critical */ }

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
        industry:  args.query.slice(0, 80),
        raw_data:  { ...place, details },
      });

      if (batch.length >= BATCH_SIZE) {
        const r = await flushBatch(pool, batch);
        inserted += r.inserted;
        updated  += r.updated;
        batch = [];
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

    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    console.log(`✓ Done in ${elapsed.toFixed(1)}s\n`);
    console.log(`   ${total.toLocaleString()} places found`);
    console.log(`   ${inserted.toLocaleString()} new businesses inserted`);
    console.log(`   ${updated.toLocaleString()} updated`);
    console.log(`   ${skipped.toLocaleString()} skipped\n`);
    console.log(`   These appear in Discover under source = "Google Places".\n`);
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
