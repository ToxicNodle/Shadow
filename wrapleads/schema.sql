-- WrapLeads Database Schema
-- Designed to support multiple data sources: FMCSA, state SOS registries,
-- Google Places, manually added, etc. The (source, source_id) pair is unique
-- per source so re-ingesting is idempotent.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS companies (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL,                 -- 'fmcsa', 'sos_in', 'manual', etc.
  source_id       TEXT NOT NULL,                 -- DOT number for FMCSA, registry # for SOS
  name            TEXT NOT NULL,
  dba_name        TEXT,
  street          TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  country         TEXT DEFAULT 'US',
  phone           TEXT,
  email           TEXT,
  website         TEXT,
  fleet_size      INTEGER,                       -- power units / branded vehicles
  drivers         INTEGER,
  cargo_types     TEXT,
  industry        TEXT,                          -- 'fleet', 'design', 'construction', etc.
  last_reported   DATE,
  added_to_registry DATE,
  raw_data        JSONB,                         -- full original row, for future re-mapping
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_id)
);

-- Indexes for the search patterns wrap shops actually use:
--   "carriers in IN/OH with 25-500 trucks"
--   "find any carrier matching 'plumbing'"
CREATE INDEX IF NOT EXISTS idx_companies_state          ON companies (state);
CREATE INDEX IF NOT EXISTS idx_companies_fleet_size     ON companies (fleet_size DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_companies_state_fleet    ON companies (state, fleet_size DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm      ON companies USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_dba_trgm       ON companies USING gin (dba_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_city           ON companies (city);

-- ---------------------------------------------------------------------------
-- Track which companies a user has already imported as leads. Lets the
-- Discover view show "Already in your leads" badges and prevent dupes.
-- For now the CRM stores leads in the browser, so this is forward-looking.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imports (
  id            BIGSERIAL PRIMARY KEY,
  company_id    BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL DEFAULT 'local',
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_imports_user ON imports (user_id);

-- ---------------------------------------------------------------------------
-- Saved searches — user-defined filters with a name for one-click re-run.
-- new_count is refreshed by POST /searches/saved/:id/run so the UI can show
-- "47 new since last check" without a full re-query on every page load.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_searches (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL DEFAULT 'local',
  name         TEXT NOT NULL,
  filters      JSONB NOT NULL,     -- {states, minFleet, maxFleet, query, sources}
  last_checked TIMESTAMPTZ,
  new_count    INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches (user_id);

-- ---------------------------------------------------------------------------
-- Server-side leads table — powers multi-tenant SaaS mode.
-- Keyed on (user_id, client_id) so the frontend can upsert by its own UUID;
-- on conflict the server merges in the latest values from the client.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id                BIGSERIAL PRIMARY KEY,
  user_id           TEXT NOT NULL DEFAULT 'local',
  client_id         TEXT,                           -- client-generated UUID
  company           TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'fleet',
  state             TEXT,
  city              TEXT,
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
  last_contacted    DATE,
  source_company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_leads_user    ON leads (user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status  ON leads (user_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_updated ON leads (user_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Track ingest runs so we know what's in the database and when it was loaded.
-- ---------------------------------------------------------------------------
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
