/**
 * Generic CSV upserter for commercial property exports.
 *
 * Designed to consume LoopNet, CoStar, and county-assessor CSV dumps without
 * pre-shaping. Header normalization tolerates the common column-name variants
 * used in those sources.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Field aliases — first match wins. Headers are lowercased and stripped of
// non-alphanumerics before lookup.
const FIELDS = {
  name:           ['propertyname','buildingname','name','owner','ownername','companyname','company'],
  street:         ['address','street','propertyaddress','streetaddress','siteaddress','addr','addressline1'],
  city:           ['city','town','locality'],
  state:          ['state','stateprovince','province'],
  zip:            ['zip','zipcode','postalcode','postcode'],
  phone:          ['phone','phonenumber','telephone','ownerphone','contactphone'],
  email:          ['email','emailaddress','contactemail','owneremail'],
  website:        ['website','url','web','domain'],
  building_sqft:  ['buildingsqft','sqft','squarefeet','grossarea','grosssqft','rentablearea','buildingsize'],
  roof_type:      ['rooftype','roofmaterial','roof'],
  utility_provider:['utilityprovider','utility','electricprovider','poweredby'],
  est_annual_kwh: ['annualkwh','estimatedkwh','annualenergy','yearlykwh'],
  latitude:       ['latitude','lat'],
  longitude:      ['longitude','lng','lon'],
  naics_code:     ['naics','naicscode','sic','siccode'],
  parcel_id:      ['parcel','parcelid','apn','parcelnumber'],
};

const NORM = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function buildColMap(headers) {
  const normalized = headers.map(NORM);
  const map = {};
  for (const [field, aliases] of Object.entries(FIELDS)) {
    for (let i = 0; i < normalized.length; i++) {
      if (aliases.includes(normalized[i])) { map[field] = i; break; }
    }
  }
  return map;
}

function intOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v).replace(/[,\s]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function floatOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/[,\s]/g, ''));
  return isNaN(n) ? null : n;
}

// Light roof-type normalization so heterogenous source data still scores well.
function normalizeRoof(raw) {
  if (!raw) return null;
  const v = String(raw).toLowerCase();
  if (/metal|steel|standing seam/.test(v)) return 'metal';
  if (/membrane|epdm|tpo|pvc|single[- ]?ply/.test(v)) return 'membrane';
  if (/flat|built[- ]?up|concrete/.test(v))  return 'flat';
  if (/shingle|asphalt|comp/.test(v))        return 'shingle';
  return 'unknown';
}

async function flushBatch(pool, batch) {
  const cols = [
    'source','source_id','name','street','city','state','zip','country',
    'phone','email','website','industry','building_sqft','roof_type',
    'utility_provider','est_annual_kwh','latitude','longitude','naics_code','raw_data',
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
      phone            = COALESCE(EXCLUDED.phone, companies.phone),
      email            = COALESCE(EXCLUDED.email, companies.email),
      website          = COALESCE(EXCLUDED.website, companies.website),
      building_sqft    = COALESCE(EXCLUDED.building_sqft, companies.building_sqft),
      roof_type        = COALESCE(EXCLUDED.roof_type, companies.roof_type),
      utility_provider = COALESCE(EXCLUDED.utility_provider, companies.utility_provider),
      est_annual_kwh   = COALESCE(EXCLUDED.est_annual_kwh, companies.est_annual_kwh),
      latitude         = COALESCE(EXCLUDED.latitude, companies.latitude),
      longitude        = COALESCE(EXCLUDED.longitude, companies.longitude),
      naics_code       = COALESCE(EXCLUDED.naics_code, companies.naics_code),
      raw_data         = EXCLUDED.raw_data,
      updated_at       = NOW()
    RETURNING (xmax = 0) AS was_inserted
  `;
  const r = await pool.query(sql, values);
  let inserted = 0, updated = 0;
  for (const row of r.rows) { if (row.was_inserted) inserted++; else updated++; }
  return { inserted, updated };
}

async function run({ pool, file, log = console.log }) {
  if (!file) throw new Error('--file <path-to-csv> is required');
  if (!fs.existsSync(file)) throw new Error(`CSV not found: ${file}`);
  const csv = fs.readFileSync(file, 'utf-8');
  const rows = parse(csv, { columns: false, skip_empty_lines: true, relax_column_count: true });
  if (rows.length < 2) throw new Error('CSV needs a header row + at least one data row');

  const headers = rows[0];
  const colMap = buildColMap(headers);
  if (!('name' in colMap)) throw new Error('CSV missing a company/property name column (tried: ' + FIELDS.name.join(', ') + ')');

  const sourceKey = 'commercial_csv_' + path.basename(file).replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  log(`   Source key: ${sourceKey}`);
  log(`   Mapped columns: ${Object.keys(colMap).join(', ')}`);

  let total = 0, inserted = 0, updated = 0, skipped = 0;
  let batch = [];
  const BATCH_SIZE = 100;

  for (let i = 1; i < rows.length; i++) {
    total++;
    const row = rows[i];
    if (row.every(c => !c)) { skipped++; continue; }
    const cell = (field) => colMap[field] !== undefined ? String(row[colMap[field]] ?? '').trim() : '';

    const name = cell('name');
    if (!name) { skipped++; continue; }

    const parcel = cell('parcel_id');
    // Use parcel ID as source_id when available — it's the canonical key in
    // assessor data. Otherwise fall back to row index for stable identity.
    const sourceId = parcel || `${sourceKey}_row${i}`;

    batch.push({
      source:           sourceKey,
      source_id:        sourceId,
      name,
      street:           cell('street') || null,
      city:             cell('city') || null,
      state:            (cell('state') || '').toUpperCase().slice(0, 2) || null,
      zip:              cell('zip') || null,
      country:          'US',
      phone:            cell('phone') || null,
      email:            cell('email') || null,
      website:          cell('website') || null,
      industry:         'commercial_property',
      building_sqft:    intOrNull(cell('building_sqft')),
      roof_type:        normalizeRoof(cell('roof_type')),
      utility_provider: cell('utility_provider') || null,
      est_annual_kwh:   intOrNull(cell('est_annual_kwh')),
      latitude:         floatOrNull(cell('latitude')),
      longitude:        floatOrNull(cell('longitude')),
      naics_code:       cell('naics_code') || null,
      raw_data:         Object.fromEntries(headers.map((h, idx) => [h, row[idx] ?? null])),
    });

    if (batch.length >= BATCH_SIZE) {
      const r = await flushBatch(pool, batch);
      inserted += r.inserted; updated += r.updated;
      batch = [];
    }
  }

  if (batch.length) {
    const r = await flushBatch(pool, batch);
    inserted += r.inserted; updated += r.updated;
  }

  return { total, inserted, updated, skipped };
}

module.exports = { run };
