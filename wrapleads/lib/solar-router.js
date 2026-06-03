/**
 * HelioScout (Commercial Solar Scout) — Express router.
 *
 * Mounts everything net-new for the solar vertical: discover/search with
 * solar-score, pilot installer management, installer auction marketplace,
 * compliance routes (one-click unsubscribe), and the speed-to-lead intake
 * webhook. Kept in its own file because adding ~1k lines to the already
 * monolithic wrapleads-server.js would make it unreadable; the existing
 * tier middleware + pool are injected by the server at mount time.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const solarMath = require('./solar-math');
const incentives = require('./solar-incentives');
const naicsFit = require('./naics-solar-fit');
const compliance = require('./compliance');
const qualifyLead = require('./qualify-lead');
const tariffs = require('./solar-tariffs');
const solarProposal = require('./solar-proposal');

// ── Solar score SQL ──────────────────────────────────────────────────────
// 0–100 multi-factor score. Returned alongside the row so it matches the
// ORDER BY. Higher = stronger commercial-solar opportunity.
//   Building size (0-25): 20-200k sqft is the sweet spot.
//   Roof type     (0-25): flat/membrane/metal are ideal; shingle ≈ 5.
//   Energy load   (0-20): est_annual_kwh > 500k = strong; > 100k = good.
//   Contactable   (0-15): both phone + email.
//   NAICS bonus   (0-10): pulled from naics_code or industry text via heuristic.
//   Recent permit (0-5):  source = 'permit_feed' AND industry LIKE 'permit_%'.
const SOLAR_SCORE_SQL = `(
  CASE WHEN building_sqft BETWEEN 20000 AND 200000 THEN 22
       WHEN building_sqft > 200000 THEN 15
       WHEN building_sqft BETWEEN 5000 AND 19999 THEN 10 ELSE 0 END
  + CASE WHEN roof_type IN ('flat','membrane','metal') THEN 22
         WHEN roof_type = 'shingle' THEN 5 ELSE 8 END
  + CASE WHEN est_annual_kwh > 500000 THEN 18
         WHEN est_annual_kwh > 100000 THEN 10
         WHEN est_annual_kwh > 0 THEN 5 ELSE 0 END
  + CASE WHEN phone IS NOT NULL AND email IS NOT NULL THEN 13
         WHEN phone IS NOT NULL OR email IS NOT NULL THEN 7 ELSE 0 END
  + CASE WHEN naics_code LIKE '4931%' OR naics_code LIKE '5182%' THEN 10
         WHEN naics_code LIKE '31%' OR naics_code LIKE '32%' OR naics_code LIKE '33%' THEN 7
         WHEN naics_code LIKE '42%' OR naics_code LIKE '49%' THEN 6
         WHEN industry ILIKE '%cold storage%' OR industry ILIKE '%data center%' THEN 10
         WHEN industry ILIKE '%distribution%' OR industry ILIKE '%warehouse%' OR industry ILIKE '%manufactur%' THEN 7
         ELSE 0 END
  + CASE WHEN source = 'permit_feed' THEN 5
         WHEN industry ILIKE 'permit_%' THEN 5 ELSE 0 END
  + CASE WHEN is_owner_occupied = TRUE THEN 5 ELSE 0 END
  + CASE WHEN intent_signal IS NOT NULL THEN 5 ELSE 0 END
)`;

// Build the router. `deps` provides the things we can't import directly
// because they live in the monolith (pool, auth middleware, tier middleware,
// logActivity helper, etc.).
function buildSolarRouter(deps) {
  const {
    pool,
    authMiddleware,
    subMiddleware,
    requireShopFlow,
    requireWrapOS,
    logActivity,
    createNotification,
    sendCompliantEmail, // (item) => Promise<{ id }>
    appBaseUrl,
    APOLLO_TITLES,
    stripe,             // Stripe SDK instance (may be null when not configured)
  } = deps;

  const router = express.Router();

  // ── DISCOVER ─────────────────────────────────────────────────────────
  // POST /solar/discover  — search the companies dataset for commercial
  // solar opportunities with the solar-score formula applied.
  router.post('/discover', authMiddleware, subMiddleware, async (req, res) => {
    const {
      states = null, minSqft = null, maxSqft = null, roofTypes = null,
      naicsPrefix = null, withContact = false, excludeAlreadyImported = false,
      query = '', limit = 50, offset = 0, sort = 'solar_score',
    } = req.body || {};

    const conditions = [
      // Limit to sources that carry commercial property semantics. This
      // prevents random FMCSA truckers from polluting solar results.
      `(source IN ('google_places_solar','osm_industrial','permit_feed') OR source LIKE 'commercial_csv_%')`,
    ];
    const params = [];

    if (Array.isArray(states) && states.length) {
      params.push(states.map(s => String(s).toUpperCase()));
      conditions.push(`state = ANY($${params.length})`);
    }
    if (Array.isArray(roofTypes) && roofTypes.length) {
      params.push(roofTypes);
      conditions.push(`roof_type = ANY($${params.length})`);
    }
    if (minSqft !== null && minSqft !== '' && !isNaN(minSqft)) {
      params.push(parseInt(minSqft, 10));
      conditions.push(`building_sqft >= $${params.length}`);
    }
    if (maxSqft !== null && maxSqft !== '' && !isNaN(maxSqft)) {
      params.push(parseInt(maxSqft, 10));
      conditions.push(`building_sqft <= $${params.length}`);
    }
    if (naicsPrefix && String(naicsPrefix).trim()) {
      params.push(String(naicsPrefix).trim() + '%');
      conditions.push(`naics_code LIKE $${params.length}`);
    }
    if (withContact) conditions.push(`(phone IS NOT NULL OR email IS NOT NULL)`);
    if (query && query.trim()) {
      params.push(`%${query.trim()}%`);
      conditions.push(`(name ILIKE $${params.length} OR city ILIKE $${params.length})`);
    }

    const where = conditions.length ? conditions.join(' AND ') : 'TRUE';
    const safeLimit  = Math.min(parseInt(limit, 10) || 50, 200);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const uid = String(req.user.id);

    const orderBy = {
      solar_score: `${SOLAR_SCORE_SQL} DESC, building_sqft DESC NULLS LAST, name ASC`,
      sqft_desc:   `building_sqft DESC NULLS LAST, name ASC`,
      name:        `name ASC`,
      recent:      `updated_at DESC, name ASC`,
    }[sort] || `${SOLAR_SCORE_SQL} DESC, building_sqft DESC NULLS LAST`;

    const dataParams = [...params, safeLimit, safeOffset];
    const sql = `
      SELECT id, source, source_id, name, street, city, state, zip,
             phone, email, website, building_sqft, roof_type, utility_provider,
             est_kw_capacity, est_annual_kwh, latitude, longitude, naics_code,
             industry, raw_data,
             ${SOLAR_SCORE_SQL} AS solar_score
      FROM companies
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `;

    try {
      const [rows, count] = await Promise.all([
        pool.query(sql, dataParams),
        pool.query(`SELECT COUNT(*)::INT AS total FROM companies WHERE ${where}`, params),
      ]);

      // Compute economics for each row using lib/solar-math + naics-fit.
      const ids = rows.rows.map(r => r.id);
      let importedSet = new Set();
      if (ids.length) {
        const ir = await pool.query(
          `SELECT company_id FROM imports WHERE company_id = ANY($1) AND user_id = $2`,
          [ids, uid]
        );
        importedSet = new Set(ir.rows.map(r => r.company_id));
      }

      const results = rows.rows.map(r => {
        const naicsCode = r.naics_code || naicsFit.inferNaicsFromIndustry(r.industry);
        const naics = naicsFit.lookup(naicsCode);
        const utilityRate = r.raw_data?.nrel_rate?.commercial_rate || solarMath.DEFAULT_RATE;
        const econ = solarMath.fullEstimate({
          buildingSqft: r.building_sqft,
          roofType:     r.roof_type,
          latitude:     r.latitude,
          utilityRate,
          estAnnualKwh: r.est_annual_kwh,
        });
        const permitSignal = r.raw_data?.permit_signal || (String(r.industry || '').startsWith('permit_') ? r.industry.slice('permit_'.length) : null);
        return {
          id: r.id,
          source: r.source,
          source_id: r.source_id,
          name: r.name,
          street: r.street, city: r.city, state: r.state, zip: r.zip,
          phone: r.phone, email: r.email, website: r.website,
          building_sqft: r.building_sqft,
          roof_type: r.roof_type,
          utility_provider: r.utility_provider,
          latitude: r.latitude, longitude: r.longitude,
          naics_code: naicsCode,
          industry: r.industry,
          solar_score: Number(r.solar_score),
          economics: econ,
          naics_fit: naics || null,
          permit_signal: permitSignal,
          already_imported: importedSet.has(r.id),
          satellite_url: r.latitude && r.longitude
            ? `https://www.google.com/maps/@${r.latitude},${r.longitude},19z/data=!3m1!1e3`
            : null,
        };
      });

      res.json({ total: count.rows[0].total, results, limit: safeLimit, offset: safeOffset });
    } catch (e) {
      console.error('[solar/discover]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /solar/:id  — full enrichment payload for one company (lead packet).
  router.get('/companies/:id', authMiddleware, subMiddleware, async (req, res) => {
    try {
      const r = await pool.query(`SELECT * FROM companies WHERE id = $1`, [req.params.id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
      const c = r.rows[0];
      const naicsCode = c.naics_code || naicsFit.inferNaicsFromIndustry(c.industry);
      const naics = naicsFit.lookup(naicsCode);
      const utilityRate = c.raw_data?.nrel_rate?.commercial_rate || solarMath.DEFAULT_RATE;
      const econ = solarMath.fullEstimate({
        buildingSqft: c.building_sqft,
        roofType:     c.roof_type,
        latitude:     c.latitude,
        utilityRate,
        estAnnualKwh: c.est_annual_kwh,
      });
      const stack = econ.system_kw > 0 ? incentives.calculateStack({
        grossCost: econ.gross_cost_usd,
        systemKw:  econ.system_kw,
        annualKwh: econ.annual_kwh,
        state:     c.state,
        zip:       c.zip,
        // Most projects qualify for at least one IRA adder. Be conservative —
        // we only auto-stack energy_community here as a default; users can
        // toggle the others in the UI.
        bonuses:   { energy_community: false, domestic_content: false, low_income: false },
      }) : null;
      const netPayback = stack ? incentives.netPaybackYears(stack.net_cost, econ.annual_savings_usd) : null;

      res.json({
        company: c,
        economics: econ,
        incentive_stack: stack,
        net_payback_years: netPayback,
        naics_fit: naics,
        satellite_url: c.latitude && c.longitude
          ? `https://www.google.com/maps/@${c.latitude},${c.longitude},19z/data=!3m1!1e3`
          : null,
        suggested_titles: APOLLO_TITLES.commercial_solar || APOLLO_TITLES.default,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /solar/import — convert a discovered company into a CRM lead with
  // commercial_solar category. Mirrors /carriers/import but stamps the
  // solar-specific fields.
  router.post('/import', authMiddleware, subMiddleware, async (req, res) => {
    const { companyId } = req.body || {};
    if (!companyId) return res.status(400).json({ error: 'Missing companyId' });
    const uid = String(req.user.id);
    try {
      await pool.query(
        `INSERT INTO imports (company_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [companyId, uid]
      );
      const coR = await pool.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
      let leadId = null;
      if (coR.rows.length) {
        const c = coR.rows[0];
        const lr = await pool.query(`
          INSERT INTO leads
            (user_id, client_id, company, category, state, city, phone, email,
             website, status, source_company_id, source, consent_basis, created_at, updated_at)
          VALUES ($1, $2, $3, 'commercial_solar', $4, $5, $6, $7, $8, 'new', $9, $10, 'b2b_legitimate_interest', NOW(), NOW())
          ON CONFLICT (user_id, client_id) DO NOTHING
          RETURNING id
        `, [uid, `solar-${companyId}`, c.name, c.state, c.city,
            c.phone || null, c.email || null, c.website || null, companyId, c.source]);
        leadId = lr.rows[0]?.id ?? null;
      }
      res.json({ ok: true, leadId });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── PILOT INSTALLERS (requireWrapOS) ─────────────────────────────────
  router.get('/pilot/installers', authMiddleware, requireWrapOS, async (req, res) => {
    const uid = String(req.user.id);
    try {
      const r = await pool.query(`
        SELECT i.*,
          (SELECT COUNT(*) FROM pilot_assignments a WHERE a.installer_id = i.id) AS total_assignments,
          (SELECT COUNT(*) FROM pilot_assignments a WHERE a.installer_id = i.id AND a.outcome = 'closed_won') AS won_count
        FROM pilot_installers i
        WHERE i.user_id = $1
        ORDER BY i.created_at DESC
      `, [uid]);
      res.json({ installers: r.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/pilot/installers', authMiddleware, requireWrapOS, async (req, res) => {
    const uid = String(req.user.id);
    const {
      installer_name, installer_email, installer_phone, company_name,
      territory_states = [], territory_zips = [],
      lead_quota = 25, price_per_lead = 0,
    } = req.body || {};
    if (!installer_name || !installer_email) {
      return res.status(400).json({ error: 'installer_name and installer_email are required' });
    }
    const acceptToken = crypto.randomBytes(20).toString('hex');
    try {
      const r = await pool.query(`
        INSERT INTO pilot_installers
          (user_id, installer_name, installer_email, installer_phone, company_name,
           territory_states, territory_zips, lead_quota, price_per_lead, accept_token)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `, [uid, installer_name, installer_email.toLowerCase(), installer_phone || null,
          company_name || null, territory_states, territory_zips,
          parseInt(lead_quota, 10) || 25, parseFloat(price_per_lead) || 0, acceptToken]);
      res.json({ installer: r.rows[0] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/pilot/installers/:id', authMiddleware, requireWrapOS, async (req, res) => {
    const uid = String(req.user.id);
    const id = parseInt(req.params.id, 10);
    const patch = req.body || {};
    const allowed = ['installer_name','installer_email','installer_phone','company_name','territory_states','territory_zips','lead_quota','price_per_lead','active'];
    const sets = [];
    const params = [uid, id];
    for (const k of allowed) {
      if (patch[k] !== undefined) {
        params.push(patch[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    try {
      const r = await pool.query(
        `UPDATE pilot_installers SET ${sets.join(', ')}, updated_at = NOW()
         WHERE user_id = $1 AND id = $2 RETURNING *`, params);
      if (!r.rows.length) return res.status(404).json({ error: 'Installer not found' });
      res.json({ installer: r.rows[0] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/pilot/installers/:id', authMiddleware, requireWrapOS, async (req, res) => {
    const uid = String(req.user.id);
    try {
      await pool.query(`DELETE FROM pilot_installers WHERE user_id = $1 AND id = $2`, [uid, req.params.id]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /solar/pilot/assign  — direct assignment (no auction)
  router.post('/pilot/assign', authMiddleware, requireWrapOS, async (req, res) => {
    const uid = String(req.user.id);
    const { installer_id, lead_ids } = req.body || {};
    if (!installer_id || !Array.isArray(lead_ids) || !lead_ids.length) {
      return res.status(400).json({ error: 'installer_id and lead_ids[] are required' });
    }
    try {
      const installerR = await pool.query(
        `SELECT * FROM pilot_installers WHERE id = $1 AND user_id = $2`,
        [installer_id, uid]
      );
      if (!installerR.rows.length) return res.status(404).json({ error: 'Installer not found' });
      const inst = installerR.rows[0];
      const created = [];
      for (const leadId of lead_ids) {
        const token = crypto.randomBytes(16).toString('hex');
        const a = await pool.query(`
          INSERT INTO pilot_assignments (installer_id, lead_id, user_id, outcome_token, payout_amount)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (installer_id, lead_id) DO NOTHING
          RETURNING *
        `, [installer_id, leadId, uid, token, inst.price_per_lead]);
        if (a.rows[0]) created.push(a.rows[0]);
      }
      // Fire-and-forget installer email
      if (created.length) {
        const ledLink = `${appBaseUrl()}/installer/${inst.accept_token}`;
        const leadCount = created.length;
        try {
          await sendCompliantEmail({
            to: inst.installer_email,
            subject: `[HelioScout] ${leadCount} new commercial solar lead${leadCount > 1 ? 's' : ''} assigned`,
            html: `<p>You have ${leadCount} new commercial solar lead${leadCount > 1 ? 's' : ''} ready for outreach.</p>
                   <p><a href="${ledLink}">View your lead inbox</a></p>
                   <p>Lead packets include building sqft, roof type, utility, estimated kW system size, and ITC + state-stack net cost. Each lead is exclusive to you.</p>`,
            text: `${leadCount} new commercial solar leads assigned. View at ${ledLink}`,
            skipCompliance: true, // direct B2B partner communication, not marketing
          });
        } catch { /* non-fatal */ }
      }
      res.json({ ok: true, assigned: created.length, assignments: created });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /solar/pilot/export.csv  — CSV handoff for unassigned scored leads.
  router.get('/pilot/export.csv', authMiddleware, requireWrapOS, async (req, res) => {
    const uid = String(req.user.id);
    const { state = null, minScore = 0 } = req.query;
    const params = [uid];
    const conds = [`l.user_id = $1`, `l.category = 'commercial_solar'`];
    if (state) { params.push(state); conds.push(`l.state = $${params.length}`); }
    try {
      const r = await pool.query(`
        SELECT l.id, l.company, l.city, l.state, l.email, l.phone, l.website,
               l.status, c.building_sqft, c.roof_type, c.utility_provider,
               c.latitude, c.longitude,
               COALESCE(${SOLAR_SCORE_SQL.replace(/\b(building_sqft|roof_type|est_annual_kwh|phone|email|naics_code|industry|source|is_owner_occupied|intent_signal)\b/g, m => `c.${m}`)}, 0) AS solar_score
        FROM leads l
        LEFT JOIN companies c ON c.id = l.source_company_id
        WHERE ${conds.join(' AND ')}
        ORDER BY solar_score DESC, l.created_at DESC
      `, params);
      const filtered = r.rows.filter(row => Number(row.solar_score) >= Number(minScore));
      const headers = ['id','company','city','state','email','phone','website','status','building_sqft','roof_type','utility_provider','solar_score','satellite_url'];
      const lines = [headers.join(',')];
      for (const row of filtered) {
        const satellite = row.latitude && row.longitude
          ? `https://www.google.com/maps/@${row.latitude},${row.longitude},19z/data=!3m1!1e3` : '';
        const cell = (v) => v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`;
        lines.push(headers.map(h => cell(h === 'satellite_url' ? satellite : row[h])).join(','));
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="solar-leads-${Date.now()}.csv"`);
      res.send(lines.join('\n'));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /solar/pilot/outcome/:token  — installer reports back via tokenized
  // link (no auth — public, single-use-ish).
  router.post('/pilot/outcome/:token', express.json(), async (req, res) => {
    const { outcome, notes } = req.body || {};
    const allowed = ['accepted','rejected','closed_won','closed_lost','no_contact'];
    if (!allowed.includes(outcome)) return res.status(400).json({ error: `outcome must be one of ${allowed.join(', ')}` });
    try {
      const r = await pool.query(`
        UPDATE pilot_assignments
        SET outcome = $1, outcome_notes = $2, updated_at = NOW(),
            accepted_at = CASE WHEN $1 = 'accepted' AND accepted_at IS NULL THEN NOW() ELSE accepted_at END
        WHERE outcome_token = $3
        RETURNING *`,
        [outcome, notes || null, req.params.token]);
      if (!r.rows.length) return res.status(404).json({ error: 'Invalid token' });
      const a = r.rows[0];
      try {
        await logActivity(pool, {
          leadId: a.lead_id, userId: a.user_id, type: 'pilot_outcome',
          subject: `Pilot installer reported: ${outcome}`,
          body: notes || null,
          metadata: { outcome, assignment_id: a.id, installer_id: a.installer_id },
        });
        await createNotification(a.user_id, {
          type: 'pilot_outcome',
          title: `Installer reported ${outcome.replace('_', ' ')}`,
          body: notes ? notes.slice(0, 200) : '',
          metadata: { lead_id: a.lead_id, assignment_id: a.id },
        });
      } catch { /* non-fatal */ }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── AUCTION MARKETPLACE ──────────────────────────────────────────────
  // Open an auction on a lead. Invites all active installers whose territory
  // matches the lead's state or zip.
  router.post('/auctions', authMiddleware, requireWrapOS, async (req, res) => {
    const uid = String(req.user.id);
    const {
      lead_id, hours = 4, floor_price = 0,
      bid_modes = ['fixed','commission','hybrid'],
    } = req.body || {};
    if (!lead_id) return res.status(400).json({ error: 'lead_id is required' });
    try {
      const leadR = await pool.query(
        `SELECT l.*, c.building_sqft, c.roof_type, c.utility_provider, c.latitude, c.longitude,
                c.est_annual_kwh, c.naics_code, c.industry, c.raw_data AS company_raw
         FROM leads l LEFT JOIN companies c ON c.id = l.source_company_id
         WHERE l.id = $1 AND l.user_id = $2`,
        [lead_id, uid]
      );
      if (!leadR.rows.length) return res.status(404).json({ error: 'Lead not found' });
      const lead = leadR.rows[0];

      const econ = solarMath.fullEstimate({
        buildingSqft: lead.building_sqft,
        roofType:     lead.roof_type,
        latitude:     lead.latitude,
        utilityRate:  lead.company_raw?.nrel_rate?.commercial_rate,
        estAnnualKwh: lead.est_annual_kwh,
      });
      const stack = econ.system_kw > 0 ? incentives.calculateStack({
        grossCost: econ.gross_cost_usd, systemKw: econ.system_kw,
        annualKwh: econ.annual_kwh, state: lead.state, zip: lead.zip,
      }) : null;

      const publicToken = crypto.randomBytes(20).toString('hex');
      const closesAt = new Date(Date.now() + Math.max(1, parseInt(hours, 10) || 4) * 3600 * 1000);
      const snapshot = {
        company: lead.company, city: lead.city, state: lead.state, zip: lead.zip,
        building_sqft: lead.building_sqft, roof_type: lead.roof_type,
        utility_provider: lead.utility_provider, naics_code: lead.naics_code,
        industry: lead.industry, economics: econ, incentive_stack: stack,
        satellite_url: lead.latitude && lead.longitude
          ? `https://www.google.com/maps/@${lead.latitude},${lead.longitude},19z/data=!3m1!1e3` : null,
      };

      const aR = await pool.query(`
        INSERT INTO solar_auctions (user_id, lead_id, public_token, status, bid_modes, floor_price, closes_at, snapshot)
        VALUES ($1, $2, $3, 'open', $4, $5, $6, $7)
        RETURNING *`,
        [uid, lead_id, publicToken, bid_modes, parseFloat(floor_price) || 0, closesAt, JSON.stringify(snapshot)]);
      const auction = aR.rows[0];

      // Invite eligible installers — territory matches state or zip.
      const eligibleR = await pool.query(`
        SELECT * FROM pilot_installers
        WHERE user_id = $1 AND active = TRUE
          AND ($2::text = ANY(territory_states) OR $3::text = ANY(territory_zips) OR (cardinality(territory_states) = 0 AND cardinality(territory_zips) = 0))
      `, [uid, lead.state || '', lead.zip || '']);

      let invited = 0;
      for (const inst of eligibleR.rows) {
        const bidUrl = `${appBaseUrl()}/solar/auction/${publicToken}?installer=${inst.accept_token}`;
        try {
          await sendCompliantEmail({
            to: inst.installer_email,
            subject: `[HelioScout] Auction open: ${lead.company} — ${econ.system_kw}kW opportunity`,
            html: `<p>An exclusive commercial solar lead just entered auction.</p>
                   <ul>
                     <li><strong>Property:</strong> ${escapeHtml(lead.company)} (${escapeHtml(lead.city || '')}, ${escapeHtml(lead.state || '')})</li>
                     <li><strong>Building:</strong> ${lead.building_sqft ? lead.building_sqft.toLocaleString() + ' sqft' : 'unknown'} · ${escapeHtml(lead.roof_type || 'unknown')} roof</li>
                     <li><strong>System size:</strong> ${econ.system_kw} kW DC</li>
                     <li><strong>Annual production:</strong> ${econ.annual_kwh.toLocaleString()} kWh</li>
                     <li><strong>Estimated savings:</strong> $${econ.annual_savings_usd.toLocaleString()}/yr</li>
                     <li><strong>Closes:</strong> ${closesAt.toISOString()}</li>
                   </ul>
                   <p><a href="${bidUrl}">Open auction → Place your bid</a></p>`,
            text: `Auction open for ${lead.company}: ${econ.system_kw}kW. Bid at ${bidUrl}`,
            skipCompliance: true,
          });
          invited++;
        } catch { /* non-fatal */ }
      }

      res.json({ auction, invited });
    } catch (e) {
      console.error('[solar/auctions]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /solar/auctions/:token  — public auction page (no auth — installer
  // arrives from email link).
  router.get('/auctions/:token', async (req, res) => {
    const token = req.params.token;
    if (!/^[a-f0-9]{40}$/.test(token)) {
      return res.status(404).json({ error: 'Auction not found' });
    }
    try {
      const r = await pool.query(`SELECT * FROM solar_auctions WHERE public_token = $1`, [token]);
      if (!r.rows.length) return res.status(404).json({ error: 'Auction not found' });
      const a = r.rows[0];
      const bids = await pool.query(`
        SELECT b.id, b.bid_mode, b.amount, b.commission_pct, b.message, b.submitted_at, b.score,
               i.installer_name, i.company_name
        FROM solar_auction_bids b
        JOIN pilot_installers i ON i.id = b.installer_id
        WHERE b.auction_id = $1
        ORDER BY b.submitted_at ASC
      `, [a.id]);
      // Anonymize competing installer names for the public page — installers
      // only see their own bid in clear text. Broker sees full info via the
      // authenticated route below.
      const anonBids = bids.rows.map(b => ({
        bid_mode: b.bid_mode, amount: Number(b.amount), commission_pct: Number(b.commission_pct),
        submitted_at: b.submitted_at,
      }));
      res.json({
        auction: { id: a.id, status: a.status, closes_at: a.closes_at, bid_modes: a.bid_modes, floor_price: Number(a.floor_price), opens_at: a.opens_at },
        snapshot: a.snapshot,
        bids: anonBids,
        bid_count: bids.rows.length,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /solar/auctions/:token/bid  — installer submits a bid (public, keyed
  // by ?installer=<accept_token>)
  router.post('/auctions/:token/bid', express.json(), async (req, res) => {
    const installerToken = req.query.installer || req.body?.installer_token;
    if (!installerToken) return res.status(401).json({ error: 'Missing installer token' });
    const { bid_mode, amount, commission_pct = 0, message = '' } = req.body || {};
    if (!['fixed','commission','hybrid'].includes(bid_mode)) {
      return res.status(400).json({ error: "bid_mode must be one of: fixed, commission, hybrid" });
    }
    try {
      const aR = await pool.query(`SELECT * FROM solar_auctions WHERE public_token = $1`, [req.params.token]);
      if (!aR.rows.length) return res.status(404).json({ error: 'Auction not found' });
      const auction = aR.rows[0];
      if (auction.status !== 'open') return res.status(400).json({ error: `Auction is ${auction.status}` });
      if (new Date(auction.closes_at) <= new Date()) return res.status(400).json({ error: 'Auction has closed' });
      if (!auction.bid_modes.includes(bid_mode)) return res.status(400).json({ error: `bid_mode ${bid_mode} not allowed on this auction` });

      const iR = await pool.query(`SELECT * FROM pilot_installers WHERE accept_token = $1 AND active = TRUE`, [installerToken]);
      if (!iR.rows.length) return res.status(401).json({ error: 'Invalid installer token' });
      const installer = iR.rows[0];
      if (String(installer.user_id) !== String(auction.user_id)) {
        return res.status(403).json({ error: 'Installer not authorized for this broker' });
      }

      const amt = Math.max(0, parseFloat(amount) || 0);
      const cpct = Math.max(0, Math.min(100, parseFloat(commission_pct) || 0));
      if (bid_mode !== 'commission' && amt < Number(auction.floor_price)) {
        return res.status(400).json({ error: `Bid below floor (${auction.floor_price})` });
      }

      const bidR = await pool.query(`
        INSERT INTO solar_auction_bids (auction_id, installer_id, bid_mode, amount, commission_pct, message)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (auction_id, installer_id) DO UPDATE SET
          bid_mode = EXCLUDED.bid_mode,
          amount = EXCLUDED.amount,
          commission_pct = EXCLUDED.commission_pct,
          message = EXCLUDED.message,
          submitted_at = NOW()
        RETURNING *`,
        [auction.id, installer.id, bid_mode, amt, cpct, message.slice(0, 500)]);
      res.json({ bid: bidR.rows[0] });
    } catch (e) {
      console.error('[solar/auctions/bid]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /solar/auctions  — broker view of all their auctions, with bids visible
  router.get('/auctions', authMiddleware, requireWrapOS, async (req, res) => {
    const uid = String(req.user.id);
    try {
      const aR = await pool.query(`
        SELECT a.*, l.company, l.state, l.city
        FROM solar_auctions a
        LEFT JOIN leads l ON l.id = a.lead_id
        WHERE a.user_id = $1
        ORDER BY a.created_at DESC
        LIMIT 100
      `, [uid]);
      const ids = aR.rows.map(r => r.id);
      let bidsByAuction = new Map();
      if (ids.length) {
        const bR = await pool.query(`
          SELECT b.*, i.installer_name, i.company_name
          FROM solar_auction_bids b
          JOIN pilot_installers i ON i.id = b.installer_id
          WHERE b.auction_id = ANY($1)
          ORDER BY b.submitted_at ASC
        `, [ids]);
        for (const b of bR.rows) {
          if (!bidsByAuction.has(b.auction_id)) bidsByAuction.set(b.auction_id, []);
          bidsByAuction.get(b.auction_id).push(b);
        }
      }
      res.json({
        auctions: aR.rows.map(a => ({ ...a, bids: bidsByAuction.get(a.id) || [] })),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /solar/auctions/:id/award  — manual award (overrides auto-scoring)
  router.post('/auctions/:id/award', authMiddleware, requireWrapOS, async (req, res) => {
    const uid = String(req.user.id);
    const { bid_id } = req.body || {};
    if (!bid_id) return res.status(400).json({ error: 'bid_id is required' });
    try {
      const closed = await closeAuction(pool, { auctionId: parseInt(req.params.id, 10), userId: uid, manualBidId: bid_id, deps });
      res.json(closed);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /solar/auctions/:id/cancel
  router.post('/auctions/:id/cancel', authMiddleware, requireWrapOS, async (req, res) => {
    const uid = String(req.user.id);
    try {
      const r = await pool.query(
        `UPDATE solar_auctions SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'open' RETURNING *`,
        [req.params.id, uid]);
      if (!r.rows.length) return res.status(404).json({ error: 'Auction not found or not open' });
      res.json({ auction: r.rows[0] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── SPEED-TO-LEAD INTAKE ─────────────────────────────────────────────
  // POST /webhooks/solar-intake — TCPA-compliant B2B intake. Synchronously
  // creates the lead, generates the first AI email, and SENDS it. Queue the
  // Day 5 + Day 12 follow-ups. Returns within ~5 seconds.
  router.post('/intake', express.json(), async (req, res) => {
    const secret = req.headers['x-webhook-secret'] || req.body?.secret;
    if (!secret) return res.status(401).json({ error: 'Missing X-Webhook-Secret header' });
    try {
      const uR = await pool.query(`SELECT * FROM users WHERE solar_intake_secret = $1`, [secret]);
      if (!uR.rows.length) return res.status(401).json({ error: 'Invalid secret' });
      const user = uR.rows[0];
      const uid = String(user.id);

      const {
        company, contact_name, contact_title, email, phone, website,
        city, state, zip, building_sqft, roof_type, utility_provider,
        latitude, longitude, naics_code, consent_basis = 'b2b_legitimate_interest',
      } = req.body || {};
      if (!company) return res.status(400).json({ error: 'company is required' });
      if (!email && !phone) return res.status(400).json({ error: 'email or phone is required' });

      const clientId = `intake-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const lr = await pool.query(`
        INSERT INTO leads
          (user_id, client_id, company, category, state, city, contact_name, contact_title,
           email, phone, website, status, source, consent_basis, created_at, updated_at)
        VALUES ($1,$2,$3,'commercial_solar',$4,$5,$6,$7,$8,$9,$10,'new','solar_intake',$11,NOW(),NOW())
        ON CONFLICT (user_id, client_id) DO NOTHING
        RETURNING *
      `, [uid, clientId, company, state || null, city || null, contact_name || null,
          contact_title || null, (email || '').toLowerCase() || null, phone || null,
          website || null, consent_basis]);
      const lead = lr.rows[0];
      if (!lead) return res.status(500).json({ error: 'Could not create lead' });

      // Pre-compute economics so we can stash them on the lead's notes and on
      // the AI prompt.
      const econ = solarMath.fullEstimate({
        buildingSqft: building_sqft, roofType: roof_type, latitude,
        utilityRate: null, estAnnualKwh: null,
      });

      let firstEmailSentAt = null;
      const canSend = compliance.canEmail(lead);
      if (canSend) {
        try {
          // 1) Generate first email with AI (uses solar prompt below)
          const { subject, body } = await deps.generateSolarOpener({
            lead,
            settings: user.settings_json || {},
            building_sqft, roof_type, utility_provider, building_econ: econ,
          });

          // 2) Send synchronously via Resend through the existing helper
          const sendRes = await sendCompliantEmail({
            to: email,
            toName: contact_name || null,
            subject,
            body, // sendCompliantEmail appends footer + unsub link
            leadId: lead.id,
            userId: uid,
            settings: user.settings_json || {},
          });
          firstEmailSentAt = new Date().toISOString();

          // 3) Mark contacted + log activity
          await pool.query(
            `UPDATE leads SET status = 'contacted', last_contacted = CURRENT_DATE, updated_at = NOW() WHERE id = $1`,
            [lead.id]
          );
          await logActivity(pool, {
            leadId: lead.id, userId: uid, type: 'email_sent',
            subject, body, metadata: { speed_to_lead: true, resend_id: sendRes?.id, auto: true },
          });

          // 4) Queue Day 5 + Day 12 follow-ups (background, non-blocking)
          setImmediate(async () => {
            try {
              await deps.queueSolarFollowups({ pool, leadId: lead.id, userId: uid, lead, settings: user.settings_json || {}, building_sqft, roof_type, utility_provider, building_econ: econ });
            } catch (e) { console.error('[solar-intake follow-up queue]', e.message); }
          });
        } catch (e) {
          console.error('[solar-intake send]', e.message);
        }
      }

      res.json({
        ok: true,
        lead_id: lead.id,
        first_email_sent_at: firstEmailSentAt,
        economics: econ,
      });
    } catch (e) {
      console.error('[solar/intake]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /solar/intake/rotate-secret  — broker rotates their webhook secret
  router.post('/intake/rotate-secret', authMiddleware, requireShopFlow, async (req, res) => {
    const uid = String(req.user.id);
    const newSecret = `wls_${crypto.randomBytes(24).toString('hex')}`;
    try {
      await pool.query(`UPDATE users SET solar_intake_secret = $1 WHERE id = $2`, [newSecret, uid]);
      res.json({ secret: newSecret, hint: 'Send this in the X-Webhook-Secret header to /solar/intake' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/intake/secret', authMiddleware, requireShopFlow, async (req, res) => {
    const uid = String(req.user.id);
    try {
      const r = await pool.query(`SELECT solar_intake_secret FROM users WHERE id = $1`, [uid]);
      res.json({ secret: r.rows[0]?.solar_intake_secret || null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── ONE-CLICK UNSUBSCRIBE (public, no auth) ──────────────────────────
  router.get('/__unsubscribe/:token', async (req, res) => {
    const token = req.params.token;
    if (!/^[a-f0-9]{40}$/.test(token)) {
      return res.status(404).send(notFoundHtml('Invalid unsubscribe link.'));
    }
    try {
      const r = await pool.query(
        `SELECT * FROM unsubscribe_tokens WHERE token = $1`,
        [token]
      );
      if (!r.rows.length) return res.status(404).send(notFoundHtml('Invalid unsubscribe link.'));
      const t = r.rows[0];
      if (!t.used_at) {
        await compliance.flipOptOut(pool, { leadId: t.lead_id, userId: t.user_id, reason: 'one_click' });
        await pool.query(`UPDATE unsubscribe_tokens SET used_at = NOW() WHERE token = $1`, [token]);
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html><html><head><title>Unsubscribed</title></head><body style="font-family:-apple-system,sans-serif;text-align:center;padding:80px 20px;background:#f8fafc;">
        <h1 style="font-weight:700;color:#0f172a;">You're unsubscribed</h1>
        <p style="color:#64748b;">You will not receive any further outreach from this sender.</p>
        </body></html>`);
    } catch (e) {
      console.error('[solar/unsubscribe]', e.message);
      res.status(500).send(notFoundHtml('Unable to process the unsubscribe right now.'));
    }
  });

  // ── PROPOSAL GENERATOR (customer-facing shareable HTML) ──────────────
  // POST /solar/leads/:leadId/proposal  → creates a tokenized public page
  router.post('/leads/:leadId/proposal', authMiddleware, requireShopFlow, async (req, res) => {
    const uid = String(req.user.id);
    try {
      const baseUrl = appBaseUrl();
      const result = await solarProposal.createProposal({
        pool, userId: uid, leadId: parseInt(req.params.leadId, 10), baseUrl,
      });
      try {
        await logActivity(pool, {
          leadId: parseInt(req.params.leadId, 10), userId: uid,
          type: 'quote_sent', subject: 'Solar proposal generated',
          metadata: { token: result.token, url: result.url },
        });
      } catch { /* non-fatal */ }
      res.json(result);
    } catch (e) {
      console.error('[solar/proposal]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /solar/proposal/:token  → public HTML page
  // GET /solar/proposal/:token.pdf  → Chromium-rendered PDF
  // Single handler dispatches by extension; express 4 path-parameter regex
  // for ".pdf" suffixes is finicky, so we route on the unprefixed segment
  // and split here.
  router.get('/proposal/:token', async (req, res) => {
    const raw = req.params.token;
    const wantsPdf = raw.endsWith('.pdf');
    const token = wantsPdf ? raw.slice(0, -4) : raw;

    if (!/^[a-f0-9]{40}$/.test(token)) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    try {
      if (wantsPdf) {
        const pdf = await solarProposal.getProposalPdfByToken(pool, token);
        if (!pdf) return res.status(404).json({ error: 'Proposal not found' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="HelioScout-Proposal-${token.slice(0, 8)}.pdf"`);
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.send(pdf);
      }
      const html = await solarProposal.getProposalHtmlByToken(pool, token);
      if (!html) return res.status(404).send(notFoundHtml('Proposal not found'));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      console.error('[solar/proposal]', e.message);
      // Don't leak DB errors / internal infra in the response body.
      res.status(500).send(notFoundHtml('Unable to render the proposal right now.'));
    }
  });

  // ── QUALIFY A SINGLE LEAD (firmographic + Google Solar + DSIRE + ROI) ─
  // POST /solar/qualify  body: { domain?, company?, street?, city?, state?, zip?, latitude?, longitude?, building_sqft?, roof_type? }
  router.post('/qualify', authMiddleware, subMiddleware, async (req, res) => {
    try {
      const result = await qualifyLead.qualify(req.body || {});
      res.json(result);
    } catch (e) {
      console.error('[solar/qualify]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── HYPER-QUALIFIED LEADS ────────────────────────────────────────────
  // Returns only leads that pass the three-library qualification gate:
  //   1. NAICS fit ≥ 70 (industry has strong solar profile)
  //   2. Math: building_sqft + roof_type both populated → real system size
  //   3. Incentives: state has at least one stackable program
  //   4. Contactable: phone OR email present
  // No tire-kickers.
  router.get('/qualified', authMiddleware, subMiddleware, async (req, res) => {
    const uid = String(req.user.id);
    const { state = null, limit = 50 } = req.query;
    const params = [];
    const conds = [
      `(source IN ('google_places_solar','osm_industrial','permit_feed') OR source LIKE 'commercial_csv_%')`,
      `building_sqft IS NOT NULL`,
      `roof_type IN ('flat','membrane','metal')`,
      `(phone IS NOT NULL OR email IS NOT NULL)`,
    ];
    if (state) { params.push(String(state).toUpperCase()); conds.push(`state = $${params.length}`); }
    const safeLimit = Math.min(parseInt(limit, 10) || 50, 200);
    params.push(safeLimit);
    try {
      const r = await pool.query(`
        SELECT *, ${SOLAR_SCORE_SQL} AS solar_score
        FROM companies
        WHERE ${conds.join(' AND ')}
        ORDER BY ${SOLAR_SCORE_SQL} DESC, building_sqft DESC
        LIMIT $${params.length}
      `, params);

      // Now filter by the three-library qualification gate.
      const ir = await pool.query(
        `SELECT company_id FROM imports WHERE user_id = $1`, [uid]
      );
      const imported = new Set(ir.rows.map(row => row.company_id));

      const qualified = [];
      for (const c of r.rows) {
        const naicsCode = c.naics_code || naicsFit.inferNaicsFromIndustry(c.industry);
        const naics = naicsFit.lookup(naicsCode);
        if (!naics || naics.fit < 70) continue; // gate #1

        const utilityRate = c.raw_data?.nrel_rate?.commercial_rate || solarMath.DEFAULT_RATE;
        const econ = solarMath.fullEstimate({
          buildingSqft: c.building_sqft, roofType: c.roof_type,
          latitude: c.latitude, utilityRate, estAnnualKwh: c.est_annual_kwh,
        });
        if (econ.system_kw < 25) continue; // gate #2 — too small to bother

        const tariff = tariffs.lookup(c.utility_provider);
        const intel = incentives.buildPropertyIntel({
          state: c.state, city: c.city, zip: c.zip,
          systemKw: econ.system_kw, annualKwh: econ.annual_kwh, grossCost: econ.gross_cost_usd,
          tariff, bonuses: {},
        });
        if (intel.stack.total_incentives < econ.gross_cost_usd * 0.35) continue; // gate #3 — incentive coverage too weak

        qualified.push({
          id: c.id, source: c.source, name: c.name,
          street: c.street, city: c.city, state: c.state, zip: c.zip,
          phone: c.phone, email: c.email, website: c.website,
          building_sqft: c.building_sqft, roof_type: c.roof_type,
          utility_provider: c.utility_provider,
          latitude: c.latitude, longitude: c.longitude,
          solar_score: Number(c.solar_score),
          economics: econ,
          incentive_stack: intel.stack,
          net_payback_years: incentives.netPaybackYears(intel.stack.net_cost, econ.annual_savings_usd),
          urgency: intel.urgency,
          naics_fit: naics,
          tariff,
          already_imported: imported.has(c.id),
          satellite_url: c.latitude && c.longitude
            ? `https://www.google.com/maps/@${c.latitude},${c.longitude},19z/data=!3m1!1e3` : null,
        });
      }

      res.json({ qualified, total: qualified.length, gates_applied: ['naics_fit_70', 'system_kw_25', 'incentive_coverage_35pct'] });
    } catch (e) {
      console.error('[solar/qualified]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── OVERVIEW DASHBOARD ───────────────────────────────────────────────
  // Aggregated stats for the HelioScout home screen. Single endpoint so
  // we don't fire 8 separate queries from the frontend on mount.
  router.get('/overview', authMiddleware, subMiddleware, async (req, res) => {
    const uid = String(req.user.id);
    try {
      const [byState, bySource, byNaics, scoreDist, monthlyAdds, totals] = await Promise.all([
        // Top 10 states by lead count
        pool.query(`
          SELECT state, COUNT(*)::INT AS n
          FROM companies
          WHERE source IN ('google_places_solar','osm_industrial','permit_feed','epa_ghgrp','usa_spending')
             OR source LIKE 'commercial_csv_%'
          GROUP BY state ORDER BY n DESC LIMIT 10
        `),
        pool.query(`
          SELECT source, COUNT(*)::INT AS n
          FROM companies
          WHERE source IN ('google_places_solar','osm_industrial','permit_feed','epa_ghgrp','usa_spending')
             OR source LIKE 'commercial_csv_%'
          GROUP BY source ORDER BY n DESC
        `),
        pool.query(`
          SELECT LEFT(naics_code, 2) AS naics2, COUNT(*)::INT AS n
          FROM companies
          WHERE naics_code IS NOT NULL
            AND (source IN ('epa_ghgrp','usa_spending','osm_industrial','permit_feed','google_places_solar') OR source LIKE 'commercial_csv_%')
          GROUP BY naics2 ORDER BY n DESC LIMIT 10
        `),
        // Bucketed solar-score histogram
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE ${SOLAR_SCORE_SQL} >= 80)::INT AS bucket_80_100,
            COUNT(*) FILTER (WHERE ${SOLAR_SCORE_SQL} BETWEEN 60 AND 79)::INT AS bucket_60_79,
            COUNT(*) FILTER (WHERE ${SOLAR_SCORE_SQL} BETWEEN 40 AND 59)::INT AS bucket_40_59,
            COUNT(*) FILTER (WHERE ${SOLAR_SCORE_SQL} BETWEEN 20 AND 39)::INT AS bucket_20_39,
            COUNT(*) FILTER (WHERE ${SOLAR_SCORE_SQL} < 20)::INT AS bucket_under_20
          FROM companies
          WHERE source IN ('google_places_solar','osm_industrial','permit_feed','epa_ghgrp','usa_spending')
             OR source LIKE 'commercial_csv_%'
        `),
        pool.query(`
          SELECT date_trunc('month', ingested_at)::DATE AS month, COUNT(*)::INT AS n
          FROM companies
          WHERE (source IN ('google_places_solar','osm_industrial','permit_feed','epa_ghgrp','usa_spending') OR source LIKE 'commercial_csv_%')
            AND ingested_at >= NOW() - INTERVAL '12 months'
          GROUP BY month ORDER BY month
        `),
        pool.query(`
          SELECT
            (SELECT COUNT(*)::INT FROM companies WHERE source IN ('google_places_solar','osm_industrial','permit_feed','epa_ghgrp','usa_spending') OR source LIKE 'commercial_csv_%') AS total_companies,
            (SELECT COUNT(*)::INT FROM leads WHERE user_id = $1 AND category = 'commercial_solar') AS my_solar_leads,
            (SELECT COUNT(*)::INT FROM leads WHERE user_id = $1 AND category = 'commercial_solar' AND status IN ('won')) AS my_won,
            (SELECT COUNT(*)::INT FROM solar_auctions WHERE user_id = $1 AND status = 'open') AS my_open_auctions,
            (SELECT COUNT(*)::INT FROM pilot_installers WHERE user_id = $1 AND active = TRUE) AS my_installers
        `, [uid]),
      ]);

      res.json({
        totals: totals.rows[0] || {},
        by_state:   byState.rows,
        by_source:  bySource.rows,
        by_naics2:  byNaics.rows,
        score_distribution: scoreDist.rows[0] || {},
        monthly_adds: monthlyAdds.rows,
      });
    } catch (e) {
      console.error('[solar/overview]', e.message);
      res.status(500).json({ error: 'Could not load overview' });
    }
  });

  // ── BYO LEAD CSV IMPORT ──────────────────────────────────────────────
  // Lets brokers upload their own CSV of leads (e.g. exported from a prior
  // CRM, LoopNet, or a manual scrape) and bulk-create them as commercial_solar
  // leads in their CRM. Smart column mapping reuses csv-commercial.js patterns.
  router.post('/leads/csv-import', authMiddleware, requireShopFlow, async (req, res) => {
    const uid = String(req.user.id);
    const { csv_text } = req.body || {};
    if (!csv_text || typeof csv_text !== 'string' || csv_text.length < 30) {
      return res.status(400).json({ error: 'Send raw CSV text in the csv_text field.' });
    }
    try {
      const lines = csv_text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return res.status(400).json({ error: 'CSV needs a header + at least one data row.' });

      // Minimal CSV parser (handles quoted commas).
      const parse = (line) => {
        const out = []; let cur = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
          else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
          else cur += c;
        }
        out.push(cur); return out;
      };
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      // Column-name → field mapping. Aliases match the most common headers.
      const FIELD_ALIASES = {
        company: ['company','name','propertyname','buildingname','organization'],
        contact_name: ['contactname','contact','firstname','fullname'],
        contact_title: ['title','contacttitle','role','position'],
        email: ['email','emailaddress'],
        phone: ['phone','phonenumber','telephone'],
        website: ['website','url','domain'],
        city: ['city','town'],
        state: ['state'],
        street: ['address','street','streetaddress','address1'],
        zip: ['zip','zipcode','postalcode'],
        building_sqft: ['sqft','squarefeet','buildingsqft','grosssqft'],
        roof_type: ['rooftype','roof'],
        naics_code: ['naics','naicscode'],
        pitch_angle: ['notes','pitchangle','pitchnotes','comments'],
      };
      const headers = parse(lines[0]).map(norm);
      const colMap = {};
      for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        for (let i = 0; i < headers.length; i++) {
          if (aliases.includes(headers[i])) { colMap[field] = i; break; }
        }
      }
      if (colMap.company === undefined) {
        return res.status(400).json({ error: 'CSV must include a company / name column.' });
      }

      const crypto = require('crypto');
      let inserted = 0, skipped = 0, errors = 0;
      for (let i = 1; i < lines.length; i++) {
        const row = parse(lines[i]);
        const cell = (field) => colMap[field] !== undefined ? String(row[colMap[field]] ?? '').trim() : '';
        const company = cell('company');
        if (!company) { skipped++; continue; }
        const clientId = `byo-${crypto.randomBytes(8).toString('hex')}`;
        try {
          await pool.query(`
            INSERT INTO leads
              (user_id, client_id, company, category, state, city, address,
               contact_name, contact_title, email, phone, website, status, source,
               consent_basis, created_at, updated_at)
            VALUES ($1,$2,$3,'commercial_solar',$4,$5,$6,$7,$8,$9,$10,$11,'new','byo_csv',
                    'imported',NOW(),NOW())
            ON CONFLICT (user_id, client_id) DO NOTHING
          `, [uid, clientId, company,
              (cell('state') || '').toUpperCase().slice(0, 2) || null,
              cell('city') || null, cell('street') || null,
              cell('contact_name') || null, cell('contact_title') || null,
              (cell('email') || '').toLowerCase() || null,
              cell('phone') || null, cell('website') || null]);
          inserted++;
        } catch (e) {
          errors++;
        }
      }
      res.json({
        ok: true, inserted, skipped, errors,
        mapped_columns: Object.keys(colMap),
      });
    } catch (e) {
      console.error('[solar/csv-import]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── REAL-TIME AUCTION STREAM (Server-Sent Events) ────────────────────
  // Public endpoint — installers from email links keep a live connection
  // open and see bid updates streamed in. Polls the auction every 5s
  // server-side and pushes deltas. Much simpler than WebSockets, works
  // through every proxy.
  router.get('/auctions/:token/stream', async (req, res) => {
    const token = req.params.token;
    if (!/^[a-f0-9]{40}$/.test(token)) {
      return res.status(404).end();
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let lastSig = '';
    let alive = true;
    req.on('close', () => { alive = false; });

    async function tick() {
      if (!alive) return;
      try {
        const a = await pool.query(`SELECT id, status, closes_at FROM solar_auctions WHERE public_token = $1`, [token]);
        if (!a.rows.length) {
          res.write(`event: error\ndata: ${JSON.stringify({ error: 'Auction not found' })}\n\n`);
          return res.end();
        }
        const auction = a.rows[0];
        const bids = await pool.query(`
          SELECT b.bid_mode, b.amount, b.commission_pct, b.submitted_at
          FROM solar_auction_bids b
          WHERE b.auction_id = $1
          ORDER BY b.submitted_at ASC
        `, [auction.id]);
        const payload = {
          status: auction.status,
          closes_at: auction.closes_at,
          bid_count: bids.rows.length,
          bids: bids.rows.map(b => ({
            bid_mode: b.bid_mode, amount: Number(b.amount),
            commission_pct: Number(b.commission_pct),
            submitted_at: b.submitted_at,
          })),
        };
        const sig = JSON.stringify(payload);
        if (sig !== lastSig) {
          res.write(`event: update\ndata: ${sig}\n\n`);
          lastSig = sig;
        }
        if (auction.status !== 'open') {
          res.write(`event: closed\ndata: ${JSON.stringify({ status: auction.status })}\n\n`);
          return res.end();
        }
      } catch (e) {
        if (alive) res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
      }
      // Keep-alive comment every tick so proxies don't kill the connection.
      if (alive) res.write(': keep-alive\n\n');
      setTimeout(tick, 5000);
    }
    tick();
  });

  // ── PUBLIC SAMPLE LEAD DELIVERY (top-of-funnel) ──────────────────────
  // POST /solar/store/sample — visitor on the marketing page submits email
  // + company, gets the 50-lead sample pack delivered as a CSV attachment.
  // We capture them as a marketing-funnel lead in their own right.
  router.post('/store/sample', express.json(), async (req, res) => {
    const { email, company } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    try {
      // Log the inbound prospect so we can follow up.
      await pool.query(`
        INSERT INTO outreach_audit_log (user_id, channel, recipient, consent_basis, metadata)
        VALUES ('marketing', 'sample_request', $1, 'opt_in', $2)
      `, [email.toLowerCase(), JSON.stringify({ company: company || null, kind: 'free_sample_50' })])
        .catch(() => { /* table may not exist in dev — non-fatal */ });

      // Read the pre-baked sample CSV from disk.
      const path = require('path');
      const fs = require('fs');
      const csvPath = path.join(__dirname, '..', 'sales-assets', 'territory-packs', 'helioscout-sample-50leads.csv');
      const csv = fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf-8') : '';
      if (!csv) {
        console.error('[store/sample] sample CSV missing at', csvPath);
        return res.status(500).json({ error: 'Sample unavailable — try again shortly' });
      }

      // Email delivery (best-effort — works only if Resend is configured).
      try {
        await sendCompliantEmail({
          to: email,
          subject: 'Your 50 free commercial solar leads (HelioScout)',
          body: `Hi${company ? ' from ' + company : ''},\n\nThanks for grabbing the sample. Attached are 50 fully-enriched commercial solar leads — every row has a NAICS fit score, system-size estimate, 25-year NPV, and a sales script you can lift verbatim.\n\nIf you want the full state pack (your state, all leads) it's $1,497 one-time. The national pack with all 20,206 leads is $4,997.\n\nReply to this email with the state you want and I'll send the Stripe link.\n\n— Jake @ HelioScout`,
          skipCompliance: true,
        });
      } catch (e) { /* logged inside sendCompliantEmail */ }

      // Always return success even if email failed — the user still gets the
      // direct download URL so the funnel doesn't break in dev environments.
      res.json({
        ok: true,
        download_url: '/solar/store/sample.csv',
        message: 'Check your inbox in the next 60 seconds. If you do not see it, grab the CSV directly via the download_url.',
      });
    } catch (e) {
      console.error('[store/sample]', e.message);
      res.status(500).json({ error: 'Could not send sample right now.' });
    }
  });

  // Direct-download endpoint so the funnel works even when email delivery is
  // disabled in dev. Also gives the sales page a backup CTA.
  router.get('/store/sample.csv', (req, res) => {
    const path = require('path');
    const fs = require('fs');
    const csvPath = path.join(__dirname, '..', 'sales-assets', 'territory-packs', 'helioscout-sample-50leads.csv');
    if (!fs.existsSync(csvPath)) return res.status(404).json({ error: 'Sample unavailable' });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="HelioScout-Sample-50-Leads.csv"');
    fs.createReadStream(csvPath).pipe(res);
  });

  // ── UNIFIED ALL-LEADS BUNDLE (public, top-of-funnel power move) ──────
  // The full 20,206-lead bundle in CSV, JSONL, or ZIP. Free, no auth, no
  // email gate — a "here's literally everything" trust signal that funnels
  // visitors to the curated state packs (which carry the enrichment).
  // Run `npm run bundle:all-leads` to regenerate the artifacts.
  const ALL_LEADS_FORMATS = {
    csv:   { file: 'helioscout-all-leads.csv',   mime: 'text/csv' },
    jsonl: { file: 'helioscout-all-leads.jsonl', mime: 'application/x-ndjson' },
    zip:   { file: 'helioscout-all-leads.zip',   mime: 'application/zip' },
  };
  for (const [ext, meta] of Object.entries(ALL_LEADS_FORMATS)) {
    router.get(`/store/all-leads.${ext}`, (req, res) => {
      const path = require('path');
      const fs = require('fs');
      const filePath = path.join(__dirname, '..', 'sales-assets', 'all-leads', meta.file);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          error: 'Bundle not yet generated',
          hint: 'Run `npm run bundle:all-leads` to build the artifact.',
        });
      }
      res.setHeader('Content-Type', meta.mime);
      res.setHeader('Content-Disposition', `attachment; filename="${meta.file}"`);
      // Cache-friendly: bundle changes infrequently and is large.
      res.setHeader('Cache-Control', 'public, max-age=3600');
      fs.createReadStream(filePath).pipe(res);
    });
  }

  // ── STRIPE CHECKOUT FOR LEAD PACKS (auto-fulfillment) ────────────────
  // POST /solar/store/checkout — one-time Stripe Checkout for a lead pack.
  // On payment success the /stripe/webhook reads the metadata and emails the
  // buyer the right CSV(s). Pricing via env price IDs (STRIPE_PRICE_METRO /
  // STRIPE_PRICE_STATE / STRIPE_PRICE_NATIONAL) with inline price_data
  // fallback so it works in test mode without pre-created products.
  router.post('/store/checkout', express.json(), async (req, res) => {
    if (!stripe) return res.status(400).json({ error: 'Payments not configured (no STRIPE_SECRET_KEY)' });
    const { pack, state, email } = req.body || {};
    const CATALOG = {
      metro:    { name: 'HelioScout — Single Metro Pack',  amount: 49700,  envPrice: 'STRIPE_PRICE_METRO' },
      state:    { name: 'HelioScout — State Pack',         amount: 149700, envPrice: 'STRIPE_PRICE_STATE' },
      national: { name: 'HelioScout — National Pack (all 20,206 leads)', amount: 499700, envPrice: 'STRIPE_PRICE_NATIONAL' },
    };
    const item = CATALOG[pack];
    if (!item) return res.status(400).json({ error: 'pack must be one of: metro, state, national' });
    if ((pack === 'state' || pack === 'metro') && !state) {
      return res.status(400).json({ error: `${pack} pack requires a target state` });
    }
    try {
      const envPriceId = process.env[item.envPrice];
      const baseUrl = appBaseUrl();
      const lineItem = envPriceId
        ? { price: envPriceId, quantity: 1 }
        : {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: item.amount,
              product_data: {
                name: item.name + (state ? ` (${String(state).toUpperCase()})` : ''),
                description: 'EPA-verified commercial solar leads, NAICS-scored with ROI math + sales scripts.',
              },
            },
          };
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [lineItem],
        success_url: `${baseUrl}/buy-solar-leads?purchase=success&pack=${pack}`,
        cancel_url: `${baseUrl}/buy-solar-leads?purchase=cancel`,
        customer_email: email || undefined,
        metadata: {
          helioscout_pack: pack,
          helioscout_state: String(state || '').toUpperCase(),
          // helioscout_user_id is optional; when present, fulfillLeadPack uses
          // it directly instead of falling back to email→user lookup. The
          // public sales page doesn't set it; the in-app upgrade flow does.
          ...(req.body?.user_id ? { helioscout_user_id: String(req.body.user_id) } : {}),
          fulfillment: 'lead_pack',
        },
      });
      res.json({ url: session.url });
    } catch (e) {
      console.error('[store/checkout]', e.message);
      res.status(500).json({ error: 'Could not create checkout session' });
    }
  });

  // ── PUBLIC ROI CALCULATOR (no auth — top-of-funnel) ─────────────────
  // POST /solar/store/calculate — anyone can run an ROI estimate on their
  // own building. Returns the full Monte Carlo + incentive stack so the
  // public calculator page renders inline. We skip firmographic + Google
  // Solar API enrichment to avoid burning API quota on anonymous traffic.
  router.post('/store/calculate', express.json(), async (req, res) => {
    const { building_sqft, state, naics_code, roof_type, utility, city, zip } = req.body || {};
    if (!building_sqft || building_sqft < 1000) {
      return res.status(400).json({ error: 'building_sqft must be at least 1,000' });
    }
    try {
      const solarMath = require('./solar-math');
      const incentives = require('./solar-incentives');
      const naicsFitMod = require('./naics-solar-fit');
      const tariffsMod = require('./solar-tariffs');
      const monteCarlo = require('./solar-monte-carlo');

      // Per-state mean commercial rate fallback when no specific utility.
      const STATE_RATE = {
        AK:0.21,AL:0.13,AR:0.10,AZ:0.13,CA:0.27,CO:0.12,CT:0.22,DC:0.16,DE:0.13,FL:0.12,
        GA:0.13,HI:0.40,IA:0.10,ID:0.10,IL:0.11,IN:0.13,KS:0.13,KY:0.12,LA:0.10,MA:0.23,
        MD:0.13,ME:0.18,MI:0.14,MN:0.13,MO:0.11,MS:0.13,MT:0.12,NC:0.10,ND:0.10,NE:0.10,
        NH:0.20,NJ:0.17,NM:0.12,NV:0.12,NY:0.21,OH:0.12,OK:0.10,OR:0.11,PA:0.13,RI:0.20,
        SC:0.12,SD:0.11,TN:0.13,TX:0.10,UT:0.10,VA:0.10,VT:0.20,WA:0.10,WI:0.13,WV:0.11,WY:0.11,
      };
      const tariff = tariffsMod.lookup(utility);
      const rate = tariff?.retail_rate_commercial || STATE_RATE[(state || '').toUpperCase()] || 0.13;
      const fit = naics_code ? naicsFitMod.lookup(naics_code) : null;
      const econ = solarMath.fullEstimate({
        buildingSqft: parseInt(building_sqft, 10),
        roofType: roof_type || 'membrane',
        latitude: null,
        utilityRate: rate,
        estAnnualKwh: null,
      });
      const intel = incentives.buildPropertyIntel({
        state: (state || '').toUpperCase(),
        city: city || null,
        zip: zip || null,
        systemKw: econ.system_kw,
        annualKwh: econ.annual_kwh,
        grossCost: econ.gross_cost_usd,
        tariff,
        bonuses: {},
      });
      // Lighter Monte Carlo for public traffic (1000 runs vs 5000).
      const sim = monteCarlo.simulate({
        systemKw: econ.system_kw,
        year1AnnualKwh: econ.annual_kwh,
        year1RatePerKwh: rate,
        netInstallCost: intel.stack.net_cost,
        runs: 1000,
      });
      const netPayback = sim ? sim.payback_years.p50 : null;
      res.json({
        ok: true,
        inputs: { building_sqft, state, naics_code, roof_type, utility },
        economics: econ,
        incentive_stack: intel.stack,
        urgency: intel.urgency,
        simulation: sim ? { npv: sim.npv, payback_years: sim.payback_years, lcoe_per_kwh: sim.lcoe_per_kwh } : null,
        net_payback_years_p50: netPayback,
        naics_fit: fit,
        tariff,
        rate_per_kwh: rate,
        // Funnel cross-sell — point them at the lead pack for their state.
        cross_sell: state
          ? { state: state.toUpperCase(), pack_url: `/buy-solar-leads#pricing` }
          : null,
      });
    } catch (e) {
      console.error('[store/calculate]', e.message);
      res.status(500).json({ error: 'Calculator unavailable right now' });
    }
  });

  // ── "ROAST MY PITCH" — viral lead magnet ─────────────────────────────
  // POST /solar/store/roast-pitch — installer pastes their cold email,
  // we rewrite it using a NAICS-aware angle. Captures their email +
  // industry as a soft lead and demonstrates our intelligence layer.
  router.post('/store/roast-pitch', express.json(), async (req, res) => {
    const { email_text, target_naics, target_state, sender_email, sender_company } = req.body || {};
    if (!email_text || email_text.length < 30) {
      return res.status(400).json({ error: 'Paste your cold email (at least 30 characters)' });
    }
    try {
      const naicsFitMod = require('./naics-solar-fit');
      const fit = target_naics ? naicsFitMod.lookup(target_naics) : null;
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        // Deterministic fallback when no AI key — still useful, just less magical.
        return res.json({
          ok: true,
          original: email_text,
          rewrite: deterministicRewrite(email_text, fit),
          fit,
          rewrite_engine: 'deterministic',
        });
      }
      const prompt = `You are a B2B solar sales coach. Rewrite the cold email below so it lands harder for a commercial solar installer reaching out to a prospect in ${target_state || 'US'}, NAICS ${target_naics || 'commercial'} (${fit?.code ? `industry profile: ${fit.kwhDriver}, load profile: ${fit.load_profile}, tax appetite: ${fit.tax_appetite}` : 'generic commercial'}).

Critical constraints:
- Open with a hyper-specific property/industry hook (no "I hope this finds you well")
- Reference dollar numbers and payback math the prospect cares about
- If tax_appetite is "tax_exempt", pitch PPA not direct purchase
- Use ${fit?.sales_script ? `this proven script as inspiration: "${fit.sales_script}"` : 'an industry-relevant opener'}
- End with ONE soft CTA (15-min call or "send me your last utility bill")
- Under 130 words

ORIGINAL EMAIL:
"""${email_text}"""

Return ONLY a JSON object: {"rewrite": "...", "what_changed": "..."}`;

      const claude = require('node:https');
      const body = JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      });
      const aiText = await new Promise((resolve, reject) => {
        const req = claude.request({
          hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
        }, (r) => { let data = ''; r.on('data', c => data += c); r.on('end', () => resolve(data)); });
        req.on('error', reject); req.write(body); req.end();
      });
      const parsed = JSON.parse(aiText);
      const raw = parsed.content?.[0]?.text || '';
      let payload;
      try { payload = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()); }
      catch { payload = { rewrite: raw.slice(0, 1500), what_changed: 'AI returned non-JSON; raw text included.' }; }

      // Soft lead capture
      if (sender_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender_email)) {
        await pool.query(`
          INSERT INTO outreach_audit_log (user_id, channel, recipient, consent_basis, metadata)
          VALUES ('marketing', 'roast_pitch', $1, 'opt_in', $2)
        `, [sender_email.toLowerCase(), JSON.stringify({ company: sender_company || null, target_naics, target_state })])
          .catch(() => {});
      }
      res.json({
        ok: true,
        original: email_text,
        rewrite: payload.rewrite,
        what_changed: payload.what_changed,
        fit,
        rewrite_engine: 'claude',
      });
    } catch (e) {
      console.error('[store/roast-pitch]', e.message);
      res.status(500).json({ error: 'Roaster unavailable right now' });
    }
  });

  // ── STATE PREVIEW — per-state landing-page data ──────────────────────
  // GET /solar/store/state-stats/:state — public stats for the state landing
  // pages (count, top NAICS, average fit score). Lightweight cache header.
  router.get('/store/state-stats/:state', async (req, res) => {
    const state = (req.params.state || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) return res.status(400).json({ error: 'Invalid state' });
    try {
      // These match the territory-pack file layout
      const path = require('path');
      const fs = require('fs');
      const dir = path.join(__dirname, '..', 'sales-assets', 'territory-packs');
      if (!fs.existsSync(dir)) return res.json({ state, count: 0, top_sectors: [], sample: [] });
      const files = fs.readdirSync(dir).filter(f => f.startsWith(`helioscout-${state}-`));
      if (!files.length) return res.json({ state, count: 0, top_sectors: [], sample: [] });
      const file = files[0];
      const m = file.match(/-(\d+)leads\.csv$/);
      const count = m ? parseInt(m[1], 10) : 0;

      // Parse the first ~30 rows to extract top sectors + sample
      const csv = fs.readFileSync(path.join(dir, file), 'utf-8');
      const lines = csv.split('\n').slice(1, 200).filter(Boolean);
      const sectorCounts = new Map();
      let totalScore = 0; let scoreCount = 0;
      const sample = [];
      for (const line of lines) {
        const cols = line.match(/("[^"]*"|[^,]+)/g)?.map(c => c.replace(/^"|"$/g, '')) || [];
        const [company, city, st, _src, _id, _naics, sector, fit] = cols;
        if (sector) sectorCounts.set(sector, (sectorCounts.get(sector) || 0) + 1);
        const fitNum = parseFloat(fit);
        if (!isNaN(fitNum)) { totalScore += fitNum; scoreCount++; }
        if (sample.length < 5 && fitNum >= 80) {
          sample.push({ company, city, sector, fit: fitNum });
        }
      }
      const topSectors = Array.from(sectorCounts.entries())
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([sector, n]) => ({ sector, n }));
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json({
        state,
        count,
        avg_fit_score: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
        top_sectors: topSectors,
        sample,
        pack_url: `/buy-solar-leads/${state.toLowerCase()}`,
      });
    } catch (e) {
      console.error('[store/state-stats]', e.message);
      res.status(500).json({ error: 'Stats unavailable' });
    }
  });

  // ── SLA DASHBOARD ────────────────────────────────────────────────────
  // Median time-to-first-touch — gamification for speed-to-lead.
  router.get('/sla', authMiddleware, subMiddleware, async (req, res) => {
    const uid = String(req.user.id);
    try {
      const r = await pool.query(`
        SELECT
          COUNT(*)::INT AS total_leads,
          AVG(EXTRACT(EPOCH FROM (la.created_at - l.created_at)))::FLOAT AS avg_seconds_to_first_touch,
          (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (la.created_at - l.created_at))))::FLOAT AS median_seconds_to_first_touch,
          COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (la.created_at - l.created_at)) < 60) AS under_one_minute,
          COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (la.created_at - l.created_at)) < 300) AS under_five_minutes
        FROM leads l
        LEFT JOIN LATERAL (
          SELECT created_at FROM lead_activities WHERE lead_id = l.id AND type = 'email_sent'
          ORDER BY created_at ASC LIMIT 1
        ) la ON TRUE
        WHERE l.user_id = $1 AND l.category = 'commercial_solar' AND la.created_at IS NOT NULL
      `, [uid]);
      res.json(r.rows[0] || {});
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── CRM integrations (Phase B4) ─────────────────────────────────────────
  // HubSpot OAuth + contact push. Pattern intended to extend to Salesforce
  // and Pipedrive later — `crm_connections` already keys by provider.
  const hubspot = require('./integrations/hubspot');

  // GET /solar/integrations/hubspot/connect → 302 to HubSpot OAuth
  router.get('/integrations/hubspot/connect', authMiddleware, (req, res) => {
    try {
      const redirectUri = `${appBaseUrl}/solar/integrations/hubspot/callback`;
      const url = hubspot.getAuthorizeUrl(req.user.id, redirectUri);
      res.redirect(url);
    } catch (e) {
      const status = e.code === 'HUBSPOT_NOT_CONFIGURED' ? 503 : 500;
      res.status(status).json({ error: e.message, code: e.code });
    }
  });

  // GET /solar/integrations/hubspot/callback (no auth — HubSpot calls this)
  // state param carries the user_id we set in getAuthorizeUrl.
  router.get('/integrations/hubspot/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code or state');
    try {
      const redirectUri = `${appBaseUrl}/solar/integrations/hubspot/callback`;
      const tokenJson = await hubspot.exchangeCodeForToken(code, redirectUri);
      await hubspot.saveTokenForUser(pool, state, tokenJson);
      // Best-effort: create custom HelioScout properties so the first push
      // doesn't fail. Don't block on it.
      hubspot.ensureCustomProperties(pool, state).catch(err =>
        console.warn('[hubspot] ensureCustomProperties failed:', err.message)
      );
      if (logActivity) {
        try { await logActivity(state, null, 'integration_connected', { provider: 'hubspot', account_id: tokenJson.hub_id }); } catch {}
      }
      // Redirect to SolarScout Integrations tab
      res.redirect(`/?mode=solar_scout&tab=integrations&connected=hubspot`);
    } catch (e) {
      console.error('[hubspot callback]', e);
      res.status(500).send(`HubSpot connection failed: ${e.message}`);
    }
  });

  // GET /solar/integrations/status → which CRMs are connected for this user
  router.get('/integrations/status', authMiddleware, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT provider, account_id, account_name, updated_at FROM crm_connections WHERE user_id = $1`,
        [String(req.user.id)]
      );
      res.json({
        hubspot_configured: !!process.env.HUBSPOT_CLIENT_ID,
        connections: r.rows,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /solar/integrations/hubspot/disconnect
  router.post('/integrations/hubspot/disconnect', authMiddleware, express.json(), async (req, res) => {
    try {
      await hubspot.disconnect(pool, req.user.id);
      if (logActivity) {
        try { await logActivity(req.user.id, null, 'integration_disconnected', { provider: 'hubspot' }); } catch {}
      }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /solar/integrations/hubspot/push — manually re-push a state pack's
  // leads to the user's connected HubSpot. Useful for re-syncing after a
  // pack purchase or for testing. Body: { state: 'TX' } or { leads: [...] }.
  router.post('/integrations/hubspot/push', authMiddleware, express.json(), async (req, res) => {
    try {
      const { state, leads } = req.body || {};
      let toPush = Array.isArray(leads) ? leads : null;
      if (!toPush && state) {
        // Load from this user's commercial_solar leads in the state
        const r = await pool.query(`
          SELECT l.company, l.city, l.state, l.naics_code, l.naics_sector,
                 c.industry, c.building_sqft, c.latitude, c.longitude
          FROM leads l
          LEFT JOIN companies c ON c.id = l.source_company_id
          WHERE l.user_id = $1 AND l.category = 'commercial_solar' AND l.state = $2
          LIMIT 500
        `, [String(req.user.id), String(state).toUpperCase()]);
        toPush = r.rows;
      }
      if (!toPush || !toPush.length) return res.status(400).json({ error: 'No leads to push' });
      const result = await hubspot.pushContacts(pool, req.user.id, toPush);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

// Auction auto-close + winner scoring.
async function closeAuction(pool, { auctionId, userId, manualBidId = null, deps }) {
  // Atomically transition status open → closing so concurrent workers (or a
  // racing manual-award click) can't both close the same auction. The status
  // becomes 'awarded' or 'closed_no_bids' below; until then, 'closing' acts
  // as a soft lock without needing an explicit transaction.
  const aR = await pool.query(
    `UPDATE solar_auctions SET status = 'closing', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'open'
     RETURNING *`,
    [auctionId, userId]
  );
  if (!aR.rows.length) {
    // Either someone else already closed it, or the auction doesn't exist.
    const existing = await pool.query(`SELECT * FROM solar_auctions WHERE id = $1 AND user_id = $2`, [auctionId, userId]);
    if (!existing.rows.length) throw new Error('Auction not found');
    return { auction: existing.rows[0], message: 'Already closed' };
  }
  const auction = aR.rows[0];

  const bR = await pool.query(`
    SELECT b.*, i.installer_name, i.installer_email, i.accept_token, i.price_per_lead
    FROM solar_auction_bids b
    JOIN pilot_installers i ON i.id = b.installer_id
    WHERE b.auction_id = $1`, [auctionId]);
  const bids = bR.rows;

  if (!bids.length) {
    await pool.query(
      `UPDATE solar_auctions SET status = 'closed_no_bids', updated_at = NOW() WHERE id = $1`,
      [auctionId]
    );
    return { auction: { ...auction, status: 'closed_no_bids' }, winner: null };
  }

  // Score bids: fixed → just the amount. Commission → expected value at
  // installer's average close rate (defaults to 25% if no history). Hybrid
  // → sum of fixed + expected commission.
  const scored = [];
  for (const b of bids) {
    const cr = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE outcome = 'closed_won')::FLOAT
              / NULLIF(COUNT(*), 0) AS rate
       FROM pilot_assignments WHERE installer_id = $1`, [b.installer_id]
    );
    const closeRate = Number(cr.rows[0]?.rate) || 0.25;
    let score = 0;
    if (b.bid_mode === 'fixed') score = Number(b.amount);
    else if (b.bid_mode === 'commission') score = Number(auction.snapshot?.economics?.gross_cost_usd || 0) * (Number(b.commission_pct) / 100) * closeRate;
    else /* hybrid */ score = Number(b.amount) + (Number(auction.snapshot?.economics?.gross_cost_usd || 0) * (Number(b.commission_pct) / 100) * closeRate);
    scored.push({ ...b, _score: score, _close_rate: closeRate });
    await pool.query(`UPDATE solar_auction_bids SET score = $1 WHERE id = $2`, [score, b.id]);
  }

  const winner = manualBidId
    ? scored.find(b => b.id == manualBidId)
    : scored.reduce((best, b) => !best || b._score > best._score ? b : best, null);
  if (!winner) throw new Error('No winning bid');

  await pool.query(`
    UPDATE solar_auctions SET status = 'awarded', winning_bid_id = $1,
      winner_installer_id = $2, updated_at = NOW() WHERE id = $3`,
    [winner.id, winner.installer_id, auctionId]);

  // Create the underlying pilot_assignment so all downstream tracking works.
  const outcomeToken = crypto.randomBytes(16).toString('hex');
  await pool.query(`
    INSERT INTO pilot_assignments (installer_id, lead_id, user_id, outcome_token, payout_amount, accepted_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (installer_id, lead_id) DO UPDATE SET payout_amount = EXCLUDED.payout_amount, accepted_at = NOW()
  `, [winner.installer_id, auction.lead_id, userId, outcomeToken, winner.bid_mode === 'fixed' ? winner.amount : winner.price_per_lead]);

  // Notify winner + losers
  try {
    const baseUrl = deps.appBaseUrl();
    await deps.sendCompliantEmail({
      to: winner.installer_email,
      subject: `[HelioScout] You won the auction for ${auction.snapshot?.company}`,
      html: `<p>You won! The lead packet for <strong>${escapeHtml(auction.snapshot?.company || '')}</strong> is now exclusively yours.</p>
             <p>Your bid: <strong>${winner.bid_mode}</strong> $${Number(winner.amount).toLocaleString()}${winner.commission_pct ? ' + ' + winner.commission_pct + '% commission' : ''}</p>
             <p><a href="${baseUrl}/installer/${winner.accept_token}">Open your lead inbox</a></p>
             <p>Mark outcome via this link: <a href="${baseUrl}/solar/pilot/outcome/${outcomeToken}">report outcome</a></p>`,
      text: `You won the auction for ${auction.snapshot?.company}. Open your lead inbox: ${baseUrl}/installer/${winner.accept_token}`,
      skipCompliance: true,
    });
    for (const loser of scored.filter(b => b.id !== winner.id)) {
      await deps.sendCompliantEmail({
        to: loser.installer_email,
        subject: `[HelioScout] Auction closed: ${auction.snapshot?.company} — better luck next time`,
        html: `<p>The auction for <strong>${escapeHtml(auction.snapshot?.company || '')}</strong> has closed and went to another installer in your territory.</p>
               <p>Stay tuned — more commercial solar opportunities are queued in your territory.</p>`,
        text: `Auction for ${auction.snapshot?.company} went to another installer. Keep watching for the next one.`,
        skipCompliance: true,
      });
    }
  } catch { /* non-fatal */ }

  return { auction: { ...auction, status: 'awarded', winning_bid_id: winner.id }, winner };
}

function startAuctionWorker(pool, deps) {
  async function tick() {
    try {
      const expired = await pool.query(
        `SELECT id, user_id FROM solar_auctions WHERE status = 'open' AND closes_at <= NOW() LIMIT 20`
      );
      for (const row of expired.rows) {
        try { await closeAuction(pool, { auctionId: row.id, userId: row.user_id, deps }); }
        catch (e) { console.error('[auction worker]', row.id, e.message); }
      }
    } catch (e) { console.error('[auction worker tick]', e.message); }
  }
  tick();
  setInterval(tick, 60_000);
  console.log('· Auction worker: running (checks every 60s)');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Fallback "roast" when no AI key is configured. Replaces common cold-email
// crimes (generic openers, vague CTAs) with concrete language drawn from the
// matched NAICS profile.
function deterministicRewrite(originalText, fit) {
  const opener = fit?.sales_script
    || (fit?.pitchHook ? `Quick note for ${fit.kwhDriver || 'commercial'} buyers — ${fit.pitchHook}` : null)
    || 'Quick note about your facility — I have a specific dollar number worth 30 seconds.';
  const taxLine = fit?.tax_appetite === 'tax_exempt'
    ? "Since you're tax-exempt, I'd structure this as a PPA (you buy kWh below grid rate, third party owns the panels) — no capex from you."
    : "Most commercial buyers in your sector are running this as a direct purchase to capture the full 30% ITC + MACRS stack.";
  const close = "If 15 minutes makes sense this week to walk through actual numbers for your property, send me your last electric bill and I'll come back with a P50/P90 ROI distribution.";
  return [opener, '', taxLine, '', close, '', '— Sender'].join('\n')
    + (fit?.pitchHook ? `\n\n(Note: this was auto-rewritten using HelioScout's intelligence layer for ${fit?.code ? 'NAICS ' + fit.code : 'your industry'}. The real magic happens when you paste your prospect list — we score every lead 0-100. Try it at helioscout.io.)` : '');
}

// Stand-alone HTML page for not-found / sanitized error responses. Keeps the
// public-facing pages on brand instead of leaking raw error text.
function notFoundHtml(message) {
  return `<!DOCTYPE html><html><head><title>HelioScout · Not Found</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;text-align:center;padding:80px 20px;">
  <div style="max-width:480px;margin:0 auto;">
    <div style="font-size:14px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#f59e0b;margin-bottom:24px;">HelioScout</div>
    <h1 style="font-weight:800;font-size:28px;letter-spacing:-0.02em;margin:0 0 12px;">Not found</h1>
    <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0;">${escapeHtml(message || 'The page you are looking for does not exist.')}</p>
  </div>
</body></html>`;
}

module.exports = { buildSolarRouter, startAuctionWorker, closeAuction, SOLAR_SCORE_SQL };
