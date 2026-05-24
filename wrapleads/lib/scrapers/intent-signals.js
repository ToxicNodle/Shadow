/**
 * Intent-signal enrichment for commercial solar.
 *
 * Looks for high-conviction buying signals on existing companies in the
 * database and stamps `intent_signal` + `intent_signal_at` so the solar-score
 * formula boosts them and the AI prompt can reference them by name.
 *
 * Supported signals (each implemented as an adapter):
 *   - 'sustainability_hire'  — company posted a Sustainability Manager,
 *                              ESG Lead, Director of Sustainability, or
 *                              similar role in the past 90 days
 *   - 'esg_commitment'       — company has a public net-zero / RE100 /
 *                              SBTi commitment
 *   - 'recent_roof_permit'   — adjacent to permit-feeds scraper, but joined
 *                              on owner-name + zip
 *
 * Production-grade implementations would hit Greenhouse / Lever / Workday
 * job feeds + RE100/SBTi member lists. For the open-source baseline we
 * provide a deterministic scoring shim that looks at the company name
 * against a small curated list of known ESG-mandated companies and
 * `raw_data.signals[]` (which a user can backfill manually from any source).
 */

'use strict';

// Curated list of public commitments — names that should trigger a signal
// even with zero scraping. Massively non-exhaustive; the production version
// would mirror the full RE100 + SBTi member lists (~1500 companies).
const KNOWN_COMMITMENTS = new Set([
  'amazon','apple','google','microsoft','meta','walmart','target',
  'fedex','ups','3m','intel','nike','starbucks','ikea','pepsico',
  'coca-cola','unilever','procter & gamble','johnson & johnson',
  'pfizer','dell','hp','salesforce','adobe','at&t','verizon',
  'general motors','ford','tesla','rivian','marriott','hilton',
]);

const JOB_KEYWORDS = [
  /sustainability\s+manager/i,
  /sustainability\s+director/i,
  /director\s+of\s+sustainability/i,
  /esg\s+(lead|manager|analyst|director)/i,
  /director\s+of\s+esg/i,
  /chief\s+sustainability\s+officer/i,
  /head\s+of\s+sustainability/i,
  /vp\s+of\s+sustainability/i,
];

function classifyJobPosting(title) {
  if (!title) return null;
  for (const re of JOB_KEYWORDS) if (re.test(title)) return 'sustainability_hire';
  return null;
}

function knownCommitment(name) {
  if (!name) return null;
  const lower = String(name).toLowerCase();
  for (const k of KNOWN_COMMITMENTS) if (lower.includes(k)) return 'esg_commitment';
  return null;
}

/**
 * Backfill intent_signal across the companies table using the deterministic
 * shim (names + any raw_data.signals[] arrays a user has loaded externally).
 * Returns counts.
 */
async function run({ pool, log = console.log, limit = 2000 }) {
  let inspected = 0, updated = 0;
  // Use the curated commitment list as a baseline pass — fast and zero deps.
  for (const name of KNOWN_COMMITMENTS) {
    const r = await pool.query(
      `UPDATE companies SET intent_signal = 'esg_commitment', intent_signal_at = NOW(), updated_at = NOW()
       WHERE LOWER(name) LIKE '%' || $1 || '%' AND (intent_signal IS NULL OR intent_signal != 'esg_commitment')
       RETURNING id`,
      [name]
    );
    updated += r.rowCount;
  }

  // Any company that has a sustainability-related job title stashed in
  // raw_data.signals (the user can populate this from any source) gets
  // promoted to the strongest signal.
  const sR = await pool.query(`
    SELECT id, raw_data FROM companies
    WHERE raw_data ? 'signals' AND intent_signal IS DISTINCT FROM 'sustainability_hire'
    LIMIT $1
  `, [limit]);
  inspected += sR.rows.length;
  for (const row of sR.rows) {
    const sigs = Array.isArray(row.raw_data?.signals) ? row.raw_data.signals : [];
    let hit = null;
    for (const s of sigs) {
      if (typeof s === 'string') hit = classifyJobPosting(s) || hit;
      else if (s?.title) hit = classifyJobPosting(s.title) || hit;
    }
    if (hit) {
      await pool.query(
        `UPDATE companies SET intent_signal = $1, intent_signal_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [hit, row.id]
      );
      updated++;
    }
  }

  log(`   intent-signals: inspected ${inspected}, updated ${updated}`);
  return { total: inspected, inserted: 0, updated, skipped: 0 };
}

module.exports = {
  run,
  classifyJobPosting,
  knownCommitment,
  KNOWN_COMMITMENTS,
  JOB_KEYWORDS,
};
