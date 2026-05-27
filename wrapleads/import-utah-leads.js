#!/usr/bin/env node
/**
 * import-utah-leads.js — owner-only import of curated Utah prospects for the
 * upcoming Utah-client pitch. Distinct from seed-*.js (curated and shared with
 * every user via autoSeed) and import-personal-leads.js (warm referrals). These
 * are cold prospects researched from FREE public sources:
 *
 *   - FMCSA SAFER (safer.fmcsa.dot.gov) for trucking / haulers — DOT#, MC#,
 *     address, fleet size are public there.
 *   - Company websites for fleet/service/dealer leadership and current phone.
 *   - Utah SOS Business Search (secure.utah.gov/bes/) to confirm active entity
 *     status.
 *   - Utah Motorsports Campus / Bonneville SCTA / Best in the Desert public
 *     event rosters for racing teams.
 *
 * Each lead carries a `notes` block describing exactly how to finish verifying
 * the contact (e.g. "Run DOT# 250038 in FMCSA SAFER for current phone") so
 * nothing in here is a fabricated phone number or person. Websites, city/state,
 * and category targeting are the high-confidence fields; contact name + phone
 * are intentionally left null where they couldn't be sourced from a verifiable
 * public listing — fill them in from the linked source before outreach.
 *
 * PPF (paint protection film) prospects use category=`colorchange` since the
 * existing LeadCategory enum has no `ppf` value; `pitch_angle` and `notes`
 * call out the PPF angle explicitly.
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
// Hand-curated Utah prospects. Add new entries as research turns them up —
// re-running the script is idempotent.
const UTAH_LEADS = [

  // ── HAULERS / LONG-HAUL FLEET (category: fleet) ──────────────────────────
  {
    clientId: 'utah-fleet-crengland',
    company: 'C.R. England, Inc.',
    category: 'fleet',
    city: 'Salt Lake City',
    state: 'UT',
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
      'CREDIBILITY: SLC HQ since 1920, ~4,000 power units. Look up current DOT# (publicly 250038) '
      + 'on safer.fmcsa.dot.gov for verified phone + mailing address. For decision-maker, target '
      + 'VP of Equipment or Director of Fleet Maintenance via LinkedIn — the recruiting angle '
      + 'often gets you a warmer reception from HR/marketing leadership.',
    followupToday: true,
  },
  {
    clientId: 'utah-fleet-andrustrans',
    company: 'Andrus Transportation Services',
    category: 'fleet',
    city: 'Mendon',
    state: 'UT',
    website: 'https://www.andrustrans.com',
    contactTitle: 'Owner / Operations Manager',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Cache Valley refrigerated carrier — family-run, regional pride angle works here. Pitch '
      + 'consistent trailer livery across the fleet plus high-resolution photo opportunities at '
      + 'the Mendon yard for their website and recruiting materials.',
    notes:
      'CREDIBILITY: Active Utah-domiciled refrigerated carrier. Verify current DOT# and contact '
      + 'via safer.fmcsa.dot.gov. Small/mid-size fleet means owner is typically reachable directly '
      + '— skip the gatekeeper and ask for the owner by first name.',
    followupToday: true,
  },
  {
    clientId: 'utah-fleet-bigwestoil',
    company: 'Big West Oil, LLC',
    category: 'fleet',
    city: 'North Salt Lake',
    state: 'UT',
    website: 'https://www.bigwestoil.com',
    contactTitle: 'Fleet Manager / Director of Logistics',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'North Salt Lake refinery with a captive tank-truck delivery fleet to FlyJ and regional '
      + 'fuel customers. Tankers are highly visible on I-15 and I-80 — pitch DOT-compliant '
      + 'reflective + branded livery as both a safety and brand-recognition spend.',
    notes:
      'CREDIBILITY: Refinery operator with public Utah footprint. Tank-truck fleet verifiable via '
      + 'FMCSA SAFER (search "Big West Oil" or the parent company). Decision-maker likely '
      + 'reports up to Logistics / Supply Chain — start at fleet manager, escalate if needed.',
    followupToday: true,
  },
  {
    clientId: 'utah-fleet-sysco-intermountain',
    company: 'Sysco Intermountain',
    category: 'fleet',
    city: 'Salt Lake City',
    state: 'UT',
    website: 'https://www.sysco.com',
    contactTitle: 'Director of Fleet / Transportation Manager',
    fleetSize: '100+',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Sysco operates a large refrigerated delivery fleet out of the SLC distribution center '
      + 'servicing restaurants and institutional accounts across the Intermountain West. Wrap '
      + 'replacement on aging trailers + fleet-wide refresh as Sysco brand standards update.',
    notes:
      'CREDIBILITY: Sysco Intermountain DC is publicly known in the SLC metro. Look up the DC '
      + 'phone via sysco.com locations page. Sysco corporate procurement is centralized — local '
      + 'transportation manager is the right starting point for a localized wrap conversation.',
    followupToday: true,
  },
  {
    clientId: 'utah-fleet-genevarock',
    company: 'Geneva Rock Products',
    category: 'fleet',
    city: 'Orem',
    state: 'UT',
    website: 'https://www.genevarock.com',
    contactTitle: 'Fleet Manager / Equipment Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Major Wasatch Front aggregate / ready-mix concrete supplier with a large fleet of mixer '
      + 'trucks, dump trucks, and service vehicles. Mixer drums are an unusual wrap canvas — '
      + 'high visibility on every job site, and concrete trucks idle for long stretches '
      + '(literal billboards).',
    notes:
      'CREDIBILITY: Clyde Companies subsidiary, one of the largest aggregate/concrete operators '
      + 'in Utah. Multiple plants across the Wasatch Front. Verify fleet size via FMCSA SAFER. '
      + 'Pitch the mixer-drum wrap angle — most competitors only quote tractor wraps and miss '
      + 'the recurring revenue from drum refreshes.',
    followupToday: true,
  },
  {
    clientId: 'utah-fleet-stakerparson',
    company: 'Staker Parson Companies',
    category: 'fleet',
    city: 'Ogden',
    state: 'UT',
    website: 'https://www.stakerparson.com',
    contactTitle: 'Fleet / Equipment Manager',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Ogden-headquartered aggregate, asphalt, and ready-mix supplier (CRH subsidiary). '
      + 'Mixed fleet of mixers, dump trucks, and crew vehicles across northern Utah and southern '
      + 'Idaho. Brand consistency angle is strong — CRH ownership means national brand '
      + 'standards filter down.',
    notes:
      'CREDIBILITY: Long-standing Utah operator, now a CRH (Holcim group) subsidiary. Verify '
      + 'current fleet size via FMCSA SAFER. Decision authority for graphics may sit with the '
      + 'regional marketing lead at CRH Americas — local fleet manager can route you.',
    followupToday: true,
  },

  // ── COMMERCIAL SERVICE FLEETS (category: fleet) ───────────────────────────
  {
    clientId: 'utah-svc-whipple',
    company: 'Whipple Service Champions',
    category: 'fleet',
    city: 'Salt Lake City',
    state: 'UT',
    website: 'https://www.whippleservicechampions.com',
    contactTitle: 'Owner / Marketing Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'One of the most-marketed HVAC / plumbing / electrical service brands on the Wasatch Front '
      + '(heavy radio + billboard spend). Their fleet is already wrapped — pitch the refresh + '
      + 'expansion angle: as they add territory and trucks, you become the standard for the new '
      + 'unit installs and replace the existing wraps as they age.',
    notes:
      'CREDIBILITY: Verifiable on whippleservicechampions.com — fleet photos and service area '
      + 'visible on the site. Owner-operator decision making, marketing director controls brand '
      + 'standards. Already a wrap customer = lower friction to switch on a refresh cycle.',
    followupToday: true,
  },
  {
    clientId: 'utah-svc-anyhour',
    company: 'Any Hour Services',
    category: 'fleet',
    city: 'Lindon',
    state: 'UT',
    website: 'https://www.anyhourservices.com',
    contactTitle: 'Fleet Manager / Marketing Director',
    fleetSize: '100+',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Massive Utah Valley electrical / plumbing / HVAC service company with one of the largest '
      + 'wrapped service-truck fleets in the state. Strong recurring-refresh play — every new '
      + 'truck off the lot needs the same yellow + red livery and every retired truck needs '
      + 'one final wrap for the resale market.',
    notes:
      'CREDIBILITY: Anyhourservices.com — visible fleet, multi-state expansion in progress '
      + '(adding new trucks regularly). Likely already has a wrap vendor; pitch is consistency '
      + '+ speed + capacity to keep up with their growth rate, not just price.',
    followupToday: true,
  },
  {
    clientId: 'utah-svc-blackdiamond',
    company: 'Black Diamond Plumbing & Mechanical',
    category: 'fleet',
    city: 'Salt Lake City',
    state: 'UT',
    website: 'https://www.blackdiamondplumbing.com',
    contactTitle: 'Owner / Operations Manager',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Multi-trade service company across UT with a recognizable black-and-yellow brand. The '
      + 'matte-black wrap angle resonates here — distinct from the typical white-truck-with-'
      + 'decals look of competitors. Pitch a matte-black + reflective accents test on one truck, '
      + 'then full rollout.',
    notes:
      'CREDIBILITY: Verifiable on blackdiamondplumbing.com. Service area covers the Wasatch '
      + 'Front. Owner-operator structure means a single decision-maker — direct outreach works.',
    followupToday: true,
  },
  {
    clientId: 'utah-svc-beehiveplumbing',
    company: 'Beehive Plumbing',
    category: 'fleet',
    city: 'South Jordan',
    state: 'UT',
    website: 'https://www.beehiveplumbing.com',
    contactTitle: 'Owner',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Locally-owned plumbing fleet with Utah-themed branding (beehive = Utah state symbol). '
      + 'Strong local-identity angle — pitch a heritage-Utah graphic treatment that ties the '
      + 'state symbolism into the fleet livery. Helps them stand out from the corporate '
      + 'national chains expanding into their market.',
    notes:
      'CREDIBILITY: Beehiveplumbing.com confirms active Utah service business. Smaller fleet '
      + 'means faster sales cycle. Owner is the buyer.',
    followupToday: true,
  },

  // ── RACING (category: racing) ─────────────────────────────────────────────
  {
    clientId: 'utah-race-umc',
    company: 'Utah Motorsports Campus',
    category: 'racing',
    city: 'Tooele',
    state: 'UT',
    website: 'https://www.utahmotorsportscampus.com',
    contactTitle: 'Director of Marketing / Events',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'The venue, not a team — 511-acre motorsports park hosting MotoAmerica, Trans Am, club '
      + 'racing, and corporate track-day events. Wrap opportunities: venue support vehicles, '
      + 'corporate event signage, custom liveries for the rental fleet, and trackside vinyl. '
      + 'Bigger play: become their referred partner for every team and corporate group that '
      + 'shows up needing a last-minute wrap.',
    notes:
      'CREDIBILITY: Utahmotorsportscampus.com — verifiable venue, active 2026 season schedule. '
      + 'Marketing/events team is the entry point. The "referred partner" play is the real '
      + 'revenue — every weekend brings new teams who need wraps installed on-site.',
    followupToday: true,
  },
  {
    clientId: 'utah-race-fordperformance',
    company: 'Ford Performance Racing School',
    category: 'racing',
    city: 'Tooele',
    state: 'UT',
    website: 'https://www.fordperformanceracingschool.com',
    contactTitle: 'General Manager / Fleet Operations',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Operates a fleet of Mustangs (Shelby GT350R, Mach 1, Dark Horse R) at Utah Motorsports '
      + 'Campus for driving instruction. Cars take heavy track abuse — pitch PPF on the front '
      + 'clips/rockers (huge insurance against stone chips and curb rash from students) plus '
      + 'fresh livery refreshes between seasons.',
    notes:
      'CREDIBILITY: Operates at UMC — verifiable on both sites. Annual fleet refresh cycle '
      + 'aligns wrap purchasing to off-season (Nov–Mar) which fits typical Utah shop slow '
      + 'periods. Strong year-after-year recurring revenue once you land them.',
    followupToday: true,
  },
  {
    clientId: 'utah-race-lhmse-motorsports',
    company: 'Larry H. Miller Sports & Entertainment',
    category: 'racing',
    city: 'Salt Lake City',
    state: 'UT',
    website: 'https://www.lhmse.com',
    contactTitle: 'VP of Sponsorships / Marketing Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Parent organization with deep motorsports history (originally owned Miller Motorsports '
      + 'Park, sponsorship arm still active across Utah motorsports). Door-opener to multiple '
      + 'properties: Utah Jazz team vehicles, sponsorship-deal activation vehicles, racing '
      + 'partnerships. Pitch is the platform, not a single fleet.',
    notes:
      'CREDIBILITY: LHM is the largest privately-held company in Utah. Sponsorship/marketing '
      + 'team controls multiple-property wrap budgets. Long sales cycle — but landing them gets '
      + 'you 6–8 separate wrap programs under one parent.',
    followupToday: true,
  },
  {
    clientId: 'utah-race-bonneville-scta',
    company: 'Southern California Timing Association (Bonneville Speed Week)',
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
      'CREDIBILITY: SCTA-bni.org — long-running, active sanctioning body. Wendover is on the '
      + 'Utah/Nevada border. Event Director rotates — check the current contact on the site '
      + 'before reaching out. The roster ask is the real value; selling individual teams '
      + 'one-by-one is slow but the event partnership unlocks scale.',
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
      'CREDIBILITY: Bitd.com — Nevada-headquartered but Utah-overlapping racer base. Off-road '
      + 'teams refresh liveries constantly (rocks, mud, body damage). High recurring spend '
      + 'per team. Including this lead as cross-state because the racer base is heavily Utah.',
    followupToday: true,
  },

  // ── COLOR CHANGE / PPF (category: colorchange) ────────────────────────────
  {
    clientId: 'utah-cc-kengarff-porsche',
    company: 'Ken Garff Porsche Salt Lake City',
    category: 'colorchange',
    city: 'Salt Lake City',
    state: 'UT',
    website: 'https://www.porschesaltlakecity.com',
    contactTitle: 'General Manager / F&I Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'PPF play: Porsche buyers are the #1 PPF customer demographic in the country. Pitch a '
      + 'dealership-installed PPF package — front clip, rockers, mirrors, A-pillars — as a F&I '
      + 'upsell at $1,800–$3,500 per car. They keep margin, you get every new and CPO car '
      + 'rolling off the lot. Color-change adds-on for the Taycan / 911 GT3 buyers who want a '
      + 'PTS color without paying Porsche PTS pricing.',
    notes:
      'CREDIBILITY: Ken Garff Automotive Group is Utah\'s largest dealership group — '
      + 'porschesaltlakecity.com confirms active rooftop. Pitch the F&I Director first '
      + '(they control add-on packages); GM signs off but F&I builds the menu.',
    followupToday: true,
  },
  {
    clientId: 'utah-cc-mbslc',
    company: 'Mercedes-Benz of Salt Lake City',
    category: 'colorchange',
    city: 'Salt Lake City',
    state: 'UT',
    website: 'https://www.mbofslc.com',
    contactTitle: 'General Manager / F&I Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Same F&I-menu PPF play as Porsche, scaled to a much higher volume dealer. AMG buyers '
      + 'are PPF customers; G-Wagon buyers are both PPF and matte color-change customers. '
      + 'Larger volume = larger throughput requirement; lead with capacity claims.',
    notes:
      'CREDIBILITY: Ken Garff group rooftop, verifiable on mbofslc.com. High-volume luxury '
      + 'dealer = recurring monthly revenue once on the F&I menu. AMG GT and G-Wagon buyers '
      + 'are the highest-dollar PPF prospects in the market.',
    followupToday: true,
  },
  {
    clientId: 'utah-cc-bmwmurray',
    company: 'BMW of Murray',
    category: 'colorchange',
    city: 'Murray',
    state: 'UT',
    website: 'https://www.bmwofmurray.com',
    contactTitle: 'General Manager / F&I Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'BMW M-division buyers (M3 / M4 / M5 / M8) are heavy PPF and Individual-color customers. '
      + 'Pitch a 3-tier F&I menu: full front PPF, full-vehicle PPF, and matte color-change. '
      + 'Differentiated by warranty length and coverage area. BMW i-series buyers (i4, iX) '
      + 'also prime PPF buyers — they want to protect their EV investment.',
    notes:
      'CREDIBILITY: Ken Garff group, bmwofmurray.com. Same playbook as the Porsche pitch. '
      + 'BMW Individual color program is a natural cross-sell to matte color-change.',
    followupToday: true,
  },
  {
    clientId: 'utah-cc-lhm-lexus-lindon',
    company: 'Larry H. Miller Lexus Lindon',
    category: 'colorchange',
    city: 'Lindon',
    state: 'UT',
    website: 'https://www.lhmlexus.com',
    contactTitle: 'General Manager / F&I Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Lexus LX / LC / RC buyers are PPF prospects; the rest of the line is more color-change '
      + 'opportunity (younger ES/IS buyers who want a personalized look without a respray). '
      + 'Pitch a F&I bundle: PPF + ceramic + wheel coating as a "Total Protection" package at '
      + '$2,500–$4,000.',
    notes:
      'CREDIBILITY: LHM-owned Lexus rooftop in Utah Valley. Verifiable on lhmlexus.com. '
      + 'LHM\'s F&I directors share best practices across the group — landing one Lexus rooftop '
      + 'gets you a foot in the door at LHM Honda, Toyota, and Ford rooftops as well.',
    followupToday: true,
  },
  {
    clientId: 'utah-cc-lamborghini-slc',
    company: 'Lamborghini Salt Lake City',
    category: 'colorchange',
    city: 'Salt Lake City',
    state: 'UT',
    website: 'https://www.lamborghinisaltlakecity.com',
    contactTitle: 'General Manager / Owner',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Lowest volume but highest per-car value in the Utah luxury market. Every Huracán / '
      + 'Revuelto sold needs PPF — buyers expect it as a standard part of delivery. Color-'
      + 'change side: chrome-delete, blackout packages, and one-off wraps for buyers who want '
      + 'something different. $5,000–$10,000 per car is realistic.',
    notes:
      'CREDIBILITY: Strong Automotive Group rooftop. Verify current address/contact via '
      + 'lamborghinisaltlakecity.com. Low car count means relationship matters more than '
      + 'capacity — pitch a dedicated white-glove install bay reserved for their cars.',
    followupToday: true,
  },
  {
    clientId: 'utah-cc-landrover-slc',
    company: 'Land Rover Salt Lake City',
    category: 'colorchange',
    city: 'Salt Lake City',
    state: 'UT',
    website: 'https://www.landroversaltlakecity.com',
    contactTitle: 'General Manager / F&I Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Range Rover / Defender buyers in Utah double-down on PPF because of (1) salt on the '
      + 'roads in winter, (2) Park City / ski-resort driveways with road grit, and (3) off-road '
      + 'use of the Defender. Strong vehicle-protection narrative — these buyers expect '
      + 'longevity from a $100k+ SUV.',
    notes:
      'CREDIBILITY: Ken Garff rooftop, landroversaltlakecity.com. Defender SUVs are color-'
      + 'change customers too (matte olive, sand-tan, gloss black). High AOV makes the F&I '
      + 'attachment rate worth pursuing aggressively.',
    followupToday: true,
  },

  // ── COMMERCIAL GC / REFERRAL (category: gc_referral) ──────────────────────
  {
    clientId: 'utah-gc-bigd',
    company: 'Big-D Construction',
    category: 'gc_referral',
    city: 'Salt Lake City',
    state: 'UT',
    website: 'https://www.big-d.com',
    contactTitle: 'VP of Operations / Marketing Director',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Two-pronged pitch: (1) wrap their crew trucks and equipment for site visibility / brand '
      + 'consistency across the Wasatch Front job sites, and (2) become their go-to subcontractor '
      + 'for interior architectural film (DI-NOC) on commercial fit-outs they GC. The referral '
      + 'channel is the bigger long-term revenue.',
    notes:
      'CREDIBILITY: Big-D is one of the top 100 ENR-ranked U.S. GCs, SLC-headquartered. '
      + 'Verifiable on big-d.com. Two decision-makers: VP Ops for the fleet pitch, Design/'
      + 'Specifications team for the DI-NOC subcontracting pitch — pursue separately.',
    followupToday: true,
  },
  {
    clientId: 'utah-gc-layton',
    company: 'Layton Construction',
    category: 'gc_referral',
    city: 'Sandy',
    state: 'UT',
    website: 'https://www.laytonconstruction.com',
    contactTitle: 'VP of Operations / Director of Field Services',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Same playbook as Big-D — Layton is a national-scale GC out of Sandy, UT with healthcare, '
      + 'hospitality, and corporate verticals. The DI-NOC referral angle is especially strong on '
      + 'their hospitality and healthcare projects (renovations and brand-standard rollouts use '
      + 'a lot of architectural film).',
    notes:
      'CREDIBILITY: Top-50 ENR GC, Utah HQ. Verify decision-maker via laytonconstruction.com '
      + 'leadership page. Pitch is "we\'ll save your PM\'s time — you stop chasing 5 different '
      + 'wrap/film vendors and consolidate to us across all your active jobs."',
    followupToday: true,
  },
  {
    clientId: 'utah-gc-okland',
    company: 'Okland Construction',
    category: 'gc_referral',
    city: 'Salt Lake City',
    state: 'UT',
    website: 'https://www.okland.com',
    contactTitle: 'VP / Director of Operations',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'Mid-size SLC GC with strong education and healthcare project pipeline. Schools and '
      + 'hospitals = high DI-NOC and wall-graphics demand (wayfinding, donor walls, brand '
      + 'standards). Position as their preferred film + graphics partner for institutional '
      + 'work.',
    notes:
      'CREDIBILITY: Okland.com — long-standing Utah GC. Education vertical is a recurring '
      + 'revenue source (every summer turn-around includes graphics refreshes). Pitch the '
      + 'summer-window scheduling angle.',
    followupToday: true,
  },
  {
    clientId: 'utah-gc-jacobsen',
    company: 'Jacobsen Construction',
    category: 'gc_referral',
    city: 'Salt Lake City',
    state: 'UT',
    website: 'https://www.jacobsenconstruction.com',
    contactTitle: 'Director of Operations / Project Executive',
    status: 'new',
    source: 'utah_research',
    pitchAngle:
      'One of Utah\'s oldest construction firms with a strong portfolio in higher education, '
      + 'healthcare, and corporate. Same referral / DI-NOC subcontractor pitch as the other '
      + 'big-three SLC GCs, with an emphasis on heritage — they\'ve been working with the same '
      + 'tradespeople for decades, so the "we want to be a trusted partner, not just a vendor" '
      + 'angle resonates.',
    notes:
      'CREDIBILITY: Jacobsenconstruction.com — founded 1922, top-tier Utah GC. Long sales cycle '
      + 'to break in but lifetime value is high. Get on their qualified subcontractor list as '
      + 'first milestone.',
    followupToday: true,
  },
];

async function importLead(userId, lead) {
  const today = new Date().toISOString().slice(0, 10);

  const insertRes = await pool.query(
    `INSERT INTO leads (
      user_id, client_id, company, category, city, state, country,
      contact_name, contact_title, email, phone, fleet_size, website,
      pitch_angle, status, source, notes, followup_due_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,'US',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (user_id, client_id) DO NOTHING
    RETURNING id`,
    [
      userId, lead.clientId, lead.company, lead.category,
      lead.city || null, lead.state || null,
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
      console.log('  → Verify contact details via FMCSA SAFER or company websites before outreach.');
    }
  } catch (e) {
    console.error('[import-utah] Error:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
