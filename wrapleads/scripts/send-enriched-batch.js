#!/usr/bin/env node
/**
 * Send cold emails to the 16 Apollo-enriched decision-makers.
 *
 * Pulls verified contacts from sales-assets/sprint-kit/enriched-prospects.json
 * (real names + verified emails, found via Apollo people_match).
 * Sends from barry@helioscout.app via Resend (verified domain).
 * Reply-To set to bjakebenson@gmail.com so replies land in Barry's inbox.
 *
 *   node scripts/send-enriched-batch.js --dry-run
 *   node scripts/send-enriched-batch.js --send
 */

'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry-run');
const SEND = process.argv.includes('--send');
if (!DRY && !SEND) { console.error('Pass --dry-run or --send'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const PROSPECTS = path.join(ROOT, 'sales-assets', 'sprint-kit', 'enriched-prospects.json');
const STRIPE_LINKS = path.join(ROOT, 'sales-assets', 'sprint-kit', 'stripe-live-links.json');
const SEND_LOG = path.join(ROOT, 'sales-assets', 'sprint-kit', 'send-log-enriched.json');

// State pack inventory — used as state_count personalization variable
const STATE_INVENTORY = {
  TX: 3009, CA: 1594, OH: 992, PA: 866, IL: 644,
  FL: 583, GA: 550, NY: 527, AZ: 475, NJ: 450, MN: 0, NH: 0,
};

function firstName(name) { return (name || '').split(' ')[0]; }

function renderEmail({ name, company, state, paymentLink }) {
  const stateCount = STATE_INVENTORY[state] || 0;
  const fName = firstName(name);
  const subject = stateCount > 0
    ? `34 days until ITC deadline — ${stateCount.toLocaleString()} verified ${state} solar leads`
    : `34 days until ITC deadline — verified commercial solar leads, exclusive territory`;

  let body;
  if (stateCount > 0) {
    body = `Hi ${fName},

Saw you at ${company} — quick note before the ITC deadline.

The 30% ITC construction-start deadline is July 4. That's 34 days. Property owners who haven't started construction by then risk losing the full credit.

We pulled ${stateCount.toLocaleString()} EPA-verified commercial properties in ${state} from EPA's GHG Reporter, USAspending.gov, and OpenStreetMap. Each row comes with:

- NAICS-based solar fit score (0-100)
- System size + 25-year NPV + payback after ITC + ${state} state incentives
- Persona-specific scripts (CFO / Facilities / Sustainability)
- Provenance URL linking to the original government source record

Exclusive — 1 buyer per ${state}. State pack is $1,497 one-time.

Want 50 free samples to vet the data? Reply "YES ${state}" and I'll send the CSV within the hour. Or grab the full ${state} pack directly: ${paymentLink}

— Barry Benson
helioscout.app`;
  } else {
    body = `Hi ${fName},

Saw you at ${company} — quick note before the ITC deadline.

The 30% ITC construction-start deadline is July 4 (34 days). Every commercial property owner not started by then risks losing the full federal credit.

We have 20,206 EPA-verified commercial properties across the US — NAICS-scored, system-sized, payback-modeled. Want a free 50-lead sample for your region?

Reply with your target state and I'll send the CSV within the hour.

— Barry Benson
helioscout.app`;
  }
  return { subject, body };
}

async function sendViaResend({ to, subject, body }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Barry Benson <barry@helioscout.app>',
      reply_to: process.env.GMAIL_USER || 'bjakebenson@gmail.com',
      to: [to],
      subject,
      text: body,
    }),
  });
  const data = await r.json();
  return { ok: r.ok, status: r.status, data: r.ok ? { id: data.id } : data };
}

(async () => {
  const prospects = JSON.parse(fs.readFileSync(PROSPECTS, 'utf-8'));
  const links = JSON.parse(fs.readFileSync(STRIPE_LINKS, 'utf-8'));
  const statePackLink = links.find(l => l.pack_key === 'state').payment_link;

  console.log(`Loaded ${prospects.length} enriched prospects\n`);

  if (DRY) {
    const p = prospects[0];
    const e = renderEmail({ name: p.name, company: p.company, state: p.state, paymentLink: statePackLink });
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`SAMPLE → ${p.name} (${p.email})`);
    console.log(`Subject: ${e.subject}\n`);
    console.log(e.body);
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('Full recipient list:');
    prospects.forEach((p, i) =>
      console.log(`  ${String(i+1).padStart(2)}. ${p.state.padEnd(3)} ${firstName(p.name).padEnd(12)} ${p.title.padEnd(28)} @ ${p.company.padEnd(30)} → ${p.email}`)
    );
    console.log('\nDRY RUN — re-run with --send to fire.');
    return;
  }

  const log = [];
  for (const [i, p] of prospects.entries()) {
    const e = renderEmail({ name: p.name, company: p.company, state: p.state, paymentLink: statePackLink });
    process.stdout.write(`[${i+1}/${prospects.length}] ${p.state} ${firstName(p.name).padEnd(12)} → ${p.email.padEnd(38)} `);
    try {
      const res = await sendViaResend({ to: p.email, subject: e.subject, body: e.body });
      if (res.ok) {
        console.log(`✓ ${res.data.id}`);
        log.push({ ts: new Date().toISOString(), name: p.name, company: p.company, state: p.state, to: p.email, message_id: res.data.id, ok: true });
      } else {
        console.log(`✗ ${res.status} ${JSON.stringify(res.data).slice(0, 100)}`);
        log.push({ ts: new Date().toISOString(), name: p.name, company: p.company, state: p.state, to: p.email, error: res.data, ok: false });
      }
    } catch (err) {
      console.log(`✗ ${err.message}`);
      log.push({ ts: new Date().toISOString(), name: p.name, company: p.company, state: p.state, to: p.email, error: err.message, ok: false });
    }
    // Stay under 2 req/sec Resend free tier
    await new Promise(res => setTimeout(res, 600));
  }

  fs.writeFileSync(SEND_LOG, JSON.stringify(log, null, 2));
  const success = log.filter(x => x.ok).length;
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`SENT: ${success}/${log.length}   FAILED: ${log.length - success}`);
  console.log(`Log: ${path.relative(process.cwd(), SEND_LOG)}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
})();
