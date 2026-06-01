#!/usr/bin/env node
/**
 * Generate dist-public/send-batch-day3.html — the Day-3 follow-up launcher.
 *
 * Same 25 recipients as the Day-0 batch, but rendered with the Email B
 * "data drop" template — references the sample CSV inline, doesn't ask
 * for a reply.
 *
 *   node scripts/build-send-launcher-day3.js
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
const OUT_HTML = path.join(ROOT, 'dist-public', 'send-batch-day3.html');

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

function renderDay3({ company, state, state_count, payment_link }) {
  const subject = `re: ${state} commercial solar leads`;
  const body = `${company} team —

Following up on the ${state} commercial solar leads. To save you the reply, here's what's in every row:

• Company + city + NAICS code + sector label
• Solar fit score (0-100, NAICS-weighted across 93 industry profiles)
• Estimated system kW + year-1 kWh + savings at ${state} commercial rate
• Net payback after ITC + state stack
• 25-year NPV (median)
• 3 persona-specific sales scripts (CFO / Facilities / Sustainability)
• Provenance URL linking back to the original EPA / USAspending / OSM record

If even 1 of the 50 free samples closes for you, the math on a $1,497 ${state} pack works. ITC deadline is now in 31 days — every day you wait, your prospects have less time to start construction.

Grab the ${state} pack here: ${payment_link}

Or reply "YES ${state}" and I'll send the free 50-lead sample within the hour.

— Barry Benson
helioscout`;
  return { subject, body };
}

function gmailComposeUrl({ to, subject, body }) {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const links = JSON.parse(fs.readFileSync(STRIPE_LINKS, 'utf-8'));
const statePackLink = links.find(l => l.pack_key === 'state').payment_link;
const rows = parse(fs.readFileSync(PROSPECTS_CSV, 'utf-8'), { columns: true, skip_empty_lines: true, trim: true });
const recipients = pickRecipients(rows);

const buttons = recipients.map((r, i) => {
  const e = renderDay3({ company: r.company, state: r.state, state_count: STATE_INVENTORY[r.state], payment_link: statePackLink });
  const url = gmailComposeUrl({ to: r.email_sales, subject: e.subject, body: e.body });
  return `<li class="row" data-idx="${i+1}"><div class="num">${i+1}</div><div class="meta"><div class="company">${esc(r.company)} <span class="state">${r.state}</span></div><div class="email">${esc(r.email_sales)}</div></div><a class="btn" href="${url}" target="_blank" rel="noopener" onclick="markSent(this,${i+1})">📧 Send Day-3 follow-up</a><div class="status" id="status-${i+1}">—</div></li>`;
}).join('');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>HelioScout — Day-3 Follow-up Launcher</title><style>*{box-sizing:border-box}body{font-family:-apple-system,'Inter',sans-serif;margin:0;background:#0a0b0d;color:#f4f5f7;line-height:1.55}.page{max-width:960px;margin:0 auto;padding:32px 20px 80px}h1{font-size:32px;font-weight:800;margin:0 0 8px}.lede{color:#cbd5e1;margin:0 0 24px;font-size:15px}.progress{padding:14px 18px;background:rgba(245,158,11,0.08);border:1px solid #f59e0b;border-radius:10px;margin-bottom:24px;font-size:14px;font-weight:600}.progress strong{color:#f59e0b;font-size:18px}ul{list-style:none;padding:0;margin:0}.row{display:grid;grid-template-columns:36px 1fr 220px 80px;gap:14px;align-items:center;padding:14px 16px;background:#14161a;border:1px solid #2a2e36;border-radius:10px;margin-bottom:8px}.row.sent{background:rgba(34,197,94,0.06);border-color:rgba(34,197,94,0.3)}.num{font-weight:800;font-size:16px;color:#94a3b8;text-align:center}.meta .company{font-weight:700}.meta .state{display:inline-block;padding:2px 8px;background:rgba(245,158,11,0.15);color:#f59e0b;font-size:10px;font-weight:800;border-radius:4px;letter-spacing:0.05em;margin-left:6px}.meta .email{font-size:12px;color:#94a3b8;margin-top:2px}.btn{display:inline-block;padding:9px 14px;background:#f59e0b;color:#000;border:none;border-radius:6px;font-weight:700;font-size:13px;text-decoration:none;text-align:center;cursor:pointer}.btn:hover{background:#fbbf24}.row.sent .btn{background:#22c55e;color:white}.status{font-size:11px;font-weight:700;color:#94a3b8;text-align:center}.row.sent .status{color:#22c55e}</style></head><body><div class="page"><h1>Day-3 Follow-up Launcher 📬</h1><p class="lede">Day-3 bump for the 25 prospects from your initial cold batch. Send these only to recipients who DIDN'T already reply (check your inbox first — skip rows where someone responded).</p><div class="progress">Progress: <strong id="sent-count">0</strong> / 25 sent · <span style="color:#94a3b8;font-weight:500;">Skip anyone who already replied!</span></div><ul>${buttons}</ul></div><script>const sent=new Set(JSON.parse(localStorage.getItem('hs-sent-day3')||'[]'));function updateCount(){document.getElementById('sent-count').textContent=sent.size;sent.forEach(i=>{const row=document.querySelector(\`[data-idx="\${i}"]\`);const st=document.getElementById('status-'+i);if(row)row.classList.add('sent');if(st)st.textContent='✓ sent';});}function markSent(b,i){setTimeout(()=>{sent.add(i);localStorage.setItem('hs-sent-day3',JSON.stringify([...sent]));updateCount();},800);}updateCount();</script></body></html>`;

fs.mkdirSync(path.dirname(OUT_HTML), { recursive: true });
fs.writeFileSync(OUT_HTML, html);
console.log(`Wrote ${path.relative(process.cwd(), OUT_HTML)} (${recipients.length} recipients)`);
