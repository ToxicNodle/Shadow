-- WrapLeads Database Schema
-- ─────────────────────────────────────────────────────────────────────────────
-- IMPORTANT: This file defines the *bootstrap* schema — it is executed once
-- when setting up a fresh database (npm run db:up → docker compose up).
--
-- All additive changes after the initial bootstrap (new columns, new tables)
-- are handled by migrateDb() in wrapleads-server.js via idempotent
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS
-- statements.  migrateDb() runs automatically on every server boot.
--
-- Rule: add new columns/tables to migrateDb() first. Keep this file in sync
-- so a `db:reset` + fresh boot produces the same schema as a migrated old DB.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Users + Stripe subscriptions
-- sub_status mirrors Stripe: 'trialing' | 'active' | 'past_due' |
--   'canceled' | 'incomplete' | 'inactive' (pre-checkout)
-- plan_tier tracks which paid tier the user purchased:
--   'wrapleads' ($79) | 'shopflow' ($149) | 'wrapos' ($249)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                     BIGSERIAL PRIMARY KEY,
  email                  TEXT NOT NULL UNIQUE,
  password_hash          TEXT NOT NULL,
  name                   TEXT,
  company_name           TEXT,
  stripe_customer_id     TEXT UNIQUE,
  stripe_sub_id          TEXT UNIQUE,
  sub_status             TEXT NOT NULL DEFAULT 'inactive',
  sub_period_end         TIMESTAMPTZ,
  trial_ends_at          TIMESTAMPTZ,
  plan_tier              TEXT NOT NULL DEFAULT 'wrapleads',
  password_reset_token   TEXT,
  password_reset_expires TIMESTAMPTZ,
  settings_json          JSONB DEFAULT '{}'::jsonb,
  shop_token             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email           ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_sub      ON users (stripe_sub_id);
CREATE INDEX IF NOT EXISTS idx_users_shop_token      ON users (shop_token);

