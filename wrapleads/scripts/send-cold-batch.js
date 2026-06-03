#!/usr/bin/env node
/**
 * Send the first batch of 25 cold emails via Resend.
 *
 * - Reads sales-assets/sprint-kit/installer-prospects.csv
 * - Filters to states with a packaged territory (TX/CA/NY/NJ/AZ)
 * - Caps at 25, ordered by inventory size (TX first, then CA, NY, NJ, AZ)
 * - Renders Email A template with state, state_count, payment link
 * - Sends via Resend (onboarding@resend.dev — no domain verification needed)
 * - Logs each send to sales-assets/sprint-kit/send-log.json
 * - Updates installer-prospects.csv `last_emailed` column
 *
 *   node scripts/send-cold-batch.js --dry-run   # render + list, no send
 *   node scripts/send-cold-batch.js --send      # actually fire
 */

'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const DRY = process.argv.includes('--dry-run');
const SEND = process.argv.includes('--send');
if (!DRY && !SEND) {
  console.error('Pass --dry-run or --send'); process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const SPRINT = path.join(ROOT, 'sales-assets', 'sprint-kit');
const PROSPECTS_CSV = path.join(SPRINT, 'installer-prospects.csv');
const STRIPE_LINKS = path.join(SPRINT, 'stripe-live-links.json');
const SEND_LOG = path.join(SPRINT, 'send-log.json');

const STATE_INVENTORY = {
  TX: 3009, CA: 1594, OH: 992, PA: 866, IL: 644,
  FL: 583, GA: 550, NY: 527, AZ: 475, NJ: 450,
};
// Order recipients are chosen: states with the biggest pack first
// (best urgency story → "TX has 3,009 leads" lands harder than "AZ has 475").
const STATE_PRIORITY = ['TX', 'CA', 'NY', 'NJ', 'AZ'];

function parseCsv(text) {
  return parse(text, { columns: true, skip_empty_lines: true, trim: true });
}

function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function pickRecipients(rows) {
  const out = [];
  for (const st of STATE_PRIORITY) {
    const inState = rows.filter(r => r.state === st && STATE_INVENTORY[r.state] && isValidEmail(r.email_sales));
    out.push(...inState);
  }
  return out.slice(0, 25);
}

function renderEmail({ company, state, state_count, payment_link }) {
  const subject = `${34} days until ITC deadline — ${state_count.toLocaleString()} verified ${state} solar leads`;
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
helioscout.app`;
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
  const links = JSON.parse(fs.readFileSync(STRIPE_LINKS, 'utf-8'));
  const statePackLink = links.find(l => l.pack_key === 'state').payment_link;

  const rows = parseCsv(fs.readFileSync(PROSPECTS_CSV, 'utf-8'));
  const recipients = pickRecipients(rows);
  console.log(`Selected ${recipients.length} recipients across ${STATE_PRIORITY.join('/')}\n`);

  // Show one rendered example
  if (recipients[0]) {
    const r = recipients[0];
    const e = renderEmail({
      company: r.company, state: r.state,
      state_count: STATE_INVENTORY[r.state],
      payment_link: statePackLink,
    });
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`SAMPLE: To: ${r.email_sales}`);
    console.log(`Subject: ${e.subject}\n`);
    console.log(e.body);
    console.log('═══════════════════════════════════════════════════════════════\n');
  }

  console.log('Full recipient list:');
  for (const [i, r] of recipients.entries()) {
    console.log(`  ${String(i+1).padStart(2)}. ${r.state}  ${r.company.padEnd(36)}  → ${r.email_sales}`);
  }
  console.log('');

  if (DRY) {
    console.log('DRY RUN — no emails sent. Re-run with --send to fire.');
    return;
  }

  // SEND
  const log = [];
  for (const [i, r] of recipients.entries()) {
    const e = renderEmail({
      company: r.company, state: r.state,
      state_count: STATE_INVENTORY[r.state],
      payment_link: statePackLink,
    });
    process.stdout.write(`[${i+1}/${recipients.length}] ${r.company.padEnd(36)} → ${r.email_sales.padEnd(40)} `);
    try {
      const res = await sendViaResend({ to: r.email_sales, subject: e.subject, body: e.body });
      if (res.ok) {
        console.log(`✓ ${res.data.id}`);
        log.push({ ts: new Date().toISOString(), company: r.company, state: r.state, to: r.email_sales, message_id: res.data.id, ok: true });
      } else {
        console.log(`✗ ${res.status} ${JSON.stringify(res.data).slice(0, 120)}`);
        log.push({ ts: new Date().toISOString(), company: r.company, state: r.state, to: r.email_sales, error: res.data, ok: false });
      }
    } catch (err) {
      console.log(`✗ ${err.message}`);
      log.push({ ts: new Date().toISOString(), company: r.company, state: r.state, to: r.email_sales, error: err.message, ok: false });
    }
    // Resend free tier: 2 requests/sec. Stay under by sleeping 600ms.
    await new Promise(res => setTimeout(res, 600));
  }

  fs.writeFileSync(SEND_LOG, JSON.stringify(log, null, 2));
  const success = log.filter(x => x.ok).length;
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`SENT: ${success}/${log.length}   FAILED: ${log.length - success}`);
  console.log(`Log: ${path.relative(process.cwd(), SEND_LOG)}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
})();
