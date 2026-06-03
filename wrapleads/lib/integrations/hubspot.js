/**
 * HubSpot integration — OAuth client + contact-push helper.
 *
 * Surface:
 *   - getAuthorizeUrl(userId, redirectUri)     -> URL to start OAuth flow
 *   - exchangeCodeForToken(code, redirectUri)  -> { access_token, refresh_token, expires_in, hub_id, ... }
 *   - getValidToken(pool, userId)              -> fresh access token (auto-refreshes if expired)
 *   - ensureCustomProperties(pool, userId)     -> creates HelioScout custom contact properties (idempotent)
 *   - pushContacts(pool, userId, leads)        -> batch-upserts leads as HubSpot contacts
 *   - disconnect(pool, userId)                 -> deletes stored token (caller should also revoke at HubSpot if desired)
 *
 * Storage: rows in `crm_connections` (provider='hubspot') keyed by user_id.
 * Token refresh: HubSpot refresh tokens are long-lived; access tokens last ~6h.
 *
 * Degrades gracefully: if HUBSPOT_CLIENT_ID/SECRET are missing, every method
 * throws a typed error the caller can catch and surface as "integration not
 * configured" instead of crashing the request.
 *
 * HubSpot API docs:
 *   OAuth:       https://developers.hubspot.com/docs/api/working-with-oauth
 *   Contacts:    https://developers.hubspot.com/docs/api/crm/contacts
 *   Properties:  https://developers.hubspot.com/docs/api/crm/properties
 */

'use strict';

const SCOPES = [
  'crm.objects.contacts.write',
  'crm.objects.contacts.read',
  'crm.schemas.contacts.write',
  'crm.objects.companies.write',
  'oauth',
];

const PROPERTY_GROUP_NAME = 'helioscout';
const CUSTOM_PROPERTIES = [
  { name: 'helioscout_fit_score',        label: 'HelioScout Solar Fit Score (0-100)',     type: 'number',  fieldType: 'number'    },
  { name: 'helioscout_naics_code',       label: 'NAICS Code',                              type: 'string',  fieldType: 'text'      },
  { name: 'helioscout_naics_sector',     label: 'NAICS Sector',                            type: 'string',  fieldType: 'text'      },
  { name: 'helioscout_energy_intensity', label: 'Energy Intensity',                        type: 'enumeration', fieldType: 'select',
    options: [
      { label: 'Very High', value: 'very_high' },
      { label: 'High',      value: 'high'      },
      { label: 'Moderate',  value: 'moderate'  },
      { label: 'Low',       value: 'low'       },
    ],
  },
  { name: 'helioscout_recommended_ownership', label: 'Recommended Ownership Model', type: 'enumeration', fieldType: 'select',
    options: [
      { label: 'Direct Purchase', value: 'direct_purchase' },
      { label: 'PPA',             value: 'ppa'             },
      { label: 'Lease',           value: 'lease'           },
      { label: 'Cash or PPA',     value: 'cash_or_ppa'     },
    ],
  },
  { name: 'helioscout_est_system_kw',     label: 'Estimated System Size (kW)',       type: 'number', fieldType: 'number' },
  { name: 'helioscout_est_annual_savings_usd', label: 'Estimated Annual Savings ($)', type: 'number', fieldType: 'number' },
  { name: 'helioscout_est_payback_years', label: 'Estimated Net Payback (years)',    type: 'number', fieldType: 'number' },
  { name: 'helioscout_provenance_url',    label: 'Provenance URL (source record)',   type: 'string', fieldType: 'text'   },
  { name: 'helioscout_sales_script',      label: 'Sales Script (CFO opener)',        type: 'string', fieldType: 'textarea' },
];

function clientCreds() {
  const id = process.env.HUBSPOT_CLIENT_ID;
  const secret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!id || !secret) {
    const e = new Error('HubSpot OAuth not configured — set HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET');
    e.code = 'HUBSPOT_NOT_CONFIGURED';
    throw e;
  }
  return { id, secret };
}

function getAuthorizeUrl(userId, redirectUri) {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state: String(userId), // round-trips through OAuth; we verify on callback
  });
  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code, redirectUri) {
  const { id, secret } = clientCreds();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri,
    code,
  });
  const r = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`HubSpot token exchange failed (${r.status}): ${txt}`);
  }
  return r.json();
}

async function refreshAccessToken(refreshToken) {
  const { id, secret } = clientCreds();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: id,
    client_secret: secret,
    refresh_token: refreshToken,
  });
  const r = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`HubSpot token refresh failed (${r.status}): ${txt}`);
  }
  return r.json();
}

async function saveTokenForUser(pool, userId, tokenJson) {
  const accountId = tokenJson.hub_id ? String(tokenJson.hub_id) : null;
  const expiresAt = new Date(Date.now() + (tokenJson.expires_in || 21600) * 1000);
  await pool.query(`
    INSERT INTO crm_connections (user_id, provider, access_token, refresh_token, expires_at, account_id, scopes, updated_at)
    VALUES ($1, 'hubspot', $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (user_id, provider)
    DO UPDATE SET access_token = EXCLUDED.access_token,
                  refresh_token = EXCLUDED.refresh_token,
                  expires_at    = EXCLUDED.expires_at,
                  account_id    = EXCLUDED.account_id,
                  scopes        = EXCLUDED.scopes,
                  updated_at    = NOW()
  `, [String(userId), tokenJson.access_token, tokenJson.refresh_token, expiresAt, accountId, SCOPES]);
}

