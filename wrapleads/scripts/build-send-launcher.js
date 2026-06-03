#!/usr/bin/env node
/**
 * Generate dist-public/send-batch.html — a one-page launcher with 25
 * clickable "Send via Gmail" buttons. Each button opens Gmail compose
 * (https://mail.google.com/mail/?view=cm&...) with subject + body +
 * recipient pre-filled. User clicks Send.
 *
 * Why HTML mailto launcher instead of SMTP:
 *   The sandbox blocks outbound SMTP (port 465/587). Resend free tier
 *   only sends to the account owner without a verified domain. This
 *   path uses the user's real Gmail compose, which has best-in-class
 *   deliverability and requires zero setup.
 *
 *   node scripts/build-send-launcher.js
 */

'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const ROOT = path.join(__dirname, '..');
const SPRINT = path.join(ROOT, 'sales-assets', 'sprint-kit');
const PROSPECTS_CSV = path.join(SPRINT, 'installer-prospects.csv');
const STRIPE_LINKS = path.join(SPRINT, 'stripe-live-links.json');
const OUT_HTML = path.join(ROOT, 'dist-public', 'send-batch.html');

const STATE_INVENTORY = {
  TX: 3009, CA: 1594, OH: 992, PA: 866, IL: 644,
  FL: 583, GA: 550, NY: 527, AZ: 475, NJ: 450,
};
const STATE_PRIORITY = ['TX', 'CA', 'NY', 'NJ', 'AZ'];

function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || ''); }

function pickRecipients(rows) {
  const out = [];
  for (const st of STATE_PRIORITY) {
    const inState = rows.filter(r => r.state === st && STATE_INVENTORY[r.state] && isValidEmail(r.email_sales));
    out.push(...inState);
  }
  return out.slice(0, 25);
}

function renderEmail({ company, state, state_count, payment_link }) {
  const subject = `34 days until ITC deadline — ${state_count.toLocaleString()} verified ${state} solar leads`;
  const body = `Hi ${company} team,

The 30% ITC construction-start deadline is July 4. That's 34 days. Every property owner who hasn't started by then risks losing the full credit.

We have ${state_count.toLocaleString()} commercial properties in ${state} — pulled from EPA's GHG Reporter, USAspending.gov, and OpenStreetMap. Each one comes with:

- NAICS-based solar fit score (0-100)
- System size + 25-year NPV + payback after ITC + state incentives
- 3 persona-specific sales scripts (CFO / Facilities / Sustainability)
- Provenance URL linking to the original government source record

I'll send you 50 free — no card, no demo. If they work, full state pack is $1,497 one-time. Exclusive: 1 buyer per territory.

Reply "YES ${state}" and I'll send the sample within the hour. Or grab the ${state} pack directly: ${payment_link}

— Barry Benson
helioscout`;
  return { subject, body };
}

