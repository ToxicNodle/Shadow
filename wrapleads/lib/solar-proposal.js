/**
 * Customer-facing commercial solar proposal generator.
 *
 * Turns a qualified lead into a public, tokenized HTML page the broker
 * can share with installers or property owners. Renders inline (no PDF
 * library required) — recipients use browser "Save as PDF" to get a
 * polished document. This avoids puppeteer/chromium baggage in the
 * deployment.
 *
 * The page combines:
 *   - Property summary + satellite preview
 *   - Solar economics (system kW, kWh/yr, $ savings)
 *   - Full ITC + state stack + SREC + municipal rebate table
 *   - Net payback chart
 *   - NAICS-aware sales narrative (load profile, ESG positioning)
 *   - Tariff-driven urgency line
 *   - DSIRE program list with expiration dates
 *
 * Stored against the `proposals` table (existing) with a generated `token`
 * so it can be shared via a short URL.
 */

'use strict';

const crypto = require('crypto');
const solarMath = require('./solar-math');
const incentives = require('./solar-incentives');
const naicsFit = require('./naics-solar-fit');
const tariffs = require('./solar-tariffs');
const dsire = require('./dsire-api');
const monteCarlo = require('./solar-monte-carlo');
const pdfRenderer = require('./pdf-renderer');

// ── HTML helpers ─────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtMoney = (n) => `$${Math.round(n || 0).toLocaleString()}`;
const fmtKwh = (n) => `${Math.round(n || 0).toLocaleString()} kWh`;
const fmtKw = (n) => `${Math.round(n || 0).toLocaleString()} kW`;

async function generateProposalHtml({ pool, userId, leadId, opts = {} }) {
  // Pull lead + company snapshot
  const lR = await pool.query(`
    SELECT l.*, c.building_sqft, c.roof_type, c.utility_provider,
           c.latitude, c.longitude, c.est_annual_kwh, c.naics_code,
           c.industry, c.raw_data AS company_raw, c.is_owner_occupied,
           c.intent_signal
    FROM leads l
    LEFT JOIN companies c ON c.id = l.source_company_id
    WHERE l.id = $1 AND l.user_id = $2
  `, [leadId, String(userId)]);
  if (!lR.rows.length) throw new Error('Lead not found');
  const lead = lR.rows[0];

  // Pull user settings for sender info
  const uR = await pool.query(`SELECT settings_json, email AS owner_email, name AS owner_name FROM users WHERE id = $1`, [String(userId)]);
  const settings = uR.rows[0]?.settings_json || {};
  const ownerName = settings.senderName || uR.rows[0]?.owner_name || 'HelioScout';
  const companyName = settings.companyName || ownerName;
  const senderEmail = settings.senderEmail || uR.rows[0]?.owner_email || '';
  const senderPhone = settings.senderPhone || '';

  // Run full intelligence stack
  const naics = naicsFit.profileFor({ naics_code: lead.naics_code, industry: lead.industry || '' });
  const tariff = tariffs.lookup(lead.utility_provider);
  const utilityRate = lead.company_raw?.nrel_rate?.commercial_rate || tariff.retail_rate_commercial || solarMath.DEFAULT_RATE;
  const econ = solarMath.fullEstimate({
    buildingSqft: lead.building_sqft, roofType: lead.roof_type,
    latitude: lead.latitude, utilityRate, estAnnualKwh: lead.est_annual_kwh,
  });
  const dsirePrograms = lead.state ? await dsire.programsForLead({
    state: lead.state, taxAppetite: naics?.tax_appetite,
  }) : { financial: [], regulatory: [] };
  const dsireUrgency = dsire.urgencyFromDsire(dsirePrograms);
  const intel = incentives.buildPropertyIntel({
    state: lead.state, city: lead.city, zip: lead.zip,
    systemKw: econ.system_kw, annualKwh: econ.annual_kwh, grossCost: econ.gross_cost_usd,
    tariff, bonuses: {}, dsireUrgency,
  });
  const netPayback = incentives.netPaybackYears(intel.stack.net_cost, econ.annual_savings_usd);

  const satellite = lead.latitude && lead.longitude
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${lead.latitude},${lead.longitude}&zoom=19&size=600x300&maptype=satellite&key=${process.env.GOOGLE_PLACES_API_KEY || ''}`
    : null;
  const mapLink = lead.latitude && lead.longitude
    ? `https://www.google.com/maps/@${lead.latitude},${lead.longitude},19z/data=!3m1!1e3` : null;

  // Monte Carlo financial simulation — replaces the single-point payback
  // estimate with a probability distribution over 25-year outcomes.
  const sim = monteCarlo.simulate({
    systemKw:        econ.system_kw,
    year1AnnualKwh:  econ.annual_kwh,
    year1RatePerKwh: econ.rate_per_kwh,
    netInstallCost:  intel.stack.net_cost,
    runs:            opts?.simulationRuns || 5000,
  });

  const html = renderHtml({
    lead, naics, tariff, econ, intel, netPayback, dsirePrograms,
    satellite, mapLink, ownerName, companyName, senderEmail, senderPhone,
    sim,
  });

  return { html, sim, summary: {
    company: lead.company, system_kw: econ.system_kw, net_payback: netPayback,
    net_cost: intel.stack.net_cost, annual_savings: econ.annual_savings_usd,
    npv_p50: sim?.npv?.p50 ?? null,
    pays_back_prob: sim?.payback_years?.probability_pays_back ?? null,
  }};
}

