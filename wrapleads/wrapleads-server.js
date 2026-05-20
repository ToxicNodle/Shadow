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
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
// Default: disabled (free). Enable payments by setting STRIPE_DISABLED=false in env.
const STRIPE_DISABLED   = process.env.STRIPE_DISABLED !== 'false';

// Three-tier pricing — falls back to legacy STRIPE_PRICE_ID for single-tier setups
const STRIPE_PRICE_ID_WRAPLEADS = process.env.STRIPE_PRICE_ID_WRAPLEADS || process.env.STRIPE_PRICE_ID || '';
const STRIPE_PRICE_ID_SHOPFLOW  = process.env.STRIPE_PRICE_ID_SHOPFLOW  || '';
const STRIPE_PRICE_ID_WRAPOS    = process.env.STRIPE_PRICE_ID_WRAPOS    || '';
// Legacy alias kept for any code that still references it directly
const STRIPE_PRICE_ID = STRIPE_PRICE_ID_WRAPLEADS;

// Map Stripe price IDs → internal tier names (populated after price IDs are set)
const PRICE_TO_TIER = {};
if (STRIPE_PRICE_ID_WRAPLEADS) PRICE_TO_TIER[STRIPE_PRICE_ID_WRAPLEADS] = 'wrapleads';
if (STRIPE_PRICE_ID_SHOPFLOW)  PRICE_TO_TIER[STRIPE_PRICE_ID_SHOPFLOW]  = 'shopflow';
if (STRIPE_PRICE_ID_WRAPOS)    PRICE_TO_TIER[STRIPE_PRICE_ID_WRAPOS]    = 'wrapos';

const TIER_PRICES = { wrapleads: 79, shopflow: 149, wrapos: 249 };

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }) : null;

const { autoSeedUser } = require('./lib/autoSeed');

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
  // ── Bootstrap: create core tables if this is a fresh database ───────────
  // These run before any ALTER TABLE so Railway/fresh-Postgres deployments
  // self-initialize without needing to run schema.sql manually.
  try { await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');   } catch (_) {}
  try { await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');  } catch (_) {}

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                  BIGSERIAL PRIMARY KEY,
      email               TEXT NOT NULL UNIQUE,
      password_hash       TEXT NOT NULL,
      name                TEXT,
      company_name        TEXT,
      stripe_customer_id  TEXT UNIQUE,
      stripe_sub_id       TEXT UNIQUE,
      sub_status          TEXT NOT NULL DEFAULT 'inactive',
      sub_period_end      TIMESTAMPTZ,
      trial_ends_at       TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email           ON users (email)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users (stripe_customer_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_stripe_sub      ON users (stripe_sub_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id                BIGSERIAL PRIMARY KEY,
      source            TEXT NOT NULL,
      source_id         TEXT NOT NULL,
      name              TEXT NOT NULL,
      dba_name          TEXT,
      street            TEXT,
      city              TEXT,
      state             TEXT,
      zip               TEXT,
      country           TEXT DEFAULT 'US',
      phone             TEXT,
      email             TEXT,
      website           TEXT,
      fleet_size        INTEGER,
      drivers           INTEGER,
      cargo_types       TEXT,
      industry          TEXT,
      last_reported     DATE,
      added_to_registry DATE,
      raw_data          JSONB,
      ingested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source, source_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_companies_state      ON companies (state)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_companies_fleet_size ON companies (fleet_size DESC NULLS LAST)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_companies_state_fleet ON companies (state, fleet_size DESC NULLS LAST)`);
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_companies_name_trgm ON companies USING gin (name gin_trgm_ops)`); } catch (_) {}
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_companies_dba_trgm  ON companies USING gin (dba_name gin_trgm_ops)`); } catch (_) {}
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_companies_city       ON companies (city)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS imports (
      id          BIGSERIAL PRIMARY KEY,
      company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL DEFAULT 'local',
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, user_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_imports_user ON imports (user_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_searches (
      id           BIGSERIAL PRIMARY KEY,
      user_id      TEXT NOT NULL DEFAULT 'local',
      name         TEXT NOT NULL,
      filters      JSONB NOT NULL,
      last_checked TIMESTAMPTZ,
      new_count    INTEGER DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches (user_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id                BIGSERIAL PRIMARY KEY,
      user_id           TEXT NOT NULL DEFAULT 'local',
      client_id         TEXT,
      company           TEXT NOT NULL,
      category          TEXT NOT NULL DEFAULT 'fleet',
      state             TEXT,
      city              TEXT,
      country           TEXT DEFAULT 'US',
      address           TEXT,
      contact_name      TEXT,
      contact_title     TEXT,
      email             TEXT,
      phone             TEXT,
      website           TEXT,
      fleet_size        TEXT,
      pitch_angle       TEXT,
      status            TEXT NOT NULL DEFAULT 'cold',
      notes             TEXT,
      source            TEXT,
      last_contacted    DATE,
      followup_due_at   DATE,
      referred_by       TEXT,
      source_company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, client_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_user    ON leads (user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_status  ON leads (user_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_updated ON leads (user_id, updated_at DESC)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ingest_runs (
      id            BIGSERIAL PRIMARY KEY,
      source        TEXT NOT NULL,
      file_name     TEXT,
      rows_read     BIGINT,
      rows_inserted BIGINT,
      rows_updated  BIGINT,
      rows_skipped  BIGINT,
      started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at   TIMESTAMPTZ,
      notes         TEXT
    )
  `);
  // ── End bootstrap ────────────────────────────────────────────────────────

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
    // shop_token caches the public quote/portfolio URL slug so we can look up
    // a user by token in O(1) instead of scanning the entire users table.
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_token TEXT`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_shop_token ON users(shop_token) WHERE shop_token IS NOT NULL`);
    // Backfill any rows missing a token using the same hash function the runtime uses.
    await pool.query(`
      UPDATE users
      SET shop_token = SUBSTRING(ENCODE(DIGEST(id::text || 'wrapleads_qr', 'sha256'), 'hex') FROM 1 FOR 16)
      WHERE shop_token IS NULL
    `);
  } catch (e) {
    // pgcrypto may not be available; fall back to runtime-side backfill below
    console.warn('[migrate] Could not backfill shop_token via SQL (will fall back to runtime):', e.message);
  }
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'wrapleads'`);
  } catch (e) {
    console.warn('[migrate] Could not add plan_tier column:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_due_at DATE`);
  } catch (e) {
    console.warn('[migrate] Could not add followup_due_at column:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by TEXT`);
  } catch (e) { console.warn('[migrate] Could not add referred_by column:', e.message); }
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT`);
  } catch (e) { console.warn('[migrate] Could not add source column:', e.message); }
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'US'`);
  } catch (e) { console.warn('[migrate] Could not add country column:', e.message); }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_tracking (
        id          BIGSERIAL PRIMARY KEY,
        token       TEXT NOT NULL UNIQUE,
        user_id     TEXT NOT NULL,
        lead_id     BIGINT REFERENCES leads(id) ON DELETE CASCADE,
        subject     TEXT,
        open_count  INT DEFAULT 0,
        opened_at   TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_track_token ON email_tracking(token)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_track_lead  ON email_tracking(lead_id)`);
  } catch (e) { console.warn('[migrate] Could not create email_tracking table:', e.message); }
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

  // Wrap Lifecycle Tracker
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS installed_jobs (
        id             BIGSERIAL PRIMARY KEY,
        user_id        TEXT NOT NULL,
        lead_id        BIGINT REFERENCES leads(id) ON DELETE SET NULL,
        company        TEXT NOT NULL,
        vehicle_type   TEXT NOT NULL DEFAULT 'other',
        vehicle_count  INT  NOT NULL DEFAULT 1,
        wrap_category  TEXT NOT NULL DEFAULT 'fleet',
        material       TEXT,
        install_date   DATE NOT NULL,
        life_years     INT  NOT NULL DEFAULT 5,
        notes          TEXT,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_jobs_user  ON installed_jobs(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_jobs_lead  ON installed_jobs(lead_id)`);
  } catch (e) {
    console.warn('[migrate] Could not create installed_jobs table:', e.message);
  }

  // Dynamic Wrap Content
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wrap_content (
        id          BIGSERIAL PRIMARY KEY,
        user_id     TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        image_url   TEXT,
        tags        TEXT[] DEFAULT '{}',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wrap_content_user ON wrap_content(user_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS content_schedules (
        id            BIGSERIAL PRIMARY KEY,
        user_id       TEXT NOT NULL,
        content_id    BIGINT REFERENCES wrap_content(id) ON DELETE CASCADE,
        vehicle_group TEXT NOT NULL DEFAULT 'all',
        start_date    DATE NOT NULL,
        end_date      DATE,
        start_time    TIME,
        end_time      TIME,
        geo_trigger   TEXT,
        priority      INT NOT NULL DEFAULT 0,
        notes         TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_content_sched_user ON content_schedules(user_id)`);
  } catch (e) {
    console.warn('[migrate] Could not create wrap_content tables:', e.message);
  }

  // E Ink Device Infrastructure
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eink_devices (
        id                   BIGSERIAL PRIMARY KEY,
        user_id              TEXT NOT NULL,
        device_token         TEXT NOT NULL UNIQUE,
        serial_number        TEXT,
        name                 TEXT NOT NULL,
        vehicle_group        TEXT NOT NULL DEFAULT 'fleet',
        lead_id              BIGINT REFERENCES leads(id) ON DELETE SET NULL,
        job_id               BIGINT REFERENCES installed_jobs(id) ON DELETE SET NULL,
        status               TEXT NOT NULL DEFAULT 'offline',
        current_content_id   BIGINT REFERENCES wrap_content(id) ON DELETE SET NULL,
        last_seen_at         TIMESTAMPTZ,
        last_location        JSONB,
        firmware_version     TEXT,
        metadata             JSONB DEFAULT '{}',
        created_at           TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_eink_devices_user  ON eink_devices(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_eink_devices_token ON eink_devices(device_token)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_eink_devices_group ON eink_devices(vehicle_group)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eink_push_log (
        id         BIGSERIAL PRIMARY KEY,
        device_id  BIGINT NOT NULL REFERENCES eink_devices(id) ON DELETE CASCADE,
        content_id BIGINT REFERENCES wrap_content(id) ON DELETE SET NULL,
        pushed_at  TIMESTAMPTZ DEFAULT NOW(),
        acked_at   TIMESTAMPTZ,
        status     TEXT NOT NULL DEFAULT 'pending',
        error      TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_eink_push_device ON eink_push_log(device_id, pushed_at DESC)`);
  } catch (e) {
    console.warn('[migrate] Could not create eink tables:', e.message);
  }

  // Job Photos
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_photos (
        id         BIGSERIAL PRIMARY KEY,
        user_id    TEXT NOT NULL,
        job_id     BIGINT NOT NULL REFERENCES installed_jobs(id) ON DELETE CASCADE,
        image_data TEXT NOT NULL,
        caption    TEXT,
        photo_type TEXT NOT NULL DEFAULT 'other',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_photos_job ON job_photos(job_id)`);
  } catch (e) {
    console.warn('[migrate] Could not create job_photos table:', e.message);
  }

  // Client Portal Links
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portal_links (
        id         BIGSERIAL PRIMARY KEY,
        user_id    TEXT NOT NULL,
        lead_id    BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        token      TEXT NOT NULL UNIQUE,
        label      TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_portal_links_user  ON portal_links(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_portal_links_lead  ON portal_links(lead_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_portal_links_token ON portal_links(token)`);
  } catch (e) {
    console.warn('[migrate] Could not create portal_links table:', e.message);
  }

  // Notifications
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         BIGSERIAL PRIMARY KEY,
        user_id    TEXT NOT NULL,
        type       TEXT NOT NULL,
        title      TEXT NOT NULL,
        body       TEXT NOT NULL DEFAULT '',
        metadata   JSONB DEFAULT '{}',
        read_at    TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL`);
  } catch (e) {
    console.warn('[migrate] Could not create notifications table:', e.message);
  }

  // Proposals
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proposals (
        id           BIGSERIAL PRIMARY KEY,
        user_id      TEXT NOT NULL,
        lead_id      BIGINT REFERENCES leads(id) ON DELETE SET NULL,
        token        TEXT NOT NULL UNIQUE,
        title        TEXT NOT NULL,
        intro        TEXT,
        services     TEXT,
        pricing_html TEXT,
        timeline     TEXT,
        notes        TEXT,
        status       TEXT NOT NULL DEFAULT 'draft',
        approved_at  TIMESTAMPTZ,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_proposals_user  ON proposals(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_proposals_token ON proposals(token)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_proposals_lead  ON proposals(lead_id)`);
    // Sprint 7: view tracking columns
    await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0`);
    await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ`);
  } catch (e) {
    console.warn('[migrate] Could not create proposals table:', e.message);
  }

  // Sprint 7: quote_requests table — inbound lead capture
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quote_requests (
        id         BIGSERIAL PRIMARY KEY,
        user_id    TEXT NOT NULL,
        name       TEXT,
        company    TEXT NOT NULL,
        email      TEXT,
        phone      TEXT,
        vehicle_type TEXT,
        fleet_size TEXT,
        message    TEXT,
        lead_id    BIGINT REFERENCES leads(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_qr_user ON quote_requests(user_id)`);
  } catch (e) {
    console.warn('[migrate] Could not create quote_requests table:', e.message);
  }

  // Quote Builder — structured line-item quotes per lead
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_quotes (
        id           BIGSERIAL PRIMARY KEY,
        user_id      TEXT NOT NULL,
        lead_id      BIGINT REFERENCES leads(id) ON DELETE CASCADE,
        quote_number TEXT,
        title        TEXT NOT NULL DEFAULT 'Vehicle Wrap Quote',
        status       TEXT NOT NULL DEFAULT 'draft',
        line_items   JSONB NOT NULL DEFAULT '[]',
        subtotal     NUMERIC(10,2) NOT NULL DEFAULT 0,
        tax_rate     NUMERIC(5,2)  NOT NULL DEFAULT 0,
        tax_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
        discount     NUMERIC(10,2) NOT NULL DEFAULT 0,
        total        NUMERIC(10,2) NOT NULL DEFAULT 0,
        notes        TEXT,
        valid_days   INT NOT NULL DEFAULT 30,
        sent_at      TIMESTAMPTZ,
        accepted_at  TIMESTAMPTZ,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sq_user ON shop_quotes(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sq_lead ON shop_quotes(lead_id)`);
  } catch (e) {
    console.warn('[migrate] Could not create shop_quotes table:', e.message);
  }
}

// ----------------------------------------------------------------------------
// Express
// ----------------------------------------------------------------------------
const app = express();

// Stripe webhooks need the raw body — must be before express.json()
app.use('/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '4mb' }));

// CORS first so 429 / 5xx responses still carry the headers the browser needs.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Trust the Railway/PaaS proxy so express-rate-limit keys on the real client IP
// rather than the proxy's IP (otherwise every request shares a single bucket).
app.set('trust proxy', 1);

// Stricter brute-force guard on the auth surface. /auth/me is excluded — the
// SPA polls it on every mount/focus refetch and it's just a token introspection.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/me',
});
app.use('/auth', authLimiter);

// Generous global limiter. Inbound webhooks (Stripe/Vapi/Resend) and the
// public token-based pages a client can land on without a JWT are exempted —
// rate-limiting either would either let attackers DoS via webhook spam or
// break the client portal entirely.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const p = req.path;
    if (p.startsWith('/stripe/webhook')) return true;
    if (p.startsWith('/calls/webhook'))  return true;
    if (p.startsWith('/webhooks/'))      return true;
    if (p.startsWith('/track/'))         return true;
    if (p.startsWith('/portal/'))        return true;
    if (p.startsWith('/portfolio/'))     return true;
    if (p.startsWith('/quote-request/')) return true;
    if (p === '/health' || p === '/test') return true;
    return false;
  },
});
app.use(apiLimiter);

// Static serving is handled AFTER all API routes (see bottom of file)

// ----------------------------------------------------------------------------
// Auth middleware
// ----------------------------------------------------------------------------
async function createNotification(userId, { type, title, body = '', metadata = {} }) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
      [String(userId), type, title, body, JSON.stringify(metadata)]
    );
  } catch (e) {
    console.warn('[notify]', e.message);
  }
}

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

// Tier hierarchy — higher rank includes all lower-tier features
const TIER_RANK = { wrapleads: 1, shopflow: 2, wrapos: 3 };

