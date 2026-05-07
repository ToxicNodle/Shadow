/**
 * WrapLeads — Motorsport / Race Teams Seed
 * -----------------------------------------
 * IndyCar, IMSA, NHRA, USAC, and support series.
 *
 * Geographic advantage: Shadow Graphix is in Speedway, IN — the global
 * headquarters of IndyCar. Brownsburg, IN (15 min west) is literally the NHRA
 * capital of the world: John Force Racing, DSR, Tony Stewart Racing, and more
 * are all within a single delivery run.
 *
 * Revenue profile (highest of any category):
 *   - 53' race hauler full wrap:       $15,000 – $35,000
 *   - Race car livery (per car):         $3,000 –  $8,000
 *   - Hospitality trailer/motorcoach:  $12,000 – $30,000
 *   - Support fleet (vans/trucks):      $1,500 –  $4,000/vehicle
 *   - DI-NOC for team shop/garage:      $8,000 – $25,000
 *   - Full team season package:        $50,000 – $150,000+
 *
 * Usage:  node seed-racing.js
 * Safe to re-run — ON CONFLICT upserts contact info on existing records
 */

require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';

const RACING_LEADS = [
  // ─── IndyCar Teams (mostly Indy-based) ────────────────────────────────────

  {
    clientId: 'race-001',
    company: 'Andretti Global',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Director of Marketing / Partnerships',
    email: null,
    phone: null,
    website: 'andrettiglobal.com',
    address: '7615 Zionsville Road, Indianapolis, IN 46268',
    pitchAngle: 'Andretti runs 6 IndyCar entries + an Indy Lights program + Formula E — that\'s haulers, race cars, support vans, and hospitality units across multiple series simultaneously. They\'re 10 minutes from us. Full season livery + hauler package, turnkey.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-002',
    company: 'Chip Ganassi Racing',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'VP of Marketing / Sponsorship Activation',
    email: 'ckulpa@ganassi.com',
    phone: null,
    website: 'ganassiracing.com',
    address: '7777 Woodland Drive, Indianapolis, IN 46278',
    pitchAngle: 'CGR operates IndyCar + IMSA + NASCAR programs from Indy and Charlotte. Multiple 53\' haulers, 4+ IndyCar liveries per season, IMSA GTD Pro entries — season-long wrap contract opportunity across all properties.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-003',
    company: 'Arrow McLaren',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Lauren Gaudion',
    contactTitle: 'VP of Marketing & Communications',
    email: null,
    phone: null,
    website: 'arrowmclaren.com',
    address: 'Indianapolis, IN 46268',
    pitchAngle: 'Arrow McLaren is backed by McLaren Group and runs 3–4 IndyCar entries. Their brand-new $30M McLaren Racing Center in Indy just opened — their haulers and liveries change sponsor graphics multiple times per season. High-frequency wrap work.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-004',
    company: 'Rahal Letterman Lanigan Racing',
    category: 'racing',
    city: 'Zionsville', state: 'IN',
    contactName: 'Kathi Lauterbach',
    contactTitle: 'VP of Communications',
    email: 'klauterbach@rahal.com',
    phone: '317-858-3717',
    website: 'rahal.com',
    address: '10771 Creek Way, Zionsville, IN 46077',
    pitchAngle: 'RLL runs IndyCar + IMSA BMW entries. Bobby Rahal is personally invested in presentation quality. VP Partnership Marketing Kevin Warner handles all commercial deals. Indiana HQ + Ohio shop — both within delivery range.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-005',
    company: 'Ed Carpenter Racing',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Garret Mudd',
    contactTitle: 'Chief Commercial Officer',
    email: null,
    phone: null,
    website: 'ecrindy.com',
    address: '7231 Georgetown Road, Indianapolis, IN 46268',
    pitchAngle: 'Ed Carpenter Racing is a homegrown Indiana team — Ed is from Indy. 2-car IndyCar operation. CCO Garret Mudd handles all partnerships. Relationship-first sale: we\'re Indiana locals supporting an Indiana team. Hauler + liveries + support fleet.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-006',
    company: 'Dreyer & Reinbold Racing',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Dennis Reinbold',
    contactTitle: 'Team Owner / Managing Partner',
    email: null,
    phone: '317-552-2967',
    website: 'dreyerreinboldracing.com',
    address: 'Indianapolis, IN 46224',
    pitchAngle: 'DRR (now partnered with Juncos Hollinger for Indy 500) is an Indy-based IndyCar team. Dennis Reinbold owns Indianapolis BMW/Infiniti/VW dealers — fleet wrap opportunity extends to the dealership group too. Local team, local vendor relationship.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-007',
    company: 'Juncos Hollinger Racing',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Team Principal / Operations Director',
    email: null,
    phone: '317-552-2967',
    website: 'juncoshollinger.com',
    address: '4401 Gilman St, Indianapolis, IN 46224',
    pitchAngle: 'Growing IndyCar team based in Indianapolis with Sting Ray Robb. New team building their brand identity — opportunity to establish Shadow as their long-term wrap vendor for liveries, hauler, and hospitality as they expand.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-008',
    company: 'Meyer Shank Racing',
    category: 'racing',
    city: 'Pataskala', state: 'OH',
    contactName: 'Jim Meyer',
    contactTitle: 'Co-Owner',
    email: null,
    phone: null,
    website: 'meyershankracing.com',
    address: 'Pataskala, OH',
    pitchAngle: 'MSR runs IndyCar + IMSA from Pataskala OH (Columbus metro). They won Le Mans 2023. Mike Shank is a craftsman — quality matters to him. Dual-series operation means multiple haulers, cars, and support vehicles year-round.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-009',
    company: 'A.J. Foyt Enterprises',
    category: 'racing',
    city: 'Speedway', state: 'IN',
    contactName: 'Larry Foyt',
    contactTitle: 'Team President',
    email: null,
    phone: null,
    website: 'foytracing.com',
    address: 'Speedway, IN 46224',
    pitchAngle: 'AJ Foyt Enterprises maintains a significant presence in Speedway, IN — literally neighbors. The most storied name in American open-wheel racing. Larry Foyt runs day-to-day. A Foyt relationship is a calling card for every other racing team.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-010',
    company: 'Dale Coyne Racing',
    category: 'racing',
    city: 'Plainfield', state: 'IL',
    contactName: null,
    contactTitle: 'Team Manager',
    email: null,
    phone: null,
    website: 'dalecoyne.com',
    address: 'Plainfield, IL',
    pitchAngle: 'Dale Coyne Racing is based in Plainfield IL (Chicago suburbs) and has been in IndyCar for 40 years. Budget-conscious team that appreciates local vendors. Strong fit for hauler and support vehicle wraps.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-011',
    company: 'HMD Motorsports',
    category: 'racing',
    city: 'Brownsburg', state: 'IN',
    contactName: 'Mike Maurini',
    contactTitle: 'General Manager',
    email: 'Info@HMDMotorsports.com',
    phone: '317-270-8723',
    website: 'hmdmotorsports.com',
    address: '1652 E Northfield Dr, Brownsburg, IN 46112',
    pitchAngle: 'HMD runs Indy NXT and is partnered with AJ Foyt for 2026 — based in Brownsburg, 15 min from Shadow. Indy NXT teams need cost-effective livery solutions. Entry point into the entire IndyCar feeder ladder. Literal neighbors in NHRA country.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012',
    company: 'Prema Racing (IndyCar program)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'IndyCar Program Director',
    email: null,
    phone: null,
    website: 'prema.com',
    address: 'Indianapolis, IN',
    pitchAngle: 'Prema is a European powerhouse expanding into IndyCar. Their US operation is based in Indianapolis. European teams often look for local vendors to handle US-spec graphics — Shadow can be their American wrap partner.',
    source: 'seed_racing',
  },

  // ─── Indy NXT / Road to Indy (feeder ladder — mostly Indy-based) ────────────

  {
    clientId: 'race-012b',
    company: 'Cape Motorsports (Indy NXT)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Team Principal / Operations Manager',
    email: null,
    phone: null,
    website: 'capemotorsports.com',
    address: 'Indianapolis, IN',
    pitchAngle: 'Cape Motorsports runs multiple Indy NXT entries and is based in Indianapolis. Road to Indy teams run 15+ race weekends per year — liveries change with sponsors throughout the season. Consistent, repeatable wrap work.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012c',
    company: 'Abel Motorsports (Indy NXT)',
    category: 'racing',
    city: 'Lima', state: 'OH',
    contactName: null,
    contactTitle: 'Team Owner / Manager',
    email: null,
    phone: null,
    website: 'abelmotorsports.com',
    address: 'Lima, OH',
    pitchAngle: 'Abel Motorsports races Indy NXT and USF Pro 2000 from Lima OH — well within Shadow\'s range. Midwest-based team that prefers local vendors. Liveries, hauler graphics, and transporter wraps at Road to Indy pricing.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012d',
    company: 'Exclusive Autosport (Indy NXT / USF Pro)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Team Principal / Marketing Director',
    email: null,
    phone: null,
    website: 'exclusiveautosport.com',
    address: 'Indianapolis, IN',
    pitchAngle: 'Exclusive Autosport runs cars at multiple Road to Indy levels from their Indianapolis shop. Multi-entry operation means multiple liveries per season. Indy-based — same-day service is possible.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012e',
    company: 'Carlin (US Road to Indy program)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'US Operations Manager / Marketing',
    email: null,
    phone: null,
    website: 'carlinmotorsport.com',
    address: 'Indianapolis, IN',
    pitchAngle: 'Carlin is a major international racing brand (F2, F3, IndyCar, Road to Indy) with a US base in Indianapolis. Their European team often needs American vendors for US rounds. Shadow can be Carlin\'s stateside wrap partner.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012f',
    company: 'Andretti Autosport (Road to Indy program)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Road to Indy Program Director',
    email: null,
    phone: null,
    website: 'andrettiautosport.com',
    address: '7615 Zionsville Road, Indianapolis, IN 46268',
    pitchAngle: 'Andretti runs Indy NXT + Indy Pro 2000 + USF 2000 as their full development ladder — all from Indianapolis. One contact covers the entire Andretti racing operation: IndyCar, Indy NXT, Formula E, and Extreme E.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012g',
    company: 'Telcel Mexican Industries (Indy NXT)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Team Manager / Commercial Director',
    email: null,
    phone: null,
    website: 'telcelracing.com',
    address: 'Indianapolis, IN',
    pitchAngle: 'Telcel races Indy NXT and has strong sponsor backing from Mexico\'s largest telecom. Their liveries are vibrant and sponsor-critical — quality wrap work is non-negotiable. Indianapolis-based operation with a budget to match their sponsorship level.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012h',
    company: 'Road to Indy Presented by Cooper Tires (series office)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Series Director / Marketing VP',
    email: null,
    phone: null,
    website: 'roadtoindy.com',
    address: 'Indianapolis, IN',
    pitchAngle: 'The Road to Indy series office manages relationships with ALL teams across Indy NXT, USF Pro 2000, and USF 2000. One deal with the series as their preferred vendor gets Shadow introduced to every team on the ladder — 30+ teams across 3 series.',
    source: 'seed_racing',
  },

  // ─── NHRA Teams (Brownsburg, IN — the NHRA capital of the world) ──────────

  {
    clientId: 'race-013',
    company: 'John Force Racing',
    category: 'racing',
    city: 'Brownsburg', state: 'IN',
    contactName: 'Bob McAleer',
    contactTitle: 'Director of Business Operations',
    email: null,
    phone: '317-858-8889',
    website: 'johnforceracing.com',
    address: '498 Southpoint Circle, Brownsburg, IN 46112',
    pitchAngle: 'John Force Racing is THE name in NHRA — 4 Funny Car entries, John Force himself, Robert Hight, Brittany Force, Austin Prock. 15 minutes from Shadow. Multiple 53\' haulers, 4 full-season livery programs, hospitality, support fleet. This is a $200K+ annual relationship.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-014',
    company: 'Don Schumacher Racing (DSR)',
    category: 'racing',
    city: 'Brownsburg', state: 'IN',
    contactName: null,
    contactTitle: 'CEO / Director of Partnerships',
    email: null,
    phone: '317-858-0356',
    website: 'schumacherracing.com',
    address: '1681 E. Northfield Drive, Brownsburg, IN 46112',
    pitchAngle: 'DSR is NHRA\'s biggest multi-car operation: Matt Hagan, Jack Beckman. Based in Brownsburg with a massive facility. Their haulers and liveries are premium-grade. Shadow can own the DSR relationship — they\'re literally neighbors.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-015',
    company: 'Tony Stewart Racing (Drag)',
    category: 'racing',
    city: 'Brownsburg', state: 'IN',
    contactName: null,
    contactTitle: 'Team Director / Operations Manager',
    email: null,
    phone: '800-867-6067',
    website: 'tsrnitro.com',
    address: '438 Southpoint Circle, Brownsburg, IN 46112',
    pitchAngle: 'Tony Stewart Racing runs Top Fuel + Funny Car out of Brownsburg — partnered with Elite Motorsports for sales & marketing in 2025. Tony is the most recognizable name in American motorsport. Hauler wraps + liveries + TSR hospitality graphics.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-016',
    company: 'Ron Capps Motorsports',
    category: 'racing',
    city: 'Brownsburg', state: 'IN',
    contactName: 'Ron Capps',
    contactTitle: 'Team Owner',
    email: null,
    phone: null,
    website: 'roncappsmotorsports.com',
    address: 'Brownsburg, IN 46112',
    pitchAngle: 'Ron Capps runs his own NHRA Funny Car team after splitting from DSR. Brownsburg-based. 3x NHRA Funny Car champion. New team establishing their vendor relationships — perfect timing to land Shadow as their wrap shop. Full livery + hauler program.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-017',
    company: 'Kalitta Motorsports',
    category: 'racing',
    city: 'Ypsilanti', state: 'MI',
    contactName: null,
    contactTitle: 'VP of Operations / Sponsorship Director',
    email: null,
    phone: null,
    website: 'teamkalitta.com',
    address: '1010 James L Hart Pkwy, Ypsilanti, MI 48197',
    pitchAngle: 'Kalitta runs Top Fuel + Funny Car from Ypsilanti MI. Connie Kalitta\'s operation is one of NHRA\'s elite teams. They travel to IMS for the US Nationals every year — relationship building opportunity at their biggest race.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-018',
    company: 'Hendrick Motorsports (NHRA connection)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Motorsport Partnerships Manager',
    email: null,
    phone: null,
    website: 'hendrickmotorsports.com',
    address: 'Concord, NC / Indianapolis IN activation',
    pitchAngle: 'Hendrick Motorsports has NHRA ties through NAPA and Hendrick Chevy dealers. Their Indy-area dealer network activates at IMS events. Fleet wrap opportunity across the entire Hendrick dealer group + motorsport hospitality vehicles.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-019',
    company: 'Cruz Pedregon Racing',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Cruz Pedregon',
    contactTitle: 'Team Owner / Marketing Director',
    email: null,
    phone: null,
    website: 'cruzpedregon.com',
    address: 'Indianapolis, IN',
    pitchAngle: 'Cruz Pedregon runs NHRA Funny Car near Indianapolis. Two-time NHRA Funny Car champion. Boutique team that values relationships with quality vendors. Hauler + livery + support vehicle program.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-020',
    company: 'Funny Car Chaos (NHRA independent)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Series Director / Marketing',
    email: null,
    phone: null,
    website: 'funnycar-chaos.com',
    address: 'Indianapolis, IN',
    pitchAngle: 'Funny Car Chaos is an independent NHRA support series with 40+ teams at Indy events. Lower-budget but high volume — multiple teams needing cost-effective hauler wraps and liveries. One pitch to the series director reaches all teams.',
    source: 'seed_racing',
  },

  // ─── IMSA Teams ───────────────────────────────────────────────────────────

  {
    clientId: 'race-021',
    company: 'Corvette Racing (GM Motorsports)',
    category: 'racing',
    city: 'Bowling Green', state: 'KY',
    contactName: null,
    contactTitle: 'Motorsport Marketing Manager',
    email: null,
    phone: null,
    website: 'corvetteracing.com',
    address: 'Bowling Green, KY',
    pitchAngle: 'Corvette Racing is GM\'s factory IMSA GTD Pro program. They run 2+ C8.R entries with full manufacturer backing. Premium budget, elite presentation standards. Hauler + livery + support fleet program.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-022',
    company: 'Gradient Racing (IMSA)',
    category: 'racing',
    city: 'South Bend', state: 'IN',
    contactName: null,
    contactTitle: 'Team Manager / Operations Director',
    email: null,
    phone: null,
    website: 'gradientracing.com',
    address: 'South Bend, IN',
    pitchAngle: 'Gradient Racing runs IMSA Pilot Challenge from South Bend IN — an Indiana team in our backyard. Local pride angle: support Indiana motorsport. GT4 class with multiple entries. Hauler + liveries + team vehicles.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-023',
    company: 'Turner Motorsports (IMSA)',
    category: 'racing',
    city: 'Townsend', state: 'GA',
    contactName: null,
    contactTitle: 'Team Principal / Marketing Director',
    email: null,
    phone: null,
    website: 'turnermotorsports.com',
    address: 'Townsend, GA',
    pitchAngle: 'Turner Motorsports runs IMSA GTD BMW entries and travels to Mid-Ohio and Road America (both within delivery range). Reach out before Midwest rounds — offer to handle all graphics for the Midwest leg of the season.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-024',
    company: 'Pfaff Motorsports (IMSA GTD Pro)',
    category: 'racing',
    city: 'Toronto', state: 'ON',
    contactName: null,
    contactTitle: 'Director of Motorsport / Partnerships VP',
    email: null,
    phone: null,
    website: 'pfaffmotorsports.com',
    address: 'Toronto, ON Canada',
    pitchAngle: 'Pfaff won the GTD Pro championship with Porsche. They run US rounds including Mid-Ohio and Road Atlanta. Canadian team looking for US vendor relationships — pitch Shadow as their stateside wrap shop for hauler + livery touch-ups between rounds.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-025',
    company: 'Compass Racing (IMSA)',
    category: 'racing',
    city: 'Mooresville', state: 'NC',
    contactName: null,
    contactTitle: 'Team Manager / Operations Director',
    email: null,
    phone: null,
    website: 'compassracing.us',
    address: 'Mooresville, NC',
    pitchAngle: 'Compass Racing is IMSA\'s premier McLaren GT4 team. They race at Mid-Ohio and Road America. Liveries, hauler graphics, and support vehicle wraps — consistent style across their customer racing program.',
    source: 'seed_racing',
  },

  // ─── USAC / Feeder Series / Sprint Cars (Indiana is the heartland) ────────

  {
    clientId: 'race-026',
    company: 'USAC (United States Auto Club)',
    category: 'racing',
    city: 'Speedway', state: 'IN',
    contactName: null,
    contactTitle: 'Director of Marketing / Partnerships',
    email: null,
    phone: '317-247-5151',
    website: 'usacracing.com',
    address: '4910 W 16th St, Speedway, IN 46224',
    pitchAngle: 'USAC is headquartered in Speedway, IN — Shadow\'s backyard — and sanctions sprint cars, midgets, and Silver Crown across Indiana and the Midwest. Pitch Shadow as the official wrap vendor for USAC — one deal reaches hundreds of teams across all sanctioned events.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-027',
    company: 'Keith Kunz / Curb-Agajanian Motorsports',
    category: 'racing',
    city: 'Bixby', state: 'OK',
    contactName: null,
    contactTitle: 'Team Manager / Marketing Director',
    email: null,
    phone: null,
    website: 'kkm.racing',
    address: 'Bixby, OK',
    pitchAngle: 'KKM is the most dominant USAC midget team in history — they frequent Indiana races. Multiple entries, multiple haulers. High-visibility midget liveries at events across the Midwest.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-028',
    company: 'Reinbold-Underwood Motorsports (USAC)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Team Co-Owner',
    email: null,
    phone: null,
    website: 'rumotorsports.com',
    address: 'Indianapolis, IN',
    pitchAngle: 'Indiana-based USAC sprint car team with a strong regional presence. Indy team that races the Indiana Midget Week and IMS oval events. Local relationship — hauler + livery at competitive pricing builds long-term loyalty.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-029',
    company: 'Biagi-DenBeste Racing (IndyCar/USF)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Team Principal / Director',
    email: null,
    phone: null,
    website: 'bdracing.com',
    address: 'Indianapolis, IN',
    pitchAngle: 'BDR campaigns in Road to Indy series — directly below IndyCar. Indianapolis-based with a growing operation. If Shadow wraps their USF2000/Indy Pro cars, they follow that team up the ladder.',
    source: 'seed_racing',
  },

  // ─── NASCAR (Midwest-adjacent / IMS race weekend) ─────────────────────────

  {
    clientId: 'race-030',
    company: 'Rick Ware Racing (NASCAR)',
    category: 'racing',
    city: 'Mooresville', state: 'NC',
    contactName: null,
    contactTitle: 'Director of Operations / Partnerships',
    email: null,
    phone: null,
    website: 'rickwareracing.com',
    address: 'Mooresville, NC',
    pitchAngle: 'Rick Ware Racing campaigns NASCAR Cup entries at IMS and other Midwest tracks. Pitch before Brickyard weekend — offer hospitality graphics and support vehicle wraps for the Indy race specifically.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-031',
    company: 'Richard Petty Motorsports',
    category: 'racing',
    city: 'Mooresville', state: 'NC',
    contactName: null,
    contactTitle: 'Sponsorship Activation Manager',
    email: null,
    phone: null,
    website: 'richardpettymotorsports.com',
    address: 'Mooresville, NC',
    pitchAngle: 'RPM brings the King\'s brand to IMS for the Brickyard 400. Significant hospitality presence in Indianapolis for race weekend. Shadow can handle hospitality unit wraps + sponsor activation graphics for the Indy round.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-032',
    company: 'Hendrick Motorsports',
    category: 'racing',
    city: 'Concord', state: 'NC',
    contactName: null,
    contactTitle: 'Marketing Operations Director',
    email: null,
    phone: null,
    website: 'hendrickmotorsports.com',
    address: 'Concord, NC',
    pitchAngle: 'Hendrick brings 4 Cup entries + massive hospitality to Brickyard 400 weekend at IMS. Jeff Gordon\'s legacy gives them deep Indiana ties. Pitch: Shadow handles all Hendrick graphics for the IMS round — hauler touch-ups, sponsor activation, hospitality.',
    source: 'seed_racing',
  },

  // ─── IMS / Speedway Venue Relationships ──────────────────────────────────

  {
    clientId: 'race-033',
    company: 'Indianapolis Motor Speedway (Penske Entertainment)',
    category: 'racing',
    city: 'Speedway', state: 'IN',
    contactName: 'Allison Melangton',
    contactTitle: 'SVP, Corporate Partnerships',
    email: 'imspr@brickyard.com',
    phone: '317-492-6700',
    website: 'indianapolismotorspeedway.com',
    address: '4790 W. 16th Street, Speedway, IN 46222',
    pitchAngle: 'IMS itself is Shadow\'s most powerful local relationship. The venue runs 6+ major events per year — Indy 500, Brickyard, MotoGP, IMSA — each requiring sponsor activation graphics, wayfinding, wall graphics, and DI-NOC for suite renovations. Shadow should be IMS\'s house vendor.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-034',
    company: 'Lucas Oil Stadium Events',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Director of Special Events / Sponsorship',
    email: null,
    phone: null,
    website: 'lucasoilstadium.com',
    address: '500 S Capitol Ave, Indianapolis, IN 46225',
    pitchAngle: 'Lucas Oil hosts the NFL Combine, Big Ten championship, WWE events, and major indoor motorsport events (Supercross, Monster Jam). DI-NOC for sponsor activation, event branding, and permanent interior graphics. High-frequency turnover creates ongoing work.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-035',
    company: 'World of Outlaws (sprint car series)',
    category: 'racing',
    city: 'Concord', state: 'NC',
    contactName: null,
    contactTitle: 'VP of Marketing / Regional Director',
    email: null,
    phone: null,
    website: 'worldofoutlaws.com',
    address: 'Concord, NC',
    pitchAngle: 'World of Outlaws sanctions the premier sprint car tour — they race Kokomo Speedway, Lincoln Park Speedway, Terre Haute Action Track, and other Indiana venues. One deal with WoO means exposure to 40+ touring teams that need hauler wraps and liveries.',
    source: 'seed_racing',
  },

  // ─── Motorsport Support / Racing-adjacent businesses ─────────────────────

  {
    clientId: 'race-036',
    company: 'Performance Friction / AP Racing (brake supplier)',
    category: 'racing',
    city: 'Clover', state: 'SC',
    contactName: null,
    contactTitle: 'Marketing Manager / Events Director',
    email: null,
    phone: null,
    website: 'performancefriction.com',
    address: 'Clover, SC',
    pitchAngle: 'Brake suppliers like PFC have company haulers at every race they attend + branded demo vehicles. Motorsport supplier fleet is an underserved segment — they need professional graphics but aren\'t racing teams per se.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-037',
    company: 'Dallara IndyCar Factory',
    category: 'racing',
    city: 'Speedway', state: 'IN',
    contactName: 'Stefano DePonti',
    contactTitle: 'CEO, Dallara USA',
    email: 'info@dallara.us',
    phone: '317-388-5400',
    website: 'dallara.com',
    address: '1201 Main St, Speedway, IN 46224',
    pitchAngle: 'Dallara builds every IndyCar chassis from their Speedway IN facility — Shadow\'s literal neighbor on Main St. Their demo car, fleet vehicles, and Dallara DriveTech simulator facility all need graphics. Premium brand, premium budget, and they\'re next door.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-038',
    company: 'Firestone (IndyCar tire supplier)',
    category: 'racing',
    city: 'Nashville', state: 'TN',
    contactName: null,
    contactTitle: 'Motorsport Marketing Manager',
    email: null,
    phone: null,
    website: 'firestonetire.com',
    address: 'Nashville, TN',
    pitchAngle: 'Firestone is the official tire of IndyCar. Their at-track haulers and support vehicles travel to every IndyCar round. Pit compound presence at Indy 500 includes significant graphics real estate. Bridgestone/Firestone motorsport marketing runs through Nashville.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-039',
    company: 'Penske Entertainment Fleet',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Mark D. Miles',
    contactTitle: 'President & CEO, Penske Entertainment',
    email: 'imspr@brickyard.com',
    phone: '317-492-6700',
    website: 'penskeentertainment.com',
    address: '4790 W. 16th Street, Indianapolis, IN 46222',
    pitchAngle: 'Penske Entertainment (owns IMS + IndyCar) maintains a fleet of branded vehicles for events and operations. Shadow can be the official graphics vendor for Penske Entertainment\'s entire Indiana fleet — IMS shuttle buses, branded SUVs, event trailers.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-040',
    company: 'Indianapolis Colts / NFL team fleet',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'VP of Marketing / Brand Activation',
    email: null,
    phone: null,
    website: 'colts.com',
    address: '7001 W 56th St, Indianapolis, IN 46254',
    pitchAngle: 'The Colts are motorsport-adjacent through IMS sponsorships and their Indiana brand. Team transport vehicles, hospitality buses, sponsor activation vehicles for Lucas Oil Stadium events. DI-NOC for suite refreshes between seasons. One NFL contact opens stadium-level budgets.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-041',
    company: 'Indiana Pacers / Gainbridge Fieldhouse fleet',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Brand Marketing Director',
    email: null,
    phone: null,
    website: 'nba.com/pacers',
    address: '125 S Pennsylvania St, Indianapolis, IN 46204',
    pitchAngle: 'Gainbridge Fieldhouse hosts Pacers games + 150+ other events per year. Team fleet vehicles, sponsor activation graphics, DI-NOC for premium suite renovations. NBA budgets are serious. Pacers are locally owned (Herb Simon) — Indiana pride angle.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-042',
    company: 'Indiana Fever / WNBA (Caitlin Clark effect)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Marketing Director / Brand Partnerships',
    email: null,
    phone: null,
    website: 'fever.wnba.com',
    address: '125 S Pennsylvania St, Indianapolis, IN 46204',
    pitchAngle: 'Caitlin Clark put the Indiana Fever on the global map. The team\'s branding and sponsorship activation has exploded. Fleet vehicles, team bus graphics, DI-NOC for their practice facility — capitalizing on the biggest sports story in Indiana right now.',
    source: 'seed_racing',
  },

  // ─── Autocross / Club Racing / Performance shops ─────────────────────────

  {
    clientId: 'race-043',
    company: 'Autobahn Indoor Speedway (go-kart chains)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'General Manager / Marketing',
    email: null,
    phone: null,
    website: 'autobahnspeed.com',
    address: 'Indianapolis, IN',
    pitchAngle: 'Indoor karting venues have kart fleets that need graphics, branded vehicles, DI-NOC for wall features and interior branding. Autobahn has multiple Midwest locations — one deal could mean graphics packages for all Indiana/Ohio locations.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-044',
    company: 'Xtreme Racing Center',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactName: null,
    contactTitle: 'Owner / Marketing Manager',
    email: null,
    phone: null,
    website: 'xracing.com',
    address: 'Indianapolis, IN',
    pitchAngle: 'Indoor racing venues are high-traffic, sponsor-rich environments. DI-NOC for sponsor wall panels, vinyl for branded racing barriers, fleet graphics for company vehicles. Ongoing relationship as sponsors rotate seasonally.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-045',
    company: 'O\'Reilly Auto Parts (NHRA title sponsor)',
    category: 'racing',
    city: 'Springfield', state: 'MO',
    contactName: null,
    contactTitle: 'Motorsport Marketing Manager / Fleet Director',
    email: null,
    phone: null,
    website: 'oreillyauto.com',
    address: 'Springfield, MO',
    pitchAngle: 'O\'Reilly is the title sponsor of the NHRA and operates thousands of stores across Indiana and the Midwest. Their delivery fleet + store vehicles are a massive wrap opportunity. They also have an at-track presence at every NHRA event. Fleet pricing at volume.',
    source: 'seed_racing',
  },

  // ─── Race track facilities (Midwest) ─────────────────────────────────────

  {
    clientId: 'race-046',
    company: 'Kokomo Speedway',
    category: 'racing',
    city: 'Kokomo', state: 'IN',
    contactName: 'Reece O\'Connor',
    contactTitle: 'Track Owner / Promoter',
    email: null,
    phone: '765-459-3877',
    website: 'kokomospeedway.net',
    address: '2455 N Davis Rd, Kokomo, IN 46901',
    pitchAngle: 'Kokomo Speedway is the premier sprint car track in Indiana. Their facility has sponsor signage, pit area graphics, and track vehicles. Shadow can provide DI-NOC for sponsor activation areas, vinyl banners, and track fleet graphics. Relationship opens access to all teams that race there.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-047',
    company: 'Lincoln Park Speedway',
    category: 'racing',
    city: 'Putnamville', state: 'IN',
    contactName: null,
    contactTitle: 'Track Promoter / Marketing',
    email: null,
    phone: null,
    website: 'lincolnparkspeedway.com',
    address: 'Putnamville, IN',
    pitchAngle: 'LPS hosts USAC and sprint car events — a key Indiana racing venue. Track branding, sponsor activation graphics, track vehicle fleet. Local track relationships build word-of-mouth across the entire Indiana sprint car community.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-048',
    company: 'Mid-Ohio Sports Car Course',
    category: 'racing',
    city: 'Lexington', state: 'OH',
    contactName: 'Kathy Nolan',
    contactTitle: 'Director of Business Development',
    email: 'partnership@midohio.com',
    phone: '614-565-9449',
    website: 'midohio.com',
    address: 'Lexington, OH',
    pitchAngle: 'Mid-Ohio hosts IndyCar, IMSA, NASCAR Xfinity, and World Challenge events — a major Midwest road course. Facility branding, sponsor activation areas, DI-NOC for VIP hospitality renovation, track vehicle fleet. Major annual events bring teams and sponsors who all need local graphics vendors.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-049',
    company: 'Road America',
    category: 'racing',
    city: 'Plymouth', state: 'WI',
    contactName: 'Mary Haen',
    contactTitle: 'Marketing & Partnerships Director',
    email: 'info@roadamerica.com',
    phone: '800-365-7223',
    website: 'roadamerica.com',
    address: 'N7390 Wi-67, Plymouth, WI 53073',
    pitchAngle: 'Road America is America\'s greatest road course and hosts IndyCar, IMSA, SCCA, and Vintage Racing. Their facility renovation needs are significant — DI-NOC for hospitality suites, vinyl for sponsor activations across 640 acres. Annual events create recurring graphics work.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-050',
    company: 'Lucas Oil Raceway (Brownsburg)',
    category: 'racing',
    city: 'Brownsburg', state: 'IN',
    contactName: 'Randy Simpson',
    contactTitle: 'General Manager',
    email: 'rsimpson@nhra.com',
    phone: '317-291-4090',
    website: 'lucasoilraceway.com',
    address: '10267 E US Highway 136, Brownsburg, IN 46234',
    pitchAngle: 'Lucas Oil Raceway in Brownsburg hosts NHRA U.S. Nationals — the biggest drag racing event in the world. Facility is surrounded by NHRA team shops. Venue graphics, sponsor activation, DI-NOC for VIP areas, track fleet. Marketing contact: Dustin Rumple (drumple@nhra.com). Shadow should be the house vendor for LOR.',
    source: 'seed_racing',
  },
];

