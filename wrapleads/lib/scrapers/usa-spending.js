/**
 * USAspending.gov scraper — federal contract & grant recipients.
 *
 * Public API at https://api.usaspending.gov — no key required, generous
 * rate limits. Every dollar the federal government spends is tagged with
 * a recipient (a company or non-profit) that has a verified address,
 * DUNS / UEI identifier, and NAICS code.
 *
 * Why this is great for solar lead-gen:
 *   - Recipients have audited addresses and contact data
 *   - NAICS coverage means we can filter to heavy-energy sectors
 *   - Many federal awards mandate energy / sustainability reporting,
 *     which means decision-makers are already thinking about ESG
 *   - Recipients of USDA REAP, DOE SETP, and SBA grants are explicitly
 *     interested in clean-energy capex — these are warm leads
 *
 * Usage:
 *   npm run ingest:commercial -- --source=usa-spending \\
 *     --awarding=DOE \\        # filter by awarding agency code
 *     --state=AZ \\
 *     --naics=311              # NAICS prefix filter
 *     --min-amount=100000      # min award size
 */

'use strict';

const BASE = 'https://api.usaspending.gov/api/v2';
const UA = 'WrapLeads-SolarScout/1.0';

const HIGH_ENERGY_NAICS_PREFIXES = [
  '311', '312', '321', '322', '323', '324', '325', '326', '327',  // manufacturing
  '331', '332', '333', '334', '335', '336', '337', '339',          // more manufacturing
  '4225', '493',                                                    // warehousing
  '518', '519',                                                     // data centers / info
  '622',                                                            // hospitals
  '6113',                                                           // universities
];

async function searchAwards({ state, naicsPrefix, awarding, minAmount, perPage = 100, max = 500 }) {
  const out = [];
  let page = 1;
  while (out.length < max) {
    const body = {
      filters: {
        time_period: [{ start_date: '2022-01-01', end_date: new Date().toISOString().slice(0, 10) }],
        award_type_codes: ['A', 'B', 'C', 'D'], // contract types
        ...(state ? { place_of_performance_locations: [{ country: 'USA', state }] } : {}),
        ...(awarding ? { agencies: [{ type: 'awarding', tier: 'toptier', name: awarding }] } : {}),
        ...(naicsPrefix ? { naics_codes: { require: [naicsPrefix.toString()] } } : {}),
        ...(minAmount ? { award_amounts: [{ lower_bound: parseFloat(minAmount) }] } : {}),
      },
      fields: ['Award ID', 'Recipient Name', 'Recipient DUNS Number', 'recipient_id', 'Award Amount',
        'Awarding Agency', 'Awarding Sub Agency', 'Description', 'Start Date', 'NAICS',
        'recipient_unique_id', 'place_of_performance_state_code', 'place_of_performance_city',
        'place_of_performance_zip5'],
      page,
      limit: Math.min(perPage, max - out.length),
      sort: 'Award Amount',
      order: 'desc',
    };
    let resp;
    try {
      resp = await fetch(`${BASE}/search/spending_by_award/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(`USAspending network error: ${e.message}`);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`USAspending ${resp.status}: ${text.slice(0, 200)}`);
    }
    const data = await resp.json();
    const results = data.results || [];
    if (!results.length) break;
    out.push(...results);
    if (results.length < body.limit) break;
    page++;
    await new Promise(r => setTimeout(r, 300));
  }
  return out;
}

// Enrich an award row with recipient details (full address, parent company,
// UEI) via the recipient profile endpoint.
async function fetchRecipientProfile(recipientId) {
  if (!recipientId) return null;
  try {
    const r = await fetch(`${BASE}/recipient/${recipientId}/`, { headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function flushBatch(pool, batch) {
  const cols = [
    'source','source_id','name','dba_name','street','city','state','zip',
    'country','phone','email','website','industry','naics_code',
    'is_owner_occupied','raw_data',
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
      name        = EXCLUDED.name,
      dba_name    = COALESCE(EXCLUDED.dba_name, companies.dba_name),
      naics_code  = COALESCE(EXCLUDED.naics_code, companies.naics_code),
      industry    = COALESCE(EXCLUDED.industry, companies.industry),
      raw_data    = companies.raw_data || EXCLUDED.raw_data,
      updated_at  = NOW()
    RETURNING (xmax = 0) AS was_inserted
  `;
  const r = await pool.query(sql, values);
  let inserted = 0, updated = 0;
  for (const row of r.rows) { if (row.was_inserted) inserted++; else updated++; }
  return { inserted, updated };
}

async function run({ pool, state = null, naicsPrefix = null, awarding = null, minAmount = 100000, max = 500, log = console.log }) {
  // If no NAICS filter given, sweep across high-energy prefixes — this gives
  // us a curated solar-relevant lead set without forcing the user to pick.
  const prefixes = naicsPrefix ? [naicsPrefix] : HIGH_ENERGY_NAICS_PREFIXES;
  let total = 0, inserted = 0, updated = 0, skipped = 0;
  let batch = [];

  for (const prefix of prefixes) {
    log(`   → NAICS prefix ${prefix}${state ? ' state=' + state : ''}${awarding ? ' awarding=' + awarding : ''}`);
    let awards = [];
    try {
      awards = await searchAwards({
        state, naicsPrefix: prefix, awarding, minAmount,
        max: Math.ceil(max / prefixes.length),
      });
    } catch (e) {
      log(`     ⚠ ${e.message}`);
      continue;
    }
    log(`     ${awards.length} awards found`);

    for (const a of awards) {
      total++;
      const name = a['Recipient Name'] || a.recipient_name;
      const rid  = a.recipient_id || a['recipient_id'];
      if (!name) { skipped++; continue; }
      // Use UEI / DUNS / recipient_id as the source key for idempotency.
      const sourceId = rid || a['Recipient DUNS Number'] || a.recipient_unique_id || `${name}-${a['Award ID']}`;

      batch.push({
        source:     'usa_spending',
        source_id:  `usaspending-${sourceId}`,
        name,
        dba_name:   null,
        street:     null,
        city:       a.place_of_performance_city || a['place_of_performance_city'] || null,
        state:      (a.place_of_performance_state_code || a['place_of_performance_state_code'] || '').toUpperCase() || null,
        zip:        a.place_of_performance_zip5 || a['place_of_performance_zip5'] || null,
        country:    'US',
        phone:      null,
        email:      null,
        website:    null,
        industry:   a.NAICS || a.naics || null,
        naics_code: (a.NAICS || a.naics || '').toString().match(/^\d+/)?.[0] || null,
        is_owner_occupied: null,
        raw_data: {
          usa_spending: {
            award_id: a['Award ID'],
            amount:   parseFloat(a['Award Amount']) || null,
            agency:   a['Awarding Agency'],
            sub_agency: a['Awarding Sub Agency'],
            description: (a.Description || '').slice(0, 500),
            start_date: a['Start Date'],
            recipient_id: rid,
          },
        },
      });
      if (batch.length >= 100) {
        const r = await flushBatch(pool, batch);
        inserted += r.inserted; updated += r.updated;
        batch = [];
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }
  if (batch.length) {
    const r = await flushBatch(pool, batch);
    inserted += r.inserted; updated += r.updated;
  }
  return { total, inserted, updated, skipped };
}

module.exports = { run, fetchRecipientProfile, HIGH_ENERGY_NAICS_PREFIXES };
