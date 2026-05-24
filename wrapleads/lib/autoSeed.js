/**
 * autoSeed — fires automatically when a new user registers.
 * Loads all curated lead data into the new user's CRM in the background.
 * Zero command-line interaction ever required.
 */

const path = require('path');

// Import lead arrays from all seed files
let ALL_LEADS = [];
try {
  const { LEADS: leads }     = require(path.join(__dirname, '../seed-leads'));
  const { LEADS: gc }        = require(path.join(__dirname, '../seed-gc'));
  const { LEADS: designers } = require(path.join(__dirname, '../seed-designers'));
  const { LEADS: schools }   = require(path.join(__dirname, '../seed-schools'));
  const { LEADS: racing }    = require(path.join(__dirname, '../seed-racing'));
  const { LEADS: solar }     = require(path.join(__dirname, '../seed-solar'));
  ALL_LEADS = [...(leads||[]), ...(gc||[]), ...(designers||[]), ...(schools||[]), ...(racing||[]), ...(solar||[])];
  console.log(`[autoSeed] Loaded ${ALL_LEADS.length} total leads from seed files`);
} catch (e) {
  console.warn('[autoSeed] Could not load seed files:', e.message);
}

// Status distribution for seeded leads — spreads the pipeline so demos look
// real instead of every lead sitting in 'new'. Sums to 100.
const STATUS_DISTRIBUTION = [
  { status: 'cold',      weight: 40 },
  { status: 'contacted', weight: 25 },
  { status: 'replied',   weight: 15 },
  { status: 'meeting',   weight: 8  },
  { status: 'proposal',  weight: 6  },
  { status: 'won',       weight: 3  },
  { status: 'lost',      weight: 3  },
];

// Deterministic status assignment by hashing the client_id. Same lead always
// gets the same status across users, so the demo is consistent.
function pickStatus(clientId) {
  if (!clientId) return 'cold';
  let h = 0;
  for (let i = 0; i < clientId.length; i++) {
    h = ((h << 5) - h + clientId.charCodeAt(i)) | 0;
  }
  const bucket = Math.abs(h) % 100;
  let cum = 0;
  for (const { status, weight } of STATUS_DISTRIBUTION) {
    cum += weight;
    if (bucket < cum) return status;
  }
  return 'cold';
}

/**
 * Seeds all curated leads for a single user. Fire-and-forget from register endpoint.
 * Safe to call multiple times — ON CONFLICT DO NOTHING.
 */
// Days-overdue offset by status — makes Mission Dashboard show real activity immediately
const FOLLOWUP_OFFSET_DAYS = {
  contacted: -16, // 16 days overdue — push to call queue
  replied:   -3,  // 3 days overdue — needs proposal
  meeting:   -2,  // 2 days post-meeting — send recap/quote
  proposal:  -7,  // 7 days since proposal — follow up
};

async function autoSeedUser(userId, pool) {
  if (!ALL_LEADS.length) return;
  const uid = String(userId);
  let inserted = 0;

  for (const lead of ALL_LEADS) {
    try {
      const clientId = lead.clientId || lead.client_id;
      const status = pickStatus(clientId);
      // For touched leads, stamp last_contacted so the activity timeline isn't empty.
      const lastContacted = status === 'cold' ? null : new Date(Date.now() - (Math.abs(clientId?.length || 0) % 30) * 86400000);
      // Set followup_due_at for active leads so the Mission view shows real overdue items.
      const offsetDays = FOLLOWUP_OFFSET_DAYS[status];
      const followupDueAt = offsetDays !== undefined
        ? new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10)
        : null;
      const r = await pool.query(`
        INSERT INTO leads (
          user_id, client_id, company, category, city, state, country,
          contact_title, website, pitch_angle, status, source, notes, last_contacted,
          followup_due_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,'US',$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (user_id, client_id) DO NOTHING
        RETURNING id
      `, [
        uid,
        clientId,
        lead.company,
        lead.category,
        lead.city || null,
        lead.state || null,
        lead.contactTitle || lead.contact_title || null,
        lead.website || null,
        lead.pitchAngle || lead.pitch_angle || null,
        status,
        lead.source || 'auto_seed',
        null,
        lastContacted,
        followupDueAt,
      ]);
      if (r.rows.length) inserted++;
    } catch (e) {
      // skip individual failures silently — don't block other leads
    }
  }

  console.log(`[autoSeed] User ${uid} — seeded ${inserted} leads`);

  // Seed demo bids and installed jobs so new users land in a full app.
  await seedDemoBids(uid, pool);
  await seedDemoJobs(uid, pool);
}

// ── Demo bids + jobs ───────────────────────────────────────────────────────────
// Seeded once per new user so Bids and Jobs views aren't empty at first login.

function isoDate(d) {
  const t = new Date();
  t.setDate(t.getDate() + d);
  return t.toISOString().slice(0, 10);
}