async function getValidToken(pool, userId) {
  const r = await pool.query(
    `SELECT access_token, refresh_token, expires_at, account_id FROM crm_connections WHERE user_id = $1 AND provider = 'hubspot' LIMIT 1`,
    [String(userId)]
  );
  if (!r.rows.length) return null;
  const row = r.rows[0];
  const now = Date.now();
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  // Refresh if expired or within 5 minutes of expiry
  if (expiresAt - now > 5 * 60 * 1000) {
    return { accessToken: row.access_token, accountId: row.account_id };
  }
  const fresh = await refreshAccessToken(row.refresh_token);
  await saveTokenForUser(pool, userId, fresh);
  return { accessToken: fresh.access_token, accountId: fresh.hub_id ? String(fresh.hub_id) : row.account_id };
}

async function disconnect(pool, userId) {
  await pool.query(
    `DELETE FROM crm_connections WHERE user_id = $1 AND provider = 'hubspot'`,
    [String(userId)]
  );
}

async function isConnected(pool, userId) {
  const r = await pool.query(
    `SELECT account_id, updated_at FROM crm_connections WHERE user_id = $1 AND provider = 'hubspot' LIMIT 1`,
    [String(userId)]
  );
  if (!r.rows.length) return { connected: false };
  return { connected: true, account_id: r.rows[0].account_id, connected_at: r.rows[0].updated_at };
}

async function ensureCustomProperties(pool, userId) {
  const token = await getValidToken(pool, userId);
  if (!token) throw new Error('HubSpot not connected');

  // Ensure the property group exists first (silently OK if it already exists)
  await fetch(`https://api.hubapi.com/crm/v3/properties/contacts/groups`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: PROPERTY_GROUP_NAME,
      label: 'HelioScout',
      displayOrder: -1,
    }),
  });

  const results = [];
  for (const p of CUSTOM_PROPERTIES) {
    const r = await fetch(`https://api.hubapi.com/crm/v3/properties/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: p.name,
        label: p.label,
        type: p.type,
        fieldType: p.fieldType,
        groupName: PROPERTY_GROUP_NAME,
        options: p.options,
      }),
    });
    // 409 = already exists (idempotent), 201 = created
    results.push({ name: p.name, status: r.status });
  }
  return results;
}

function leadToHubSpotProperties(lead) {
  // Lead shape comes from territory pack CSV — see scripts/package-territory-pack.js COLS
  const nameParts = (lead.company || '').split(' ').filter(Boolean);
  return {
    // Standard properties — use company name as both firstname-fallback and company
    company:    lead.company || '',
    city:       lead.city || '',
    state:      lead.state || '',
    website:    lead.website || '',
    industry:   lead.naics_sector || '',
    // The "email" property is the dedup key — if no email, HubSpot will refuse the contact.
    // Lead-pack rows DO NOT include email by design (we sell qualified accounts; user enriches contacts).
    // So we create a synthetic placeholder email that lets HubSpot dedupe by source_id.
    email:      lead.source_id ? `noreply+${lead.source_id}@helioscout.app` : `noreply+${(lead.company||'unknown').toLowerCase().replace(/[^a-z0-9]/g,'')}@helioscout.app`,
    lifecyclestage: 'lead',
    // HelioScout custom properties
    helioscout_fit_score:              lead.solar_fit_score ?? null,
    helioscout_naics_code:             lead.naics_code || null,
    helioscout_naics_sector:           lead.naics_sector || null,
    helioscout_energy_intensity:       lead.energy_intensity || null,
    helioscout_recommended_ownership:  lead.recommended_ownership || null,
    helioscout_est_system_kw:          lead.est_system_kw ?? null,
    helioscout_est_annual_savings_usd: lead.est_annual_savings_usd ?? null,
    helioscout_est_payback_years:      lead.est_net_payback_yrs ?? null,
    helioscout_provenance_url:         lead.provenance_url || null,
    helioscout_sales_script:           lead.script_cfo || lead.sales_script || null,
  };
}

async function pushContacts(pool, userId, leads, opts = {}) {
  const token = await getValidToken(pool, userId);
  if (!token) throw new Error('HubSpot not connected for this user');

  const BATCH_SIZE = 100; // HubSpot batch limit
  const results = { ok: 0, failed: 0, errors: [] };

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const inputs = batch.map(lead => ({
      // Upsert by email (synthetic email keyed off source_id keeps it idempotent)
      idProperty: 'email',
      id: leadToHubSpotProperties(lead).email,
      properties: leadToHubSpotProperties(lead),
    }));

    const r = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs }),
    });
    if (r.ok) {
      const body = await r.json();
      results.ok += body.results?.length || batch.length;
    } else {
      const txt = await r.text().catch(() => '');
      results.failed += batch.length;
      results.errors.push({ batch_index: i, status: r.status, body: txt.slice(0, 300) });
      if (opts.failFast) break;
    }
    // Pace under HubSpot's 100 req/10s default rate limit
    if (i + BATCH_SIZE < leads.length) await new Promise(res => setTimeout(res, 300));
  }
  return results;
}

module.exports = {
  SCOPES,
  CUSTOM_PROPERTIES,
  getAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  saveTokenForUser,
  getValidToken,
  isConnected,
  disconnect,
  ensureCustomProperties,
  pushContacts,
  leadToHubSpotProperties,
};
