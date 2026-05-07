/**
 * WrapLeads — Backend Server  (v0.4 — SaaS / $500 mo)
 * -----------------------------------------------------
 * Auth
 *   POST /auth/register          create account (starts 14-day trial)
 *   POST /auth/login             returns JWT
 *   GET  /auth/me                token introspection
 *
 * Stripe billing
 *   POST /stripe/checkout        create Stripe Checkout session
 *   POST /stripe/webhook         handle Stripe events (raw body)
 *   POST /stripe/portal          create Customer Portal session
 *
 * All routes below require Authorization: Bearer <jwt>
 * Subscription-gated routes also require sub_status in ('trialing','active','past_due')
 *
 * Carriers
 *   GET  /test | /health         health check
 *   POST /apollo/search          find people at a company
 *   POST /apollo/enrich          reveal a specific person's email
 *   GET  /carriers/stats
 *   POST /carriers/search        with wrap score + source filter
 *   POST /carriers/import
 *   GET  /carriers/imported
 *
 * Saved searches
 *   GET    /searches/saved
 *   POST   /searches/saved
 *   DELETE /searches/saved/:id
 *   POST   /searches/saved/:id/run
 *
 * Server-side leads
 *   GET    /leads
 *   POST   /leads
 *   PUT    /leads/:id
 *   DELETE /leads/:id
 *   POST   /leads/sync           bulk upsert (localStorage → Postgres migration)
 */

require('dotenv').config();
const express  = require('express');
const path     = require('path');
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const Stripe   = require('stripe');
const crypto   = require('crypto');
const email    = require('./lib/email');
const rateLimit = require('express-rate-limit');

const PORT              = parseInt(process.env.PORT || '3001', 10);
const DATABASE_URL      = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';
const APOLLO_BASE       = 'https://api.apollo.io/v1';
const ENV_APOLLO_KEY    = process.env.APOLLO_API_KEY || null;
const JWT_SECRET        = process.env.JWT_SECRET || 'change-me-in-production';
const TRIAL_DAYS        = parseInt(process.env.TRIAL_DAYS || '14', 10);
const APP_URL           = process.env.APP_URL || `http://localhost:${PORT}`;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PRICE_ID   = process.env.STRIPE_PRICE_ID || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_DISABLED   = process.env.STRIPE_DISABLED === 'true';

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }) : null;

// ----------------------------------------------------------------------------
// Postgres
// ----------------------------------------------------------------------------
const pool = new Pool({ connectionString: DATABASE_URL, max: 10, idleTimeoutMillis: 30000 });
pool.on('error', (err) => console.error('Postgres pool error:', err.message));

