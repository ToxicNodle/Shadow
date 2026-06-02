'use strict';

const test = require('node:test');
const assert = require('node:assert');

// Force unset before requiring — the module reads env on each call.
delete process.env.HUBSPOT_CLIENT_ID;
delete process.env.HUBSPOT_CLIENT_SECRET;

const hubspot = require('../lib/integrations/hubspot');

test('hubspot: module exports the public surface', () => {
  for (const fn of [
    'getAuthorizeUrl', 'exchangeCodeForToken', 'refreshAccessToken',
    'saveTokenForUser', 'getValidToken', 'isConnected', 'disconnect',
    'ensureCustomProperties', 'pushContacts', 'leadToHubSpotProperties',
  ]) {
    assert.strictEqual(typeof hubspot[fn], 'function', `${fn} should be a function`);
  }
  assert.ok(Array.isArray(hubspot.SCOPES) && hubspot.SCOPES.length >= 3, 'SCOPES is a non-empty array');
  assert.ok(Array.isArray(hubspot.CUSTOM_PROPERTIES) && hubspot.CUSTOM_PROPERTIES.length >= 5, 'CUSTOM_PROPERTIES seeded');
});

test('hubspot: getAuthorizeUrl throws HUBSPOT_NOT_CONFIGURED without env vars', () => {
  try {
    hubspot.getAuthorizeUrl(42, 'http://localhost/cb');
    assert.fail('Expected HUBSPOT_NOT_CONFIGURED');
  } catch (e) {
    assert.strictEqual(e.code, 'HUBSPOT_NOT_CONFIGURED');
  }
});

test('hubspot: getAuthorizeUrl builds the expected URL with creds set', () => {
  process.env.HUBSPOT_CLIENT_ID = 'cid-abc';
  process.env.HUBSPOT_CLIENT_SECRET = 'cs-xyz';
  try {
    const url = hubspot.getAuthorizeUrl(42, 'https://helioscout.app/solar/integrations/hubspot/callback');
    const u = new URL(url);
    assert.strictEqual(u.origin + u.pathname, 'https://app.hubspot.com/oauth/authorize');
    assert.strictEqual(u.searchParams.get('client_id'), 'cid-abc');
    assert.strictEqual(u.searchParams.get('redirect_uri'), 'https://helioscout.app/solar/integrations/hubspot/callback');
    assert.strictEqual(u.searchParams.get('state'), '42');
    const scopes = u.searchParams.get('scope').split(' ');
    assert.ok(scopes.includes('crm.objects.contacts.write'), 'contacts.write scope present');
    assert.ok(scopes.includes('oauth'), 'oauth scope present');
  } finally {
    delete process.env.HUBSPOT_CLIENT_ID;
    delete process.env.HUBSPOT_CLIENT_SECRET;
  }
});

test('hubspot: leadToHubSpotProperties maps territory pack rows correctly', () => {
  const props = hubspot.leadToHubSpotProperties({
    company: 'Acme Cold Storage',
    city: 'Houston',
    state: 'TX',
    source_id: 'epa-1006163',
    naics_code: '493120',
    naics_sector: 'Warehousing / Cold Storage',
    solar_fit_score: 96,
    energy_intensity: 'very_high',
    recommended_ownership: 'direct_purchase',
    est_system_kw: 2000,
    est_annual_savings_usd: 301344,
    est_net_payback_yrs: 6.6,
    provenance_url: 'https://ghgdata.epa.gov/ghgp/main.do#/facilityDetail?facilityId=epa-1006163',
    script_cfo: 'Worth 15 min to see the model?',
  });
  assert.strictEqual(props.company, 'Acme Cold Storage');
  assert.strictEqual(props.state, 'TX');
  // Synthetic dedup email keyed off source_id
  assert.strictEqual(props.email, 'noreply+epa-1006163@helioscout.app');
  assert.strictEqual(props.helioscout_fit_score, 96);
  assert.strictEqual(props.helioscout_recommended_ownership, 'direct_purchase');
  assert.strictEqual(props.helioscout_provenance_url, 'https://ghgdata.epa.gov/ghgp/main.do#/facilityDetail?facilityId=epa-1006163');
  assert.strictEqual(props.lifecyclestage, 'lead');
});

test('hubspot: leadToHubSpotProperties falls back to company-name slug when no source_id', () => {
  const props = hubspot.leadToHubSpotProperties({ company: 'Big Sun Solar', state: 'TX' });
  assert.match(props.email, /^noreply\+bigsunsolar@helioscout\.app$/);
});

test('hubspot: pushContacts throws when no token stored', async () => {
  // Mock pool with empty result — simulates a user without a stored connection.
  const pool = { query: async () => ({ rows: [] }) };
  await assert.rejects(
    () => hubspot.pushContacts(pool, 'no-such-user', [{ company: 'X' }]),
    /HubSpot not connected/
  );
});

test('hubspot: ensureCustomProperties covers all the documented properties', () => {
  const names = hubspot.CUSTOM_PROPERTIES.map(p => p.name);
  for (const required of [
    'helioscout_fit_score',
    'helioscout_recommended_ownership',
    'helioscout_provenance_url',
    'helioscout_est_annual_savings_usd',
    'helioscout_sales_script',
  ]) {
    assert.ok(names.includes(required), `missing custom property ${required}`);
  }
});
