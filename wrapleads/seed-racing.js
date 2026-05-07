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
 * Safe to re-run — ON CONFLICT (user_id, client_id) DO NOTHING
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
    contactTitle: 'Director of Marketing / Partnerships',
    website: 'andrettiglobal.com',
    pitchAngle: 'Andretti runs 6 IndyCar entries + an Indy Lights program + Formula E — that\'s haulers, race cars, support vans, and hospitality units across multiple series simultaneously. They\'re 10 minutes from us. Full season livery + hauler package, turnkey.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-002',
    company: 'Chip Ganassi Racing',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'VP of Marketing / Sponsorship Activation',
    website: 'ganassiracing.com',
    pitchAngle: 'CGR operates IndyCar + IMSA + NASCAR programs from Indy and Charlotte. Multiple 53\' haulers, 4+ IndyCar liveries per season, IMSA GTD Pro entries — season-long wrap contract opportunity across all properties.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-003',
    company: 'Arrow McLaren',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Head of Operations / Marketing Manager',
    website: 'arrowmclaren.com',
    pitchAngle: 'Arrow McLaren is backed by McLaren Group and runs 3–4 IndyCar entries including Pato O\'Ward and Alex Palou. Their haulers and liveries change sponsor graphics multiple times per season — high-frequency wrap work.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-004',
    company: 'Rahal Letterman Lanigan Racing',
    category: 'racing',
    city: 'Hilliard', state: 'OH',
    contactTitle: 'Team Manager / Marketing Director',
    website: 'rahal.com',
    pitchAngle: 'RLL runs IndyCar + IMSA BMW entries out of their Hilliard OH shop — Columbus metro, well within our range. Bobby Rahal is personally invested in presentation quality. Hauler + race livery + IMSA GT3 entries.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-005',
    company: 'Ed Carpenter Racing',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Team Owner / Director of Partnerships',
    website: 'edcarpenterracing.com',
    pitchAngle: 'Ed Carpenter Racing is a homegrown Indiana team — Ed is from Indy. 2-car IndyCar operation with Rinus VeeKay. Relationship-first sale: we\'re Indiana locals supporting an Indiana team. Hauler + liveries + support fleet.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-006',
    company: 'Dreyer & Reinbold Racing',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Team Manager',
    website: 'drrindycar.com',
    pitchAngle: 'DRR is an Indy-based IndyCar team that campaigns at least 2 entries per season including the Indianapolis 500. Their hauler is a major asset at IMS — maximum exposure. Local team, local vendor relationship.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-007',
    company: 'Juncos Hollinger Racing',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Team Principal / Operations Director',
    website: 'juncoshollinger.com',
    pitchAngle: 'Growing IndyCar team based in Indianapolis running Callum Ilott. New team building their brand identity — opportunity to establish Shadow as their long-term wrap vendor for liveries, hauler, and hospitality as they expand.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-008',
    company: 'Meyer Shank Racing',
    category: 'racing',
    city: 'Pataskala', state: 'OH',
    contactTitle: 'President / Director of Marketing',
    website: 'meyershankracing.com',
    pitchAngle: 'MSR runs IndyCar + IMSA from Pataskala OH (Columbus metro). They won Le Mans 2023. Mike Shank is a craftsman — quality matters to him. Dual-series operation means multiple haulers, cars, and support vehicles year-round.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-009',
    company: 'A.J. Foyt Enterprises',
    category: 'racing',
    city: 'Speedway', state: 'IN',
    contactTitle: 'Director of Operations / Partnerships',
    website: 'ajfoyt.com',
    pitchAngle: 'AJ Foyt Enterprises maintains a significant presence in Speedway, IN — they\'re essentially neighbors. The most storied name in American open-wheel racing. Hauler wraps + liveries. A Foyt relationship is a calling card for every other racing team.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-010',
    company: 'Dale Coyne Racing',
    category: 'racing',
    city: 'Plainfield', state: 'IL',
    contactTitle: 'Team Manager',
    website: 'dalecoyne.com',
    pitchAngle: 'Dale Coyne Racing is based in Plainfield IL (Chicago suburbs) and has been in IndyCar for 40 years. Budget-conscious team that appreciates local vendors. Strong fit for hauler and support vehicle wraps.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-011',
    company: 'HMD Motorsports',
    category: 'racing',
    city: 'Brownsburg', state: 'IN',
    contactTitle: 'Team Principal / Marketing Director',
    website: 'hmdmotorsports.com',
    pitchAngle: 'HMD runs the Indy Lights feeder series and is based in Brownsburg — NHRA country, right next to Shadow. Indy Lights teams need cost-effective livery solutions. Entry point into the entire IndyCar feeder ladder.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012',
    company: 'Prema Racing (IndyCar program)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'IndyCar Program Director',
    website: 'prema.com',
    pitchAngle: 'Prema is a European powerhouse expanding into IndyCar. Their US operation is based in Indianapolis. European teams often look for local vendors to handle US-spec graphics — Shadow can be their American wrap partner.',
    source: 'seed_racing',
  },

  // ─── Indy NXT / Road to Indy (feeder ladder — mostly Indy-based) ────────────

  {
    clientId: 'race-012b',
    company: 'Cape Motorsports (Indy NXT)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Team Principal / Operations Manager',
    website: 'capemotorsports.com',
    pitchAngle: 'Cape Motorsports runs multiple Indy NXT entries and is based in Indianapolis. Road to Indy teams run 15+ race weekends per year — liveries change with sponsors throughout the season. Consistent, repeatable wrap work. Entry point into the entire Road to Indy paddock.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012c',
    company: 'Abel Motorsports (Indy NXT)',
    category: 'racing',
    city: 'Lima', state: 'OH',
    contactTitle: 'Team Owner / Manager',
    website: 'abelmotorsports.com',
    pitchAngle: 'Abel Motorsports races Indy NXT and USF Pro 2000 from Lima OH — well within Shadow\'s range. Midwest-based team that prefers local vendors. Liveries, hauler graphics, and transporter wraps at Road to Indy pricing.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012d',
    company: 'Exclusive Autosport (Indy NXT / USF Pro)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Team Principal / Marketing Director',
    website: 'exclusiveautosport.com',
    pitchAngle: 'Exclusive Autosport runs cars at multiple Road to Indy levels from their Indianapolis shop. Multi-entry operation means multiple liveries per season. Indy-based — same-day service is possible. Build the relationship now while they\'re in the feeder series.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012e',
    company: 'Carlin (US Road to Indy program)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'US Operations Manager / Marketing',
    website: 'carlinmotorsport.com',
    pitchAngle: 'Carlin is a major international racing brand (F2, F3, IndyCar, Road to Indy) with a US base in Indianapolis. Their European team often needs American vendors for US rounds. Shadow can be Carlin\'s stateside wrap partner across IndyCar and Road to Indy.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012f',
    company: 'Andretti Autosport (Road to Indy program)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Road to Indy Program Director',
    website: 'andrettiautosport.com',
    pitchAngle: 'Andretti runs Indy NXT + Indy Pro 2000 + USF 2000 as their full development ladder — all from Indianapolis. They\'re already in the seed list for IndyCar (Andretti Global). One contact covers the entire Andretti racing operation: IndyCar, Indy NXT, Formula E, and Extreme E.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012g',
    company: 'Telcel Mexican Industries (Indy NXT)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Team Manager / Commercial Director',
    website: 'telcelracing.com',
    pitchAngle: 'Telcel races Indy NXT and has strong sponsor backing from Mexico\'s largest telecom. Their liveries are vibrant and sponsor-critical — quality wrap work is non-negotiable. Indianapolis-based operation with a budget to match their sponsorship level.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-012h',
    company: 'Road to Indy Presented by Cooper Tires (series office)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Series Director / Marketing VP',
    website: 'roadtoindy.com',
    pitchAngle: 'The Road to Indy series office is in Indianapolis and manages relationships with ALL teams across Indy NXT, USF Pro 2000, and USF 2000. One deal with the series as their preferred vendor gets Shadow introduced to every team on the ladder — 30+ teams across 3 series.',
    source: 'seed_racing',
  },

  // ─── NHRA Teams (Brownsburg, IN — the NHRA capital of the world) ──────────

  {
    clientId: 'race-013',
    company: 'John Force Racing',
    category: 'racing',
    city: 'Brownsburg', state: 'IN',
    contactTitle: 'Director of Operations / Marketing VP',
    website: 'johnforceracing.com',
    pitchAngle: 'John Force Racing is THE name in NHRA — 4 Funny Car entries, John Force himself, Robert Hight, Brittany Force, Austin Prock. They\'re in Brownsburg, 15 minutes from Shadow. Multiple 53\' haulers, 4 full-season livery programs, hospitality, support fleet. This is a $200K+ annual relationship.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-014',
    company: 'Don Schumacher Racing (DSR)',
    category: 'racing',
    city: 'Brownsburg', state: 'IN',
    contactTitle: 'CEO / Director of Partnerships',
    website: 'schumacherracing.com',
    pitchAngle: 'DSR is NHRA\'s biggest multi-car operation: Matt Hagan, Jack Beckman, Leah Pruett, Ron Capps (formerly). Based in Brownsburg with a massive facility. Their haulers and liveries are premium-grade. Shadow can own the DSR relationship — they\'re literally neighbors.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-015',
    company: 'Tony Stewart Racing (Drag)',
    category: 'racing',
    city: 'Brownsburg', state: 'IN',
    contactTitle: 'Team Director / Operations Manager',
    website: 'tonystewartracing.com',
    pitchAngle: 'Tony Stewart Racing runs Top Fuel + Funny Car out of Brownsburg. Tony is the most recognizable name in American motorsport — his team\'s presentation standards are elite. Hauler wraps + liveries + TSR hospitality graphics. High-profile, high-budget.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-016',
    company: 'Ron Capps Motorsports',
    category: 'racing',
    city: 'Brownsburg', state: 'IN',
    contactTitle: 'Team Owner / Marketing Director',
    website: 'roncapps.com',
    pitchAngle: 'Ron Capps runs his own NHRA Funny Car team after splitting from DSR. Brownsburg-based. New team establishing their vendor relationships — perfect timing to land Shadow as their wrap shop. Full livery + hauler program.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-017',
    company: 'Kalitta Motorsports',
    category: 'racing',
    city: 'Ypsilanti', state: 'MI',
    contactTitle: 'VP of Operations / Sponsorship Director',
    website: 'kallittamotorsports.com',
    pitchAngle: 'Kalitta runs Top Fuel + Funny Car from Ypsilanti MI (Ann Arbor area). Connie Kalitta\'s operation is one of NHRA\'s elite teams. They travel to IMS for the US Nationals every year — relationship building opportunity at their biggest race.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-018',
    company: 'Hendrick Motorsports (NHRA connection)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Motorsport Partnerships Manager',
    website: 'hendrickmotorsports.com',
    pitchAngle: 'Hendrick Motorsports has NHRA ties through NAPA and Hendrick Chevy dealers. Their Indy-area dealer network activates at IMS events. Fleet wrap opportunity across the entire Hendrick dealer group + motorsport hospitality vehicles.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-019',
    company: 'Cruz Pedregon Racing',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Team Owner / Marketing Director',
    website: 'cruzpedregon.com',
    pitchAngle: 'Cruz Pedregon runs NHRA Funny Car and keeps operations near Indianapolis. Two-time NHRA Funny Car champion. Boutique team that values relationships with quality vendors. Hauler + livery + support vehicle program.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-020',
    company: 'Funny Car Chaos (NHRA independent)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Series Director / Marketing',
    website: 'funnycar-chaos.com',
    pitchAngle: 'Funny Car Chaos is an independent NHRA support series with 40+ teams at Indy events. Lower-budget but high volume — multiple teams needing cost-effective hauler wraps and liveries. One pitch to the series director reaches all teams.',
    source: 'seed_racing',
  },

  // ─── IMSA Teams ───────────────────────────────────────────────────────────

  {
    clientId: 'race-021',
    company: 'Corvette Racing (GM Motorsports)',
    category: 'racing',
    city: 'Bowling Green', state: 'KY',
    contactTitle: 'Motorsport Marketing Manager',
    website: 'corvetteracing.com',
    pitchAngle: 'Corvette Racing is GM\'s factory IMSA GTD Pro program, based in Bowling Green KY (in our coverage area). They run 2+ C8.R entries with full manufacturer backing. Premium budget, elite presentation standards. Hauler + livery + support fleet program.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-022',
    company: 'Gradient Racing (IMSA)',
    category: 'racing',
    city: 'South Bend', state: 'IN',
    contactTitle: 'Team Manager / Operations Director',
    website: 'gradientracing.com',
    pitchAngle: 'Gradient Racing runs IMSA Pilot Challenge from South Bend IN — an Indiana team in our backyard. Local pride angle: support Indiana motorsport. GT4 class with multiple entries. Hauler + liveries + team vehicles.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-023',
    company: 'Turner Motorsports (IMSA)',
    category: 'racing',
    city: 'Townsend', state: 'GA',
    contactTitle: 'Team Principal / Marketing Director',
    website: 'turnermotorsports.com',
    pitchAngle: 'Turner Motorsports runs IMSA GTD BMW entries and travels to Mid-Ohio, Road America (both within delivery range). Reach out before Midwest rounds — offer to handle all graphics for the Midwest leg of the season.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-024',
    company: 'Pfaff Motorsports (IMSA GTD Pro)',
    category: 'racing',
    city: 'Toronto', state: 'ON',
    contactTitle: 'Director of Motorsport / Partnerships VP',
    website: 'pfaffmotorsports.com',
    pitchAngle: 'Pfaff won the GTD Pro championship with Porsche. They run US rounds including Mid-Ohio and Road Atlanta. Canadian team looking for US vendor relationships — pitch Shadow as their stateside wrap shop for hauler + livery touch-ups between rounds.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-025',
    company: 'Compass Racing (IMSA)',
    category: 'racing',
    city: 'Mooresville', state: 'NC',
    contactTitle: 'Team Manager / Operations Director',
    website: 'compassracing.us',
    pitchAngle: 'Compass Racing is IMSA\'s premier McLaren GT4 team. They race at Mid-Ohio and Road America. Liveries, hauler graphics, and support vehicle wraps — consistent style across their customer racing program.',
    source: 'seed_racing',
  },

  // ─── USAC / Feeder Series / Sprint Cars (Indiana is the heartland) ────────

  {
    clientId: 'race-026',
    company: 'USAC (United States Auto Club)',
    category: 'racing',
    city: 'Speedway', state: 'IN',
    contactTitle: 'Director of Marketing / Partnerships',
    website: 'usacracing.com',
    pitchAngle: 'USAC is headquartered in Speedway, IN and sanctions sprint cars, midgets, and Silver Crown across Indiana and the Midwest. Pitch Shadow as the official wrap vendor for USAC — one deal reaches hundreds of teams across all sanctioned events.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-027',
    company: 'Keith Kunz / Curb-Agajanian Motorsports',
    category: 'racing',
    city: 'Bixby', state: 'OK',
    contactTitle: 'Team Manager / Marketing Director',
    website: 'kkm.racing',
    pitchAngle: 'KKM is the most dominant USAC midget team in history — they frequent Indiana races including the Chili Bowl Nationals prep events. Multiple entries, multiple haulers. High-visibility midget liveries at events across the Midwest.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-028',
    company: 'Reinbold-Underwood Motorsports (USAC)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Team Co-Owner',
    website: 'rumotorsports.com',
    pitchAngle: 'Indiana-based USAC sprint car team with a strong regional presence. Indy team that races the Indiana Midget Week and IMS oval events. Local relationship — hauler + livery at competitive pricing builds long-term loyalty.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-029',
    company: 'Biagi-DenBeste Racing (IndyCar/USF)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Team Principal / Director',
    website: 'bdracing.com',
    pitchAngle: 'BDR campaigns in Road to Indy series — directly below IndyCar. Indianapolis-based with a growing operation. Entry point into the IndyCar ecosystem: if Shadow wraps their USF2000/Indy Pro cars, they follow that team up the ladder.',
    source: 'seed_racing',
  },

  // ─── NASCAR (Midwest-adjacent / IMS race weekend) ─────────────────────────

  {
    clientId: 'race-030',
    company: 'Rick Ware Racing (NASCAR)',
    category: 'racing',
    city: 'Mooresville', state: 'NC',
    contactTitle: 'Director of Operations / Partnerships',
    website: 'rickwareracing.com',
    pitchAngle: 'Rick Ware Racing campaigns NASCAR Cup entries at IMS and other Midwest tracks. They also run the Brickyard 400. Pitch before Brickyard weekend — offer hospitality graphics and support vehicle wraps for the Indy race specifically.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-031',
    company: 'Richard Petty Motorsports',
    category: 'racing',
    city: 'Mooresville', state: 'NC',
    contactTitle: 'Sponsorship Activation Manager',
    website: 'richardpettymotorsports.com',
    pitchAngle: 'RPM brings the King\'s brand to IMS for the Brickyard 400. Significant hospitality presence in Indianapolis for race weekend. Shadow can handle hospitality unit wraps + sponsor activation graphics for the Indy round.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-032',
    company: 'Hendrick Motorsports',
    category: 'racing',
    city: 'Concord', state: 'NC',
    contactTitle: 'Marketing Operations Director',
    website: 'hendrickmotorsports.com',
    pitchAngle: 'Hendrick brings 4 Cup entries + massive hospitality to Brickyard 400 weekend at IMS. Jeff Gordon\'s legacy gives them deep Indiana ties. Pitch: Shadow handles all Hendrick graphics for the IMS round — hauler touch-ups, sponsor activation, hospitality.',
    source: 'seed_racing',
  },

  // ─── IMS / Speedway Venue Relationships ──────────────────────────────────

  {
    clientId: 'race-033',
    company: 'Indianapolis Motor Speedway (Penske Entertainment)',
    category: 'racing',
    city: 'Speedway', state: 'IN',
    contactTitle: 'Director of Events / Sponsorship Activation',
    website: 'indianapolismotorspeedway.com',
    pitchAngle: 'IMS itself is Shadow\'s most powerful local relationship. The venue runs 6+ major events per year — Indy 500, Brickyard, MotoGP, IMSA — each requiring sponsor activation graphics, wayfinding, wall graphics, and DI-NOC for suite renovations. Shadow should be IMS\'s house vendor.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-034',
    company: 'Lucas Oil Stadium Events',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Special Events / Sponsorship',
    website: 'lucasoilstadium.com',
    pitchAngle: 'Lucas Oil hosts the NFL Combine, Big Ten championship, WWE events, and major indoor motorsport events (Supercross, Monster Jam). DI-NOC for sponsor activation, event branding, and permanent interior graphics. High-frequency turnover creates ongoing work.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-035',
    company: 'World of Outlaws (sprint car series)',
    category: 'racing',
    city: 'Concord', state: 'NC',
    contactTitle: 'VP of Marketing / Regional Director',
    website: 'worldofoutlaws.com',
    pitchAngle: 'World of Outlaws sanctions the premier sprint car tour — they race Kokomo Speedway, Lincoln Park Speedway, Terre Haute Action Track, and other Indiana venues. One deal with WoO means exposure to 40+ touring teams that need hauler wraps and liveries.',
    source: 'seed_racing',
  },

  // ─── Motorsport Support / Racing-adjacent businesses ─────────────────────

  {
    clientId: 'race-036',
    company: 'Performance Friction / AP Racing (brake supplier)',
    category: 'racing',
    city: 'Clover', state: 'SC',
    contactTitle: 'Marketing Manager / Events Director',
    website: 'performancefriction.com',
    pitchAngle: 'Brake suppliers like PFC have company haulers at every race they attend + branded demo vehicles. Motorsport supplier fleet is an underserved segment — they need professional graphics but aren\'t racing teams per se.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-037',
    company: 'Dallara (IndyCar chassis builder)',
    category: 'racing',
    city: 'Speedway', state: 'IN',
    contactTitle: 'Marketing Director / Events Manager',
    website: 'dallara.com',
    pitchAngle: 'Dallara builds every IndyCar chassis from their Speedway IN facility — they\'re Shadow\'s literal neighbor. Their demo car, fleet vehicles, and Dallara DriveTech simulator facility all need graphics. Premium brand, premium budget, and they\'re next door.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-038',
    company: 'Firestone (IndyCar tire supplier)',
    category: 'racing',
    city: 'Nashville', state: 'TN',
    contactTitle: 'Motorsport Marketing Manager',
    website: 'firestonetire.com',
    pitchAngle: 'Firestone is the official tire of IndyCar. Their at-track haulers and support vehicles travel to every IndyCar round. Pit compound presence at Indy 500 includes significant graphics real estate. Bridgestone/Firestone motorsport marketing runs through Nashville.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-039',
    company: 'Penske Truck Leasing / Penske Entertainment Fleet',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Fleet Manager / Marketing Operations',
    website: 'penskeentertainment.com',
    pitchAngle: 'Penske Entertainment (owns IMS + IndyCar) maintains a fleet of branded vehicles for events and operations. Shadow can be the official graphics vendor for Penske Entertainment\'s entire Indiana fleet — IMS shuttle buses, branded SUVs, event trailers.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-040',
    company: 'Indianapolis Colts / NFL team fleet',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'VP of Marketing / Brand Activation',
    website: 'colts.com',
    pitchAngle: 'The Colts are motorsport-adjacent through IMS sponsorships and their Indiana brand. Team transport vehicles, hospitality buses, sponsor activation vehicles for Lucas Oil Stadium events. DI-NOC for suite refreshes between seasons. One NFL contact opens stadium-level budgets.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-041',
    company: 'Indiana Pacers / Gainbridge Fieldhouse fleet',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Brand Marketing Director',
    website: 'nba.com/pacers',
    pitchAngle: 'Gainbridge Fieldhouse hosts Pacers games + 150+ other events per year. Team fleet vehicles, sponsor activation graphics, DI-NOC for premium suite renovations. NBA budgets are serious. Pacers are locally owned (Herb Simon) — Indiana pride angle.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-042',
    company: 'Indiana Fever / WNBA (Caitlin Clark effect)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Marketing Director / Brand Partnerships',
    website: 'fever.wnba.com',
    pitchAngle: 'Caitlin Clark put the Indiana Fever on the global map. The team\'s branding and sponsorship activation has exploded. Fleet vehicles, team bus graphics, DI-NOC for their practice facility — capitalizing on the biggest sports story in Indiana right now.',
    source: 'seed_racing',
  },

  // ─── Autocross / Club Racing / Performance shops ─────────────────────────

  {
    clientId: 'race-043',
    company: 'Autobahn Indoor Speedway (go-kart chains)',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'General Manager / Marketing',
    website: 'autobahnspeed.com',
    pitchAngle: 'Indoor karting venues have kart fleets that need graphics, branded vehicles, DI-NOC for wall features and interior branding. Autobahn has multiple Midwest locations — one deal could mean graphics packages for all Indiana/Ohio locations.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-044',
    company: 'Xtreme Racing Center',
    category: 'racing',
    city: 'Indianapolis', state: 'IN',
    contactTitle: 'Owner / Marketing Manager',
    website: 'xracing.com',
    pitchAngle: 'Indoor racing venues are high-traffic, sponsor-rich environments. DI-NOC for sponsor wall panels, vinyl for branded racing barriers, fleet graphics for company vehicles. Ongoing relationship as sponsors rotate seasonally.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-045',
    company: 'O\'Reilly Auto Parts (NHRA title sponsor)',
    category: 'racing',
    city: 'Springfield', state: 'MO',
    contactTitle: 'Motorsport Marketing Manager / Fleet Director',
    website: 'oreillyauto.com',
    pitchAngle: 'O\'Reilly is the title sponsor of the NHRA and operates thousands of stores across Indiana and the Midwest. Their delivery fleet + store vehicles are a massive wrap opportunity. They also have an at-track presence at every NHRA event. Fleet pricing at volume.',
    source: 'seed_racing',
  },

  // ─── Race track facilities (Midwest) ─────────────────────────────────────

  {
    clientId: 'race-046',
    company: 'Kokomo Speedway',
    category: 'racing',
    city: 'Kokomo', state: 'IN',
    contactTitle: 'Track Owner / Marketing Director',
    website: 'kokomospeedway.net',
    pitchAngle: 'Kokomo Speedway is the premier sprint car track in Indiana. Their facility has sponsor signage, pit area graphics, and track vehicles. Shadow can provide DI-NOC for sponsor activation areas, vinyl banners, and track fleet graphics. Relationship opens access to all teams that race there.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-047',
    company: 'Lincoln Park Speedway',
    category: 'racing',
    city: 'Putnamville', state: 'IN',
    contactTitle: 'Track Promoter / Marketing',
    website: 'lincolnparkspeedway.com',
    pitchAngle: 'LPS hosts USAC and sprint car events — a key Indiana racing venue. Track branding, sponsor activation graphics, track vehicle fleet. Local track relationships build word-of-mouth across the entire Indiana sprint car community.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-048',
    company: 'Mid-Ohio Sports Car Course',
    category: 'racing',
    city: 'Lexington', state: 'OH',
    contactTitle: 'Director of Marketing / Facility Management',
    website: 'midohio.com',
    pitchAngle: 'Mid-Ohio hosts IndyCar, IMSA, NASCAR Xfinity, and World Challenge events — a major Midwest road course. Facility branding, sponsor activation areas, DI-NOC for VIP hospitality renovation, track vehicle fleet. Major annual events bring teams and sponsors who all need local graphics vendors.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-049',
    company: 'Road America',
    category: 'racing',
    city: 'Elkhart Lake', state: 'WI',
    contactTitle: 'VP of Marketing / Facility Director',
    website: 'roadamerica.com',
    pitchAngle: 'Road America is America\'s greatest road course and hosts IndyCar, IMSA, SCCA, and Vintage Racing. Their facility renovation needs are significant — DI-NOC for hospitality suites, vinyl for sponsor activations across 640 acres. Annual events create recurring graphics work.',
    source: 'seed_racing',
  },
  {
    clientId: 'race-050',
    company: 'Lucas Oil Raceway (Brownsburg)',
    category: 'racing',
    city: 'Brownsburg', state: 'IN',
    contactTitle: 'General Manager / Marketing Director',
    website: 'lucasoilraceway.com',
    pitchAngle: 'Lucas Oil Raceway in Brownsburg hosts NHRA U.S. Nationals — the biggest drag racing event in the world. Facility is surrounded by NHRA team shops. Venue graphics, sponsor activation, DI-NOC for VIP areas, track fleet. Shadow should be the house vendor for LOR.',
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

  let inserted = 0, skipped = 0;

  for (const user of users) {
    const uid = String(user.id);
    for (const lead of RACING_LEADS) {
      const result = await pool.query(`
        INSERT INTO leads (
          user_id, client_id, company, category, city, state, country,
          contact_title, website, pitch_angle, status, source, notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,'US',$7,$8,$9,'new',$10,$11)
        ON CONFLICT (user_id, client_id) DO NOTHING
        RETURNING id
      `, [
        uid,
        lead.clientId,
        lead.company,
        lead.category,
        lead.city,
        lead.state,
        lead.contactTitle || null,
        lead.website || null,
        lead.pitchAngle || null,
        lead.source,
        null,
      ]);
      if (result.rows.length) inserted++; else skipped++;
    }
  }

  console.log(`✓ Done\n`);
  console.log(`   ${pluralize(inserted, 'new lead', 'new leads')} inserted`);
  console.log(`   ${pluralize(skipped, 'existing lead', 'existing leads')} skipped\n`);

  const { rows: summary } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE category = 'racing') AS total,
      COUNT(*) FILTER (WHERE category = 'racing' AND city = 'Indianapolis') AS indy,
      COUNT(*) FILTER (WHERE category = 'racing' AND city = 'Brownsburg') AS brownsburg
    FROM leads WHERE source LIKE 'seed_racing%'
  `);
  const s = summary[0];
  console.log(`📊 Racing leads in CRM:`);
  console.log(`   ${s.total} total motorsport leads`);
  console.log(`   ${s.indy} Indianapolis-based teams`);
  console.log(`   ${s.brownsburg} Brownsburg NHRA teams\n`);
  console.log(`💡 Priority contacts:`);
  console.log(`   🏎  Dallara (Speedway IN — your literal neighbor)`);
  console.log(`   🔥  John Force Racing, DSR, Tony Stewart Racing (Brownsburg — 15 min away)`);
  console.log(`   🏁  IMS / Penske Entertainment (your most powerful local relationship)`);
  console.log(`   🏆  Andretti Global, Chip Ganassi, Arrow McLaren (IndyCar HQs in Indy)\n`);
  console.log(`📈 Revenue profile:`);
  console.log(`   Single 53\' hauler wrap: $15K–$35K`);
  console.log(`   Full team season package: $50K–$150K+`);
  console.log(`   IMS venue relationship: $100K+/year potential\n`);

  await pool.end();
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { LEADS: RACING_LEADS };
