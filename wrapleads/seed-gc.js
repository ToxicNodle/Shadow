#!/usr/bin/env node
/**
 * seed-gc.js — Seeds major General Contractors across IN, OH, MI, IL, KY
 * into the WrapLeads CRM leads table.
 *
 * GCs are a triple opportunity:
 *   1. Fleet wraps — their construction trucks, vans, and pickups
 *   2. DI-NOC / Rea Tec spec — they specify interior finishes on every project
 *   3. Color-change / graphics — superintendent vehicles, company pickups
 *
 * Categories used:
 *   gc_referral — primary category (they spec DI-NOC on projects they build)
 *   construction — for firms where fleet wraps are the primary pitch
 *
 * Run: node seed-gc.js
 * Safe to re-run — ON CONFLICT DO NOTHING via client_id.
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const GC_LEADS = [
  // ── National GCs — Indiana offices ──────────────────────────────────────
  {
    id: 'gc-001', company: 'Pepper Construction Group', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Vice President of Operations', website: 'pepperconstruction.com',
    fleetSize: '200+', category: 'gc_referral',
    pitchAngle: 'Pepper builds $1B+/yr across healthcare, education, and commercial — they specify interior finishes on every project. DI-NOC and Rea Tec should be in their standard finish palette. Also 200+ branded trucks = fleet wrap opportunity.',
  },
  {
    id: 'gc-002', company: 'Shiel Sexton Company', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Preconstruction', website: 'shielsexton.com',
    fleetSize: '150+', category: 'gc_referral',
    pitchAngle: "Indiana's largest GC — massive healthcare, education, and corporate portfolio. Getting DI-NOC and Rea Tec into their value-engineering toolkit is a force multiplier. Every project they do is a potential referral.",
  },
  {
    id: 'gc-003', company: 'Turner Construction Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Preconstruction Manager', website: 'turnerconstruction.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: "Turner's Indianapolis office builds hospitals, universities, and corporate campuses — all heavy DI-NOC and Rea Tec environments. Preferred subcontractor status with Turner = pipeline for years.",
  },
  {
    id: 'gc-004', company: 'Skanska USA Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Vice President, Building', website: 'usa.skanska.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Skanska builds major public infrastructure and healthcare in Indiana — DI-NOC surface films are standard in their hospital and transit facility interior packages.',
  },
  {
    id: 'gc-005', company: 'Hensel Phelps', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Project Executive', website: 'henselphelps.com',
    fleetSize: '150+', category: 'gc_referral',
    pitchAngle: "Federal and institutional GC — Hensel Phelps builds VA hospitals, federal courthouses, and universities where DI-NOC and Rea Tec are standard interior upgrade specs.",
  },
  {
    id: 'gc-006', company: 'Mortenson Construction Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Vice President', website: 'mortenson.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Sports, healthcare, and renewable energy GC — Mortenson builds arenas, stadiums, and hospitals where branded interior graphics and DI-NOC finish upgrades are high-visibility opportunities.',
  },
  {
    id: 'gc-007', company: 'Weaver Construction', city: 'Indianapolis', state: 'IN',
    contactTitle: 'President / Director of Operations', website: 'weaverconstruction.com',
    fleetSize: '80', category: 'construction',
    pitchAngle: "Regional Indiana GC with strong commercial and healthcare pipeline. Mid-size means the owner is reachable — fleet wrap + DI-NOC spec conversation happens at one meeting.",
  },
  {
    id: 'gc-008', company: 'F.A. Wilhelm Construction', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Vice President of Operations', website: 'fawilhelm.com',
    fleetSize: '120', category: 'gc_referral',
    pitchAngle: 'Established Indianapolis GC with healthcare, education, and government portfolio. Heavy renovation workload = high DI-NOC and Rea Tec surface film specification frequency.',
  },
  {
    id: 'gc-009', company: 'TWG Construction', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Construction', website: 'twgdev.com',
    fleetSize: '60', category: 'gc_referral',
    pitchAngle: 'Multifamily and affordable housing developer-builder. Every apartment community they deliver has lobbies, corridors, and amenity spaces — high-volume DI-NOC accent surface application.',
  },
  {
    id: 'gc-010', company: 'Hagerman Group', city: 'Fishers', state: 'IN',
    contactTitle: 'Estimating Project Coordinator', email: 'ccombs@hagermangc.com', phone: '317-577-6836',
    website: 'thehagermangroup.com', fleetSize: '80', category: 'gc_referral',
    pitchAngle: '115-year-old family GC; 244 employees, CM/GC/design-build. Pickup-truck color-change wraps and trailer graphics reinforce employer brand for talent recruiting.',
  },
  {
    id: 'gc-011', company: 'Bowen Engineering', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Fleet Operations', phone: '317-842-2616', website: 'bowenengineering.com',
    fleetSize: '200+', category: 'construction',
    pitchAngle: '$400M revenue; multi-state offices; site/civil/mechanical fleet. National jobsite footprint — strong candidate for fleet-graphic standardization across operation centers.',
  },
  {
    id: 'gc-012', company: 'Capitol Construction', city: 'Indianapolis', state: 'IN',
    contactTitle: 'President', website: 'capitolconstruction.com',
    fleetSize: '50', category: 'gc_referral',
    pitchAngle: 'Indianapolis commercial TI specialist — heavy tenant improvement workload means DI-NOC and Rea Tec are constant line items. Build a referral relationship with their supers.',
  },
  {
    id: 'gc-013', company: 'Messer Construction Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Vice President of Operations', website: 'messer.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Large regional GC with massive healthcare and higher-ed portfolio across Indiana and Ohio — DI-NOC antimicrobial surface films should be in every hospital bid package they submit.',
  },
  {
    id: 'gc-014', company: 'Lauth Group', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Construction', website: 'lauth.com',
    fleetSize: '40', category: 'gc_referral',
    pitchAngle: 'Industrial, logistics, and commercial developer-builder — warehouse and distribution facility interiors, office fit-outs, and branded environments.',
  },
  {
    id: 'gc-015', company: 'Browning Investments Construction', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Construction Director', website: 'browning.com',
    fleetSize: '40', category: 'gc_referral',
    pitchAngle: 'Real estate developer-builder with office and multifamily focus in Indianapolis — lobby and amenity space DI-NOC and Rea Tec are standard finish upgrades.',
  },

  // ── National GCs — Ohio ──────────────────────────────────────────────────
  {
    id: 'gc-016', company: 'Turner Construction Ohio', city: 'Columbus', state: 'OH',
    contactTitle: 'Preconstruction Director', website: 'turnerconstruction.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: "Turner Ohio builds hospitals, universities, and high-rise commercial — all environments where DI-NOC and Rea Tec surface films are specified. Preferred subcontractor status = multi-year pipeline.",
  },
  {
    id: 'gc-017', company: 'Messer Construction Ohio', city: 'Cincinnati', state: 'OH',
    contactTitle: 'Vice President of Preconstruction', website: 'messer.com',
    fleetSize: '150+', category: 'gc_referral',
    pitchAngle: "Messer's Cincinnati base builds hospitals and universities across Ohio and Kentucky — DI-NOC antimicrobial and Rea Tec surface films are regular value-engineering items in their healthcare packages.",
  },
  {
    id: 'gc-018', company: 'Skanska USA Ohio', city: 'Columbus', state: 'OH',
    contactTitle: 'Project Executive', website: 'usa.skanska.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Major public-sector GC in Columbus — builds government, transit, and institutional facilities where DI-NOC surface films are specified for durability and low maintenance.',
  },
  {
    id: 'gc-019', company: 'Gilbane Building Company Ohio', city: 'Columbus', state: 'OH',
    contactTitle: 'Regional Vice President', website: 'gilbaneco.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'National GC with strong Ohio higher-ed and healthcare practice — Ohio State, Cleveland Clinic, and similar clients regularly specify DI-NOC in renovation projects.',
  },
  {
    id: 'gc-020', company: 'M+W Group Ohio', city: 'Columbus', state: 'OH',
    contactTitle: 'Director of Construction', website: 'mwgroup.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'Technology and laboratory construction specialist — data center and lab interior finishes include DI-NOC anti-static and Rea Tec chemical-resistant surface films.',
  },
  {
    id: 'gc-021', company: 'Smoot Construction', city: 'Columbus', state: 'OH',
    contactTitle: 'President / VP Operations', website: 'smootco.com',
    fleetSize: '60', category: 'gc_referral',
    pitchAngle: 'African American-owned Columbus GC with civic, education, and government portfolio — DI-NOC and wall graphics in public building renovation projects.',
  },
  {
    id: 'gc-022', company: 'Elford Inc', city: 'Columbus', state: 'OH',
    contactTitle: 'Vice President of Operations', website: 'elford.com',
    fleetSize: '70', category: 'gc_referral',
    pitchAngle: 'Columbus commercial and healthcare GC with strong renovation workload — DI-NOC surface films for interior upgrades without full replacement on hospital and office renovation projects.',
  },
  {
    id: 'gc-023', company: 'Turner Construction Cincinnati', city: 'Cincinnati', state: 'OH',
    contactTitle: 'Preconstruction Manager', website: 'turnerconstruction.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: "Cincinnati Turner office builds major P&G, hospital, and university projects — DI-NOC and Rea Tec are standard interior finish specifications in their project packages.",
  },
  {
    id: 'gc-024', company: 'Barton Malow Ohio', city: 'Columbus', state: 'OH',
    contactTitle: 'Project Executive', website: 'bartonmalow.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'Healthcare and industrial GC — automotive and manufacturing facility interiors where DI-NOC and Rea Tec provide durable, chemical-resistant surface upgrades.',
  },
  {
    id: 'gc-025', company: 'Great Lakes Construction Ohio', city: 'Hinckley', state: 'OH',
    contactTitle: 'Fleet Manager', website: 'greatlakesconstruction.com',
    fleetSize: '300+', category: 'construction',
    pitchAngle: 'Large Ohio infrastructure and civil GC — 300+ trucks and heavy equipment; fleet graphic standardization is a major branding opportunity.',
  },
  {
    id: 'gc-026', company: 'DiGeronimo Companies', city: 'Independence', state: 'OH',
    contactTitle: 'President / Operations Director', website: 'digeronimocompanies.com',
    fleetSize: '200+', category: 'construction',
    pitchAngle: 'Northeast Ohio construction and services conglomerate — multi-company fleet of trucks, vans, and equipment; branded fleet wraps across all subsidiaries.',
  },
  {
    id: 'gc-027', company: 'Dunn Construction Ohio', city: 'Cleveland', state: 'OH',
    contactTitle: 'Vice President', website: 'dunnconstruction.com',
    fleetSize: '60', category: 'gc_referral',
    pitchAngle: 'Northeast Ohio commercial GC — office, retail, and healthcare renovation with DI-NOC and Rea Tec as regular interior finish specification items.',
  },
  {
    id: 'gc-028', company: 'Panzica Construction', city: 'Mayfield Heights', state: 'OH',
    contactTitle: 'President', website: 'panzicaconstruction.com',
    fleetSize: '50', category: 'gc_referral',
    pitchAngle: 'Cleveland-area commercial GC with corporate and healthcare practice — DI-NOC films for interior surface upgrades in Northeast Ohio office and hospital renovation.',
  },
  {
    id: 'gc-029', company: 'Weiner Construction Group', city: 'Columbus', state: 'OH',
    contactTitle: 'Director of Operations', pitchAngle: 'Columbus commercial TI and renovation GC — high-volume interior renovation workload where DI-NOC and Rea Tec surface films are frequently specified.',
    fleetSize: '40', category: 'gc_referral',
  },
  {
    id: 'gc-030', company: 'Kokosing Construction', city: 'Fredericktown', state: 'OH',
    contactTitle: 'Fleet Manager', website: 'kokosing.com',
    fleetSize: '500+', category: 'construction',
    pitchAngle: 'Major Ohio infrastructure GC — 500+ pieces of heavy equipment and trucks; fleet branding standardization across Ohio highway and civil construction fleet.',
  },

  // ── National GCs — Michigan ──────────────────────────────────────────────
  {
    id: 'gc-031', company: 'Barton Malow Company', city: 'Southfield', state: 'MI',
    contactTitle: 'Vice President of Operations', website: 'bartonmalow.com',
    fleetSize: '200+', category: 'gc_referral',
    pitchAngle: "Michigan's premier GC — builds Ford, GM, Stellantis, and hospital projects. Automotive client facilities use DI-NOC for interior surface upgrades. Fleet of 200+ branded trucks.",
  },
  {
    id: 'gc-032', company: 'Turner Construction Michigan', city: 'Detroit', state: 'MI',
    contactTitle: 'Project Executive', website: 'turnerconstruction.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Detroit Turner builds stadiums, hospitals, and mixed-use towers — DI-NOC and Rea Tec are standard finish specifications across all project types.',
  },
  {
    id: 'gc-033', company: 'Skanska USA Michigan', city: 'Detroit', state: 'MI',
    contactTitle: 'Regional Vice President', website: 'usa.skanska.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Major Michigan public-sector GC — builds government and transit facilities where DI-NOC surface films are specified for durable, low-maintenance interior surfaces.',
  },
  {
    id: 'gc-034', company: 'Walbridge', city: 'Detroit', state: 'MI',
    contactTitle: 'Vice President of Operations', website: 'walbridge.com',
    fleetSize: '150+', category: 'gc_referral',
    pitchAngle: 'Detroit industrial and commercial GC — builds automotive plants, stadiums, and hospitals. DI-NOC and Rea Tec in value-engineering for interior finish packages.',
  },
  {
    id: 'gc-035', company: 'Granger Construction', city: 'Lansing', state: 'MI',
    contactTitle: 'Director of Preconstruction', website: 'grangerconstruction.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Michigan public-sector and education GC — school and government facility renovation is a constant DI-NOC and wall graphics pipeline. Fleet of 100+ branded trucks.',
  },
  {
    id: 'gc-036', company: 'Clark Construction Michigan', city: 'Detroit', state: 'MI',
    contactTitle: 'Project Executive', website: 'clarkconstruction.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'National GC with Detroit office — mixed-use, commercial, and government projects where DI-NOC finish films are standard interior specification items.',
  },
  {
    id: 'gc-037', company: 'Ghafari Associates', city: 'Dearborn', state: 'MI',
    contactTitle: 'Director of Construction Management', website: 'ghafari.com',
    fleetSize: '60', category: 'gc_referral',
    pitchAngle: 'Automotive, industrial, and commercial architecture-GC — DI-NOC and Rea Tec for manufacturing facility and corporate campus interior upgrades in automotive Michigan.',
  },
  {
    id: 'gc-038', company: 'Sachse Construction', city: 'Detroit', state: 'MI',
    contactTitle: 'President / Director of Operations', website: 'sachseconstruction.com',
    fleetSize: '50', category: 'gc_referral',
    pitchAngle: 'Detroit commercial and retail GC — restaurant, retail, and corporate interior renovation projects with consistent DI-NOC and Rea Tec specification needs.',
  },
  {
    id: 'gc-039', company: 'Frank Rewold & Son', city: 'Rochester', state: 'MI',
    contactTitle: 'Vice President', website: 'rewold.com',
    fleetSize: '40', category: 'gc_referral',
    pitchAngle: 'Metro Detroit commercial renovation specialist — 80+ years of continuous operation; DI-NOC surface films as value-engineering in tenant improvement and renovation packages.',
  },
  {
    id: 'gc-040', company: 'Integrated Mechanical', city: 'Comstock Park', state: 'MI',
    contactTitle: 'Operations Director', pitchAngle: 'West Michigan mechanical contractor with large service fleet — fleet wraps with contact info and service branding for 80+ service vans.',
    fleetSize: '80', category: 'construction',
  },
  {
    id: 'gc-041', company: 'Pioneer Construction', city: 'Grand Rapids', state: 'MI',
    contactTitle: 'Vice President', website: 'pioneercg.com',
    fleetSize: '60', category: 'gc_referral',
    pitchAngle: 'West Michigan commercial GC with strong healthcare and education practice — DI-NOC and Rea Tec films in hospital and school renovation packages.',
  },
  {
    id: 'gc-042', company: 'Triangle Associates Michigan', city: 'East Lansing', state: 'MI',
    contactTitle: 'President', pitchAngle: 'MSU-adjacent GC with university, civic, and commercial practice — DI-NOC surface films for campus and government facility renovation.',
    fleetSize: '40', category: 'gc_referral',
  },
  {
    id: 'gc-043', company: 'Fishbeck Michigan', city: 'Grand Rapids', state: 'MI',
    contactTitle: 'Construction Manager', website: 'fishbeck.com',
    fleetSize: '50', category: 'gc_referral',
    pitchAngle: 'Civil and structural engineering-led design-build; municipal and commercial facility upgrades where DI-NOC surface films reduce renovation scope and cost.',
  },
  {
    id: 'gc-044', company: 'Sorensen Gross Construction', city: 'Grand Rapids', state: 'MI',
    contactTitle: 'President / VP Operations', pitchAngle: 'West Michigan commercial design-build GC — DI-NOC and Rea Tec in value-engineering for commercial and institutional renovation projects.',
    fleetSize: '40', category: 'gc_referral',
  },
  {
    id: 'gc-045', company: 'Owen-Ames-Kimball', city: 'Grand Rapids', state: 'MI',
    contactTitle: 'Vice President of Operations', website: 'oakco.com',
    fleetSize: '60', category: 'gc_referral',
    pitchAngle: 'West Michigan GC with healthcare, education, and commercial practice — DI-NOC antimicrobial and surface films are standard in their renovation packages.',
  },

  // ── National GCs — Illinois ──────────────────────────────────────────────
  {
    id: 'gc-046', company: 'Turner Construction Chicago', city: 'Chicago', state: 'IL',
    contactTitle: 'Vice President, Building', website: 'turnerconstruction.com',
    fleetSize: '150+', category: 'gc_referral',
    pitchAngle: "Chicago Turner builds skyscrapers, hospitals, and stadiums — DI-NOC and Rea Tec are standard finish specs. Getting on Turner's preferred vendor list in Chicago is a career-defining contract.",
  },
  {
    id: 'gc-047', company: 'Skanska USA Illinois', city: 'Chicago', state: 'IL',
    contactTitle: 'Project Executive', website: 'usa.skanska.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Chicago Skanska builds transit, government, and commercial facilities — DI-NOC surface films for durable, low-maintenance interior surfaces in public facilities.',
  },
  {
    id: 'gc-048', company: 'Power Construction', city: 'Chicago', state: 'IL',
    contactTitle: 'Director of Preconstruction', website: 'powerconstruction.net',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Chicago-based GC with massive healthcare and commercial portfolio — DI-NOC and Rea Tec in pre-construction value-engineering for hospital and office renovation.',
  },
  {
    id: 'gc-049', company: 'Clayco', city: 'Chicago', state: 'IL',
    contactTitle: 'Regional Vice President', website: 'claycorp.com',
    fleetSize: '200+', category: 'gc_referral',
    pitchAngle: 'Design-build giant with national portfolio — Rea Tec and DI-NOC films in large-scale commercial, industrial, and data center interior packages.',
  },
  {
    id: 'gc-050', company: 'Bulley & Andrews', city: 'Chicago', state: 'IL',
    contactTitle: 'Vice President of Operations', website: 'bulley.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'Chicago historic restoration and commercial GC — DI-NOC wood and stone films are the go-to specification for code-compliant interior surface refinishing in landmark buildings.',
  },
  {
    id: 'gc-051', company: 'FCL Builders', city: 'Itasca', state: 'IL',
    contactTitle: 'Director of Construction', website: 'fclbuilders.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'Industrial and commercial design-build GC in Chicago suburbs — DI-NOC and Rea Tec in value-engineering for commercial renovation. Large service fleet for wraps.',
  },
  {
    id: 'gc-052', company: 'Gilbane Building Company Illinois', city: 'Chicago', state: 'IL',
    contactTitle: 'Project Executive', website: 'gilbaneco.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'National GC with strong Chicago higher-ed and healthcare — Northwestern, University of Chicago, and hospital clients regularly specify DI-NOC in renovation projects.',
  },
  {
    id: 'gc-053', company: 'Mortenson Construction Illinois', city: 'Chicago', state: 'IL',
    contactTitle: 'Regional Vice President', website: 'mortenson.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: "Chicago Mortenson builds sports venues, hospitals, and renewable energy projects — branded interior environments where DI-NOC and Rea Tec deliver premium finishes.",
  },
  {
    id: 'gc-054', company: 'McHugh Construction', city: 'Chicago', state: 'IL',
    contactTitle: 'Vice President of Operations', website: 'mchugh.com',
    fleetSize: '60', category: 'gc_referral',
    pitchAngle: 'Chicago commercial and mixed-use GC — high-rise residential, hotel, and office projects where DI-NOC accent surfaces and lobby graphics are specified.',
  },
  {
    id: 'gc-055', company: 'Lend Lease Illinois', city: 'Chicago', state: 'IL',
    contactTitle: 'Project Executive', website: 'lendlease.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'Global GC with Chicago high-rise and mixed-use portfolio — DI-NOC and Rea Tec films are standard in their luxury residential and commercial interior packages.',
  },
  {
    id: 'gc-056', company: 'Walsh Construction Illinois', city: 'Chicago', state: 'IL',
    contactTitle: 'Director of Preconstruction', website: 'walshgroup.com',
    fleetSize: '150+', category: 'gc_referral',
    pitchAngle: 'Chicago infrastructure and commercial GC — transit, government, and hospital projects where DI-NOC surface films are specified for durable public-facing interior surfaces.',
  },
  {
    id: 'gc-057', company: 'James McHugh Construction', city: 'Chicago', state: 'IL',
    contactTitle: 'VP Operations', website: 'mchugh.com',
    fleetSize: '60', category: 'gc_referral',
    pitchAngle: 'Chicago luxury high-rise and hotel construction — DI-NOC metallic and fabric films for premium lobby and amenity space finishes in Class A buildings.',
  },
  {
    id: 'gc-058', company: 'Pepper Construction Illinois', city: 'Chicago', state: 'IL',
    contactTitle: 'Vice President, Healthcare', website: 'pepperconstruction.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: "Pepper's Chicago operation builds hospitals and commercial facilities — DI-NOC antimicrobial films are a natural fit for their healthcare interior renovation packages.",
  },
  {
    id: 'gc-059', company: 'Reliable Contracting Group', city: 'Chicago', state: 'IL',
    contactTitle: 'President / Operations Director', pitchAngle: 'Chicago commercial TI and renovation GC — high-volume interior renovation workload where DI-NOC and Rea Tec surface films are frequently specified.',
    fleetSize: '40', category: 'gc_referral',
  },
  {
    id: 'gc-060', company: 'Cordeck', city: 'Chicago', state: 'IL',
    contactTitle: 'Fleet Manager', pitchAngle: 'Chicago commercial concrete and structural contractor — large fleet of trucks and equipment; fleet wrap and safety graphics for high-visibility brand on jobsites.',
    fleetSize: '80', category: 'construction',
  },

  // ── Kentucky ──────────────────────────────────────────────────────────────
  {
    id: 'gc-061', company: 'Gray Construction', city: 'Lexington', state: 'KY',
    contactTitle: 'Vice President of Operations', website: 'gray.com',
    fleetSize: '200+', category: 'gc_referral',
    pitchAngle: 'Major Midwest industrial and advanced manufacturing GC — builds automotive plants and logistics facilities across the region. 200+ truck fleet + DI-NOC in facility interiors.',
  },
  {
    id: 'gc-062', company: 'Messer Construction Kentucky', city: 'Louisville', state: 'KY',
    contactTitle: 'Project Executive', website: 'messer.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: "Messer's Louisville office builds hospitals and universities — DI-NOC antimicrobial and Rea Tec surface films are regular value-engineering items in their healthcare packages.",
  },
  {
    id: 'gc-063', company: 'Turner Construction Louisville', city: 'Louisville', state: 'KY',
    contactTitle: 'Preconstruction Manager', website: 'turnerconstruction.com',
    fleetSize: '60', category: 'gc_referral',
    pitchAngle: 'Louisville Turner builds healthcare and commercial projects — DI-NOC and Rea Tec are standard finish specifications across their project portfolio.',
  },
  {
    id: 'gc-064', company: 'Rathke Inc', city: 'Louisville', state: 'KY',
    contactTitle: 'President / VP Operations', pitchAngle: 'Louisville commercial and healthcare GC — DI-NOC and Rea Tec films for interior surface upgrades in hospital and office renovation projects.',
    fleetSize: '40', category: 'gc_referral',
  },
  {
    id: 'gc-065', company: 'Congleton-Hacker', city: 'Lexington', state: 'KY',
    contactTitle: 'Director of Operations', website: 'congletonhacker.com',
    fleetSize: '50', category: 'gc_referral',
    pitchAngle: 'Central Kentucky GC with healthcare, education, and government portfolio — DI-NOC surface films for Lexington municipal and hospital renovation projects.',
  },

  // ── Regional Specialty / High-Fleet GCs ──────────────────────────────────
  {
    id: 'gc-066', company: 'Michels Corporation Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Fleet Manager', website: 'michels.us',
    fleetSize: '400+', category: 'construction',
    pitchAngle: 'Major utility and infrastructure contractor operating in Indiana — 400+ trucks and equipment; fleet wrap standardization across divisions is a large contract.',
  },
  {
    id: 'gc-067', company: 'Walsh Group Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional VP', website: 'walshgroup.com',
    fleetSize: '150+', category: 'gc_referral',
    pitchAngle: 'Infrastructure and commercial GC — transit, highway, and government building projects where DI-NOC surface films are specified for public-facing interior surfaces.',
  },
  {
    id: 'gc-068', company: 'Gilbane Building Company Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Project Executive', website: 'gilbaneco.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'National GC with Indiana higher-ed and healthcare — Purdue, IU, and hospital clients regularly specify DI-NOC in renovation projects. Multi-year preferred vendor pipeline.',
  },
  {
    id: 'gc-069', company: 'Englewood Construction', city: 'Lemont', state: 'IL',
    contactTitle: 'Vice President of Operations', website: 'englewoodconstruction.com',
    fleetSize: '60', category: 'gc_referral',
    pitchAngle: 'Chicago-area retail, restaurant, and hospitality GC — builds national chain locations where DI-NOC is specified for durable storefront and interior surface upgrades across multiple locations.',
  },
  {
    id: 'gc-070', company: 'Leopardo Companies', city: 'Hoffman Estates', state: 'IL',
    contactTitle: 'Director of Operations', website: 'leopardo.com',
    fleetSize: '60', category: 'gc_referral',
    pitchAngle: 'Chicago-area commercial and healthcare GC — DI-NOC and Rea Tec for interior surface upgrades in hospital and office renovation projects.',
  },
  {
    id: 'gc-071', company: 'W.E. O\'Neil Construction', city: 'Chicago', state: 'IL',
    contactTitle: 'Vice President', website: 'weoneil.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'Chicago commercial and institutional GC — healthcare, education, and corporate projects where DI-NOC surface films are value-engineered into interior packages.',
  },
  {
    id: 'gc-072', company: 'Heneghan Piling', city: 'Chicago', state: 'IL',
    contactTitle: 'Fleet Manager', pitchAngle: 'Chicago specialty foundation contractor — large truck and equipment fleet operating on high-visibility downtown jobsites; fleet graphics for brand recognition.',
    fleetSize: '60', category: 'construction',
  },
  {
    id: 'gc-073', company: 'Sollitt Construction', city: 'Itasca', state: 'IL',
    contactTitle: 'President / VP Operations', pitchAngle: 'Chicago-area commercial and industrial GC with 150-year history — DI-NOC and Rea Tec in value-engineering for renovation and TI projects.',
    fleetSize: '50', category: 'gc_referral',
  },
  {
    id: 'gc-074', company: 'Frederick Quinn Corporation', city: 'Addison', state: 'IL',
    contactTitle: 'Director of Operations', website: 'fqc.com',
    fleetSize: '60', category: 'gc_referral',
    pitchAngle: 'Chicago-area commercial GC with healthcare and education practice — DI-NOC and Rea Tec surface films in hospital and school renovation packages.',
  },
  {
    id: 'gc-075', company: 'IEC National', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Fleet Manager', pitchAngle: 'Electrical contractor with large Midwest service fleet — 100+ service vans with branded fleet wraps create rolling billboards on job sites.',
    fleetSize: '100', category: 'construction',
  },
  {
    id: 'gc-076', company: 'Roto-Rooter Services', city: 'Cincinnati', state: 'OH',
    contactTitle: 'Fleet Manager', website: 'rotorooter.com',
    fleetSize: '300+', category: 'fleet',
    pitchAngle: 'National plumbing and drain service company — 300+ service vans across Midwest. Fleet wrap refresh and color standardization across regional divisions is a large recurring contract.',
  },
  {
    id: 'gc-077', company: 'Gilliland Construction', city: 'Indianapolis', state: 'IN',
    contactTitle: 'President', pitchAngle: 'Mid-size Indianapolis commercial GC — DI-NOC and Rea Tec surface films in renovation and TI packages. Fleet of 30+ branded trucks.',
    fleetSize: '30', category: 'gc_referral',
  },
  {
    id: 'gc-078', company: 'Crossroads Industrial Services', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Operations Manager', pitchAngle: 'Indiana mechanical and industrial contractor with growing fleet — service van fleet wraps for brand recognition on Indianapolis-area commercial jobsites.',
    fleetSize: '50', category: 'construction',
  },
  {
    id: 'gc-079', company: 'Superior Industries International', city: 'Detroit', state: 'MI',
    contactTitle: 'Fleet Manager', website: 'supind.com',
    fleetSize: '60', category: 'fleet',
    pitchAngle: 'Michigan manufacturing and industrial company — large employee and executive fleet; color-change wraps and branded fleet graphics for corporate vehicles.',
  },
  {
    id: 'gc-080', company: 'Skanska Michigan', city: 'Detroit', state: 'MI',
    contactTitle: 'Regional Director', website: 'usa.skanska.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Major Michigan infrastructure and public building GC — government facilities, transit, and hospital construction where DI-NOC is specified for durable interior surface upgrades.',
  },
  // ── Specialty Trades with Large Fleets ───────────────────────────────────
  {
    id: 'gc-081', company: 'Hoosier Heating & Cooling', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Fleet Manager', fleetSize: '80',
    category: 'fleet', pitchAngle: 'Large Indiana HVAC contractor — 80+ service vans; branded fleet wraps with phone number and services are the #1 lead generation tool for service contractors.',
  },
  {
    id: 'gc-082', company: 'Peterman Brothers HVAC', city: 'Greenwood', state: 'IN',
    contactTitle: 'CEO / Marketing Director', website: 'petermanhvac.com',
    fleetSize: '100+', category: 'fleet',
    pitchAngle: 'Aggressive multi-state HVAC expansion = ongoing demand for consistent fleet-wide wraps. Perfect for a master service agreement covering new van additions monthly.',
  },
  {
    id: 'gc-083', company: 'Summers Plumbing Heating & Cooling', city: 'Winchester', state: 'IN',
    contactTitle: 'Fleet Manager', website: 'summersphc.com',
    fleetSize: '120+', category: 'fleet',
    pitchAngle: 'Multi-location Indiana HVAC company — 120+ service vans across Indiana. Fleet wrap standardization across all locations is a significant recurring contract.',
  },
  {
    id: 'gc-084', company: 'Mister Sparky Electric Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Operations Manager', fleetSize: '60', category: 'fleet',
    pitchAngle: 'Franchise electrical contractor with 60+ branded vans — franchise system requires consistent vehicle graphics; master agreement for Indiana territory.',
  },
  {
    id: 'gc-085', company: 'Service Experts Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Fleet Manager', website: 'serviceexperts.com',
    fleetSize: '200+', category: 'fleet',
    pitchAngle: 'National HVAC service company with 200+ vans in Indiana/Ohio/Michigan — fleet wrap contract with national account manager is achievable at this scale.',
  },
  {
    id: 'gc-086', company: 'Layne Christensen Ohio', city: 'Columbus', state: 'OH',
    contactTitle: 'Fleet Manager', fleetSize: '80', category: 'construction',
    pitchAngle: 'Water infrastructure and drilling contractor with large Ohio fleet — branded trucks operating on municipal jobsites benefit from high-visibility fleet graphics.',
  },
  {
    id: 'gc-087', company: 'Rudolph Libbe Group', city: 'Walbridge', state: 'OH',
    contactTitle: 'Fleet Manager', website: 'rudolphlibbe.com',
    fleetSize: '200+', category: 'construction',
    pitchAngle: 'Northwest Ohio specialty GC and engineering group — 200+ trucks and equipment; fleet graphic standardization for mechanical, electrical, and construction divisions.',
  },
  {
    id: 'gc-088', company: 'Interstate Hotels & Resorts', city: 'Columbus', state: 'OH',
    contactTitle: 'Director of Construction', website: 'interstatehotels.com',
    fleetSize: '30', category: 'gc_referral',
    pitchAngle: 'Hospitality construction and renovation management — hotel interior renovation projects where DI-NOC wood and fabric films are specified for guest room and lobby upgrades.',
  },
  {
    id: 'gc-089', company: 'Danis Building Construction', city: 'Dayton', state: 'OH',
    contactTitle: 'Vice President of Operations', website: 'danis.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'Dayton-based regional GC with healthcare, education, and government portfolio — DI-NOC surface films for interior surface upgrades in Southwest Ohio renovation projects.',
  },
  {
    id: 'gc-090', company: 'Turner Construction Indianapolis', city: 'Indianapolis', state: 'IN',
    contactTitle: 'General Manager', website: 'turnerconstruction.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'Indianapolis Turner builds Lucas Oil Stadium, hospitals, and university projects — preferred subcontractor status with Turner Indianapolis is the crown jewel of the GC channel.',
  },
  // ── ENR Top 400 with Midwest Presence ────────────────────────────────────
  {
    id: 'gc-091', company: 'Hensel Phelps Ohio', city: 'Columbus', state: 'OH',
    contactTitle: 'Project Executive', website: 'henselphelps.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Federal and institutional GC — VA hospitals, federal courthouses, and university facilities where DI-NOC and Rea Tec are standard interior specifications.',
  },
  {
    id: 'gc-092', company: 'JE Dunn Construction Midwest', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Vice President', website: 'jedunn.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'ENR Top 20 GC with strong Midwest presence — healthcare, higher-ed, and corporate campuses where DI-NOC and Rea Tec are standard finish specifications.',
  },
  {
    id: 'gc-093', company: 'DPR Construction Midwest', city: 'Chicago', state: 'IL',
    contactTitle: 'Project Executive', website: 'dpr.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'Technology, life science, and healthcare GC — cleanroom and lab interior environments where DI-NOC chemical-resistant films and Rea Tec are specified.',
  },
  {
    id: 'gc-094', company: 'McCarthy Building Companies Midwest', city: 'Chicago', state: 'IL',
    contactTitle: 'Regional Vice President', website: 'mccarthy.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Healthcare and education GC with Midwest reach — hospital and university interior renovation where DI-NOC antimicrobial films are standard specification items.',
  },
  {
    id: 'gc-095', company: 'Whiting-Turner Midwest', city: 'Columbus', state: 'OH',
    contactTitle: 'Project Executive', website: 'whiting-turner.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'ENR Top 10 GC with Midwest hospitals and university projects — DI-NOC and Rea Tec in standard interior finish specifications across healthcare portfolio.',
  },
  {
    id: 'gc-096', company: 'Clark Construction Illinois', city: 'Chicago', state: 'IL',
    contactTitle: 'Project Executive', website: 'clarkconstruction.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'Major national GC with Chicago high-profile commercial and government projects — DI-NOC and Rea Tec surface films in finish specifications across mixed-use portfolio.',
  },
  {
    id: 'gc-097', company: 'Swinerton Midwest', city: 'Chicago', state: 'IL',
    contactTitle: 'Regional Director', website: 'swinerton.com',
    fleetSize: '80', category: 'gc_referral',
    pitchAngle: 'Commercial and renewable energy GC — corporate office, data center, and solar facility interiors where DI-NOC films are specified for surface durability.',
  },
  {
    id: 'gc-098', company: 'Boldt Company Wisconsin', city: 'Milwaukee', state: 'WI',
    contactTitle: 'Vice President of Operations', website: 'theboldtcompany.com',
    fleetSize: '100+', category: 'gc_referral',
    pitchAngle: 'Wisconsin and Midwest healthcare GC — hospital and medical facility renovation where DI-NOC antimicrobial films are standard interior specification items.',
  },
  {
    id: 'gc-099', company: 'Salas O\'Brien Midwest', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Construction Services', website: 'salasobrien.com',
    fleetSize: '50', category: 'gc_referral',
    pitchAngle: 'Engineering and architecture firm with construction management practice — DI-NOC and Rea Tec in facility renovation packages for corporate and industrial clients.',
  },
  {
    id: 'gc-100', company: 'C.F. Evans Construction', city: 'Indianapolis', state: 'IN',
    contactTitle: 'President / Director of Operations', pitchAngle: 'Indianapolis commercial renovation GC — high-volume TI workload where DI-NOC and Rea Tec surface films replace millwork for cost savings.',
    fleetSize: '30', category: 'gc_referral',
  },
];

async function seedLeads(userId, userEmail) {
  let inserted = 0, skipped = 0;
  for (const lead of GC_LEADS) {
    try {
      const r = await pool.query(`
        INSERT INTO leads (
          user_id, client_id, company, category, state, city,
          contact_name, contact_title, email, phone, website,
          fleet_size, pitch_angle, status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'cold',NOW(),NOW())
        ON CONFLICT (user_id, client_id) DO NOTHING
      `, [
        String(userId), lead.id, lead.company, lead.category,
        lead.state, lead.city || null, lead.contactName || null,
        lead.contactTitle || null, lead.email || null, lead.phone || null,
        lead.website || null, lead.fleetSize || null, lead.pitchAngle || null,
      ]);
      if (r.rowCount > 0) inserted++; else skipped++;
    } catch (e) {
      console.error(`  ✗ ${lead.company}: ${e.message}`);
    }
  }
  console.log(`  ${userEmail}: +${inserted} new leads (${skipped} already existed)`);
}

async function main() {
  console.log('\nWrapLeads — Major General Contractor Seed');
  console.log('='.repeat(50));

  const { rows: users } = await pool.query('SELECT id, email FROM users ORDER BY id');
  if (!users.length) {
    console.log('No users found. Register first, then re-run.');
    process.exit(0);
  }

  const byState = GC_LEADS.reduce((acc, l) => { acc[l.state] = (acc[l.state]||0)+1; return acc; }, {});
  const byCategory = GC_LEADS.reduce((acc, l) => { acc[l.category] = (acc[l.category]||0)+1; return acc; }, {});

  console.log(`\nSeeding ${GC_LEADS.length} GC leads across ${users.length} user(s):`);
  Object.entries(byState).sort().forEach(([s,c]) => console.log(`  · ${s}: ${c} GCs`));
  console.log('');
  console.log('  Categories:');
  Object.entries(byCategory).forEach(([c,n]) => console.log(`    ${c}: ${n}`));
  console.log('');

  for (const user of users) await seedLeads(user.id, user.email);

  console.log(`
Done. Pitch angles:
  gc_referral → get on their preferred vendor list for DI-NOC / Rea Tec specs
  construction → fleet wraps + safety graphics on their trucks
  fleet        → service van fleet wraps (HVAC, electrical, plumbing)

Total CRM leads per user after all seeds:
  80  seed-leads.js   (original B2B)
  67  seed-schools.js (schools + AIA + municipal)
  100 seed-designers.js (interior design firms)
  100 seed-gc.js      (general contractors)
  ──────────────────
  347 total vetted leads
`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