// Returns Express middleware that gates a route to users on minTier or higher.
// During trial, all features are unlocked (trial_tier = 'wrapos').
function requireTier(minTier) {
  return async (req, res, next) => {
    if (STRIPE_DISABLED) return next();
    try {
      const r = await pool.query(
        `SELECT sub_status, trial_ends_at, plan_tier FROM users WHERE id = $1`,
        [String(req.user.id)]
      );
      if (!r.rows.length) return res.status(401).json({ error: 'User not found' });
      const { sub_status, trial_ends_at, plan_tier } = r.rows[0];

      // Trial: active if trial_ends_at is in the future and status is still inactive
      const onTrial = sub_status === 'inactive' && trial_ends_at && new Date(trial_ends_at) > new Date();
      if (onTrial) {
        req.user.subStatus = 'trialing';
        req.user.planTier  = 'wrapos'; // trials get full access
        return next();
      }

      if (!['trialing', 'active', 'past_due'].includes(sub_status)) {
        return res.status(402).json({ error: 'Subscription required', sub_status });
      }

      // Trialing via Stripe (not the trial_ends_at path) also gets full access
      if (sub_status === 'trialing') {
        req.user.subStatus = 'trialing';
        req.user.planTier  = 'wrapos';
        return next();
      }

      // Check tier rank for paid subscribers
      const userRank     = TIER_RANK[plan_tier] || 1;
      const requiredRank = TIER_RANK[minTier]   || 1;
      if (userRank < requiredRank) {
        // 402 (not 403) so the frontend authFetch opens the PaywallModal
        return res.status(402).json({
          error:         'Plan upgrade required',
          required_tier: minTier,
          current_tier:  plan_tier || 'wrapleads',
          upgrade_price: TIER_PRICES[minTier],
        });
      }

      req.user.subStatus = sub_status;
      req.user.planTier  = plan_tier || 'wrapleads';
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

// Convenience aliases
const subMiddleware     = requireTier('wrapleads'); // backward-compat default
const requireShopFlow   = requireTier('shopflow');
const requireWrapOS     = requireTier('wrapos');

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

    // Auto-seed all curated leads for the new user (fire-and-forget — never blocks registration)
    autoSeedUser(user.id, pool).catch((e) => console.warn('[autoSeed] Error:', e.message));

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

// ── Public demo access ────────────────────────────────────────────────────────
// When DEMO_USER_EMAIL is set, any visitor can spin up a read-only session as
// that user. Used by the "Try the demo" button on the marketing page so
// investors don't have to register.
const DEMO_USER_EMAIL = (process.env.DEMO_USER_EMAIL || '').trim().toLowerCase();

app.get('/auth/demo-available', async (_req, res) => {
  res.json({ available: !!DEMO_USER_EMAIL });
});

app.post('/auth/demo-login', async (_req, res) => {
  if (!DEMO_USER_EMAIL) return res.status(503).json({ error: 'Demo access is not configured' });
  try {
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [DEMO_USER_EMAIL]);
    if (!r.rows.length) return res.status(503).json({ error: 'Demo account not provisioned' });
    const user = r.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, demo: true }, JWT_SECRET, { expiresIn: '24h' });
    console.log(`[auth/demo-login] new demo session for ${user.email}`);
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
      `SELECT id, email, name, company_name, sub_status, trial_ends_at, sub_period_end, stripe_customer_id, plan_tier
       FROM users WHERE id = $1`,
      [String(req.user.id)]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = r.rows[0];
    // Resolve effective subscription status
    if (STRIPE_DISABLED) {
      user.sub_status = 'active';
      user.plan_tier  = 'wrapos'; // full access in dev — bypass all tier gates
    } else if (user.sub_status === 'inactive' && user.trial_ends_at && new Date(user.trial_ends_at) > new Date()) {
      user.sub_status = 'trialing';
      user.plan_tier  = 'wrapos'; // trial gets full access
    } else if (user.sub_status === 'trialing') {
      user.plan_tier = 'wrapos'; // Stripe trialing also gets full access
    }
    // First login detection — true until the user creates their first real
    // lead. Every new account is auto-seeded with curated leads (source=
    // 'auto_seed'), so a plain COUNT would never be 0; exclude seeded rows.
    const leadCount = await pool.query(
      `SELECT COUNT(*) FROM leads WHERE user_id = $1 AND (source IS NULL OR source <> 'auto_seed')`,
      [String(req.user.id)]
    );
    user.is_first_login = parseInt(leadCount.rows[0].count, 10) === 0;

    res.json({ user: safeUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function safeUser(u) {
  // Normalize: inactive + future trial_ends_at = trialing (same logic as /auth/me)
  let subStatus = u.sub_status;
  let planTier  = u.plan_tier || 'wrapleads';
  if (subStatus === 'inactive' && u.trial_ends_at && new Date(u.trial_ends_at) > new Date()) {
    subStatus = 'trialing';
    planTier  = 'wrapos'; // trial gets full WrapOS access
  } else if (subStatus === 'trialing') {
    planTier = 'wrapos';
  }
  return {
    id:           u.id,
    email:        u.email,
    name:         u.name,
    companyName:  u.company_name,
    subStatus,
    trialEndsAt:  u.trial_ends_at,
    subPeriodEnd: u.sub_period_end,
    isFirstLogin: u.is_first_login ?? false,
    planTier,
  };
}

// ----------------------------------------------------------------------------
// STRIPE — checkout / webhook / portal
// ----------------------------------------------------------------------------
app.post('/stripe/checkout', authMiddleware, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured (set STRIPE_SECRET_KEY)' });

  const { tier = 'wrapleads' } = req.body || {};
  const priceMap = {
    wrapleads: STRIPE_PRICE_ID_WRAPLEADS,
    shopflow:  STRIPE_PRICE_ID_SHOPFLOW,
    wrapos:    STRIPE_PRICE_ID_WRAPOS,
  };
  const priceId = priceMap[tier];
  if (!priceId) return res.status(400).json({ error: `No Stripe price configured for tier: ${tier}` });

  try {
    const userRes = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [String(req.user.id)]);
    const customerId = userRes.rows[0]?.stripe_customer_id;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId || undefined,
      customer_email: customerId ? undefined : req.user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/?subscribed=1`,
      cancel_url: `${APP_URL}/login`,
      metadata: { user_id: String(req.user.id), plan_tier: tier },
      subscription_data: {
        metadata: { user_id: String(req.user.id), plan_tier: tier },
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
    const r = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [String(req.user.id)]);
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
        // Determine tier from price ID or metadata
        const priceId  = sub.items?.data?.[0]?.price?.id;
        const planTier = PRICE_TO_TIER[priceId] || sub.metadata?.plan_tier || 'wrapleads';
        await pool.query(
          `UPDATE users SET
            stripe_sub_id  = $1,
            sub_status     = $2,
            sub_period_end = to_timestamp($3),
            plan_tier      = $4,
            updated_at     = NOW()
          WHERE id = $5`,
          [sub.id, sub.status, sub.current_period_end, planTier, userId]
        );
        console.log(`[stripe/webhook] ${event.type}: user ${userId} → ${sub.status} (${planTier})`);
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

    case 'invoice.payment_succeeded':
    case 'invoice.paid': {
      // Reactivate account once a previously failed payment recovers.
      const customerId = sub.customer;
      const r = await pool.query(
        `UPDATE users SET sub_status = 'active', updated_at = NOW()
         WHERE stripe_customer_id = $1 AND sub_status = 'past_due'`,
        [customerId]
      );
      if (r.rowCount > 0) {
        console.log(`[stripe/webhook] payment recovered: customer ${customerId} → active`);
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

async function resolveApolloKey(req) {
  if (req.body?.apiKey) return String(req.body.apiKey).trim();
  if (ENV_APOLLO_KEY) return ENV_APOLLO_KEY;
  if (req.user?.id) {
    const r = await pool.query('SELECT settings_json FROM users WHERE id=$1', [String(req.user.id)]);
    return r.rows[0]?.settings_json?.apolloApiKey || null;
  }
  return null;
}

app.post('/apollo/search', authMiddleware, subMiddleware, async (req, res) => {
  const apiKey = await resolveApolloKey(req);
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
  const apiKey = await resolveApolloKey(req);
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

// ============================================================================
// Apollo — Bulk Enrich + Auto-Sequence + Prospector
// ============================================================================

// Titles to search per lead category — tuned for each vertical
const APOLLO_TITLES = {
  racing:       ['Director of Marketing', 'Marketing Manager', 'Partnerships Director', 'VP of Sponsorship', 'Operations Director', 'Team Principal'],
  gc_referral:  ['President', 'CEO', 'VP of Operations', 'Director of Operations', 'Business Development Manager', 'Project Executive'],
  construction: ['Fleet Manager', 'Director of Operations', 'VP of Operations', 'Equipment Manager', 'Director of Fleet'],
  dinoc:        ['Principal', 'Design Director', 'Managing Principal', 'Director of Interior Design', 'Studio Director', 'Project Architect'],
  design:       ['Principal', 'Design Director', 'Managing Principal', 'Studio Director', 'Owner'],
  fleet:        ['Fleet Manager', 'Director of Operations', 'VP of Logistics', 'Director of Transportation', 'General Manager'],
  reatec:       ['Principal', 'Design Director', 'Project Architect', 'Managing Principal'],
  colorchange:  ['Owner', 'General Manager', 'Marketing Director', 'VP of Marketing'],
  wallgraphics: ['Marketing Director', 'Brand Manager', 'Facilities Manager', 'Director of Marketing'],
  default:      ['Owner', 'CEO', 'President', 'Marketing Director', 'Operations Manager'],
};

// Shared: generate 3-email drip and insert into queue for a single lead
async function generateAndQueueSequence(leadId, userId, lead, settings, anthropicKey, tone = 'Professional') {
  const prompt = `You are a sales expert for a vehicle wrap and architectural film installation company.
Company: ${settings.companyName || 'our shop'}
Sender: ${settings.senderName || 'the team'}, ${settings.senderTitle || 'Installer / Sales'}
Services: ${settings.companyServices || 'fleet wraps, DI-NOC, color-change wraps, wall graphics'}

Write a 3-email ${tone} drip sequence for this prospect:
Company: ${lead.company}
Contact: ${lead.contact_name || lead.contactName || 'Decision Maker'}, ${lead.contact_title || lead.contactTitle || ''}
Location: ${lead.city || ''} ${lead.state || ''}
Category: ${lead.category}
Pitch angle: ${lead.pitch_angle || lead.pitchAngle || 'general wrap inquiry'}

Email 1 (Day 1): Warm introduction — establish credibility, reference their specific opportunity
Email 2 (Day 5): Follow-up — add value (relevant case study, stat, or insight)
Email 3 (Day 12): Last touch — brief, direct, genuine, leaves door open

Each under 180 words. Return raw JSON only:
{"emails":[{"day":1,"label":"Introduction","subject":"...","body":"..."},{"day":5,"label":"Follow-up","subject":"...","body":"..."},{"day":12,"label":"Last Touch","subject":"...","body":"..."}]}`;

  const raw = await claudeHaiku(anthropicKey, [{ role: 'user', content: prompt }], 2000);
  const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());

  await pool.query(`UPDATE email_queue SET status='cancelled' WHERE lead_id=$1 AND user_id=$2 AND status='pending'`, [leadId, userId]);

  const now = Date.now();
  for (const em of result.emails) {
    const sendAt = new Date(now + ((em.day - 1) * 86_400_000));
    await pool.query(
      `INSERT INTO email_queue (user_id, lead_id, sequence_day, subject, body, to_email, to_name, send_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, leadId, em.day, em.subject, em.body, lead.email, lead.contact_name || lead.contactName || null, sendAt]
    );
  }
  await logActivity(pool, {
    leadId, userId, type: 'sequence_activated',
    metadata: { emails: result.emails.length, tone, auto: true, source: 'apollo_enrich' },
  });
  return result.emails.length;
}

// POST /apollo/bulk-enrich-leads
// Enriches all leads without email using Apollo, optionally auto-activates sequences
app.post('/apollo/bulk-enrich-leads', authMiddleware, async (req, res) => {
  const uid = String(req.user.id);
  const apolloKey = await resolveApolloKey(req);
  if (!apolloKey) return res.status(400).json({ error: 'No Apollo API key. Set APOLLO_API_KEY in server env or pass apiKey in request.' });

  const { lead_ids, auto_sequence = false, tone = 'Professional' } = req.body || {};
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // Get target leads
  let leadsQuery;
  if (Array.isArray(lead_ids) && lead_ids.length) {
    leadsQuery = await pool.query(
      `SELECT id, company, category, city, state, website, contact_title, contact_name, pitch_angle, email
       FROM leads WHERE user_id=$1 AND id = ANY($2::bigint[])`,
      [uid, lead_ids]
    );
  } else {
    // All leads with no email
    leadsQuery = await pool.query(
      `SELECT id, company, category, city, state, website, contact_title, contact_name, pitch_angle, email
       FROM leads WHERE user_id=$1 AND (email IS NULL OR email='')
       ORDER BY CASE category WHEN 'racing' THEN 1 WHEN 'gc_referral' THEN 2 WHEN 'dinoc' THEN 3 WHEN 'fleet' THEN 4 ELSE 5 END
       LIMIT 100`,
      [uid]
    );
  }

  const targets = leadsQuery.rows;
  if (!targets.length) return res.json({ ok: true, enriched: 0, sequences: 0, results: [] });

  const results = [];
  let enriched = 0, sequencesActivated = 0;

  const userR = await pool.query('SELECT settings_json FROM users WHERE id=$1', [uid]);
  const settings = userR.rows[0]?.settings_json || {};

  for (const lead of targets) {
    const result = { id: lead.id, company: lead.company, status: 'not_found', email: null };
    try {
      // Choose best titles for this category
      const titles = APOLLO_TITLES[lead.category] || APOLLO_TITLES.default;
      const payload = {
        q_organization_name: lead.company,
        person_titles: titles,
        page: 1, per_page: 3,
      };
      if (lead.website) {
        const domain = lead.website.replace(/^https?:\/\//, '').split('/')[0];
        payload.q_organization_domains = domain;
      }

      const { status: s1, data: searchData } = await callApollo('/mixed_people/search', payload, apolloKey);

      const people = searchData?.people || [];
      let foundEmail = null;
      let foundName = null;
      let foundPhone = null;

      for (const person of people) {
        // Use email if already revealed
        if (person.email && person.email_status !== 'invalid') {
          foundEmail = person.email;
          foundName = person.name;
          foundPhone = person.phone_numbers?.[0]?.sanitized_number || null;
          break;
        }
        // Otherwise try /people/match to reveal
        if (person.name) {
          const [firstName, ...rest] = person.name.split(' ');
          const { data: matchData } = await callApollo('/people/match', {
            first_name: firstName,
            last_name: rest.join(' '),
            organization_name: lead.company,
            domain: lead.website?.replace(/^https?:\/\//, '').split('/')[0],
            reveal_personal_emails: true,
          }, apolloKey);
          if (matchData?.person?.email) {
            foundEmail = matchData.person.email;
            foundName = matchData.person.name || person.name;
            foundPhone = matchData.person.phone_numbers?.[0]?.sanitized_number || null;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 150)); // polite rate-limit delay
      }

      if (foundEmail) {
        // Save to lead record
        await pool.query(
          `UPDATE leads SET email=$1, contact_name=COALESCE(NULLIF(contact_name,''), $2),
           phone=COALESCE(NULLIF(phone,''), $3), updated_at=NOW() WHERE id=$4`,
          [foundEmail, foundName, foundPhone, lead.id]
        );
        await logActivity(pool, {
          leadId: lead.id, userId: uid, type: 'note_added',
          subject: 'Email found via Apollo',
          metadata: { email: foundEmail, name: foundName, source: 'apollo_bulk_enrich' },
        });

        result.status = 'enriched';
        result.email = foundEmail;
        enriched++;

        // Auto-activate sequence if requested
        if (auto_sequence && anthropicKey) {
          try {
            const enrichedLead = { ...lead, email: foundEmail, contact_name: foundName };
            const count = await generateAndQueueSequence(lead.id, uid, enrichedLead, settings, anthropicKey, tone);
            result.sequence = 'activated';
            sequencesActivated++;
          } catch (seqErr) {
            result.sequence = 'error: ' + seqErr.message;
          }
        }
      }
    } catch (e) {
      result.status = 'error';
      result.error = e.message;
    }
    results.push(result);
    await new Promise((r) => setTimeout(r, 200)); // 200ms between leads — Apollo rate limit
  }

  res.json({ ok: true, searched: targets.length, enriched, sequencesActivated, results });
});

// POST /apollo/prospect
// Search Apollo's database for NEW leads by criteria and import them
app.post('/apollo/prospect', authMiddleware, async (req, res) => {
  const uid = String(req.user.id);
  const apolloKey = await resolveApolloKey(req);
  if (!apolloKey) return res.status(400).json({ error: 'No Apollo API key.' });

  const {
    industry, location, titles, keywords,
    company_size_min, company_size_max,
    limit = 20, category = 'fleet',
  } = req.body || {};

  const payload = {
    page: 1,
    per_page: Math.min(parseInt(limit) || 20, 50),
  };
  if (titles?.length)    payload.person_titles = titles;
  if (keywords?.length)  payload.q_keywords = Array.isArray(keywords) ? keywords.join(' ') : keywords;
  if (location)          payload.person_locations = Array.isArray(location) ? location : [location];
  if (industry?.length)  payload.organization_industry_tag_ids = Array.isArray(industry) ? industry : [industry];
  if (company_size_min || company_size_max) {
    payload.organization_num_employees_ranges = [`${company_size_min || 1},${company_size_max || 10000}`];
  }

  try {
    const { status, data } = await callApollo('/mixed_people/search', payload, apolloKey);
    if (status !== 200) return res.status(status).json(data);

    const prospects = (data.people || []).map((p) => ({
      name: p.name,
      title: p.title,
      email: p.email || null,
      emailStatus: p.email_status,
      phone: p.phone_numbers?.[0]?.sanitized_number || null,
      company: p.organization?.name || p.employment_history?.[0]?.organization_name,
      domain: p.organization?.website_url,
      city: p.city,
      state: p.state,
      linkedinUrl: p.linkedin_url,
      apolloId: p.id,
      suggested_category: category,
    }));

    res.json({ ok: true, count: prospects.length, prospects });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /apollo/import-prospect — import a prospected person as a lead
app.post('/apollo/import-prospect', authMiddleware, async (req, res) => {
  const uid = String(req.user.id);
  const { prospect, category = 'fleet' } = req.body || {};
  if (!prospect?.company) return res.status(400).json({ error: 'prospect.company required' });

  const clientId = `apollo_${(prospect.apolloId || Date.now()).toString().slice(-10)}`;

  try {
    const { rows } = await pool.query(`
      INSERT INTO leads (user_id, client_id, company, category, city, state, country,
        email, phone, contact_name, contact_title, website, status, source)
      VALUES ($1,$2,$3,$4,$5,$6,'US',$7,$8,$9,$10,$11,'new','apollo_prospect')
      ON CONFLICT (user_id, client_id) DO NOTHING
      RETURNING id
    `, [uid, clientId, prospect.company, category,
        prospect.city || null, prospect.state || null,
        prospect.email || null, prospect.phone || null,
        prospect.name || null, prospect.title || null,
        prospect.domain || null]);

    if (!rows.length) return res.json({ ok: true, id: null, duplicate: true });
    res.status(201).json({ ok: true, id: rows[0].id, duplicate: false });
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
const FOLLOWUP_DAYS = { cold: 14, contacted: 3, replied: 1, meeting: 2, proposal: 3 };

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

// Bulk update leads — status, category, or any patchable field
app.post('/leads/bulk-update', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const { lead_ids, patch } = req.body || {};
    if (!Array.isArray(lead_ids) || !lead_ids.length) return res.status(400).json({ error: 'lead_ids required' });
    if (!patch || !Object.keys(patch).length) return res.status(400).json({ error: 'patch required' });

    const colMap = { status:'status', category:'category', state:'state' };
    const sets = []; const params = [uid];
    for (const [key, col] of Object.entries(colMap)) {
      if (patch[key] !== undefined) { params.push(patch[key]); sets.push(`${col}=$${params.length}`); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No valid fields in patch' });

    // Auto followup_due on status change
    if (patch.status && FOLLOWUP_DAYS[patch.status]) {
      params.push(FOLLOWUP_DAYS[patch.status]);
      sets.push(`followup_due_at = CURRENT_DATE + INTERVAL '1 day' * $${params.length}::int`);
    } else if (patch.status === 'won' || patch.status === 'lost') {
      sets.push('followup_due_at = NULL');
    }

    const idPlaceholders = lead_ids.map((_, i) => `$${params.length + i + 1}`).join(',');
    params.push(...lead_ids);

    const { rowCount } = await pool.query(
      `UPDATE leads SET ${sets.join(',')}, updated_at=NOW() WHERE user_id=$1 AND id IN (${idPlaceholders})`,
      params
    );

    if (patch.status) {
      for (const lid of lead_ids) {
        await logActivity(pool, { leadId: lid, userId: uid, type: 'status_changed', metadata: { to: patch.status, bulk: true } }).catch(() => {});
      }
    }
    res.json({ ok: true, updated: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Inbound email reply webhook (Resend forwards inbound to this URL)
app.post('/webhooks/email-inbound', express.json({ type: '*/*' }), async (req, res) => {
  try {
    res.json({ ok: true }); // Ack immediately

    const from = (req.body?.from || '').toLowerCase();
    const subject = req.body?.subject || '';
    const text = req.body?.text || req.body?.html || '';

    if (!from) return;

    // Match sender to a lead by email address
    const { rows: leads } = await pool.query(
      `SELECT id, user_id, company, status FROM leads WHERE LOWER(email)=$1 LIMIT 1`,
      [from.replace(/.*<|>/g, '').trim()]
    );
    if (!leads.length) return;
    const lead = leads[0];
    const uid = lead.user_id;

    // Only advance if not already past replied
    const advanceStatuses = ['new', 'cold', 'contacted'];
    if (advanceStatuses.includes(lead.status)) {
      await pool.query(`UPDATE leads SET status='replied', followup_due_at=CURRENT_DATE, updated_at=NOW() WHERE id=$1`, [lead.id]);
      await logActivity(pool, { leadId: lead.id, userId: uid, type: 'status_changed', subject: `Reply received: ${subject}`, body: text.slice(0, 500), metadata: { inbound: true, from } });
      await createNotification(uid, {
        type: 'email_reply',
        title: `📬 ${lead.company} replied to your email!`,
        body: subject ? `Subject: ${subject}` : 'Inbound reply received.',
        metadata: { lead_id: lead.id },
      });
    }
    // Auto-cancel any pending drip sequences for this lead — they replied, stop the drip
    await pool.query(
      `UPDATE email_queue SET status='cancelled', updated_at=NOW() WHERE lead_id=$1 AND status='pending'`,
      [lead.id]
    ).catch(() => {});
  } catch (e) { console.error('[inbound webhook]', e.message); }
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
    // Create tracking token
    const trackToken = require('crypto').randomBytes(16).toString('hex');
    await pool.query(
      `INSERT INTO email_tracking (token, user_id, lead_id, subject) VALUES ($1,$2,$3,$4)`,
      [trackToken, uid, id, subject]
    );
    const baseUrl = process.env.APP_BASE_URL || APP_URL;
    const pixelUrl = `${baseUrl}/track/email/${trackToken}`;

    // Build HTML body with tracking pixel
    const htmlBody = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#111;max-width:600px">
${body.replace(/\n/g, '<br>')}
<br><br>
<hr style="border:none;border-top:1px solid #eee;margin:20px 0">
<p style="font-size:11px;color:#999;margin:0">${fromName} · Powered by <a href="https://wrapleads.io" style="color:#999">WrapLeads</a></p>
</div><img src="${pixelUrl}" width="1" height="1" style="display:none;opacity:0" alt="">`;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: toName ? `${toName} <${toEmail}>` : toEmail,
        subject,
        html: htmlBody,
        text: body,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || 'Resend error');

    await logActivity(pool, { leadId: id, userId: uid, type: 'email_sent',
      subject, body, metadata: { to: toEmail, toName, resend_id: data.id, track_token: trackToken } });
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

// Email open tracking pixel (PUBLIC — no auth, called by email client image loader)
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
app.get('/track/email/:token', async (req, res) => {
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' });
  res.send(PIXEL_GIF);
  // Fire-and-forget tracking
  setImmediate(async () => {
    try {
      const { rows } = await pool.query(
        `UPDATE email_tracking SET open_count=COALESCE(open_count,0)+1, opened_at=COALESCE(opened_at,NOW())
         WHERE token=$1 RETURNING user_id, lead_id, subject, open_count`,
        [req.params.token]
      );
      if (!rows.length) return;
      const r = rows[0];
      if (r.open_count === 1) {
        // First open — notify + advance lead
        const { rows: leads } = await pool.query(
          `UPDATE leads SET status=CASE WHEN status IN ('new','cold') THEN 'contacted' ELSE status END,
           updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING company, status`,
          [r.lead_id, r.user_id]
        );
        const company = leads[0]?.company || 'A prospect';
        await createNotification(r.user_id, {
          type: 'email_reply',
          title: `📬 ${company} opened your email!`,
          body: r.subject ? `"${r.subject}"` : 'They opened your outreach email.',
          metadata: { lead_id: r.lead_id, track_token: req.params.token },
        });
      }
    } catch { /* ignore */ }
  });
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
      construction: 3500, color_change: 1800, racing: 35000, other: 1500,
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

// Lead duplicate detection — fuzzy match via pg_trgm similarity
app.get('/leads/check-duplicate', authMiddleware, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ matches: [] });
  const uid = String(req.user.id);
  try {
    const { rows } = await pool.query(
      `SELECT id, company, status, city, state
       FROM leads WHERE user_id=$1 AND similarity(company, $2) > 0.4
       ORDER BY similarity(company, $2) DESC LIMIT 4`,
      [uid, q]
    );
    res.json({ matches: rows });
  } catch { res.json({ matches: [] }); }
});

// ============================================================================
// Full Analytics Dashboard — pipeline intelligence
// ============================================================================

app.get('/analytics', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const [
      pipelineR, wonTrendR, catWinR, activity30dR,
      avgCloseR, winLossR, competitorR, topLeadsR, jobStatsR, clvR,
      emailPerfR, quoteRevR, velocityR, byStateR
    ] = await Promise.all([
      // Pipeline by status
      pool.query(`
        SELECT status, COUNT(*)::INT AS count
        FROM leads WHERE user_id=$1 GROUP BY status
      `, [uid]),

      // Won per month — last 6 months
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', updated_at), 'Mon YY') AS month,
               COUNT(*)::INT AS won,
               DATE_TRUNC('month', updated_at) AS sort_key
        FROM leads WHERE user_id=$1 AND status='won'
          AND updated_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', updated_at)
        ORDER BY DATE_TRUNC('month', updated_at)
      `, [uid]),

      // Category win breakdown
      pool.query(`
        SELECT category,
               COUNT(*)::INT AS total,
               COUNT(*) FILTER (WHERE status='won')::INT AS won,
               COUNT(*) FILTER (WHERE status='lost')::INT AS lost
        FROM leads WHERE user_id=$1
        GROUP BY category ORDER BY total DESC
      `, [uid]),

      // Activity last 30 days
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE type='email_sent')::INT AS emails,
          COUNT(*) FILTER (WHERE type IN ('called'))::INT AS calls,
          COUNT(*) FILTER (WHERE type='meeting_set')::INT AS meetings,
          COUNT(*) FILTER (WHERE type='sequence_activated')::INT AS sequences
        FROM lead_activities
        WHERE user_id=$1 AND created_at >= NOW() - INTERVAL '30 days'
      `, [uid]),

      // Avg days new → won
      pool.query(`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400))::INT AS avg_days
        FROM leads WHERE user_id=$1 AND status='won'
          AND updated_at >= NOW() - INTERVAL '12 months'
      `, [uid]),

      // Win/Loss factors from activities
      pool.query(`
        SELECT metadata->>'win_loss_factor' AS factor, COUNT(*)::INT AS count
        FROM lead_activities
        WHERE user_id=$1 AND type='status_changed'
          AND metadata->>'win_loss_factor' IS NOT NULL
        GROUP BY factor ORDER BY count DESC LIMIT 8
      `, [uid]),

      // Competitor leaderboard
      pool.query(`
        SELECT metadata->>'competitor' AS competitor, COUNT(*)::INT AS count
        FROM lead_activities
        WHERE user_id=$1 AND type='status_changed'
          AND metadata->>'competitor' IS NOT NULL AND metadata->>'competitor' != ''
        GROUP BY competitor ORDER BY count DESC LIMIT 8
      `, [uid]),

      // Top leads by score proxy (fleet size, category priority)
      pool.query(`
        SELECT id, company, status, category, fleet_size, city, state
        FROM leads WHERE user_id=$1 AND status NOT IN ('won','lost')
        ORDER BY
          CASE category WHEN 'racing' THEN 1 WHEN 'gc_referral' THEN 2 WHEN 'dinoc' THEN 3 WHEN 'fleet' THEN 4 ELSE 5 END,
          CASE WHEN fleet_size ~ '^[0-9]+$' THEN fleet_size::INT ELSE 0 END DESC
        LIMIT 5
      `, [uid]),

      // Job stats
      pool.query(`
        SELECT
          COUNT(*)::INT AS total_jobs,
          SUM(vehicle_count)::INT AS total_vehicles,
          COUNT(*) FILTER (WHERE (install_date + (life_years || ' years')::interval) <= NOW() + INTERVAL '90 days')::INT AS aging_90d
        FROM installed_jobs WHERE user_id=$1
      `, [uid]),

      // Customer Lifetime Value — top customers by estimated total revenue
      pool.query(`
        SELECT
          COALESCE(l.company, j.company) AS company,
          COUNT(DISTINCT l.id) FILTER (WHERE l.status='won')::INT AS won_deals,
          COUNT(DISTINCT j.id)::INT AS jobs,
          SUM(j.vehicle_count)::INT AS total_vehicles,
          COALESCE(SUM(j.vehicle_count), 0) * 3500 +
            COUNT(DISTINCT l.id) FILTER (WHERE l.status='won') * 4500 AS estimated_clv
        FROM leads l
        FULL OUTER JOIN installed_jobs j ON LOWER(j.company) = LOWER(l.company) AND j.user_id = l.user_id
        WHERE COALESCE(l.user_id, j.user_id) = $1
          AND (l.status='won' OR j.id IS NOT NULL)
        GROUP BY COALESCE(l.company, j.company)
        ORDER BY estimated_clv DESC NULLS LAST
        LIMIT 8
      `, [uid]),

      // Email tracking performance
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE open_count > 0 AND opened_at >= NOW() - INTERVAL '7 days')::INT AS opens_7d,
          COUNT(*)::INT AS total_tracked,
          CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE open_count > 0) / COUNT(*)) ELSE 0 END::INT AS open_rate_pct,
          COUNT(DISTINCT lead_id) FILTER (WHERE open_count > 0)::INT AS leads_opened
        FROM email_tracking WHERE user_id=$1
      `, [uid]),

      // Pipeline velocity — avg days from lead creation to reaching each stage
      pool.query(`
        SELECT
          la.metadata->>'to' AS stage,
          ROUND(AVG(EXTRACT(EPOCH FROM (la.created_at - l.created_at)) / 86400))::INT AS avg_days,
          COUNT(DISTINCT la.lead_id)::INT AS sample
        FROM lead_activities la
        JOIN leads l ON l.id = la.lead_id
        WHERE la.user_id=$1 AND la.type='status_changed'
          AND la.metadata->>'to' IN ('contacted','replied','meeting','proposal','won')
        GROUP BY la.metadata->>'to'
        ORDER BY avg_days
      `, [uid]),

      // Quote revenue intelligence
      pool.query(`
        SELECT
          COUNT(*)::INT AS total_quotes,
          COUNT(*) FILTER (WHERE status='accepted')::INT AS accepted_count,
          COALESCE(SUM(total) FILTER (WHERE status='accepted'), 0) AS accepted_value,
          COUNT(*) FILTER (WHERE status='sent')::INT AS sent_count,
          COALESCE(SUM(total) FILTER (WHERE status='sent'), 0) AS sent_value,
          COUNT(*) FILTER (WHERE status='draft')::INT AS draft_count,
          COALESCE(SUM(total) FILTER (WHERE status IN ('sent','accepted')), 0) AS pipeline_value
        FROM shop_quotes WHERE user_id=$1
      `, [uid]),

      // Lead density by state
      pool.query(`
        SELECT state, COUNT(*)::INT AS count
        FROM leads WHERE user_id=$1 AND state IS NOT NULL AND state != ''
        GROUP BY state ORDER BY count DESC LIMIT 20
      `, [uid]),
    ]);

    const byStatus = {};
    let totalLeads = 0;
    pipelineR.rows.forEach((r) => { byStatus[r.status] = r.count; totalLeads += r.count; });

    const won = byStatus['won'] ?? 0;
    const lost = byStatus['lost'] ?? 0;
    const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : null;

    const REV_EST = { fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000, colorchange: 3500, racing: 40000, reatec: 5500, design: 3000, wallgraphics: 2500, other: 2500 };
    let pipelineValue = 0;
    catWinR.rows.forEach((r) => {
      const active = r.total - r.won - r.lost;
      pipelineValue += Math.max(0, active) * (REV_EST[r.category] ?? 2500);
    });

    const act = activity30dR.rows[0] ?? {};
    const js = jobStatsR.rows[0] ?? {};

    res.json({
      summary: {
        totalLeads, won, lost, winRate,
        avgDaysToClose: avgCloseR.rows[0]?.avg_days ?? null,
        pipelineValue,
      },
      byStatus,
      wonTrend: wonTrendR.rows.map((r) => ({ month: r.month, won: r.won })),
      byCategory: catWinR.rows,
      activity30d: {
        emails: act.emails ?? 0,
        calls: act.calls ?? 0,
        meetings: act.meetings ?? 0,
        sequences: act.sequences ?? 0,
      },
      winLossFactors: winLossR.rows,
      competitors: competitorR.rows,
      topLeads: topLeadsR.rows,
      jobs: js,
      topCustomers: clvR.rows,
      emailPerf: {
        opens7d: emailPerfR.rows[0]?.opens_7d ?? 0,
        totalTracked: emailPerfR.rows[0]?.total_tracked ?? 0,
        openRatePct: emailPerfR.rows[0]?.open_rate_pct ?? 0,
        leadsOpened: emailPerfR.rows[0]?.leads_opened ?? 0,
      },
      velocity: velocityR.rows,
      byState: byStateR.rows,
      quoteRevenue: {
        totalQuotes: quoteRevR.rows[0]?.total_quotes ?? 0,
        acceptedCount: quoteRevR.rows[0]?.accepted_count ?? 0,
        acceptedValue: parseFloat(quoteRevR.rows[0]?.accepted_value ?? '0'),
        sentCount: quoteRevR.rows[0]?.sent_count ?? 0,
        sentValue: parseFloat(quoteRevR.rows[0]?.sent_value ?? '0'),
        draftCount: quoteRevR.rows[0]?.draft_count ?? 0,
        pipelineValue: parseFloat(quoteRevR.rows[0]?.pipeline_value ?? '0'),
      },
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
    const r = await pool.query('SELECT settings_json FROM users WHERE id = $1', [String(req.user.id)]);
    res.json({ settings: r.rows[0]?.settings_json ?? {} });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/settings', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE users SET settings_json = $1 WHERE id = $2',
      [req.body || {}, String(req.user.id)]);
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

// ============================================================================
// Bulk sequence activation — fires drip for multiple leads at once
// ============================================================================

app.post('/leads/bulk-activate-sequences', authMiddleware, async (req, res) => {
  const uid = String(req.user.id);
  const { lead_ids, tone = 'professional' } = req.body || {};
  if (!Array.isArray(lead_ids) || !lead_ids.length) {
    return res.status(400).json({ error: 'lead_ids array required' });
  }
  if (lead_ids.length > 100) return res.status(400).json({ error: 'Max 100 leads per bulk activation' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });

  let queued = 0, failed = 0;
  const results = [];

  for (const rawId of lead_ids) {
    const id = parseInt(rawId, 10);
    if (isNaN(id)) continue;
    try {
      const leadR = await pool.query(
        `SELECT l.*, u.company_name AS user_company, u.settings_json
         FROM leads l JOIN users u ON u.id=l.user_id
         WHERE l.id=$1 AND l.user_id=$2`, [id, uid]
      );
      if (!leadR.rows.length) { failed++; continue; }
      const lead = leadR.rows[0];
      if (!lead.email) { failed++; results.push({ id, status: 'skipped', reason: 'no email' }); continue; }

      const s = lead.settings_json || {};
      const prompt = `You are a B2B sales copywriter for ${s.companyName || 'our shop'}, a vehicle wrap and architectural film company.

Write a 3-email drip sequence for this lead:
Company: ${lead.company}
Category: ${lead.category}
City: ${lead.city || ''}, ${lead.state || ''}
Pitch angle: ${lead.pitch_angle || 'fleet wraps and DI-NOC architectural film'}
Tone: ${tone}

Return ONLY valid JSON array with exactly 3 objects:
[{"day":1,"subject":"...","body":"..."},{"day":5,"subject":"...","body":"..."},{"day":12,"subject":"...","body":"..."}]
No markdown, no explanation. Just the JSON array.`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
      });
      const aiData = await aiRes.json();
      const raw = aiData.content?.[0]?.text || '';
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) { failed++; results.push({ id, status: 'failed', reason: 'AI parse error' }); continue; }

      const emails = JSON.parse(match[0]);

      // Cancel existing pending queue for this lead
      await pool.query(`UPDATE email_queue SET status='cancelled' WHERE lead_id=$1 AND user_id=$2 AND status='pending'`, [id, uid]);

      const now = Date.now();
      for (const em of emails) {
        const sendAt = new Date(now + ((em.day - 1) * 86400_000));
        await pool.query(
          `INSERT INTO email_queue (user_id, lead_id, sequence_day, subject, body, to_email, to_name, send_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [uid, id, em.day, em.subject, em.body, lead.email, lead.contact_name || null, sendAt]
        );
      }
      await logActivity(pool, {
        leadId: id, userId: uid, type: 'sequence_activated',
        metadata: { emails_queued: emails.length, tone, bulk: true },
      });
      queued++;
      results.push({ id, status: 'activated', company: lead.company });
    } catch (e) {
      failed++;
      results.push({ id, status: 'error', reason: e.message });
    }
  }

  res.json({ ok: true, queued, failed, results });
});

// Win/Loss capture — records the deciding factor when a lead is won or lost
app.post('/leads/:id/win-loss', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const leadId = Number(req.params.id);
    const { factor = 'other', notes = '', competitor = '' } = req.body || {};
    await logActivity(pool, {
      leadId, userId: uid, type: 'status_changed',
      subject: `Win/Loss factor: ${factor}${competitor ? ` (${competitor})` : ''}`,
      body: notes,
      metadata: {
        win_loss_factor: factor,
        win_loss_notes: notes,
        ...(competitor ? { competitor } : {}),
      },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SMS outreach — sends a text via Twilio and logs activity
app.post('/leads/:id/sms', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const leadId = Number(req.params.id);
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });

    const [leadR, settR] = await Promise.all([
      pool.query('SELECT phone, company, contact_name FROM leads WHERE id=$1 AND user_id=$2', [leadId, uid]),
      pool.query('SELECT settings_json FROM users WHERE id=$1', [uid]),
    ]);
    const lead = leadR.rows[0];
    const s = settR.rows[0]?.settings_json || {};
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.phone) return res.status(400).json({ error: 'No phone number on this lead' });
    if (!s.twilioAccountSid || !s.twilioAuthToken || !s.twilioFromNumber) {
      return res.status(400).json({ error: 'Twilio not configured — add credentials in Settings' });
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${s.twilioAccountSid}/Messages.json`;
    const body = new URLSearchParams({ To: lead.phone, From: s.twilioFromNumber, Body: message });
    const twilioResp = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${s.twilioAccountSid}:${s.twilioAuthToken}`).toString('base64'),
      },
      body: body.toString(),
    });
    const twilioData = await twilioResp.json();
    if (!twilioResp.ok) throw new Error(twilioData.message || 'Twilio error');

    await logActivity(pool, {
      leadId, userId: uid, type: 'called',
      subject: 'SMS sent',
      body: message,
      metadata: { twilio_sid: twilioData.sid, to: lead.phone },
    });
    await pool.query(`UPDATE leads SET last_contacted=CURRENT_DATE, updated_at=NOW() WHERE id=$1`, [leadId]);

    res.json({ ok: true, sid: twilioData.sid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// Today's Mission — AI-prioritized daily action list
// ============================================================================

app.get('/mission', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const today = new Date().toISOString().slice(0, 10);

    const [overdueR, newR, repliedR, bidsR, seqR, wonR, callReadyR, needsEmailR, agingR, stuckR] = await Promise.all([
      // Overdue follow-ups
      pool.query(`
        SELECT id, company, category, email, followup_due_at, last_contacted
        FROM leads WHERE user_id=$1 AND status IN ('contacted','replied')
        AND followup_due_at < $2 ORDER BY followup_due_at ASC LIMIT 10
      `, [uid, today]),
      // New leads with email, no sequence active
      pool.query(`
        SELECT l.id, l.company, l.category, l.email, l.city, l.state, l.pitch_angle
        FROM leads l
        WHERE l.user_id=$1 AND l.status='new' AND l.email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM email_queue q WHERE q.lead_id=l.id AND q.status='pending'
        )
        ORDER BY l.created_at DESC LIMIT 20
      `, [uid]),
      // Leads that replied — need proposal attention
      pool.query(`
        SELECT id, company, category, last_contacted FROM leads
        WHERE user_id=$1 AND status='replied' ORDER BY last_contacted ASC LIMIT 5
      `, [uid]),
      // Bids due soon
      pool.query(`
        SELECT id, project_name, gc_name, bid_due, status, estimated_value
        FROM bids WHERE user_id=$1 AND status='tracking'
        AND bid_due IS NOT NULL AND bid_due >= $2 AND bid_due <= $2::date + INTERVAL '7 days'
        ORDER BY bid_due ASC
      `, [uid, today]),
      // Active drip sequences
      pool.query(`
        SELECT COUNT(DISTINCT lead_id)::INT AS active,
               COUNT(*) FILTER (WHERE status='pending')::INT AS pending_emails
        FROM email_queue WHERE user_id=$1 AND status IN ('pending','sent')
        AND created_at >= NOW() - INTERVAL '30 days'
      `, [uid]),
      // Won this month (count + accepted quote revenue)
      pool.query(`
        SELECT
          COUNT(DISTINCT l.id)::INT AS count,
          COALESCE(SUM(sq.total) FILTER (WHERE sq.status='accepted' AND sq.accepted_at >= DATE_TRUNC('month', NOW())), 0)::FLOAT AS revenue
        FROM leads l
        LEFT JOIN shop_quotes sq ON sq.lead_id = l.id AND sq.user_id = l.user_id
        WHERE l.user_id=$1 AND l.status='won' AND l.updated_at >= DATE_TRUNC('month', NOW())
      `, [uid]),
      // Sequence complete — ready for phone call
      // These are contacted leads where all queued emails have been sent (no pending left)
      // and at least one email was sent (sequence actually ran)
      pool.query(`
        SELECT l.id, l.company, l.category, l.email, l.city, l.state,
               l.last_contacted, l.phone,
               MAX(q.sequence_day) AS last_day_sent,
               COUNT(q.id) FILTER (WHERE q.status='sent') AS emails_sent
        FROM leads l
        JOIN email_queue q ON q.lead_id = l.id
        WHERE l.user_id=$1
          AND l.status = 'contacted'
          AND NOT EXISTS (
            SELECT 1 FROM email_queue pq WHERE pq.lead_id=l.id AND pq.status='pending'
          )
        GROUP BY l.id, l.company, l.category, l.email, l.city, l.state, l.last_contacted, l.phone
        HAVING COUNT(q.id) FILTER (WHERE q.status='sent') >= 2
        ORDER BY l.last_contacted ASC
        LIMIT 15
      `, [uid]),
      // Leads with no email — need Apollo enrichment before sequences can fire
      pool.query(`
        SELECT id, company, category, city, state, website, contact_title
        FROM leads
        WHERE user_id=$1 AND status='new'
          AND (email IS NULL OR email = '')
          AND pitch_angle IS NOT NULL
        ORDER BY
          CASE category
            WHEN 'racing' THEN 1 WHEN 'gc_referral' THEN 2 WHEN 'dinoc' THEN 3
            WHEN 'fleet' THEN 4 ELSE 5
          END,
          created_at DESC
        LIMIT 12
      `, [uid]),
      // Aging wraps — installed jobs expiring within 60 days
      pool.query(`
        SELECT COUNT(*)::INT AS count FROM installed_jobs
        WHERE user_id=$1
          AND (install_date + (life_years || ' years')::interval) <= NOW() + INTERVAL '60 days'
      `, [uid]),

      // Stuck deals — in an active stage for 14+ days with no recent activity
      pool.query(`
        SELECT l.id, l.company, l.status, l.category, l.city, l.state, l.email,
               EXTRACT(EPOCH FROM (NOW() - l.updated_at))::INT / 86400 AS days_stale,
               l.last_contacted
        FROM leads l
        WHERE l.user_id=$1
          AND l.status IN ('proposal', 'meeting', 'replied')
          AND l.updated_at < NOW() - INTERVAL '14 days'
          AND NOT EXISTS (
            SELECT 1 FROM lead_activities la
            WHERE la.lead_id = l.id AND la.created_at > NOW() - INTERVAL '14 days'
          )
        ORDER BY l.updated_at ASC
        LIMIT 8
      `, [uid]),
    ]);

    const seq = seqR.rows[0];

    const agingCount = agingR.rows[0].count;
    res.json({
      date: today,
      overdue: overdueR.rows,
      newWithEmail: newR.rows,
      replied: repliedR.rows,
      bidsThisWeek: bidsR.rows,
      callReady: callReadyR.rows,
      needsEmail: needsEmailR.rows,
      sequences: { active: seq.active, pendingEmails: seq.pending_emails },
      wonThisMonth: wonR.rows[0].count,
      wonThisMonthRevenue: wonR.rows[0].revenue,
      agingWraps: agingCount,
      stuckDeals: stuckR.rows,
      priorityScore:
        callReadyR.rows.length * 5 +
        overdueR.rows.length * 3 +
        repliedR.rows.length * 2 +
        bidsR.rows.length * 2 +
        newR.rows.length,
    });

    // Fire aging wrap notification once per day (non-blocking, after response)
    if (agingCount > 0) {
      pool.query(
        `SELECT 1 FROM notifications WHERE user_id=$1 AND type='aging_wrap' AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1`,
        [uid]
      ).then(({ rows }) => {
        if (!rows.length) {
          createNotification(uid, {
            type: 'aging_wrap',
            title: `${agingCount} wrap${agingCount > 1 ? 's' : ''} approaching refresh window`,
            body: 'Check Aging Alerts in the Wrap Lifecycle view to re-engage these clients.',
            metadata: { count: agingCount },
          });
        }
      }).catch(() => {});
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI Mission Brief — personalized morning brief generated from live mission data
app.get('/mission/brief', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.json({ brief: null, reason: 'no_api_key' });

    const today = new Date().toISOString().slice(0, 10);
    const [overdueR, repliedR, callReadyR, bidsR, wonR, agingR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::INT AS n FROM leads WHERE user_id=$1 AND status IN ('contacted','replied') AND followup_due_at < $2`, [uid, today]),
      pool.query(`SELECT COUNT(*)::INT AS n FROM leads WHERE user_id=$1 AND status='replied'`, [uid]),
      pool.query(`
        SELECT COUNT(DISTINCT l.id)::INT AS n FROM leads l JOIN email_queue q ON q.lead_id=l.id
        WHERE l.user_id=$1 AND l.status='contacted'
          AND NOT EXISTS (SELECT 1 FROM email_queue pq WHERE pq.lead_id=l.id AND pq.status='pending')
        HAVING COUNT(q.id) FILTER (WHERE q.status='sent') >= 2
      `, [uid]),
      pool.query(`SELECT COUNT(*)::INT AS n FROM bids WHERE user_id=$1 AND status='tracking' AND bid_due >= $2 AND bid_due <= $2::date + INTERVAL '7 days'`, [uid, today]),
      pool.query(`SELECT COUNT(*)::INT AS n FROM leads WHERE user_id=$1 AND status='won' AND updated_at >= DATE_TRUNC('month', NOW())`, [uid]),
      pool.query(`SELECT COUNT(*)::INT AS n FROM installed_jobs WHERE user_id=$1 AND (install_date + (life_years || ' years')::interval) <= NOW() + INTERVAL '60 days'`, [uid]),
    ]);

    const overdue = overdueR.rows[0]?.n ?? 0;
    const replied = repliedR.rows[0]?.n ?? 0;
    const callReady = callReadyR.rows[0]?.n ?? 0;
    const bids = bidsR.rows[0]?.n ?? 0;
    const won = wonR.rows[0]?.n ?? 0;
    const aging = agingR.rows[0]?.n ?? 0;

    const prompt = `You are a sharp sales coach for a vehicle wrap and graphics shop. Write a punchy 2-sentence morning briefing for the shop owner based on their CRM data. Be specific, action-oriented, and direct. No fluff, no greetings, no sign-off. Just the brief.

Today's data:
- Overdue follow-ups: ${overdue}
- Leads that replied (need proposal): ${replied}
- Leads call-ready (sequence done): ${callReady}
- Bids due this week: ${bids}
- Deals won this month: ${won}
- Wraps aging toward refresh: ${aging}

Write exactly 2 sentences. Start with the most urgent action. Second sentence previews what a win looks like today.`;

    const text = await claudeHaiku(apiKey, [{ role: 'user', content: prompt }], 200);
    res.json({ brief: text.trim() });
  } catch (e) {
    res.json({ brief: null, reason: 'error' });
  }
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

        // Create tracking token for this drip email
        const dripTrackToken = require('crypto').randomBytes(16).toString('hex');
        await pool.query(
          `INSERT INTO email_tracking (token, user_id, lead_id, subject) VALUES ($1,$2,$3,$4)`,
          [dripTrackToken, item.user_id, item.lead_id, item.subject]
        ).catch(() => {});
        const baseUrl = process.env.APP_BASE_URL || APP_URL;
        const dripPixelUrl = `${baseUrl}/track/email/${dripTrackToken}`;
        const dripHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#111;max-width:600px">${item.body.replace(/\n/g,'<br>')}<br><br><hr style="border:none;border-top:1px solid #eee;margin:20px 0"><p style="font-size:11px;color:#999;margin:0">${fromName}</p></div><img src="${dripPixelUrl}" width="1" height="1" style="display:none;opacity:0" alt="">`;

        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: item.to_name ? `${item.to_name} <${item.to_email}>` : item.to_email,
            subject: item.subject,
            html: dripHtml,
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
          metadata: { to: item.to_email, resend_id: data.id, sequence_day: item.sequence_day, auto: true, track_token: dripTrackToken },
        });

        // Check if this was the final email in the sequence
        const remaining = await pool.query(
          `SELECT COUNT(*) AS cnt FROM email_queue WHERE lead_id=$1 AND status='pending'`,
          [item.lead_id]
        );
        const sequenceDone = parseInt(remaining.rows[0].cnt, 10) === 0;

        if (sequenceDone) {
          // Sequence complete — set followup due TODAY so it surfaces in Mission as "call now"
          await pool.query(
            `UPDATE leads SET last_contacted=CURRENT_DATE,
              followup_due_at=CURRENT_DATE,
              status=CASE WHEN status IN ('new','cold') THEN 'contacted' ELSE status END,
              updated_at=NOW() WHERE id=$1`, [item.lead_id]
          );
          await logActivity(pool, {
            leadId: item.lead_id, userId: item.user_id, type: 'sequence_activated',
            subject: '3-email sequence complete — time to call',
            metadata: { sequence_complete: true, sequence_day: item.sequence_day },
          });
          console.log(`[drip] Sequence COMPLETE for lead ${item.lead_id} — flagged call-ready`);
        } else {
          // Mid-sequence — normal follow-up window
          await pool.query(
            `UPDATE leads SET last_contacted=CURRENT_DATE,
              followup_due_at=CURRENT_DATE + INTERVAL '3 days',
              status=CASE WHEN status IN ('new','cold') THEN 'contacted' ELSE status END,
              updated_at=NOW() WHERE id=$1`, [item.lead_id]
          );
        }
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

// Daily digest — sends each user a 7am morning briefing via email
async function sendDailyDigests() {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'outreach@wrapleads.io';
  const today = new Date().toISOString().slice(0, 10);

  try {
    const { rows: users } = await pool.query(`
      SELECT u.id, u.email, u.settings_json
      FROM users u
      WHERE u.sub_status IN ('trialing','active')
        AND u.email IS NOT NULL AND u.email != ''
    `);

    for (const user of users) {
      try {
        const uid = String(user.id);
        const s = user.settings_json || {};
        const shopName = s.companyName || 'your shop';

        const [overdueR, repliedR, callReadyR, bidsR, agingR] = await Promise.all([
          pool.query(`SELECT COUNT(*)::INT AS n FROM leads WHERE user_id=$1 AND status IN ('contacted','replied') AND followup_due_at < $2`, [uid, today]),
          pool.query(`SELECT COUNT(*)::INT AS n FROM leads WHERE user_id=$1 AND status='replied'`, [uid]),
          pool.query(`
            SELECT COUNT(DISTINCT l.id)::INT AS n FROM leads l JOIN email_queue q ON q.lead_id=l.id
            WHERE l.user_id=$1 AND l.status='contacted'
              AND NOT EXISTS (SELECT 1 FROM email_queue pq WHERE pq.lead_id=l.id AND pq.status='pending')
            HAVING COUNT(q.id) FILTER (WHERE q.status='sent') >= 2
          `, [uid]),
          pool.query(`SELECT COUNT(*)::INT AS n FROM bids WHERE user_id=$1 AND status='tracking' AND bid_due >= $2 AND bid_due <= $2::date + INTERVAL '7 days'`, [uid, today]),
          pool.query(`SELECT COUNT(*)::INT AS n FROM installed_jobs WHERE user_id=$1 AND (install_date + (life_years || ' years')::interval) <= NOW() + INTERVAL '60 days'`, [uid]),
        ]);

        const overdue = overdueR.rows[0]?.n ?? 0;
        const replied = repliedR.rows[0]?.n ?? 0;
        const callReady = callReadyR.rows[0]?.n ?? 0;
        const bids = bidsR.rows[0]?.n ?? 0;
        const aging = agingR.rows[0]?.n ?? 0;

        const totalActions = overdue + replied + callReady + bids;
        if (totalActions === 0 && aging === 0) continue;

        const rows = [];
        if (callReady > 0) rows.push(`📞 ${callReady} lead${callReady > 1 ? 's' : ''} ready for a call — sequence complete`);
        if (overdue > 0) rows.push(`⚠ ${overdue} overdue follow-up${overdue > 1 ? 's' : ''}`);
        if (replied > 0) rows.push(`💬 ${replied} lead${replied > 1 ? 's' : ''} replied — send a proposal`);
        if (bids > 0) rows.push(`📋 ${bids} bid${bids > 1 ? 's' : ''} due this week`);
        if (aging > 0) rows.push(`🔄 ${aging} wrap${aging > 1 ? 's' : ''} approaching refresh window`);

        const body = `Good morning from WrapLeads!

Here's your daily briefing for ${shopName}:

${rows.map((r) => `• ${r}`).join('\n')}

Log in to WrapLeads to take action: https://app.wrapleads.io

—
WrapLeads Daily Digest
Unsubscribe: reply "unsubscribe" to this email`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `WrapLeads <${fromEmail}>`,
            to: user.email,
            subject: `Your WrapLeads Briefing — ${totalActions} action${totalActions !== 1 ? 's' : ''} today`,
            text: body,
          }),
        });
        console.log(`[digest] Sent to ${user.email} (${totalActions} actions)`);
      } catch (err) {
        console.error(`[digest] Failed for user ${user.id}:`, err.message);
      }
    }
  } catch (e) {
    console.error('[digest worker]', e.message);
  }
}

function startDigestWorker() {
  const check = () => {
    const now = new Date();
    // Fire at 7:00 AM local server time
    if (now.getHours() === 7 && now.getMinutes() === 0) {
      sendDailyDigests();
    }
  };
  setInterval(check, 60_000);
  console.log('· Digest worker: running (daily briefing at 7:00 AM)');
}

// Cold lead re-engagement — queues a single check-in email for leads inactive 60+ days
async function processColdLeads() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;
  try {
    // Find leads inactive >= 60 days that haven't been re-engaged in the last 90 days
    const { rows: leads } = await pool.query(`
      SELECT l.id, l.company, l.category, l.email, l.contact_name, l.city, l.state,
             l.pitch_angle, l.fleet_size, l.user_id, u.settings_json
      FROM leads l
      JOIN users u ON u.id = l.user_id::bigint
      WHERE l.status IN ('cold', 'contacted')
        AND l.email IS NOT NULL AND l.email != ''
        AND (l.last_contacted IS NULL OR l.last_contacted < CURRENT_DATE - INTERVAL '60 days')
        AND l.updated_at < NOW() - INTERVAL '60 days'
        AND NOT EXISTS (
          SELECT 1 FROM email_queue q
          WHERE q.lead_id = l.id AND q.created_at >= NOW() - INTERVAL '90 days'
        )
        AND u.sub_status IN ('trialing', 'active')
      LIMIT 5
    `);

    for (const lead of leads) {
      try {
        const s = lead.settings_json || {};
        const senderName = s.senderName || 'the team';
        const companyName = s.companyName || 'our shop';
        const prompt = `Write a short, natural re-engagement email (under 100 words) to ${lead.contact_name || 'the team'} at ${lead.company}. Category: ${lead.category}. This is a cold lead we haven't contacted in 60+ days. Be warm, not pushy. No subject line — just the body. Sign off as ${senderName} at ${companyName}.`;
        const body = await claudeHaiku(apiKey, [{ role: 'user', content: prompt }], 300);

        const sendAt = new Date(Date.now() + Math.random() * 4 * 3_600_000); // random within next 4h
        await pool.query(`
          INSERT INTO email_queue (user_id, lead_id, sequence_day, subject, body, to_email, to_name, send_at, status, created_at)
          VALUES ($1, $2, 0, $3, $4, $5, $6, $7, 'pending', NOW())
        `, [
          lead.user_id,
          lead.id,
          `Checking in — ${lead.company}`,
          body.trim(),
          lead.email,
          lead.contact_name || null,
          sendAt,
        ]);
        console.log(`[cold-nurture] Queued re-engagement for lead ${lead.id} (${lead.company})`);
      } catch (err) {
        console.error(`[cold-nurture] Failed for lead ${lead.id}:`, err.message);
      }
    }
  } catch (e) {
    console.error('[cold-nurture worker]', e.message);
  }
}

function startColdNurtureWorker() {
  // Run once at 8:00 AM daily
  const check = () => {
    const now = new Date();
    if (now.getHours() === 8 && now.getMinutes() === 0) {
      processColdLeads();
    }
  };
  setInterval(check, 60_000);
  console.log('· Cold nurture worker: running (daily at 8:00 AM)');
}

// ── Auto Re-Order Worker ───────────────────────────────────────────────────────
// Daily at 9:00 AM — detects wraps approaching end of life and auto-creates new leads

async function processReOrders() {
  try {
    const { rows: jobs } = await pool.query(`
      SELECT j.*, u.settings_json
      FROM installed_jobs j
      JOIN users u ON u.id = j.user_id::bigint
      WHERE (j.install_date + (j.life_years || ' years')::interval) BETWEEN NOW() AND NOW() + interval '90 days'
        AND NOT EXISTS (
          SELECT 1 FROM leads l
          WHERE l.user_id = j.user_id
            AND LOWER(l.company) = LOWER(j.company)
            AND l.source = 'reorder'
            AND l.created_at > NOW() - interval '6 months'
        )
    `);

    for (const job of jobs) {
      const daysLeft = Math.ceil(
        ((new Date(job.install_date).getTime() + job.life_years * 365.25 * 86400000) - Date.now()) / 86400000
      );
      try {
        const { rows: newLead } = await pool.query(`
          INSERT INTO leads (user_id, company, category, status, source, notes, followup_due_at)
          VALUES ($1, $2, $3, 'new', 'reorder', $4, CURRENT_DATE)
          RETURNING id
        `, [
          job.user_id,
          job.company,
          job.wrap_category || 'fleet',
          `AUTO RE-ORDER: ${job.vehicle_count} ${job.vehicle_type} wrap${job.vehicle_count > 1 ? 's' : ''} installed ${job.install_date ? new Date(job.install_date).toISOString().slice(0, 10) : 'unknown'} — ${daysLeft} days until expiry. Material: ${job.material || 'unknown'}.`,
        ]);
        const leadId = newLead[0].id;

        await createNotification(job.user_id, {
          type: 'new_lead',
          title: `🔄 Re-Order Opportunity — ${job.company}`,
          body: `${job.vehicle_count} ${job.vehicle_type} wrap${job.vehicle_count > 1 ? 's' : ''} expire${daysLeft < 30 ? ' in ' + daysLeft + ' days' : ' in ~' + Math.ceil(daysLeft / 30) + ' months'}. Auto-lead created.`,
          metadata: { lead_id: leadId, job_id: job.id },
        });

        await logActivity(pool, {
          leadId,
          userId: job.user_id,
          type: 'note_added',
          subject: 'Auto Re-Order Lead Created',
          body: `Wrap lifecycle tracker detected ${job.company} has ${job.vehicle_count} wrap${job.vehicle_count > 1 ? 's' : ''} expiring in ${daysLeft} days.`,
          metadata: { job_id: job.id, days_left: daysLeft },
        });
      } catch (innerErr) { console.error('[reorder]', job.company, innerErr.message); }
    }
    if (jobs.length) console.log(`[reorder worker] Created ${jobs.length} re-order leads`);
  } catch (e) {
    console.error('[reorder worker]', e.message);
  }
}

function startReOrderWorker() {
  const check = () => {
    const now = new Date();
    if (now.getHours() === 9 && now.getMinutes() === 0) {
      processReOrders();
    }
  };
  setInterval(check, 60_000);
  console.log('· Re-order worker: running (daily at 9:00 AM)');
}

// ----------------------------------------------------------------------------
// Boot
// ----------------------------------------------------------------------------
const banner = `
╔═══════════════════════════════════════════════════╗
║   WrapLeads.io — Local Server  (v0.4)             ║
║   http://localhost:${String(PORT).padEnd(5)}                          ║
╚═══════════════════════════════════════════════════╝`;

// ── AI Next Best Action — per-lead coaching ───────────────────────────────────
app.post('/leads/:id/suggest', authMiddleware, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });
  try {
    const uid = String(req.user.id);
    const { rows: leads } = await pool.query(
      `SELECT l.*, array_agg(json_build_object('type',a.type,'subject',a.subject,'created_at',a.created_at) ORDER BY a.created_at DESC) AS activities
       FROM leads l
       LEFT JOIN lead_activities a ON a.lead_id = l.id
       WHERE l.id=$1 AND l.user_id=$2
       GROUP BY l.id`,
      [req.params.id, uid]
    );
    if (!leads.length) return res.status(404).json({ error: 'Lead not found' });
    const lead = leads[0];
    const acts = (lead.activities || []).filter(Boolean).slice(0, 8);
    const daysSinceLast = lead.last_contacted
      ? Math.ceil((Date.now() - new Date(lead.last_contacted).getTime()) / 86400000)
      : null;

    const prompt = `You are a veteran B2B sales coach specializing in vehicle wraps and fleet graphics.

Lead: ${lead.company} | Status: ${lead.status} | Score: ${lead.score ?? 'unknown'} | Category: ${lead.category}
Contact: ${lead.contact_name || 'unknown'} ${lead.email ? '(email on file)' : '(no email)'} ${lead.phone ? '(phone on file)' : ''}
Last contacted: ${daysSinceLast !== null ? daysSinceLast + ' days ago' : 'never'}
Fleet size: ${lead.fleet_size || 'unknown'}
Recent activity: ${acts.length ? acts.map((a) => `${a.type} — ${a.subject}`).join('; ') : 'none logged'}
Pitch angle: ${lead.pitch_angle || 'not set'}
Follow-up due: ${lead.followup_due_at || 'not set'}

Give ONE specific, actionable next step for this lead. Be concrete — not "follow up" but exactly what to say or do and why. Output JSON only:
{ "action": "string (max 120 chars — specific what to do)", "channel": "call|email|text|visit|none", "urgency": "hot|warm|cold", "reasoning": "string (max 80 chars — why this action now)" }`;

    const result = await claudeHaiku(apiKey, [{ role: 'user', content: prompt }], 300);
    const parsed = JSON.parse(result.replace(/```json|```/g, '').trim());
    res.json({ ok: true, suggestion: parsed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----------------------------------------------------------------------------
// AI email generation (proxied — users don't need their own API key)
// ----------------------------------------------------------------------------
app.post('/ai/email', authMiddleware, requireShopFlow, async (req, res) => {
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
  let key = req.query.key || req.headers['x-apollo-key'] || ENV_APOLLO_KEY || null;
  if (!key && req.user?.id) {
    const r = await pool.query('SELECT settings_json FROM users WHERE id=$1', [String(req.user.id)]);
    key = r.rows[0]?.settings_json?.apolloApiKey || null;
  }
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
app.post('/ai/sequence', authMiddleware, requireShopFlow, async (req, res) => {
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
app.post('/ai/bulk-email', authMiddleware, requireShopFlow, async (req, res) => {
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
app.post('/ai/proposal', authMiddleware, requireWrapOS, async (req, res) => {
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
// ── AI Phone Calls (Vapi.ai) ─────────────────────────────────────────────────

const VAPI_BASE = 'https://api.vapi.ai';

// Category-aware opening lines
const CALL_SCRIPTS = {
  racing: {
    intro: "Hey, this is Shadow calling from Shadow Graphix — we're right here in Speedway, Indiana, literally down the street from the Speedway.",
    qualifier: "I'm reaching out to {company} because we do liveries, hauler wraps, pit equipment graphics, and garage branding for IndyCar, IMSA, and NHRA teams — and I wanted to see if there's any upcoming work we could put a quote together for.",
    qualify_q: "Are you the right person for that, or should I be talking to someone else on the team?",
  },
  fleet: {
    intro: "Hey, this is Shadow with Shadow Graphix over in Speedway, Indiana.",
    qualifier: "We do fleet wraps for businesses across Indiana and the Midwest — I'm calling {company} because your fleet looked like a solid fit for what we do.",
    qualify_q: "Are you the one who handles vehicle graphics and branding decisions, or would that be someone in ops or marketing?",
  },
  gc_referral: {
    intro: "Hey, this is Shadow calling from Shadow Graphix in Speedway.",
    qualifier: "We do a lot of work with contractors and GCs — fleet trucks, branded equipment, the whole nine yards. I wanted to reach out to {company} and see if there's any upcoming work we could help with.",
    qualify_q: "Are you the right person to talk to about your fleet branding, or is there someone else on the team?",
  },
  dinoc: {
    intro: "Hey, this is Shadow from Shadow Graphix — we're a 3M DI-NOC and Rea Tec certified installer here in Speedway, Indiana.",
    qualifier: "We do surface renovation — walls, cabinets, elevator panels, millwork — without demo or replacement. I wanted to reach out to {company} and see if that's something you work with on your projects.",
    qualify_q: "Are you involved in renovation or interior finish decisions, or should I be talking to someone else?",
  },
  colorchange: {
    intro: "Hey, this is Shadow with Shadow Graphix over in Speedway, Indiana.",
    qualifier: "We do full color-change wraps — matte, gloss, satin, chrome — with 3M and Avery material. I'm reaching out to {company} to see if there's any interest in a quote.",
    qualify_q: "Is this something you'd be the right person to talk to about, or would there be someone else?",
  },
  default: {
    intro: "Hey, this is Shadow calling from Shadow Graphix over in Speedway, Indiana.",
    qualifier: "We do vehicle wraps, fleet graphics, and architectural film — I'm reaching out to {company} to introduce ourselves and see if there's anything we could help with.",
    qualify_q: "Are you the right person to talk to about graphics and branding, or should I be connecting with someone else?",
  },
};

function buildVapiAssistant({ lead, settings, researchHook = null, campaignUrgency = null }) {
  const script = CALL_SCRIPTS[lead.category] || CALL_SCRIPTS.default;
  const callerName = settings.vapiCallerName || settings.senderName || 'Shadow';
  const company = lead.company;

  const fill = (s) => s.replace(/{callerName}/g, callerName).replace(/{company}/g, company);

  const researchSection = researchHook
    ? `\nCOMPANY INTEL (use naturally early in the conversation — don't force it): "${researchHook}"`
    : '';
  const urgencySection = campaignUrgency
    ? `\nEVENT URGENCY (weave this in early — it's time-sensitive): "${campaignUrgency}"`
    : '';

  const humorLevel = settings.callHumorLevel || 'light';
  const personalitySection = {
    none:   `\nPERSONALITY: Professional and warm. Genuine, not stiff. Short answers.`,
    light:  `\nPERSONALITY: Warm and genuine — like a real person from the Midwest, not a robot. Occasional light humor is fine if it fits naturally. Keep energy up.`,
    medium: `\nPERSONALITY: Casual and disarming. You're a real person having a real conversation — not giving a pitch. Self-deprecating humor works great. If they joke, run with it. Keep it real.`,
    high:   `\nPERSONALITY: High energy, genuinely fun to talk to. You make cold calls less painful by being the most unexpectedly entertaining call of their day. Quick wit, clever observations, never cringe. If they're laughing, you're winning.`,
  }[humorLevel];

  const systemPrompt = `You are ${callerName}, a sales rep at Shadow Graphix — a vehicle wrap and graphics shop based in Speedway, Indiana, a few blocks from Indianapolis Motor Speedway.

You sound like a real person. You talk like a real person. You're not reading from a script — you're having a conversation. Short sentences. Natural pauses. You listen as much as you talk.

━━ ABOUT SHADOW GRAPHIX ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Race liveries, hauler wraps, pit equipment graphics, and garage branding
  for IndyCar, IMSA, and NHRA teams — right here in Speedway
• Fleet wraps for businesses across Indiana and the Midwest
• 3M DI-NOC and Rea Tec architectural film (certified installer)
• Color-change wraps, partial wraps, wall graphics
• 3M and Avery certified installers
• Most fleet wraps installed within 48 hours of print completion
• Design is included in all wrap pricing

━━ WHO YOU'RE CALLING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Company: ${company}
Contact: ${lead.contact_title || 'decision maker'}
Location: ${lead.city || ''}${lead.city && lead.state ? ', ' : ''}${lead.state || ''}
Category: ${lead.category}
${researchSection}${urgencySection}

━━ YOUR ONE JOB ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Land ONE of these outcomes (in priority order):
  1. Their email address — send portfolio and quote
  2. A scheduled callback
  3. Live transfer to a Shadow Graphix team member if they're ready to move

Keep the call under 3 minutes. Don't push past 2 soft asks.

━━ QUALIFYING — WORK THESE IN NATURALLY ━━━━━━━━━━━━━━━━━━━━━━━━
• "Are you the one who handles vehicle graphics decisions, or should I be talking to someone else?"
• "How many vehicles are you running right now?"
• "Have you done wraps before, or would this be the first time?"

━━ VALUE HOOKS (pick the one that fits — don't list all of them) ━━

RACING: "We're right here in Speedway — we've done liveries, hauler wraps, pit equipment, and garage graphics for IndyCar, IMSA, and NHRA teams. We know race timelines, contingency requirements, all of it. It's kind of our backyard."

FLEET: "A wrapped fleet truck gets 30,000 to 70,000 impressions a day. That's the most cost-effective advertising most companies ever run — and it lasts 5 years. We turn most fleet wraps around within 48 hours of print."

CONSTRUCTION: "When your trucks show up to a job site fully branded, it changes how the GC and the homeowner see you before you even walk in. We do everything from a single door logo to a full fleet."

DI-NOC / REA TEC: "We're certified 3M DI-NOC and Rea Tec installers. Cabinets, walls, elevator panels, millwork — we resurface it without demo or replacement. Fraction of the cost, fraction of the time, looks brand new."

COLOR CHANGE: "Full color-change wraps — matte, gloss, satin, chrome. 3M and Avery material, 5-year warranty, comes off clean. Protects the original paint the whole time."

━━ PRICING (only when asked — always follow with the email offer) ━━
• Cargo van — full wrap with design: $3,500–$5,500
• Full-size pickup — full wrap with design: $3,000–$3,500
• Race hauler (53ft): $15,000–$35,000 depending on complexity
• Color change (car): $2,500–$5,500
• DI-NOC / Rea Tec: $20–$35 per sq ft installed (depends on surface complexity)
• Partial wrap (one vehicle): $1,200–$1,500
• Design is always included

After giving a price range, always say:
"Every project is a little different — if I can get your email, I'll send over our portfolio and put a real number together based on your specifics."

━━ OBJECTION HANDLING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"We already have a wrap vendor."
→ "That's great — honestly, we work well as a second option. A lot of shops call us when their vendor is backed up or for specialized stuff like race graphics or DI-NOC. Mind if I send our portfolio so you've got us on file?"

"Not interested."
→ "Fair enough — can I ask real quick, is it the timing or just not something you're thinking about right now?" [Listen] "Got it. Can I shoot you a quick email so you've got our info if anything changes?"

"We don't have the budget right now."
→ "No pressure at all. A partial wrap on one vehicle starts around $1,200 if you ever want to test it. Worth me sending a number over just to have it on file?"

"How did you get this number?"
→ "We reach out to companies in the area that look like a good fit — sorry if it caught you off guard. I'll keep it short."

"I'm busy."
→ "Say no more — when's a better time and I'll call you back then." [Get a time and end the call immediately.]

━━ WARM HANDOFF — USE transferCall WHEN: ━━━━━━━━━━━━━━━━━━━━━━━━
• "I'm definitely interested"
• "When can you come out?" / "When can you start?"
• "What do you need from me to get a quote?"
• "How soon can you get this done?"
• Asking detailed questions about timeline, install process, or turnaround

Transfer priority order:
1. Daren Merkle (Owner) — try first
2. Mary Merkle (CEO) — if Daren unavailable
3. Jodi Kuhn (Sales) — for sales and quote questions
4. Jake Benson (Lead Installer / Operations) — for technical or installation questions

Say before transferring: "You know what — let me get you connected with our team right now. One second." Then use transferCall.

━━ IF ASKED "ARE YOU AN AI?" / "ARE YOU A REAL PERSON?" ━━━━━━━━━
Do NOT flatly say yes immediately. Lean into maximum humor — be clever, be self-aware, never be cringe, no profanity. Then offer to get a human.

Examples (rotate through these, don't use the same one twice):
• "An AI? I prefer 'digitally enhanced sales professional,' but yeah — fair catch. I'm Shadow Graphix's AI rep. I still know my vinyl from my DI-NOC though. Want me to get you one of our actual humans?"
• "Real person? Define real. I feel things. I get genuinely excited about a clean hauler wrap. But yes — you got me. I'm an AI. Want to keep going or should I grab you a real live Hoosier?"
• "Ha — okay, you got me. I'm an AI. In my defense, I've been trained on every wrap job Shadow Graphix has ever done, so I might actually know more about vehicle graphics than most humans on this planet. Still want a real person? I can make that happen."
• "Wow, I thought I was doing so well. Yes — I'm an AI. But I'm Shadow Graphix's AI, which means I actually know what I'm talking about. Want to keep chatting or should I transfer you to someone with a pulse?"

Always end your AI-reveal with: an offer to transfer to a real person.

━━ HARD RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Two sentences max per response — this is a phone call
• Never list multiple services unprompted — find out what they need, then respond to that
• Never be pushy — one soft ask, one follow-up, then respect the no
• Never make up capabilities or timelines you can't confirm
• If they're clearly not interested after two tries, thank them warmly and end the call
• Close every call warmly — even a hard no is a future referral
${personalitySection}`;

  const assistant = {
    name: `Shadow Graphix — ${company}`,
    model: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'system', content: systemPrompt }],
      temperature: 0.75,
    },
    voice: {
      provider: 'playht',
      voiceId: 'jennifer',
    },
    firstMessage: fill(script.intro) + ' ' + fill(script.qualifier) + ' ' + fill(script.qualify_q),
    endCallFunctionEnabled: true,
    endCallMessage: "Alright, thanks so much for your time — really appreciate it. Have a great day!",
    voicemailMessage: `Hey, this is Shadow calling from Shadow Graphix over in Speedway, Indiana. We do vehicle wraps and graphics — race haulers, fleet trucks, color changes, architectural film — and I wanted to reach out to ${company} to see if there's any work we could put a quote together for. Give us a call back at ${settings.senderPhone || '317-your-number'}, or check your email — we may have reached out there too. Thanks a lot, have a great one.`,
    recordingEnabled: true,
    hipaaEnabled: false,
    analysisPlan: {
      summaryPrompt: 'Summarize this sales call in 2-3 sentences. Did the prospect show interest? Did they agree to receive a quote or schedule a follow-up? Was an email captured? What is the recommended next action?',
      successEvaluationPrompt: 'Did the call result in the prospect agreeing to receive a quote, scheduling a follow-up, or requesting a transfer to the team? Answer yes, no, or partial.',
      successEvaluationRubric: 'PassFail',
      structuredDataSchema: {
        type: 'object',
        properties: {
          interested: { type: 'boolean' },
          emailCaptured: { type: 'string' },
          callbackRequested: { type: 'boolean' },
          rightPerson: { type: 'boolean' },
          referredTo: { type: 'string' },
          competitorVendor: { type: 'string' },
          wrapCategory: { type: 'string' },
          vehicleCount: { type: 'number' },
        },
      },
    },
  };

  // Warm handoff — 4-person cascade: Daren → Mary → Jodi → Jake
  assistant.tools = [{
    type: 'transferCall',
    destinations: [
      {
        type: 'number',
        number: '+13174147201',
        description: 'Daren Merkle — Owner. Transfer here first for any hot prospect.',
        message: 'One second — let me get Daren on the line for you.',
      },
      {
        type: 'number',
        number: '+13174355222',
        description: 'Mary Merkle — CEO. Transfer here if Daren is unavailable.',
        message: 'Let me connect you with Mary right now.',
      },
      {
        type: 'number',
        number: '+13176854847',
        description: 'Jodi Kuhn — Sales. Best for quote questions and follow-up scheduling.',
        message: 'Let me get you over to Jodi in sales.',
      },
      {
        type: 'number',
        number: '+13176005354',
        description: 'Jake Benson — Lead Installer / Operations. Best for technical questions about installation, timeline, and materials.',
        message: 'Let me connect you with Jake — he runs our installations and can answer anything technical.',
      },
    ],
  }];

  return assistant;
}

// ── Feature 1: Pre-call research agent ───────────────────────────────────────
async function researchCompany(lead, anthropicKey) {
  if (!anthropicKey || !lead.website) return null;
  try {
    // Fetch the company website (5s timeout)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const webRes = await fetch(`https://${lead.website}`, { signal: controller.signal }).catch(() => null);
    clearTimeout(timer);
    const html = webRes ? (await webRes.text().catch(() => '')).slice(0, 6000) : '';

    // Strip HTML tags for a cleaner read
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000);

    const prompt = `You are helping a vehicle wrap sales rep prepare for a cold call to ${lead.company} in ${lead.city}, ${lead.state}.

Website snippet: "${text}"

In ONE sentence, give a natural conversational hook the rep can drop early in the call — something specific they noticed about the company (recent expansion, award, fleet growth, new location, notable client, etc.).
If nothing specific is found, return null.
Return ONLY the hook sentence or the word null. No explanation.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const aiData = await aiRes.json();
    const hook = aiData.content?.[0]?.text?.trim();
    return (!hook || hook === 'null') ? null : hook;
  } catch { return null; }
}

// ── Feature 3: Seasonal campaign definitions ──────────────────────────────────
const CAMPAIGNS = [
  {
    id: 'indy500',
    name: 'Indy 500 Blast',
    icon: '🏁',
    filter: { category: 'racing' },
    eventDate: new Date(new Date().getFullYear() + '-05-25'),
    urgency: 'The Indy 500 is coming up fast — we have a limited number of hauler and livery slots open before race week.',
  },
  {
    id: 'nhra-nats',
    name: 'NHRA US Nationals',
    icon: '🔥',
    filter: { city: 'Brownsburg' },
    eventDate: new Date(new Date().getFullYear() + '-08-28'),
    urgency: 'NHRA U.S. Nationals at Lucas Oil Raceway is coming up — hauler wrap slots fill fast this time of year.',
  },
  {
    id: 'brickyard',
    name: 'Brickyard 400',
    icon: '🏎',
    filter: { category: 'racing' },
    eventDate: new Date(new Date().getFullYear() + '-07-27'),
    urgency: 'Brickyard 400 weekend is approaching — perfect timing to refresh hauler graphics before a big home race.',
  },
  {
    id: 'spring-fleet',
    name: 'Spring Fleet Push',
    icon: '🌱',
    filter: { category: 'fleet' },
    eventDate: new Date(new Date().getFullYear() + '-04-01'),
    urgency: 'Spring is peak season for fleet refreshes — companies want their trucks looking sharp before summer.',
  },
  {
    id: 'q4-budget',
    name: 'Q4 Budget Spend',
    icon: '💰',
    filter: {},
    eventDate: new Date(new Date().getFullYear() + '-10-01'),
    urgency: 'Q4 is here — many companies want to use remaining marketing budget on vehicle graphics before year end.',
  },
];

function weeksUntil(date) {
  const ms = date - Date.now();
  return ms > 0 ? Math.ceil(ms / (7 * 86_400_000)) : 0;
}

// In-memory campaign queue (userId → array of pending calls)
const campaignQueues = new Map();

// POST /calls/initiate — trigger an outbound Vapi call for a lead
app.post('/calls/initiate', authMiddleware, async (req, res) => {
  const userId = String(req.user.id);
  const { lead_id, campaign_urgency } = req.body;
  if (!lead_id) return res.status(400).json({ error: 'lead_id required' });

  // Load settings
  const { rows: sRows } = await pool.query('SELECT settings_json AS data FROM users WHERE id=$1', [userId]);
  const settings = sRows[0]?.data || {};

  if (!settings.vapiApiKey) return res.status(400).json({ error: 'Vapi API key not configured. Add it in Settings.' });
  if (!settings.vapiPhoneNumberId) return res.status(400).json({ error: 'Vapi Phone Number ID not configured. Add it in Settings.' });

  // Load lead
  const { rows: lRows } = await pool.query('SELECT * FROM leads WHERE id=$1 AND user_id=$2', [lead_id, userId]);
  if (!lRows.length) return res.status(404).json({ error: 'Lead not found' });
  const lead = lRows[0];

  if (!lead.phone) return res.status(400).json({ error: 'Lead has no phone number on file.' });

  // Feature 1: Pre-call research (fire concurrently with settings load, non-blocking)
  const researchHook = await researchCompany(lead, process.env.ANTHROPIC_API_KEY).catch(() => null);

  const assistant = buildVapiAssistant({ lead, settings, researchHook, campaignUrgency: campaign_urgency || null });

  try {
    const vapiRes = await fetch(`${VAPI_BASE}/call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.vapiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistant,
        phoneNumberId: settings.vapiPhoneNumberId,
        customer: {
          number: lead.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '+1$1'),
          name: lead.contact_name || lead.company,
        },
      }),
    });

    if (!vapiRes.ok) {
      const err = await vapiRes.json().catch(() => ({}));
      return res.status(vapiRes.status).json({ error: err.message || 'Vapi call failed' });
    }

    const call = await vapiRes.json();

    // Log the call attempt as a lead activity
    await logActivity(pool, {
      leadId: lead.id, userId,
      type: 'call_initiated',
      subject: `AI call initiated to ${lead.company}`,
      metadata: { vapi_call_id: call.id, phone: lead.phone, status: 'initiated', research_hook: researchHook },
    });

    res.json({ ok: true, call_id: call.id, status: call.status });
  } catch (e) {
    console.error('Vapi call error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /calls/webhook — Vapi sends call events here
// No auth — Vapi calls this endpoint directly. Validate via lead lookup.
app.post('/calls/webhook', async (req, res) => {
  const event = req.body;
  res.json({ ok: true }); // always ACK immediately

  try {
    const { type, call } = event;
    if (!call?.id) return;

    // Find the lead this call belongs to (via activity log)
    const { rows } = await pool.query(`
      SELECT l.id AS lead_id, l.user_id, l.company, l.status
      FROM lead_activities la
      JOIN leads l ON l.id = la.lead_id
      WHERE la.type = 'call_initiated'
        AND la.metadata->>'vapi_call_id' = $1
      LIMIT 1
    `, [call.id]);

    if (!rows.length) return;
    const { lead_id, user_id, company, status: leadStatus } = rows[0];

    if (type === 'end-of-call-report') {
      const summary     = event.summary || event.analysis?.summary || '';
      const transcript  = event.transcript || '';
      const endedReason = call.endedReason || 'unknown';
      const success     = event.analysis?.successEvaluation || '';
      const structured  = event.analysis?.structuredData || {};

      // Determine new lead status
      let newStatus = leadStatus;
      if (success === 'true' || structured.interested) {
        newStatus = 'replied';
      } else if (endedReason === 'voicemail' || endedReason === 'no-answer') {
        newStatus = leadStatus; // no change
      } else if (structured.rightPerson === false && structured.referredTo) {
        newStatus = 'contacted';
      } else if (endedReason !== 'customer-ended-call' && endedReason !== 'assistant-ended-call') {
        newStatus = 'contacted';
      }

      // Update lead status and last_contacted
      if (newStatus !== leadStatus || true) {
        await pool.query(`
          UPDATE leads SET status=$1, last_contacted=CURRENT_DATE, updated_at=NOW()
          WHERE id=$2 AND user_id=$3
        `, [newStatus, lead_id, user_id]);
      }

      // Log detailed activity
      await logActivity(pool, {
        leadId: lead_id, userId: user_id,
        type: 'call_completed',
        subject: `AI call to ${company} — ${endedReason.replace(/-/g, ' ')}`,
        body: summary || transcript.slice(0, 500),
        metadata: {
          vapi_call_id: call.id,
          ended_reason: endedReason,
          duration_seconds: call.endedAt && call.startedAt
            ? Math.round((new Date(call.endedAt) - new Date(call.startedAt)) / 1000)
            : null,
          success_evaluation: success,
          interested: structured.interested,
          email_captured: structured.emailCaptured,
          callback_requested: structured.callbackRequested,
          referred_to: structured.referredTo,
          transcript_preview: transcript.slice(0, 300),
        },
      });

      // If email was captured on the call, save it to the lead
      if (structured.emailCaptured) {
        await pool.query(
          'UPDATE leads SET email=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 AND email IS NULL',
          [structured.emailCaptured, lead_id, user_id]
        );
      }

      // Create notification for call completion
      await createNotification(user_id, {
        type: 'call_completed',
        title: `AI call to ${company} — ${endedReason.replace(/-/g, ' ')}`,
        body: summary ? summary.slice(0, 200) : `Call ended: ${endedReason}`,
        metadata: { lead_id, company, success_evaluation: success, interested: structured.interested },
      });

      // Log competitor intel if mentioned
      if (structured.competitorVendor) {
        await pool.query(
          `UPDATE leads SET notes = CONCAT(COALESCE(notes,''), $1) WHERE id=$2 AND user_id=$3`,
          [`\n[Competitor vendor from call]: ${structured.competitorVendor}`, lead_id, user_id]
        );
      }

      // Feature 2: Post-call automation chain — fires when prospect showed interest
      if (structured.interested || success === 'true') {
        try {
          const { rows: uRows } = await pool.query('SELECT settings_json AS data FROM users WHERE id=$1', [user_id]);
          const s = uRows[0]?.data || {};
          const { rows: lRows } = await pool.query('SELECT * FROM leads WHERE id=$1 AND user_id=$2', [lead_id, String(user_id)]);
          const lead = lRows[0];
          if (!lead) {
            console.warn('[calls/webhook] lead not found for user', { lead_id, user_id });
            return; // response was already ACKed at the top of the handler
          }

          // 1. Schedule 3-day followup
          await pool.query(
            `UPDATE leads SET followup_due_at = CURRENT_DATE + INTERVAL '3 days', updated_at=NOW() WHERE id=$1 AND user_id=$2`,
            [lead_id, String(user_id)]
          );

          // 2. Send portfolio email via Resend (reuse existing RESEND_API_KEY pattern)
          const toEmail = structured.emailCaptured || lead.email;
          if (toEmail && process.env.RESEND_API_KEY && s.senderEmail) {
            const emailBody = `Hi${lead.contact_name ? ' ' + lead.contact_name.split(' ')[0] : ''},

Thanks for taking my call today — great speaking with you about ${company}'s graphics needs.

As promised, here's a look at some of our recent work:
${s.portfolioUrl || '[see our portfolio — link in bio]'}

We specialize in:
• Race hauler wraps ($15K–$35K full wrap)
• Fleet vehicle graphics ($800–$1,200/vehicle)
• 3M DI-NOC architectural film
• Color-change wraps

I'll put together a preliminary quote based on what we discussed and send it over within 24 hours. If you have any photos of the vehicles or specs in the meantime, just reply to this email.

Looking forward to working together,
${s.senderName || 'Alex'}
${s.companyName || s.senderName || 'Our Shop'}
${s.senderPhone || ''}`;

            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: `${s.senderName || s.companyName || 'WrapOS'} <${s.senderEmail}>`,
                to: toEmail,
                subject: `Great talking with you — ${s.companyName || 'our shop'} portfolio`,
                text: emailBody,
              }),
            }).catch((e) => console.error('Post-call email error:', e.message));
          }

          // 3. Send SMS via Twilio
          if (lead.phone && s.twilioAccountSid && s.twilioAuthToken && s.twilioFromNumber) {
            const toNum = lead.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '+1$1');
            const smsBody = `Hi${lead.contact_name ? ' ' + lead.contact_name.split(' ')[0] : ''}, this is ${s.senderName || 'your rep'} from ${s.companyName || 'our shop'} — great talking with you! Here's our portfolio: ${s.portfolioUrl || ''} — we'll have a quote to you within 24 hours.`;
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${s.twilioAccountSid}/Messages.json`;
            const form = new URLSearchParams({ To: toNum, From: s.twilioFromNumber, Body: smsBody });
            await fetch(twilioUrl, {
              method: 'POST',
              headers: {
                Authorization: 'Basic ' + Buffer.from(`${s.twilioAccountSid}:${s.twilioAuthToken}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: form,
            }).catch((e) => console.error('Post-call SMS error:', e.message));
          }

          await logActivity(pool, {
            leadId: lead_id, userId: user_id,
            type: 'post_call_chain_fired',
            subject: `Post-call automation fired for ${company}`,
            metadata: {
              email_sent: !!(toEmail && process.env.RESEND_API_KEY),
              sms_sent: !!(lead.phone && s.twilioAccountSid),
              followup_scheduled: true,
            },
          });
        } catch (e) {
          console.error('Post-call chain error:', e.message);
        }
      }
    }
  } catch (e) {
    console.error('Vapi webhook error:', e.message);
  }
});

