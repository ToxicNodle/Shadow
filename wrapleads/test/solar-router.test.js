/**
 * Smoke tests for the HelioScout solar API.
 *
 * Uses Node's built-in test runner (node:test) — no Mocha/Jest dep.
 * Boots the server in-process against a mock pool, fires HTTP requests
 * via undici (built-in Node 18+), and asserts the expected status
 * codes + response shapes for every public + a sample of auth-required
 * routes.
 *
 * Run:    node --test test/solar-router.test.js
 *         npm test     (once we wire the script)
 *
 * Mock pool returns realistic shapes so the assertions exercise the
 * happy-path serialization without needing a real Postgres.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { buildSolarRouter } = require('../lib/solar-router');

// ── Mock pool ────────────────────────────────────────────────────────────
function makeMockPool() {
  return {
    query: async (sql, _params) => {
      // overview endpoint
      if (sql.includes('GROUP BY state')) return { rows: [{ state: 'TX', n: 100 }, { state: 'CA', n: 80 }] };
      if (sql.includes('GROUP BY source')) return { rows: [{ source: 'epa_ghgrp', n: 200 }] };
      if (sql.includes('LEFT(naics_code, 2)')) return { rows: [{ naics2: '49', n: 50 }] };
      if (sql.includes('bucket_80_100')) return { rows: [{ bucket_80_100: 12, bucket_60_79: 30, bucket_40_59: 80, bucket_20_39: 60, bucket_under_20: 18 }] };
      if (sql.includes('date_trunc')) return { rows: [{ month: '2026-01-01', n: 100 }] };
      if (sql.includes('total_companies')) return { rows: [{ total_companies: 200, my_solar_leads: 5, my_won: 1, my_open_auctions: 0, my_installers: 0 }] };

      // solar_auctions / unsubscribe_tokens / proposals empty-result lookups
      if (sql.includes('FROM solar_auctions')) return { rows: [] };
      if (sql.includes('FROM unsubscribe_tokens')) return { rows: [] };
      if (sql.includes('FROM proposals')) return { rows: [] };

      return { rows: [] };
    },
  };
}

// ── Mock middleware ──────────────────────────────────────────────────────
const fakeAuth = (req, res, next) => {
  // Honor an Authorization: Bearer test-token header for "auth required" routes
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  req.user = { id: '1', planTier: 'wrapos', subStatus: 'active' };
  next();
};
const fakeTier = (_req, _res, next) => next();

// ── Build a test app ─────────────────────────────────────────────────────
function makeApp() {
  const app = express();
  app.use(express.json());
  const pool = makeMockPool();
  app.use('/solar', buildSolarRouter({
    pool,
    authMiddleware: fakeAuth,
    subMiddleware:  fakeTier,
    requireShopFlow: fakeTier,
    requireWrapOS:   fakeTier,
    logActivity:     async () => {},
    createNotification: async () => {},
    sendCompliantEmail: async () => ({ id: 'noop' }),
    appBaseUrl: () => 'http://localhost',
    APOLLO_TITLES: { commercial_solar: ['Plant Manager'] },
    generateSolarOpener: async () => ({ subject: 'test', body: 'test' }),
    queueSolarFollowups: async () => {},
  }));
  return app;
}

let server;
let baseUrl;
test.before(async () => {
  const app = makeApp();
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  baseUrl = `http://localhost:${server.address().port}`;
});
test.after(() => server?.close());

// ── Helpers — use built-in fetch (Node 18+) instead of undici ────────────
async function get(path, opts = {}) {
  const headers = opts.headers || {};
  const r = await fetch(`${baseUrl}${path}`, { method: 'GET', headers });
  const body = await r.text();
  let json = null;
  try { json = JSON.parse(body); } catch { /* not JSON */ }
  return { status: r.status, body, json };
}
async function post(path, body, opts = {}) {
  const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
  const r = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: text, json };
}

// ── Tests ────────────────────────────────────────────────────────────────
test('public token routes 404 cleanly on bad tokens', async (t) => {
  await t.test('/solar/proposal/<garbage>', async () => {
    const r = await get('/solar/proposal/garbage');
    assert.equal(r.status, 404);
    assert.equal(r.json.error, 'Proposal not found');
  });

  await t.test('/solar/proposal/<garbage>.pdf', async () => {
    const r = await get('/solar/proposal/garbage.pdf');
    assert.equal(r.status, 404);
    assert.equal(r.json.error, 'Proposal not found');
  });

  await t.test('/solar/__unsubscribe/<garbage>', async () => {
    const r = await get('/solar/__unsubscribe/garbage');
    assert.equal(r.status, 404);
    assert.match(r.body, /HelioScout/);
    assert.match(r.body, /Invalid unsubscribe link/);
  });

  await t.test('/solar/auctions/<garbage>', async () => {
    const r = await get('/solar/auctions/garbage');
    assert.equal(r.status, 404);
    assert.equal(r.json.error, 'Auction not found');
  });
});

test('public token routes return 404 for valid-shape but missing tokens', async (t) => {
  const fakeToken = 'a'.repeat(40);
  await t.test('valid hex token but no record', async () => {
    const r = await get(`/solar/proposal/${fakeToken}`);
    assert.equal(r.status, 404);
  });
});

test('auth-required routes return 401 without bearer token', async (t) => {
  await t.test('POST /solar/discover', async () => {
    const r = await post('/solar/discover', {});
    assert.equal(r.status, 401);
  });

  await t.test('GET /solar/overview', async () => {
    const r = await get('/solar/overview');
    assert.equal(r.status, 401);
  });

  await t.test('GET /solar/qualified', async () => {
    const r = await get('/solar/qualified');
    assert.equal(r.status, 401);
  });
});

test('overview endpoint returns aggregated stats shape', async () => {
  const r = await get('/solar/overview', { headers: { authorization: 'Bearer test' } });
  assert.equal(r.status, 200);
  assert.ok(r.json.totals);
  assert.equal(r.json.totals.total_companies, 200);
  assert.ok(Array.isArray(r.json.by_state));
  assert.ok(Array.isArray(r.json.by_source));
  assert.ok(Array.isArray(r.json.by_naics2));
  assert.ok(r.json.score_distribution.bucket_80_100 !== undefined);
});

test('CSV import rejects malformed payloads', async (t) => {
  await t.test('missing csv_text', async () => {
    const r = await post('/solar/leads/csv-import', {}, { headers: { authorization: 'Bearer test' } });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /csv_text/);
  });

  await t.test('too short', async () => {
    const r = await post('/solar/leads/csv-import', { csv_text: 'foo' }, { headers: { authorization: 'Bearer test' } });
    assert.equal(r.status, 400);
  });

  await t.test('missing company column', async () => {
    const csv = 'email,phone\nfoo@bar.com,555-1234\n';
    // Need to be long enough to bypass the length gate
    const padded = csv + (' '.repeat(40));
    const r = await post('/solar/leads/csv-import', { csv_text: padded }, { headers: { authorization: 'Bearer test' } });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /company/);
  });
});

test('intake webhook rejects missing secret', async () => {
  const r = await post('/solar/intake', { company: 'Test Corp', email: 'x@y.com' });
  assert.equal(r.status, 401);
  assert.match(r.json.error, /X-Webhook-Secret/);
});

test('SSE stream endpoint rejects malformed tokens with 404', async () => {
  const r = await get('/solar/auctions/garbage/stream');
  assert.equal(r.status, 404);
});

// Pure-math + intelligence tests live in solar-smoke.test.js — this file
// covers route-level + integration concerns only.
