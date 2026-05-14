#!/usr/bin/env node
/**
 * demoSeed.js — one-shot enrichment for a demo account.
 *
 * autoSeed.js already loads ~500 leads at registration. This script layers on
 * the rest of the picture so a demo isn't staring at empty Bids / Jobs / Photos
 * kanban boards:
 *   - 6 bids spread across stages (tracking → submitted → shortlisted → won)
 *   - 4 installed jobs with varied install dates (aging + recent + upcoming expiry)
 *
 * Idempotent: re-running won't duplicate. Skips a bid/job if a row with the
 * same project_name / company + install_date already exists for that user.
 *
 * Usage:
 *   node lib/demoSeed.js --user-email demo@wrapleads.io
 *   node lib/demoSeed.js --user-id 42
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads',
});

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user-email') out.email = args[++i];
    else if (args[i] === '--user-id') out.id = args[++i];
  }
  return out;
}

async function resolveUserId({ email, id }) {
  if (id) return String(id);
  if (!email) throw new Error('Pass --user-email <email> or --user-id <id>');
  const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (!rows[0]) throw new Error(`No user found with email ${email}`);
  return String(rows[0].id);
}

// Days helper — returns a Date offset from today.
function daysFromNow(d) {
  const t = new Date();
  t.setDate(t.getDate() + d);
  return t;
}
function isoDate(d) { return d.toISOString().slice(0, 10); }

const BIDS = [
  {
    project_name: 'Carmel Library Renovation — Interior Graphics Package',
    gc_name: 'Pepper Construction',
    architect: 'CSO Architects',
    project_type: 'commercial_interior',
    bid_due: isoDate(daysFromNow(6)),
    estimated_value: 42000,
    source_platform: 'BidNet',
    status: 'tracking',
    notes: 'DI-NOC wall graphics + wayfinding. Pre-bid walkthrough scheduled.',
  },
  {
    project_name: 'IU Health South — Wayfinding + Lobby DI-NOC',
    gc_name: 'Messer Construction',
    architect: 'BSA LifeStructures',
    project_type: 'healthcare',
    bid_due: isoDate(daysFromNow(13)),
    estimated_value: 78000,
    source_platform: 'Building Connected',
    status: 'tracking',
    notes: '3M DI-NOC pre-spec from architect. Confirm install crew sizing.',
  },
  {
    project_name: 'Eskenazi Health Tenant Improvement — Patient Tower Floor 4',
    gc_name: 'Turner Construction',
    architect: 'HKS',
    project_type: 'healthcare',
    bid_due: isoDate(daysFromNow(-3)),
    estimated_value: 56000,
    source_platform: 'BidNet',
    status: 'submitted',
    notes: 'Submitted with alternate spec. Waiting on GC selection.',
  },
  {
    project_name: 'Salesforce Tower — Conference Center Refresh',
    gc_name: 'Shiel Sexton',
    architect: 'Ratio Architects',
    project_type: 'commercial_interior',
    bid_due: isoDate(daysFromNow(-10)),
    estimated_value: 31000,
    source_platform: 'Direct',
    status: 'submitted',
    notes: 'Negotiated material allowance with PM. Strong relationship.',
  },
  {
    project_name: 'Ivy Tech Indianapolis — Lobby + Cafeteria DI-NOC',
    gc_name: 'F.A. Wilhelm Construction',
    architect: 'Schmidt Associates',
    project_type: 'education',
    bid_due: isoDate(daysFromNow(-21)),
    estimated_value: 64000,
    source_platform: 'BidNet',
    status: 'shortlisted',
    notes: 'Final 2. Owner reviewing. Architect already endorsed our spec.',
  },
  {
    project_name: 'Cummins HQ — Engineering Wing Branded Graphics',
    gc_name: 'Powers & Sons',
    architect: 'Deborah Berke Partners',
    project_type: 'corporate',
    bid_due: isoDate(daysFromNow(-45)),
    estimated_value: 89000,
    source_platform: 'Direct',
    status: 'won',
    notes: 'Won via design firm referral. Install kickoff next month.',
  },
];

const JOBS = [
  {
    company: 'Indy Roofing & Restoration',
    vehicle_type: 'box_truck',
    vehicle_count: 6,
    wrap_category: 'fleet',
    material: '3M IJ180Cv3',
    install_date: isoDate(daysFromNow(-30)),
    life_years: 5,
    notes: 'Full fleet wrap. Logo + service callouts.',
  },
  {
    company: 'Hoosier HVAC Services',
    vehicle_type: 'van',
    vehicle_count: 4,
    wrap_category: 'fleet',
    material: 'Avery MPI 1105',
    install_date: isoDate(daysFromNow(-90)),
    life_years: 5,
    notes: 'Partial wrap + window graphics. Re-up due 2030.',
  },
  {
    company: 'Greenfield Custom Cabinets',
    vehicle_type: 'pickup',
    vehicle_count: 2,
    wrap_category: 'fleet',
    material: '3M IJ180Cv3',
    install_date: isoDate(daysFromNow(-1800)), // ~5 years ago — aging, due for refresh
    life_years: 5,
    notes: 'Aging wrap — flag for re-order outreach.',
  },
  {
    company: 'Carmel Pediatric Dental',
    vehicle_type: 'wall',
    vehicle_count: 1,
    wrap_category: 'dinoc',
    material: '3M DI-NOC FW-1738',
    install_date: isoDate(daysFromNow(-180)),
    life_years: 10,
    notes: 'Reception wall DI-NOC. Beautiful install — request photo for portfolio.',
  },
];

async function seedBids(userId) {
  let inserted = 0;
  for (const b of BIDS) {
    const existing = await pool.query(
      'SELECT id FROM bids WHERE user_id=$1 AND project_name=$2',
      [userId, b.project_name]
    );
    if (existing.rows[0]) continue;
    await pool.query(
      `INSERT INTO bids (user_id, project_name, gc_name, architect, project_type, bid_due, estimated_value, source_platform, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [userId, b.project_name, b.gc_name, b.architect, b.project_type, b.bid_due, b.estimated_value, b.source_platform, b.status, b.notes]
    );
    inserted++;
  }
  return inserted;
}

async function seedJobs(userId) {
  let inserted = 0;
  for (const j of JOBS) {
    const existing = await pool.query(
      'SELECT id FROM installed_jobs WHERE user_id=$1 AND company=$2 AND install_date=$3',
      [userId, j.company, j.install_date]
    );
    if (existing.rows[0]) continue;
    await pool.query(
      `INSERT INTO installed_jobs (user_id, company, vehicle_type, vehicle_count, wrap_category, material, install_date, life_years, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [userId, j.company, j.vehicle_type, j.vehicle_count, j.wrap_category, j.material, j.install_date, j.life_years, j.notes]
    );
    inserted++;
  }
  return inserted;
}

async function main() {
  try {
    const userId = await resolveUserId(parseArgs());
    console.log(`[demoSeed] Seeding demo data for user ${userId}…`);
    const bidsCount = await seedBids(userId);
    const jobsCount = await seedJobs(userId);
    console.log(`[demoSeed] Done. Bids inserted: ${bidsCount}. Jobs inserted: ${jobsCount}.`);
  } catch (e) {
    console.error('[demoSeed] Error:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
