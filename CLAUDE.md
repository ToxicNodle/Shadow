# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The repo's single product lives in `wrapleads/` — a B2B lead-gen SaaS for vehicle wrap and graphics shops. The top-level `Shadow/` directory only contains scratch notes (`NOTES.md`) and the placeholder `README.md`; do not put product code there. All commands below must be run from `wrapleads/` unless noted.

## Commands (run from `wrapleads/`)

| Task | Command |
|------|---------|
| Install all deps (server + frontend) | `npm install && (cd frontend && npm install)` |
| Boot local Postgres + apply `schema.sql` | `npm run db:up` |
| Stop / wipe DB | `npm run db:down` / `npm run db:reset` |
| Open psql shell | `npm run db:psql` |
| Dev (server with `--watch` + Vite together) | `npm run dev` |
| Server only (port 3001) | `npm run dev:server` |
| Frontend only (Vite on 5173, proxies API to 3001) | `npm run dev:frontend` |
| Production build (TS check + Vite → `wrapleads/dist`) | `npm run build` |
| Start prod server (serves built SPA from `dist/`) | `npm start` |
| Lint frontend | `cd frontend && npm run lint` |
| Ingest FMCSA Motor Carrier Census | `npm run ingest:fmcsa -- /path/to/census.csv` |
| Ingest state SOS data | `npm run ingest:sos` |
| Ingest Google Places | `npm run ingest:places` |

There is **no test runner** configured — `package.json` has no `test` script and no test files exist. Do not invent or claim test commands.

CI (`.github/workflows/webpack.yml`) only does `npm install && npx webpack` on Node 18/20/22; this workflow predates the Vite setup and will fail since there is no webpack config. Don't rely on it as a signal — verify changes locally.

## Architecture

### Backend — a single Express monolith

`wrapleads/wrapleads-server.js` is a ~6,200-line monolithic Express app. All routes, middleware, workers, and helpers live in this one file. When adding endpoints, follow the existing pattern (route handler + inline SQL) rather than introducing a router/controllers split unless explicitly asked.

Key conventions inside `wrapleads-server.js`:

- **Three-tier subscription gating**: Every gated route uses `authMiddleware` plus a tier middleware. The tier hierarchy is `wrapleads` (1) < `shopflow` (2) < `wrapos` (3) — higher tiers include all lower-tier features. Use the right middleware for the route:
  - `subMiddleware` / `requireTier('wrapleads')` — basic paid tier ($79/mo). Gates lead discovery + enrichment: `/carriers/*`, `/apollo/*`.
  - `requireShopFlow` — automation tier ($149/mo). Gates AI outreach: `/ai/email`, `/ai/sequence`, `/ai/bulk-email`, `/leads/broadcast`.
  - `requireWrapOS` — full platform tier ($249/mo). Gates AI design + proposals: `/ai/proposal`, `/ai/design-brief`, `/ai/generate-mockup`, `/leads/:id/proposal`.
  - During trial (`trial_ends_at` in the future) and any `trialing` status, users get full WrapOS access automatically — the trial sells the top tier.
  - All tier middleware is bypassed when `STRIPE_DISABLED=true`.
  - The `plan_tier` column on `users` is the source of truth for a paid subscriber's tier. It's set by the Stripe webhook based on the purchased price ID (`PRICE_TO_TIER` map at the top of the file). `/stripe/checkout` accepts `{ tier }` in the request body and routes to the right `STRIPE_PRICE_ID_*` env var. The legacy single-tier `STRIPE_PRICE_ID` still works as the WrapLeads fallback.
- **`migrateDb()` runs on every boot** and is the source of truth for additive schema changes that aren't in `schema.sql` (most newer tables: `email_tracking`, `lead_activities`, `email_queue`, `bids`, `installed_jobs`, `wrap_content`, `content_schedules`, `eink_devices`, `eink_push_log`, `job_photos`, `portal_links`, `notifications`, `proposals`, `quote_requests`, plus columns like `users.plan_tier`, `users.settings_json`, `leads.followup_due_at` added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). All statements are idempotent. **New tables/columns should be added here, not in `schema.sql`**, unless you're also resetting the dev DB.
- **Stripe webhook MUST be mounted before `express.json()`** — see lines around 412. It uses `express.raw`. Preserve that ordering.
- **Background workers are started at boot** from inside `app.listen`: `startDripWorker` (sequence email sends), `startDigestWorker` (daily digests), `startColdNurtureWorker`, `startReOrderWorker`, `startBidExpiryWorker`, `startAnniversaryWorker`, plus `email.startTrialCron`. They poll Postgres on intervals — no external queue.
- **The SPA fallback (`app.get('*')`) and `express.static('dist')` MUST stay last** so API routes win.
- **Wrap-score formula** (`/carriers/search`) is hand-rolled SQL — fleet size 25–500 + staleness of `last_reported`. If you change scoring, update both the `ORDER BY` and the `SELECT` projection so the score returned to the client matches the sort.
- **Per-vertical Apollo titles** live in the `APOLLO_TITLES` map (~line 870), keyed by `LeadCategory`. When adding a new category, also update this map or fallback titles will be used.

