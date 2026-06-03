/**
 * EPA Greenhouse Gas Reporting Program (GHGRP) scraper.
 *
 * The single most valuable free commercial-solar lead source in the US:
 * every facility emitting >25,000 metric tons CO2e per year (~8,000
 * facilities) is on this public list. By definition these are large
 * energy consumers — manufacturing, power generation, refineries,
 * cement, data centers, large commercial buildings — i.e. exactly the
 * customer profile we want.
 *
 * Data source: EPA Envirofacts FRS_FACILITY_SITE + GHG_EMISSIONS API
 *   https://www.epa.gov/enviro/envirofacts-data-service-api
 *
 * What we extract per facility:
 *   - facility_name, parent_company, address, city, state, zip
 *   - latitude, longitude
 *   - primary_naics + secondary_naics
 *   - annual CO2e emissions (tons)
 *   - sector (industrial / power / commercial / waste)
 *
 * Stamps the lead with:
 *   - source = 'epa_ghgrp'
 *   - intent_signal = 'ghg_reporter' (boosts solar_score)
 *   - raw_data.annual_co2e_tons
 *   - naics_code from EPA registry
 *
 * Even without contact info, the facility name + parent company are
 * enough for Apollo enrichment to find decision-makers.
 */

'use strict';

const BASE = 'https://data.epa.gov/efservice';
const UA = 'WrapLeads-SolarScout/1.0';

// Envirofacts API has a row-count limit per request (~10000) and pagination
// uses /START/:offset/END/:offset+rowsPerPage path segments instead of query
// params. Page size 1000 keeps individual requests under the timeout window.
const PAGE_SIZE = 1000;

// CSV is faster + more reliable than JSON for large pulls.
async function fetchPage(query, offset, limit) {
  // EPA Envirofacts: /efservice/<TABLE>/<FILTERS>/<START>/<COUNT>/CSV
  const url = `${BASE}/${query}/ROWS/${offset}:${offset + limit - 1}/CSV`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/csv' } });
  if (!r.ok) throw new Error(`EPA API ${r.status} ${r.statusText} — ${url}`);
  return await r.text();
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const rows = lines.slice(1).map(parseCsvLine);
  return { headers, rows };
}

// Minimal CSV splitter — handles quoted commas. EPA CSVs don't include
// embedded newlines in fields so we don't need full RFC 4180 support.
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function rowToObj(headers, row) {
  const o = {};
  for (let i = 0; i < headers.length; i++) o[headers[i]] = row[i] ?? null;
  return o;
}

// Map EPA "Industry Type Subsection" to a coarse solar-fit sector tag.
const SECTOR_TAGS = {
  '1': 'power_generation',
  '2': 'industrial',
  '3': 'industrial',
  '4': 'commercial',
  '5': 'waste',
};

