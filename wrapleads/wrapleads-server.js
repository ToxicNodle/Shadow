/**
 * WrapLeads — Local Backend Server  (v0.3)
 * -----------------------------------------
 * GET  /test                      health check
 * POST /apollo/search             find people at a company
 * POST /apollo/enrich             reveal a specific person's email
 * GET  /carriers/stats            database stats (total carriers, sources, etc.)
 * POST /carriers/search           filtered carrier search with wrap score
 * POST /carriers/import           mark a carrier as imported
 * GET  /carriers/imported         list imported company IDs for the user
 * GET  /searches/saved            list saved searches
 * POST /searches/saved            create a saved search
 * DELETE /searches/saved/:id      delete a saved search
 * POST /searches/saved/:id/run    refresh new_count for a saved search
 * GET  /leads                     list all server-side leads for user
 * POST /leads                     upsert a lead by client_id
 * PUT  /leads/:id                 update a single lead field
 * DELETE /leads/:id               delete a lead
 * POST /leads/sync                bulk upsert (for localStorage migration)
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const PORT = parseInt(process.env.PORT || '3001', 10);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';
const APOLLO_BASE = 'https://api.apollo.io/v1';
const ENV_APOLLO_KEY = process.env.APOLLO_API_KEY || null;

// ----------------------------------------------------------------------------
// Postgres
// ----------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('Postgres pool error:', err.message));

async function checkDb() {
  try {
    const r = await pool.query('SELECT NOW() AS now, COUNT(*)::INT AS carriers FROM companies WHERE source = $1', ['fmcsa']);
    return { ok: true, time: r.rows[0].now, carriers: r.rows[0].carriers };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ----------------------------------------------------------------------------
// Express
// ----------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '4mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ----------------------------------------------------------------------------
// Static frontend
// ----------------------------------------------------------------------------
app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  index: 'wrapleads-crm.html',
}));

// ----------------------------------------------------------------------------
// Health
// ----------------------------------------------------------------------------
app.get(['/test', '/apollo/test', '/health'], async (req, res) => {
  const db = await checkDb();
  res.json({ status: 'ok', server: 'wrapleads-server', version: '0.3', database: db, apollo: { env_key: !!ENV_APOLLO_KEY } });
});

// ----------------------------------------------------------------------------
// Apollo proxy
// ----------------------------------------------------------------------------
async function callApollo(apiPath, body, apiKey) {
  const r = await fetch(APOLLO_BASE + apiPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': apiKey },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await r.json(); } catch { data = { error: 'Apollo returned non-JSON' }; }
  return { status: r.status, data };
}

function resolveApolloKey(req) {
  return (req.body && req.body.apiKey) ? String(req.body.apiKey).trim() : ENV_APOLLO_KEY;
}

app.post('/apollo/search', async (req, res) => {
  const apiKey = resolveApolloKey(req);
  if (!apiKey) return res.status(400).json({ error: 'No Apollo API key. Set in CRM Settings or APOLLO_API_KEY env var.' });

  const { company, domain, titles, limit } = req.body || {};
  if (!company) return res.status(400).json({ error: 'Missing required field: company' });

  const payload = {
    q_organization_name: company,
    person_titles: Array.isArray(titles) && titles.length ? titles : ['owner', 'ceo', 'president', 'marketing director', 'fleet manager'],
    page: 1,
    per_page: Math.min(parseInt(limit) || 5, 25),
  };
  if (domain) payload.q_organization_domains = domain;

  try {
    const { status, data } = await callApollo('/mixed_people/search', payload, apiKey);
    console.log(`[apollo/search] "${company}" -> ${data.people ? data.people.length : 0} results`);
    res.status(status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/apollo/enrich', async (req, res) => {
  const apiKey = resolveApolloKey(req);
  if (!apiKey) return res.status(400).json({ error: 'No Apollo API key.' });

  const { firstName, lastName, company, domain, email, linkedinUrl } = req.body || {};
  if (!firstName && !lastName && !email) return res.status(400).json({ error: 'Need firstName + lastName, or email' });

  const payload = { reveal_personal_emails: true };
  if (firstName) payload.first_name = firstName;
  if (lastName) payload.last_name = lastName;
  if (company) payload.organization_name = company;
  if (domain) payload.domain = domain;
  if (email) payload.email = email;
  if (linkedinUrl) payload.linkedin_url = linkedinUrl;

  try {
    const { status, data } = await callApollo('/people/match', payload, apiKey);
    console.log(`[apollo/enrich] ${firstName} ${lastName} @ ${company} -> ${data.person ? 'matched' : 'no match'}`);
    res.status(status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// Carriers — stats
// ----------------------------------------------------------------------------
app.get('/carriers/stats', async (req, res) => {
  try {
    const [totals, sources] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::INT                                             AS total,
          COUNT(DISTINCT state)::INT                                AS states,
          COUNT(*) FILTER (WHERE fleet_size IS NOT NULL)::INT       AS with_fleet_size,
          COALESCE(SUM(fleet_size), 0)::BIGINT                      AS total_units,
          COALESCE(AVG(fleet_size) FILTER (WHERE fleet_size > 0), 0)::INT AS avg_fleet,
          COUNT(*) FILTER (WHERE fleet_size BETWEEN 25 AND 500)::INT AS sweet_spot,
          MAX(ingested_at)                                           AS last_ingested
        FROM companies
      `),
      pool.query(`
        SELECT source, COUNT(*)::INT AS count
        FROM companies
        GROUP BY source
        ORDER BY count DESC
      `),
    ]);
    res.json({ ...totals.rows[0], sources: sources.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// Carriers — search (with wrap score + source filter)
// ----------------------------------------------------------------------------
app.post('/carriers/search', async (req, res) => {
  const {
    states = null,
    minFleet = null,
    maxFleet = null,
    query = '',
    sources = null,       // array of source strings: ['fmcsa','sos_in','google_places']
    limit = 50,
    offset = 0,
    onlyWithPhone = false,
    sort = 'wrap_score',  // default: hottest leads first
  } = req.body || {};

  const conditions = [];
  const params = [];

  if (Array.isArray(sources) && sources.length) {
    params.push(sources);
    conditions.push(`source = ANY($${params.length})`);
  }
  if (Array.isArray(states) && states.length) {
    params.push(states.map(s => String(s).toUpperCase()));
    conditions.push(`state = ANY($${params.length})`);
  }
  if (minFleet !== null && minFleet !== '' && !isNaN(minFleet)) {
    params.push(parseInt(minFleet));
    conditions.push(`fleet_size >= $${params.length}`);
  }
  if (maxFleet !== null && maxFleet !== '' && !isNaN(maxFleet)) {
    params.push(parseInt(maxFleet));
    conditions.push(`fleet_size <= $${params.length}`);
  }
  if (onlyWithPhone) {
    conditions.push(`phone IS NOT NULL AND phone != ''`);
  }
  if (query && query.trim()) {
    params.push(`%${query.trim()}%`);
    conditions.push(`(name ILIKE $${params.length} OR dba_name ILIKE $${params.length} OR city ILIKE $${params.length})`);
  }

  const where = conditions.length ? conditions.join(' AND ') : 'TRUE';

  // Wrap-cycle score: fleet_size bucket (0–40) + filing staleness (0–30) = max 70.
  // Higher score = more likely to have vehicles due for a refresh wrap.
  const wrapScoreExpr = `(
    CASE
      WHEN fleet_size BETWEEN 25 AND 500 THEN 40
      WHEN fleet_size > 500              THEN 20
      WHEN fleet_size BETWEEN 10 AND 24  THEN 15
      WHEN fleet_size BETWEEN 1 AND 9    THEN 5
      ELSE 0
    END
    +
    CASE
      WHEN last_reported IS NULL                          THEN 0
      WHEN last_reported < NOW() - INTERVAL '5 years'    THEN 30
      WHEN last_reported < NOW() - INTERVAL '3 years'    THEN 20
      WHEN last_reported < NOW() - INTERVAL '1 year'     THEN 10
      ELSE 5
    END
  )`;

  const orderBy = {
    wrap_score: `${wrapScoreExpr} DESC, fleet_size DESC NULLS LAST, name ASC`,
    fleet_desc: 'fleet_size DESC NULLS LAST, name ASC',
    fleet_asc:  'fleet_size ASC NULLS LAST, name ASC',
    name:       'name ASC',
    recent:     'last_reported DESC NULLS LAST, name ASC',
  }[sort] || `${wrapScoreExpr} DESC, fleet_size DESC NULLS LAST, name ASC`;

  const safeLimit  = Math.min(parseInt(limit) || 50, 200);
  const safeOffset = Math.max(parseInt(offset) || 0, 0);

  const dataParams = [...params, safeLimit, safeOffset];
  const dataSql = `
    SELECT id, source, source_id AS dot_number, name, dba_name, street, city, state, zip,
           phone, email, fleet_size, drivers, last_reported,
           ${wrapScoreExpr} AS wrap_score,
           CASE WHEN last_reported IS NOT NULL
                THEN EXTRACT(YEAR FROM NOW())::INT - EXTRACT(YEAR FROM last_reported)::INT
                ELSE NULL END AS years_since_report
    FROM companies
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
  `;
  const countSql = `SELECT COUNT(*)::INT AS total FROM companies WHERE ${where}`;

  try {
    const [rows, count] = await Promise.all([
      pool.query(dataSql, dataParams),
      pool.query(countSql, params),
    ]);

    const ids = rows.rows.map(r => r.id);
    let importedSet = new Set();
    if (ids.length) {
      const importedRes = await pool.query(
        `SELECT company_id FROM imports WHERE company_id = ANY($1) AND user_id = 'local'`,
        [ids]
      );
      importedSet = new Set(importedRes.rows.map(r => r.company_id));
    }

    res.json({
      total: count.rows[0].total,
      results: rows.rows.map(r => ({ ...r, already_imported: importedSet.has(r.id) })),
      limit: safeLimit,
      offset: safeOffset,
    });
  } catch (e) {
    console.error('[carriers/search] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/carriers/import', async (req, res) => {
  const { companyId } = req.body || {};
  if (!companyId) return res.status(400).json({ error: 'Missing companyId' });
  try {
    await pool.query(
      `INSERT INTO imports (company_id, user_id) VALUES ($1, 'local')
       ON CONFLICT (company_id, user_id) DO NOTHING`,
      [companyId]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/carriers/imported', async (req, res) => {
  try {
    const r = await pool.query(`SELECT company_id FROM imports WHERE user_id = 'local'`);
    res.json({ imported: r.rows.map(row => row.company_id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// Saved searches
// ----------------------------------------------------------------------------
app.get('/searches/saved', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, filters, last_checked, new_count, created_at
       FROM saved_searches WHERE user_id = 'local' ORDER BY created_at DESC`
    );
    res.json({ searches: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/searches/saved', async (req, res) => {
  const { name, filters } = req.body || {};
  if (!name || !filters) return res.status(400).json({ error: 'name and filters are required' });
  try {
    const r = await pool.query(
      `INSERT INTO saved_searches (user_id, name, filters)
       VALUES ('local', $1, $2) RETURNING *`,
      [String(name).slice(0, 120), JSON.stringify(filters)]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/searches/saved/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    await pool.query(`DELETE FROM saved_searches WHERE id = $1 AND user_id = 'local'`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Refresh new_count: carriers added since last_checked that match this search's filters
app.post('/searches/saved/:id/run', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const s = await pool.query(
      `SELECT filters, last_checked FROM saved_searches WHERE id = $1 AND user_id = 'local'`,
      [id]
    );
    if (!s.rows.length) return res.status(404).json({ error: 'Not found' });
    const { filters, last_checked } = s.rows[0];

    const conditions = [];
    const params = [];

    if (Array.isArray(filters.sources) && filters.sources.length) {
      params.push(filters.sources); conditions.push(`source = ANY($${params.length})`);
    }
    if (Array.isArray(filters.states) && filters.states.length) {
      params.push(filters.states.map(s => String(s).toUpperCase()));
      conditions.push(`state = ANY($${params.length})`);
    }
    if (filters.minFleet != null && !isNaN(filters.minFleet)) {
      params.push(parseInt(filters.minFleet)); conditions.push(`fleet_size >= $${params.length}`);
    }
    if (filters.maxFleet != null && !isNaN(filters.maxFleet)) {
      params.push(parseInt(filters.maxFleet)); conditions.push(`fleet_size <= $${params.length}`);
    }
    if (filters.query && String(filters.query).trim()) {
      params.push(`%${String(filters.query).trim()}%`);
      conditions.push(`(name ILIKE $${params.length} OR dba_name ILIKE $${params.length} OR city ILIKE $${params.length})`);
    }
    if (last_checked) {
      params.push(last_checked); conditions.push(`ingested_at > $${params.length}`);
    }

    const where = conditions.length ? conditions.join(' AND ') : 'TRUE';
    const countRes = await pool.query(
      `SELECT COUNT(*)::INT AS new_count FROM companies WHERE ${where}`, params
    );
    const newCount = countRes.rows[0].new_count;

    await pool.query(
      `UPDATE saved_searches SET last_checked = NOW(), new_count = $1 WHERE id = $2`,
      [newCount, id]
    );
    res.json({ new_count: newCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// Server-side leads (SaaS mode)
// ----------------------------------------------------------------------------
function leadRow(row) {
  return {
    id:              row.id,
    clientId:        row.client_id,
    company:         row.company,
    category:        row.category,
    state:           row.state,
    city:            row.city,
    address:         row.address,
    contactName:     row.contact_name,
    contactTitle:    row.contact_title,
    email:           row.email,
    phone:           row.phone,
    website:         row.website,
    fleetSize:       row.fleet_size,
    pitchAngle:      row.pitch_angle,
    status:          row.status,
    notes:           row.notes,
    lastContacted:   row.last_contacted ? row.last_contacted.toISOString().slice(0, 10) : '',
    sourceCompanyId: row.source_company_id,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}

app.get('/leads', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM leads WHERE user_id = 'local' ORDER BY updated_at DESC`
    );
    res.json({ leads: r.rows.map(leadRow) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /leads — upsert by client_id
app.post('/leads', async (req, res) => {
  const d = req.body || {};
  if (!d.company) return res.status(400).json({ error: 'company is required' });
  const clientId = d.clientId || d.id || null;
  try {
    const r = await pool.query(`
      INSERT INTO leads
        (user_id, client_id, company, category, state, city, address,
         contact_name, contact_title, email, phone, website, fleet_size,
         pitch_angle, status, notes, last_contacted, source_company_id,
         created_at, updated_at)
      VALUES ('local', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
              $13, $14, $15, $16, $17,
              COALESCE($18::timestamptz, NOW()), COALESCE($19::timestamptz, NOW()))
      ON CONFLICT (user_id, client_id) DO UPDATE SET
        company       = EXCLUDED.company,
        category      = EXCLUDED.category,
        state         = EXCLUDED.state,
        city          = EXCLUDED.city,
        address       = EXCLUDED.address,
        contact_name  = EXCLUDED.contact_name,
        contact_title = EXCLUDED.contact_title,
        email         = EXCLUDED.email,
        phone         = EXCLUDED.phone,
        website       = EXCLUDED.website,
        fleet_size    = EXCLUDED.fleet_size,
        pitch_angle   = EXCLUDED.pitch_angle,
        status        = EXCLUDED.status,
        notes         = EXCLUDED.notes,
        last_contacted   = EXCLUDED.last_contacted,
        source_company_id = EXCLUDED.source_company_id,
        updated_at    = NOW()
      RETURNING *
    `, [
      clientId, d.company, d.category || 'fleet',
      d.state || null, d.city || null, d.address || null,
      d.contactName || null, d.contactTitle || null,
      d.email || null, d.phone || null, d.website || null,
      d.fleetSize || null, d.pitchAngle || null,
      d.status || 'cold', d.notes || null, d.lastContacted || null,
      d.sourceCompanyId || null,
      d.createdAt || null, d.updatedAt || null,
    ]);
    res.status(201).json(leadRow(r.rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/leads/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const d = req.body || {};

  const colMap = {
    company: 'company', category: 'category', state: 'state', city: 'city',
    address: 'address', contactName: 'contact_name', contactTitle: 'contact_title',
    email: 'email', phone: 'phone', website: 'website', fleetSize: 'fleet_size',
    pitchAngle: 'pitch_angle', status: 'status', notes: 'notes',
    lastContacted: 'last_contacted',
  };

  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(colMap)) {
    if (d[key] !== undefined) {
      params.push(d[key] || null);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

  params.push(id);
  try {
    const r = await pool.query(
      `UPDATE leads SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} AND user_id = 'local' RETURNING *`,
      params
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(leadRow(r.rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/leads/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    await pool.query(`DELETE FROM leads WHERE id = $1 AND user_id = 'local'`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk upsert — used by the localStorage → Postgres migration flow
app.post('/leads/sync', async (req, res) => {
  const { leads: incoming } = req.body || {};
  if (!Array.isArray(incoming)) return res.status(400).json({ error: 'leads must be an array' });

  let inserted = 0;
  let failed = 0;
  for (const d of incoming) {
    if (!d.company) { failed++; continue; }
    const clientId = d.clientId || d.id || null;
    try {
      await pool.query(`
        INSERT INTO leads
          (user_id, client_id, company, category, state, city, address,
           contact_name, contact_title, email, phone, website, fleet_size,
           pitch_angle, status, notes, last_contacted, source_company_id,
           created_at, updated_at)
        VALUES ('local', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                $13, $14, $15, $16, $17,
                COALESCE($18::timestamptz, NOW()), COALESCE($19::timestamptz, NOW()))
        ON CONFLICT (user_id, client_id) DO UPDATE SET
          status        = EXCLUDED.status,
          notes         = EXCLUDED.notes,
          contact_name  = EXCLUDED.contact_name,
          contact_title = EXCLUDED.contact_title,
          email         = EXCLUDED.email,
          phone         = EXCLUDED.phone,
          updated_at    = GREATEST(leads.updated_at, EXCLUDED.updated_at)
      `, [
        clientId, d.company, d.category || 'fleet',
        d.state || null, d.city || null, d.address || null,
        d.contactName || null, d.contactTitle || null,
        d.email || null, d.phone || null, d.website || null,
        d.fleetSize || null, d.pitchAngle || null,
        d.status || 'cold', d.notes || null, d.lastContacted || null,
        d.sourceCompanyId || null,
        d.createdAt || null, d.updatedAt || null,
      ]);
      inserted++;
    } catch {
      failed++;
    }
  }
  res.json({ ok: true, inserted, failed });
});

// ----------------------------------------------------------------------------
// Boot
// ----------------------------------------------------------------------------
const banner = `
╔═══════════════════════════════════════════════════╗
║   WrapLeads.io — Local Server  (v0.3)             ║
║   http://localhost:${String(PORT).padEnd(5)}                          ║
╚═══════════════════════════════════════════════════╝`;

app.listen(PORT, async () => {
  console.log(banner);
  const db = await checkDb();
  console.log(db.ok
    ? `· Postgres connected. ${db.carriers.toLocaleString()} FMCSA carriers loaded.`
    : `· Postgres NOT connected: ${db.error}\n  Did you run "docker compose up -d"?`);
  console.log(ENV_APOLLO_KEY ? '· Apollo API key: loaded from env' : '· Apollo API key: per-request (set in CRM Settings)');
  console.log(`· Open http://localhost:${PORT} in your browser.\n`);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await pool.end();
  process.exit(0);
});