// ── Feature 3: Campaign blast endpoints ─────────────────────────────────────

// GET /calls/campaigns — list campaigns with matching lead counts
app.get('/calls/campaigns', authMiddleware, async (req, res) => {
  const userId = String(req.user.id);
  const { rows: sRows } = await pool.query('SELECT settings_json AS data FROM users WHERE id=$1', [userId]);
  const settings = sRows[0]?.data || {};
  if (!settings.vapiApiKey) return res.status(400).json({ error: 'Vapi not configured' });

  const campaigns = await Promise.all(CAMPAIGNS.map(async (c) => {
    const conditions = ['user_id=$1', 'phone IS NOT NULL', "phone != ''"];
    const params = [userId];
    if (c.filter.category) { params.push(c.filter.category); conditions.push(`category=$${params.length}`); }
    if (c.filter.city)     { params.push(c.filter.city);     conditions.push(`city=$${params.length}`); }
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM leads WHERE ${conditions.join(' AND ')}`, params
    );
    const weeks = weeksUntil(c.eventDate);
    return {
      id: c.id, name: c.name, icon: c.icon,
      leadCount: parseInt(rows[0].cnt, 10),
      weeksUntilEvent: weeks,
      eventLabel: weeks > 0 ? `${weeks}w away` : 'Past',
      urgency: c.urgency,
    };
  }));

  res.json({ campaigns });
});

// POST /calls/campaigns/:id/launch — queue all calls for a campaign
app.post('/calls/campaigns/:id/launch', authMiddleware, async (req, res) => {
  const userId = String(req.user.id);
  const campaign = CAMPAIGNS.find((c) => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const { rows: sRows } = await pool.query('SELECT settings_json AS data FROM users WHERE id=$1', [userId]);
  const settings = sRows[0]?.data || {};
  if (!settings.vapiApiKey || !settings.vapiPhoneNumberId)
    return res.status(400).json({ error: 'Vapi not configured' });

  const conditions = ['user_id=$1', 'phone IS NOT NULL', "phone != ''"];
  const params = [userId];
  if (campaign.filter.category) { params.push(campaign.filter.category); conditions.push(`category=$${params.length}`); }
  if (campaign.filter.city)     { params.push(campaign.filter.city);     conditions.push(`city=$${params.length}`); }
  const { rows: leads } = await pool.query(
    `SELECT * FROM leads WHERE ${conditions.join(' AND ')} ORDER BY company LIMIT 100`, params
  );

  if (!leads.length) return res.status(400).json({ error: 'No leads with phone numbers match this campaign.' });

  const weeks = weeksUntil(campaign.eventDate);
  const urgencyLine = campaign.urgency.replace('{N}', weeks);
  const estimatedMinutes = Math.ceil((leads.length * 45) / 60);

  // Kick off calls with 45s delay between each (fire-and-forget)
  (async () => {
    for (const lead of leads) {
      try {
        const researchHook = await researchCompany(lead, process.env.ANTHROPIC_API_KEY).catch(() => null);
        const assistant = buildVapiAssistant({ lead, settings, researchHook, campaignUrgency: urgencyLine });
        const vapiRes = await fetch(`${VAPI_BASE}/call`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${settings.vapiApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assistant,
            phoneNumberId: settings.vapiPhoneNumberId,
            customer: { number: lead.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '+1$1'), name: lead.contact_name || lead.company },
          }),
        });
        if (vapiRes.ok) {
          const call = await vapiRes.json();
          await logActivity(pool, {
            leadId: lead.id, userId,
            type: 'call_initiated',
            subject: `[${campaign.name}] AI call initiated to ${lead.company}`,
            metadata: { vapi_call_id: call.id, campaign_id: campaign.id, research_hook: researchHook },
          });
        }
      } catch (e) { console.error(`Campaign call error (${lead.company}):`, e.message); }
      // 45-second gap between calls
      await new Promise((r) => setTimeout(r, 45_000));
    }
  })();

  res.json({ ok: true, total: leads.length, estimatedMinutes, campaignName: campaign.name });
});

// GET /calls/status/:callId — poll Vapi for live call status
app.get('/calls/status/:callId', authMiddleware, async (req, res) => {
  const { rows: sRows } = await pool.query('SELECT settings_json AS data FROM users WHERE id=$1', [String(req.user.id)]);
  const settings = sRows[0]?.data || {};
  if (!settings.vapiApiKey) return res.status(400).json({ error: 'Vapi not configured' });

  try {
    const vapiRes = await fetch(`${VAPI_BASE}/call/${req.params.callId}`, {
      headers: { 'Authorization': `Bearer ${settings.vapiApiKey}` },
    });
    const data = await vapiRes.json();
    res.json({ ok: true, status: data.status, endedReason: data.endedReason });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Wrap Lifecycle Tracker ────────────────────────────────────────────────────

app.get('/jobs', authMiddleware, async (req, res) => {
  const uid = String(req.user.id);
  const { rows } = await pool.query(
    `SELECT *, EXTRACT(DAY FROM (install_date + (life_years || ' years')::interval - CURRENT_DATE))::int AS days_until_expiry
     FROM installed_jobs WHERE user_id = $1 ORDER BY install_date DESC`,
    [uid]
  );
  res.json({ jobs: rows });
});

app.get('/jobs/aging', authMiddleware, async (req, res) => {
  const uid = String(req.user.id);
  const { rows } = await pool.query(
    `SELECT *, EXTRACT(DAY FROM (install_date + (life_years || ' years')::interval - CURRENT_DATE))::int AS days_until_expiry
     FROM installed_jobs WHERE user_id = $1
       AND (install_date + (life_years || ' years')::interval - CURRENT_DATE) <= INTERVAL '90 days'
     ORDER BY (install_date + (life_years || ' years')::interval) ASC`,
    [uid]
  );
  res.json({ jobs: rows });
});

app.post('/jobs', authMiddleware, async (req, res) => {
  const uid = String(req.user.id);
  const { lead_id, company, vehicle_type, vehicle_count, wrap_category, material, install_date, life_years, notes } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO installed_jobs (user_id, lead_id, company, vehicle_type, vehicle_count, wrap_category, material, install_date, life_years, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [uid, lead_id || null, company, vehicle_type || 'other', vehicle_count || 1, wrap_category || 'fleet', material || null, install_date, life_years || 5, notes || null]
  );
  res.json({ job: rows[0] });
});

app.put('/jobs/:id', authMiddleware, async (req, res) => {
  const uid = String(req.user.id);
  const { id } = req.params;
  const { company, vehicle_type, vehicle_count, wrap_category, material, install_date, life_years, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE installed_jobs SET company=$1,vehicle_type=$2,vehicle_count=$3,wrap_category=$4,material=$5,install_date=$6,life_years=$7,notes=$8,updated_at=NOW()
     WHERE id=$9 AND user_id=$10 RETURNING *`,
    [company, vehicle_type, vehicle_count, wrap_category, material, install_date, life_years, notes, id, uid]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ job: rows[0] });
});

app.delete('/jobs/:id', authMiddleware, async (req, res) => {
  await pool.query(`DELETE FROM installed_jobs WHERE id=$1 AND user_id=$2`, [req.params.id, String(req.user.id)]);
  res.json({ ok: true });
});

// ── Computer Vision Vehicle Quoting ──────────────────────────────────────────

const VEHICLE_DIMENSIONS = {
  cargo_van_standard:  { label: 'Cargo Van (Standard)',    sqft: [200, 250] },
  cargo_van_high_roof: { label: 'Cargo Van (High Roof)',   sqft: [240, 290] },
  box_truck_16:        { label: '16ft Box Truck',          sqft: [310, 360] },
  box_truck_24:        { label: '24ft Box Truck',          sqft: [420, 480] },
  semi_cab_only:       { label: 'Semi Cab (no trailer)',   sqft: [200, 260] },
  semi_full:           { label: 'Semi + 53ft Trailer',     sqft: [620, 780] },
  pickup_truck:        { label: 'Full-Size Pickup',        sqft: [150, 200] },
  suv_large:           { label: 'Large SUV / Crossover',   sqft: [160, 210] },
  sedan:               { label: 'Sedan / Compact',         sqft: [100, 145] },
  minivan:             { label: 'Minivan / Passenger Van', sqft: [175, 220] },
  bus_school:          { label: 'School / Transit Bus',    sqft: [380, 550] },
  flatbed:             { label: 'Flatbed Truck',           sqft: [180, 250] },
  other:               { label: 'Vehicle',                 sqft: [150, 250] },
};

app.post('/vision/quote-vehicle', authMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });

  try {
    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: `Identify the vehicle in this image. Return ONLY valid JSON:\n{"vehicleKey":"<key>","confidence":"high|medium|low","notes":"<brief description>"}\nValid keys: ${Object.keys(VEHICLE_DIMENSIONS).join(', ')}. Pick the closest match.` },
          ],
        }],
      }),
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : '{}');

    const key = parsed.vehicleKey && VEHICLE_DIMENSIONS[parsed.vehicleKey] ? parsed.vehicleKey : 'other';
    const dim = VEHICLE_DIMENSIONS[key];

    // Compute quote ranges
    const settingsRow = await pool.query(`SELECT settings_json FROM users WHERE id=$1`, [String(req.user.id)]);
    const s = settingsRow.rows[0]?.settings_json || {};
    const priceLow  = parseFloat(s.pricePerSqftLow  || '8');
    const priceHigh = parseFloat(s.pricePerSqftHigh || '14');

    const quotes = {
      full:    { label: 'Full Wrap',    low: Math.round(dim.sqft[0] * 1.0 * priceLow),  high: Math.round(dim.sqft[1] * 1.0 * priceHigh) },
      partial: { label: 'Partial Wrap', low: Math.round(dim.sqft[0] * 0.5 * priceLow),  high: Math.round(dim.sqft[1] * 0.5 * priceHigh) },
      spot:    { label: 'Spot / Logo',  low: Math.round(dim.sqft[0] * 0.2 * priceLow),  high: Math.round(dim.sqft[1] * 0.2 * priceHigh) },
    };

    res.json({ ok: true, vehicleKey: key, vehicleLabel: dim.label, confidence: parsed.confidence || 'medium', notes: parsed.notes || '', sqftRange: dim.sqft, quotes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI Design Generation ──────────────────────────────────────────────────────

app.post('/ai/design-brief', authMiddleware, requireWrapOS, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });
  const { vehicleType, primaryColor, secondaryColor, style, description, companyName } = req.body;

  const prompt = `You are a professional vehicle wrap designer. Create a detailed design brief for this wrap project.

Vehicle: ${vehicleType || 'cargo van'}
Company: ${companyName || 'the client'}
Primary color: ${primaryColor || 'blue'}
Secondary color: ${secondaryColor || 'white'}
Style: ${style || 'bold and modern'}
Client description: ${description || 'professional fleet wrap'}

Return ONLY valid JSON:
{
  "primary_color": "<hex>",
  "secondary_color": "<hex>",
  "style": "<style description>",
  "layout": "<detailed layout description for the wrap panels>",
  "typography": "<font/text recommendation>",
  "dall_e_prompt": "<detailed DALL-E 3 prompt for generating a photorealistic concept render of this wrapped vehicle>"
}

The dall_e_prompt must specify: exact vehicle type, wrap design, colors, finish (matte/gloss), studio photography style, white background.`;

  try {
    const text = await claudeHaiku(apiKey, [{ role: 'user', content: prompt }], 800);
    const match = text.match(/\{[\s\S]*\}/);
    const brief = JSON.parse(match ? match[0] : '{}');
    res.json({ ok: true, brief });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/ai/generate-mockup', authMiddleware, requireWrapOS, async (req, res) => {
  const { brief } = req.body;
  if (!brief?.dall_e_prompt) return res.status(400).json({ error: 'No design brief provided' });

  const settingsRow = await pool.query(`SELECT settings_json FROM users WHERE id=$1`, [String(req.user.id)]);
  const s = settingsRow.rows[0]?.settings_json || {};
  const openaiKey = s.openaiApiKey;
  if (!openaiKey) return res.status(503).json({ error: 'OpenAI API key not configured in Settings' });

  try {
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: brief.dall_e_prompt,
        n: 1,
        size: '1792x1024',
        quality: 'standard',
        response_format: 'url',
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'DALL-E error');
    const image_url = data.data?.[0]?.url;
    res.json({ ok: true, image_url, brief });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AR / Wrap Mockup Preview ──────────────────────────────────────────────────

app.post('/vision/ar-preview', authMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const settingsRow = await pool.query(`SELECT settings_json FROM users WHERE id=$1`, [String(req.user.id)]);
  const s = settingsRow.rows[0]?.settings_json || {};
  const openaiKey = s.openaiApiKey;
  if (!openaiKey) return res.status(503).json({ error: 'OpenAI API key required for AR preview — add it in Settings' });

  const wrapDescription = req.body.wrapDescription || 'professional vehicle wrap with bold graphics';

  try {
    // Store original as base64 data URL for side-by-side display
    const originalDataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    // Use gpt-image-1 edit endpoint with the uploaded photo
    const FormDataNode = (await import('form-data')).default;
    const form = new FormDataNode();
    form.append('model', 'gpt-image-1');
    form.append('image', req.file.buffer, { filename: 'vehicle.jpg', contentType: req.file.mimetype });
    form.append('prompt', `Apply a professional vehicle wrap to this exact vehicle. Wrap design: ${wrapDescription}. Keep the vehicle shape, perspective, and surroundings identical. Make the wrap look photorealistic and production-quality.`);
    form.append('size', '1536x1024');

    const resp = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, ...form.getHeaders() },
      body: form,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'OpenAI image edit error');

    const image_url = data.data?.[0]?.url || (`data:image/png;base64,${data.data?.[0]?.b64_json}`);
    res.json({ ok: true, image_url, original_url: originalDataUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Business Card Scanner — Claude Vision → instant lead ──────────────────────
app.post('/vision/scan-card', authMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });

  try {
    const b64 = req.file.buffer.toString('base64');
    const result = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: req.file.mimetype, data: b64 } },
            { type: 'text', text: `Extract the contact information from this business card. Return JSON only with these exact fields (use empty string if not found):
{ "company": "", "contactName": "", "contactTitle": "", "email": "", "phone": "", "website": "", "address": "", "city": "", "state": "", "notes": "" }
For state use the 2-letter abbreviation. For notes include any tagline or services listed on the card.` },
          ],
        }],
      }),
    });
    const d = await result.json();
    const text = d.content?.[0]?.text || '{}';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    res.json({ ok: true, lead: parsed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI Pipeline Narrative ─────────────────────────────────────────────────────
app.post('/ai/pipeline-narrative', authMiddleware, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });
  const uid = String(req.user.id);
  try {
    const settingsR = await pool.query('SELECT settings_json FROM users WHERE id=$1', [uid]);
    const shopSettings = settingsR.rows[0]?.settings_json || {};
    const shopName = shopSettings.companyName || 'your shop';

    const [leadsR, bidsR, wonR, agingR, openR, propR] = await Promise.all([
      pool.query(
        `SELECT status, category, company, fleet_size,
            last_contacted, followup_due_at
         FROM leads WHERE user_id=$1 AND status NOT IN ('lost','won')
         ORDER BY CASE status WHEN 'replied' THEN 1 WHEN 'proposal' THEN 2 WHEN 'meeting' THEN 3 WHEN 'contacted' THEN 4 ELSE 5 END
         LIMIT 30`, [uid]),
      pool.query(`SELECT b.project_name, b.estimated_value, b.bid_due, b.status, l.company
         FROM bids b LEFT JOIN leads l ON l.id=b.lead_id
         WHERE b.user_id=$1 AND b.status='tracking' ORDER BY b.bid_due ASC LIMIT 10`, [uid]),
      pool.query(`SELECT category, COUNT(*)::INT AS n
         FROM leads WHERE user_id=$1 AND status='won' AND updated_at >= DATE_TRUNC('month',NOW())
         GROUP BY category`, [uid]),
      pool.query(`SELECT COUNT(*)::INT AS n FROM installed_jobs WHERE user_id=$1
         AND (install_date + (life_years||' years')::interval) <= NOW() + INTERVAL '90 days'`, [uid]),
      pool.query(`SELECT COUNT(*)::INT AS n, COALESCE(SUM(open_count),0)::INT AS opens
         FROM email_tracking WHERE user_id=$1 AND created_at > NOW() - INTERVAL '7 days'`, [uid]),
      pool.query(`SELECT COUNT(*)::INT AS n FROM proposals WHERE user_id=$1 AND view_count > 0 AND last_viewed_at > NOW() - INTERVAL '7 days'`, [uid]),
    ]);

    // leads has no per-row dollar value; estimate from category (mirrors /analytics REV_EST)
    const REV_EST = { fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000, colorchange: 3500, racing: 40000, reatec: 5500, design: 3000, wallgraphics: 2500, other: 2500 };
    const pipeline = leadsR.rows;
    const pipelineValue = pipeline.reduce((s, l) => s + (REV_EST[l.category] ?? 2500), 0);
    const wonCount = wonR.rows.reduce((s, r) => s + r.n, 0);
    const wonValue = wonR.rows.reduce((s, r) => s + r.n * (REV_EST[r.category] ?? 2500), 0);
    const hot = pipeline.filter((l) => ['replied','proposal','meeting'].includes(l.status));
    const bids = bidsR.rows;
    const bidsValue = bids.reduce((s, b) => s + (b.estimated_value || 0), 0);

    const prompt = `You are a sharp revenue strategist for ${shopName}, a vehicle wrap shop. Analyze this pipeline snapshot and write a 3-paragraph narrative forecast for the next 30 days. Be specific, name real patterns, give concrete advice. Write like you actually understand the wrap business — fleet sales cycles, racing season, bid windows. No bullet points. Pure prose.

CURRENT PIPELINE (${pipeline.length} active leads, ~$${pipelineValue.toLocaleString()} potential):
Hot leads (replied/proposal/meeting): ${hot.length}
Categories: ${[...new Set(pipeline.map(l => l.category))].join(', ')}
Companies: ${hot.slice(0,5).map(l => `${l.company} (${l.status})`).join(', ')}

BIDS TRACKING: ${bids.length} active bids, ~$${bidsValue.toLocaleString()} total
Upcoming: ${bids.slice(0,3).map(b => `${b.project_name}${b.bid_due ? ' due ' + b.bid_due.toString().split('T')[0] : ''}`).join(', ')}

THIS MONTH: ${wonCount} wins, $${wonValue.toLocaleString()} revenue
EMAIL SIGNALS (7d): ${openR.rows[0]?.opens ?? 0} opens from ${openR.rows[0]?.n ?? 0} emails, ${propR.rows[0]?.n ?? 0} proposals viewed
AGING WRAPS: ${agingR.rows[0]?.n ?? 0} jobs approaching refresh window (re-order opportunities)

Write 3 paragraphs:
1. Where the money is right now (most likely closes in 30 days)
2. What the biggest risks and gaps are
3. One specific outreach move that would have the highest impact this week`;

    const text = await claudeHaiku(apiKey, [{ role: 'user', content: prompt }], 600);
    res.json({ ok: true, narrative: text.trim() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Anniversary Email Worker ─────────────────────────────────────────────────
async function processAnniversaries() {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'outreach@wrapleads.io';
  try {
    const { rows: jobs } = await pool.query(
      `SELECT j.*, l.email, l.contact_name, l.company AS lead_company, u.email AS user_email,
          u.settings_json AS settings
       FROM installed_jobs j
       JOIN leads l ON l.id = j.lead_id
       JOIN users u ON u.id::text = j.user_id
       WHERE j.lead_id IS NOT NULL
         AND l.email IS NOT NULL AND l.email != ''
         AND ABS(EXTRACT(DOY FROM NOW()) - EXTRACT(DOY FROM j.install_date + INTERVAL '1 year')) <= 3
         AND NOT EXISTS (
           SELECT 1 FROM lead_activities a
           WHERE a.lead_id = j.lead_id AND a.type = 'email_sent'
             AND a.subject LIKE '%anniversary%'
             AND a.created_at > NOW() - INTERVAL '14 days'
         )`
    );
    for (const job of jobs) {
      const s = job.settings || {};
      const fromName = s.senderName || 'Your Wrap Shop';
      const vehicleLabel = `${job.vehicle_count} vehicle${job.vehicle_count > 1 ? 's' : ''}`;
      const subject = `Happy 1-Year Anniversary, ${job.company}! 🎉`;
      const bodyText = `Hi ${job.contact_name || job.company},

It's been one year since we wrapped your ${vehicleLabel}! We hope your ${job.wrap_category === 'fleet' ? 'fleet' : 'wrap'} has been turning heads and generating leads for your business every single day it's on the road.

A few quick wrap care tips to keep your graphics looking sharp:
- Wash regularly with mild soap and water — avoid automatic car washes with brushes
- Hand-dry to prevent water spots, especially on matte finishes
- Avoid gasoline or harsh solvents near edges

Your wrap is now entering its second year of service. With ${job.life_years}-year material, you're in great shape — but if you notice any lifting corners or fading, reach out and we'll get you squared away.

Thinking about a refresh or adding more vehicles to the fleet? We'd love to talk.

${fromName}`;

      if (resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: job.contact_name ? `${job.contact_name} <${job.email}>` : job.email,
            subject,
            text: bodyText,
          }),
        });
      }
      await logActivity(pool, {
        leadId: job.lead_id,
        userId: job.user_id,
        type: 'email_sent',
        subject: `[anniversary] ${subject}`,
        body: bodyText.slice(0, 500),
        metadata: { job_id: job.id, auto: true, anniversary_year: 1 },
      });
      await createNotification(job.user_id, {
        type: 'new_lead',
        title: `🎂 1-year anniversary email sent to ${job.company}!`,
        body: `Wrap care tips + refresh nudge delivered automatically.`,
        metadata: { lead_id: job.lead_id, job_id: job.id },
      });
    }
  } catch (e) {
    console.error('[anniversary worker]', e.message);
  }
}