### Frontend — React 19 + Vite + Zustand + React Query

`wrapleads/frontend/` is a Vite SPA. After `npm run build`, output lands in `wrapleads/dist/` (configured in `vite.config.ts`), which the Express server serves as static files in production.

- **API client**: `src/api/client.ts` exports a single typed `api` object — every endpoint goes through it via `authFetch`, which auto-attaches the JWT from `localStorage` (`wl_token`) and logs the user out on 401. **Do not call `fetch` directly from components** — extend `api` instead. File uploads (multipart) are the only exception and follow the existing `scanBlueprint` / `quoteVehicle` pattern.
- **App state**: `src/store/useAppStore.ts` (Zustand, with `persist`) holds UI state — current mode, filters, modal open flags, command-palette state, selected lead set. The `AppMode` union (`'leads' | 'discover' | 'pipeline' | 'bids' | 'mission' | 'jobs' | 'content' | 'analytics'`) drives which view renders inside `pages/CRMPage.tsx`.
- **Server data**: TanStack Query is the cache layer; hooks live in `src/hooks/` (`useAuth`, `useLeads`, `useCarriers`, `useSavedSearches`). Prefer adding hooks there over calling `api` from components directly.
- **Auth gate**: `App.tsx` has exactly two routes — `/login` and `/*` (protected). `ProtectedRoute` reads the token from `localStorage`; there is no server-validated session on initial mount, so the first `/auth/me` call is what actually authenticates.
- **Vite dev proxy** (`vite.config.ts`) forwards `/auth`, `/leads`, `/carriers`, `/searches`, `/apollo`, `/stripe`, `/ai` to `localhost:3001`. New top-level API path prefixes must be added here or dev calls 404.

### Data model

- `companies` is the public dataset (sourced from FMCSA, SOS registries, Google Places, etc.), unique by `(source, source_id)`. Ingest scripts upsert on this key, making them idempotent.
- `leads` is the per-user CRM table, unique by `(user_id, client_id)` where `client_id` is a UUID generated on the frontend — this is how the localStorage→Postgres sync (`POST /leads/sync`) deduplicates.
- `LeadStatus` values are `new | cold | contacted | replied | meeting | proposal | won | lost`. `FOLLOWUP_DAYS` in the server maps status → days until next follow-up.
- `LeadCategory` values are `fleet | design | construction | dinoc | reatec | colorchange | wallgraphics | gc_referral | racing`. Categories are referenced in Apollo title lookup, autoSeed, analytics breakdowns, and the Mission view.
- `lib/autoSeed.js` runs at registration to pre-load curated leads from `seed-*.js` files into the new user's CRM. The legacy `seed-*.js` files are not CLIs — they're CommonJS modules that export `LEADS` arrays.

### Legacy artifacts to be aware of

`wrapleads-crm.html`, `wrapleads-auth.html`, `wrapleads-preview.html` are leftover from the pre-React monolithic frontend and are **not** served by `wrapleads-server.js` (it serves `dist/index.html` instead). Treat them as historical reference; don't edit them for new work and don't add server routes for them.

## Conventions

- **Node 18+** required (`engines` in `package.json`). The codebase relies on global `fetch`.
- **CommonJS on the backend** (`require`/`module.exports`); **ES modules + TS on the frontend** (`type: "module"`). Don't mix.
- **Inline SQL via `pg.Pool`** is the norm — there is no ORM. Always use parameterized queries (`$1`, `$2`...); never interpolate user input.
- **All user-scoped queries must filter by `user_id`** (the JWT payload puts the user id at `req.user.id`; the DB column is `TEXT` so always stringify: `String(req.user.id)`). Forgetting this leaks data across tenants.
- **Env vars** are documented in `wrapleads/.env.example`. Optional integrations (`STRIPE_*`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `APOLLO_API_KEY`, `GOOGLE_PLACES_API_KEY`) all degrade gracefully when missing — preserve that pattern when adding new ones (log a `[name] not configured` line at boot rather than crashing). Stripe expects three separate price IDs for the three-tier system: `STRIPE_PRICE_ID_WRAPLEADS`, `STRIPE_PRICE_ID_SHOPFLOW`, `STRIPE_PRICE_ID_WRAPOS`. The legacy `STRIPE_PRICE_ID` still works as a single-tier fallback for the WrapLeads tier.
- **Deployment**: `railway.toml` + `Procfile` target Railway, building the frontend then starting `npm start`.

## Working notes

`NOTES.md` at the repo root is the owner's running scratchpad (current focus: importing racing/motorsports leads, exploring Vapi.ai/Bland.ai for outbound calling). It's not a spec — treat it as context for what's actively being worked on, not as authoritative requirements.
