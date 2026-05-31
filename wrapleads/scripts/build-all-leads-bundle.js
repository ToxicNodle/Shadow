#!/usr/bin/env node
/**
 * Build the unified all-leads downloadable bundle.
 *
 * Collates every committable seed file into three artifacts under
 *   sales-assets/all-leads/
 *
 *   - helioscout-all-leads.csv     (full UTF-8 CSV with header row)
 *   - helioscout-all-leads.jsonl   (one JSON object per line)
 *   - helioscout-all-leads.zip     (the CSV, gzip-deflated)
 *
 * Each output row carries: clientId, company, category, city, state,
 * contactTitle, website, pitchAngle, source, seedFile.
 *
 * Excluded seeds: `seed-dealerships.js`, `seed-hospitality.js` — they
 * print banners instead of exporting a LEADS array (they're DB-side
 * scripts, not pure data modules).
 *
 * Usage:  npm run bundle:all-leads
 *
 * Idempotent — overwrites the three artifacts in place each run.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Seed files that export { LEADS: [...] } — the standard contract.
const SEED_FILES = [
  'seed-leads',
  'seed-gc',
  'seed-designers',
  'seed-schools',
  'seed-racing',
  'seed-solar',
  'seed-epa-facilities',
  'seed-usaspending-leads',
  'seed-osm-industrial',
];

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'sales-assets', 'all-leads');

const COLS = [
  'clientId', 'company', 'category', 'city', 'state',
  'contactTitle', 'website', 'pitchAngle', 'source', 'seedFile',
];

function loadAll() {
  const out = [];
  const summary = [];
  for (const name of SEED_FILES) {
    try {
      const mod = require(path.join(ROOT, name));
      const leads = mod.LEADS || [];
      for (const l of leads) {
        out.push({
          clientId:     l.clientId || l.client_id || '',
          company:      l.company || '',
          category:     l.category || '',
          city:         l.city || '',
          state:        l.state || '',
          contactTitle: l.contactTitle || l.contact_title || '',
          website:      l.website || '',
          pitchAngle:   l.pitchAngle || l.pitch_angle || '',
          source:       l.source || '',
          seedFile:     name,
        });
      }
      summary.push({ file: name, count: leads.length });
    } catch (e) {
      summary.push({ file: name, error: e.message });
    }
  }
  return { rows: out, summary };
}

function csvEsc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  const lines = [COLS.join(',')];
  for (const r of rows) lines.push(COLS.map(c => csvEsc(r[c])).join(','));
  return lines.join('\n') + '\n';
}

function toJsonl(rows) {
  return rows.map(r => JSON.stringify(r)).join('\n') + '\n';
}

function main() {
  console.log('🌞 HelioScout — Building unified all-leads bundle…\n');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const t0 = Date.now();
  const { rows, summary } = loadAll();

  // Stable sort: by seedFile then company so the artifact is reproducible
  // (otherwise diffs flap based on require() insertion order).
  rows.sort((a, b) => a.seedFile.localeCompare(b.seedFile) || a.company.localeCompare(b.company));

  const csv = toCsv(rows);
  const csvPath = path.join(OUT_DIR, 'helioscout-all-leads.csv');
  fs.writeFileSync(csvPath, csv, 'utf-8');

  const jsonl = toJsonl(rows);
  const jsonlPath = path.join(OUT_DIR, 'helioscout-all-leads.jsonl');
  fs.writeFileSync(jsonlPath, jsonl, 'utf-8');

  // Zip via system zip if available, else gzip the CSV as a fallback.
  const zipPath = path.join(OUT_DIR, 'helioscout-all-leads.zip');
  try {
    fs.rmSync(zipPath, { force: true });
    execSync(`cd "${OUT_DIR}" && zip -q helioscout-all-leads.zip helioscout-all-leads.csv`);
  } catch (e) {
    // Fallback: gzip — still small + universally decompressible.
    const zlib = require('zlib');
    fs.writeFileSync(zipPath.replace(/\.zip$/, '.csv.gz'), zlib.gzipSync(csv));
    console.warn('  ⚠ zip not available — wrote .csv.gz instead');
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  console.log('Per-seed breakdown:');
  console.table(summary);

  console.log(`\nArtifacts (in ${path.relative(process.cwd(), OUT_DIR)}/):`);
  for (const f of fs.readdirSync(OUT_DIR)) {
    const stat = fs.statSync(path.join(OUT_DIR, f));
    const sz = stat.size >= 1024 * 1024
      ? (stat.size / 1024 / 1024).toFixed(2) + ' MB'
      : (stat.size / 1024).toFixed(1) + ' KB';
    console.log(`  ${f.padEnd(36)}  ${sz.padStart(10)}`);
  }

  console.log(`\n✅ ${rows.length.toLocaleString()} total leads written in ${dt}s`);
}

main();
