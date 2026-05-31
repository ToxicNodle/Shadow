#!/usr/bin/env node
/**
 * SAM.gov Federal Contractor Entity Ingest
 *
 * Pulls active registered entities from SAM.gov's public Entity Management API
 * and upserts them into the companies table. Targets NAICS codes for industries
 * with vehicle fleets: trucking, specialty contractors, equipment rental, and
 * professional services. Government contractors are financially stable and often
 * have branded fleets — high-value wrap shop prospects.
 *
 * Usage:
 *   SAM_API_KEY=your_key node lib/ingest-sam.js [--naics 484] [--limit 500]
 *   npm run ingest:sam
 *
 * Free SAM.gov API key: https://open.gsa.gov/api/entity-api/
 * Rate limit: 10 req/s on the public key tier.
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SAM_API_BASE = 'https://api.sam.gov/entity-information/v3/entities';

// NAICS codes with high wrap opportunity density
const TARGET_NAICS = [
  '484',   // Truck Transportation
  '4841',  // General Freight Trucking
  '4842',  // Specialized Freight Trucking
  '2381',  // Foundation, Structure, Building Exterior Work (construction)
  '2382',  // Building Equipment Contractors
  '2389',  // Other Specialty Trade Contractors
  '5324',  // Machinery and Equipment Rental
  '5321',  // Automotive Equipment Rental
  '5411',  // Legal Services (law firms with branded vehicles)
  '5612',  // Facilities Support Services
  '7211',  // Full-Service Restaurants (delivery/catering fleets)
  '4841',  // General Freight Trucking
  '5613',  // Employment Placement Agencies (shuttle fleets)
  '4911',  // Electric Power Generation (utility trucks)
];

const naicsFilter = (process.argv.find((a) => a.startsWith('--naics')) || '')
  .replace('--naics', '').trim() || null;

const limitArg = parseInt((process.argv.find((a) => a.startsWith('--limit')) || '--limit=2000')
  .replace('--limit=', '').replace('--limit', ''), 10) || 2000;

async function fetchPage(apiKey, naics, offset) {
  const params = new URLSearchParams({
    api_key: apiKey,
    entityEFTIndicator: '',
    registrationStatus: 'A', // Active only
    purposeOfRegistrationCode: 'Z2',
    primaryNaics: naics,
    offset: String(offset),
    limit: '100',
  });

  const url = `${SAM_API_BASE}?${params}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });

  if (r.status === 429) {
    await new Promise((res) => setTimeout(res, 5000));
    return fetchPage(apiKey, naics, offset); // retry
  }

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`SAM.gov API error ${r.status}: ${text.slice(0, 200)}`);
  }

  return r.json();
}

function extractEntity(entity) {
  const reg = entity.coreData?.entityRegistration || {};
  const addr = entity.coreData?.physicalAddress || {};
  const gen = entity.coreData?.generalInformation || {};
  const fsi = entity.coreData?.financialInformation || {};

  const name = reg.legalBusinessName || reg.dbaName || null;
  if (!name) return null;

  const uei = reg.ueiSAM || null; // Unique Entity Identifier — stable primary key
  const state = addr.stateOrProvinceCode || null;
  const city = addr.city || null;
  const zip = addr.zipCode || null;
  const naics = gen.primaryNaics || null;
  const employees = gen.numberOfEmployees ? parseInt(gen.numberOfEmployees, 10) : null;

  // Estimate fleet size from employee count (rough heuristic)
  let fleetSize = null;
  if (employees) {
    if (employees >= 500) fleetSize = '100+';
    else if (employees >= 100) fleetSize = '25-100';
    else if (employees >= 20) fleetSize = '10-25';
    else fleetSize = '1-10';
  }

  // Build website guess from entity name (SAM.gov rarely provides URLs)
  const website = null; // Will be populated by enrichment if needed

  return { name, uei, state, city, zip, naics, employees, fleetSize, website };
}

async function ingestNaics(apiKey, naicsPrefix, totalLimit) {
  let offset = 0;
  let upserted = 0;
  let skipped = 0;

  console.log(`  Fetching NAICS ${naicsPrefix}...`);

  while (upserted + skipped < totalLimit) {
    let data;
    try {
      data = await fetchPage(apiKey, naicsPrefix, offset);
    } catch (e) {
      console.error(`  Error at offset ${offset}:`, e.message);
      break;
    }

    const entities = data?.entityData || [];
    if (!entities.length) break;

    const total = data?.totalRecords ?? '?';
    process.stdout.write(`\r  NAICS ${naicsPrefix}: ${offset + entities.length}/${total} fetched, ${upserted} upserted...`);

    for (const ent of entities) {
      const e = extractEntity(ent);
      if (!e || !e.uei) { skipped++; continue; }

      try {
        await pool.query(
          `INSERT INTO companies
             (source, source_id, name, city, state, zip, industry, fleet_size, website, added_to_registry)
           VALUES ('sam_gov', $1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (source, source_id) DO UPDATE SET
             name = EXCLUDED.name,
             city = EXCLUDED.city,
             state = EXCLUDED.state,
             industry = EXCLUDED.industry,
             fleet_size = COALESCE(EXCLUDED.fleet_size, companies.fleet_size)`,
          [e.uei, e.name, e.city, e.state, e.zip, e.naics || naicsPrefix, e.fleetSize, e.website]
        );
        upserted++;
      } catch (dbErr) {
        skipped++;
      }
    }

    offset += entities.length;

    if (entities.length < 100) break; // last page
    if (upserted + skipped >= totalLimit) break;

    // Polite rate-limiting: 8 req/s stays well under 10 req/s limit
    await new Promise((res) => setTimeout(res, 125));
  }

  process.stdout.write('\n');
  return { upserted, skipped };
}

async function main() {
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) {
    console.error('Error: SAM_API_KEY not set. Get a free key at https://open.gsa.gov/api/entity-api/');
    process.exit(1);
  }

  const naicsToFetch = naicsFilter
    ? [naicsFilter]
    : [...new Set(TARGET_NAICS)]; // deduplicate

  const perNaicsLimit = Math.ceil(limitArg / naicsToFetch.length);

  console.log(`SAM.gov Entity Ingest`);
  console.log(`NAICS targets: ${naicsToFetch.join(', ')}`);
  console.log(`Total limit: ${limitArg} (${perNaicsLimit}/NAICS)`);
  console.log('');

  let totalUpserted = 0;
  let totalSkipped = 0;

  for (const naics of naicsToFetch) {
    const { upserted, skipped } = await ingestNaics(apiKey, naics, perNaicsLimit);
    totalUpserted += upserted;
    totalSkipped += skipped;
  }

  console.log(`\nDone. ${totalUpserted.toLocaleString()} upserted, ${totalSkipped.toLocaleString()} skipped.`);
  console.log('Run the WrapOS server to see new leads in Discover.');
  await pool.end();
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  pool.end();
  process.exit(1);
});
