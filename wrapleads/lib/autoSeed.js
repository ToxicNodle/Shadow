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
      const r = await pool.query(`
        INSERT INTO leads (
          user_id, client_id, company, category, city, state, country,
          contact_title, website, pitch_angle, status, source, notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,'US',$7,$8,$9,'new',$10,$11)
        ON CONFLICT (user_id, client_id) DO NOTHING
        RETURNING id
      `, [
        uid,
        lead.clientId || lead.client_id,
        lead.company,
        lead.category,
        lead.city || null,
        lead.state || null,
        lead.contactTitle || lead.contact_title || null,
        lead.website || null,
        lead.pitchAngle || lead.pitch_angle || null,
        lead.source || 'auto_seed',
        null,
      ]);
      if (r.rows.length) inserted++;
    } catch (e) {
      // skip individual failures silently — don't block other leads
    }
  }

  console.log(`[autoSeed] User ${uid} — seeded ${inserted} leads`);
}

module.exports = { autoSeedUser, totalLeads: ALL_LEADS.length };
