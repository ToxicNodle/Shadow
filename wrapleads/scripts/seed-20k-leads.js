#!/usr/bin/env node
/**
 * HelioScout — 20K lead seeding orchestrator.
 *
 * One command to populate a fresh database with 20,000+ verified
 * commercial solar leads pulled from public government data sources.
 *
 * Source mix (totals are conservative):
 *   - EPA GHGRP state sweep   ≈ 7,000–8,500 facilities
 *   - USAspending high-energy NAICS sweep ≈ 5,000–8,000 entities
 *   - EIA-861 large customers ≈ pending (see TODO)
 *   - OSM warehouses across top 25 metros ≈ 8,000+ buildings
 *
 * Usage:
 *   npm run seed:leads -- --target=20000
 *
 * Requires:
 *   - DATABASE_URL pointing at a writable Postgres
 *   - Outbound network access (no API keys required for any of the sources)
 *
 * Each ingest run logs to ingest_runs so failures + counts are auditable.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const SOURCES = [
  {
    name: 'EPA GHGRP (state sweep)',
    target: 8000,
    run: async (pool, log) => {
      const ghgrpBulk = require('../lib/scrapers/epa-ghgrp-bulk');
      return await ghgrpBulk.run({ pool, target: 8000, year: 2023, log });
    },
  },
  {
    name: 'USAspending (high-energy NAICS)',
    target: 6000,
    run: async (pool, log) => {
      const us = require('../lib/scrapers/usa-spending');
      return await us.run({ pool, max: 6000, minAmount: 100000, log });
    },
  },
  {
    name: 'OSM industrial buildings (top 20 metros)',
    target: 8000,
    run: async (pool, log) => {
      const osm = require('../lib/scrapers/osm-overpass');
      const METROS = [
        'bbox:33.30,-112.40,33.85,-111.70',  // Phoenix
        'bbox:29.50,-95.70,30.20,-95.00',    // Houston
        'bbox:32.60,-97.60,33.10,-96.50',    // Dallas-Fort Worth
        'bbox:33.95,-118.70,34.35,-118.00',  // Los Angeles
        'bbox:33.65,-117.90,34.00,-117.20',  // Inland Empire CA
        'bbox:37.55,-122.50,37.95,-121.80',  // Bay Area
        'bbox:25.50,-80.50,26.10,-80.10',    // Miami-Dade
        'bbox:27.80,-82.80,28.20,-82.30',    // Tampa
        'bbox:30.20,-81.90,30.50,-81.40',    // Jacksonville
        'bbox:33.55,-84.70,34.00,-84.20',    // Atlanta
        'bbox:35.10,-81.10,35.40,-80.60',    // Charlotte
        'bbox:39.70,-75.30,40.10,-74.40',    // South NJ / Phila
        'bbox:40.60,-74.30,40.95,-73.70',    // NY-NJ Port
        'bbox:41.55,-88.30,42.05,-87.50',    // Chicago
        'bbox:41.30,-82.10,41.65,-81.50',    // Cleveland
        'bbox:39.60,-83.20,40.20,-82.70',    // Columbus
        'bbox:36.00,-115.40,36.35,-114.90',  // Las Vegas
        'bbox:39.60,-104.95,39.85,-104.65',  // Denver
        'bbox:47.40,-122.50,47.80,-122.10',  // Seattle
        'bbox:38.50,-77.10,38.90,-76.80',    // DC
      ];
      let total = 0, inserted = 0, updated = 0;
      for (const region of METROS) {
        try {
          log(`   → metro ${region}`);
          const r = await osm.run({ pool, region, max: 500, log: () => {} });
          total += r.total; inserted += r.inserted; updated += r.updated;
          log(`     +${r.inserted} new (${total + r.total} total)`);
        } catch (e) { log(`     ⚠ ${e.message}`); }
      }
      return { total, inserted, updated, skipped: 0 };
    },
  },
];

async function main() {
  const args = process.argv.slice(2);
  const target = parseInt((args.find(a => a.startsWith('--target=')) || '--target=20000').split('=')[1], 10);
  const dryRun = args.includes('--dry-run');

  const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log(`\n🌞 HelioScout — 20K Lead Seeding Orchestrator`);
  console.log(`   Target: ${target.toLocaleString()} leads`);
  console.log(`   Database: ${DATABASE_URL.replace(/:[^:@]*@/, ':****@')}`);
  console.log(`   Dry run: ${dryRun}\n`);

  try {
    await pool.query('SELECT 1 FROM companies LIMIT 1');
  } catch (e) {
    console.error(`❌ Database not reachable: ${e.message}`);
    console.error(`   Try: npm run db:up\n`);
    process.exit(1);
  }

  const startedAt = Date.now();
  const summary = [];
  let runningTotal = 0;

  for (const source of SOURCES) {
    console.log(`\n━━━ ${source.name} ━━━`);
    if (dryRun) {
      console.log(`   (dry run — would target ${source.target.toLocaleString()})`);
      continue;
    }
    if (runningTotal >= target) {
      console.log(`   Skipping — already hit target of ${target.toLocaleString()}`);
      break;
    }
    try {
      const r = await source.run(pool, console.log);
      summary.push({ source: source.name, inserted: r.inserted, updated: r.updated, total: r.total });
      runningTotal += r.inserted + r.updated;
      console.log(`   ✓ ${source.name}: +${r.inserted} new, ${r.updated} updated`);
    } catch (e) {
      summary.push({ source: source.name, error: e.message });
      console.error(`   ❌ ${source.name}: ${e.message}`);
    }
  }

  const minutes = ((Date.now() - startedAt) / 1000 / 60).toFixed(1);
  const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS n FROM companies`);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Seeding complete in ${minutes} min`);
  console.log(`   Companies in DB: ${countRows[0].n.toLocaleString()}`);
  console.log(`\nPer-source breakdown:`);
  for (const s of summary) {
    if (s.error) console.log(`   ❌ ${s.source}: ${s.error}`);
    else console.log(`   ✓ ${s.source}: ${s.inserted.toLocaleString()} new / ${s.updated.toLocaleString()} updated`);
  }
  console.log('');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
