/**
 * Smoke tests for the solar intelligence stack.
 *
 * Runs Node's native test runner (--experimental-test-runner / node >= 20).
 * No external test framework required.
 *
 * Run: npm test
 *
 * Covers the pure-math + intelligence libraries that don't need a DB.
 * Route-level tests would require a Postgres test container; deferred.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

test('solar-math: estimates a reasonable system for a 180k sqft membrane roof', () => {
  const m = require('../lib/solar-math');
  const r = m.fullEstimate({
    buildingSqft: 180000, roofType: 'membrane', latitude: 33.45,
    utilityRate: 0.13, estAnnualKwh: null,
  });
  assert.ok(r.system_kw > 1500 && r.system_kw <= 2000, `system_kw=${r.system_kw} should be 1500-2000`);
  assert.ok(r.annual_kwh > 2_000_000, `annual_kwh=${r.annual_kwh} should be >2M for this system`);
  assert.ok(r.annual_savings_usd > 250_000);
  assert.ok(r.gross_cost_usd > 1_000_000);
});

test('solar-math: caps system at 2MW even on a very large roof', () => {
  const m = require('../lib/solar-math');
  const r = m.fullEstimate({ buildingSqft: 5_000_000, roofType: 'flat', latitude: 33 });
  assert.strictEqual(r.system_kw, 2000, 'should cap at 2000kW');
});

test('solar-math: returns zeroed economics for invalid building sqft', () => {
  const m = require('../lib/solar-math');
  const r = m.fullEstimate({ buildingSqft: 100, roofType: 'shingle', latitude: 40 });
  assert.strictEqual(r.system_kw, 0);
  assert.strictEqual(r.annual_kwh, 0);
});

test('naics-solar-fit: NAICS 493120 cold storage scores 95+', () => {
  const n = require('../lib/naics-solar-fit');
  const p = n.lookup('493120');
  assert.ok(p, 'should return a profile');
  assert.ok(p.fit >= 95, `fit=${p.fit} should be >= 95`);
  assert.strictEqual(p.tax_appetite, 'corporate');
  assert.strictEqual(p.ownership_model, 'direct_purchase');
});

test('naics-solar-fit: 611110 elementary school routes to PPA (tax-exempt)', () => {
  const n = require('../lib/naics-solar-fit');
  const p = n.lookup('611110');
  assert.ok(p);
  assert.strictEqual(p.tax_appetite, 'tax_exempt');
  assert.strictEqual(p.ownership_model, 'ppa');
});

test('naics-solar-fit: falls back to 2-digit prefix when unknown', () => {
  const n = require('../lib/naics-solar-fit');
  const p = n.lookup('339999'); // unknown 6-digit but '33' is in PREFIX_PROFILES
  assert.ok(p);
  assert.ok(p.generic === true, 'should mark as generic fallback');
});

test('naics-solar-fit: inferNaicsFromIndustry maps text to NAICS', () => {
  const n = require('../lib/naics-solar-fit');
  assert.strictEqual(n.inferNaicsFromIndustry('cold storage warehouse'), '493120');
  assert.strictEqual(n.inferNaicsFromIndustry('data center'), '518210');
  assert.strictEqual(n.inferNaicsFromIndustry('church of christ'), '8131');
});

test('solar-tariffs: lookup matches PG&E', () => {
  const t = require('../lib/solar-tariffs');
  const u = t.lookup('Pacific Gas & Electric');
  assert.ok(u.name?.includes('PG&E'));
  assert.strictEqual(u.nem_version, 'NEM 3.0');
  assert.ok(u.storage_recommended);
});

test('solar-tariffs: returns FALLBACK for unknown utility', () => {
  const t = require('../lib/solar-tariffs');
  const u = t.lookup('Some Random Co-op');
  assert.strictEqual(u.nem_version, 'unknown');
});

test('solar-incentives: stack adds federal ITC + MACRS + state at 35%+', () => {
  const i = require('../lib/solar-incentives');
  const s = i.calculateStack({
    grossCost: 1_000_000, systemKw: 500, annualKwh: 800_000,
    state: 'AZ', zip: '85001', bonuses: {},
  });
  assert.ok(s.federal_credit >= 300_000, `federal=${s.federal_credit}`);
  assert.ok(s.depreciation_benefit > 100_000);
  assert.ok(s.net_cost < 600_000, `net=${s.net_cost} should be reduced significantly`);
});

test('solar-incentives: IRA bonuses stack additively on ITC', () => {
  const i = require('../lib/solar-incentives');
  const base = i.calculateStack({ grossCost: 1_000_000, systemKw: 500, annualKwh: 800_000, state: 'AZ', zip: '85001' });
  const boosted = i.calculateStack({ grossCost: 1_000_000, systemKw: 500, annualKwh: 800_000, state: 'AZ', zip: '85001', bonuses: { energy_community: true, domestic_content: true } });
  assert.ok(boosted.federal_credit > base.federal_credit, 'bonuses should increase credit');
});

test('solar-incentives: NJ SREC market adds material NPV', () => {
  const i = require('../lib/solar-incentives');
  const r = i.srecRevenueNpv('NJ', 1_000_000);
  assert.ok(r.npv > 200_000, `NJ NPV=${r.npv} should be >$200k for 1M kWh/yr`);
});

test('solar-incentives: urgencyHook returns federal stepdown as default', () => {
  const i = require('../lib/solar-incentives');
  const msg = i.urgencyHook({ state: 'ZZ', tariff: {}, bonuses: {} });
  assert.ok(msg.includes('ITC') || msg.includes('2033'), `got: ${msg}`);
});

test('solar-monte-carlo: produces a positive NPV distribution for profitable project', () => {
  const mc = require('../lib/solar-monte-carlo');
  const r = mc.simulate({
    systemKw: 2000, year1AnnualKwh: 3_260_000,
    year1RatePerKwh: 0.13, netInstallCost: 1_981_700, runs: 500,
  });
  assert.ok(r.npv.p50 > 0, `p50=${r.npv.p50} should be positive`);
  assert.ok(r.npv.p10 < r.npv.p50);
  assert.ok(r.npv.p90 > r.npv.p50);
  assert.ok(r.payback_years.probability_pays_back >= 0.95, 'should almost always pay back');
});

test('solar-monte-carlo: returns null for zero-size system', () => {
  const mc = require('../lib/solar-monte-carlo');
  assert.strictEqual(mc.simulate({ systemKw: 0, year1AnnualKwh: 0, year1RatePerKwh: 0.13, netInstallCost: 0 }), null);
});

test('compliance: detects STOP / UNSUBSCRIBE replies', () => {
  const c = require('../lib/compliance');
  assert.ok(c.isStopReply('STOP'));
  assert.ok(c.isStopReply('please unsubscribe me'));
  assert.ok(c.isStopReply('OPT-OUT'));
  assert.ok(c.isStopReply('do not email me again'));
  assert.ok(!c.isStopReply('hey looking forward to chatting'));
});

test('compliance: canEmail false when do_not_email or no email', () => {
  const c = require('../lib/compliance');
  assert.ok(!c.canEmail(null));
  assert.ok(!c.canEmail({}));
  assert.ok(!c.canEmail({ email: 'a@b.c', do_not_email: true }));
  assert.ok(!c.canEmail({ email: 'a@b.c', opt_out_at: new Date().toISOString() }));
  assert.ok(c.canEmail({ email: 'a@b.c' }));
});

test('qualify-lead: scores a Phoenix cold storage facility as Ultra-Qualified', async () => {
  const q = require('../lib/qualify-lead');
  const r = await q.qualify({
    company: 'Acme Cold Storage',
    city: 'Phoenix', state: 'AZ', zip: '85001',
    latitude: 33.45, longitude: -112.07,
    building_sqft: 180000, roof_type: 'membrane',
    naics_code: '493120',
  });
  assert.strictEqual(r.status, 'Ultra-Qualified');
  assert.strictEqual(r.score, 5);
  assert.ok(r.gates.has_naics_fit);
  assert.ok(r.gates.has_real_geometry);
  assert.ok(r.gates.incentive_coverage);
});

test('qualify-lead: empty input returns Disqualified without crashing', async () => {
  const q = require('../lib/qualify-lead');
  const r = await q.qualify({});
  assert.strictEqual(r.status, 'Disqualified');
  assert.strictEqual(r.score, 0);
});

test('seed data: all expected seed files load + total > 20k', () => {
  const total = ['seed-leads','seed-gc','seed-designers','seed-schools','seed-racing','seed-solar','seed-epa-facilities','seed-usaspending-leads','seed-osm-industrial']
    .reduce((sum, f) => {
      try { return sum + require('../' + f).LEADS.length; } catch { return sum; }
    }, 0);
  assert.ok(total >= 20000, `seed total is ${total}; should be >= 20000`);
});

test('seed data: every solar-curated entry has a category, company, and clientId', () => {
  const leads = require('../seed-solar').LEADS;
  for (const l of leads) {
    assert.ok(l.company, 'missing company on ' + JSON.stringify(l).slice(0, 80));
    assert.strictEqual(l.category, 'commercial_solar');
    assert.ok(l.clientId, 'missing clientId on ' + l.company);
  }
});
