#!/usr/bin/env node
/**
 * import-personal-leads.js — owner-specific warm leads.
 *
 * Distinct from seed-leads.js (curated, shared with every user) and
 * import-aia-leads.js (Indiana AIA/IIDA directory). This script holds the
 * leads the owner is actively working — warm referrals, in-flight pitches,
 * personal relationships. Each gets:
 *   - Status pre-set ('contacted' for in-flight, 'new' for ready-to-pitch)
 *   - followup_due_at = today so they top the Mission dashboard
 *   - Activity log entry capturing the referral source + context
 *   - Pre-drafted pitch email body in metadata (ready to copy/paste/send)
 *
 * Idempotent: re-running won't duplicate. Skips a lead if the same client_id
 * already exists for the user.
 *
 * Usage:
 *   node import-personal-leads.js --user-email owner@email.com
 *   node import-personal-leads.js --user-id 1
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

// ── The leads ────────────────────────────────────────────────────────────────
// Add new warm leads to this array as they come in. Existing entries are
// idempotent — re-running the script will not duplicate them.
const PERSONAL_LEADS = [
  {
    clientId: 'warm-gleaners-001',
    company: 'Gleaners Food Bank of Indiana',
    category: 'fleet',
    city: 'Indianapolis',
    state: 'IN',
    contactName: 'Eric Rowles',
    contactTitle: 'Director of Operations',
    email: 'erow@gleaners.org',
    fleetSize: 40,
    website: 'https://www.gleaners.org',
    pitchAngle:
      'Community-mission fleet wraps for 40 service vehicles. Current vendor relationship — '
      + 'positioning angle is brand visibility for sponsor recognition + corporate donor placement '
      + 'on vehicle wraps. Photo opportunities at every food drive event. Non-profit pricing '
      + 'available; ROI is donor acquisition, not just impressions.',
    status: 'new',
    source: 'warm_referral',
    notes:
      'WARM LEAD — employee referral. Currently using another graphics vendor; this is a '
      + 'displacement pitch. 40 vehicles in fleet. Key levers: (1) donor visibility — every '
      + 'sponsor gets logo placement on wraps, (2) photo-worthy for their social/PR, '
      + '(3) non-profit pricing with itemized line for the deductible portion.',
    followupToday: true,
    activity: {
      type: 'note',
      subject: 'Warm referral — Gleaners Food Bank (40 vehicles)',
      body:
        'Employee referral: Eric Rowles (erow@gleaners.org) runs operations at Gleaners Food Bank.\n\n'
        + 'They have 40 vehicles in their fleet, currently wrapped/graphics-managed by another '
        + 'vendor. Employee said they are open to hearing about new vendors.\n\n'
        + 'Pitch angle: brand visibility + corporate sponsor placement on vehicle wraps. Every '
        + 'major donor (Lilly, Cummins, IU Health, etc.) gets logo placement — turns the fleet '
        + 'into a rolling thank-you-card for donors. Generates photo opportunities at every food '
        + 'drive event for their social media and PR.\n\n'
        + 'Next steps: (1) Email or call Eric today, (2) propose a no-pressure walkthrough of '
        + 'their fleet, (3) bring a mockup showing donor logo placement on one of their box trucks.',
    },
    draftEmail: {
      subject: 'Brought up by one of your team — fleet wrap idea for Gleaners',
      body:
`Hi Eric,

One of your team mentioned you run a 40-vehicle fleet at Gleaners and might be open to talking about new graphics options. Reaching out directly so you can decide for yourself.

The angle I'd love to walk you through is sponsor visibility — turning your trucks into rolling thank-you cards for your major donors (Lilly, Cummins, IU Health, anyone you're already showcasing on print collateral). Same wrap budget, but now every truck on the road is generating donor goodwill and impression value for the people writing your biggest checks.

A few specifics that might be useful:
  • Non-profit pricing with a clean itemized line for the tax-deductible portion
  • Mockups before you commit — see exactly how the donor logos would sit on your box trucks
  • Drop-in installs around your distribution schedule so we don't take vehicles offline during a food drive

If it's worth 15 minutes, I'd come to you. Reply with a window that works, or just say "send me a sample" and I'll email back a mockup of one of your trucks with the donor placement laid out.

Either way, thanks for the work Gleaners does.

— [Your name]
[Your shop]`
    },
  },
];

async function importLead(userId, lead) {
  const today = new Date().toISOString().slice(0, 10);

  const insertRes = await pool.query(
    `INSERT INTO leads (
      user_id, client_id, company, category, city, state, country,
      contact_name, contact_title, email, fleet_size, website,
      pitch_angle, status, source, notes, followup_due_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,'US',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT (user_id, client_id) DO NOTHING
    RETURNING id`,
    [
      userId, lead.clientId, lead.company, lead.category,
      lead.city || null, lead.state || null,
      lead.contactName || null, lead.contactTitle || null, lead.email || null,
      lead.fleetSize || null, lead.website || null,
      lead.pitchAngle || null, lead.status || 'new',
      lead.source || 'warm_referral', lead.notes || null,
      lead.followupToday ? today : null,
    ]
  );

  if (!insertRes.rows[0]) {
    return { skipped: true };
  }
  const leadId = insertRes.rows[0].id;

  // Activity entry: capture the referral source so it shows in the timeline.
  if (lead.activity) {
    await pool.query(
      `INSERT INTO lead_activities (lead_id, user_id, type, subject, body, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [leadId, userId, lead.activity.type, lead.activity.subject, lead.activity.body, JSON.stringify({ source: 'import_personal' })]
    );
  }

  // Stash the draft email in a second activity so the owner can copy it from
  // the Activity tab without leaving the lead.
  if (lead.draftEmail) {
    await pool.query(
      `INSERT INTO lead_activities (lead_id, user_id, type, subject, body, metadata)
       VALUES ($1, $2, 'draft_email', $3, $4, $5)`,
      [
        leadId, userId, lead.draftEmail.subject, lead.draftEmail.body,
        JSON.stringify({ source: 'import_personal', note: 'Pre-drafted pitch — ready to copy/send' }),
      ]
    );
  }

  return { skipped: false, leadId };
}

async function main() {
  try {
    const userId = await resolveUserId(parseArgs());
    console.log(`[import-personal] Seeding ${PERSONAL_LEADS.length} warm lead(s) for user ${userId}…`);
    let inserted = 0;
    let skipped = 0;
    for (const lead of PERSONAL_LEADS) {
      const r = await importLead(userId, lead);
      if (r.skipped) {
        skipped++;
        console.log(`  ↪ skipped (already exists): ${lead.company}`);
      } else {
        inserted++;
        console.log(`  ✓ inserted lead #${r.leadId}: ${lead.company}`);
      }
    }
    console.log(`[import-personal] Done. Inserted ${inserted}, skipped ${skipped}.`);
    if (inserted > 0) {
      console.log('  → Check your Mission dashboard — new leads have followup_due_at=today.');
    }
  } catch (e) {
    console.error('[import-personal] Error:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
