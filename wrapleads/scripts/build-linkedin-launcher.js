#!/usr/bin/env node
/**
 * Build a LinkedIn outreach launcher — one card per installer with:
 *   - LinkedIn company search URL (one click to find the company page)
 *   - Personalized DM template that mentions their state's lead count
 *   - Copy-to-clipboard button for the message
 *
 *   node scripts/build-linkedin-launcher.js
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
const OUT_HTML = path.join(ROOT, 'dist-public', 'linkedin-launcher.html');

const STATE_INVENTORY = {
  TX: 3009, CA: 1594, OH: 992, PA: 866, IL: 644,
  FL: 583, GA: 550, NY: 527, AZ: 475, NJ: 450,
};

function buildDM({ company, state, stateCount }) {
  if (stateCount) {
    return `Hi — saw ${company} on the SEIA member directory. Quick question:

We just pulled ${stateCount.toLocaleString()} EPA-verified commercial solar leads in ${state} (every one NAICS-fit-scored with system size + 25-yr NPV + a sales script). Selling exclusively — one buyer per territory.

July 4 ITC deadline is 34 days out. If you're still ramping ${state} commercial, want to see the 50-lead sample?

— Barry @ HelioScout`;
  }
  return `Hi — saw ${company} on the SEIA member directory. Quick question:

We pulled 20,206 EPA-verified commercial solar leads across the US (NAICS-fit-scored with system size + 25-yr NPV + sales script per row). Exclusive — one buyer per territory.

July 4 ITC deadline is 34 days out. Want to see 50 free samples in your state?

— Barry @ HelioScout`;
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const links = JSON.parse(fs.readFileSync(STRIPE_LINKS, 'utf-8'));
const statePackLink = links.find(l => l.pack_key === 'state').payment_link;

const rows = parse(fs.readFileSync(PROSPECTS_CSV, 'utf-8'), { columns: true, skip_empty_lines: true, trim: true });

// Sort: states with packs first, then everything else
const STATE_PRIORITY = ['TX', 'CA', 'NY', 'NJ', 'AZ', 'OH', 'PA', 'IL', 'FL', 'GA'];
const sorted = [...rows].sort((a, b) => {
  const ai = STATE_PRIORITY.indexOf(a.state);
  const bi = STATE_PRIORITY.indexOf(b.state);
  if (ai === -1 && bi === -1) return a.state.localeCompare(b.state);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
});

const cards = sorted.map((r, i) => {
  const stateCount = STATE_INVENTORY[r.state];
  const dm = buildDM({ company: r.company, state: r.state, stateCount });
  const lookupUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(r.company)}`;
  return `
    <li class="row" data-idx="${i+1}">
      <div class="num">${i+1}</div>
      <div class="meta">
        <div class="company">${esc(r.company)} <span class="state">${r.state}</span>${stateCount ? `<span class="count">${stateCount.toLocaleString()} leads</span>` : ''}</div>
        <div class="domain">${esc(r.domain || '')}</div>
        <details>
          <summary style="cursor:pointer;font-size:12px;color:#94a3b8;margin-top:6px;">Show DM template</summary>
          <textarea readonly id="dm-${i+1}" style="width:100%;height:140px;margin-top:8px;padding:10px;background:#0a0b0d;color:#f4f5f7;border:1px solid #2a2e36;border-radius:6px;font-family:inherit;font-size:12px;line-height:1.5;">${esc(dm)}</textarea>
          <button class="copy-btn" data-target="dm-${i+1}" data-idx="${i+1}">📋 Copy DM</button>
        </details>
      </div>
      <a class="btn" href="${lookupUrl}" target="_blank" rel="noopener" onclick="markVisited(this, ${i+1})">🔍 Find on LinkedIn</a>
      <div class="status" id="status-${i+1}">—</div>
    </li>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>HelioScout — LinkedIn Outreach Launcher</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; margin: 0; background: #0a0b0d; color: #f4f5f7; line-height: 1.55; }
  .page { max-width: 1000px; margin: 0 auto; padding: 32px 20px 80px; }
  h1 { font-size: 32px; font-weight: 800; margin: 0 0 8px; }
  .lede { color: #cbd5e1; margin: 0 0 24px; font-size: 14px; }
  .progress { padding: 14px 18px; background: rgba(245,158,11,0.08); border: 1px solid #f59e0b; border-radius: 10px; margin-bottom: 24px; font-size: 14px; font-weight: 600; }
  .progress strong { color: #f59e0b; font-size: 18px; }
  ul { list-style: none; padding: 0; margin: 0; }
  .row { display: grid; grid-template-columns: 36px 1fr 180px 80px; gap: 14px; align-items: start; padding: 14px 16px; background: #14161a; border: 1px solid #2a2e36; border-radius: 10px; margin-bottom: 8px; }
  .row.visited { background: rgba(34,197,94,0.06); border-color: rgba(34,197,94,0.3); }
  .num { font-weight: 800; font-size: 16px; color: #94a3b8; text-align: center; padding-top: 4px; }
  .meta .company { font-weight: 700; font-size: 14px; }
  .meta .state { display: inline-block; padding: 2px 8px; background: rgba(245,158,11,0.15); color: #f59e0b; font-size: 10px; font-weight: 800; border-radius: 4px; letter-spacing: 0.05em; margin-left: 6px; }
  .meta .count { display: inline-block; padding: 2px 8px; background: rgba(34,197,94,0.1); color: #22c55e; font-size: 10px; font-weight: 700; border-radius: 4px; margin-left: 4px; }
  .meta .domain { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .btn { display: inline-block; padding: 9px 14px; background: #0a66c2; color: white; border: none; border-radius: 6px; font-weight: 700; font-size: 13px; text-decoration: none; text-align: center; cursor: pointer; }
  .btn:hover { background: #0958a8; }
  .row.visited .btn { background: #22c55e; }
  .copy-btn { display: block; margin-top: 8px; padding: 6px 12px; background: #f59e0b; color: #000; border: none; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer; }
  .copy-btn.copied { background: #22c55e; color: white; }
  .status { font-size: 11px; font-weight: 700; color: #94a3b8; text-align: center; padding-top: 4px; }
  .row.visited .status { color: #22c55e; }
  textarea { resize: vertical; }
</style>
</head>
<body>
<div class="page">
  <h1>HelioScout — LinkedIn Outreach Launcher</h1>
  <p class="lede">
    50 installer prospects sorted by state inventory (TX/CA/NY etc. first). For each:
    <strong>1)</strong> Click "Find on LinkedIn" → company page opens →
    <strong>2)</strong> Click "People" tab → find Founder/CEO/VP Sales →
    <strong>3)</strong> Click "Show DM template" → copy → paste into LinkedIn connect-with-note.
    Progress saved in localStorage.
  </p>

  <div class="progress">
    Progress: <strong id="visited-count">0</strong> / ${sorted.length} visited
  </div>

  <ul>${cards}</ul>
</div>

<script>
  const visited = new Set(JSON.parse(localStorage.getItem('hs-li-visited') || '[]'));
  function updateCount() {
    document.getElementById('visited-count').textContent = visited.size;
    visited.forEach(i => {
      const row = document.querySelector(\`[data-idx="\${i}"]\`);
      const st = document.getElementById('status-' + i);
      if (row) row.classList.add('visited');
      if (st) st.textContent = '✓ visited';
    });
  }
  function markVisited(btn, i) {
    setTimeout(() => {
      visited.add(i);
      localStorage.setItem('hs-li-visited', JSON.stringify([...visited]));
      updateCount();
    }, 800);
  }
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const t = document.getElementById(btn.getAttribute('data-target'));
      try {
        await navigator.clipboard.writeText(t.value);
        btn.textContent = '✓ Copied';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '📋 Copy DM'; btn.classList.remove('copied'); }, 2000);
      } catch (e) {
        t.select(); document.execCommand('copy');
        btn.textContent = '✓ Copied (fallback)';
      }
    });
  });
  updateCount();
</script>
</body>
</html>`;

fs.mkdirSync(path.dirname(OUT_HTML), { recursive: true });
fs.writeFileSync(OUT_HTML, html);
console.log(`Wrote ${path.relative(process.cwd(), OUT_HTML)} (${sorted.length} prospects)`);