const SEED_BIDS = [
  {
    project_name: 'Library Renovation — Interior Graphics Package',
    gc_name: 'Pepper Construction', architect: 'CSO Architects',
    project_type: 'dinoc', bid_due: () => isoDate(6),
    estimated_value: 42000, source_platform: 'planhub', status: 'tracking',
    notes: 'DI-NOC wall graphics + wayfinding. Pre-bid walkthrough scheduled.',
  },
  {
    project_name: 'Medical Center Tenant Improvement — Patient Tower',
    gc_name: 'Messer Construction', architect: 'BSA LifeStructures',
    project_type: 'dinoc', bid_due: () => isoDate(13),
    estimated_value: 78000, source_platform: 'building_connected', status: 'tracking',
    notes: '3M DI-NOC pre-spec from architect. Confirm install crew sizing.',
  },
  {
    project_name: 'Corporate HQ — Conference Center Refresh',
    gc_name: 'Turner Construction', architect: 'Ratio Architects',
    project_type: 'general', bid_due: () => isoDate(-10),
    estimated_value: 56000, source_platform: 'isqft', status: 'submitted',
    notes: 'Submitted with alternate spec. Waiting on GC selection.',
  },
  {
    project_name: 'University Student Center — Lobby DI-NOC',
    gc_name: 'F.A. Wilhelm Construction', architect: 'Schmidt Associates',
    project_type: 'dinoc', bid_due: () => isoDate(-21),
    estimated_value: 64000, source_platform: 'isqft', status: 'shortlisted',
    notes: 'Final 2. Owner reviewing. Architect already endorsed spec.',
  },
  {
    project_name: 'Tech Campus — Engineering Wing Branded Graphics',
    gc_name: 'Powers & Sons', architect: 'Deborah Berke Partners',
    project_type: 'signage', bid_due: () => isoDate(-45),
    estimated_value: 89000, source_platform: 'direct', status: 'won',
    notes: 'Won via design firm referral. Install kickoff next month.',
  },
];

const SEED_JOBS = [
  {
    company: 'Metro Roofing & Restoration',
    vehicle_type: 'box_truck_16', vehicle_count: 6, wrap_category: 'fleet',
    material: '3M IJ180Cv3', install_date: () => isoDate(-30), life_years: 5,
    notes: 'Full fleet wrap. Logo + service callouts.',
  },
  {
    company: 'Regional HVAC Services',
    vehicle_type: 'cargo_van_standard', vehicle_count: 4, wrap_category: 'fleet',
    material: 'Avery MPI 1105', install_date: () => isoDate(-90), life_years: 5,
    notes: 'Partial wrap + window graphics. Re-up due in 5 years.',
  },
  {
    company: 'Greenfield Custom Cabinets',
    vehicle_type: 'pickup_truck', vehicle_count: 2, wrap_category: 'fleet',
    material: '3M IJ180Cv3', install_date: () => isoDate(-1800), life_years: 5,
    notes: 'Aging wrap — flag for re-order outreach.',
  },
  {
    company: 'Lakeside Pediatric Dental',
    vehicle_type: 'other', vehicle_count: 1, wrap_category: 'dinoc',
    material: '3M DI-NOC FW-1738', install_date: () => isoDate(-180), life_years: 10,
    notes: 'Reception wall DI-NOC. Beautiful install — request photo for portfolio.',
  },
];

async function seedDemoBids(uid, pool) {
  for (const b of SEED_BIDS) {
    try {
      const ex = await pool.query('SELECT id FROM bids WHERE user_id=$1 AND project_name=$2', [uid, b.project_name]);
      if (ex.rows[0]) continue;
      await pool.query(
        `INSERT INTO bids (user_id, project_name, gc_name, architect, project_type, bid_due, estimated_value, source_platform, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [uid, b.project_name, b.gc_name || null, b.architect || null, b.project_type, b.bid_due(), b.estimated_value, b.source_platform, b.status, b.notes]
      );
    } catch (e) { /* non-fatal */ }
  }
}

async function seedDemoJobs(uid, pool) {
  for (const j of SEED_JOBS) {
    try {
      const ex = await pool.query('SELECT id FROM installed_jobs WHERE user_id=$1 AND company=$2 AND vehicle_type=$3', [uid, j.company, j.vehicle_type]);
      if (ex.rows[0]) continue;
      await pool.query(
        `INSERT INTO installed_jobs (user_id, company, vehicle_type, vehicle_count, wrap_category, material, install_date, life_years, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uid, j.company, j.vehicle_type, j.vehicle_count, j.wrap_category, j.material, j.install_date(), j.life_years, j.notes]
      );
    } catch (e) { /* non-fatal */ }
  }
}

module.exports = { autoSeedUser, totalLeads: ALL_LEADS.length };
