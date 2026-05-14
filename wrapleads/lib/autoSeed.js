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
  ALL_LEADS = [...(leads||[]), ...(gc||[]), ...(designers||[]), ...(schools||[]), ...(racing||[])];
  console.log(`[autoSeed] Loaded ${ALL_LEADS.length} total leads from seed files`);
} catch (e) {
  console.warn('[autoSeed] Could not load seed files:', e.message);
}

// Status distribution for seeded leads — spreads the pipeline so demos look
// real instead of every lead sitting in 'new'. Sums to 100.
const STATUS_DISTRIBUTION = [
  { status: 'new',       weight: 40 },
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
  if (!clientId) return 'new';
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
  return 'new';
}

/**
 * Seeds all curated leads for a single user. Fire-and-forget from register endpoint.
 * Safe to call multiple times — ON CONFLICT DO NOTHING.
 */
async function autoSeedUser(userId, pool) {
  if (!ALL_LEADS.length) return;
  const uid = String(userId);
  let inserted = 0;

  for (const lead of ALL_LEADS) {
    try {
      const clientId = lead.clientId || lead.client_id;
      const status = pickStatus(clientId);
      // For touched leads, stamp last_contacted so the activity timeline isn't empty.
      const lastContacted = status === 'new' ? null : new Date(Date.now() - (Math.abs(clientId?.length || 0) % 30) * 86400000);
      const r = await pool.query(`
        INSERT INTO leads (
          user_id, client_id, company, category, city, state, country,
          contact_title, website, pitch_angle, status, source, notes, last_contacted
        )
        VALUES ($1,$2,$3,$4,$5,$6,'US',$7,$8,$9,$10,$11,$12,$13)
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
      ]);
      if (r.rows.length) inserted++;
    } catch (e) {
      // skip individual failures silently — don't block other leads
    }
  }

  console.log(`[autoSeed] User ${uid} — seeded ${inserted} leads`);
}

module.exports = { autoSeedUser, totalLeads: ALL_LEADS.length };