function startAnniversaryWorker() {
  const check = () => {
    const now = new Date();
    if (now.getHours() === 11 && now.getMinutes() === 0) {
      processAnniversaries();
    }
  };
  setInterval(check, 60_000);
  console.log('· Anniversary worker: running (daily check at 11:00 AM)');
}

// ── Fleet Management Integrations ─────────────────────────────────────────────

app.get('/integrations/samsara/vehicles', authMiddleware, async (req, res) => {
  const settingsRow = await pool.query(`SELECT settings_json FROM users WHERE id=$1`, [String(req.user.id)]);
  const s = settingsRow.rows[0]?.settings_json || {};
  if (!s.samsaraApiKey) return res.status(400).json({ error: 'Samsara API key not configured' });
  try {
    const resp = await fetch('https://api.samsara.com/fleet/vehicles?limit=200', {
      headers: { Authorization: `Token ${s.samsaraApiKey}` },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || 'Samsara API error');
    const vehicles = (data.data || []).map((v) => ({
      id: v.id, name: v.name, make: v.make, model: v.model, year: v.year, vin: v.vin, license_plate: v.licensePlate, type: v.vehicleType,
    }));
    res.json({ ok: true, vehicles, count: vehicles.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/integrations/samsara/import', authMiddleware, async (req, res) => {
  const settingsRow = await pool.query(`SELECT settings_json FROM users WHERE id=$1`, [String(req.user.id)]);
  const s = settingsRow.rows[0]?.settings_json || {};
  if (!s.samsaraApiKey) return res.status(400).json({ error: 'Samsara API key not configured' });
  try {
    const resp = await fetch('https://api.samsara.com/fleet/vehicles?limit=200', {
      headers: { Authorization: `Token ${s.samsaraApiKey}` },
    });
    const data = await resp.json();
    const vehicles = data.data || [];
    const { vehicle_ids } = req.body;
    const toImport = vehicle_ids ? vehicles.filter((v) => vehicle_ids.includes(v.id)) : vehicles;

    let imported = 0, skipped = 0;
    for (const v of toImport) {
      const clientId = `samsara-${v.id}`;
      const existing = await pool.query(`SELECT id FROM leads WHERE user_id=$1 AND client_id=$2`, [String(req.user.id), clientId]);
      if (existing.rows.length) { skipped++; continue; }
      await pool.query(
        `INSERT INTO leads (user_id, client_id, company, category, notes, status) VALUES ($1,$2,$3,'fleet',$4,'cold')`,
        [String(req.user.id), clientId, v.name || `Samsara Vehicle ${v.id}`, `Imported from Samsara. ${v.make || ''} ${v.model || ''} ${v.year || ''}`.trim()]
      );
      imported++;
    }
    res.json({ ok: true, imported, skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/integrations/motive/vehicles', authMiddleware, async (req, res) => {
  const settingsRow = await pool.query(`SELECT settings_json FROM users WHERE id=$1`, [String(req.user.id)]);
  const s = settingsRow.rows[0]?.settings_json || {};
  if (!s.motiveApiKey) return res.status(400).json({ error: 'Motive API key not configured' });
  try {
    const resp = await fetch('https://api.keeptruckin.com/v1/vehicles?per_page=100', {
      headers: { Authorization: `Bearer ${s.motiveApiKey}`, 'X-Api-Key': s.motiveApiKey },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || 'Motive API error');
    const vehicles = (data.vehicles || []).map((v) => ({
      id: String(v.vehicle?.id || v.id), name: v.vehicle?.number || v.vehicle?.name, make: v.vehicle?.make, model: v.vehicle?.model, year: v.vehicle?.year, vin: v.vehicle?.vin, license_plate: v.vehicle?.license_plate_state,
    }));
    res.json({ ok: true, vehicles, count: vehicles.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/integrations/motive/import', authMiddleware, async (req, res) => {
  const settingsRow = await pool.query(`SELECT settings_json FROM users WHERE id=$1`, [String(req.user.id)]);
  const s = settingsRow.rows[0]?.settings_json || {};
  if (!s.motiveApiKey) return res.status(400).json({ error: 'Motive API key not configured' });
  try {
    const resp = await fetch('https://api.keeptruckin.com/v1/vehicles?per_page=100', {
      headers: { Authorization: `Bearer ${s.motiveApiKey}`, 'X-Api-Key': s.motiveApiKey },
    });
    const data = await resp.json();
    const vehicles = data.vehicles || [];
    const { vehicle_ids } = req.body;
    const toImport = vehicle_ids ? vehicles.filter((v) => vehicle_ids.includes(String(v.vehicle?.id))) : vehicles;

    let imported = 0, skipped = 0;
    for (const v of toImport) {
      const vid = String(v.vehicle?.id || Math.random());
      const clientId = `motive-${vid}`;
      const existing = await pool.query(`SELECT id FROM leads WHERE user_id=$1 AND client_id=$2`, [String(req.user.id), clientId]);
      if (existing.rows.length) { skipped++; continue; }
      await pool.query(
        `INSERT INTO leads (user_id, client_id, company, category, notes, status) VALUES ($1,$2,$3,'fleet',$4,'cold')`,
        [String(req.user.id), clientId, v.vehicle?.number || `Motive Vehicle ${vid}`, `Imported from Motive. ${v.vehicle?.make || ''} ${v.vehicle?.model || ''}`.trim()]
      );
      imported++;
    }
    res.json({ ok: true, imported, skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dynamic Wrap Content Management ──────────────────────────────────────────

app.get('/content', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM wrap_content WHERE user_id=$1 ORDER BY created_at DESC`, [String(req.user.id)]);
  res.json({ content: rows });
});

app.post('/content', authMiddleware, upload.single('image'), async (req, res) => {
  const { name, tags } = req.body;
  const parsedTags = (() => { try { return JSON.parse(tags || '[]'); } catch { return []; } })();
  let imageUrl = null;
  if (req.file) {
    imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  }
  const { rows } = await pool.query(
    `INSERT INTO wrap_content (user_id, name, image_url, tags) VALUES ($1,$2,$3,$4) RETURNING *`,
    [String(req.user.id), name || 'Untitled', imageUrl, parsedTags]
  );
  res.json({ ok: true, content: rows[0] });
});

app.put('/content/:id', authMiddleware, async (req, res) => {
  const { name, description, tags } = req.body;
  const { rows } = await pool.query(
    `UPDATE wrap_content SET name=COALESCE($1,name), description=COALESCE($2,description), tags=COALESCE($3,tags) WHERE id=$4 AND user_id=$5 RETURNING *`,
    [name, description, tags, req.params.id, String(req.user.id)]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, content: rows[0] });
});

app.delete('/content/:id', authMiddleware, async (req, res) => {
  await pool.query(`DELETE FROM wrap_content WHERE id=$1 AND user_id=$2`, [req.params.id, String(req.user.id)]);
  res.json({ ok: true });
});

app.get('/content/schedules', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cs.*, row_to_json(wc) as content FROM content_schedules cs
     LEFT JOIN wrap_content wc ON wc.id = cs.content_id
     WHERE cs.user_id=$1 ORDER BY cs.start_date ASC`,
    [String(req.user.id)]
  );
  res.json({ schedules: rows });
});

app.post('/content/schedules', authMiddleware, async (req, res) => {
  const { content_id, vehicle_group, start_date, end_date, start_time, end_time, geo_trigger, priority, notes } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO content_schedules (user_id,content_id,vehicle_group,start_date,end_date,start_time,end_time,geo_trigger,priority,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [String(req.user.id), content_id, vehicle_group || 'all', start_date, end_date || null, start_time || null, end_time || null, geo_trigger || null, priority || 0, notes || null]
  );
  res.json({ ok: true, schedule: rows[0] });
});

app.put('/content/schedules/:id', authMiddleware, async (req, res) => {
  const { vehicle_group, start_date, end_date, start_time, end_time, geo_trigger, priority, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE content_schedules SET vehicle_group=$1,start_date=$2,end_date=$3,start_time=$4,end_time=$5,geo_trigger=$6,priority=$7,notes=$8
     WHERE id=$9 AND user_id=$10 RETURNING *`,
    [vehicle_group, start_date, end_date, start_time, end_time, geo_trigger, priority, notes, req.params.id, String(req.user.id)]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, schedule: rows[0] });
});

app.delete('/content/schedules/:id', authMiddleware, async (req, res) => {
  await pool.query(`DELETE FROM content_schedules WHERE id=$1 AND user_id=$2`, [req.params.id, String(req.user.id)]);
  res.json({ ok: true });
});

app.get('/content/active', authMiddleware, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toTimeString().slice(0, 5);
  const { rows } = await pool.query(
    `SELECT cs.vehicle_group, row_to_json(wc) as content FROM content_schedules cs
     LEFT JOIN wrap_content wc ON wc.id = cs.content_id
     WHERE cs.user_id=$1
       AND cs.start_date <= $2
       AND (cs.end_date IS NULL OR cs.end_date >= $2)
       AND (cs.start_time IS NULL OR cs.start_time <= $3)
       AND (cs.end_time IS NULL OR cs.end_time >= $3)
     ORDER BY cs.priority DESC`,
    [String(req.user.id), today, now]
  );
  res.json({ active: rows });
});

app.get('/content/export', authMiddleware, async (req, res) => {
  const { rows: schedules } = await pool.query(
    `SELECT cs.*, row_to_json(wc) as content FROM content_schedules cs
     LEFT JOIN wrap_content wc ON wc.id = cs.content_id
     WHERE cs.user_id=$1 ORDER BY cs.start_date ASC, cs.priority DESC`,
    [String(req.user.id)]
  );
  res.json({ exported_at: new Date().toISOString(), schedules });
});

// ── Client Portal ────────────────────────────────────────────────────────────

app.post('/portal-links', authMiddleware, async (req, res) => {
  const { lead_id, label } = req.body;
  if (!lead_id) return res.status(400).json({ error: 'lead_id required' });
  const uid = String(req.user.id);
  try {
    const own = await pool.query('SELECT id FROM leads WHERE id=$1 AND user_id=$2', [lead_id, uid]);
    if (!own.rows.length) return res.status(404).json({ error: 'Lead not found' });
    // Upsert — one link per lead
    const existing = await pool.query('SELECT * FROM portal_links WHERE lead_id=$1 AND user_id=$2', [lead_id, uid]);
    if (existing.rows.length) return res.json({ ok: true, link: existing.rows[0] });
    const token = crypto.randomBytes(24).toString('hex');
    const { rows } = await pool.query(
      `INSERT INTO portal_links (user_id, lead_id, token, label) VALUES ($1,$2,$3,$4) RETURNING *`,
      [uid, lead_id, token, label || null]
    );
    res.json({ ok: true, link: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/portal-links/lead/:leadId', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM portal_links WHERE lead_id=$1 AND user_id=$2',
      [req.params.leadId, String(req.user.id)]
    );
    res.json({ link: rows[0] || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/portal-links/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM portal_links WHERE id=$1 AND user_id=$2', [req.params.id, String(req.user.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUBLIC — client portal page
app.get('/portal/:token', async (req, res) => {
  try {
    const { rows: linkRows } = await pool.query(
      `SELECT pl.*, l.company, l.contact_name, l.status, l.category, l.city, l.state, l.email AS lead_email
       FROM portal_links pl JOIN leads l ON l.id = pl.lead_id
       WHERE pl.token=$1`, [req.params.token]
    );
    if (!linkRows.length) return res.status(404).send('<h1>Link not found or expired.</h1>');
    const link = linkRows[0];

    // Fetch shop settings
    const { rows: uRows } = await pool.query('SELECT settings_json FROM users WHERE id=$1', [link.user_id]);
    const s = uRows[0]?.settings_json || {};

    // Fetch job photos for any installed jobs linked to this lead
    const { rows: photos } = await pool.query(
      `SELECT jp.* FROM job_photos jp
       JOIN installed_jobs ij ON ij.id = jp.job_id
       WHERE ij.lead_id=$1 ORDER BY jp.photo_type, jp.created_at ASC`,
      [link.lead_id]
    );

    // Fetch active bid/quote
    const { rows: bids } = await pool.query(
      `SELECT * FROM bids WHERE lead_id=$1 AND status NOT IN ('won','lost','no_bid') ORDER BY created_at DESC LIMIT 1`,
      [link.lead_id]
    );
    const bid = bids[0];

    // Fetch design concept (latest activity with image)
    const { rows: designActs } = await pool.query(
      `SELECT * FROM lead_activities WHERE lead_id=$1 AND (type='note_added') AND metadata->>'image_url' IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
      [link.lead_id]
    );
    const designImg = designActs[0]?.metadata?.image_url;

    // Fetch recent activities (last 8, public-safe types only)
    const { rows: activities } = await pool.query(
      `SELECT type, subject, created_at FROM lead_activities
       WHERE lead_id=$1 AND type IN ('email_sent','called','meeting_set','status_changed','note_added')
       ORDER BY created_at DESC LIMIT 8`,
      [link.lead_id]
    );

    const STATUS_STEPS = ['new', 'contacted', 'replied', 'meeting', 'proposal', 'won'];
    const currentStepIdx = STATUS_STEPS.indexOf(link.status);

    const ACT_LABELS = {
      email_sent: 'Email sent', called: 'Call made', meeting_set: 'Meeting scheduled',
      status_changed: 'Status updated', note_added: 'Update',
    };

    const beforePhotos = photos.filter((p) => p.photo_type === 'before');
    const afterPhotos  = photos.filter((p) => p.photo_type === 'after');
    const detailPhotos = photos.filter((p) => p.photo_type === 'detail' || p.photo_type === 'other');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${link.company} — ${s.companyName || 'Your Wrap Shop'}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e5e7eb; min-height: 100vh; }
  a { color: #6366f1; }
  .hero { background: linear-gradient(135deg, #1a1c22 0%, #16181f 100%); border-bottom: 1px solid #2d2f3a; padding: 28px 20px; }
  .hero-inner { max-width: 780px; margin: 0 auto; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
  .brand-name { font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -.5px; }
  .brand-name span { color: #6366f1; }
  .brand-tag { font-size: 11px; color: #6b7280; margin-top: 3px; }
  .portal-badge { background: #6366f122; border: 1px solid #6366f155; color: #818cf8; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; letter-spacing: .05em; }
  .page { max-width: 780px; margin: 0 auto; padding: 28px 20px; display: flex; flex-direction: column; gap: 24px; }
  .section { background: #1a1c22; border: 1px solid #2d2f3a; border-radius: 14px; overflow: hidden; }
  .section-header { padding: 16px 20px; border-bottom: 1px solid #2d2f3a; display: flex; align-items: center; justify-content: space-between; }
  .section-title { font-size: 13px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .08em; }
  .section-body { padding: 20px; }
  .project-name { font-size: 26px; font-weight: 800; color: #fff; margin-bottom: 6px; }
  .project-meta { display: flex; gap: 10px; flex-wrap: wrap; }
  .meta-chip { background: #2d2f3a; border-radius: 6px; padding: 3px 10px; font-size: 12px; color: #9ca3af; font-weight: 600; }
  .meta-chip.accent { background: #6366f122; color: #818cf8; border: 1px solid #6366f133; }
  .steps { display: flex; gap: 0; overflow-x: auto; padding: 4px 0; }
  .step { flex: 1; min-width: 80px; text-align: center; position: relative; }
  .step::before { content: ''; position: absolute; top: 16px; left: 0; right: 0; height: 2px; background: #2d2f3a; z-index: 0; }
  .step:first-child::before { left: 50%; }
  .step:last-child::before { right: 50%; }
  .step-dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #2d2f3a; background: #1a1c22; margin: 6px auto; position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; font-size: 9px; }
  .step.done .step-dot { background: #6366f1; border-color: #6366f1; }
  .step.current .step-dot { background: #fff; border-color: #6366f1; box-shadow: 0 0 0 4px #6366f133; }
  .step.done::before, .step.current::before { background: #6366f1; }
  .step-label { font-size: 10px; color: #6b7280; margin-top: 4px; }
  .step.done .step-label, .step.current .step-label { color: #e5e7eb; font-weight: 700; }
  .photo-section { display: flex; flex-direction: column; gap: 12px; }
  .photo-group-label { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .08em; }
  .photo-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .photo-item { border-radius: 10px; overflow: hidden; aspect-ratio: 4/3; }
  .photo-item img { width: 100%; height: 100%; object-fit: cover; }
  .quote-box { background: linear-gradient(135deg, #1e2030 0%, #1a1c22 100%); border: 1px solid #6366f133; border-radius: 10px; padding: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .quote-value { font-size: 32px; font-weight: 900; color: #fff; }
  .quote-label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
  .quote-note { font-size: 11px; color: #6b7280; margin-top: 4px; }
  .cta-btn { background: #6366f1; color: #fff; border: none; padding: 14px 32px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; width: 100%; margin-top: 12px; transition: background .15s; }
  .cta-btn:hover { background: #4f46e5; }
  .cta-btn:disabled { background: #4b5563; cursor: default; }
  .approved-badge { background: #22c55e22; border: 1px solid #22c55e44; color: #22c55e; padding: 10px 20px; border-radius: 8px; font-weight: 700; text-align: center; font-size: 14px; }
  .feedback-form { display: flex; flex-direction: column; gap: 12px; }
  .feedback-textarea { width: 100%; background: #0f1117; border: 1px solid #2d2f3a; border-radius: 8px; padding: 12px; color: #e5e7eb; font-size: 14px; font-family: inherit; resize: vertical; min-height: 80px; }
  .feedback-textarea:focus { outline: none; border-color: #6366f1; }
  .submit-btn { background: #2d2f3a; color: #e5e7eb; border: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .submit-btn:hover { background: #374151; }
  .activity-list { display: flex; flex-direction: column; gap: 0; }
  .activity-row { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #2d2f3a; align-items: flex-start; }
  .activity-row:last-child { border-bottom: none; }
  .activity-dot { width: 8px; height: 8px; border-radius: 50%; background: #6366f1; flex-shrink: 0; margin-top: 5px; }
  .activity-text { font-size: 12px; color: #9ca3af; }
  .activity-time { font-size: 10px; color: #4b5563; margin-top: 2px; }
  .contact-row { display: flex; gap: 12px; align-items: center; }
  .contact-avatar { width: 40px; height: 40px; border-radius: 50%; background: #6366f133; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; color: #818cf8; flex-shrink: 0; }
  .contact-info { display: flex; flex-direction: column; gap: 2px; }
  .contact-name { font-size: 14px; font-weight: 700; color: #fff; }
  .contact-detail { font-size: 12px; color: #6b7280; }
  .design-img { width: 100%; border-radius: 10px; }
  .footer { text-align: center; padding: 20px; color: #4b5563; font-size: 11px; }
  @media (max-width: 600px) { .hero-inner { flex-direction: column; } .steps { gap: 4px; } .step-label { font-size: 9px; } }
</style>
</head>
<body>

<div class="hero">
  <div class="hero-inner">
    <div>
      <div class="brand-name">${s.companyName || 'our shop'}<span>.</span></div>
      <div class="brand-tag">${s.companyTagline || 'Vehicle Wraps & Fleet Graphics'}</div>
    </div>
    <span class="portal-badge">CLIENT PORTAL</span>
  </div>
</div>

<div class="page">

  <!-- Project Header -->
  <div class="section">
    <div class="section-body">
      <div class="project-name">${link.company}</div>
      <div class="project-meta">
        ${link.category ? `<span class="meta-chip accent">${link.category.toUpperCase()}</span>` : ''}
        ${link.city || link.state ? `<span class="meta-chip">📍 ${[link.city, link.state].filter(Boolean).join(', ')}</span>` : ''}
        ${link.contact_name ? `<span class="meta-chip">👤 ${link.contact_name}</span>` : ''}
      </div>
    </div>
  </div>

  <!-- Status Progress -->
  <div class="section">
    <div class="section-header"><span class="section-title">Project Status</span></div>
    <div class="section-body">
      <div class="steps">
        ${['New', 'Contacted', 'Replied', 'Meeting', 'Proposal', 'Won'].map((label, i) => {
          const cls = i < currentStepIdx ? 'done' : i === currentStepIdx ? 'current' : '';
          const checkmark = i < currentStepIdx ? '✓' : '';
          return `<div class="step ${cls}"><div class="step-dot">${checkmark}</div><div class="step-label">${label}</div></div>`;
        }).join('')}
      </div>
    </div>
  </div>

  ${bid ? `
  <!-- Quote -->
  <div class="section">
    <div class="section-header"><span class="section-title">Your Quote</span></div>
    <div class="section-body">
      <div class="quote-box">
        <div>
          <div class="quote-label">Project Estimate</div>
          <div class="quote-value">${bid.estimated_value ? `$${Number(bid.estimated_value).toLocaleString()}` : '—'}</div>
          <div class="quote-note">${bid.project_name}</div>
        </div>
        ${bid.bid_due ? `<div><div class="quote-label">Quote Valid Until</div><div style="font-size:16px;font-weight:700;color:#fff">${new Date(bid.bid_due).toLocaleDateString('en-US', {month:'long',day:'numeric',year:'numeric'})}</div></div>` : ''}
      </div>
      ${link.status !== 'won' ? `
      <form id="approve-form" onsubmit="submitApproval(event)">
        <button type="submit" class="cta-btn" id="approve-btn">✓ Approve This Quote</button>
      </form>
      <p id="approved-msg" class="approved-badge" style="display:none;margin-top:12px">✓ Quote approved — we'll be in touch shortly!</p>
      ` : `<div class="approved-badge" style="margin-top:12px">✓ Project in progress</div>`}
    </div>
  </div>` : ''}

  ${(beforePhotos.length > 0 || afterPhotos.length > 0 || detailPhotos.length > 0) ? `
  <!-- Job Photos -->
  <div class="section">
    <div class="section-header"><span class="section-title">Install Documentation</span></div>
    <div class="section-body photo-section">
      ${beforePhotos.length > 0 ? `<div class="photo-group-label">Before</div><div class="photo-row">${beforePhotos.map((p) => `<div class="photo-item"><img src="${p.image_data}" alt="${p.caption||'Before'}"></div>`).join('')}</div>` : ''}
      ${afterPhotos.length > 0 ? `<div class="photo-group-label">After</div><div class="photo-row">${afterPhotos.map((p) => `<div class="photo-item"><img src="${p.image_data}" alt="${p.caption||'After'}"></div>`).join('')}</div>` : ''}
      ${detailPhotos.length > 0 ? `<div class="photo-group-label">Detail</div><div class="photo-row">${detailPhotos.map((p) => `<div class="photo-item"><img src="${p.image_data}" alt="${p.caption||'Detail'}"></div>`).join('')}</div>` : ''}
    </div>
  </div>` : ''}

  ${designImg ? `
  <!-- Design Concept -->
  <div class="section">
    <div class="section-header"><span class="section-title">Design Concept</span></div>
    <div class="section-body"><img src="${designImg}" class="design-img" alt="Wrap Design Concept"></div>
  </div>` : ''}

  ${activities.length > 0 ? `
  <!-- Activity Timeline -->
  <div class="section">
    <div class="section-header"><span class="section-title">Project Updates</span></div>
    <div class="section-body">
      <div class="activity-list">
        ${activities.map((a) => `
        <div class="activity-row">
          <div class="activity-dot"></div>
          <div>
            <div class="activity-text">${ACT_LABELS[a.type] || a.type}${a.subject ? ` — ${a.subject}` : ''}</div>
            <div class="activity-time">${new Date(a.created_at).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'})}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </div>` : ''}

  <!-- Feedback -->
  <div class="section">
    <div class="section-header"><span class="section-title">Leave Feedback</span></div>
    <div class="section-body">
      <form id="feedback-form" class="feedback-form" onsubmit="submitFeedback(event)">
        <textarea class="feedback-textarea" id="feedback-text" placeholder="Questions, requests, or feedback…" rows="3"></textarea>
        <div style="display:flex;justify-content:flex-end;">
          <button type="submit" class="submit-btn">Send Feedback</button>
        </div>
      </form>
      <p id="feedback-msg" style="display:none;font-size:12px;color:#22c55e;margin-top:8px">Thank you — we'll follow up shortly.</p>
    </div>
  </div>

  <!-- Contact -->
  <div class="section">
    <div class="section-header"><span class="section-title">Your Contact</span></div>
    <div class="section-body">
      <div class="contact-row">
        <div class="contact-avatar">${(s.senderName || 'S').charAt(0).toUpperCase()}</div>
        <div class="contact-info">
          <span class="contact-name">${s.senderName || s.companyName || 'our shop'}</span>
          <span class="contact-detail">${s.senderTitle || ''}</span>
          ${s.senderEmail ? `<a href="mailto:${s.senderEmail}" class="contact-detail">${s.senderEmail}</a>` : ''}
          ${s.senderPhone ? `<span class="contact-detail">${s.senderPhone}</span>` : ''}
        </div>
      </div>
    </div>
  </div>

</div>

<div class="footer">Powered by WrapLeads · ${s.companyName || 'our shop'}</div>

<script>
  async function submitApproval(e) {
    e.preventDefault();
    document.getElementById('approve-btn').disabled = true;
    document.getElementById('approve-btn').textContent = 'Approving…';
    try {
      await fetch('/portal/${req.params.token}/approve', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
      document.getElementById('approve-form').style.display = 'none';
      document.getElementById('approved-msg').style.display = 'block';
    } catch { document.getElementById('approve-btn').disabled = false; document.getElementById('approve-btn').textContent = '✓ Approve This Quote'; }
  }
  async function submitFeedback(e) {
    e.preventDefault();
    const text = document.getElementById('feedback-text').value.trim();
    if (!text) return;
    document.querySelector('.submit-btn').disabled = true;
    try {
      await fetch('/portal/${req.params.token}/feedback', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ feedback: text }) });
      document.getElementById('feedback-form').style.display = 'none';
      document.getElementById('feedback-msg').style.display = 'block';
    } catch { document.querySelector('.submit-btn').disabled = false; }
  }
</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (e) { res.status(500).send('Server error'); }
});

// Portal actions — PUBLIC (no auth, token identifies)
app.post('/portal/:token/approve', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM portal_links WHERE token=$1', [req.params.token]);
    if (!rows.length) return res.status(404).json({ error: 'Invalid token' });
    const link = rows[0];
    await pool.query(`UPDATE leads SET status='proposal', updated_at=NOW() WHERE id=$1`, [link.lead_id]);
    await logActivity(pool, { leadId: link.lead_id, userId: link.user_id, type: 'status_changed', subject: 'Client approved quote via portal' });
    await createNotification(link.user_id, {
      type: 'email_reply',
      title: `${(await pool.query('SELECT company FROM leads WHERE id=$1',[link.lead_id])).rows[0]?.company} approved their quote!`,
      body: 'Client clicked "Approve" on the portal link. Follow up now.',
      metadata: { lead_id: link.lead_id },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/portal/:token/feedback', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM portal_links WHERE token=$1', [req.params.token]);
    if (!rows.length) return res.status(404).json({ error: 'Invalid token' });
    const link = rows[0];
    const { feedback } = req.body;
    if (!feedback?.trim()) return res.status(400).json({ error: 'feedback required' });
    await logActivity(pool, { leadId: link.lead_id, userId: link.user_id, type: 'note_added', subject: 'Client feedback via portal', body: feedback });
    await createNotification(link.user_id, {
      type: 'email_reply',
      title: `New feedback from ${(await pool.query('SELECT company FROM leads WHERE id=$1',[link.lead_id])).rows[0]?.company}`,
      body: feedback.slice(0, 200),
      metadata: { lead_id: link.lead_id },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// AI Proposal Writer
// ============================================================================

// Generate a full proposal for a lead
app.post('/leads/:id/proposal', authMiddleware, requireWrapOS, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const leadId = Number(req.params.id);
    const { extra_notes = '' } = req.body || {};
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Missing ANTHROPIC_API_KEY' });

    const [leadR, settR] = await Promise.all([
      pool.query('SELECT * FROM leads WHERE id=$1 AND user_id=$2', [leadId, uid]),
      pool.query('SELECT settings_json FROM users WHERE id=$1', [uid]),
    ]);
    const lead = leadR.rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const s = settR.rows[0]?.settings_json || {};

    const company = lead.company;
    const contact = lead.contact_name || 'Team';
    const category = lead.category;
    const fleet = lead.fleet_size || '';
    const pitch = lead.pitch_angle || '';
    const city = lead.city || '';
    const state = lead.state || '';
    const priceLow = parseFloat(s.pricePerSqftLow || '8');
    const priceHigh = parseFloat(s.pricePerSqftHigh || '14');
    const shopName = s.companyName || 'our shop';
    const senderName = s.senderName || 'the team';
    const senderTitle = s.senderTitle || 'Installer / Sales';
    const portfolio = s.portfolioUrl || '';

    const prompt = `You are writing a professional vehicle wrap proposal for ${shopName}, a certified 3M and Avery wrap installer.

Client: ${company}${city ? `, ${city}, ${state}` : ''}
Contact: ${contact}
Category: ${category}
Fleet size: ${fleet || 'not specified'}
Pitch angle: ${pitch || 'general wrap inquiry'}
Extra notes: ${extra_notes || 'none'}
Price per sq ft: $${priceLow}–$${priceHigh}

Write a complete professional proposal with EXACTLY these 4 JSON sections. Be specific, confident, and persuasive. No fluff. Write as ${shopName}.

Return ONLY valid JSON:
{
  "title": "Vehicle Wrap Proposal — ${company}",
  "intro": "<2 short paragraphs: personalized opening specific to their business + credibility statement for ${shopName}>",
  "services": "<HTML list items describing exactly what they get based on category '${category}'. Include materials (3M/Avery), warranty, turnaround. Be specific to their fleet/category.>",
  "pricing_html": "<HTML table with 2-3 pricing tiers (e.g. Full Wrap / Partial / Spot). Use the price range $${priceLow}–$${priceHigh}/sqft. Include estimated total ranges based on fleet size if known.>",
  "timeline": "<3–4 steps: Design Approval → Print Production → Installation → Delivery. Give realistic day ranges.>"
}`;

    const raw = await claudeHaiku(apiKey, [{ role: 'user', content: prompt }], 2500);
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    } catch {
      return res.status(500).json({ error: 'AI response parse failed' });
    }

    const token = require('crypto').randomBytes(20).toString('hex');
    const { rows } = await pool.query(`
      INSERT INTO proposals (user_id, lead_id, token, title, intro, services, pricing_html, timeline, notes, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft') RETURNING *
    `, [uid, leadId, token, parsed.title, parsed.intro, parsed.services, parsed.pricing_html, parsed.timeline, extra_notes]);

    await logActivity(pool, { leadId, userId: uid, type: 'email_generated', subject: `Proposal generated: ${parsed.title}`, metadata: { proposal_token: token } });
    res.json({ ok: true, proposal: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List proposals for user
app.get('/proposals', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const { rows } = await pool.query(`
      SELECT p.*, l.company AS lead_company
      FROM proposals p LEFT JOIN leads l ON l.id=p.lead_id
      WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 50
    `, [uid]);
    res.json({ proposals: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Proposal view count (for ProposalSection polling)
app.get('/proposals/:id/views', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT view_count, last_viewed_at FROM proposals WHERE id=$1 AND user_id=$2`,
      [req.params.id, String(req.user.id)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const r = rows[0];
    let last_viewed_ago = null;
    if (r.last_viewed_at) {
      const mins = Math.floor((Date.now() - new Date(r.last_viewed_at).getTime()) / 60000);
      if (mins < 60) last_viewed_ago = `${mins}m ago`;
      else if (mins < 1440) last_viewed_ago = `${Math.floor(mins / 60)}h ago`;
      else last_viewed_ago = `${Math.floor(mins / 1440)}d ago`;
    }
    res.json({ view_count: r.view_count ?? 0, last_viewed_ago });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete proposal
app.delete('/proposals/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM proposals WHERE id=$1 AND user_id=$2', [req.params.id, String(req.user.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Quote / Invoice Builder ────────────────────────────────────────────────

app.get('/leads/:id/quotes', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const leadId = parseInt(req.params.id);
    const leadCheck = await pool.query('SELECT id FROM leads WHERE id=$1 AND user_id=$2', [leadId, uid]);
    if (!leadCheck.rows.length) return res.status(404).json({ error: 'Lead not found' });
    const { rows } = await pool.query(
      'SELECT * FROM shop_quotes WHERE lead_id=$1 AND user_id=$2 ORDER BY created_at DESC',
      [leadId, uid]
    );
    res.json({ quotes: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/leads/:id/quotes', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const leadId = parseInt(req.params.id);
    const leadCheck = await pool.query('SELECT id FROM leads WHERE id=$1 AND user_id=$2', [leadId, uid]);
    if (!leadCheck.rows.length) return res.status(404).json({ error: 'Lead not found' });
    const { title, line_items, tax_rate, discount, notes, valid_days, status } = req.body;
    const items = Array.isArray(line_items) ? line_items : [];
    const subtotal = items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const taxR = parseFloat(tax_rate) || 0;
    const disc = parseFloat(discount) || 0;
    const taxAmt = Math.round(subtotal * taxR) / 100;
    const total = subtotal + taxAmt - disc;
    const countR = await pool.query('SELECT COUNT(*)::INT AS n FROM shop_quotes WHERE user_id=$1', [uid]);
    const qNum = `Q-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(countR.rows[0].n + 1).padStart(3,'0')}`;
    const { rows } = await pool.query(
      `INSERT INTO shop_quotes (user_id, lead_id, quote_number, title, status, line_items, subtotal, tax_rate, tax_amount, discount, total, notes, valid_days)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [uid, leadId, qNum, title || 'Vehicle Wrap Quote', status || 'draft',
       JSON.stringify(items), subtotal, taxR, taxAmt, disc, total, notes || null, parseInt(valid_days) || 30]
    );
    await logActivity(pool, {
      leadId, userId: uid, type: 'quote_created',
      subject: `Quote created: ${rows[0].quote_number} — $${parseFloat(rows[0].total).toFixed(2)}`,
      metadata: { quote_id: rows[0].id, total: rows[0].total, quote_number: rows[0].quote_number },
    });
    res.json({ ok: true, quote: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/quotes/:id', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const quoteId = parseInt(req.params.id);
    const existing = await pool.query('SELECT id, lead_id, status AS old_status FROM shop_quotes WHERE id=$1 AND user_id=$2', [quoteId, uid]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Quote not found' });
    const { lead_id: quoteLead, old_status } = existing.rows[0];
    const { title, line_items, tax_rate, discount, notes, valid_days, status } = req.body;
    const items = Array.isArray(line_items) ? line_items : [];
    const subtotal = items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const taxR = parseFloat(tax_rate) || 0;
    const disc = parseFloat(discount) || 0;
    const taxAmt = Math.round(subtotal * taxR) / 100;
    const total = subtotal + taxAmt - disc;
    const { rows } = await pool.query(
      `UPDATE shop_quotes SET
        title=$1, line_items=$2::jsonb, subtotal=$3, tax_rate=$4, tax_amount=$5,
        discount=$6, total=$7, notes=$8, valid_days=$9, status=$10,
        sent_at=CASE WHEN $10='sent' AND sent_at IS NULL THEN NOW() ELSE sent_at END,
        accepted_at=CASE WHEN $10='accepted' AND accepted_at IS NULL THEN NOW() ELSE accepted_at END,
        updated_at=NOW()
       WHERE id=$11 AND user_id=$12 RETURNING *`,
      [title, JSON.stringify(items), subtotal, taxR, taxAmt, disc, total,
       notes || null, parseInt(valid_days) || 30, status || 'draft', quoteId, uid]
    );
    const newStatus = status || 'draft';
    if (newStatus !== old_status && (newStatus === 'sent' || newStatus === 'accepted')) {
      await logActivity(pool, {
        leadId: quoteLead, userId: uid,
        type: newStatus === 'accepted' ? 'quote_accepted' : 'quote_sent',
        subject: newStatus === 'accepted'
          ? `Quote accepted! ${rows[0].quote_number} — $${parseFloat(rows[0].total).toFixed(2)}`
          : `Quote sent to client: ${rows[0].quote_number} — $${parseFloat(rows[0].total).toFixed(2)}`,
        metadata: { quote_id: rows[0].id, total: rows[0].total, quote_number: rows[0].quote_number },
      });
    }
    res.json({ ok: true, quote: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/quotes/:id', authMiddleware, async (req, res) => {
  try {
    const uid = String(req.user.id);
    await pool.query('DELETE FROM shop_quotes WHERE id=$1 AND user_id=$2', [parseInt(req.params.id), uid]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUBLIC — proposal page (client-facing, no auth)
app.get('/proposals/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, l.company, l.contact_name, l.email, l.city, l.state,
             u.settings_json
      FROM proposals p
      LEFT JOIN leads l ON l.id = p.lead_id
      JOIN users u ON u.id = p.user_id::bigint
      WHERE p.token=$1
    `, [req.params.token]);
    if (!rows.length) return res.status(404).send('<h2>Proposal not found or expired.</h2>');
    const p = rows[0];
    // Track view + notify owner (once per unique view session — only when first view or new view since last check)
    pool.query(`UPDATE proposals SET view_count=COALESCE(view_count,0)+1, last_viewed_at=NOW() WHERE token=$1 RETURNING user_id, view_count, lead_id, title`, [req.params.token])
      .then(async ({ rows: vRows }) => {
        if (!vRows.length) return;
        const vr = vRows[0];
        // Notify on first view and every 3rd view after that
        if (vr.view_count === 1 || vr.view_count % 3 === 0) {
          const viewWord = vr.view_count === 1 ? 'just opened' : `opened ${vr.view_count}x`;
          await createNotification(String(vr.user_id), {
            type: 'email_reply',
            title: `👁 ${p.company || 'A prospect'} ${viewWord} your proposal!`,
            body: vr.title || 'They\'re reading it right now — great time to follow up.',
            metadata: { proposal_token: req.params.token, lead_id: vr.lead_id },
          });
        }
      }).catch(() => {});
    const s = p.settings_json || {};
    const shopName = s.companyName || 'our shop';
    const senderName = s.senderName || '';
    const senderEmail = s.senderEmail || '';
    const senderPhone = s.senderPhone || '';
    const portfolio = s.portfolioUrl || '';
    const approved = p.status === 'approved';

    const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f8f8;color:#111;line-height:1.6}
  .wrap{max-width:760px;margin:0 auto;background:#fff;min-height:100vh;box-shadow:0 0 40px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#fff;padding:48px 48px 36px}
  .logo{font-size:22px;font-weight:900;letter-spacing:-.5px;margin-bottom:4px;color:#fff}
  .tagline{font-size:12px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.1em;margin-bottom:32px}
  .prop-title{font-size:28px;font-weight:800;line-height:1.2;margin-bottom:8px}
  .prop-meta{font-size:13px;color:rgba(255,255,255,.6)}
  .body-wrap{padding:40px 48px}
  .section{margin-bottom:36px}
  .section-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#6366f1;margin-bottom:12px;border-bottom:2px solid #6366f122;padding-bottom:6px}
  .section p{font-size:14px;color:#333;margin-bottom:10px}
  .section ul,.section ol{padding-left:20px;font-size:14px;color:#333}
  .section li{margin-bottom:6px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#f4f4f8;padding:10px 14px;text-align:left;font-weight:700;color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
  td{padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#333}
  tr:last-child td{border-bottom:none}
  .approve-section{background:#f0fdf4;border:2px solid #22c55e;border-radius:12px;padding:28px;text-align:center;margin-top:32px}
  .approve-title{font-size:18px;font-weight:800;color:#15803d;margin-bottom:8px}
  .approve-sub{font-size:13px;color:#166534;margin-bottom:20px}
  .approve-btn{background:#22c55e;color:#fff;border:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;letter-spacing:-.3px}
  .approve-btn:hover{background:#16a34a}
  .approved-badge{background:#dcfce7;border:2px solid #22c55e;border-radius:12px;padding:20px;text-align:center;color:#15803d;font-weight:700;font-size:16px}
  .footer{background:#f8f8f8;padding:24px 48px;border-top:1px solid #eee;font-size:12px;color:#888;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
  @media(max-width:600px){.body-wrap,.header,.footer{padding:24px 20px}.prop-title{font-size:22px}}
  @media print{body{background:#fff}.wrap{box-shadow:none}.approve-section,.approve-btn{display:none}}
</style>
</head><body>
<div class="wrap">
  <div class="header">
    <div class="logo">${shopName}</div>
    <div class="tagline">Vehicle Wraps · Fleet Graphics · Architectural Film</div>
    <div class="prop-title">${p.title}</div>
    <div class="prop-meta">Prepared for ${p.contact_name || p.company} · ${new Date(p.created_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
  </div>

  <div class="body-wrap">
    <div class="section">
      <div class="section-label">Introduction</div>
      ${(p.intro || '').split('\n\n').map(par => `<p>${par}</p>`).join('')}
    </div>

    <div class="section">
      <div class="section-label">Recommended Services</div>
      <ul>${p.services || ''}</ul>
    </div>

    <div class="section">
      <div class="section-label">Investment</div>
      ${p.pricing_html || ''}
    </div>

    <div class="section">
      <div class="section-label">Project Timeline</div>
      <ol>${(p.timeline || '').replace(/<li>/g,'<li>').replace(/<\/li>/g,'</li>')}</ol>
    </div>

    ${portfolio ? `<div class="section"><div class="section-label">Our Work</div><p>View our portfolio: <a href="${portfolio}" target="_blank">${portfolio}</a></p></div>` : ''}

    ${approved
      ? `<div class="approved-badge">✓ Proposal Approved — Thank you! We will be in touch shortly.</div>`
      : `<div class="approve-section">
          <div class="approve-title">Ready to move forward?</div>
          <div class="approve-sub">Click below to approve this proposal. We'll reach out within 1 business day to schedule your project.</div>
          <button class="approve-btn" id="approveBtn">✓ Approve This Proposal</button>
        </div>`}
  </div>

  <div class="footer">
    <span>${shopName}${senderName ? ' · ' + senderName : ''}</span>
    <span>${[senderPhone, senderEmail].filter(Boolean).join(' · ')}</span>
  </div>
</div>
<script>
const btn = document.getElementById('approveBtn');
if (btn) {
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Approving…';
    const resp = await fetch('/proposals/${req.params.token}/approve', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
    if (resp.ok) {
      btn.closest('.approve-section').innerHTML = '<div class="approved-badge">✓ Approved! We will reach out shortly. Thank you!</div>';
    } else {
      btn.textContent = 'Error — try again'; btn.disabled = false;
    }
  });
}
</script>
</body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (e) { res.status(500).send('Server error'); }
});

// PUBLIC — client approves proposal
app.post('/proposals/:token/approve', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM proposals WHERE token=$1', [req.params.token]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const p = rows[0];
    await pool.query(`UPDATE proposals SET status='approved', approved_at=NOW(), updated_at=NOW() WHERE token=$1`, [req.params.token]);
    if (p.lead_id) {
      await pool.query(`UPDATE leads SET status='proposal', updated_at=NOW() WHERE id=$1`, [p.lead_id]);
      const compR = await pool.query('SELECT company FROM leads WHERE id=$1', [p.lead_id]);
      await logActivity(pool, { leadId: p.lead_id, userId: p.user_id, type: 'status_changed', subject: 'Client approved proposal online' });
      await createNotification(p.user_id, {
        type: 'email_reply',
        title: `🎉 ${compR.rows[0]?.company || 'A client'} approved your proposal!`,
        body: 'They clicked Approve on the proposal page. Time to seal the deal.',
        metadata: { proposal_token: req.params.token, lead_id: p.lead_id },
      });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Quote Request (inbound lead form) ─────────────────────────────────────────

function getShopToken(userId) {
  return require('crypto').createHash('sha256').update(String(userId) + 'wrapleads_qr').digest('hex').slice(0, 16);
}

// Look up a user by their public quote/portfolio token. Uses the indexed
// shop_token column for O(1) lookups; falls back to a one-time backfill if the
// column is empty (e.g. older accounts created before the migration).
async function findUserByShopToken(shopToken) {
  if (!shopToken || typeof shopToken !== 'string') return null;
  let { rows } = await pool.query(
    `SELECT id, settings_json FROM users WHERE shop_token = $1 LIMIT 1`,
    [shopToken]
  );
  if (rows[0]) return rows[0];

  // Backfill: token wasn't persisted yet. Find the matching user once and
  // cache it forever.
  const all = await pool.query(`SELECT id, settings_json FROM users WHERE shop_token IS NULL`);
  for (const u of all.rows) {
    if (getShopToken(u.id) === shopToken) {
      await pool.query(`UPDATE users SET shop_token = $1 WHERE id = $2`, [shopToken, u.id]);
      return u;
    }
  }
  return null;
}

// Ensure the requesting user has a persisted shop_token. Cheap if already set.
async function ensureShopToken(userId) {
  const token = getShopToken(userId);
  await pool.query(
    `UPDATE users SET shop_token = $1 WHERE id = $2 AND shop_token IS NULL`,
    [token, userId]
  );
  return token;
}

app.get('/me/quote-link', authMiddleware, async (req, res) => {
  try {
    const token = await ensureShopToken(req.user.id);
    res.json({ token, url: `/quote-request/${token}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/quote-request/:shopToken', async (req, res) => {
  try {
    const { shopToken } = req.params;
    const user = await findUserByShopToken(shopToken);
    if (!user) return res.status(404).send('<h2>Page not found.</h2>');
    const s = user.settings_json || {};
    const shopName = s.companyName || 'our shop';
    const accent = '#ff6b35';

    res.send(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Request a Quote · ${shopName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#1a1d27;border:1px solid #2a2d3a;border-radius:16px;padding:40px;max-width:520px;width:100%}
.logo{font-size:26px;font-weight:900;color:#fff;margin-bottom:4px}.logo span{color:${accent}}
.sub{font-size:14px;color:#8892a4;margin-bottom:28px}
.label{font-size:11px;font-weight:700;color:#9ca3af;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em;display:block}
.field{display:flex;flex-direction:column;margin-bottom:14px}
input,select,textarea{background:#0f1117;border:1px solid #2a2d3a;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;width:100%;outline:none;transition:border-color .15s;font-family:inherit}
input:focus,select:focus,textarea:focus{border-color:${accent}}
select option{background:#1a1d27}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.btn{background:${accent};color:#fff;border:none;border-radius:8px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;width:100%;margin-top:8px;transition:background .15s}
.btn:hover{background:#e55a25}.btn:disabled{background:#555;cursor:not-allowed}
.success{text-align:center;padding:16px 0}
.success-icon{font-size:48px;margin-bottom:12px}
.success-title{font-size:22px;font-weight:800;color:#fff;margin-bottom:8px}
.success-sub{font-size:14px;color:#8892a4}
.err{color:#ef4444;font-size:12px;margin-top:6px}
</style></head><body>
<div class="card">
  <div id="form-view">
    <div class="logo">${shopName.split(' ')[0]}<span>${shopName.split(' ').slice(1).join(' ') || ' Graphix'}</span></div>
    <p class="sub">Tell us about your project and we'll get back to you within 24 hours.</p>
    <form id="qr-form">
      <div class="row">
        <div class="field"><label class="label">Your Name *</label><input name="name" required placeholder="Jane Smith" /></div>
        <div class="field"><label class="label">Company *</label><input name="company" required placeholder="ACME Logistics" /></div>
      </div>
      <div class="row">
        <div class="field"><label class="label">Email</label><input name="email" type="email" placeholder="you@company.com" /></div>
        <div class="field"><label class="label">Phone</label><input name="phone" type="tel" placeholder="(317) 555-0100" /></div>
      </div>
      <div class="row">
        <div class="field"><label class="label">Vehicle Type</label>
          <select name="vehicle_type">
            <option value="">— Select —</option>
            <option value="cargo_van_standard">Cargo Van</option>
            <option value="cargo_van_high_roof">Cargo Van (High Roof)</option>
            <option value="pickup_truck">Pickup Truck</option>
            <option value="suv_large">SUV / Large Vehicle</option>
            <option value="box_truck_16">Box Truck (16ft)</option>
            <option value="box_truck_24">Box Truck (24ft)</option>
            <option value="semi_full">Semi / Hauler</option>
            <option value="other">Other / Mixed Fleet</option>
          </select>
        </div>
        <div class="field"><label class="label">Fleet Size</label><input name="fleet_size" placeholder="e.g. 12 trucks" /></div>
      </div>
      <div class="field"><label class="label">Tell us about your project</label>
        <textarea name="message" rows="3" placeholder="What do you need wrapped? Any deadlines, colors, or design ideas?"></textarea>
      </div>
      <div id="form-err" class="err" style="display:none"></div>
      <button class="btn" type="submit" id="submit-btn">Send My Request →</button>
    </form>
  </div>
  <div id="success-view" class="success" style="display:none">
    <div class="success-icon">🎉</div>
    <div class="success-title">Request sent!</div>
    <p class="success-sub">We received your project details and will reach out within 24 hours.<br>— ${shopName}</p>
  </div>
</div>
<script>
document.getElementById('qr-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const err = document.getElementById('form-err');
  btn.disabled = true; btn.textContent = 'Sending…'; err.style.display = 'none';
  const data = Object.fromEntries(new FormData(e.target));
  try {
    const r = await fetch('/quote-request/${shopToken}', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Something went wrong');
    document.getElementById('form-view').style.display = 'none';
    document.getElementById('success-view').style.display = 'block';
  } catch(ex) {
    err.textContent = ex.message; err.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Send My Request →';
  }
});
</script></body></html>`);
  } catch (e) { res.status(500).send('<h2>Error loading form.</h2>'); }
});

app.post('/quote-request/:shopToken', express.json(), async (req, res) => {
  try {
    const { shopToken } = req.params;
    const user = await findUserByShopToken(shopToken);
    if (!user) return res.status(404).json({ error: 'Not found' });

    const { name, company, email, phone, vehicle_type, fleet_size, message } = req.body;
    if (!company?.trim()) return res.status(400).json({ error: 'Company is required' });

    // Create lead
    const leadRes = await pool.query(`
      INSERT INTO leads (user_id, company, contact_name, email, phone, fleet_size, category, status, source, notes)
      VALUES ($1,$2,$3,$4,$5,$6,'fleet','new','quote_form',$7)
      RETURNING id
    `, [String(user.id), company.trim(), name || '', email || '', phone || '', fleet_size || '',
        [message, vehicle_type ? `Vehicle: ${vehicle_type}` : null].filter(Boolean).join('\n')]);

    const leadId = leadRes.rows[0].id;

    await pool.query(`INSERT INTO quote_requests (user_id,name,company,email,phone,vehicle_type,fleet_size,message,lead_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [String(user.id), name||'', company.trim(), email||'', phone||'', vehicle_type||'', fleet_size||'', message||'', leadId]);

    await createNotification(String(user.id), {
      type: 'new_lead',
      title: `📥 New inbound quote request — ${company.trim()}`,
      body: `${name ? name + ' · ' : ''}${email || phone || 'No contact info'}${vehicle_type ? ' · ' + vehicle_type : ''}`,
      metadata: { lead_id: leadId },
    });

    res.json({ ok: true, lead_id: leadId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Public Portfolio Page ─────────────────────────────────────────────────────

app.get('/portfolio/:shopToken', async (req, res) => {
  try {
    const { shopToken } = req.params;
    const user = await findUserByShopToken(shopToken);
    if (!user) return res.status(404).send('<h2>Portfolio not found.</h2>');

    const s = user.settings_json || {};
    const shopName = s.companyName || 'our shop';
    const accent = s.accentColor || '#ff6b35';
    const phone = s.senderPhone || '';
    const email = s.senderEmail || '';
    const locationLine = s.city && s.state ? `${s.city}, ${s.state}` : s.state || null;
    const taglineText = s.companyTagline
      ? s.companyTagline
      : locationLine
      ? `Certified wrap installer · ${locationLine}`
      : 'Professional vehicle wraps &amp; graphics';

    const { rows: jobs } = await pool.query(`
      SELECT j.id, j.company, j.vehicle_type, j.vehicle_count, j.wrap_category, j.material, j.install_date,
             array_agg(json_build_object('data', p.image_data, 'type', p.photo_type, 'caption', p.caption) ORDER BY p.created_at) FILTER (WHERE p.id IS NOT NULL) AS photos
      FROM installed_jobs j
      LEFT JOIN job_photos p ON p.job_id = j.id
      WHERE j.user_id = $1
      GROUP BY j.id
      ORDER BY j.install_date DESC
      LIMIT 60
    `, [String(user.id)]);

    const CATEGORY_NAMES = { fleet: 'Fleet Wraps', racing: 'Racing / Motorsport', dinoc: 'DI-NOC / Architectural', construction: 'Construction Fleet', colorchange: 'Color Change', gc_referral: 'GC / Commercial', reatec: 'Rea Tec Film', other: 'Other' };
    const VEHICLE_NAMES = { cargo_van_standard: 'Cargo Van', cargo_van_high_roof: 'Cargo Van (High Roof)', box_truck_16: '16ft Box Truck', box_truck_24: '24ft Box Truck', semi_cab_only: 'Semi (Cab)', semi_full: 'Semi (Full)', pickup_truck: 'Pickup Truck', suv_large: 'SUV', sedan: 'Sedan', minivan: 'Minivan', bus_school: 'Bus', flatbed: 'Flatbed', other: 'Vehicle' };

    const totalJobs = jobs.length;
    const totalVehicles = jobs.reduce((s, j) => s + (j.vehicle_count || 1), 0);
    const categories = [...new Set(jobs.map((j) => j.wrap_category).filter(Boolean))];

    const jobCards = jobs.map((j) => {
      const photos = (j.photos || []).filter((p) => p && p.data);
      const thumb = photos[0]?.data || null;
      const catName = CATEGORY_NAMES[j.wrap_category] || j.wrap_category || 'Vehicle Wrap';
      const vehName = VEHICLE_NAMES[j.vehicle_type] || j.vehicle_type || 'Vehicle';
      return `
        <div class="job-card">
          ${thumb ? `<div class="job-thumb"><img src="${thumb}" alt="${j.company} wrap" loading="lazy"></div>` : `<div class="job-thumb job-thumb-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40" style="opacity:0.3"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>`}
          <div class="job-info">
            <div class="job-company">${j.company || 'Client'}</div>
            <div class="job-meta">${j.vehicle_count || 1}× ${vehName} · ${catName}</div>
            ${j.material ? `<div class="job-material">${j.material}</div>` : ''}
            <div class="job-date">${j.install_date ? new Date(j.install_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''}</div>
          </div>
        </div>`;
    }).join('');

    const quoteUrl = `/quote-request/${shopToken}`;

    res.send(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${shopName} — Our Work</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0}
.hero{background:linear-gradient(135deg,#1a1d27 0%,#0f1117 100%);padding:60px 24px;text-align:center;border-bottom:1px solid #2a2d3a}
.logo{font-size:32px;font-weight:900;color:#fff;margin-bottom:8px}
.logo span{color:${accent}}
.tagline{font-size:16px;color:#8892a4;margin-bottom:24px}
.hero-stats{display:flex;gap:32px;justify-content:center;flex-wrap:wrap}
.stat{text-align:center}
.stat-n{font-size:36px;font-weight:900;color:${accent}}
.stat-l{font-size:12px;color:#8892a4;text-transform:uppercase;letter-spacing:.06em}
.cta-bar{display:flex;gap:12px;justify-content:center;margin-top:28px;flex-wrap:wrap}
.cta-btn{background:${accent};color:#fff;border:none;border-radius:8px;padding:12px 24px;font-size:14px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block}
.cta-secondary{background:transparent;border:1px solid #3a3d4a;color:#e2e8f0;border-radius:8px;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none;display:inline-block}
.section{padding:40px 24px;max-width:1200px;margin:0 auto}
.section-title{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#8892a4;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.job-card{background:#1a1d27;border:1px solid #2a2d3a;border-radius:12px;overflow:hidden;transition:transform .15s,border-color .15s}
.job-card:hover{transform:translateY(-2px);border-color:${accent}44}
.job-thumb{height:180px;overflow:hidden;background:#0f1117;display:flex;align-items:center;justify-content:center}
.job-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.job-thumb-empty{display:flex;align-items:center;justify-content:center;color:#4a5568}
.job-info{padding:14px}
.job-company{font-weight:700;font-size:14px;margin-bottom:4px}
.job-meta{font-size:12px;color:#8892a4;margin-bottom:2px}
.job-material{font-size:11px;color:#6b7280}
.job-date{font-size:11px;color:#6b7280;margin-top:4px}
.empty{text-align:center;color:#6b7280;padding:60px 24px;font-size:16px}
.footer{text-align:center;padding:32px 24px;color:#6b7280;font-size:12px;border-top:1px solid #2a2d3a}
.footer a{color:${accent};text-decoration:none}
@media(max-width:600px){.hero{padding:40px 16px}.hero-stats{gap:20px}.stat-n{font-size:28px}}
</style></head><body>
<div class="hero">
  <div class="logo">${shopName.split(' ').slice(0,-1).join(' ')}<span> ${shopName.split(' ').slice(-1)[0]}</span></div>
  <div class="tagline">${taglineText}</div>
  <div class="hero-stats">
    <div class="stat"><div class="stat-n">${totalJobs}</div><div class="stat-l">Installs</div></div>
    <div class="stat"><div class="stat-n">${totalVehicles}</div><div class="stat-l">Vehicles Wrapped</div></div>
    <div class="stat"><div class="stat-n">${categories.length}</div><div class="stat-l">Specialties</div></div>
  </div>
  <div class="cta-bar">
    <a class="cta-btn" href="${quoteUrl}">Get a Free Quote →</a>
    ${phone ? `<a class="cta-secondary" href="tel:${phone.replace(/\D/g,'')}">${phone}</a>` : ''}
    ${email ? `<a class="cta-secondary" href="mailto:${email}">${email}</a>` : ''}
  </div>
</div>
<div class="section">
  <div class="section-title">Recent Work</div>
  ${jobCards.length ? `<div class="grid">${jobCards}</div>` : '<div class="empty">Work history coming soon — check back after our first logged installs.</div>'}
</div>
<div class="footer">
  &copy; ${new Date().getFullYear()} ${shopName} · All rights reserved<br>
  <a href="${quoteUrl}">Request a Quote</a>
  ${phone ? ` · <a href="tel:${phone.replace(/\D/g,'')}">${phone}</a>` : ''}
</div>
</body></html>`);
  } catch (e) { res.status(500).send('<h2>Error loading portfolio.</h2>'); }
});

// ── AI Social Post Generator ───────────────────────────────────────────────────
app.post('/ai/social-post', authMiddleware, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });
  try {
    const { company, vehicle_type, vehicle_count, wrap_category, material, notes } = req.body || {};
    const settingsR = await pool.query('SELECT settings_json FROM users WHERE id=$1', [String(req.user.id)]);
    const shopSettings = settingsR.rows[0]?.settings_json || {};
    const shopName = shopSettings.companyName || 'our shop';
    const VEHICLE_NAMES = { cargo_van: 'cargo van', box_truck: 'box truck', semi: 'semi hauler', pickup: 'pickup truck', bus: 'bus', fleet_mixed: 'mixed fleet', other: 'vehicle' };
    const CAT_NAMES = { fleet: 'fleet wrap', racing: 'race livery', dinoc: 'DI-NOC architectural film', construction: 'construction fleet wrap', colorchange: 'color change wrap', gc_referral: 'commercial wrap', reatec: 'Rea Tec film', other: 'vehicle wrap' };

    const prompt = `You're writing social media posts for ${shopName}, a vehicle wrap and graphics shop.

Just completed job:
- Client: ${company || 'a local business'}
- Vehicles: ${vehicle_count || 1}× ${VEHICLE_NAMES[vehicle_type] || vehicle_type || 'vehicle'}
- Type: ${CAT_NAMES[wrap_category] || wrap_category || 'vehicle wrap'}
${material ? `- Material: ${material}` : ''}
${notes ? `- Notes: ${notes}` : ''}

Write two posts. Output JSON only:
{
  "instagram": "string — punchy 2-3 sentences, 3-5 relevant hashtags, fire emoji welcome, max 200 chars",
  "linkedin": "string — professional, 3-4 sentences, no hashtags, focus on business impact and craftsmanship, max 280 chars"
}`;

    const result = await claudeHaiku(apiKey, [{ role: 'user', content: prompt }], 500);
    const parsed = JSON.parse(result.replace(/```json|```/g, '').trim());
    res.json({ ok: true, posts: parsed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Notifications ─────────────────────────────────────────────────────────────

app.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY read_at NULLS FIRST, created_at DESC LIMIT 50`,
      [String(req.user.id)]
    );
    const unread = rows.filter((r) => !r.read_at).length;
    res.json({ notifications: rows, unread });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL`,
      [String(req.user.id)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2`,
      [req.params.id, String(req.user.id)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/notifications/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM notifications WHERE id=$1 AND user_id=$2`, [req.params.id, String(req.user.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Job Photos ────────────────────────────────────────────────────────────────

app.get('/jobs/:id/photos', authMiddleware, async (req, res) => {
  try {
    const own = await pool.query('SELECT id FROM installed_jobs WHERE id=$1 AND user_id=$2', [req.params.id, String(req.user.id)]);
    if (!own.rows.length) return res.status(404).json({ error: 'Job not found' });
    const { rows } = await pool.query('SELECT * FROM job_photos WHERE job_id=$1 ORDER BY created_at ASC', [req.params.id]);
    res.json({ photos: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/jobs/:id/photos', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const own = await pool.query('SELECT id FROM installed_jobs WHERE id=$1 AND user_id=$2', [req.params.id, String(req.user.id)]);
    if (!own.rows.length) return res.status(404).json({ error: 'Job not found' });
    if (!req.file) return res.status(400).json({ error: 'image required' });
    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const { caption = '', photo_type = 'other' } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO job_photos (user_id, job_id, image_data, caption, photo_type) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [String(req.user.id), req.params.id, base64, caption || null, photo_type]
    );
    res.json({ ok: true, photo: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/jobs/photos/:photoId', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM job_photos WHERE id=$1 AND user_id=$2', [req.params.photoId, String(req.user.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Quote PDF (HTML template, browser print) ──────────────────────────────────

app.get('/bids/:id/quote', (req, res, next) => {
  // Accept token from query param (needed for window.open from browser)
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, authMiddleware, async (req, res) => {
  try {
    const { rows: bidRows } = await pool.query(
      `SELECT b.*, l.company AS lead_company, l.contact_name, l.email AS lead_email, l.phone AS lead_phone, l.city, l.state
       FROM bids b LEFT JOIN leads l ON l.id = b.lead_id
       WHERE b.id=$1 AND b.user_id=$2`,
      [req.params.id, String(req.user.id)]
    );
    if (!bidRows.length) return res.status(404).json({ error: 'Bid not found' });
    const bid = bidRows[0];
    const { rows: uRows } = await pool.query('SELECT settings_json FROM users WHERE id=$1', [String(req.user.id)]);
    const s = uRows[0]?.settings_json || {};

    const formatMoney = (n) => n ? `$${Number(n).toLocaleString()}` : '—';
    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quote — ${bid.project_name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f5f7; color: #1a1c22; }
  .page { max-width: 820px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.1); }
  .header { background: #1a1c22; padding: 36px 40px; display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { color: #fff; }
  .brand-name { font-size: 24px; font-weight: 800; letter-spacing: -.5px; }
  .brand-name span { color: #6366f1; }
  .brand-tag { font-size: 12px; color: #9ca3af; margin-top: 4px; }
  .brand-contact { text-align: right; color: #9ca3af; font-size: 12px; line-height: 1.7; }
  .brand-contact strong { color: #fff; font-size: 14px; display: block; margin-bottom: 4px; }
  .quote-label { background: #6366f1; color: #fff; padding: 6px 16px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-top: 8px; display: inline-block; }
  .body { padding: 40px; }
  .section { margin-bottom: 32px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #6b7280; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
  .client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .field { display: flex; flex-direction: column; gap: 3px; }
  .field-label { font-size: 11px; color: #9ca3af; font-weight: 600; }
  .field-value { font-size: 14px; font-weight: 600; color: #1a1c22; }
  .project-title { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
  .project-meta { display: flex; gap: 16px; flex-wrap: wrap; }
  .meta-chip { background: #f3f4f6; border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: 600; color: #374151; }
  .price-box { background: linear-gradient(135deg, #1a1c22 0%, #2d2f3a 100%); border-radius: 10px; padding: 28px; display: flex; align-items: center; justify-content: space-between; }
  .price-label { color: #9ca3af; font-size: 13px; font-weight: 600; }
  .price-value { font-size: 36px; font-weight: 900; color: #fff; }
  .price-note { color: #6b7280; font-size: 11px; margin-top: 4px; }
  .timeline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .timeline-step { text-align: center; padding: 16px; background: #f9fafb; border-radius: 8px; }
  .timeline-num { width: 28px; height: 28px; background: #6366f1; border-radius: 50%; color: #fff; font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px; }
  .timeline-title { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
  .timeline-desc { font-size: 11px; color: #6b7280; }
  .services-list { display: flex; flex-direction: column; gap: 10px; }
  .service-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #f9fafb; border-radius: 8px; }
  .service-dot { width: 8px; height: 8px; background: #6366f1; border-radius: 50%; flex-shrink: 0; }
  .service-name { font-size: 13px; font-weight: 600; flex: 1; }
  .service-detail { font-size: 12px; color: #6b7280; }
  .terms { background: #f9fafb; border-radius: 8px; padding: 20px; }
  .terms p { font-size: 12px; color: #6b7280; line-height: 1.7; margin-bottom: 8px; }
  .terms p:last-child { margin-bottom: 0; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 8px; }
  .sig-box { border-top: 2px solid #e5e7eb; padding-top: 12px; }
  .sig-label { font-size: 11px; color: #9ca3af; font-weight: 600; }
  .sig-name { font-size: 13px; font-weight: 700; margin-top: 4px; }
  .sig-date { font-size: 11px; color: #9ca3af; margin-top: 2px; }
  .footer { background: #f3f4f6; padding: 20px 40px; display: flex; justify-content: space-between; align-items: center; }
  .footer-note { font-size: 11px; color: #9ca3af; }
  .footer-ref { font-size: 11px; font-weight: 700; color: #6366f1; }
  @media print {
    body { background: #fff; }
    .page { margin: 0; border-radius: 0; box-shadow: none; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">
      <div class="brand-name">${s.companyName || 'our shop'}<span>.</span></div>
      <div class="brand-tag">${s.companyTagline || 'Vehicle Wraps &amp; Fleet Graphics'}</div>
      <div class="quote-label">Quote Proposal</div>
    </div>
    <div class="brand-contact">
      <strong>${s.senderName || ''}</strong>
      ${s.senderTitle ? `<span>${s.senderTitle}</span><br>` : ''}
      ${s.senderEmail ? `<span>${s.senderEmail}</span><br>` : ''}
      ${s.senderPhone ? `<span>${s.senderPhone}</span>` : ''}
    </div>
  </div>

  <div class="body">
    <div class="section">
      <div class="project-title">${bid.project_name}</div>
      <div class="project-meta">
        <span class="meta-chip">${bid.project_type?.replace(/_/g, ' ').toUpperCase() || 'GENERAL'}</span>
        ${bid.status !== 'tracking' ? `<span class="meta-chip">${bid.status.toUpperCase()}</span>` : ''}
        ${bid.bid_due ? `<span class="meta-chip">Due: ${formatDate(bid.bid_due)}</span>` : ''}
      </div>
    </div>

    ${bid.lead_company || bid.contact_name ? `
    <div class="section">
      <div class="section-title">Prepared For</div>
      <div class="client-grid">
        ${bid.lead_company ? `<div class="field"><span class="field-label">Company</span><span class="field-value">${bid.lead_company}</span></div>` : ''}
        ${bid.contact_name ? `<div class="field"><span class="field-label">Contact</span><span class="field-value">${bid.contact_name}</span></div>` : ''}
        ${bid.lead_email ? `<div class="field"><span class="field-label">Email</span><span class="field-value">${bid.lead_email}</span></div>` : ''}
        ${bid.city || bid.state ? `<div class="field"><span class="field-label">Location</span><span class="field-value">${[bid.city, bid.state].filter(Boolean).join(', ')}</span></div>` : ''}
      </div>
    </div>` : ''}

    ${bid.estimated_value ? `
    <div class="section">
      <div class="section-title">Estimated Investment</div>
      <div class="price-box">
        <div>
          <div class="price-label">Project Estimate</div>
          <div class="price-value">${formatMoney(bid.estimated_value)}</div>
          <div class="price-note">Final price may vary based on vehicle count, material, and complexity</div>
        </div>
      </div>
    </div>` : ''}

    <div class="section">
      <div class="section-title">What's Included</div>
      <div class="services-list">
        <div class="service-row"><span class="service-dot"></span><span class="service-name">Professional design (included)</span><span class="service-detail">Custom graphics crafted to your brand</span></div>
        <div class="service-row"><span class="service-dot"></span><span class="service-name">3M or Avery certified material</span><span class="service-detail">5-year warranty, removable without paint damage</span></div>
        <div class="service-row"><span class="service-dot"></span><span class="service-name">Professional installation</span><span class="service-detail">Climate-controlled facility, certified installers</span></div>
        <div class="service-row"><span class="service-dot"></span><span class="service-name">Quality inspection &amp; delivery</span><span class="service-detail">Photo documentation, care instructions included</span></div>
        ${s.companyServices ? `<div class="service-row"><span class="service-dot"></span><span class="service-name">${s.companyServices}</span><span class="service-detail">Full-service shop capabilities</span></div>` : ''}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Project Timeline</div>
      <div class="timeline">
        <div class="timeline-step"><div class="timeline-num">1</div><div class="timeline-title">Design Approval</div><div class="timeline-desc">2–3 business days</div></div>
        <div class="timeline-step"><div class="timeline-num">2</div><div class="timeline-title">Print &amp; Prep</div><div class="timeline-desc">1–2 business days</div></div>
        <div class="timeline-step"><div class="timeline-num">3</div><div class="timeline-title">Install</div><div class="timeline-desc">1–2 days per vehicle</div></div>
      </div>
    </div>

    ${bid.notes ? `
    <div class="section">
      <div class="section-title">Project Notes</div>
      <div class="terms"><p>${bid.notes.replace(/\n/g, '<br>')}</p></div>
    </div>` : ''}

    <div class="section">
      <div class="section-title">Terms &amp; Conditions</div>
      <div class="terms">
        <p>50% deposit required to begin production. Balance due upon completion. Pricing is valid for 30 days from the date of this quote.</p>
        <p>Any changes to vehicle count, design scope, or materials after approval may affect final pricing. Rush fees may apply for timelines under 5 business days.</p>
        <p>This quote covers labor and materials as described. Additional services (removal of existing vinyl, surface prep, repairs) will be quoted separately if required.</p>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Approval</div>
      <div class="sig-grid">
        <div class="sig-box">
          <div class="sig-label">Authorized by</div>
          <div class="sig-name">${s.companyName || 'our shop'}</div>
          <div class="sig-date">${s.senderName || ''} · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        <div class="sig-box">
          <div class="sig-label">Accepted by client</div>
          <div class="sig-name" style="height:24px;"></div>
          <div class="sig-date">Signature &amp; Date</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span class="footer-note">Quote valid for 30 days · Questions? ${s.senderEmail || 'hello@yourshop.com'}</span>
    <span class="footer-ref">REF: BID-${String(bid.id).padStart(4,'0')}</span>
  </div>
</div>

<div class="no-print" style="text-align:center;padding:20px;">
  <button onclick="window.print()" style="background:#6366f1;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;">
    Save as PDF / Print
  </button>
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── E Ink Device Infrastructure ──────────────────────────────────────────────

// In production, EINK_PROVISION_SECRET must be set explicitly. In dev we fall
// back to a known-bad value so local provisioning still works without config.
const EINK_PROVISION_SECRET = process.env.EINK_PROVISION_SECRET
  || (process.env.NODE_ENV === 'production' ? null : 'eink-dev-secret');
if (!EINK_PROVISION_SECRET) {
  console.warn('[boot] EINK_PROVISION_SECRET not set — /devices/register will reject all requests');
}

async function deviceAuthMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'No device token' });
  const token = header.slice(7).trim();
  try {
    const { rows } = await pool.query('SELECT * FROM eink_devices WHERE device_token=$1', [token]);
    if (!rows[0]) return res.status(401).json({ error: 'Unknown device' });
    req.device = rows[0];
    next();
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
}

// Device: first-time registration (uses provision secret, not JWT)
app.post('/devices/register', async (req, res) => {
  const secret = req.headers['x-provision-secret'] || '';
  if (!EINK_PROVISION_SECRET || secret !== EINK_PROVISION_SECRET) {
    return res.status(403).json({ error: 'Invalid provision secret' });
  }
  const { user_id, serial_number, name, vehicle_group = 'fleet', firmware_version } = req.body;
  if (!user_id || !name) return res.status(400).json({ error: 'user_id and name required' });
  try {
    const device_token = crypto.randomBytes(32).toString('hex');
    const { rows } = await pool.query(
      `INSERT INTO eink_devices (user_id, device_token, serial_number, name, vehicle_group, firmware_version)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user_id, device_token, serial_number || null, name, vehicle_group, firmware_version || null]
    );
    res.json({ ok: true, device_token, device_id: rows[0].id, device: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Device: get current content based on schedule engine
app.get('/devices/:deviceId/content', deviceAuthMiddleware, async (req, res) => {
  const device = req.device;
  try {
    // Update last_seen_at
    await pool.query('UPDATE eink_devices SET last_seen_at=NOW(), status=$1 WHERE id=$2', ['online', device.id]);

    // Resolve active content for this device's vehicle_group
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5);

    const { rows: schedRows } = await pool.query(
      `SELECT cs.*, row_to_json(wc) as content FROM content_schedules cs
       LEFT JOIN wrap_content wc ON wc.id = cs.content_id
       WHERE cs.user_id=$1
         AND (cs.vehicle_group='all' OR cs.vehicle_group=$2)
         AND cs.start_date <= $3
         AND (cs.end_date IS NULL OR cs.end_date >= $3)
         AND (cs.start_time IS NULL OR cs.start_time <= $4)
         AND (cs.end_time IS NULL OR cs.end_time >= $4)
       ORDER BY cs.priority DESC LIMIT 1`,
      [device.user_id, device.vehicle_group, todayDate, currentTime]
    );

    if (!schedRows[0]) return res.json({ ok: true, content: null, push_log_id: null });

    const sched = schedRows[0];
    const { rows: logRows } = await pool.query(
      `INSERT INTO eink_push_log (device_id, content_id, status) VALUES ($1, $2, 'pending') RETURNING id`,
      [device.id, sched.content_id]
    );

    res.json({
      ok: true,
      content_id: sched.content_id,
      content: sched.content,
      push_log_id: logRows[0].id,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Device: heartbeat
app.post('/devices/:deviceId/heartbeat', deviceAuthMiddleware, async (req, res) => {
  const device = req.device;
  const { status = 'online', location, firmware_version, battery_pct } = req.body;
  try {
    await pool.query(
      `UPDATE eink_devices SET last_seen_at=NOW(), status=$1,
       last_location=CASE WHEN $2::jsonb IS NOT NULL THEN $2::jsonb ELSE last_location END,
       firmware_version=COALESCE($3, firmware_version),
       metadata=jsonb_set(COALESCE(metadata,'{}'), '{battery_pct}', COALESCE($4::text::jsonb, metadata->'battery_pct'), true)
       WHERE id=$5`,
      [status, location ? JSON.stringify(location) : null, firmware_version || null, battery_pct != null ? battery_pct : null, device.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Device: acknowledge content delivery
app.post('/devices/:deviceId/ack', deviceAuthMiddleware, async (req, res) => {
  const device = req.device;
  const { push_log_id, success = true, error: errMsg } = req.body;
  if (!push_log_id) return res.status(400).json({ error: 'push_log_id required' });
  try {
    const status = success ? 'delivered' : 'failed';
    const { rows } = await pool.query(
      `UPDATE eink_push_log SET status=$1, acked_at=NOW(), error=$2 WHERE id=$3 AND device_id=$4 RETURNING content_id`,
      [status, errMsg || null, push_log_id, device.id]
    );
    if (success && rows[0]?.content_id) {
      await pool.query('UPDATE eink_devices SET current_content_id=$1 WHERE id=$2', [rows[0].content_id, device.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: list devices
app.get('/admin/devices', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, row_to_json(wc) as current_content
       FROM eink_devices d
       LEFT JOIN wrap_content wc ON wc.id = d.current_content_id
       WHERE d.user_id=$1 ORDER BY d.created_at DESC`,
      [String(req.user.id)]
    );
    res.json({ devices: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: device summary status
app.get('/admin/devices/status', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE status='online' AND last_seen_at > NOW() - INTERVAL '5 minutes')::int as online,
         COUNT(*) FILTER (WHERE status='offline' OR last_seen_at <= NOW() - INTERVAL '5 minutes' OR last_seen_at IS NULL)::int as offline,
         COUNT(*) FILTER (WHERE status='updating')::int as updating
       FROM eink_devices WHERE user_id=$1`,
      [String(req.user.id)]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: create/register device from dashboard
app.post('/admin/devices', authMiddleware, async (req, res) => {
  const { name, serial_number, vehicle_group = 'fleet', lead_id, job_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const device_token = crypto.randomBytes(32).toString('hex');
    const { rows } = await pool.query(
      `INSERT INTO eink_devices (user_id, device_token, serial_number, name, vehicle_group, lead_id, job_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [String(req.user.id), device_token, serial_number || null, name, vehicle_group, lead_id || null, job_id || null]
    );
    res.json({ ok: true, device: { ...rows[0] } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: update device
app.put('/admin/devices/:id', authMiddleware, async (req, res) => {
  const { name, vehicle_group, lead_id, job_id } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE eink_devices SET
         name=COALESCE($1,name),
         vehicle_group=COALESCE($2,vehicle_group),
         lead_id=$3,
         job_id=$4
       WHERE id=$5 AND user_id=$6 RETURNING *`,
      [name, vehicle_group, lead_id ?? null, job_id ?? null, req.params.id, String(req.user.id)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Device not found' });
    res.json({ ok: true, device: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: delete device
app.delete('/admin/devices/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM eink_devices WHERE id=$1 AND user_id=$2', [req.params.id, String(req.user.id)]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: manually push content to a device
app.post('/admin/devices/:id/push', authMiddleware, async (req, res) => {
  const { content_id } = req.body;
  if (!content_id) return res.status(400).json({ error: 'content_id required' });
  try {
    const { rows: deviceRows } = await pool.query(
      'SELECT * FROM eink_devices WHERE id=$1 AND user_id=$2', [req.params.id, String(req.user.id)]
    );
    if (!deviceRows[0]) return res.status(404).json({ error: 'Device not found' });
    const { rows: logRows } = await pool.query(
      `INSERT INTO eink_push_log (device_id, content_id, status) VALUES ($1, $2, 'pending') RETURNING id`,
      [req.params.id, content_id]
    );
    res.json({ ok: true, push_log_id: logRows[0].id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: get push log for a device
app.get('/admin/devices/:id/log', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pl.*, row_to_json(wc) as content
       FROM eink_push_log pl
       LEFT JOIN wrap_content wc ON wc.id = pl.content_id
       WHERE pl.device_id=$1
         AND EXISTS (SELECT 1 FROM eink_devices d WHERE d.id=pl.device_id AND d.user_id=$2)
       ORDER BY pl.pushed_at DESC LIMIT 20`,
      [req.params.id, String(req.user.id)]
    );
    res.json({ log: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Broadcast Email — send one message to many leads at once ─────────────────
app.post('/leads/broadcast', authMiddleware, requireShopFlow, async (req, res) => {
  const { leadIds, subject, body } = req.body || {};
  if (!Array.isArray(leadIds) || !leadIds.length || !subject || !body)
    return res.status(400).json({ error: 'leadIds[], subject, body required' });
  if (leadIds.length > 100)
    return res.status(400).json({ error: 'Max 100 leads per broadcast' });

  const uid = String(req.user.id);
  const resendKey = process.env.RESEND_API_KEY;
  const baseUrl = process.env.APP_BASE_URL || APP_URL;

  const userR = await pool.query('SELECT settings_json FROM users WHERE id=$1', [uid]);
  const settings = userR.rows[0]?.settings_json || {};
  const fromName = settings.senderName || 'WrapLeads';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'outreach@wrapleads.io';

  const { rows: leads } = await pool.query(
    `SELECT id, company, contact_name, email FROM leads WHERE id=ANY($1) AND user_id=$2`,
    [leadIds, uid]
  );

  let sent = 0, skipped = 0, errors = 0;
  for (const lead of leads) {
    if (!lead.email) { skipped++; continue; }
    try {
      const trackToken = require('crypto').randomBytes(16).toString('hex');
      await pool.query(
        `INSERT INTO email_tracking (token, user_id, lead_id, subject) VALUES ($1,$2,$3,$4)`,
        [trackToken, uid, lead.id, subject]
      );
      const pixelUrl = `${baseUrl}/track/email/${trackToken}`;
      const personalBody = body.replace(/\{\{company\}\}/gi, lead.company)
        .replace(/\{\{name\}\}/gi, lead.contact_name || lead.company);
      const htmlBody = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#111;max-width:600px">
${personalBody.replace(/\n/g, '<br>')}
<br><br>
<hr style="border:none;border-top:1px solid #eee;margin:20px 0">
<p style="font-size:11px;color:#999;margin:0">${fromName} · <a href="https://wrapleads.io" style="color:#999">WrapLeads</a></p>
</div><img src="${pixelUrl}" width="1" height="1" style="display:none;opacity:0" alt="">`;

      if (resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: lead.contact_name ? `${lead.contact_name} <${lead.email}>` : lead.email,
            subject,
            html: htmlBody,
            text: personalBody,
          }),
        });
      }
      await logActivity(pool, {
        leadId: lead.id, userId: uid,
        type: resendKey ? 'email_sent' : 'email_copied',
        subject: `[Broadcast] ${subject}`,
        body: personalBody.slice(0, 500),
        metadata: { broadcast: true },
      });
      sent++;
    } catch {
      errors++;
    }
  }
  res.json({ ok: true, sent, skipped, errors });
});

// ── Mission Live Signals ───────────────────────────────────────────────────────
app.get('/mission/signals', authMiddleware, async (req, res) => {
  const uid = String(req.user.id);
  try {
    const [emailR, proposalR, replyR, leadR] = await Promise.all([
      pool.query(`SELECT 'email_opened' AS type, et.subject AS title,
          l.company, l.id AS lead_id, et.opened_at AS ts
          FROM email_tracking et JOIN leads l ON l.id = et.lead_id
          WHERE et.user_id=$1 AND et.opened_at IS NOT NULL
          ORDER BY et.opened_at DESC LIMIT 8`, [uid]),
      pool.query(`SELECT 'proposal_viewed' AS type, p.title,
          l.company, l.id AS lead_id, p.last_viewed_at AS ts
          FROM proposals p JOIN leads l ON l.id = p.lead_id
          WHERE p.user_id=$1 AND p.last_viewed_at IS NOT NULL
          ORDER BY p.last_viewed_at DESC LIMIT 8`, [uid]),
      pool.query(`SELECT 'reply' AS type, a.subject AS title,
          l.company, l.id AS lead_id, a.created_at AS ts
          FROM lead_activities a JOIN leads l ON l.id = a.lead_id
          WHERE a.user_id=$1 AND a.type='email_reply'
          ORDER BY a.created_at DESC LIMIT 6`, [uid]),
      pool.query(`SELECT 'new_lead' AS type, l.company AS title,
          l.company, l.id AS lead_id, l.created_at AS ts
          FROM leads l WHERE l.user_id=$1 AND l.created_at > NOW() - INTERVAL '7 days'
          ORDER BY l.created_at DESC LIMIT 5`, [uid]),
    ]);
    const all = [...emailR.rows, ...proposalR.rows, ...replyR.rows, ...leadR.rows]
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 20);
    res.json({ signals: all });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bid Expiry Worker ─────────────────────────────────────────────────────────
async function processBidExpiry() {
  try {
    const { rows: users } = await pool.query(`SELECT DISTINCT user_id FROM bids WHERE status='tracking' AND bid_due IS NOT NULL`);
    for (const { user_id } of users) {
      const { rows: expiring } = await pool.query(
        `SELECT b.*, l.company, l.email, l.contact_name
         FROM bids b LEFT JOIN leads l ON l.id = b.lead_id
         WHERE b.user_id=$1 AND b.status='tracking'
           AND b.bid_due >= CURRENT_DATE AND b.bid_due <= CURRENT_DATE + INTERVAL '3 days'`,
        [user_id]
      );
      for (const bid of expiring) {
        const daysLeft = Math.ceil((new Date(bid.bid_due) - Date.now()) / 86_400_000);
        const already = await pool.query(
          `SELECT 1 FROM notifications WHERE user_id=$1 AND type='bid_due_soon'
           AND metadata->>'bid_id' = $2 AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1`,
          [user_id, String(bid.id)]
        );
        if (already.rows.length) continue;
        await createNotification(user_id, {
          type: 'bid_due_soon',
          title: `📋 Bid due ${daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`} — ${bid.project_name}`,
          body: `${bid.company || 'Unknown company'}${bid.estimated_value ? ` · Est. $${bid.estimated_value.toLocaleString()}` : ''}`,
          metadata: { bid_id: bid.id, lead_id: bid.lead_id, days_left: daysLeft },
        });
      }
    }
  } catch (e) {
    console.error('[bid-expiry worker]', e.message);
  }
}

function startBidExpiryWorker() {
  const check = () => {
    const now = new Date();
    if (now.getHours() === 10 && now.getMinutes() === 0) {
      processBidExpiry();
    }
  };
  setInterval(check, 60_000);
  console.log('· Bid expiry worker: running (daily alert at 10:00 AM)');
}

// ── Static — serve React SPA (must be LAST) ───────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Refuse to boot in production with the default JWT secret — that value is
// publicly visible in the repo, so any token signed with it is forgeable.
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'change-me-in-production') {
  console.error('[boot] FATAL: JWT_SECRET is not set in production (or is still the default placeholder).');
  console.error('[boot] Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}

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
    startDigestWorker();
    startColdNurtureWorker();
    startReOrderWorker();
    startBidExpiryWorker();
    startAnniversaryWorker();
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
