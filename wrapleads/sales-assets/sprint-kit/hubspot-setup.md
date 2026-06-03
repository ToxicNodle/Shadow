# HubSpot Integration Setup (Phase B4)

## What it does

When a buyer purchases a lead pack from HelioScout (e.g. the $1,497 TX state pack),
their HubSpot account auto-receives all the leads as Contacts, each one tagged with
custom HelioScout properties:

- `helioscout_fit_score` (0-100)
- `helioscout_naics_code` + `helioscout_naics_sector`
- `helioscout_energy_intensity` (very_high / high / moderate / low)
- `helioscout_recommended_ownership` (direct_purchase / ppa / lease)
- `helioscout_est_system_kw`
- `helioscout_est_annual_savings_usd`
- `helioscout_est_payback_years`
- `helioscout_provenance_url` (link to EPA / USAspending source record)
- `helioscout_sales_script` (CFO opener)

Replaces the friction of "buy a CSV → import into HubSpot manually → set up custom
properties → match columns → run the workflow". One-click sync after auth.

## One-time setup at HubSpot

### 1. Create a HubSpot Developer Account

1. Go to https://developers.hubspot.com/
2. Sign in with your personal HubSpot account (or create a new one — it's free)
3. Click **Manage Apps** → **Create app**

### 2. Create the HelioScout App

Fill in:
- **Name**: `HelioScout`
- **Description**: `Sync EPA-verified commercial solar leads into your CRM with NAICS fit scoring, payback math, and source provenance.`
- **Logo**: Upload `dist-public/assets/hs-logo.png` (or skip — use HubSpot default)

### 3. Set the OAuth Redirect URI

In the app's **Auth** tab:
- **Redirect URLs**: add exactly
  ```
  https://helioscout.app/solar/integrations/hubspot/callback
  ```
  (also add `http://localhost:3001/solar/integrations/hubspot/callback` for dev)

- **Scopes**: select these checkboxes (these match `lib/integrations/hubspot.js` SCOPES):
  - `crm.objects.contacts.read`
  - `crm.objects.contacts.write`
  - `crm.objects.companies.write`
  - `crm.schemas.contacts.write`
  - `oauth`

### 4. Copy the credentials

In the app's **Auth** tab there are two values:
- **Client ID** — public, OK to expose
- **Client secret** — KEEP SECRET, never commit to git

Add them to `wrapleads/.env`:

```
HUBSPOT_CLIENT_ID=xxxxxxxxx
HUBSPOT_CLIENT_SECRET=xxxxxxxxx
```

Restart the server (`npm run dev:server` or your Railway deploy).

## Test the flow

1. Open SolarScoutView → **Integrations** tab
2. Click **Connect HubSpot →**
3. HubSpot auth screen appears → pick which HubSpot account to authorize
4. Click **Choose Account** → **Connect app**
5. Browser bounces back to HelioScout, **Integrations** tab shows ✓ Connected
6. Custom HelioScout properties are auto-created in your HubSpot under a
   "HelioScout" property group (5-10 second background task)
7. Use the **Manual sync** widget — pick a state (e.g. TX) → **Push TX → HubSpot**
8. Check HubSpot → Contacts → filter by `helioscout_fit_score > 0` → you should
   see your leads landed

## What happens on a lead-pack purchase

After `fulfillLeadPack()` emails the CSV to the buyer (in `wrapleads-server.js:9158`):

1. Resolve the buyer's `user_id` (from Stripe metadata OR by looking up `users.email`)
2. Check if that user has a HubSpot connection in `crm_connections`
3. If yes, parse the CSV they just bought + batch-upsert all rows as contacts
4. Audit log written to `outreach_audit_log` with provider='hubspot' + counts

Failures are non-fatal — the buyer still gets their CSV email regardless.

## API surface

| Route | Auth | Purpose |
|---|---|---|
| `GET /solar/integrations/hubspot/connect` | yes | Redirects to HubSpot OAuth |
| `GET /solar/integrations/hubspot/callback` | no | OAuth return — HubSpot calls this |
| `GET /solar/integrations/status` | yes | Returns `{ hubspot_configured, connections: [] }` |
| `POST /solar/integrations/hubspot/disconnect` | yes | Deletes stored token |
| `POST /solar/integrations/hubspot/push` | yes | Manual re-sync: `{ state: 'TX' }` or `{ leads: [...] }` |

## Schema added

`crm_connections` (created via `migrateDb()`):
```sql
CREATE TABLE crm_connections (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  provider      TEXT NOT NULL,    -- 'hubspot' (more later)
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  account_id    TEXT,
  account_name  TEXT,
  scopes        TEXT[],
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, provider)
);
```

Token refresh is automatic — `getValidToken()` checks `expires_at`, refreshes 5
minutes before expiry, persists the new token transparently. No cron job required.

## Sales angle

HubSpot is the #1 ask from competitive analysis (SurgePV / Enerflo / Sunvoy all
have it). This unlocks the **"Want it in your CRM? Connect HubSpot → done."**
positioning that closes 30%+ better than "here's a CSV, import it yourself."

Pricing strategy: HubSpot connection is included with State Pack ($1,497+) tier
— a free upgrade that lifts perceived value 2x without raising the price.
