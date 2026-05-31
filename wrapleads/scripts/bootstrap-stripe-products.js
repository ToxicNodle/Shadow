#!/usr/bin/env node
/**
 * Bootstrap HelioScout's 3 Stripe products + 3 payment links in live mode.
 *
 * Idempotent: re-running won't create duplicates — it looks up existing
 * products by name first, and skips creating a new payment link if one
 * already exists for the price.
 *
 * Outputs the 3 live payment URLs as JSON so the email-send script can pick them up.
 *
 *   node scripts/bootstrap-stripe-products.js
 */

'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = [
  {
    name: 'HelioScout — Single Metro Pack',
    description: 'A single US metro of EPA-verified commercial solar leads. Up to 500 leads with NAICS fit scores, system sizing, 25-year NPV, ITC + state incentive stack, multi-persona sales scripts, and source-record provenance URLs.',
    price_usd: 497,
    pack_key: 'metro',
  },
  {
    name: 'HelioScout — State Pack',
    description: 'Every EPA-verified commercial solar lead in one US state (500-3,000 leads depending on state). NAICS fit scores, system sizing, 25-year NPV, ITC + state stack, multi-persona scripts (CFO/Facilities/Sustainability), provenance URLs. Exclusive — 1 buyer per state.',
    price_usd: 1497,
    pack_key: 'state',
  },
  {
    name: 'HelioScout — National Pack',
    description: 'All 20,206 EPA + USAspending + OSM commercial solar leads across the US. Full enrichment stack with multi-persona scripts and provenance URLs. 30-day refund. Quarterly refresh included for 12 months.',
    price_usd: 4997,
    pack_key: 'national',
  },
];

async function findOrCreateProduct(p) {
  const existing = await stripe.products.list({ limit: 100 });
  let prod = existing.data.find(x => x.name === p.name);
  if (prod) {
    console.log(`  ✓ found existing product: ${p.name} (${prod.id})`);
  } else {
    prod = await stripe.products.create({
      name: p.name,
      description: p.description,
      metadata: { pack_key: p.pack_key },
    });
    console.log(`  + created product: ${p.name} (${prod.id})`);
  }

  const prices = await stripe.prices.list({ product: prod.id, limit: 10 });
  let price = prices.data.find(x => x.unit_amount === p.price_usd * 100 && x.currency === 'usd' && !x.recurring);
  if (price) {
    console.log(`  ✓ found existing price: $${p.price_usd} (${price.id})`);
  } else {
    price = await stripe.prices.create({
      product: prod.id,
      unit_amount: p.price_usd * 100,
      currency: 'usd',
    });
    console.log(`  + created price: $${p.price_usd} (${price.id})`);
  }

  const links = await stripe.paymentLinks.list({ limit: 100 });
  let link = links.data.find(l => l.line_items?.data?.[0]?.price?.id === price.id);
  if (!link) {
    link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { pack_key: p.pack_key },
      custom_fields: [
        {
          key: 'state',
          label: { type: 'custom', custom: p.pack_key === 'national' ? 'Confirm: all 50 states' : 'Which US state do you want? (e.g. TX, CA)' },
          type: 'text',
          optional: p.pack_key === 'national',
        },
      ],
      after_completion: {
        type: 'redirect',
        redirect: { url: 'https://helioscout.io/buy-solar-leads?paid=1' },
      },
    });
    console.log(`  + created payment link: ${link.url}`);
  } else {
    console.log(`  ✓ found existing payment link: ${link.url}`);
  }

  return { product_id: prod.id, price_id: price.id, payment_link: link.url, pack_key: p.pack_key, price_usd: p.price_usd };
}

(async () => {
  console.log('🌞 HelioScout — bootstrapping Stripe products + payment links (LIVE mode)\n');
  const results = [];
  for (const p of PRODUCTS) {
    console.log(`→ ${p.name}`);
    const r = await findOrCreateProduct(p);
    results.push(r);
    console.log('');
  }

  const outPath = path.join(__dirname, '..', 'sales-assets', 'sprint-kit', 'stripe-live-links.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}\n`);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('LIVE PAYMENT LINKS — paste these into emails / sales page:');
  console.log('═══════════════════════════════════════════════════════════════');
  for (const r of results) {
    console.log(`  ${r.pack_key.padEnd(10)} $${String(r.price_usd).padEnd(6)} ${r.payment_link}`);
  }
  console.log('');
})();
