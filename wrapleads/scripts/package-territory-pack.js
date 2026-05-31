#!/usr/bin/env node
/**
 * Territory pack packager — turns the seed data into salable CSV products.
 *
 * For a given state, generates a branded CSV with:
 *   - Company name + city + state + NAICS + source
 *   - Solar fit score (from naics-solar-fit.js)
 *   - Energy intensity, recommended ownership model, sales script
 *   - Estimated system kW + 25-yr NPV range (if building_sqft can be inferred)
 *
 * Usage:
 *   node scripts/package-territory-pack.js --state=TX --out=./out/TX-pack.csv
 *   node scripts/package-territory-pack.js --state=ALL_HOT  (generates one per hot state)
 *
 * Output is what we *sell* to commercial solar installers via cold outbound.
 * Per-pack pricing $497-$1997 depending on size.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const naicsFit = require('../lib/naics-solar-fit');
const solarMath = require('../lib/solar-math');
const incentives = require('../lib/solar-incentives');

const HOT_STATES = ['TX', 'CA', 'FL', 'NY', 'NJ', 'AZ', 'PA', 'OH', 'IL', 'GA'];

const COLS = [
  'company','city','state','source','source_id','provenance_url',
  'naics_code','naics_sector','solar_fit_score','energy_intensity',
  'tax_appetite','recommended_ownership','load_profile',
  'est_system_kw','est_annual_kwh','est_annual_savings_usd',
  'est_net_payback_yrs','est_25yr_npv_p50_usd',
  'sales_script','script_cfo','script_facilities','script_sustainability',
  'pitch_angle',
];

function loadAllSeeds() {
  const files = ['seed-epa-facilities','seed-usaspending-leads','seed-osm-industrial','seed-solar'];
  const out = [];
  for (const f of files) {
    try {
      const leads = require(path.join(__dirname, '..', f)).LEADS || [];
      for (const l of leads) out.push(l);
    } catch (e) {
      console.warn(`  ⚠ ${f}: ${e.message}`);
    }
  }
  return out;
}

// Estimate building sqft from NAICS code when explicit sqft isn't on the lead.
// Conservative midpoints from EPA CBECS 2018 + Costar industrial benchmarks.
function estimateSqftFromNaics(naics) {
  if (!naics) return 50000;
  const code = String(naics);
  if (code.startsWith('4931')) return 180000; // cold storage
  if (code.startsWith('5182')) return 80000;  // data center
  if (code.startsWith('221')) return 100000;  // power gen
  if (code.startsWith('311')) return 90000;   // food mfg
  if (code.startsWith('325')) return 120000;  // chemical
  if (code.startsWith('327')) return 70000;   // cement / glass
  if (code.startsWith('322')) return 250000;  // pulp + paper (massive)
  if (code.startsWith('324')) return 200000;  // petroleum refining
  if (code.startsWith('33'))  return 95000;   // heavy mfg
  if (code.startsWith('42'))  return 110000;  // wholesale
  if (code.startsWith('49'))  return 140000;  // warehousing
  if (code.startsWith('622')) return 200000;  // hospital
  return 50000;
}

// Per-state mean commercial electric rate ($/kWh). Used to compute first-year
// savings without a per-utility lookup. Values from EIA Form 826 (2024).
const STATE_RATE = {
  AK: 0.21, AL: 0.13, AR: 0.10, AZ: 0.13, CA: 0.27, CO: 0.12, CT: 0.22,
  DC: 0.16, DE: 0.13, FL: 0.12, GA: 0.13, HI: 0.40, IA: 0.10, ID: 0.10,
  IL: 0.11, IN: 0.13, KS: 0.13, KY: 0.12, LA: 0.10, MA: 0.23, MD: 0.13,
  ME: 0.18, MI: 0.14, MN: 0.13, MO: 0.11, MS: 0.13, MT: 0.12, NC: 0.10,
  ND: 0.10, NE: 0.10, NH: 0.20, NJ: 0.17, NM: 0.12, NV: 0.12, NY: 0.21,
  OH: 0.12, OK: 0.10, OR: 0.11, PA: 0.13, RI: 0.20, SC: 0.12, SD: 0.11,
  TN: 0.13, TX: 0.10, UT: 0.10, VA: 0.10, VT: 0.20, WA: 0.10, WI: 0.13,
  WV: 0.11, WY: 0.11,
};
const DEFAULT_RATE = 0.13;

const NAICS_LABEL = {
  '49': 'Warehousing / Cold Storage', '33': 'Heavy Manufacturing',
  '32': 'Manufacturing', '31': 'Food / Beverage Manufacturing',
  '22': 'Utilities / Power', '42': 'Wholesale Distribution',
  '51': 'Information / Data Centers', '62': 'Healthcare',
  '61': 'Education', '72': 'Hospitality', '21': 'Mining / Extraction',
  '23': 'Construction', '44': 'Retail', '45': 'Retail',
};

function buildProvenanceUrl(source, sourceId) {
  if (!source || !sourceId) return '';
  if (source === 'epa_ghgrp' || source === 'epa') {
    return `https://ghgdata.epa.gov/ghgp/main.do#/facilityDetail?facilityId=${encodeURIComponent(sourceId)}`;
  }
  if (source === 'usaspending' || source === 'usa_spending') {
    return `https://www.usaspending.gov/search/?hash=${encodeURIComponent(sourceId)}`;
  }
  if (source === 'osm' || source === 'osm_industrial') {
    return `https://www.openstreetmap.org/${sourceId.includes('/') ? sourceId : 'way/' + sourceId}`;
  }
  return '';
}

function enrichLead(lead) {
  const naics = (lead.naics_code || '').toString() ||
    (naicsFit.inferNaicsFromIndustry(lead.industry || lead.pitchAngle || '')) || '';
  const fit = naicsFit.lookup(naics);
  const sqft = lead.building_sqft || estimateSqftFromNaics(naics);
  const rate = STATE_RATE[lead.state] || DEFAULT_RATE;
  const econ = solarMath.fullEstimate({
    buildingSqft: sqft, roofType: 'membrane', latitude: null,
    utilityRate: rate, estAnnualKwh: null,
  });
  // Quick incentive estimate (no DSIRE, no tariff — coarse but consistent).
  const stack = econ.system_kw > 0 ? incentives.calculateStack({
    grossCost: econ.gross_cost_usd,
    systemKw: econ.system_kw,
    annualKwh: econ.annual_kwh,
    state: lead.state, zip: null,
    bonuses: {},
  }) : null;
  const netPayback = stack ? incentives.netPaybackYears(stack.net_cost, econ.annual_savings_usd) : null;
  // Coarse 25-yr NPV approximation (no Monte Carlo — keep CSV gen fast).
  const npv25 = stack
    ? Math.round(econ.annual_savings_usd * 18 - stack.net_cost) // ~18 = sum of discounted years
    : null;
  return {
    company: lead.company,
    city: lead.city || '',
    state: lead.state || '',
    source: lead.source || '',
    source_id: lead.clientId || '',
    provenance_url: buildProvenanceUrl(lead.source, lead.clientId),
    naics_code: naics || '',
    naics_sector: NAICS_LABEL[naics.slice(0, 2)] || '',
    solar_fit_score: fit?.fit || '',
    energy_intensity: fit?.energy_intensity || '',
    tax_appetite: fit?.tax_appetite || '',
    recommended_ownership: fit?.ownership_model || '',
    load_profile: fit?.load_profile || '',
    est_system_kw: econ.system_kw,
    est_annual_kwh: econ.annual_kwh,
    est_annual_savings_usd: econ.annual_savings_usd,
    est_net_payback_yrs: netPayback || '',
    est_25yr_npv_p50_usd: npv25 || '',
    sales_script: fit?.sales_script || '',
    script_cfo: fit?.script_cfo || '',
    script_facilities: fit?.script_facilities || '',
    script_sustainability: fit?.script_sustainability || '',
    pitch_angle: lead.pitchAngle || '',
  };
}

function toCsv(rows) {
  const esc = (v) => v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`;
  const out = [COLS.join(',')];
  for (const r of rows) {
    out.push(COLS.map(c => esc(r[c])).join(','));
  }
  return out.join('\n');
}

function packageState(state, allLeads) {
  const inState = allLeads.filter(l => l.state === state);
  const enriched = inState.map(enrichLead);
  // Sort by solar_fit_score DESC, then est_annual_savings DESC.
  enriched.sort((a, b) => {
    const sa = Number(a.solar_fit_score) || 0;
    const sb = Number(b.solar_fit_score) || 0;
    if (sb !== sa) return sb - sa;
    return (b.est_annual_savings_usd || 0) - (a.est_annual_savings_usd || 0);
  });
  return enriched;
}

function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).filter(a => a.startsWith('--'))
      .map(a => a.replace(/^--/, '').split('='))
  );
  const all = loadAllSeeds();
  console.log(`Loaded ${all.length.toLocaleString()} leads across all seed files.`);

  const targets = args.state === 'ALL_HOT' || !args.state ? HOT_STATES : [args.state.toUpperCase()];
  const outDir = path.resolve(args.out || path.join(__dirname, '..', 'sales-assets', 'territory-packs'));
  fs.mkdirSync(outDir, { recursive: true });

  const summary = [];
  for (const st of targets) {
    const rows = packageState(st, all);
    const file = path.join(outDir, `helioscout-${st}-${rows.length}leads.csv`);
    fs.writeFileSync(file, toCsv(rows));
    const high = rows.filter(r => r.solar_fit_score >= 70).length;
    console.log(`  ${st}: ${rows.length.toLocaleString()} leads (${high.toLocaleString()} score 70+)  → ${path.relative(process.cwd(), file)}`);
    summary.push({ state: st, total: rows.length, high_fit: high, file: path.basename(file) });
  }

  // Also write a sample 50-lead pack mixing top states — used as a free sample
  const mix = [];
  for (const st of targets) {
    const rows = packageState(st, all);
    mix.push(...rows.slice(0, 5));
  }
  mix.sort((a, b) => Number(b.solar_fit_score || 0) - Number(a.solar_fit_score || 0));
  const sample = mix.slice(0, 50);
  const sampleFile = path.join(outDir, 'helioscout-sample-50leads.csv');
  fs.writeFileSync(sampleFile, toCsv(sample));
  console.log(`\n  SAMPLE: 50 leads → ${path.relative(process.cwd(), sampleFile)}`);

  console.log('\nSummary:');
  console.table(summary);
}

main();
