/**
 * City Permit Feed scraper — hot buying-signal source.
 *
 * Recently issued building permits are the strongest commercial-solar buying
 * signal we can scrape for free: a new roof = perfect substrate + 25 year
 * window where the owner is open to capex; an electrical-service upgrade =
 * existing solar plan or capacity expansion.
 *
 * Each city's open data portal exposes permits via Socrata-style endpoints.
 * The current adapter set covers a handful of high-density commercial markets;
 * additional cities slot in by adding entries to the CITIES table.
 *
 * Stored with source='permit_feed' and a `permit_signal` tag in raw_data so
 * the discover view can surface them as 🔥 hot leads.
 */

'use strict';

// Each adapter normalizes its city's permit feed into a common shape:
//   { permit_id, name (owner/contractor/site), street, city, state, zip,
//     issued_date, value, description, signal_type }
//
// signal_type is one of: 'new_roof', 'electrical_upgrade', 'solar', 'other'
const CITIES = {
  // NYC DOB — Job Application Filings, public Socrata endpoint
  nyc: {
    state: 'NY',
    url: 'https://data.cityofnewyork.us/resource/ic3t-wcy2.json',
    queryDays: 90,
    fetch: async (days) => {
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const where = encodeURIComponent(`pre__filing_date >= '${since}'`);
      const url = `https://data.cityofnewyork.us/resource/ic3t-wcy2.json?$where=${where}&$limit=500`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const rows = await r.json();
      return rows.map(p => normalize({
        permit_id: `nyc-${p.job_filing_number || p.job__ || ''}`,
        name: p.owner_s_business_name || p.applicant_s_first_name || 'NYC Property',
        street: p.house__ ? `${p.house__} ${p.street_name || ''}`.trim() : null,
        city: 'New York', state: 'NY', zip: p.zip_code || null,
        issued_date: p.pre__filing_date,
        value: parseFloat(p.initial_cost) || null,
        description: p.job_description || '',
      }));
    },
  },

  // Los Angeles Open Data — Building & Safety Permits
  la: {
    state: 'CA',
    url: 'https://data.lacity.org/resource/yv23-pmwf.json',
    queryDays: 90,
    fetch: async (days) => {
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const where = encodeURIComponent(`issue_date >= '${since}'`);
      const url = `https://data.lacity.org/resource/yv23-pmwf.json?$where=${where}&$limit=500`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const rows = await r.json();
      return rows.map(p => normalize({
        permit_id: `la-${p.pcis_permit__ || p.permit__ || ''}`,
        name: p.applicant_business_name || 'LA Property',
        street: p.address_start ? `${p.address_start} ${p.street_direction || ''} ${p.street_name || ''}`.trim() : null,
        city: 'Los Angeles', state: 'CA', zip: p.zip_code || null,
        issued_date: p.issue_date,
        value: parseFloat(p.valuation) || null,
        description: p.permit_sub_type || p.work_description || '',
      }));
    },
  },

  // Chicago Open Data — Building Permits
  chicago: {
    state: 'IL',
    url: 'https://data.cityofchicago.org/resource/ydr8-5enu.json',
    queryDays: 90,
    fetch: async (days) => {
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const where = encodeURIComponent(`issue_date >= '${since}'`);
      const url = `https://data.cityofchicago.org/resource/ydr8-5enu.json?$where=${where}&$limit=500`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const rows = await r.json();
      return rows.map(p => normalize({
        permit_id: `chi-${p.id || p.permit_ || ''}`,
        name: p.contact_1_name || 'Chicago Property',
        street: p.street_name ? `${p.street_number || ''} ${p.street_direction || ''} ${p.street_name}`.trim() : null,
        city: 'Chicago', state: 'IL', zip: null,
        issued_date: p.issue_date,
        value: parseFloat(p.estimated_cost) || null,
        description: p.permit_type || p.work_description || '',
      }));
    },
  },

  // Austin Open Data — Construction Permits
  austin: {
    state: 'TX',
    url: 'https://data.austintexas.gov/resource/3syk-w9eu.json',
    queryDays: 90,
    fetch: async (days) => {
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const where = encodeURIComponent(`issued_date >= '${since}'`);
      const url = `https://data.austintexas.gov/resource/3syk-w9eu.json?$where=${where}&$limit=500`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const rows = await r.json();
      return rows.map(p => normalize({
        permit_id: `aus-${p.permit_number || ''}`,
        name: p.applicant_full_name || 'Austin Property',
        street: p.original_address1 || null,
        city: 'Austin', state: 'TX', zip: p.original_zip || null,
        issued_date: p.issued_date,
        value: parseFloat(p.total_job_valuation) || null,
        description: p.description || p.permit_type_desc || '',
      }));
    },
  },
};