-- ─────────────────────────────────────────────────────────────────────────────
-- Public carrier/company dataset (sourced from FMCSA, SOS registries, etc.)
-- Unique on (source, source_id) so re-ingesting is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id               BIGSERIAL PRIMARY KEY,
  source           TEXT NOT NULL,
  source_id        TEXT NOT NULL,
  name             TEXT NOT NULL,
  dba_name         TEXT,
  street           TEXT,
  city             TEXT,
  state            TEXT,
  zip              TEXT,
  country          TEXT DEFAULT 'US',
  phone            TEXT,
  email            TEXT,
  website          TEXT,
  fleet_size       INTEGER,
  drivers          INTEGER,
  cargo_types      TEXT,
  industry         TEXT,
  last_reported    DATE,
  added_to_registry DATE,
  raw_data         JSONB,
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_companies_state       ON companies (state);
CREATE INDEX IF NOT EXISTS idx_companies_fleet_size  ON companies (fleet_size DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_companies_state_fleet ON companies (state, fleet_size DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm   ON companies USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_dba_trgm    ON companies USING gin (dba_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_city        ON companies (city);

-- ─────────────────────────────────────────────────────────────────────────────
-- Import tracking — records which companies a user has already pulled into
-- their leads so the Discover view can show "Already imported" badges.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS imports (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL DEFAULT 'local',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_imports_user ON imports (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Saved carrier searches — named filter sets with new-count refresh.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_searches (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL DEFAULT 'local',
  name         TEXT NOT NULL,
  filters      JSONB NOT NULL,
  last_checked TIMESTAMPTZ,
  new_count    INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Per-user CRM leads table.
-- Keyed on (user_id, client_id) — client_id is the UUID generated by the
-- frontend; POST /leads/sync upserts on this pair so sync is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                BIGSERIAL PRIMARY KEY,
  user_id           TEXT NOT NULL DEFAULT 'local',
  client_id         TEXT,
  company           TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'fleet',
  state             TEXT,
  city              TEXT,
  address           TEXT,
  country           TEXT DEFAULT 'US',
  contact_name      TEXT,
  contact_title     TEXT,
  email             TEXT,
  phone             TEXT,
  website           TEXT,
  fleet_size        TEXT,
  pitch_angle       TEXT,
  status            TEXT NOT NULL DEFAULT 'cold',
  notes             TEXT,
  last_contacted    DATE,
  followup_due_at   DATE,
  referred_by       TEXT,
  tags              TEXT[] DEFAULT '{}',
  source            TEXT,
  source_company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_leads_user        ON leads (user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads (user_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_updated     ON leads (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_followup    ON leads (user_id, followup_due_at) WHERE followup_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_company_trgm ON leads USING gin (company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_tags        ON leads USING gin (tags);

-- ─────────────────────────────────────────────────────────────────────────────
-- Ingest run log — tracks source, file, and row counts for each data import.
-- ─────────────────────────────────────────────────────────────────────────────
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
);

-- ─────────────────────────────────────────────────────────────────────────────
-- All tables below are created (and kept current) by migrateDb() in
-- wrapleads-server.js.  They are reproduced here so that a db:reset
-- produces an immediately usable database without needing a server boot.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_tracking (
  id         BIGSERIAL PRIMARY KEY,
  token      TEXT NOT NULL UNIQUE,
  user_id    TEXT NOT NULL,
  lead_id    BIGINT REFERENCES leads(id) ON DELETE CASCADE,
  subject    TEXT,
  open_count INT DEFAULT 0,
  opened_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_tracking_user ON email_tracking (user_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_lead ON email_tracking (lead_id);

CREATE TABLE IF NOT EXISTS lead_activities (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  lead_id    BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  subject    TEXT,
  body       TEXT,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_lead ON lead_activities (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_user ON lead_activities (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_queue (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  lead_id       BIGINT REFERENCES leads(id) ON DELETE CASCADE,
  sequence_id   TEXT,
  step          INT DEFAULT 1,
  to_email      TEXT NOT NULL,
  subject       TEXT,
  html          TEXT,
  status        TEXT DEFAULT 'pending',
  scheduled_at  TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_user   ON email_queue (user_id, status);
CREATE INDEX IF NOT EXISTS idx_email_queue_sched  ON email_queue (scheduled_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS bids (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL,
  lead_id      BIGINT REFERENCES leads(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  bid_amount   NUMERIC(12,2),
  status       TEXT DEFAULT 'tracking',
  bid_due      DATE,
  decision_due DATE,
  platform     TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bids_user   ON bids (user_id);
CREATE INDEX IF NOT EXISTS idx_bids_lead   ON bids (lead_id);
CREATE INDEX IF NOT EXISTS idx_bids_status ON bids (user_id, status);

CREATE TABLE IF NOT EXISTS installed_jobs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  lead_id       BIGINT REFERENCES leads(id) ON DELETE SET NULL,
  company       TEXT NOT NULL,
  vehicle_type  TEXT DEFAULT 'other',
  vehicle_count INT DEFAULT 1,
  wrap_category TEXT DEFAULT 'fleet',
  material      TEXT,
  install_date  DATE,
  life_years    INT DEFAULT 5,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_user ON installed_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_lead ON installed_jobs (lead_id);

CREATE TABLE IF NOT EXISTS job_photos (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  job_id     BIGINT NOT NULL REFERENCES installed_jobs(id) ON DELETE CASCADE,
  image_data TEXT NOT NULL,
  caption    TEXT,
  photo_type TEXT DEFAULT 'other',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_photos_job ON job_photos (job_id);

CREATE TABLE IF NOT EXISTS wrap_content (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  image_url   TEXT,
  tags        TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wrap_content_user ON wrap_content (user_id);

CREATE TABLE IF NOT EXISTS content_schedules (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  content_id    BIGINT REFERENCES wrap_content(id) ON DELETE CASCADE,
  vehicle_group TEXT NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE,
  start_time    TIME,
  end_time      TIME,
  geo_trigger   TEXT,
  priority      INT DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedules_user ON content_schedules (user_id);

CREATE TABLE IF NOT EXISTS eink_devices (
  id             BIGSERIAL PRIMARY KEY,
  user_id        TEXT NOT NULL,
  device_id      TEXT NOT NULL,
  device_name    TEXT,
  vehicle_id     TEXT,
  last_seen      TIMESTAMPTZ,
  current_image  TEXT,
  status         TEXT DEFAULT 'active',
  registered_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_eink_devices_user ON eink_devices (user_id);

CREATE TABLE IF NOT EXISTS eink_push_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  device_id  TEXT,
  content_id BIGINT REFERENCES wrap_content(id) ON DELETE SET NULL,
  image_url  TEXT,
  pushed_at  TIMESTAMPTZ DEFAULT NOW(),
  status     TEXT DEFAULT 'sent'
);

CREATE INDEX IF NOT EXISTS idx_eink_push_user ON eink_push_log (user_id);

CREATE TABLE IF NOT EXISTS portal_links (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  lead_id    BIGINT REFERENCES leads(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  label      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_links_user  ON portal_links (user_id);
CREATE INDEX IF NOT EXISTS idx_portal_links_lead  ON portal_links (lead_id);
CREATE INDEX IF NOT EXISTS idx_portal_links_token ON portal_links (token);

CREATE TABLE IF NOT EXISTS notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  read       BOOLEAN DEFAULT false,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read, created_at DESC);

CREATE TABLE IF NOT EXISTS proposals (
  id              BIGSERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL,
  lead_id         BIGINT REFERENCES leads(id) ON DELETE CASCADE,
  title           TEXT,
  content         TEXT,
  status          TEXT DEFAULT 'draft',
  view_token      TEXT UNIQUE,
  view_count      INT DEFAULT 0,
  last_viewed_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_user  ON proposals (user_id);
CREATE INDEX IF NOT EXISTS idx_proposals_lead  ON proposals (lead_id);
CREATE INDEX IF NOT EXISTS idx_proposals_token ON proposals (view_token);

CREATE TABLE IF NOT EXISTS quote_requests (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL,
  lead_id      BIGINT REFERENCES leads(id) ON DELETE SET NULL,
  name         TEXT,
  company      TEXT,
  email        TEXT,
  phone        TEXT,
  vehicle_type TEXT,
  fleet_size   TEXT,
  message      TEXT,
  status       TEXT DEFAULT 'new',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_user ON quote_requests (user_id);
