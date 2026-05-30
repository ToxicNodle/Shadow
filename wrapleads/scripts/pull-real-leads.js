#!/usr/bin/env node
/**
 * One-shot puller for free public lead data.
 *
 * Hits:
 *   - EPA Envirofacts (GHGRP facility dim + emissions)
 *   - USAspending.gov (federal awardees in high-energy NAICS prefixes)
 *
 * Writes two CommonJS seed files alongside the existing seed-*.js:
 *
 *   ../seed-epa-facilities.js       (~3-5k real US emitters)
 *   ../seed-usaspending-leads.js    (~3-5k real federal awardees)
 *
 * Both files export `module.exports = { LEADS: [...] }` so the existing
 * autoSeed loader can ingest them on first user registration without
 * any further wiring. The output files are deterministic + committable
 * (no API keys needed).
 *
 * Usage:   node scripts/pull-real-leads.js [--epa-rows=5000] [--usa-per-naics=120]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const EPA_BASE = 'https://data.epa.gov/efservice';
const USA_BASE = 'https://api.usaspending.gov/api/v2';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const UA = 'HelioScout/1.0 (https://helioscout.io)';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => a.replace(/^--/, '').split('='))
);
const EPA_ROWS       = parseInt(args['epa-rows']      || '5000', 10);
const USA_PER_NAICS  = parseInt(args['usa-per-naics'] || '120',  10);
const EPA_YEAR       = parseInt(args['epa-year']      || '2022', 10);
const EPA_PAGE_SIZE  = 1000;

// Best solar-fit NAICS prefixes. USAspending API only accepts NAICS codes
// of length 2, 4, or 6 — pre-validated below.
const NAICS_TARGETS = [
  // Warehousing + cold storage (6-digit specific)
  '493120', '493110', '493190',
  // Manufacturing (2-digit broad — API rejects 3-digit)
  '31', '32', '33',
  // Data / info (4-digit)
  '5182',
  // Healthcare (4-digit)
  '6221', '6222',
  // Education
  '6113',
  // Hospitality
  '7211',
  // Retail with high refrigeration load
  '4451', '4452',
  // Wholesale (large warehouses)
  '42',
  // Transportation + warehousing (broad)
  '49',
];

const OUT_DIR = path.join(__dirname, '..');

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opts.headers || {}) }, ...opts });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url.slice(0, 100)}`);
  return r.json();
}

// ── EPA pull ──────────────────────────────────────────────────────────────
async function pullEpa(maxRows) {
  console.log(`\n🏭 Pulling EPA GHGRP facility metadata (target ${maxRows.toLocaleString()})…`);
  const seen = new Map();
  // Pull across recent years to maximize unique facilities — many facilities
  // only report in some years (e.g. capacity changes, mergers).
  for (const year of [2022, 2021, 2020, 2019]) {
    if (seen.size >= maxRows) break;
    console.log(`\n  year ${year}:`);
    let offset = 0;
    while (seen.size < maxRows) {
      const chunk = Math.min(EPA_PAGE_SIZE, maxRows - seen.size);
      const url = `${EPA_BASE}/PUB_DIM_FACILITY/year/${year}/ROWS/${offset}:${offset + chunk - 1}/JSON`;
      let rows;
      try { rows = await fetchJson(url); }
      catch (e) { console.log(`    fetch failed at offset ${offset}: ${e.message}`); break; }
      if (!Array.isArray(rows) || !rows.length) break;
      let newThisPage = 0;
      for (const r of rows) {
        if (!r.facility_id || seen.has(r.facility_id)) continue;
        // Prefer the most recent year's data
        seen.set(r.facility_id, { ...r, _ghg_year: year });
        newThisPage++;
      }
      process.stdout.write(`\r    unique facilities: ${seen.size.toLocaleString()} (+${newThisPage} this page)`);
      if (rows.length < chunk) break;
      offset += chunk;
      await new Promise(res => setTimeout(res, 250));
    }
    process.stdout.write('\n');
  }
  return Array.from(seen.values());
}

// Lookup year-aggregated emissions for a batch of facility IDs.
async function pullEpaEmissions(facilityIds, year) {
  console.log(`\n🌡  Pulling ${EPA_YEAR} CO2e totals for ${facilityIds.length} facilities…`);
  const out = new Map();
  // Pull emissions in batches of 100 IDs
  for (let i = 0; i < facilityIds.length; i += 100) {
    const ids = facilityIds.slice(i, i + 100);
    const url = `${EPA_BASE}/PUB_FACTS_SECTOR_GHG_EMISSION/year/${year}/facility_id/IN/${ids.join(',')}/ROWS/0:999/JSON`;
    let rows;
    try { rows = await fetchJson(url); }
    catch { continue; }
    for (const r of rows || []) {
      const id = r.facility_id;
      out.set(id, (out.get(id) || 0) + (parseFloat(r.co2e_emission) || 0));
    }
    process.stdout.write(`\r  emissions resolved: ${out.size.toLocaleString()}`);
    await new Promise(res => setTimeout(res, 250));
  }
  process.stdout.write('\n');
  return out;
}

function epaToLead(facility, totalCo2e) {
  const naics = (facility.naics_code || '').toString();
  return {
    clientId:     `epa-${facility.facility_id}`,
    company:      titleCase(facility.facility_name || `EPA Facility ${facility.facility_id}`),
    category:     'commercial_solar',
    city:         titleCase(facility.city || ''),
    state:        facility.state || null,
    contactTitle: 'Director of Facilities',
    website:      null,
    pitchAngle:   buildEpaPitch(facility, totalCo2e),
    source:       'epa_ghgrp',
  };
}

function buildEpaPitch(f, tons) {
  const naics = (f.naics_code || '').toString();
  const naicsHint = naics.startsWith('493') ? 'Refrigerated warehousing'
                   : naics.startsWith('5182') ? 'Data center'
                   : naics.startsWith('221') ? 'Power generation'
                   : naics.startsWith('311') ? 'Food manufacturing'
                   : naics.startsWith('325') ? 'Chemical manufacturing'
                   : naics.startsWith('33')  ? 'Heavy manufacturing'
                   : naics.startsWith('622') ? 'Hospital'
                   : naics.startsWith('322') ? 'Pulp & paper'
                   : naics.startsWith('327') ? 'Cement / glass'
                   : naics.startsWith('324') ? 'Petroleum refining'
                   : 'Industrial facility';
  const year = f._ghg_year || '';
  const tonsLabel = tons
    ? `${Math.round(tons).toLocaleString()} tCO2e/yr`
    : (year ? `${year} EPA GHG Reporter` : 'EPA GHG Reporter');
  return `${naicsHint} — ${tonsLabel}. NAICS ${naics}. Pre-qualified high-energy solar candidate.`;
}

// ── USAspending pull ──────────────────────────────────────────────────────
async function pullUsa(perNaics) {
  console.log(`\n💼 Pulling USAspending awardees (target ${perNaics * NAICS_TARGETS.length} max)…`);
  const seen = new Map();

  for (const naics of NAICS_TARGETS) {
    console.log(`  → NAICS ${naics}`);
    let page = 1;
    let kept = 0;
    while (kept < perNaics && page <= 5) {
      const body = {
        filters: {
          time_period: [{ start_date: '2022-01-01', end_date: new Date().toISOString().slice(0, 10) }],
          award_type_codes: ['A', 'B', 'C', 'D'],
          naics_codes: [naics],
        },
        fields: ['Recipient Name', 'Award Amount', 'NAICS',
          'place_of_performance_state_code', 'place_of_performance_city',
          'place_of_performance_zip5', 'recipient_id'],
        page,
        limit: 100,
        sort: 'Award Amount',
        order: 'desc',
      };
      let resp;
      try {
        resp = await fetch(`${USA_BASE}/search/spending_by_award/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
          body: JSON.stringify(body),
        });
        if (!resp.ok) { console.log(`    ⚠ ${resp.status} ${resp.statusText}`); break; }
      } catch (e) { console.log(`    ⚠ ${e.message}`); break; }
      const data = await resp.json();
      const results = data.results || [];
      if (!results.length) break;
      for (const a of results) {
        const rid = a.recipient_id || `${a['Recipient Name']}-${a.internal_id}`;
        if (seen.has(rid)) continue;
        seen.set(rid, { ...a, _naics: naics });
        kept++;
        if (kept >= perNaics) break;
      }
      if (!data.page_metadata?.hasNext) break;
      page++;
      await new Promise(res => setTimeout(res, 250));
    }
    process.stdout.write(`    +${kept} unique  (total: ${seen.size.toLocaleString()})\n`);
  }
  return Array.from(seen.values());
}

function usaToLead(award, idx) {
  const naics = award.NAICS?.code || award._naics || '';
  const desc  = award.NAICS?.description || '';
  const city  = titleCase(award.place_of_performance_city || '');
  const state = award.place_of_performance_state_code || null;
  return {
    clientId:     `usa-${award.recipient_id || award.internal_id || idx}`,
    company:      titleCase(award['Recipient Name']),
    category:     'commercial_solar',
    city:         city || null,
    state:        state,
    contactTitle: 'Director of Facilities',
    website:      null,
    pitchAngle:   `${titleCase(desc) || 'Federal contractor'}. NAICS ${naics}. Recent federal awards $${Math.round((award['Award Amount'] || 0) / 1000).toLocaleString()}K — stable, taxable corporate buyer.`,
    source:       'usa_spending',
  };
}

// ── OSM industrial buildings pull ────────────────────────────────────────
// Pulls every named warehouse / industrial building polygon across a list
// of major US metros via the Overpass API. Each lead has real building
// footprint + location, even if the operator's contact info is unknown.
const OSM_METROS = [
  { name: 'Phoenix',         bbox: '33.20,-112.55,33.95,-111.50' },
  { name: 'Houston',         bbox: '29.45,-95.85,30.30,-94.90' },
  { name: 'Dallas-FW',       bbox: '32.50,-97.70,33.20,-96.40' },
  { name: 'Los Angeles',     bbox: '33.85,-118.80,34.50,-117.85' },
  { name: 'Inland Empire CA',bbox: '33.55,-118.00,34.10,-117.10' },
  { name: 'Bay Area',        bbox: '37.45,-122.60,38.05,-121.70' },
  { name: 'Miami-Dade',      bbox: '25.40,-80.55,26.20,-80.05' },
  { name: 'Tampa',           bbox: '27.70,-82.90,28.30,-82.20' },
  { name: 'Jacksonville',    bbox: '30.15,-82.00,30.55,-81.35' },
  { name: 'Atlanta',         bbox: '33.50,-84.80,34.10,-84.10' },
  { name: 'Charlotte',       bbox: '35.05,-81.15,35.50,-80.55' },
  { name: 'NJ-Phila Port',   bbox: '39.65,-75.35,40.15,-74.35' },
  { name: 'NY-NJ Port',      bbox: '40.55,-74.35,41.00,-73.65' },
  { name: 'Chicago',         bbox: '41.50,-88.35,42.10,-87.45' },
  { name: 'Cleveland',       bbox: '41.25,-82.15,41.70,-81.45' },
  { name: 'Columbus',        bbox: '39.55,-83.25,40.25,-82.65' },
  { name: 'Las Vegas',       bbox: '35.95,-115.45,36.40,-114.85' },
  { name: 'Denver',          bbox: '39.55,-105.00,39.90,-104.60' },
  { name: 'Seattle',         bbox: '47.35,-122.55,47.85,-122.05' },
  { name: 'DC-Baltimore',    bbox: '38.45,-77.15,39.50,-76.40' },
  { name: 'Memphis',         bbox: '34.95,-90.30,35.30,-89.65' },
  { name: 'Indianapolis',    bbox: '39.55,-86.55,40.05,-85.85' },
  { name: 'Nashville',       bbox: '35.95,-87.05,36.40,-86.50' },
  { name: 'Salt Lake City',  bbox: '40.55,-112.20,40.90,-111.70' },
  { name: 'Portland OR',     bbox: '45.40,-123.05,45.65,-122.40' },
  { name: 'Detroit',         bbox: '42.20,-83.30,42.55,-82.85' },
  { name: 'Minneapolis',     bbox: '44.85,-93.45,45.10,-93.05' },
  { name: 'St Louis',        bbox: '38.45,-90.45,38.85,-89.95' },
  { name: 'Kansas City',     bbox: '38.85,-94.85,39.30,-94.30' },
  { name: 'Pittsburgh',      bbox: '40.25,-80.20,40.60,-79.75' },
  { name: 'Cincinnati',      bbox: '39.05,-84.75,39.30,-84.30' },
  { name: 'San Antonio',     bbox: '29.20,-98.85,29.65,-98.25' },
  { name: 'Austin',          bbox: '30.05,-97.95,30.55,-97.55' },
  { name: 'Sacramento',      bbox: '38.40,-121.65,38.75,-121.25' },
  { name: 'Boston',          bbox: '42.20,-71.25,42.45,-70.95' },
  { name: 'Orlando',         bbox: '28.30,-81.55,28.70,-81.15' },
  { name: 'Raleigh-Durham',  bbox: '35.65,-79.10,36.10,-78.55' },
  { name: 'Richmond',        bbox: '37.40,-77.60,37.70,-77.30' },
  { name: 'Tucson',          bbox: '32.05,-111.10,32.40,-110.75' },
];

// Update STATE_FOR_BBOX with the new metros
const STATE_FOR_BBOX_EXTRA = {
  '42.20,-83.30,42.55,-82.85': 'MI', '44.85,-93.45,45.10,-93.05': 'MN',
  '38.45,-90.45,38.85,-89.95': 'MO', '38.85,-94.85,39.30,-94.30': 'MO',
  '40.25,-80.20,40.60,-79.75': 'PA', '39.05,-84.75,39.30,-84.30': 'OH',
  '29.20,-98.85,29.65,-98.25': 'TX', '30.05,-97.95,30.55,-97.55': 'TX',
  '38.40,-121.65,38.75,-121.25': 'CA', '42.20,-71.25,42.45,-70.95': 'MA',
  '28.30,-81.55,28.70,-81.15': 'FL', '35.65,-79.10,36.10,-78.55': 'NC',
  '37.40,-77.60,37.70,-77.30': 'VA', '32.05,-111.10,32.40,-110.75': 'AZ',
};

async function pullOsmIndustrial(maxPerMetro = 250) {
  console.log(`\n🏗  Pulling OSM warehouse + industrial buildings across ${OSM_METROS.length} metros…`);
  const out = [];
  for (const metro of OSM_METROS) {
    const [s, w, n, e] = metro.bbox.split(',').map(parseFloat);
    const query = `[out:json][timeout:60];
(
  way["building"~"warehouse|industrial"]["name"](${s},${w},${n},${e});
  way["landuse"="industrial"]["name"](${s},${w},${n},${e});
);
out tags center ${maxPerMetro};`;
    try {
      const r = await fetch(OVERPASS, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'User-Agent': UA },
        body: query,
      });
      if (!r.ok) { console.log(`  ${metro.name}: ${r.status}`); continue; }
      const data = await r.json();
      const els = (data.elements || []).filter(el => el.tags?.name);
      for (const el of els) {
        const tags = el.tags || {};
        out.push({
          osmId: `osm-${el.id}`,
          name: tags.operator || tags.name,
          city: tags['addr:city'] || metro.name,
          state: tags['addr:state'] || guessStateFromBbox(metro.bbox),
          street: tags['addr:street'] || null,
          zip: tags['addr:postcode'] || null,
          industry: tags.industrial || tags.building || tags.landuse || 'industrial',
          lat: el.center?.lat || null,
          lng: el.center?.lon || null,
        });
      }
      console.log(`  ${metro.name}: +${els.length} buildings (total: ${out.length})`);
    } catch (e) { console.log(`  ${metro.name}: ${e.message}`); }
    // Overpass is rate-sensitive — throttle hard.
    await new Promise(r => setTimeout(r, 1500));
  }
  return out;
}

const STATE_FOR_BBOX = {
  '33.20,-112.55,33.95,-111.50': 'AZ', '29.45,-95.85,30.30,-94.90': 'TX',
  '32.50,-97.70,33.20,-96.40': 'TX',   '33.85,-118.80,34.50,-117.85': 'CA',
  '33.55,-118.00,34.10,-117.10': 'CA', '37.45,-122.60,38.05,-121.70': 'CA',
  '25.40,-80.55,26.20,-80.05': 'FL',   '27.70,-82.90,28.30,-82.20': 'FL',
  '30.15,-82.00,30.55,-81.35': 'FL',   '33.50,-84.80,34.10,-84.10': 'GA',
  '35.05,-81.15,35.50,-80.55': 'NC',   '39.65,-75.35,40.15,-74.35': 'NJ',
  '40.55,-74.35,41.00,-73.65': 'NY',   '41.50,-88.35,42.10,-87.45': 'IL',
  '41.25,-82.15,41.70,-81.45': 'OH',   '39.55,-83.25,40.25,-82.65': 'OH',
  '35.95,-115.45,36.40,-114.85': 'NV', '39.55,-105.00,39.90,-104.60': 'CO',
  '47.35,-122.55,47.85,-122.05': 'WA', '38.45,-77.15,39.50,-76.40': 'MD',
  '34.95,-90.30,35.30,-89.65': 'TN',   '39.55,-86.55,40.05,-85.85': 'IN',
  '35.95,-87.05,36.40,-86.50': 'TN',   '40.55,-112.20,40.90,-111.70': 'UT',
  '45.40,-123.05,45.65,-122.40': 'OR',
};
function guessStateFromBbox(bbox) {
  return STATE_FOR_BBOX[bbox] || STATE_FOR_BBOX_EXTRA[bbox] || null;
}

function osmToLead(b) {
  return {
    clientId:     b.osmId,
    company:      titleCase(b.name),
    category:     'commercial_solar',
    city:         titleCase(b.city || ''),
    state:        b.state,
    contactTitle: 'Director of Facilities',
    website:      null,
    pitchAngle:   `${titleCase(b.industry || 'industrial')} building. Roof-suitable for rooftop PV. Verify ownership + contact before outreach.`,
    source:       'osm_industrial',
  };
}

// ── helpers ──────────────────────────────────────────────────────────────
function titleCase(s) {
  if (!s) return '';
  return String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
}

function writeSeedFile(filename, header, leads) {
  const lines = [
    header,
    'const LEADS = [',
    ...leads.map(l => '  ' + JSON.stringify(l) + ','),
    '];',
    '',
    'module.exports = { LEADS };',
    '',
  ];
  fs.writeFileSync(path.join(OUT_DIR, filename), lines.join('\n'));
}

// ── main ────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌞 HelioScout — Real Lead Puller');
  console.log(`   EPA target: ${EPA_ROWS.toLocaleString()} facilities (year ${EPA_YEAR})`);
  console.log(`   USAspending target: ${USA_PER_NAICS} per ${NAICS_TARGETS.length} NAICS = up to ${(USA_PER_NAICS * NAICS_TARGETS.length).toLocaleString()}`);

  const epaFacilities = await pullEpa(EPA_ROWS);
  console.log(`✓ EPA facilities pulled: ${epaFacilities.length.toLocaleString()}`);

  // Note: EPA per-facility emissions aren't joinable via the public REST API
  // (the IN/<id-list> filter isn't supported on PUB_FACTS_SECTOR_GHG_EMISSION).
  // We carry the year forward as a recency signal instead.
  const epaLeads = epaFacilities
    .map(f => epaToLead(f, null))
    .filter(l => l.company && l.state)
    .slice(0, EPA_ROWS);

  writeSeedFile(
    'seed-epa-facilities.js',
    `/**\n * Real EPA GHGRP facilities (pulled ${new Date().toISOString().slice(0, 10)}).\n * Year: ${EPA_YEAR}. ${epaLeads.length.toLocaleString()} verified facilities.\n * Generated by scripts/pull-real-leads.js — do not edit by hand.\n */`,
    epaLeads
  );
  console.log(`✓ Wrote seed-epa-facilities.js: ${epaLeads.length.toLocaleString()} leads`);

  const usaAwards = await pullUsa(USA_PER_NAICS);
  const usaLeads = usaAwards.map((a, i) => usaToLead(a, i)).filter(l => l.company);
  writeSeedFile(
    'seed-usaspending-leads.js',
    `/**\n * Real USAspending federal awardees in high-energy NAICS sectors.\n * Pulled ${new Date().toISOString().slice(0, 10)}. ${usaLeads.length.toLocaleString()} unique recipients.\n * Generated by scripts/pull-real-leads.js — do not edit by hand.\n */`,
    usaLeads
  );
  console.log(`✓ Wrote seed-usaspending-leads.js: ${usaLeads.length.toLocaleString()} leads`);

  const osmBuildings = await pullOsmIndustrial(parseInt(args['osm-per-metro'] || '250', 10));
  const osmLeads = osmBuildings.map(b => osmToLead(b)).filter(l => l.company && l.company.length > 2);
  writeSeedFile(
    'seed-osm-industrial.js',
    `/**\n * Real OSM-tagged industrial / warehouse buildings across top US metros.\n * Pulled ${new Date().toISOString().slice(0, 10)}. ${osmLeads.length.toLocaleString()} unique named buildings.\n * Generated by scripts/pull-real-leads.js — do not edit by hand.\n */`,
    osmLeads
  );
  console.log(`✓ Wrote seed-osm-industrial.js: ${osmLeads.length.toLocaleString()} leads`);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  const total = epaLeads.length + usaLeads.length + osmLeads.length;
  console.log(`✅ Total new leads written: ${total.toLocaleString()}`);
  console.log(`   EPA GHGRP:    ${epaLeads.length.toLocaleString()}`);
  console.log(`   USAspending:  ${usaLeads.length.toLocaleString()}`);
  console.log(`   OSM metros:   ${osmLeads.length.toLocaleString()}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
