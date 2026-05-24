/**
 * Commercial-building scraper backed by Google Places.
 *
 * Mirrors the proven pattern in `ingest-google-places.js` but cycles through
 * a curated set of commercial property search terms ("distribution center",
 * "warehouse", "industrial park", etc.) for a single region. Stored with
 * source='google_places_solar' to keep them separate from general Places data.
 */

'use strict';

const PLACES_API_KEY  = process.env.GOOGLE_PLACES_API_KEY || '';
const PLACES_BASE     = 'https://maps.googleapis.com/maps/api/place';
const GEOCODE_BASE    = 'https://maps.googleapis.com/maps/api/geocode/json';
const BATCH_SIZE      = 100;
const DETAIL_PAUSE_MS = 50;

// Commercial property search terms ordered by typical solar opportunity quality.
const DEFAULT_QUERIES = [
  'distribution center',
  'warehouse',
  'industrial park',
  'manufacturing facility',
  'cold storage facility',
  'logistics center',
  'self storage facility',
  'data center',
];

// Rough sqft estimates by Places category — used as fallback when we can't
// derive footprint from OSM or assessor data. Conservative midpoints.
const SQFT_HEURISTIC = {
  'distribution center':     180000,
  'warehouse':                90000,
  'industrial park':          75000,
  'manufacturing facility':  100000,
  'cold storage facility':   130000,
  'logistics center':        220000,
  'self storage facility':    50000,
  'data center':              60000,
};

// Most commercial warehouses + DCs have flat or membrane roofs by default.
const ROOF_HEURISTIC = {
  'distribution center':    'membrane',
  'warehouse':              'metal',
  'industrial park':        'metal',
  'manufacturing facility': 'metal',
  'cold storage facility':  'membrane',
  'logistics center':       'membrane',
  'self storage facility':  'metal',
  'data center':            'flat',
};

async function geocode(address) {
  const url = `${GEOCODE_BASE}?address=${encodeURIComponent(address)}&key=${PLACES_API_KEY}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.status !== 'OK' || !d.results.length) {
    throw new Error(`Geocode failed for "${address}": ${d.status}`);
  }
  return d.results[0].geometry.location;
}

async function* searchPlaces(query, lat, lng, radius, max) {
  let pageToken = null;
  let fetched = 0;
  do {
    let url = `${PLACES_BASE}/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${radius}&key=${PLACES_API_KEY}`;
    if (pageToken) url += `&pagetoken=${pageToken}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.status === 'ZERO_RESULTS') break;
    if (d.status !== 'OK' && d.status !== 'NEXT_PAGE_TOKEN') {
      throw new Error(`Places search failed (${query}): ${d.status} — ${d.error_message || ''}`);
    }
    for (const place of (d.results || [])) {
      if (fetched >= max) return;
      yield place;
      fetched++;
    }
    pageToken = d.next_page_token || null;
    // Google requires ~2s between paged requests for the token to become valid.
    if (pageToken) await new Promise(res => setTimeout(res, 2000));
  } while (pageToken && fetched < max);
}

async function getDetails(placeId) {
  const url = `${PLACES_BASE}/details/json?place_id=${placeId}&fields=formatted_phone_number,website,address_components,geometry,formatted_address&key=${PLACES_API_KEY}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.status !== 'OK') return {};
  return d.result || {};
}

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

async function flushBatch(pool, batch) {
  const cols = [
    'source','source_id','name','street','city','state','zip','country',
    'phone','email','website','industry','building_sqft','roof_type',
    'latitude','longitude','raw_data',
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
      name          = EXCLUDED.name,
      phone         = COALESCE(EXCLUDED.phone, companies.phone),
      website       = COALESCE(EXCLUDED.website, companies.website),
      building_sqft = COALESCE(companies.building_sqft, EXCLUDED.building_sqft),
      roof_type     = COALESCE(companies.roof_type, EXCLUDED.roof_type),
      latitude      = COALESCE(EXCLUDED.latitude, companies.latitude),
      longitude     = COALESCE(EXCLUDED.longitude, companies.longitude),
      raw_data      = EXCLUDED.raw_data,
      updated_at    = NOW()
    RETURNING (xmax = 0) AS was_inserted
  `;
  const r = await pool.query(sql, values);
  let inserted = 0, updated = 0;
  for (const row of r.rows) { if (row.was_inserted) inserted++; else updated++; }
  return { inserted, updated };
}

async function run({ pool, region, queries = DEFAULT_QUERIES, radius = 80000, maxPerQuery = 60, log = console.log }) {
  if (!PLACES_API_KEY) throw new Error('GOOGLE_PLACES_API_KEY is not set');
  if (!region) throw new Error('region (e.g. "Phoenix, AZ") is required');

  const { lat, lng } = await geocode(region);
  log(`   Center: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);

  let total = 0, inserted = 0, updated = 0, skipped = 0;
  let batch = [];

  for (const query of queries) {
    log(`   → "${query}" (max ${maxPerQuery})`);
    for await (const place of searchPlaces(query, lat, lng, radius, maxPerQuery)) {
      total++;
      const placeId = place.place_id;
      if (!placeId || !place.name) { skipped++; continue; }

      let details = {};
      try {
        await new Promise(res => setTimeout(res, DETAIL_PAUSE_MS));
        details = await getDetails(placeId);
      } catch { /* non-critical */ }

      const addr = parseComponents(details.address_components || place.address_components || []);
      const geometry = details.geometry || place.geometry || {};
      const loc = geometry.location || {};

      batch.push({
        source:        'google_places_solar',
        source_id:     placeId,
        name:          place.name,
        street:        addr.street,
        city:          addr.city,
        state:         addr.state,
        zip:           addr.zip,
        country:       'US',
        phone:         details.formatted_phone_number || null,
        email:         null,
        website:       details.website || null,
        industry:      query.slice(0, 80),
        building_sqft: SQFT_HEURISTIC[query] || null,
        roof_type:     ROOF_HEURISTIC[query] || 'unknown',
        latitude:      loc.lat ?? null,
        longitude:     loc.lng ?? null,
        raw_data:      { ...place, details, ingest_query: query },
      });

      if (batch.length >= BATCH_SIZE) {
        const r = await flushBatch(pool, batch);
        inserted += r.inserted; updated += r.updated;
        batch = [];
      }
    }
  }

  if (batch.length) {
    const r = await flushBatch(pool, batch);
    inserted += r.inserted; updated += r.updated;
  }

  return { total, inserted, updated, skipped };
}

module.exports = { run, DEFAULT_QUERIES };
