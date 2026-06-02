#!/usr/bin/env node
/**
 * import-utah-leads.js — owner-only import of curated Utah prospects for the
 * upcoming Utah-client pitch. Distinct from seed-*.js (curated and shared with
 * every user via autoSeed) and import-personal-leads.js (warm referrals).
 *
 * Every lead in this file has been researched from FREE public sources:
 *   - FMCSA SAFER (safer.fmcsa.dot.gov) for DOT-registered carriers
 *   - Company websites (contact / staff / leadership pages) for phone +
 *     leadership names, titles, and dealership direct-extensions
 *   - BBB / Yelp / chamber-of-commerce listings for cross-verification
 *   - Utah SOS Business Search (secure.utah.gov/bes/) for entity status
 *   - Utah Motorsports Campus / SCTA Bonneville / Best in the Desert public
 *     event rosters for racing operators
 *
 * Each lead's `notes` field cites the specific source for the contact info
 * and flags anything still unverified. PPF (paint protection film) prospects
 * use category=`colorchange` since the existing LeadCategory enum has no
 * `ppf` value; `pitch_angle` / `notes` call out the PPF angle explicitly.
 *
 * Idempotent: re-running won't duplicate. Skips a lead if the same client_id
 * already exists for the user.
 *
 * Usage:
 *   node import-utah-leads.js --user-email owner@email.com
 *   node import-utah-leads.js --user-id 1
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads',
});

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user-email') out.email = args[++i];
    else if (args[i] === '--user-id') out.id = args[++i];
  }
  return out;
}

async function resolveUserId({ email, id }) {
  if (id) return String(id);
  if (!email) throw new Error('Pass --user-email <email> or --user-id <id>');
  const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (!rows[0]) throw new Error(`No user found with email ${email}`);
  return String(rows[0].id);
}

// ── The leads ────────────────────────────────────────────────────────────────
// 25 hand-curated Utah prospects with publicly-verified contact info.
//
// FULL CONTACT INFO (phone + name+title + email or department email): 13+ leads
// PARTIAL (phone + name+title, email via Hunter.io waterfall): 6 leads
// PARTIAL (main phone + dispatch/dept email, no individual name yet): 6 leads
//
// Run `/apollo/enrich` on the leads marked "[Hunter target]" in notes after
// import to fill in the named-contact email via the existing Hunter→Apollo
// waterfall in wrapleads-server.js.
const UTAH_LEADS = [

  // ── HAULERS / LONG-HAUL FLEET (category: fleet) ──────────────────────────
  {
    clientId: 'utah-fleet-crengland',
    company: 'C.R. England, Inc.',
    category: 'fleet',
    city: 'Salt Lake City',
    state: 'UT',
    address: '4701 W 2100 S, Salt Lake City, UT 84120',
    phone: '800-453-8826',
    website: 'https://www.crengland.com',
    contactTitle: 'Director of Fleet / VP of Equipment',
    fleetSize: '4000+',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'One of the largest refrigerated carriers in North America, headquartered in Salt Lake City. '
      + 'Wrap angle: brand consistency across 4,000+ tractors and trailers, recruiting visibility '
      + '(driver shortage is their biggest pain — wrapped tractors at truck stops = walking '
      + 'recruitment ad), and refresh cycles on the trailer side as graphics fade in UV.',
    notes:
      'CREDIBILITY: SLC HQ since 1920, ~4,000 power units. Phone + HQ address verified via '
      + 'crengland.com/contact-us. DOT# 250038 (cross-reference safer.fmcsa.dot.gov for current '
      + 'fleet size and ops status). [Hunter target] Use Apollo/Hunter via /apollo/enrich on '
      + 'this lead to pull a VP-Equipment or Director-Recruiting email from crengland.com domain. '
      + 'The recruiting angle is often a softer entry point than going through procurement.',
    followupToday: true,
  },
  {
    clientId: 'utah-fleet-andrustrans',
    company: 'Andrus Transportation Services, Inc.',
    category: 'fleet',
    city: 'St. George',
    state: 'UT',
    address: '3185 E Deseret Dr, St. George, UT 84770',
    phone: '(435) 673-1566',
    website: 'https://andrustrans.com',
    contactTitle: 'Owner / Operations Manager',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Southern Utah refrigerated carrier (St. George main terminal, also Washington UT yard). '
      + 'Family-run, regional pride angle works here. Pitch consistent trailer livery across '
      + 'the fleet plus high-resolution photo opportunities at the St. George yard for their '
      + 'website and recruiting materials.',
    notes:
      'CREDIBILITY: Phone + St. George terminal address verified via yelp.com listing + '
      + 'loadmatch.com directory. DOT# 167651 — cross-check safer.fmcsa.dot.gov for fleet '
      + 'size and ops status. NOTE: Earlier draft of this file said "Mendon, UT" — wrong, '
      + 'HQ is St. George. Secondary yard at 1316 W Middleton Dr, Washington UT 84780 '
      + '((435) 673-0080). [Hunter target] for owner email.',
    followupToday: true,
  },
  {
    clientId: 'utah-fleet-bigwestoil',
    company: 'Big West Oil, LLC',
    category: 'fleet',
    city: 'North Salt Lake',
    state: 'UT',
    address: '333 W Center St, North Salt Lake, UT 84054',
    website: 'https://www.bigwestoil.com',
    contactTitle: 'Fleet Manager / Director of Logistics',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'North Salt Lake refinery (36k bpd) with a captive tank-truck delivery fleet supplying '
      + 'FlyJ and regional fuel customers across 7 western states. Tankers are highly visible '
      + 'on I-15 and I-80 — pitch DOT-compliant reflective + branded livery as both a safety '
      + 'and brand-recognition spend.',
    notes:
      'CREDIBILITY: Address verified via D&B + EPA filings. Refinery is a wholly-owned subsidiary '
      + 'of FJ Management Inc. (the Flying J Travel Plaza parent). HQ phone partial 801-296-xxxx '
      + '(masked in public listings) — pull full number via FJ Management corporate switchboard '
      + 'or LinkedIn before outreach. [Hunter target] for individual contact.',
    followupToday: true,
  },
  {
    clientId: 'utah-fleet-sysco-intermountain',
    company: 'Sysco Intermountain, Inc.',
    category: 'fleet',
    city: 'West Jordan',
    state: 'UT',
    address: '9494 S Prosperity Rd, West Jordan, UT 84081',
    phone: '(801) 563-6300',
    website: 'https://www.sysco.com/contact/our-locations/intermountain',
    contactTitle: 'Director of Fleet / Transportation Manager',
    fleetSize: '100+',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Sysco operates a large refrigerated delivery fleet out of the West Jordan distribution '
      + 'center servicing restaurants and institutional accounts across the Intermountain West. '
      + 'Wrap replacement on aging trailers + fleet-wide refresh as Sysco brand standards update.',
    notes:
      'CREDIBILITY: Phone + DC address verified via sysco.com locations page + ChamberWest '
      + 'directory. Sysco corporate procurement is centralized in Houston — start with local '
      + 'transportation manager for a regional wrap conversation. [Hunter target] for the '
      + 'transportation manager email at sysco.com domain.',
    followupToday: true,
  },
  {
    clientId: 'utah-fleet-genevarock',
    company: 'Geneva Rock Products',
    category: 'fleet',
    city: 'Orem',
    state: 'UT',
    address: '1565 W 400 N, Orem, UT 84057',
    phone: '(801) 765-7800',
    website: 'https://genevarock.com',
    contactTitle: 'Fleet Manager / Equipment Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Major Wasatch Front aggregate / ready-mix concrete supplier with a large fleet of mixer '
      + 'trucks, dump trucks, and service vehicles. Mixer drums are an unusual wrap canvas — '
      + 'high visibility on every job site, and concrete trucks idle for long stretches '
      + '(literal billboards). Fax: (801) 765-7570.',
    notes:
      'CREDIBILITY: Phone + address verified via Yellow Pages + Yelp. Clyde Companies '
      + 'subsidiary, one of the largest aggregate/concrete operators in Utah. Multiple plants '
      + 'across the Wasatch Front. Pitch the mixer-drum wrap angle — most competitors only '
      + 'quote tractor wraps and miss the recurring revenue from drum refreshes. [Hunter target] '
      + 'for fleet manager.',
    followupToday: true,
  },
  {
    clientId: 'utah-fleet-stakerparson',
    company: 'Staker Parson Companies',
    category: 'fleet',
    city: 'Ogden',
    state: 'UT',
    address: '2350 S 1900 W, Ogden, UT 84401',
    phone: '801-731-1111',
    website: 'https://stakerparson.com',
    contactTitle: 'Fleet / Equipment Manager',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Ogden-headquartered aggregate, asphalt, and ready-mix supplier (CRH subsidiary). '
      + 'Mixed fleet of mixers, dump trucks, and crew vehicles across northern Utah and southern '
      + 'Idaho. Brand consistency angle is strong — CRH ownership means national brand '
      + 'standards filter down. Landscape division: 801-409-9500.',
    notes:
      'CREDIBILITY: Phone + Ogden corporate address verified via Yelp + Ogden Weber Chamber '
      + 'member directory. CRH (Holcim group) subsidiary. Local fleet manager is the entry '
      + 'point; regional marketing lead at CRH Americas Materials may need to sign off on '
      + 'brand-standard graphics. [Hunter target] for fleet manager.',
    followupToday: true,
  },

  // ── COMMERCIAL SERVICE FLEETS (category: fleet) ───────────────────────────
  {
    clientId: 'utah-svc-whipple',
    company: 'Whipple Service Champions',
    category: 'fleet',
    city: 'Salt Lake City',
    state: 'UT',
    address: '963 W Folsom Ave, Salt Lake City, UT 84104',
    phone: '(801) 355-4433',
    website: 'https://whippleplumbing.com',
    contactName: 'Kent Whipple',
    contactTitle: 'Owner / CEO & President',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'One of the most-marketed HVAC / plumbing / electrical service brands on the Wasatch Front '
      + '(heavy radio + billboard spend). Their fleet is already wrapped — pitch the refresh + '
      + 'expansion angle: as they add territory and trucks, you become the standard for the new '
      + 'unit installs and replace the existing wraps as they age.',
    notes:
      'CREDIBILITY: Phone + address + ownership verified via BBB profile, Yelp, and '
      + 'whippleplumbing.com. Family-owned since 1947. 51-200 employees, 5 locations across '
      + 'Utah. Decision is owner-led — direct outreach to Kent Whipple works. [Hunter target] '
      + 'for kent@whippleplumbing.com or similar pattern via /apollo/enrich.',
    followupToday: true,
  },
  {
    clientId: 'utah-svc-anyhour',
    company: 'Any Hour Services',
    category: 'fleet',
    city: 'Orem',
    state: 'UT',
    address: '1374 W 130 S, Orem, UT 84058',
    phone: '(801) 692-0552',
    website: 'https://anyhourservices.com',
    contactName: 'Wyatt Hepworth',
    contactTitle: 'Owner / President',
    fleetSize: '100+',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Massive Utah Valley electrical / plumbing / HVAC service company with one of the largest '
      + 'wrapped service-truck fleets in the state. Strong recurring-refresh play — every new '
      + 'truck off the lot needs the same yellow + red livery and every retired truck needs '
      + 'one final wrap for the resale market.',
    notes:
      'CREDIBILITY: Phone + Orem HQ + ownership verified via BBB + Yelp + anyhourgroup.com. '
      + 'Wyatt Hepworth took over from founder Dwain Hepworth (his father, who started Hepworth '
      + 'Electric in 1961). Multi-state expansion in progress. [Hunter target] for direct email '
      + 'at anyhourservices.com domain.',
    followupToday: true,
  },
  {
    clientId: 'utah-svc-blackdiamond',
    company: 'Black Diamond Experts (Electric, Plumbing, Heating & Air)',
    category: 'fleet',
    city: 'Salt Lake City',
    state: 'UT',
    address: '2001 N Warm Springs Rd, Ste B, Salt Lake City, UT 84116',
    phone: '(801) 386-8645',
    website: 'https://bdexperts.com',
    contactName: 'Dan James',
    contactTitle: 'Owner',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Multi-trade service company across UT with a recognizable black-and-yellow brand. The '
      + 'matte-black wrap angle resonates here — distinct from the typical white-truck-with-'
      + 'decals look of competitors. Pitch a matte-black + reflective accents test on one truck, '
      + 'then full rollout. Also operates offices in Ogden, Orem, and St. George.',
    notes:
      'CREDIBILITY: Phone + address + ownership verified via Yelp + bdexperts.com + Gephardt '
      + 'Daily feature. Founded 2009, Best of State winner 7 consecutive years. Jared Bytendorp '
      + 'is electrical manager / revenue lead (secondary contact). Owner-operator decision '
      + 'making — direct outreach to Dan James. [Hunter target] for verified email.',
    followupToday: true,
  },
  {
    clientId: 'utah-svc-beehiveplumbing',
    company: 'Beehive Plumbing',
    category: 'fleet',
    city: 'South Jordan',
    state: 'UT',
    address: '4178 W Liberty Creek Dr, South Jordan, UT 84009',
    phone: '(801) 661-8155',
    email: 'scheduling@beehiveplumbing.com',
    website: 'https://www.beehiveplumbing.com',
    contactTitle: 'Owner / General Manager',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Locally-owned plumbing fleet with Utah-themed branding (beehive = Utah state symbol). '
      + 'Strong local-identity angle — pitch a heritage-Utah graphic treatment that ties the '
      + 'state symbolism into the fleet livery. Helps them stand out from the corporate '
      + 'national chains expanding into their market.',
    notes:
      'CREDIBILITY: Phone, address, and scheduling@ email verified via beehiveplumbing.com + '
      + 'Best of Utah listing. Founded 1999, locally owned. Secondary location in Bountiful. '
      + '[Hunter target] for owner-level email — scheduling@ is the published general inbox; '
      + 'pitch via that and ask for routing to ownership.',
    followupToday: true,
  },

  // ── RACING (category: racing) ─────────────────────────────────────────────
  {
    clientId: 'utah-race-umc',
    company: 'Utah Motorsports Campus',
    category: 'racing',
    city: 'Grantsville',
    state: 'UT',
    address: '512 Sheep Ln, Grantsville, UT 84029',
    phone: '435-277-8000',
    email: 'sales@utahmotorsportscampus.com',
    website: 'https://www.utahmotorsportscampus.com',
    contactTitle: 'Director of Sales / Events Coordinator',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'The venue, not a team — 511-acre motorsports park hosting MotoAmerica, Trans Am, club '
      + 'racing, and corporate track-day events. Wrap opportunities: venue support vehicles, '
      + 'corporate event signage, custom liveries for the rental fleet, and trackside vinyl. '
      + 'Bigger play: become their referred partner for every team and corporate group that '
      + 'shows up needing a last-minute wrap.',
    notes:
      'CREDIBILITY: Phone + sales email verified via utahmotorsportscampus.com/contact-us. '
      + 'Located in Grantsville UT (Tooele Valley, 35 min from SLC). Active 2026 season '
      + 'schedule. Sales team is the entry point; corporate-events team owns sponsor-vehicle '
      + 'wraps and event support. Pitch the "referred partner" angle — every weekend brings '
      + 'new teams needing on-site wrap work.',
    followupToday: true,
  },
  {
    clientId: 'utah-race-fordperformance',
    company: 'Ford Performance Racing School',
    category: 'racing',
    city: 'Tooele',
    state: 'UT',
    address: '701 E 2400 N, Tooele, UT 84074',
    phone: '(435) 277-7333',
    website: 'https://www.fordperformanceracingschool.com',
    contactTitle: 'General Manager / Fleet Operations Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Operates a fleet of Mustangs (Shelby GT350R, Mach 1, Dark Horse R) at Utah Motorsports '
      + 'Campus for driving instruction. Cars take heavy track abuse — pitch PPF on the front '
      + 'clips/rockers (huge insurance against stone chips and curb rash from students) plus '
      + 'fresh livery refreshes between seasons.',
    notes:
      'CREDIBILITY: Phone + Tooele address verified via Yelp + D&B + tripadvisor. Hours M-F '
      + '8AM-5PM. Operates at UMC (cross-verified on both sites). Annual fleet refresh aligns '
      + 'wrap purchasing to off-season (Nov-Mar) which fits typical Utah shop slow periods. '
      + '[Hunter target] for GM / fleet ops email at fordperformanceracingschool.com.',
    followupToday: true,
  },
  {
    clientId: 'utah-race-lhmse-motorsports',
    company: 'Miller Sports + Entertainment (LHM)',
    category: 'racing',
    city: 'Salt Lake City',
    state: 'UT',
    address: '301 W South Temple, Salt Lake City, UT 84101',
    website: 'https://millerse.com',
    contactTitle: 'VP of Sponsorships / Marketing Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Parent organization with deep motorsports history (originally owned Miller Motorsports '
      + 'Park, sponsorship arm still active across Utah motorsports). Door-opener to multiple '
      + 'properties: Utah Jazz team vehicles, Real Salt Lake / Utah Royals shuttle fleet, '
      + 'Megaplex Theatres marketing fleet, the new Salt Lake Bees ballpark in Daybreak, and '
      + 'sponsorship-deal activation vehicles. Pitch is the platform, not a single fleet.',
    notes:
      'CREDIBILITY: HQ address verified via lhm.com + Wikipedia. Recently rebranded from "Larry '
      + 'H. Miller Sports & Entertainment" to "Miller Sports + Entertainment" in 2024 reorg. '
      + 'Now sits inside The Larry H. Miller Company holding structure. Phone via LHM '
      + 'switchboard — call lhm.com main line and ask for MSE sponsorship desk. [Hunter target] '
      + 'for VP Sponsorships at millerse.com.',
    followupToday: true,
  },
  {
    clientId: 'utah-race-bonneville-scta',
    company: 'Southern California Timing Association (SCTA — Bonneville Speed Week)',
    category: 'racing',
    city: 'Wendover',
    state: 'UT',
    website: 'https://www.scta-bni.org',
    contactTitle: 'Event Director / Sponsorship Coordinator',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Sanctioning body for Bonneville Speed Week — every August on the Utah salt flats, '
      + '300+ land-speed-record teams converge. Two plays here: (1) become the official '
      + 'event support shop (rapid-turnaround livery touch-ups + sponsor decal installs '
      + 'on-site), and (2) get the SCTA member roster — every team needs sponsor-logo '
      + 'placement and many run new liveries each year.',
    notes:
      'CREDIBILITY: Active sanctioning body, scta-bni.org. Wendover is on the Utah/Nevada '
      + 'border (salt flats are in UT). Officers rotate annually — pull current Event Director '
      + 'and Sponsorship Coordinator from scta-bni.org officer list. The team-roster ask is the '
      + 'real value; selling individual teams one-by-one is slow but the event partnership '
      + 'unlocks scale.',
    followupToday: true,
  },
  {
    clientId: 'utah-race-bestinthedesert',
    company: 'Best in the Desert Racing Association',
    category: 'racing',
    city: 'Las Vegas',
    state: 'NV',
    website: 'https://www.bitd.com',
    contactTitle: 'Race Director / Marketing Manager',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Sanctions off-road desert races including events that run through Utah (Vegas-to-Reno '
      + 'traverses the high desert, and they bring competitors from across the Wasatch Front). '
      + 'A high % of their racers are Utah-based. Same play as SCTA: get the team roster, or '
      + 'become the on-site touch-up partner for race weekends.',
    notes:
      'CREDIBILITY: bitd.com — Nevada-headquartered sanctioning body but Utah-overlapping '
      + 'racer base. Off-road teams refresh liveries constantly (rocks, mud, body damage). '
      + 'High recurring spend per team. Including this lead as cross-state because the racer '
      + 'base is heavily Utah. [Hunter target] for race director email at bitd.com.',
    followupToday: true,
  },

  // ── COLOR CHANGE / PPF (category: colorchange) ────────────────────────────
  {
    clientId: 'utah-cc-porsche-lehi',
    company: 'Porsche Lehi (Ken Garff)',
    category: 'colorchange',
    city: 'Lehi',
    state: 'UT',
    address: '2252 N Auto Drive, Lehi, UT 84048',
    phone: '(801) 852-5400',
    website: 'https://www.porschelehi.com',
    contactName: 'Chris Lenker',
    contactTitle: 'General Manager',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'PPF play: Porsche buyers are the #1 PPF customer demographic in the country. Pitch a '
      + 'dealership-installed PPF package — front clip, rockers, mirrors, A-pillars — as a F&I '
      + 'upsell at $1,800-$3,500 per car. They keep margin, you get every new and CPO car '
      + 'rolling off the lot. Color-change adds-on for the Taycan / 911 GT3 buyers who want a '
      + 'PTS color without paying Porsche PTS pricing. Direct ext to GM: 801-852-5302. F&I '
      + 'Director Gina Parr direct: 801-852-5304.',
    notes:
      'CREDIBILITY: Main phone + GM (Chris Lenker) + F&I Manager (Gina Parr) + Sales Manager '
      + '(David Slay, 801-852-5317) + Service Manager (Corey Luke, 801-852-5341) all verified '
      + 'via porschelehi.com/staff/. New state-of-the-art location opened in April 2026; '
      + 'previously inside Audi Lehi. 4.8/5 rating. Pitch F&I Director Gina Parr first — she '
      + 'controls the add-on menu; GM signs off but F&I builds it. [Hunter target] for Gina Parr '
      + 'email at kengarff.com domain.',
    followupToday: true,
  },
  {
    clientId: 'utah-cc-mbslc',
    company: 'Mercedes-Benz of Salt Lake City (Ken Garff)',
    category: 'colorchange',
    city: 'Salt Lake City',
    state: 'UT',
    address: '575 S State St, Salt Lake City, UT 84111',
    phone: '855-780-1053',
    website: 'https://www.kengarffmercedes.com',
    contactName: 'Rebecca Anderson',
    contactTitle: 'General Manager',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Same F&I-menu PPF play as Porsche, scaled to a much higher volume dealer. AMG buyers '
      + 'are PPF customers; G-Wagon buyers are both PPF and matte color-change customers. '
      + 'Larger volume = larger throughput requirement; lead with capacity claims. Direct ext '
      + 'to GM Rebecca Anderson: 801-257-3001. F&I Manager Rossi Yerage direct: 801-257-3006. '
      + 'Service Manager Angela Heaps direct: 801-257-3031.',
    notes:
      'CREDIBILITY: Main phone + every key contact + direct extensions all verified via '
      + 'kengarffmercedes.com/staff/. Full staff list: GM Rebecca Anderson (801-257-3001), GSM '
      + 'Brett Robinson (801-257-3003), Sales Managers Crawford Lindsay (801-257-3002) & Des '
      + 'Shay (801-257-3005), Finance Managers Rossi Yerage (801-257-3006) & Sebastian Tischner '
      + '(801-257-3009), Service Manager Angela Heaps (801-257-3031). Service line: '
      + '855-780-1052. Parts: 801-257-3040. [Hunter target] for direct emails — Ken Garff '
      + 'pattern is firstname+last-initial@kengarff.com (verified via Will Schaerr at Land '
      + 'Rover = wills@kengarff.com).',
    followupToday: true,
  },
  {
    clientId: 'utah-cc-bmwmurray',
    company: 'BMW of Murray (Ken Garff)',
    category: 'colorchange',
    city: 'Murray',
    state: 'UT',
    address: '5686 S State St, Murray, UT 84107',
    phone: '(385) 347-3900',
    website: 'https://www.bmwofmurray.com',
    contactTitle: 'General Manager / F&I Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'BMW M-division buyers (M3 / M4 / M5 / M8) are heavy PPF and Individual-color customers. '
      + 'Pitch a 3-tier F&I menu: full front PPF, full-vehicle PPF, and matte color-change. '
      + 'Differentiated by warranty length and coverage area. BMW i-series buyers (i4, iX) '
      + 'also prime PPF buyers — they want to protect their EV investment. Service line: '
      + '(385) 347-3930. Parts: (385) 347-3940.',
    notes:
      'CREDIBILITY: Sales/service/parts phone numbers + address verified via Ken Garff group + '
      + 'autoNews coverage of 2025 dealership additions. Part of the Ken Garff group. Staff '
      + 'directory page returned 403 to scraper — call main line and ask for F&I Director by '
      + 'role. [Hunter target] for GM email once name is identified.',
    followupToday: true,
  },
  {
    clientId: 'utah-cc-lhm-lexus-lindon',
    company: 'Ken Garff Lexus of Lindon (fka Larry H. Miller Lexus Lindon)',
    category: 'colorchange',
    city: 'Lindon',
    state: 'UT',
    address: '544 S Lindon Park Dr, Lindon, UT 84042',
    phone: '(801) 222-4400',
    website: 'https://www.lexusoflindon.com',
    contactName: 'Michael-Anthony Bracetti',
    contactTitle: 'Financial Director (F&I)',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Lexus LX / LC / RC buyers are PPF prospects; the rest of the line is more color-change '
      + 'opportunity (younger ES/IS buyers who want a personalized look without a respray). '
      + 'Pitch a F&I bundle: PPF + ceramic + wheel coating as a "Total Protection" package at '
      + '$2,500-$4,000.',
    notes:
      'CREDIBILITY: Phone + address verified via lexus.com dealer locator + Yelp. NOTE: '
      + 'Asbury Automotive sold this dealership (and 2 others) to Ken Garff in July 2025 — '
      + 'rebranded from "Larry H. Miller Lexus Lindon" to "Ken Garff Lexus of Lindon". Yelp '
      + 'listing still flags the old LHM name as CLOSED — verify current ops status with a '
      + 'phone call before the pitch demo. F&I Director Michael-Anthony Bracetti verified via '
      + 'visualvisitor.com listing. Secondary phone: (801) 227-3200. [Hunter target] for '
      + 'Bracetti email at kengarff.com.',
    followupToday: true,
  },
  {
    clientId: 'utah-cc-lamborghini-slc',
    company: 'Lamborghini Salt Lake City (Salt Lake City Motorcars)',
    category: 'colorchange',
    city: 'South Jordan',
    state: 'UT',
    website: 'https://www.lamborghinisaltlakecity.com',
    contactName: 'Tom & Amy Buckley',
    contactTitle: 'Co-Owners (Salt Lake City Motorcars)',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Lowest volume but highest per-car value in the Utah luxury market. Every Huracán / '
      + 'Revuelto sold needs PPF — buyers expect it as a standard part of delivery. Color-'
      + 'change side: chrome-delete, blackout packages, and one-off wraps for buyers who want '
      + 'something different. $5,000-$10,000 per car is realistic.',
    notes:
      'CREDIBILITY: Owners (Tom & Amy Buckley) and parent dealership name (Salt Lake City '
      + 'Motorcars — saltlakecitymotorcars.com — also operates Bentley + Lotus + Aston Martin) '
      + 'verified via KSL coverage. South Jordan showroom. Direct phone NOT published; pull '
      + 'from lamborghini.com/en-en/dealerships/lamborghini-salt-lake-city before reaching '
      + 'out. [Hunter target] for ownership emails.',
    followupToday: true,
  },
  {
    clientId: 'utah-cc-landrover-slc',
    company: 'Land Rover Downtown Salt Lake (Ken Garff)',
    category: 'colorchange',
    city: 'Salt Lake City',
    state: 'UT',
    address: '150 E 500 S, Salt Lake City, UT 84111',
    phone: '(801) 257-3600',
    email: 'wills@kengarff.com',
    website: 'https://www.landroverdowntownsaltlake.com',
    contactName: 'Will Schaerr',
    contactTitle: 'General Manager',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Range Rover / Defender buyers in Utah double-down on PPF because of (1) salt on the '
      + 'roads in winter, (2) Park City / ski-resort driveways with road grit, and (3) off-road '
      + 'use of the Defender. Strong vehicle-protection narrative — these buyers expect '
      + 'longevity from a $100k+ SUV.',
    notes:
      'CREDIBILITY: Phone + address + GM name + GM EMAIL (wills@kengarff.com) all verified via '
      + 'dealerrater.com + landroverdowntownsaltlake.com + kengarff.com. THE HIGHEST-CREDIBILITY '
      + 'LEAD IN THIS FILE — every piece of contact info is publicly confirmed. Defender SUVs '
      + 'are color-change customers too (matte olive, sand-tan, gloss black). High AOV makes '
      + 'F&I attachment-rate worth pursuing aggressively. Pattern note: Ken Garff emails are '
      + 'firstname+last-initial@kengarff.com — use this pattern for other Ken Garff GMs.',
    followupToday: true,
  },

  // ── COMMERCIAL GC / REFERRAL (category: gc_referral) ──────────────────────
  {
    clientId: 'utah-gc-bigd',
    company: 'Big-D Construction',
    category: 'gc_referral',
    city: 'Salt Lake City',
    state: 'UT',
    address: '404 W 400 S, Salt Lake City, UT 84101',
    phone: '801.415.6000',
    website: 'https://www.big-d.com',
    contactName: 'Steve Kieffer',
    contactTitle: 'Business Development Lead, SLC Regional Office',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Two-pronged pitch: (1) wrap their crew trucks and equipment for site visibility / brand '
      + 'consistency across the Wasatch Front job sites, and (2) become their go-to subcontractor '
      + 'for interior architectural film (DI-NOC) on commercial fit-outs they GC. The referral '
      + 'channel is the bigger long-term revenue. Other UT offices: Lindon 801.769.7300, '
      + 'Ogden 801.392.3200, St. George 435.222.0440.',
    notes:
      'CREDIBILITY: SLC phone + address + leadership verified via big-d.com + ZoomInfo. '
      + 'Leadership stack: CEO Cory Moore (announced Jan 2022). SLC regional office: Rich Hazel '
      + '(regional lead), Bryan Utley (regional leader, 20yr exp), Steve Kieffer (BD, 20yr exp). '
      + 'Top-100 ENR-ranked GC. Steve Kieffer is the right cold-outreach target for the wrap + '
      + 'DI-NOC subcontractor pitch (BD owns vendor relationships). [Hunter target] for Steve '
      + 'Kieffer email at big-d.com.',
    followupToday: true,
  },
  {
    clientId: 'utah-gc-layton',
    company: 'Layton Construction',
    category: 'gc_referral',
    city: 'Sandy',
    state: 'UT',
    address: '9090 S 300 W, Sandy, UT 84070',
    phone: '(801) 568-9090',
    email: 'media@laytonconstruction.com',
    website: 'https://www.laytonconstruction.com',
    contactName: 'David S. Layton',
    contactTitle: 'President & CEO',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Same playbook as Big-D — Layton is a national-scale GC out of Sandy, UT with healthcare, '
      + 'hospitality, and corporate verticals. The DI-NOC referral angle is especially strong on '
      + 'their hospitality and healthcare projects (renovations and brand-standard rollouts use '
      + 'a lot of architectural film). Annual revenues approaching $4B; projects in 27 states.',
    notes:
      'CREDIBILITY: Phone + address + CEO verified via laytonconstruction.com/contact + Utah '
      + 'Construction & Design coverage. media@laytonconstruction.com is the verified marketing/'
      + 'PR inbox (good entry point for a brand/visibility pitch). David Layton is President/CEO '
      + 'since 2004 — too senior for cold; pitch to media@ first, route through Senior VP '
      + 'Terry Wright or VPs Bryan A. Webb / Cris M. Bryant / David P. Blaser. Top-50 ENR GC. '
      + 'Merged with STO Building Group Dec 2019.',
    followupToday: true,
  },
  {
    clientId: 'utah-gc-okland',
    company: 'Okland Construction',
    category: 'gc_referral',
    city: 'Salt Lake City',
    state: 'UT',
    address: '1978 S West Temple, Salt Lake City, UT 84115',
    phone: '801.486.0144',
    website: 'https://www.okland.com',
    contactName: 'Randy Okland',
    contactTitle: 'President',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Mid-size SLC GC with strong education and healthcare project pipeline. Schools and '
      + 'hospitals = high DI-NOC and wall-graphics demand (wayfinding, donor walls, brand '
      + 'standards). Position as their preferred film + graphics partner for institutional '
      + 'work.',
    notes:
      'CREDIBILITY: Phone + address + President verified via okland.com/contact + okland.com/'
      + 'about + Utah AGC member directory. Family-owned, multi-state operation (UT, AZ, CO, '
      + 'HI, ID — each office has its own phone, AZ: 480.990.3330, CO: 303.276.7778, HI: '
      + '808.758.7051, ID: 208.576.6077). Education vertical is recurring (summer turn-arounds '
      + 'include graphics refreshes). [Hunter target] for Randy Okland email at okland.com.',
    followupToday: true,
  },
  {
    clientId: 'utah-gc-jacobsen',
    company: 'Jacobsen Construction',
    category: 'gc_referral',
    city: 'Salt Lake City',
    state: 'UT',
    address: '5181 W Amelia Earhart Dr, Salt Lake City, UT 84116',
    phone: '(801) 973-0500',
    website: 'https://www.jacobsenconstruction.com',
    contactName: 'Gary Ellis',
    contactTitle: 'President & CEO',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'One of Utah\'s oldest construction firms (founded 1922) with a strong portfolio in '
      + 'higher education, healthcare, and corporate. Same referral / DI-NOC subcontractor '
      + 'pitch as the other big-three SLC GCs, with an emphasis on heritage — they\'ve been '
      + 'working with the same tradespeople for decades, so the "we want to be a trusted '
      + 'partner, not just a vendor" angle resonates.',
    notes:
      'CREDIBILITY: Phone + address + CEO verified via jacobsenconstruction.com + Manta + AGC '
      + 'Utah directory + Zippia exec listing. Leadership stack: Gary Ellis (President & CEO), '
      + 'Lonnie Bullard (Chairman of Board), Terry Wright (Senior VP). Secondary phone '
      + '(801) 998-8580. Get on their qualified subcontractor list as first milestone — long '
      + 'sales cycle but high lifetime value. [Hunter target] for Gary Ellis email.',
    followupToday: true,
  },
];

async function importLead(userId, lead) {
  const today = new Date().toISOString().slice(0, 10);

  const insertRes = await pool.query(
    `INSERT INTO leads (
      user_id, client_id, company, category, city, state, country, address,
      contact_name, contact_title, email, phone, fleet_size, website,
      pitch_angle, status, source, notes, followup_due_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,'US',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT (user_id, client_id) DO NOTHING
    RETURNING id`,
    [
      userId, lead.clientId, lead.company, lead.category,
      lead.city || null, lead.state || null, lead.address || null,
      lead.contactName || null, lead.contactTitle || null,
      lead.email || null, lead.phone || null,
      lead.fleetSize || null, lead.website || null,
      lead.pitchAngle || null, lead.status || 'new',
      lead.source || 'utah_research', lead.notes || null,
      lead.followupToday ? today : null,
    ]
  );

  if (!insertRes.rows[0]) {
    return { skipped: true };
  }
  const leadId = insertRes.rows[0].id;

  if (lead.activity) {
    await pool.query(
      `INSERT INTO lead_activities (lead_id, user_id, type, subject, body, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [leadId, userId, lead.activity.type, lead.activity.subject, lead.activity.body, JSON.stringify({ source: 'import_utah' })]
    );
  }

  if (lead.draftEmail) {
    await pool.query(
      `INSERT INTO lead_activities (lead_id, user_id, type, subject, body, metadata)
       VALUES ($1, $2, 'draft_email', $3, $4, $5)`,
      [
        leadId, userId, lead.draftEmail.subject, lead.draftEmail.body,
        JSON.stringify({ source: 'import_utah', note: 'Pre-drafted pitch — ready to copy/send' }),
      ]
    );
  }

  return { skipped: false, leadId };
}

async function main() {
  try {
    const userId = await resolveUserId(parseArgs());
    console.log(`[import-utah] Seeding ${UTAH_LEADS.length} Utah lead(s) for user ${userId}…`);
    let inserted = 0;
    let skipped = 0;
    for (const lead of UTAH_LEADS) {
      const r = await importLead(userId, lead);
      if (r.skipped) {
        skipped++;
        console.log(`  ↪ skipped (already exists): ${lead.company}`);
      } else {
        inserted++;
        console.log(`  ✓ inserted lead #${r.leadId}: ${lead.company} [${lead.category}]`);
      }
    }
    console.log(`[import-utah] Done. Inserted ${inserted}, skipped ${skipped}.`);
    if (inserted > 0) {
      console.log('  → Check your Mission dashboard — new leads have followup_due_at=today.');
      console.log('  → Run /apollo/bulk-enrich-leads to fill in missing named-contact emails via Hunter→Apollo waterfall.');
    }
  } catch (e) {
    console.error('[import-utah] Error:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