function renderHtml({ lead, naics, tariff, econ, intel, netPayback, dsirePrograms, satellite, mapLink, ownerName, companyName, senderEmail, senderPhone, sim }) {
  const lineItems = intel.stack.line_items.map(li => `
    <tr>
      <td>${esc(li.label)}${li.notes ? `<div class="note">${esc(li.notes)}</div>` : ''}</td>
      <td class="num">${fmtMoney(li.amount)}</td>
    </tr>`).join('');

  const programRows = (dsirePrograms.financial || []).slice(0, 8).map(p => `
    <tr>
      <td>${esc(p.name)}<div class="note">${esc(p.administrator || '')}</div></td>
      <td>${esc(p.category || '')}</td>
      <td>${p.end_date ? esc(p.end_date) : '<span class="open">Ongoing</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="3" class="empty">No state-specific DSIRE programs match this property.</td></tr>';

  const subsidyPct = intel.stack.effective_subsidy_pct;
  const grossCost = econ.gross_cost_usd;
  const netCost = intel.stack.net_cost;
  const grossPct = 100;
  const netPct = grossCost > 0 ? Math.round((netCost / grossCost) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HelioScout Proposal — ${esc(lead.company)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f8fafc; color: #0f172a; line-height: 1.55; }
  .page { max-width: 880px; margin: 32px auto; background: #fff; border-radius: 16px; box-shadow: 0 4px 32px rgba(0,0,0,0.06); overflow: hidden; }
  .hero { padding: 48px 56px 32px; background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%); color: white; }
  .hero .brand { font-size: 13px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.92; margin-bottom: 18px; }
  .hero .brand-tag { font-weight: 500; opacity: 0.7; margin-left: 8px; letter-spacing: 0.04em; }
  .hero h1 { font-size: 32px; margin: 0 0 4px; font-weight: 800; letter-spacing: -0.02em; }
  .hero .sub { font-size: 16px; opacity: 0.92; margin-bottom: 24px; }
  .hero-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 16px; }
  .hero-stat { background: rgba(255,255,255,0.15); border-radius: 10px; padding: 12px 14px; }
  .hero-stat .v { font-size: 22px; font-weight: 800; }
  .hero-stat .l { font-size: 11px; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
  section { padding: 28px 56px; border-bottom: 1px solid #f1f5f9; }
  section h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 0 0 16px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; margin-bottom: 4px; }
  .value { font-size: 18px; font-weight: 700; }
  .value.lg { font-size: 24px; }
  .value.accent { color: #f59e0b; }
  .value.good { color: #10b981; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f1f5f9; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 700; }
  td.num { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .note { font-size: 11px; color: #94a3b8; margin-top: 2px; }
  .total-row td { font-weight: 800; font-size: 15px; background: #fef3c7; }
  .empty { text-align: center; color: #94a3b8; padding: 20px; font-style: italic; }
  .open { color: #10b981; font-weight: 700; }
  .bar { height: 28px; border-radius: 6px; background: #f1f5f9; position: relative; overflow: hidden; margin: 8px 0; }
  .bar .fill { height: 100%; background: linear-gradient(90deg, #f59e0b, #ef4444); }
  .bar .lbl { position: absolute; top: 0; left: 12px; line-height: 28px; font-size: 12px; font-weight: 700; color: white; mix-blend-mode: difference; }
  .bar.net .fill { background: linear-gradient(90deg, #10b981, #059669); }
  .pitch { font-size: 14px; padding: 14px 18px; border-left: 3px solid #f59e0b; background: #fffbeb; border-radius: 0 8px 8px 0; margin: 12px 0; }
  .pitch.script { border-left-color: #10b981; background: #ecfdf5; }
  .satellite { width: 100%; height: 280px; object-fit: cover; border-radius: 10px; margin-bottom: 12px; }
  .footer { padding: 28px 56px; background: #f8fafc; font-size: 12px; color: #64748b; }
  .footer a { color: #f59e0b; text-decoration: none; }
  .urgency { padding: 12px 18px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
  .badge { display: inline-block; padding: 3px 9px; border-radius: 4px; font-size: 11px; font-weight: 700; }
  .badge.green { background: #d1fae5; color: #065f46; }
  .badge.blue { background: #dbeafe; color: #1e40af; }
  .badge.amber { background: #fef3c7; color: #92400e; }
  @media print {
    body { background: white; }
    .page { box-shadow: none; margin: 0; max-width: none; border-radius: 0; }
    section { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="hero">
    <div class="brand">HelioScout<span class="brand-tag">commercial solar intelligence</span></div>
    <h1>Commercial Solar Proposal</h1>
    <div class="sub">${esc(lead.company)}${lead.city ? ` &middot; ${esc(lead.city)}, ${esc(lead.state || '')}` : ''}</div>
    <div class="hero-grid">
      <div class="hero-stat"><div class="v">${fmtKw(econ.system_kw)}</div><div class="l">System size</div></div>
      <div class="hero-stat"><div class="v">${fmtKwh(econ.annual_kwh)}</div><div class="l">Annual production</div></div>
      <div class="hero-stat"><div class="v">${fmtMoney(econ.annual_savings_usd)}</div><div class="l">Annual savings</div></div>
      <div class="hero-stat"><div class="v">${netPayback ? netPayback + ' yr' : '—'}</div><div class="l">Net payback</div></div>
    </div>
  </div>

  ${intel.urgency ? `<section><div class="urgency">⏰ ${esc(intel.urgency)}</div></section>` : ''}

  <section>
    <h2>The Property</h2>
    ${satellite ? `<img class="satellite" src="${satellite}" alt="Aerial view of ${esc(lead.company)}">` : ''}
    <div class="row">
      <div><div class="label">Address</div><div class="value">${esc(lead.street || '')}<br>${esc(lead.city || '')}${lead.state ? ', ' + esc(lead.state) : ''} ${esc(lead.zip || '')}</div></div>
      <div>
        <div class="label">Building &amp; Roof</div>
        <div class="value">${lead.building_sqft ? lead.building_sqft.toLocaleString() + ' sqft' : 'Size TBD'} &middot; ${esc(lead.roof_type || 'unknown')} roof</div>
        ${mapLink ? `<a href="${mapLink}" target="_blank" rel="noopener" style="font-size:12px;color:#f59e0b;text-decoration:none;">Open satellite view ↗</a>` : ''}
      </div>
      <div><div class="label">Utility</div><div class="value">${esc(tariff.name || lead.utility_provider || 'TBD')}</div><div class="note">${esc(tariff.nem_version || '')}</div></div>
      <div><div class="label">Commercial Rate</div><div class="value">$${(tariff.retail_rate_commercial || 0.13).toFixed(3)}/kWh</div></div>
    </div>
    ${naics ? `
      <div style="margin-top:18px;">
        <span class="badge amber">NAICS ${esc(naics.code)}</span>
        <span class="badge blue">${esc(naics.energy_intensity)} energy use</span>
        <span class="badge green">${esc(naics.load_profile_details?.label || naics.load_profile)}</span>
        ${naics.tax_appetite === 'tax_exempt' ? '<span class="badge amber">Tax-exempt — PPA recommended</span>' : ''}
      </div>
      <div class="pitch">💡 ${esc(naics.pitchHook)}</div>
    ` : ''}
  </section>

  <section>
    <h2>System Economics</h2>
    <div class="row">
      <div>
        <div class="label">Gross install cost</div>
        <div class="value lg">${fmtMoney(grossCost)}</div>
        <div class="bar"><div class="fill" style="width: ${grossPct}%"></div><div class="lbl">100%</div></div>
      </div>
      <div>
        <div class="label">Net cost after incentive stack</div>
        <div class="value lg good">${fmtMoney(netCost)}</div>
        <div class="bar net"><div class="fill" style="width: ${netPct}%"></div><div class="lbl">${netPct}% (${subsidyPct}% subsidy)</div></div>
      </div>
      <div><div class="label">Estimated 25-yr lifetime savings</div><div class="value">${fmtMoney(econ.annual_savings_usd * 25 - netCost)}</div></div>
      <div><div class="label">Carbon offset / year</div><div class="value">${(econ.annual_kwh * 0.0004).toFixed(1)} tCO₂e</div></div>
    </div>
  </section>

  <section>
    <h2>Incentive Stack</h2>
    <table>
      <thead><tr><th>Program / Mechanism</th><th class="num">Value</th></tr></thead>
      <tbody>
        ${lineItems}
        <tr class="total-row">
          <td>Total stack</td>
          <td class="num">${fmtMoney(intel.stack.total_incentives)}</td>
        </tr>
      </tbody>
    </table>
  </section>

  ${sim ? `<section>
    <h2>Monte Carlo Financial Simulation</h2>
    <p style="font-size:13px;color:#475569;margin:0 0 16px;">${sim.runs.toLocaleString()} simulations modeling annual production variance (σ=6%), utility rate inflation (μ=3.2%, σ=1.4%), panel degradation (0.5%/yr ±0.1%), inverter replacement (~year ${sim.inputs.systemKw ? '12–15' : '12-15'}), and O&amp;M cost growth. Discount rate ${(sim.inputs.discountRate * 100).toFixed(1)}%.</p>
    <div class="row">
      <div>
        <div class="label">P10 NPV (worst-case)</div>
        <div class="value lg" style="color:#ef4444;">${fmtMoney(sim.npv.p10)}</div>
      </div>
      <div>
        <div class="label">P50 NPV (median)</div>
        <div class="value lg good">${fmtMoney(sim.npv.p50)}</div>
      </div>
      <div>
        <div class="label">P90 NPV (best-case)</div>
        <div class="value lg" style="color:#3b82f6;">${fmtMoney(sim.npv.p90)}</div>
      </div>
      <div>
        <div class="label">Probability project pays back</div>
        <div class="value lg">${Math.round(sim.payback_years.probability_pays_back * 100)}%</div>
      </div>
    </div>
    <div style="margin-top:18px;">${monteCarlo.npvHistogramSvg(sim, { width: 720, height: 200 })}</div>
    ${sim.lcoe_per_kwh ? `<div style="margin-top:16px;padding:12px 16px;background:#f0fdf4;border-radius:8px;font-size:13px;">
      <strong>Levelized cost of energy (LCOE):</strong> $${sim.lcoe_per_kwh.p50.toFixed(3)}/kWh (P50) &middot;
      $${sim.lcoe_per_kwh.p10.toFixed(3)}–$${sim.lcoe_per_kwh.p90.toFixed(3)}/kWh (P10–P90 range) &middot;
      vs. current utility rate $${(tariff.retail_rate_commercial || 0.13).toFixed(3)}/kWh.
    </div>` : ''}
    <div class="note" style="margin-top:8px;">Distribution methodology: identical to the modeling SAM (DOE/NREL System Advisor Model) and Energy Toolbase apply to underwrite tax-equity solar deals.</div>
  </section>` : ''}

  <section>
    <h2>Live DSIRE Programs (${esc(lead.state || 'state')})</h2>
    <table>
      <thead><tr><th>Program</th><th>Type</th><th>Expires</th></tr></thead>
      <tbody>${programRows}</tbody>
    </table>
    <div class="note" style="margin-top:8px;">Data: Database of State Incentives for Renewables &amp; Efficiency (dsireusa.org), updated daily.</div>
  </section>

  ${naics?.sales_script ? `<section><h2>Recommended Conversation Opener</h2><div class="pitch script">🎯 ${esc(naics.sales_script)}</div></section>` : ''}

  <div class="footer">
    Prepared by <strong>${esc(ownerName)}</strong>${companyName !== ownerName ? ', ' + esc(companyName) : ''}.<br>
    ${senderEmail ? `Reach out: <a href="mailto:${esc(senderEmail)}">${esc(senderEmail)}</a>` : ''}${senderPhone ? ` &middot; ${esc(senderPhone)}` : ''}<br>
    <span style="font-size:11px;opacity:0.75;">Estimates use PVWatts/NREL methodology + DSIRE policy data. Numbers should be confirmed by a licensed installer before contract.</span>
  </div>
</div>
</body>
</html>`;
}

/**
 * Persist a proposal record and return its public token URL.
 * Reuses the existing `proposals` table (token, lead_id, user_id, title, status).
 */
async function createProposal({ pool, userId, leadId, baseUrl }) {
  const { html, summary, sim } = await generateProposalHtml({ pool, userId, leadId });
  const token = crypto.randomBytes(20).toString('hex');
  const title = `Commercial Solar Proposal — ${summary.company}`;
  await pool.query(`
    INSERT INTO proposals (user_id, lead_id, token, title, intro, pricing_html, status, services)
    VALUES ($1, $2, $3, $4, $5, $6, 'sent', 'commercial_solar')
  `, [String(userId), leadId, token, title, summary.company, html]);
  const base = baseUrl.replace(/\/$/, '');
  return {
    token,
    url: `${base}/solar/proposal/${token}`,
    pdf_url: `${base}/solar/proposal/${token}.pdf`,
    summary,
    simulation: sim ? { npv: sim.npv, payback_years: sim.payback_years } : null,
  };
}

async function getProposalHtmlByToken(pool, token) {
  const r = await pool.query(`SELECT pricing_html, lead_id FROM proposals WHERE token = $1 AND services = 'commercial_solar'`, [token]);
  if (!r.rows.length) return null;
  // Bump view counter for visibility analytics.
  await pool.query(`UPDATE proposals SET view_count = COALESCE(view_count, 0) + 1, last_viewed_at = NOW() WHERE token = $1`, [token]).catch(() => {});
  return r.rows[0].pricing_html;
}

// Render the proposal as a print-quality PDF. Reuses the stored HTML so the
// PDF and the live web page show the exact same content + branding.
async function getProposalPdfByToken(pool, token) {
  const html = await getProposalHtmlByToken(pool, token);
  if (!html) return null;
  return pdfRenderer.renderPdf(html, {
    format: 'Letter',
    headerTemplate: pdfRenderer.DEFAULT_HEADER,
    footerTemplate: pdfRenderer.DEFAULT_FOOTER,
    margin: { top: '0.6in', right: '0.4in', bottom: '0.65in', left: '0.4in' },
  });
}

module.exports = { generateProposalHtml, createProposal, getProposalHtmlByToken, getProposalPdfByToken };
