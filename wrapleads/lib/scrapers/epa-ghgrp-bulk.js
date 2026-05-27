/**
 * EPA GHGRP — bulk dataset ingest.
 *
 * The live Envirofacts REST API is rate-limited and brittle. For populating
 * a fresh database with all ~8,000 reporting facilities at once, EPA
 * publishes a yearly bulk Excel/CSV dump at:
 *
 *   https://www.epa.gov/ghgreporting/data-sets
 *
 * The most useful artifact is "ghgp_data_<year>.zip" which contains an
 * Excel workbook with one tab per subsector. We pull the CSV mirror via
 * EPA's Envirofacts JSON service and stream-insert in batches of 500.
 *
 * Works in two modes:
 *
 *   1. STATE_SWEEP — iterates all 50 states + DC, calling the live API per
 *      state until the running total reaches `targetCount`. Best for an
 *      initial population of ~5-10k facilities.
 *
 *   2. BULK_URL  — when --url=<csv-url> is passed, downloads + parses an
 *      external CSV (e.g. an EPA dataset mirror) and bulk-inserts.
 *      Best for filling 20k+ in a single pass.
 *
 * Either path produces identical `companies` rows with source='epa_ghgrp'
 * and intent_signal='ghg_reporter'.
 */

'use strict';

const ghgrp = require('./epa-ghgrp');

// US states + DC.
const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

// Sweep across states until `targetCount` facilities are imported (or all
// states are exhausted). Tracks running totals across invocations.
async function stateSweep({ pool, targetCount = 20000, year = 2023, minTons = 25000, log = console.log }) {
  let total = 0, inserted = 0, updated = 0, skipped = 0;
  const startedAt = Date.now();
  for (const state of STATES) {
    if (inserted + updated >= targetCount) break;
    log(`\n   [${state}] fetching GHG-reporting facilities (year ${year})…`);
    try {
      const r = await ghgrp.run({
        pool, state, year, minTons,
        max: Math.min(500, targetCount - inserted - updated + 50),
        log,
      });
      total += r.total; inserted += r.inserted; updated += r.updated; skipped += r.skipped;
      log(`   [${state}] +${r.inserted} new, ${r.updated} updated — running total: ${inserted + updated} / ${targetCount.toLocaleString()}`);
    } catch (e) {
      log(`   [${state}] ⚠ ${e.message} — skipping`);
    }
    // Polite throttle between state queries.
    await new Promise(r => setTimeout(r, 750));
  }
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  log(`\n   ✓ State sweep complete in ${seconds}s — ${inserted} new, ${updated} updated, ${skipped} skipped`);
  return { total, inserted, updated, skipped };
}

// External CSV bulk import (e.g., an EPA dataset mirror).
async function bulkFromUrl({ pool, url, log = console.log }) {
  if (!url) throw new Error('bulkFromUrl requires --url=<csv-url>');
  log(`   Downloading ${url}…`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed: ${r.status} ${r.statusText}`);
  const csv = await r.text();
  log(`   Parsing ${(csv.length / 1024 / 1024).toFixed(1)} MB…`);
  // Re-use the CSV scraper's column-mapping logic.
  const fs = require('fs');
  const tmpPath = require('path').join(require('os').tmpdir(), `epa-bulk-${Date.now()}.csv`);
  fs.writeFileSync(tmpPath, csv);
  try {
    return await require('./csv-commercial').run({ pool, file: tmpPath, log });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* non-fatal */ }
  }
}

async function run({ pool, target = 20000, url = null, year = 2023, minTons = 25000, log = console.log }) {
  if (url) return bulkFromUrl({ pool, url, log });
  return stateSweep({ pool, targetCount: target, year, minTons, log });
}

module.exports = { run, stateSweep, bulkFromUrl, STATES };
