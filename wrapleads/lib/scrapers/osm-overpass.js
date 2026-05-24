/**
 * OpenStreetMap Overpass scraper for industrial / warehouse buildings.
 *
 * No API key required. Returns building polygons we can convert to footprint
 * area (in sqft), giving solar-score the "building_sqft" input even when we
 * have no commercial property data. Source key: 'osm_industrial'.
 *
 * Region accepts:
 *   - "bbox:south,west,north,east"  e.g. "bbox:33.3,-112.3,33.7,-111.9"
 *   - "name:Phoenix, AZ, USA"       (resolved via Nominatim)
 */

'use strict';

const OVERPASS_URL = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';
const NOMINATIM    = 'https://nominatim.openstreetmap.org/search';
const UA           = 'WrapLeads/1.0 (commercial-solar-scout)';

// Average sqm-per-sqft conversion. We compute polygon area in sqm and convert
// for storage so the rest of the system stays in imperial units.
const SQM_TO_SQFT = 10.7639;

async function resolveBbox(region) {
  if (region.startsWith('bbox:')) {
    const [s, w, n, e] = region.slice(5).split(',').map(parseFloat);
    if ([s, w, n, e].some(isNaN)) throw new Error(`Invalid bbox: ${region}`);
    return { south: s, west: w, north: n, east: e };
  }
  const name = region.startsWith('name:') ? region.slice(5) : region;
  const url = `${NOMINATIM}?q=${encodeURIComponent(name)}&format=json&limit=1`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  const d = await r.json();
  if (!Array.isArray(d) || !d.length) throw new Error(`Could not geocode "${name}" via Nominatim`);
  const [south, north, west, east] = d[0].boundingbox.map(parseFloat);
  return { south, west, north, east };
}

// Polygon area via the spherical-excess shoelace approximation. Good enough
// for building-sized polygons (<1km across) where we don't need cartographic
// precision.
function polygonAreaSqm(nodes) {
  if (!nodes || nodes.length < 3) return 0;
  const R = 6378137; // Earth radius in meters
  let total = 0;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    total += (toRad(b.lon) - toRad(a.lon)) * (2 + Math.sin(toRad(a.lat)) + Math.sin(toRad(b.lat)));
  }
  return Math.abs(total * R * R / 2);
}
function toRad(d) { return d * Math.PI / 180; }

function centroid(nodes) {
  if (!nodes || !nodes.length) return { lat: null, lng: null };
  let sumLat = 0, sumLng = 0;
  for (const n of nodes) { sumLat += n.lat; sumLng += n.lon; }
  return { lat: sumLat / nodes.length, lng: sumLng / nodes.length };
}

async function fetchOverpass(bbox, limit = 500) {
  const { south, west, north, east } = bbox;
  // Industrial and warehouse buildings, plus industrial-zoned landuse footprints.
  const query = `[out:json][timeout:60];
(
  way["building"~"warehouse|industrial"](${south},${west},${north},${east});
  way["landuse"="industrial"](${south},${west},${north},${east});
);
out body ${limit};
>;
out skel qt;`;

  const r = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': UA },
    body: query,
  });
  if (!r.ok) throw new Error(`Overpass error: ${r.status} ${r.statusText}`);
  return r.json();
}

function expandWays(json) {
  const nodes = new Map();
  const ways = [];
  for (const el of (json.elements || [])) {
    if (el.type === 'node') nodes.set(el.id, { lat: el.lat, lon: el.lon });
    else if (el.type === 'way') ways.push(el);
  }
  const out = [];
  for (const way of ways) {
    const polyNodes = (way.nodes || []).map(id => nodes.get(id)).filter(Boolean);
    if (polyNodes.length < 3) continue;
    const sqm = polygonAreaSqm(polyNodes);
    if (sqm < 1000) continue; // skip tiny things — not commercial-scale
    const c = centroid(polyNodes);
    const tags = way.tags || {};
    const isWarehouse = tags.building === 'warehouse' || tags.industrial === 'warehouse';
    const isIndustrial = tags.landuse === 'industrial' || tags.building === 'industrial';
    out.push({
      osm_id: `way/${way.id}`,
      name: tags.name || (isWarehouse ? 'Warehouse Building' : 'Industrial Building'),
      operator: tags.operator || null,
      addr_street: tags['addr:street'] || null,
      addr_city: tags['addr:city'] || null,
      addr_state: tags['addr:state'] || null,
      addr_zip: tags['addr:postcode'] || null,
      website: tags.website || tags['contact:website'] || null,
      phone: tags.phone || tags['contact:phone'] || null,
      roof_shape: tags['roof:shape'] || null,
      roof_material: tags['roof:material'] || null,
      building_sqft: Math.round(sqm * SQM_TO_SQFT),
      lat: c.lat,
      lng: c.lng,
      industry: isWarehouse ? 'warehouse' : (isIndustrial ? 'industrial' : 'commercial'),
      tags,
    });
  }
  return out;
}

function roofTypeFromTags(material) {
  if (!material) return 'unknown';
  const m = material.toLowerCase();
  if (m.includes('metal') || m.includes('steel') || m.includes('zinc')) return 'metal';
  if (m.includes('membrane') || m.includes('epdm') || m.includes('tpo') || m.includes('pvc')) return 'membrane';
  if (m.includes('concrete') || m.includes('gravel') || m.includes('flat')) return 'flat';
  if (m.includes('shingle') || m.includes('asphalt')) return 'shingle';
  return 'unknown';
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
      building_sqft = COALESCE(EXCLUDED.building_sqft, companies.building_sqft),
      roof_type     = COALESCE(EXCLUDED.roof_type, companies.roof_type),
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

async function run({ pool, region, max = 500, log = console.log }) {
  if (!region) throw new Error('region (bbox:<s,w,n,e> or name:<place>) is required');
  log(`   Resolving region: ${region}`);
  const bbox = await resolveBbox(region);
  log(`   bbox: S${bbox.south.toFixed(3)} W${bbox.west.toFixed(3)} N${bbox.north.toFixed(3)} E${bbox.east.toFixed(3)}`);

  log('   Querying Overpass…');
  const json = await fetchOverpass(bbox, max);
  const buildings = expandWays(json);
  log(`   Found ${buildings.length} commercial building polygons`);

  let inserted = 0, updated = 0;
  const batch = buildings.map(b => ({
    source:        'osm_industrial',
    source_id:     b.osm_id,
    name:          b.operator || b.name,
    street:        b.addr_street,
    city:          b.addr_city,
    state:         b.addr_state,
    zip:           b.addr_zip,
    country:       'US',
    phone:         b.phone,
    email:         null,
    website:       b.website,
    industry:      b.industry,
    building_sqft: b.building_sqft,
    roof_type:     roofTypeFromTags(b.roof_material) || (b.roof_shape === 'flat' ? 'flat' : 'unknown'),
    latitude:      b.lat,
    longitude:     b.lng,
    raw_data:      { tags: b.tags },
  }));

  const CHUNK = 100;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const slice = batch.slice(i, i + CHUNK);
    if (!slice.length) continue;
    const r = await flushBatch(pool, slice);
    inserted += r.inserted; updated += r.updated;
  }

  return { total: buildings.length, inserted, updated, skipped: 0 };
}

module.exports = { run };
