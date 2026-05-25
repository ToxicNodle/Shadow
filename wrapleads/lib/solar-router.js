/**
 * Commercial Solar Scout — Express router.
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
            subject: `🌞 ${leadCount} new commercial solar lead${leadCount > 1 ? 's' : ''} assigned`,
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
            subject: `🌞 Auction open: ${lead.company} — ${econ.system_kw}kW commercial solar opportunity`,
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
    try {
      const r = await pool.query(`SELECT * FROM solar_auctions WHERE public_token = $1`, [req.params.token]);
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
    try {
      const r = await pool.query(
        `SELECT * FROM unsubscribe_tokens WHERE token = $1`,
        [req.params.token]
      );
      if (!r.rows.length) return res.status(404).send('Invalid unsubscribe link.');
      const t = r.rows[0];
      if (!t.used_at) {
        await compliance.flipOptOut(pool, { leadId: t.lead_id, userId: t.user_id, reason: 'one_click' });
        await pool.query(`UPDATE unsubscribe_tokens SET used_at = NOW() WHERE token = $1`, [req.params.token]);
      }
      res.setHeader('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html><html><head><title>Unsubscribed</title></head><body style="font-family:-apple-system,sans-serif;text-align:center;padding:80px 20px;background:#f8fafc;">
        <h1 style="font-weight:700;color:#0f172a;">You're unsubscribed</h1>
        <p style="color:#64748b;">You will not receive any further outreach from this sender.</p>
        </body></html>`);
    } catch (e) {
      res.status(500).send('Error processing unsubscribe.');
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
      subject: `🎉 You won the auction for ${auction.snapshot?.company}`,
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
        subject: `Auction closed: ${auction.snapshot?.company} — better luck next time`,
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

module.exports = { buildSolarRouter, startAuctionWorker, closeAuction, SOLAR_SCORE_SQL };