function gmailComposeUrl({ to, subject, body }) {
  const params = new URLSearchParams({
    view: 'cm', fs: '1',
    to, su: subject, body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const links = JSON.parse(fs.readFileSync(STRIPE_LINKS, 'utf-8'));
const statePackLink = links.find(l => l.pack_key === 'state').payment_link;

const rows = parse(fs.readFileSync(PROSPECTS_CSV, 'utf-8'), { columns: true, skip_empty_lines: true, trim: true });
const recipients = pickRecipients(rows);

const buttons = recipients.map((r, i) => {
  const e = renderEmail({ company: r.company, state: r.state, state_count: STATE_INVENTORY[r.state], payment_link: statePackLink });
  const url = gmailComposeUrl({ to: r.email_sales, subject: e.subject, body: e.body });
  return `
    <li class="row" data-idx="${i+1}">
      <div class="num">${i+1}</div>
      <div class="meta">
        <div class="company">${esc(r.company)} <span class="state">${r.state}</span></div>
        <div class="email">${esc(r.email_sales)}</div>
      </div>
      <a class="btn" href="${url}" target="_blank" rel="noopener" onclick="markSent(this, ${i+1})">📧 Send via Gmail</a>
      <div class="status" id="status-${i+1}">—</div>
    </li>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>HelioScout — Cold Email Send Launcher</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; margin: 0; background: #0a0b0d; color: #f4f5f7; line-height: 1.55; }
  .page { max-width: 960px; margin: 0 auto; padding: 32px 20px 80px; }
  h1 { font-size: 32px; font-weight: 800; margin: 0 0 8px; }
  .lede { color: #cbd5e1; margin: 0 0 24px; font-size: 15px; }
  .progress { padding: 14px 18px; background: rgba(245,158,11,0.08); border: 1px solid #f59e0b; border-radius: 10px; margin-bottom: 24px; font-size: 14px; font-weight: 600; }
  .progress strong { color: #f59e0b; font-size: 18px; }
  ul { list-style: none; padding: 0; margin: 0; }
  .row { display: grid; grid-template-columns: 36px 1fr 180px 80px; gap: 14px; align-items: center; padding: 14px 16px; background: #14161a; border: 1px solid #2a2e36; border-radius: 10px; margin-bottom: 8px; }
  .row.sent { background: rgba(34,197,94,0.06); border-color: rgba(34,197,94,0.3); }
  .num { font-weight: 800; font-size: 16px; color: #94a3b8; text-align: center; }
  .meta .company { font-weight: 700; }
  .meta .state { display: inline-block; padding: 2px 8px; background: rgba(245,158,11,0.15); color: #f59e0b; font-size: 10px; font-weight: 800; border-radius: 4px; letter-spacing: 0.05em; margin-left: 6px; }
  .meta .email { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .btn { display: inline-block; padding: 9px 14px; background: #f59e0b; color: #000; border: none; border-radius: 6px; font-weight: 700; font-size: 13px; text-decoration: none; text-align: center; cursor: pointer; }
  .btn:hover { background: #fbbf24; }
  .row.sent .btn { background: #22c55e; color: white; }
  .status { font-size: 11px; font-weight: 700; color: #94a3b8; text-align: center; }
  .row.sent .status { color: #22c55e; }
  .note { font-size: 12px; color: #5e6470; margin-top: 24px; text-align: center; }
  .note a { color: #f59e0b; }
</style>
</head>
<body>
<div class="page">
  <h1>HelioScout — Cold Email Launcher 🚀</h1>
  <p class="lede">25 personalized cold emails ready. Click each "Send via Gmail" button to open Gmail compose with everything pre-filled, then click Send. Gmail handles deliverability + replies land in your inbox naturally.</p>

  <div class="progress">
    Progress: <strong id="sent-count">0</strong> / 25 sent
    <span style="margin-left:24px;color:#94a3b8;font-weight:500;">Tip: open this page in the same browser you use for Gmail, and middle-click to open in background tabs.</span>
  </div>

  <ul>${buttons}</ul>

  <div class="note">
    Progress is saved in localStorage — close the tab and come back, it'll remember which you've sent.<br>
    To reset: open browser dev tools → console → run <code style="color:#f59e0b;">localStorage.removeItem('hs-sent')</code>
  </div>
</div>

<script>
  const sent = new Set(JSON.parse(localStorage.getItem('hs-sent') || '[]'));
  function updateCount() {
    document.getElementById('sent-count').textContent = sent.size;
    sent.forEach(i => {
      const row = document.querySelector(\`[data-idx="\${i}"]\`);
      const st = document.getElementById('status-' + i);
      if (row) row.classList.add('sent');
      if (st) st.textContent = '✓ sent';
    });
  }
  function markSent(btn, i) {
    // Give Gmail a moment to open before marking
    setTimeout(() => {
      sent.add(i);
      localStorage.setItem('hs-sent', JSON.stringify([...sent]));
      updateCount();
    }, 800);
  }
  updateCount();
</script>
</body>
</html>`;

fs.mkdirSync(path.dirname(OUT_HTML), { recursive: true });
fs.writeFileSync(OUT_HTML, html);
console.log(`Wrote ${path.relative(process.cwd(), OUT_HTML)} (${recipients.length} recipients)`);