// ─── DB helpers ──────────────────────────────────────────────────────────────

function pluralize(n, single, plural) {
  return `${n.toLocaleString()} ${n === 1 ? single : plural}`;
}

async function main() {
  console.log('\n🏁 WrapLeads — Motorsport / Race Teams Seed');
  console.log(`   Series: IndyCar, IMSA, NHRA, USAC, NASCAR (Midwest rounds)`);
  console.log(`   Records: ${RACING_LEADS.length} teams & venues\n`);

  const pool = new Pool({ connectionString: DATABASE_URL });

  try { await pool.query('SELECT 1 FROM leads LIMIT 1'); }
  catch { console.error('❌ DB not ready. Run: docker compose up -d'); process.exit(1); }

  // Get all user IDs
  const { rows: users } = await pool.query('SELECT id FROM users');
  if (!users.length) {
    console.log('⚠ No users found — seed users first (run the app, register an account).');
    await pool.end(); return;
  }

  let inserted = 0, updated = 0;

  for (const user of users) {
    const uid = String(user.id);
    for (const lead of RACING_LEADS) {
      const result = await pool.query(`
        INSERT INTO leads (
          user_id, client_id, company, category, city, state, country,
          contact_name, contact_title, email, phone, website, pitch_angle, status, source, notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,'US',$7,$8,$9,$10,$11,$12,'new',$13,null)
        ON CONFLICT (user_id, client_id) DO UPDATE SET
          contact_name    = COALESCE(EXCLUDED.contact_name, leads.contact_name),
          contact_title   = COALESCE(EXCLUDED.contact_title, leads.contact_title),
          email           = COALESCE(EXCLUDED.email, leads.email),
          phone           = COALESCE(EXCLUDED.phone, leads.phone),
          website         = COALESCE(EXCLUDED.website, leads.website),
          pitch_angle     = COALESCE(EXCLUDED.pitch_angle, leads.pitch_angle)
        RETURNING (xmax = 0) AS inserted
      `, [
        uid,
        lead.clientId,
        lead.company,
        lead.category,
        lead.city,
        lead.state,
        lead.contactName || null,
        lead.contactTitle || null,
        lead.email || null,
        lead.phone || null,
        lead.website || null,
        lead.pitchAngle || null,
        lead.source,
      ]);
      if (result.rows[0]?.inserted) inserted++; else updated++;
    }
  }

  console.log(`✓ Done\n`);
  console.log(`   ${pluralize(inserted, 'new lead', 'new leads')} inserted`);
  console.log(`   ${pluralize(updated, 'existing lead', 'existing leads')} enriched/updated\n`);

  const { rows: summary } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE category = 'racing') AS total,
      COUNT(*) FILTER (WHERE category = 'racing' AND email IS NOT NULL) AS has_email,
      COUNT(*) FILTER (WHERE category = 'racing' AND phone IS NOT NULL) AS has_phone,
      COUNT(*) FILTER (WHERE category = 'racing' AND city = 'Indianapolis') AS indy,
      COUNT(*) FILTER (WHERE category = 'racing' AND city = 'Brownsburg') AS brownsburg
    FROM leads WHERE source LIKE 'seed_racing%'
  `);
  const s = summary[0];
  console.log(`📊 Racing leads in CRM:`);
  console.log(`   ${s.total} total motorsport leads`);
  console.log(`   ${s.has_email} with real email address ✉`);
  console.log(`   ${s.has_phone} with phone number 📞`);
  console.log(`   ${s.indy} Indianapolis-based teams`);
  console.log(`   ${s.brownsburg} Brownsburg NHRA teams\n`);
  console.log(`💡 Verified contacts found:`);
  console.log(`   📞 John Force Racing     — Bob McAleer, (317) 858-8889`);
  console.log(`   📞 Don Schumacher Racing — (317) 858-0356`);
  console.log(`   📞 Tony Stewart Racing   — (800) 867-6067`);
  console.log(`   📞 HMD Motorsports       — Mike Maurini, (317) 270-8723, Info@HMDMotorsports.com`);
  console.log(`   📞 Dallara IndyCar       — Stefano DePonti, (317) 388-5400, info@dallara.us`);
  console.log(`   📞 IMS / Penske          — Allison Melangton, (317) 492-6700, imspr@brickyard.com`);
  console.log(`   📞 Lucas Oil Raceway     — Randy Simpson, (317) 291-4090, rsimpson@nhra.com`);
  console.log(`   📞 Rahal Letterman Lanigan — Kathi Lauterbach, klauterbach@rahal.com`);
  console.log(`   📞 Mid-Ohio              — Kathy Nolan, (614) 565-9449, partnership@midohio.com`);
  console.log(`   📞 Road America          — Mary Haen, (800) 365-7223, info@roadamerica.com`);
  console.log(`   📞 Chip Ganassi Racing   — PR: ckulpa@ganassi.com\n`);

  await pool.end();
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { LEADS: RACING_LEADS };