async function flushBatch(pool, batch) {
  const cols = [
    'source','source_id','name','dba_name','street','city','state','zip',
    'country','phone','email','website','industry','naics_code','est_annual_kwh',
    'latitude','longitude','intent_signal','intent_signal_at','raw_data',
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
      dba_name         = COALESCE(EXCLUDED.dba_name, companies.dba_name),
      naics_code       = COALESCE(EXCLUDED.naics_code, companies.naics_code),
      est_annual_kwh   = COALESCE(EXCLUDED.est_annual_kwh, companies.est_annual_kwh),
      latitude         = COALESCE(EXCLUDED.latitude, companies.latitude),
      longitude        = COALESCE(EXCLUDED.longitude, companies.longitude),
      intent_signal    = COALESCE(EXCLUDED.intent_signal, companies.intent_signal),
      intent_signal_at = COALESCE(EXCLUDED.intent_signal_at, companies.intent_signal_at),
      raw_data         = companies.raw_data || EXCLUDED.raw_data,
      updated_at       = NOW()
    RETURNING (xmax = 0) AS was_inserted
  `;
  const r = await pool.query(sql, values);
  let inserted = 0, updated = 0;
  for (const row of r.rows) { if (row.was_inserted) inserted++; else updated++; }
  return { inserted, updated };
}

// Convert EPA-reported tCO2e emissions to a rough annual-kWh estimate.
// US grid emission factor is ~0.4 kg CO2 per kWh (national avg) — used in
// reverse to approximate electrical consumption from total CO2. This is a
// gross approximation since GHGRP also captures combustion + process
// emissions, but it gives a useful solar-sizing baseline.
function tonsCO2eToAnnualKwh(tons) {
  if (!tons || tons <= 0) return null;
  // 1 ton CO2 = ~2500 kWh of electrical equivalent on average grid
  return Math.round(tons * 2500);
}

/**
 * Fetch facility records from EPA Envirofacts. Two queries are joined in
 * memory to map FRS facility data to GHGRP emissions:
 *   - GHG_EMISSIONS.FACILITY_ID + REPORTING_YEAR + ANNUAL_EMISSION
 *   - FRS_FACILITY_SITE.REGISTRY_ID + NAME + LOCATION + NAICS
 *
 * Filters: by state (USPS code) and minimum tons CO2e.
 */
async function run({ pool, state = null, minTons = 25000, max = 1000, year = 2023, log = console.log }) {
  // Build the EPA query path. EPA's URL syntax for filters:
  //   /TABLE/FIELD/OPERATOR/VALUE
  // We chain filters via additional path segments.
  let emissionsQ = `GHG.PUB_FACTS_SECTOR_GHG_EMISSION/REPORTING_YEAR/${year}/CO2_EQUIVALENT_EMISSIONS/>=/${minTons}`;
  if (state) emissionsQ += `/STATE/${state.toUpperCase()}`;

  log(`   Fetching EPA GHGRP emissions (year ${year}, ≥${minTons.toLocaleString()} tCO2e${state ? ', state=' + state : ''})…`);

  // Iteratively page through results.
  let allEmissions = [];
  let offset = 0;
  while (allEmissions.length < max) {
    const want = Math.min(PAGE_SIZE, max - allEmissions.length);
    let csv;
    try {
      csv = await fetchPage(emissionsQ, offset, want);
    } catch (e) {
      log(`   ⚠ EPA fetch failed at offset ${offset}: ${e.message}`);
      break;
    }
    const { headers, rows } = parseCsv(csv);
    if (!rows.length) break;
    for (const row of rows) allEmissions.push(rowToObj(headers, row));
    if (rows.length < want) break;
    offset += want;
    // Polite throttle.
    await new Promise(r => setTimeout(r, 200));
  }
  log(`   ✓ ${allEmissions.length} facilities pulled from GHG API`);
  if (!allEmissions.length) return { total: 0, inserted: 0, updated: 0, skipped: 0 };

  // Now fetch FRS_FACILITY_SITE metadata for the same facility IDs.
  // EPA caps IN-list filters at ~50 IDs per request, so we batch.
  const facilityIds = [...new Set(allEmissions.map(e => e.facility_id || e.frs_id).filter(Boolean))];
  const idToMeta = new Map();
  const CHUNK = 50;
  for (let i = 0; i < facilityIds.length; i += CHUNK) {
    const ids = facilityIds.slice(i, i + CHUNK);
    const q = `FRS.FRS_FACILITY_SITE/REGISTRY_ID/IN/${ids.join(',')}`;
    let csv;
    try { csv = await fetchPage(q, 0, ids.length); } catch { continue; }
    const { headers, rows } = parseCsv(csv);
    for (const row of rows) {
      const obj = rowToObj(headers, row);
      const id = obj.registry_id || obj.facility_id;
      if (id) idToMeta.set(String(id), obj);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  log(`   ✓ ${idToMeta.size} facility metadata rows resolved`);

  let inserted = 0, updated = 0, skipped = 0;
  let batch = [];
  for (const e of allEmissions) {
    const fid = String(e.facility_id || e.frs_id || '');
    if (!fid) { skipped++; continue; }
    const meta = idToMeta.get(fid) || {};
    const tons = parseFloat(e.co2_equivalent_emissions || e.annual_emission || 0);
    const name = meta.primary_name || e.facility_name || meta.facility_name || `EPA Facility ${fid}`;
    batch.push({
      source:           'epa_ghgrp',
      source_id:        `ghgrp-${fid}-${year}`,
      name,
      dba_name:         meta.alternative_names || null,
      street:           meta.location_address || meta.address || null,
      city:             meta.city_name || e.city || null,
      state:            (meta.state_code || e.state || '').toUpperCase() || null,
      zip:              meta.postal_code || e.zip || null,
      country:          'US',
      phone:            null,
      email:            null,
      website:          null,
      industry:         meta.naics_description || e.sector_name || `tCO2e=${Math.round(tons).toLocaleString()}`,
      naics_code:       meta.primary_naics_code || e.naics_code || null,
      est_annual_kwh:   tonsCO2eToAnnualKwh(tons),
      latitude:         meta.latitude_measure ? parseFloat(meta.latitude_measure) : null,
      longitude:        meta.longitude_measure ? parseFloat(meta.longitude_measure) : null,
      intent_signal:    'ghg_reporter',
      intent_signal_at: new Date().toISOString(),
      raw_data: {
        epa_ghgrp: {
          year,
          tons_co2e: tons,
          sector_tag: SECTOR_TAGS[(e.subpart_code || '')[0]] || null,
          parent_company: meta.owner_name || null,
        },
      },
    });
    if (batch.length >= 100) {
      const r = await flushBatch(pool, batch);
      inserted += r.inserted; updated += r.updated;
      batch = [];
    }
  }
  if (batch.length) {
    const r = await flushBatch(pool, batch);
    inserted += r.inserted; updated += r.updated;
  }
  return { total: allEmissions.length, inserted, updated, skipped };
}

module.exports = { run, tonsCO2eToAnnualKwh, SECTOR_TAGS };