async function checkDb() {
  try {
    const r = await pool.query('SELECT NOW() AS now, COUNT(*)::INT AS carriers FROM companies');
    return { ok: true, time: r.rows[0].now, carriers: r.rows[0].carriers };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function migrateDb() {
  // Idempotent schema additions — safe to run on every startup
  try {
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
        ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ
    `);
  } catch (e) {
    console.warn('[migrate] Could not add password reset columns:', e.message);
  }
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies (industry)`);
  } catch (e) {
    console.warn('[migrate] Could not add industry index:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS settings_json JSONB DEFAULT '{}'::jsonb`);
  } catch (e) {
    console.warn('[migrate] Could not add settings_json column:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_due_at DATE`);
  } catch (e) {
    console.warn('[migrate] Could not add followup_due_at column:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_activities (
        id         BIGSERIAL PRIMARY KEY,
        lead_id    BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL,
        type       TEXT NOT NULL,
        subject    TEXT,
        body       TEXT,
        metadata   JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activities_lead ON lead_activities(lead_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activities_user ON lead_activities(user_id, created_at DESC)`);
  } catch (e) {
    console.warn('[migrate] Could not create lead_activities table:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_queue (
        id           BIGSERIAL PRIMARY KEY,
        user_id      TEXT NOT NULL,
        lead_id      BIGINT REFERENCES leads(id) ON DELETE CASCADE,
        sequence_day INT NOT NULL DEFAULT 1,
        subject      TEXT NOT NULL,
        body         TEXT NOT NULL,
        to_email     TEXT NOT NULL,
        to_name      TEXT,
        send_at      TIMESTAMPTZ NOT NULL,
        sent_at      TIMESTAMPTZ,
        status       TEXT NOT NULL DEFAULT 'pending',
        resend_id    TEXT,
        error_msg    TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_eq_pending ON email_queue(send_at) WHERE status = 'pending'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_eq_lead ON email_queue(lead_id, user_id)`);
  } catch (e) {
    console.warn('[migrate] Could not create email_queue table:', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bids (
        id              BIGSERIAL PRIMARY KEY,
        user_id         TEXT NOT NULL,
        lead_id         BIGINT REFERENCES leads(id) ON DELETE SET NULL,
        project_name    TEXT NOT NULL,
        gc_name         TEXT,
        architect       TEXT,
        project_type    TEXT NOT NULL DEFAULT 'general',
        bid_due         DATE,
        estimated_value INTEGER,
        source_platform TEXT,
        source_url      TEXT,
        status          TEXT NOT NULL DEFAULT 'tracking',
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bids_user ON bids(user_id, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bids_due ON bids(bid_due) WHERE status NOT IN ('won','lost','no_bid')`);
  } catch (e) {
    console.warn('[migrate] Could not create bids table:', e.message);
  }
}

// ----------------------------------------------------------------------------
// Express
// ----------------------------------------------------------------------------
const app = express();

// Stripe webhooks need the raw body — must be before express.json()
app.use('/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '4mb' }));

// Rate limiting
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const apiLimiter  = rateLimit({ windowMs: 60 * 1000,       max: 120, standardHeaders: true, legacyHeaders: false });
app.use('/auth', authLimiter);
app.use('/api',  apiLimiter);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Static serving is handled AFTER all API routes (see bottom of file)

// ----------------------------------------------------------------------------
// Auth middleware
// ----------------------------------------------------------------------------
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Subscription check — requires active or trialing subscription
async function subMiddleware(req, res, next) {
  if (STRIPE_DISABLED) return next();
  try {
    const r = await pool.query(
      `SELECT sub_status, trial_ends_at, sub_period_end FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!r.rows.length) return res.status(401).json({ error: 'User not found' });
    const { sub_status, trial_ends_at } = r.rows[0];

    // Trial: active if trial_ends_at is in the future and no sub yet
    if (sub_status === 'inactive' && trial_ends_at && new Date(trial_ends_at) > new Date()) {
      req.user.subStatus = 'trialing';
      return next();
    }
    if (['trialing', 'active', 'past_due'].includes(sub_status)) {
      req.user.subStatus = sub_status;
      return next();
    }
    return res.status(402).json({
      error: 'Subscription required',
      sub_status,
      checkout_url: `${APP_URL}/login`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ----------------------------------------------------------------------------
// Health
// ----------------------------------------------------------------------------
app.get(['/test', '/apollo/test', '/health'], async (req, res) => {
  const db = await checkDb();
  res.json({ status: 'ok', server: 'wrapleads-server', version: '0.4', database: db });
});

// ----------------------------------------------------------------------------
// AUTH — register / login / me
// ----------------------------------------------------------------------------
app.post('/auth/register', async (req, res) => {
  const { email: userEmail, password, name, company } = req.body || {};
  if (!userEmail || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const normalizedEmail = String(userEmail).trim().toLowerCase();

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length) return res.status(409).json({ error: 'An account with that email already exists' });

    const hash = await bcrypt.hash(password, 12);
    const trialEnd = new Date(Date.now() + TRIAL_DAYS * 86400_000);

    const r = await pool.query(
      `INSERT INTO users (email, password_hash, name, company_name, sub_status, trial_ends_at)
       VALUES ($1, $2, $3, $4, 'inactive', $5)
       RETURNING id, email, name, company_name, sub_status, trial_ends_at`,
      [normalizedEmail, hash, (name || '').trim() || null, (company || '').trim() || null, trialEnd]
    );
    const user = r.rows[0];

    // Create a Stripe customer immediately so checkout is ready when they want to subscribe
    if (stripe) {
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name || undefined,
          metadata: { user_id: String(user.id) },
        });
        await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customer.id, user.id]);
        user.stripe_customer_id = customer.id;
      } catch (e) {
        console.warn('[stripe] Could not create customer during registration:', e.message);
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log(`[auth/register] ${user.email} — trial until ${trialEnd.toISOString().slice(0,10)}`);

    // Send welcome email (non-blocking)
    email.sendWelcome({ to: user.email, name: user.name, trialEndsAt: trialEnd }).catch(() => {});

    res.status(201).json({ token, user: safeUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (!r.rows.length) return res.status(401).json({ error: 'Invalid email or password' });
    const user = r.rows[0];

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    console.log(`[auth/login] ${user.email}`);
    res.json({ token, user: safeUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/auth/forgot-password', async (req, res) => {
  const { email: rawEmail } = req.body || {};
  if (!rawEmail) return res.status(400).json({ error: 'Email required' });

  const normalizedEmail = String(rawEmail).trim().toLowerCase();
  try {
    const r = await pool.query('SELECT id, name FROM users WHERE email = $1', [normalizedEmail]);
    // Always return 200 to avoid leaking account existence
    if (!r.rows.length) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3`,
      [token, expires, r.rows[0].id]
    );

    const resetUrl = `${APP_URL}/?reset=${token}`;
    await email.sendPasswordReset({ to: normalizedEmail, name: r.rows[0].name, resetUrl });

    console.log(`[auth/forgot-password] Reset token sent to ${normalizedEmail}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/auth/reset-password', async (req, res) => {
  const { token, password: newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const r = await pool.query(
      `SELECT id, email FROM users
       WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
      [token]
    );
    if (!r.rows.length) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL
       WHERE id = $2`,
      [hash, r.rows[0].id]
    );

    console.log(`[auth/reset-password] Password reset for ${r.rows[0].email}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, email, name, company_name, sub_status, trial_ends_at, sub_period_end, stripe_customer_id
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = r.rows[0];
    // Resolve effective subscription status
    if (STRIPE_DISABLED) {
      user.sub_status = 'active';
    } else if (user.sub_status === 'inactive' && user.trial_ends_at && new Date(user.trial_ends_at) > new Date()) {
      user.sub_status = 'trialing';
    }
    // First login detection — true when user has no leads yet
    const leadCount = await pool.query('SELECT COUNT(*) FROM leads WHERE user_id = $1', [String(req.user.id)]);
    user.is_first_login = parseInt(leadCount.rows[0].count, 10) === 0;

    res.json({ user: safeUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function safeUser(u) {
  return {
    id:           u.id,
    email:        u.email,
    name:         u.name,
    companyName:  u.company_name,
    subStatus:    u.sub_status,
    trialEndsAt:  u.trial_ends_at,
    subPeriodEnd: u.sub_period_end,
    isFirstLogin: u.is_first_login ?? false,
  };
}

// ----------------------------------------------------------------------------
// STRIPE — checkout / webhook / portal
// ----------------------------------------------------------------------------
app.post('/stripe/checkout', authMiddleware, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured (set STRIPE_SECRET_KEY)' });
  if (!STRIPE_PRICE_ID) return res.status(503).json({ error: 'STRIPE_PRICE_ID is not set' });

  try {
    const userRes = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.id]);
    const customerId = userRes.rows[0]?.stripe_customer_id;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId || undefined,
      customer_email: customerId ? undefined : req.user.email,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${APP_URL}/?subscribed=1`,
      cancel_url: `${APP_URL}/login`,
      metadata: { user_id: String(req.user.id) },
      subscription_data: {
        metadata: { user_id: String(req.user.id) },
      },
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/stripe/portal', authMiddleware, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const r = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.id]);
    const customerId = r.rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No billing account found. Subscribe first.' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: APP_URL,
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Raw body required — registered above before express.json()
app.post('/stripe/webhook', async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    console.warn('[stripe/webhook] Stripe not fully configured — ignoring event');
    return res.json({ received: true });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('[stripe/webhook] Signature verification failed:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  const sub = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = sub.metadata?.user_id;
      if (userId && sub.customer) {
        await pool.query(
          `UPDATE users SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2`,
          [sub.customer, userId]
        );
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const userId = sub.metadata?.user_id || await userIdFromCustomer(sub.customer);
      if (userId) {
        await pool.query(
          `UPDATE users SET
            stripe_sub_id = $1,
            sub_status = $2,
            sub_period_end = to_timestamp($3),
            updated_at = NOW()
          WHERE id = $4`,
          [sub.id, sub.status, sub.current_period_end, userId]
        );
        console.log(`[stripe/webhook] ${event.type}: user ${userId} → ${sub.status}`);
        if (event.type === 'customer.subscription.created' && sub.status === 'active') {
          const ur = await pool.query('SELECT email, name FROM users WHERE id = $1', [userId]);
          if (ur.rows[0]) {
            email.sendSubscriptionActivated({ to: ur.rows[0].email, name: ur.rows[0].name }).catch(() => {});
          }
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const userId = sub.metadata?.user_id || await userIdFromCustomer(sub.customer);
      if (userId) {
        await pool.query(
          `UPDATE users SET sub_status = 'canceled', updated_at = NOW() WHERE id = $1`,
          [userId]
        );
        console.log(`[stripe/webhook] subscription canceled: user ${userId}`);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const customerId = sub.customer;
      await pool.query(
        `UPDATE users SET sub_status = 'past_due', updated_at = NOW()
         WHERE stripe_customer_id = $1`,
        [customerId]
      );
      const ur = await pool.query('SELECT email, name FROM users WHERE stripe_customer_id = $1', [customerId]);
      if (ur.rows[0]) {
        email.sendPaymentFailed({ to: ur.rows[0].email, name: ur.rows[0].name }).catch(() => {});
      }
      break;
    }
  }

  res.json({ received: true });
});

async function userIdFromCustomer(customerId) {
  if (!customerId) return null;
  try {
    const r = await pool.query('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);
    return r.rows[0]?.id || null;
  } catch { return null; }
}

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

app.post('/apollo/search', authMiddleware, subMiddleware, async (req, res) => {
  const apiKey = resolveApolloKey(req);
  if (!apiKey) return res.status(400).json({ error: 'No Apollo API key.' });
  const { company, domain, titles, limit } = req.body || {};
  if (!company) return res.status(400).json({ error: 'Missing field: company' });
  const payload = {
    q_organization_name: company,
    person_titles: Array.isArray(titles) && titles.length ? titles : ['owner','ceo','president','marketing director','fleet manager'],
    page: 1,
    per_page: Math.min(parseInt(limit) || 5, 25),
  };
  if (domain) payload.q_organization_domains = domain;
  try {
    const { status, data } = await callApollo('/mixed_people/search', payload, apiKey);
    res.status(status).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/apollo/enrich', authMiddleware, subMiddleware, async (req, res) => {
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
    res.status(status).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----------------------------------------------------------------------------
// Carriers
// ----------------------------------------------------------------------------
app.get('/carriers/stats', authMiddleware, subMiddleware, async (req, res) => {
  try {
    const [totals, sources] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::INT AS total,
          COUNT(DISTINCT state)::INT AS states,
          COUNT(*) FILTER (WHERE fleet_size IS NOT NULL)::INT AS with_fleet_size,
          COALESCE(SUM(fleet_size),0)::BIGINT AS total_units,
          COALESCE(AVG(fleet_size) FILTER (WHERE fleet_size > 0),0)::INT AS avg_fleet,
          COUNT(*) FILTER (WHERE fleet_size BETWEEN 25 AND 500)::INT AS sweet_spot,
          MAX(ingested_at) AS last_ingested
        FROM companies
      `),
      pool.query(`SELECT source, COUNT(*)::INT AS count FROM companies GROUP BY source ORDER BY count DESC`),
    ]);
    res.json({ ...totals.rows[0], sources: sources.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/carriers/search', authMiddleware, subMiddleware, async (req, res) => {
  const {
    states = null, minFleet = null, maxFleet = null, query = '',
    sources = null, industries = null, limit = 50, offset = 0, onlyWithPhone = false, sort = 'wrap_score',
  } = req.body || {};

  const conditions = [];
  const params = [];

  if (Array.isArray(sources) && sources.length) { params.push(sources); conditions.push(`source = ANY($${params.length})`); }
  if (Array.isArray(industries) && industries.length) { params.push(industries); conditions.push(`industry = ANY($${params.length})`); }
  if (Array.isArray(states) && states.length) { params.push(states.map(s => String(s).toUpperCase())); conditions.push(`state = ANY($${params.length})`); }
  if (minFleet !== null && minFleet !== '' && !isNaN(minFleet)) { params.push(parseInt(minFleet)); conditions.push(`fleet_size >= $${params.length}`); }
  if (maxFleet !== null && maxFleet !== '' && !isNaN(maxFleet)) { params.push(parseInt(maxFleet)); conditions.push(`fleet_size <= $${params.length}`); }
  if (onlyWithPhone) conditions.push(`phone IS NOT NULL AND phone != ''`);
  if (query && query.trim()) { params.push(`%${query.trim()}%`); conditions.push(`(name ILIKE $${params.length} OR dba_name ILIKE $${params.length} OR city ILIKE $${params.length})`); }

  const where = conditions.length ? conditions.join(' AND ') : 'TRUE';

  const wrapScoreExpr = `(
    CASE WHEN fleet_size BETWEEN 25 AND 500 THEN 40 WHEN fleet_size > 500 THEN 20
         WHEN fleet_size BETWEEN 10 AND 24 THEN 15 WHEN fleet_size BETWEEN 1 AND 9 THEN 5 ELSE 0 END
    + CASE WHEN last_reported IS NULL THEN 0
           WHEN last_reported < NOW() - INTERVAL '5 years' THEN 30
           WHEN last_reported < NOW() - INTERVAL '3 years' THEN 20
           WHEN last_reported < NOW() - INTERVAL '1 year' THEN 10 ELSE 5 END
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
  const uid        = String(req.user.id);

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

  try {
    const [rows, count] = await Promise.all([
      pool.query(dataSql, dataParams),
      pool.query(`SELECT COUNT(*)::INT AS total FROM companies WHERE ${where}`, params),
    ]);
    const ids = rows.rows.map(r => r.id);
    let importedSet = new Set();
    if (ids.length) {
      const ir = await pool.query(
        `SELECT company_id FROM imports WHERE company_id = ANY($1) AND user_id = $2`, [ids, uid]
      );
      importedSet = new Set(ir.rows.map(r => r.company_id));
    }
    res.json({
      total: count.rows[0].total,
      results: rows.rows.map(r => ({ ...r, already_imported: importedSet.has(r.id) })),
      limit: safeLimit, offset: safeOffset,
    });
  } catch (e) {
    console.error('[carriers/search]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/carriers/import', authMiddleware, subMiddleware, async (req, res) => {
  const { companyId } = req.body || {};
  if (!companyId) return res.status(400).json({ error: 'Missing companyId' });
  const uid = String(req.user.id);
  try {
    await pool.query(
      `INSERT INTO imports (company_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [companyId, uid]
    );
    // Also create a CRM lead from the carrier data so it appears in My Leads immediately
    const coR = await pool.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
    let leadId = null;
    if (coR.rows.length) {
      const c = coR.rows[0];
      const lr = await pool.query(`
        INSERT INTO leads
          (user_id, client_id, company, category, state, city, phone, email,
           website, fleet_size, status, source_company_id, created_at, updated_at)
        VALUES ($1, $2, $3, 'fleet', $4, $5, $6, $7, $8, $9, 'cold', $10, NOW(), NOW())
        ON CONFLICT (user_id, client_id) DO NOTHING
        RETURNING id
      `, [uid, `carrier-${companyId}`, c.name || c.dba_name, c.state, c.city,
          c.phone || null, c.email || null, c.website || null,
          c.fleet_size ? String(c.fleet_size) : null, companyId]);
      leadId = lr.rows[0]?.id ?? null;
    }
    res.json({ ok: true, leadId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/carriers/imported', authMiddleware, subMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`SELECT company_id FROM imports WHERE user_id = $1`, [String(req.user.id)]);
    res.json({ imported: r.rows.map(row => row.company_id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----------------------------------------------------------------------------
// Saved searches
// ----------------------------------------------------------------------------
app.get('/searches/saved', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, filters, last_checked, new_count, created_at
       FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC`,
      [String(req.user.id)]
    );
    res.json({ searches: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/searches/saved', authMiddleware, async (req, res) => {
  const { name, filters } = req.body || {};
  if (!name || !filters) return res.status(400).json({ error: 'name and filters required' });
  try {
    const r = await pool.query(
      `INSERT INTO saved_searches (user_id, name, filters) VALUES ($1, $2, $3) RETURNING *`,
      [String(req.user.id), String(name).slice(0, 120), JSON.stringify(filters)]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/searches/saved/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    await pool.query(`DELETE FROM saved_searches WHERE id = $1 AND user_id = $2`, [id, String(req.user.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/searches/saved/:id/run', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const s = await pool.query(
      `SELECT filters, last_checked FROM saved_searches WHERE id = $1 AND user_id = $2`,
      [id, String(req.user.id)]
    );
    if (!s.rows.length) return res.status(404).json({ error: 'Not found' });
    const { filters, last_checked } = s.rows[0];
    const conditions = [];
    const params = [];
    if (Array.isArray(filters.sources) && filters.sources.length) { params.push(filters.sources); conditions.push(`source = ANY($${params.length})`); }
    if (Array.isArray(filters.industries) && filters.industries.length) { params.push(filters.industries); conditions.push(`industry = ANY($${params.length})`); }
    if (Array.isArray(filters.states) && filters.states.length) { params.push(filters.states.map(s => String(s).toUpperCase())); conditions.push(`state = ANY($${params.length})`); }
    if (filters.minFleet != null) { params.push(parseInt(filters.minFleet)); conditions.push(`fleet_size >= $${params.length}`); }
    if (filters.maxFleet != null) { params.push(parseInt(filters.maxFleet)); conditions.push(`fleet_size <= $${params.length}`); }
    if (filters.query && String(filters.query).trim()) { params.push(`%${String(filters.query).trim()}%`); conditions.push(`(name ILIKE $${params.length} OR dba_name ILIKE $${params.length})`); }
    if (last_checked) { params.push(last_checked); conditions.push(`ingested_at > $${params.length}`); }
    const where = conditions.length ? conditions.join(' AND ') : 'TRUE';
    const countRes = await pool.query(`SELECT COUNT(*)::INT AS new_count FROM companies WHERE ${where}`, params);
    const newCount = countRes.rows[0].new_count;
    await pool.query(`UPDATE saved_searches SET last_checked = NOW(), new_count = $1 WHERE id = $2`, [newCount, id]);
    res.json({ new_count: newCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----------------------------------------------------------------------------
// Server-side leads
// ----------------------------------------------------------------------------
function leadRow(row) {
  return {
    id: String(row.client_id || row.id),
    serverId: row.id,
    clientId: row.client_id, company: row.company, category: row.category,
    state: row.state, city: row.city, address: row.address,
    contactName: row.contact_name, contactTitle: row.contact_title,
    email: row.email, phone: row.phone, website: row.website,
    fleetSize: row.fleet_size, pitchAngle: row.pitch_angle,
    status: row.status, notes: row.notes,
    lastContacted: row.last_contacted ? row.last_contacted.toISOString().slice(0, 10) : '',
    followupDueAt: row.followup_due_at ? row.followup_due_at.toISOString().slice(0, 10) : null,
    sourceCompanyId: row.source_company_id,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

// Days until follow-up is due per status (null = no auto follow-up)
const FOLLOWUP_DAYS = { contacted: 3, replied: 2, meeting: 5, proposal: 7 };

async function logActivity(pool, { leadId, userId, type, subject = null, body = null, metadata = {} }) {
  try {
    await pool.query(
      `INSERT INTO lead_activities (lead_id, user_id, type, subject, body, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [leadId, userId, type, subject, body, JSON.stringify(metadata)]
    );
  } catch { /* non-critical */ }
}

app.get('/leads', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM leads WHERE user_id = $1 ORDER BY updated_at DESC`, [String(req.user.id)]);
    res.json({ leads: r.rows.map(leadRow) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/leads', authMiddleware, async (req, res) => {
  const d = req.body || {};
  if (!d.company) return res.status(400).json({ error: 'company required' });
  const clientId = d.clientId || d.id || null;
  const uid = String(req.user.id);
  try {
    const r = await pool.query(`
      INSERT INTO leads
        (user_id, client_id, company, category, state, city, address,
         contact_name, contact_title, email, phone, website, fleet_size,
         pitch_angle, status, notes, last_contacted, source_company_id, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
              COALESCE($19::timestamptz,NOW()), COALESCE($20::timestamptz,NOW()))
      ON CONFLICT (user_id, client_id) DO UPDATE SET
        company=$3, category=$4, state=$5, city=$6, address=$7,
        contact_name=$8, contact_title=$9, email=$10, phone=$11, website=$12,
        fleet_size=$13, pitch_angle=$14, status=$15, notes=$16,
        last_contacted=$17, source_company_id=$18, updated_at=NOW()
      RETURNING *
    `, [uid, clientId, d.company, d.category||'fleet', d.state||null, d.city||null, d.address||null,
        d.contactName||null, d.contactTitle||null, d.email||null, d.phone||null, d.website||null,
        d.fleetSize||null, d.pitchAngle||null, d.status||'cold', d.notes||null,
        d.lastContacted||null, d.sourceCompanyId||null, d.createdAt||null, d.updatedAt||null]);
    res.status(201).json(leadRow(r.rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/leads/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const d = req.body || {};
  const uid = String(req.user.id);

  // Fetch current lead to detect status changes
  let prevStatus = null;
  try {
    const prev = await pool.query('SELECT status FROM leads WHERE id=$1 AND user_id=$2', [id, uid]);
    prevStatus = prev.rows[0]?.status ?? null;
  } catch { /* ignore */ }

  const colMap = { company:'company', category:'category', state:'state', city:'city', address:'address',
    contactName:'contact_name', contactTitle:'contact_title', email:'email', phone:'phone', website:'website',
    fleetSize:'fleet_size', pitchAngle:'pitch_angle', status:'status', notes:'notes', lastContacted:'last_contacted' };
  const sets = []; const params = [];
  for (const [key, col] of Object.entries(colMap)) {
    if (d[key] !== undefined) { params.push(d[key]||null); sets.push(`${col}=$${params.length}`); }
  }

  // Auto-set followup_due_at when status changes to a trackable stage
  if (d.status && d.status !== prevStatus && FOLLOWUP_DAYS[d.status]) {
    params.push(d.status);
    sets.push(`followup_due_at = CURRENT_DATE + INTERVAL '1 day' * $${params.length}::int`);
    // Swap last param with days count
    params[params.length - 1] = FOLLOWUP_DAYS[d.status];
  } else if (d.status === 'won' || d.status === 'lost') {
    sets.push('followup_due_at = NULL');
  }

  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(id); params.push(uid);
  try {
    const r = await pool.query(
      `UPDATE leads SET ${sets.join(',')}, updated_at=NOW()
       WHERE id=$${params.length-1} AND user_id=$${params.length} RETURNING *`, params
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });

    // Log status change activity
    if (d.status && d.status !== prevStatus) {
      await logActivity(pool, { leadId: id, userId: uid, type: 'status_changed',
        metadata: { from: prevStatus, to: d.status } });
    }

    res.json(leadRow(r.rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/leads/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    await pool.query(`DELETE FROM leads WHERE id=$1 AND user_id=$2`, [id, String(req.user.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/leads/sync', authMiddleware, async (req, res) => {
  const { leads: incoming } = req.body || {};
  if (!Array.isArray(incoming)) return res.status(400).json({ error: 'leads must be an array' });
  const uid = String(req.user.id);
  let inserted = 0; let failed = 0;
  for (const d of incoming) {
    if (!d.company) { failed++; continue; }
    const clientId = d.clientId || d.id || null;
    try {
      await pool.query(`
        INSERT INTO leads (user_id, client_id, company, category, state, city, address,
          contact_name, contact_title, email, phone, website, fleet_size,
          pitch_angle, status, notes, last_contacted, source_company_id, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                COALESCE($19::timestamptz,NOW()), COALESCE($20::timestamptz,NOW()))
        ON CONFLICT (user_id, client_id) DO UPDATE SET
          status=EXCLUDED.status, notes=EXCLUDED.notes,
          contact_name=EXCLUDED.contact_name, contact_title=EXCLUDED.contact_title,
          email=EXCLUDED.email, phone=EXCLUDED.phone,
          updated_at=GREATEST(leads.updated_at,EXCLUDED.updated_at)
      `, [uid, clientId, d.company, d.category||'fleet', d.state||null, d.city||null, d.address||null,
          d.contactName||null, d.contactTitle||null, d.email||null, d.phone||null, d.website||null,
          d.fleetSize||null, d.pitchAngle||null, d.status||'cold', d.notes||null,
          d.lastContacted||null, d.sourceCompanyId||null, d.createdAt||null, d.updatedAt||null]);
      inserted++;
    } catch { failed++; }
  }
  res.json({ ok: true, inserted, failed });
});

// ----------------------------------------------------------------------------
// Lead activities (timeline)
// ----------------------------------------------------------------------------
app.get('/leads/:id/activities', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    // Verify ownership
    const own = await pool.query('SELECT id FROM leads WHERE id=$1 AND user_id=$2', [id, String(req.user.id)]);
    if (!own.rows.length) return res.status(404).json({ error: 'Not found' });
    const r = await pool.query(
      `SELECT id, type, subject, body, metadata, created_at
       FROM lead_activities WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 100`, [id]
    );
    res.json({ activities: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/leads/:id/activities', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const { type, subject, body, metadata } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type required' });
  const uid = String(req.user.id);
  try {
    const own = await pool.query('SELECT id FROM leads WHERE id=$1 AND user_id=$2', [id, uid]);
    if (!own.rows.length) return res.status(404).json({ error: 'Not found' });
    const r = await pool.query(
      `INSERT INTO lead_activities (lead_id, user_id, type, subject, body, metadata)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, uid, type, subject || null, body || null, JSON.stringify(metadata || {})]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/leads/:id/send-email', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const { subject, body, toEmail, toName } = req.body || {};
  if (!subject || !body || !toEmail) return res.status(400).json({ error: 'subject, body, toEmail required' });

  const uid = String(req.user.id);
  const resendKey = process.env.RESEND_API_KEY;

  // Verify lead ownership
  const own = await pool.query(
    'SELECT id, company FROM leads WHERE id=$1 AND user_id=$2', [id, uid]
  );
  if (!own.rows.length) return res.status(404).json({ error: 'Not found' });

  // Get sender settings
  const userR = await pool.query('SELECT settings_json FROM users WHERE id=$1', [uid]);
  const settings = userR.rows[0]?.settings_json || {};
  const fromName = settings.senderName || 'WrapLeads';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'outreach@wrapleads.io';

  if (!resendKey) {
    // Log as a draft/copy action even without sending
    await logActivity(pool, { leadId: id, userId: uid, type: 'email_copied',
      subject, body, metadata: { to: toEmail, toName } });
    return res.status(503).json({
      error: 'RESEND_API_KEY not configured — email copied but not sent',
      logged: true,
    });
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: toName ? `${toName} <${toEmail}>` : toEmail,
        subject,
        text: body,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || 'Resend error');

    // Log sent email + update last_contacted + set followup
    await logActivity(pool, { leadId: id, userId: uid, type: 'email_sent',
      subject, body, metadata: { to: toEmail, toName, resend_id: data.id } });
    await pool.query(
      `UPDATE leads SET last_contacted = CURRENT_DATE,
        followup_due_at = CURRENT_DATE + INTERVAL '3 days',
        status = CASE WHEN status = 'cold' THEN 'contacted' ELSE status END,
        updated_at = NOW()
       WHERE id=$1`, [id]
    );
    res.json({ ok: true, resend_id: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Follow-up queue: leads where followup_due_at <= today
app.get('/leads/followup-due', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM leads
       WHERE user_id=$1 AND followup_due_at <= CURRENT_DATE
         AND status NOT IN ('won','lost')
       ORDER BY followup_due_at ASC LIMIT 50`,
      [String(req.user.id)]
    );
    res.json({ leads: r.rows.map(leadRow), count: r.rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/leads/analytics', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const [statusR, overdueR, categoryR, sequenceR, recentR] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) AS count FROM leads WHERE user_id=$1 GROUP BY status`, [uid]),
      pool.query(`
        SELECT COUNT(*) AS count FROM leads
        WHERE user_id=$1
          AND status IN ('contacted','replied')
          AND (last_contacted IS NULL OR last_contacted < CURRENT_DATE - INTERVAL '14 days')
      `, [uid]),
      pool.query(`SELECT category, COUNT(*) AS count FROM leads WHERE user_id=$1 GROUP BY category`, [uid]),
      pool.query(`
        SELECT
          COUNT(DISTINCT lead_id) FILTER (WHERE status='pending') AS active_sequences,
          COUNT(*) FILTER (WHERE status='sent' AND sent_at >= CURRENT_DATE - INTERVAL '30 days') AS sent_30d
        FROM email_queue WHERE user_id=$1
      `, [uid]),
      pool.query(`
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM leads WHERE user_id=$1 AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(created_at) ORDER BY day
      `, [uid]),
    ]);

    const byStatus = {};
    const total = statusR.rows.reduce((acc, r) => {
      byStatus[r.status] = parseInt(r.count, 10);
      return acc + parseInt(r.count, 10);
    }, 0);

    const byCategory = {};
    categoryR.rows.forEach(r => { byCategory[r.category] = parseInt(r.count, 10); });

    // Projected revenue by category (conservative per-lead averages)
    const REV_PER_LEAD = {
      fleet: 2500, dinoc: 4500, gc_referral: 12000,
      construction: 3500, color_change: 1800, other: 1500,
    };
    let projectedRevenue = 0;
    for (const [cat, count] of Object.entries(byCategory)) {
      const activeCount = count - (byStatus.won ?? 0) - (byStatus.lost ?? 0);
      projectedRevenue += Math.max(0, activeCount) * (REV_PER_LEAD[cat] ?? 1500);
    }

    const sq = sequenceR.rows[0];
    const recentLeads = recentR.rows.map(r => ({ day: r.day, count: parseInt(r.count, 10) }));

    res.json({
      total,
      byStatus,
      byCategory,
      overdue: parseInt(overdueR.rows[0]?.count ?? 0, 10),
      projectedRevenue,
      sequenceStats: {
        activeSequences: parseInt(sq.active_sequences ?? 0, 10),
        emailsSent30d: parseInt(sq.sent_30d ?? 0, 10),
      },
      recentLeads,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----------------------------------------------------------------------------
// Sample carrier seeder (runs when companies table is empty)
// ----------------------------------------------------------------------------
async function seedSampleCarriers() {
  const STATES = {
    IN: ['Indianapolis','Fort Wayne','Evansville','South Bend','Carmel','Fishers','Bloomington','Hammond','Lafayette','Muncie'],
    OH: ['Columbus','Cleveland','Cincinnati','Toledo','Akron','Dayton','Parma','Canton','Youngstown','Lorain'],
    IL: ['Chicago','Aurora','Rockford','Joliet','Naperville','Springfield','Peoria','Elgin','Waukegan','Champaign'],
    MI: ['Detroit','Grand Rapids','Warren','Sterling Heights','Lansing','Ann Arbor','Flint','Dearborn','Livonia','Westland'],
    KY: ['Louisville','Lexington','Bowling Green','Owensboro','Covington','Hopkinsville','Richmond','Florence','Georgetown','Henderson'],
    TN: ['Nashville','Memphis','Knoxville','Chattanooga','Clarksville','Murfreesboro','Franklin','Jackson','Hendersonville','Kingsport'],
    WI: ['Milwaukee','Madison','Green Bay','Kenosha','Racine','Appleton','Waukesha','Oshkosh','Eau Claire','Janesville'],
    MO: ['Kansas City','St. Louis','Springfield','Columbia','Independence','Lee\'s Summit','O\'Fallon','St. Joseph','St. Charles','Blue Springs'],
  };
  const WORDS1 = ['Smith','Johnson','Midwest','Central','National','Allied','Premier','Eagle','Titan','Apex','Summit','Keystone','Pioneer','Patriot','American','Freedom','Heritage','Liberty','Horizon','Blue Ridge'];
  const WORDS2 = ['Trucking','Transport','Logistics','Freight','Carriers','Express','Delivery','Hauling','Distribution','Moving'];
  const SUFFIXES = ['LLC','Inc','Co','Corp',''];
  const FLEETS = [3,5,7,8,10,12,15,18,20,25,30,35,40,50,60,75,100,125,150,200,300,500];
  const INDUSTRIES = ['freight','trucking','general freight','household goods','construction fleet','auto transport','food beverage'];

  const carriers = [];
  let idx = 0;
  for (const [state, cities] of Object.entries(STATES)) {
    for (let i = 0; i < 45; i++) {
      idx++;
      const w1 = WORDS1[(idx * 7 + i * 3) % WORDS1.length];
      const w2 = WORDS2[(idx * 3 + i) % WORDS2.length];
      const sfx = SUFFIXES[(idx * 5) % SUFFIXES.length];
      const city = cities[i % cities.length];
      const fleet = FLEETS[(idx * 11 + i) % FLEETS.length];
      const ind = INDUSTRIES[(idx * 2 + i) % INDUSTRIES.length];
      carriers.push([
        'seed', `seed-${String(idx).padStart(4,'0')}`,
        sfx ? `${w1} ${w2} ${sfx}` : `${w1} ${w2}`,
        null, state, city, null, null, null, fleet, ind, new Date('2022-06-01'),
      ]);
    }
  }

  let inserted = 0;
  for (const row of carriers) {
    try {
      await pool.query(`
        INSERT INTO companies
          (source, source_id, name, dba_name, state, city, street, phone, website, fleet_size, industry, last_reported)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (source, source_id) DO NOTHING
      `, row);
      inserted++;
    } catch { /* skip */ }
  }
  console.log(`  → Inserted ${inserted} sample carriers across ${Object.keys(STATES).length} states.`);
}

// ----------------------------------------------------------------------------
// Settings (per-user, server-persisted)
// ----------------------------------------------------------------------------
app.get('/settings', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query('SELECT settings_json FROM users WHERE id = $1', [req.user.id]);
    res.json({ settings: r.rows[0]?.settings_json ?? {} });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/settings', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE users SET settings_json = $1 WHERE id = $2',
      [req.body || {}, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----------------------------------------------------------------------------
// Export leads as CSV
// ----------------------------------------------------------------------------
app.get('/leads/export', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM leads WHERE user_id = $1 ORDER BY updated_at DESC`,
      [String(req.user.id)]
    );
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Company','Contact Name','Title','Email','Phone','Category','Status',
                    'Fleet Size','City','State','Last Contacted','Notes','Score'].map(esc).join(',');
    const rows = r.rows.map((l) => {
      const fleet = parseInt(l.fleet_size) || 0;
      // Simple score approximation for export
      const score = Math.min(100,
        (fleet >= 100 ? 30 : fleet >= 50 ? 25 : fleet >= 20 ? 18 : fleet >= 10 ? 12 : fleet >= 5 ? 6 : 0) +
        ({ fleet: 25, colorchange: 22, dinoc: 20, reatec: 18, construction: 15, wallgraphics: 12, design: 10 }[l.category] ?? 10) +
        ({ won: 30, proposal: 25, meeting: 20, replied: 15, contacted: 10, cold: 5 }[l.status] ?? 0)
      );
      return [l.company, l.contact_name, l.contact_title, l.email, l.phone,
              l.category, l.status, l.fleet_size, l.city, l.state,
              l.last_contacted ? new Date(l.last_contacted).toLocaleDateString('en-US') : '',
              l.notes, score].map(esc).join(',');
    });
    const csv = [header, ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="wrapleads-export.csv"');
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----------------------------------------------------------------------------
// Drip engine — activate a 3-email sequence for a lead
// ----------------------------------------------------------------------------
app.post('/leads/:id/activate-sequence', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const uid = String(req.user.id);
  const { tone = 'Professional' } = req.body || {};
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Missing ANTHROPIC_API_KEY' });

  // Verify lead ownership + get email
  const leadR = await pool.query('SELECT * FROM leads WHERE id=$1 AND user_id=$2', [id, uid]);
  if (!leadR.rows.length) return res.status(404).json({ error: 'Not found' });
  const lead = leadRow(leadR.rows[0]);
  if (!lead.email) return res.status(400).json({ error: 'Lead has no email address — find one first' });

  // Cancel any existing pending queue for this lead
  await pool.query(`UPDATE email_queue SET status='cancelled' WHERE lead_id=$1 AND user_id=$2 AND status='pending'`, [id, uid]);

  // Get sender settings
  const userR = await pool.query('SELECT settings_json FROM users WHERE id=$1', [uid]);
  const settings = userR.rows[0]?.settings_json || {};

  const prompt = `You are a sales expert for a vehicle wrap and architectural film installation company.
Company: ${settings.companyName || 'our wrap shop'}
Sender: ${settings.senderName || 'the team'}, ${settings.senderTitle || 'Installer / Sales'}
Services: ${settings.companyServices || 'fleet wraps, DI-NOC, color-change wraps, wall graphics'}

Write a 3-email ${tone} drip sequence for this prospect:
Company: ${lead.company}
Contact: ${lead.contactName || 'Fleet/Facilities Manager'}, ${lead.contactTitle || ''}
Location: ${lead.city || ''} ${lead.state || ''}
Category: ${lead.category}
Pitch angle: ${lead.pitchAngle || 'general wrap inquiry'}

Email 1 (Day 1): Warm introduction — establish credibility, reference their specific opportunity
Email 2 (Day 5): Follow-up — add value (relevant case study, stat, or insight)
Email 3 (Day 12): Last touch — brief, direct, genuine, leaves door open

Each under 180 words. Return raw JSON only:
{"emails":[{"day":1,"label":"Introduction","subject":"...","body":"..."},{"day":5,"label":"Follow-up","subject":"...","body":"..."},{"day":12,"label":"Last Touch","subject":"...","body":"..."}]}`;

  try {
    const raw = await claudeHaiku(apiKey, [{ role: 'user', content: prompt }], 2000);
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    const now = new Date();

    // Insert 3 queue rows
    for (const email of result.emails) {
      const sendAt = new Date(now);
      sendAt.setDate(sendAt.getDate() + (email.day - 1));
      await pool.query(
        `INSERT INTO email_queue (user_id, lead_id, sequence_day, subject, body, to_email, to_name, send_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [uid, id, email.day, email.subject, email.body, lead.email, lead.contactName || null, sendAt]
      );
    }

    // Log activity
    await logActivity(pool, { leadId: id, userId: uid, type: 'sequence_activated',
      metadata: { emails: result.emails.length, tone } });

    res.json({ ok: true, queued: result.emails.length, emails: result.emails });
  } catch (e) {
    console.error('[activate-sequence]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/leads/:id/queue', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const own = await pool.query('SELECT id FROM leads WHERE id=$1 AND user_id=$2', [id, String(req.user.id)]);
    if (!own.rows.length) return res.status(404).json({ error: 'Not found' });
    const r = await pool.query(
      `SELECT id, sequence_day, subject, body, to_email, to_name, send_at, sent_at, status, error_msg
       FROM email_queue WHERE lead_id=$1 ORDER BY sequence_day ASC`, [id]
    );
    res.json({ queue: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/email-queue/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    await pool.query(
      `UPDATE email_queue SET status='cancelled' WHERE id=$1 AND user_id=$2 AND status='pending'`,
      [id, String(req.user.id)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// Bid Tracker — CRUD
// ============================================================================

app.get('/bids', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const { rows } = await pool.query(
      `SELECT b.*, l.company AS lead_company
       FROM bids b
       LEFT JOIN leads l ON l.id = b.lead_id
       WHERE b.user_id = $1
       ORDER BY
         CASE WHEN b.status IN ('won','lost','no_bid') THEN 1 ELSE 0 END,
         b.bid_due ASC NULLS LAST,
         b.created_at DESC`,
      [uid]
    );
    res.json({ bids: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/bids', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const {
      project_name, gc_name, architect, project_type = 'general',
      bid_due, estimated_value, source_platform, source_url,
      status = 'tracking', notes, lead_id,
    } = req.body;
    if (!project_name?.trim()) return res.status(400).json({ error: 'project_name required' });

    const { rows } = await pool.query(
      `INSERT INTO bids
         (user_id, lead_id, project_name, gc_name, architect, project_type,
          bid_due, estimated_value, source_platform, source_url, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [uid, lead_id || null, project_name.trim(), gc_name || null, architect || null,
       project_type, bid_due || null, estimated_value || null,
       source_platform || null, source_url || null, status, notes || null]
    );
    res.status(201).json({ bid: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/bids/:id', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const id = parseInt(req.params.id, 10);
    const {
      project_name, gc_name, architect, project_type,
      bid_due, estimated_value, source_platform, source_url,
      status, notes, lead_id,
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE bids SET
         project_name    = COALESCE($3, project_name),
         gc_name         = COALESCE($4, gc_name),
         architect       = COALESCE($5, architect),
         project_type    = COALESCE($6, project_type),
         bid_due         = COALESCE($7::date, bid_due),
         estimated_value = COALESCE($8, estimated_value),
         source_platform = COALESCE($9, source_platform),
         source_url      = COALESCE($10, source_url),
         status          = COALESCE($11, status),
         notes           = COALESCE($12, notes),
         lead_id         = COALESCE($13, lead_id),
         updated_at      = NOW()
       WHERE id=$1 AND user_id=$2
       RETURNING *`,
      [id, uid, project_name || null, gc_name || null, architect || null,
       project_type || null, bid_due || null, estimated_value || null,
       source_platform || null, source_url || null, status || null,
       notes || null, lead_id || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ bid: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/bids/:id', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const id = parseInt(req.params.id, 10);
    await pool.query(`DELETE FROM bids WHERE id=$1 AND user_id=$2`, [id, uid]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/bids/summary', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('won','lost','no_bid')) AS active,
         COUNT(*) FILTER (WHERE status='won') AS won,
         COUNT(*) FILTER (WHERE status='submitted') AS submitted,
         COALESCE(SUM(estimated_value) FILTER (WHERE status='won'), 0) AS won_value,
         COALESCE(SUM(estimated_value) FILTER (WHERE status NOT IN ('lost','no_bid')), 0) AS pipeline_value,
         COUNT(*) FILTER (WHERE bid_due IS NOT NULL AND bid_due < CURRENT_DATE AND status='tracking') AS overdue_bids
       FROM bids WHERE user_id=$1`,
      [uid]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Background worker — processes pending queue emails
async function processEmailQueue() {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  try {
    const { rows } = await pool.query(`
      SELECT q.*, l.contact_name, l.company
      FROM email_queue q
      JOIN leads l ON l.id = q.lead_id
      WHERE q.status = 'pending' AND q.send_at <= NOW()
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    `);
    for (const item of rows) {
      try {
        const userR = await pool.query('SELECT settings_json FROM users WHERE id=$1', [item.user_id]);
        const s = userR.rows[0]?.settings_json || {};
        const fromName = s.senderName || 'WrapLeads';
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'outreach@wrapleads.io';

        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: item.to_name ? `${item.to_name} <${item.to_email}>` : item.to_email,
            subject: item.subject,
            text: item.body,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.message || 'Resend error');

        await pool.query(
          `UPDATE email_queue SET status='sent', sent_at=NOW(), resend_id=$1 WHERE id=$2`,
          [data.id, item.id]
        );
        await logActivity(pool, {
          leadId: item.lead_id, userId: item.user_id, type: 'email_sent',
          subject: item.subject, body: item.body,
          metadata: { to: item.to_email, resend_id: data.id, sequence_day: item.sequence_day, auto: true },
        });
        await pool.query(
          `UPDATE leads SET last_contacted=CURRENT_DATE,
            followup_due_at=CURRENT_DATE + INTERVAL '3 days',
            status=CASE WHEN status='cold' THEN 'contacted' ELSE status END,
            updated_at=NOW() WHERE id=$1`, [item.lead_id]
        );
        console.log(`[drip] Sent Day ${item.sequence_day} to ${item.to_email} (lead ${item.lead_id})`);
      } catch (err) {
        await pool.query(
          `UPDATE email_queue SET status='failed', error_msg=$1 WHERE id=$2`,
          [err.message, item.id]
        );
        console.error(`[drip] Failed queue item ${item.id}:`, err.message);
      }
    }
  } catch (e) {
    console.error('[drip worker]', e.message);
  }
}

function startDripWorker() {
  processEmailQueue(); // run immediately on start
  setInterval(processEmailQueue, 60_000); // then every minute
  console.log('· Drip worker: running (checks queue every 60s)');
}

// ----------------------------------------------------------------------------
// Boot
// ----------------------------------------------------------------------------
const banner = `
╔═══════════════════════════════════════════════════╗
║   WrapLeads.io — Local Server  (v0.4)             ║
║   http://localhost:${String(PORT).padEnd(5)}                          ║
╚═══════════════════════════════════════════════════╝`;

// ----------------------------------------------------------------------------
// AI email generation (proxied — users don't need their own API key)
// ----------------------------------------------------------------------------
app.post('/ai/email', authMiddleware, subMiddleware, async (req, res) => {
  const { lead, emailType, tone, settings } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI email not configured (missing ANTHROPIC_API_KEY)' });

  const systemPrompt = `You are an expert sales copywriter for a vehicle wrap shop. Write concise, personalized outreach emails.
Company: ${settings.companyName || 'our wrap shop'}
Sender: ${settings.senderName || 'the team'}, ${settings.senderTitle || 'Installer / Sales'}
Email: ${settings.senderEmail || ''}
Phone: ${settings.senderPhone || ''}
Services: ${settings.companyServices || 'fleet wraps, color-change wraps, vehicle graphics'}
Tagline: ${settings.companyTagline || 'premium vehicle wraps'}`;

  const userPrompt = `Write a ${tone.toLowerCase()} ${emailType.toLowerCase()} email to ${lead.contactName || 'the fleet manager'} at ${lead.company}.
Company location: ${lead.city ? lead.city + ', ' : ''}${lead.state || 'unknown state'}
Fleet size: ${lead.fleetSize || 'unknown'}
Pitch angle: ${lead.pitchAngle || 'general wrap inquiry'}
Keep the email under 200 words. Use a compelling subject line. Return JSON: {"subject": "...", "body": "..."}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'AI returned invalid response' });
    const parsed = JSON.parse(match[0]);
    res.json(parsed);
  } catch (e) {
    console.error('[ai/email]', e);
    res.status(500).json({ error: 'AI email generation failed' });
  }
});

// Apollo test route
app.get('/apollo/test', authMiddleware, async (req, res) => {
  const key = req.query.key || req.headers['x-apollo-key'];
  if (!key) return res.json({ ok: false });
  try {
    const r = await fetch(`${APOLLO_BASE}/auth/health_check`, {
      headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'application/json', 'x-api-key': key },
    });
    res.json({ ok: r.ok });
  } catch {
    res.json({ ok: false });
  }
});

// ----------------------------------------------------------------------------
// Blueprint Scanner — upload a PDF bid spec, Claude extracts wrap opportunities
// ----------------------------------------------------------------------------
const multer  = require('multer');
const pdfParse = require('pdf-parse');
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Shared Claude fetch helper
async function claudeHaiku(apiKey, messages, maxTokens = 1500) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages }),
  });
  if (!resp.ok) throw new Error(`Claude error: ${resp.status}`);
  const d = await resp.json();
  return d.content?.[0]?.text || '';
}

// ----------------------------------------------------------------------------
// AI — 3-email follow-up sequence
// ----------------------------------------------------------------------------
app.post('/ai/sequence', authMiddleware, subMiddleware, async (req, res) => {
  const { lead, settings } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Missing ANTHROPIC_API_KEY' });

  const prompt = `You are a sales expert for a vehicle wrap and architectural film installation company.
Company: ${settings.companyName || 'our wrap shop'}
Sender: ${settings.senderName || 'the team'}, ${settings.senderTitle || 'Installer / Sales'}
Services: ${settings.companyServices || 'fleet wraps, DI-NOC, color-change wraps, wall graphics'}

Write a 3-email follow-up sequence for this prospect:
Company: ${lead.company}
Contact: ${lead.contactName || 'Fleet/Facilities Manager'}, ${lead.contactTitle || ''}
Location: ${lead.city || ''} ${lead.state || ''}
Category: ${lead.category}
Pitch angle: ${lead.pitchAngle || 'general wrap inquiry'}

Email 1 (Day 1): Warm introduction — establish credibility, mention the specific opportunity
Email 2 (Day 5): Follow-up — add value (case study, stat, or insight relevant to their industry)
Email 3 (Day 12): Last touch — brief, direct, open door for future

Each under 180 words. Return raw JSON only:
{"emails":[{"day":1,"label":"Introduction","subject":"...","body":"..."},{"day":5,"label":"Follow-up","subject":"...","body":"..."},{"day":12,"label":"Last Touch","subject":"...","body":"..."}]}`;

  try {
    const raw = await claudeHaiku(apiKey, [{ role: 'user', content: prompt }], 2000);
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[ai/sequence]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// AI — bulk email generation (multiple leads in one call)
// ----------------------------------------------------------------------------
app.post('/ai/bulk-email', authMiddleware, subMiddleware, async (req, res) => {
  const { leads, emailType = 'Introduction', tone = 'Professional', settings } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Missing ANTHROPIC_API_KEY' });
  if (!Array.isArray(leads) || leads.length === 0) return res.status(400).json({ error: 'No leads provided' });
  if (leads.length > 30) return res.status(400).json({ error: 'Maximum 30 leads per bulk request' });

  const leadList = leads.map((l, i) =>
    `${i + 1}. Company: ${l.company} | Contact: ${l.contactName || 'Manager'} | ${l.city || ''} ${l.state || ''} | Category: ${l.category} | Fleet: ${l.fleetSize || 'unknown'} | Pitch: ${l.pitchAngle || ''}`
  ).join('\n');

  const prompt = `You are a sales expert for a vehicle wrap and architectural film company.
Sender: ${settings.senderName || 'the team'} at ${settings.companyName || 'our shop'}, ${settings.senderTitle || 'Installer / Sales'}
Services: ${settings.companyServices || 'fleet wraps, DI-NOC, color-change wraps, wall graphics'}

Write a ${tone} ${emailType} email for each prospect below. Each under 160 words, personalized to their company/category.

Prospects:
${leadList}

Return raw JSON only — an array matching the same order:
[{"subject":"...","body":"..."},...]`;

  try {
    const raw = await claudeHaiku(apiKey, [{ role: 'user', content: prompt }], 4000);
    const emails = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    res.json({ ok: true, emails });
  } catch (e) {
    console.error('[ai/bulk-email]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// AI — quote / proposal generator
// ----------------------------------------------------------------------------
app.post('/ai/proposal', authMiddleware, subMiddleware, async (req, res) => {
  const { lead, vehicleCount, wrapType, extraNotes, settings } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Missing ANTHROPIC_API_KEY' });

  const prompt = `You are writing a professional wrap installation proposal for a client.
Install company: ${settings.companyName || 'WrapPro'}
Sender: ${settings.senderName || 'the team'}, ${settings.senderTitle || 'Installer / Sales'}
Phone: ${settings.senderPhone || ''} | Email: ${settings.senderEmail || ''}

Client details:
Company: ${lead.company}
Contact: ${lead.contactName || 'Facilities Manager'}, ${lead.contactTitle || ''}
Location: ${lead.city || ''}, ${lead.state || ''}

Project:
Wrap type: ${wrapType}
Vehicle / unit count: ${vehicleCount}
Extra notes: ${extraNotes || 'none'}

Write a professional proposal including:
1. Brief intro paragraph (who we are, why we're the right fit)
2. Scope of Work (what we'll do, materials, brands like 3M/Avery if relevant)
3. Investment (realistic price range based on wrap type and count — fleet full wraps ~$2,500-4,500/vehicle, DI-NOC per sq ft ~$8-18, color change ~$3,000-6,000/vehicle, wall graphics ~$5-12/sq ft)
4. Timeline estimate
5. Why act now (availability, pricing, season)
6. Call to action

Return raw JSON: {"subject":"...","body":"..."}
Body should be plain text with line breaks, professional but warm, under 450 words.`;

  try {
    const raw = await claudeHaiku(apiKey, [{ role: 'user', content: prompt }], 2000);
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[ai/proposal]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/ai/parse-contacts', authMiddleware, async (req, res) => {
  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured (missing ANTHROPIC_API_KEY)' });

  const prompt = `You are a lead extraction assistant for a vehicle wrap and graphics company.

Extract every distinct business / contact from the text below. For each one return a JSON object:
- company (string, required) — the business name
- contactName (string|null) — primary decision-maker's full name
- contactTitle (string|null) — their title (e.g. "President/CEO", "Fleet Manager")
- phone (string|null) — best phone number
- email (string|null)
- city (string|null)
- state (string|null) — 2-letter abbreviation when known
- category (one of): "fleet"|"dinoc"|"construction"|"design"|"reatec"|"colorchange"|"wallgraphics"|"gc_referral"
  fleet=trucking/logistics/delivery, dinoc=property mgmt/facilities/hospitality,
  construction=GC/builders, design=interior design/architecture, reatec=luxury retail/auto dealers,
  colorchange=auto groups/rental fleets, wallgraphics=restaurants/retail/universities,
  gc_referral=GC referral partners for architectural film specs
- pitchAngle (string) — one tight sentence on the wrap opportunity (be specific to the company type)

If multiple contacts share one company, create one lead using the most senior contact.
Return ONLY a valid JSON array — no markdown, no explanation, no code fences.

TEXT:
${text.slice(0, 6000)}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await resp.json();
    const raw = data.content?.[0]?.text ?? '';
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return res.status(500).json({ error: 'Could not parse AI response', raw });
    const leads = JSON.parse(match[0]);
    res.json({ leads, count: leads.length });
  } catch (e) {
    console.error('[ai/parse-contacts]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/blueprint/scan', authMiddleware, upload.single('pdf'), async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured (missing ANTHROPIC_API_KEY)' });
  if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });

  let text = '';
  try {
    const parsed = await pdfParse(req.file.buffer);
    text = parsed.text || '';
  } catch {
    return res.status(422).json({ error: 'Could not read PDF — make sure it is text-based (not a scanned image)' });
  }

  if (text.trim().length < 50) {
    return res.status(422).json({ error: 'PDF appears to be a scanned image. Text extraction requires a text-based PDF.' });
  }

  // Truncate to ~12k chars to stay within token limits
  const excerpt = text.slice(0, 12000);

  const prompt = `You are analyzing a construction bid specification or blueprint document for a vehicle wrap and architectural film installation company.

Extract any opportunities for:
- 3M DI-NOC architectural film installation
- Rea Tec architectural film installation
- Vehicle wraps or fleet graphics
- Wall graphics or large-format printing
- Color change wraps
- Any 3M certified installer requirements

Document text:
---
${excerpt}
---

Return a JSON object with this exact structure (no markdown, raw JSON only):
{
  "hasOpportunity": true or false,
  "opportunities": [
    {
      "type": "dinoc" | "reatec" | "wallgraphics" | "fleet" | "colorchange" | "gc_referral",
      "description": "brief description of what was found",
      "specs": ["list of specific product specs or quantities mentioned"],
      "location": "where in the doc (e.g. Section 09 72 00)"
    }
  ],
  "company": "GC or owner name if found, or null",
  "contactTitle": "most relevant contact title (e.g. General Contractor, Project Manager)",
  "projectName": "project name if mentioned, or null",
  "city": "city if mentioned, or null",
  "state": "2-letter state code if mentioned, or null",
  "projectType": "office | healthcare | hospitality | retail | education | industrial | residential | other",
  "pitchAngle": "1-2 sentence pitch for why this is a wrap/film opportunity",
  "notes": "any other relevant details (cert requirements, quantities, timeline)",
  "confidence": "high | medium | low"
}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(502).json({ error: `AI error: ${err}` });
    }

    const data = await resp.json();
    const raw = data.content?.[0]?.text || '{}';

    let result;
    try {
      result = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    } catch {
      return res.status(502).json({ error: 'AI returned unexpected format' });
    }

    res.json({ ok: true, result, pages: text.length });
  } catch (e) {
    console.error('[blueprint/scan]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// Static — serve React SPA (must be LAST, after all API routes)
// ----------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, async () => {
  console.log(banner);
  const db = await checkDb();
  console.log(db.ok
    ? `· Postgres connected. ${db.carriers.toLocaleString()} carriers loaded.`
    : `· Postgres NOT connected: ${db.error}\n  Run: docker compose up -d`);
  console.log(stripe ? '· Stripe: configured' : '· Stripe: NOT configured (set STRIPE_SECRET_KEY)');
  console.log(process.env.RESEND_API_KEY ? '· Resend: configured' : '· Resend: NOT configured (set RESEND_API_KEY)');
  if (db.ok) {
    await migrateDb();
    startDripWorker();
    email.startTrialCron(pool);
    const { count } = (await pool.query('SELECT COUNT(*)::int AS count FROM companies')).rows[0];
    if (count === 0) {
      console.log('· Companies table empty — seeding sample carriers...');
      await seedSampleCarriers();
      console.log('· Sample carriers seeded. Run ingest-fmcsa.js to load real FMCSA data.');
    }
  }
  console.log(`· Open http://localhost:${PORT} in your browser.\n`);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await pool.end();
  process.exit(0);
});