const ROOF_RE     = /\b(re[- ]?roof|new roof|roof replac|reroof|roof install)/i;
const ELEC_RE     = /\b(electric.{0,20}(upgrade|service|panel)|service upgrade|panel upgrade|switchgear)/i;
const SOLAR_RE    = /\b(solar|photovoltaic|pv\s|pv\b|net meter)/i;
const COMMERCIAL_RE = /\b(commercial|industrial|warehouse|manufactur|distribut|office|retail)/i;

function classifySignal(description) {
  const d = (description || '').toLowerCase();
  if (SOLAR_RE.test(d))  return 'solar';
  if (ROOF_RE.test(d))   return 'new_roof';
  if (ELEC_RE.test(d))   return 'electrical_upgrade';
  return 'other';
}

function normalize(raw) {
  return {
    ...raw,
    signal_type: classifySignal(raw.description),
    is_commercial_hint: COMMERCIAL_RE.test(raw.description || '') || (raw.value && raw.value > 100000),
  };
}

async function flushBatch(pool, batch) {
  const cols = [
    'source','source_id','name','street','city','state','zip','country',
    'industry','raw_data',
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
      name       = EXCLUDED.name,
      raw_data   = companies.raw_data || EXCLUDED.raw_data,
      updated_at = NOW()
    RETURNING (xmax = 0) AS was_inserted
  `;
  const r = await pool.query(sql, values);
  let inserted = 0, updated = 0;
  for (const row of r.rows) { if (row.was_inserted) inserted++; else updated++; }
  return { inserted, updated };
}

async function run({ pool, city = 'all', days = 90, log = console.log }) {
  const cityKeys = city === 'all' ? Object.keys(CITIES) : [city];
  let total = 0, inserted = 0, updated = 0, skipped = 0;
  let batch = [];

  for (const key of cityKeys) {
    const adapter = CITIES[key];
    if (!adapter) { log(`   ⚠ Unknown city: ${key} (try: ${Object.keys(CITIES).join(', ')})`); continue; }
    log(`   → ${key.toUpperCase()} permits (last ${days}d)`);
    try {
      const rows = await adapter.fetch(days);
      // Only keep buying-signal permits: solar/new-roof/electrical upgrade,
      // and only if the description hints at commercial use OR the value is
      // high enough to imply commercial scale.
      const filtered = rows.filter(r => r.signal_type !== 'other' && r.is_commercial_hint);
      log(`     ${rows.length} permits → ${filtered.length} commercial buying-signals`);

      for (const p of filtered) {
        total++;
        if (!p.permit_id || !p.name) { skipped++; continue; }
        batch.push({
          source:     'permit_feed',
          source_id:  p.permit_id,
          name:       p.name,
          street:     p.street,
          city:       p.city,
          state:      p.state,
          zip:        p.zip,
          country:    'US',
          industry:   `permit_${p.signal_type}`,
          raw_data:   {
            permit_signal: p.signal_type,
            issued_date:   p.issued_date,
            value:         p.value,
            description:   p.description,
            source_city:   key,
          },
        });
        if (batch.length >= 100) {
          const r = await flushBatch(pool, batch);
          inserted += r.inserted; updated += r.updated;
          batch = [];
        }
      }
    } catch (e) {
      log(`     ⚠ ${key} fetch failed: ${e.message}`);
    }
  }

  if (batch.length) {
    const r = await flushBatch(pool, batch);
    inserted += r.inserted; updated += r.updated;
  }

  return { total, inserted, updated, skipped };
}

module.exports = { run, CITIES };
