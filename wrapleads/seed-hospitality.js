#!/usr/bin/env node
/**
 * seed-hospitality.js — Seeds hotel groups, restaurant chains, and event venues
 * into the WrapLeads CRM leads table.
 *
 * Hospitality is a DI-NOC / Rea Tec goldmine:
 *   1. Hotels renovate guest rooms, corridors, elevator cabs, and lobbies constantly
 *   2. Restaurant chains refresh their interiors on 5-7 year cycles
 *   3. Event venues need branded wall graphics, stage backdrops, and wayfinding
 *   4. Catering/delivery vehicles = fleet wrap opportunity
 *
 * These are repeat customers — renovations happen continuously.
 *
 * Run: node seed-hospitality.js
 * Safe to re-run — ON CONFLICT DO NOTHING via client_id.
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const HOSPITALITY_LEADS = [
  // ── Hotel Management Groups — Indiana ────────────────────────────────────
  {
    id: 'hos-001', company: 'White Lodging Services', city: 'Merrillville', state: 'IN',
    contactTitle: 'VP of Design & Construction', website: 'whitelodging.com',
    category: 'dinoc',
    pitchAngle: "White Lodging is one of the largest hotel developer-operators in the US — headquartered in Merrillville, IN. They build and manage Marriott, Hilton, and Hyatt brands. Their design & construction pipeline for hotel renovations and new builds is enormous. DI-NOC and Rea Tec for elevator cabs, feature walls, and millwork surfaces are specified by their interior design team.",
  },
  {
    id: 'hos-002', company: 'Keystone Group — Indianapolis Hotels', city: 'Indianapolis', state: 'IN',
    contactTitle: 'VP of Hospitality Development', website: 'keystonegroup.com',
    category: 'dinoc',
    pitchAngle: "Keystone Group develops and operates boutique hotels and mixed-use properties in Indianapolis — including some of the city's most prominent downtown addresses. Their renovation cycle for hotel common areas, lobbies, and guest rooms is a constant DI-NOC and Rea Tec opportunity.",
  },
  {
    id: 'hos-003', company: 'Dimension Hospitality', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Design & Renovations', website: 'dimensionhospitality.com',
    category: 'dinoc',
    pitchAngle: "Dimension manages select-service hotels across Indiana and the Midwest. Their ongoing PIP (Property Improvement Plan) programs for Marriott and Hilton brands require regular DI-NOC surface updates on corridors, elevators, and public areas.",
  },
  {
    id: 'hos-004', company: 'Sahara Hospitality Group — Indianapolis', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Operations', website: 'saharahospitality.com',
    category: 'dinoc',
    pitchAngle: "Multi-property hotel group in Indianapolis running extended-stay and select-service brands. Their renovation and brand-refresh activity is ongoing. DI-NOC for elevator cabs and corridor accent walls is a natural fit.",
  },
  {
    id: 'hos-005', company: 'Drury Hotels — Indiana / Ohio Locations', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Facilities & Design', website: 'druryhotels.com',
    category: 'dinoc',
    pitchAngle: "Drury Hotels is a family-owned chain headquartered in St. Louis with strong Indiana and Ohio presence. Their brand consistency standards mean every renovation follows strict guidelines — DI-NOC elevator and accent wall specs are standard in their renovation packages.",
  },
  {
    id: 'hos-006', company: 'Staybridge Suites / Candlewood — IHG Franchise Group', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Property Improvement Manager', website: 'ihg.com',
    category: 'dinoc',
    pitchAngle: "IHG franchise owners in Indianapolis own multiple extended-stay properties. Brand renovation mandates from IHG require DI-NOC-compatible surface treatments in lobbies and corridors. Get on their approved vendor list.",
  },
  {
    id: 'hos-007', company: 'Omni Severin Hotel — Indianapolis', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Facilities Director / GM', website: 'omnihotels.com',
    category: 'dinoc',
    pitchAngle: "The Omni Severin is a landmark Indianapolis historic hotel. Renovations must maintain historic character while upgrading surfaces — DI-NOC wood and stone grain films are perfect solutions for preservation-compliant corridor and elevator updates.",
  },
  {
    id: 'hos-008', company: 'JW Marriott Indianapolis', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Engineering', website: 'marriott.com',
    category: 'dinoc',
    pitchAngle: "The JW Marriott Indianapolis is one of the city's flagship luxury properties. Their renovation cycle for guest rooms, suites, and public areas is a premium DI-NOC opportunity. Engineering director manages surface material specs.",
  },
  {
    id: 'hos-009', company: 'Embassy Suites — Indianapolis Downtown', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Facilities', website: 'embassysuites3.hilton.com',
    category: 'dinoc',
    pitchAngle: "Embassy Suites' atrium design concept uses extensive vertical surfaces. DI-NOC on atrium columns, corridor feature walls, and elevator interiors is a high-volume application. Hilton brand renovation cycles make this recurring.",
  },
  {
    id: 'hos-010', company: 'Bottleworks Hotel — Indianapolis', city: 'Indianapolis', state: 'IN',
    contactTitle: 'General Manager / Facilities Contact', website: 'bottleworkshotel.com',
    category: 'dinoc',
    pitchAngle: "Bottleworks is one of Indianapolis's most celebrated boutique hotel renovations. Their design DNA is industrial-historic. DI-NOC metal and concrete surface films are a natural fit for their aesthetic. Strong candidate for Rea Tec specialty materials.",
  },

  // ── Hotel Groups — Ohio ──────────────────────────────────────────────────
  {
    id: 'hos-011', company: 'Marcus Hotels & Resorts — Midwest', city: 'Milwaukee', state: 'OH',
    contactTitle: 'VP of Design & Construction', website: 'marcushotels.com',
    category: 'dinoc',
    pitchAngle: "Marcus Hotels operates The Pfister in Milwaukee plus properties in Indiana and Illinois. Their renovation pipeline for landmark hotels is continuous. DI-NOC for elevator cabs and specialty surface applications in their historic properties is a strong specification pitch.",
  },
  {
    id: 'hos-012', company: 'Graduate Hotels — Columbus / Ohio State', city: 'Columbus', state: 'OH',
    contactTitle: 'Design & Construction Director', website: 'graduatehotels.com',
    category: 'dinoc',
    pitchAngle: "Graduate Hotels converts historic buildings near major universities into boutique hotels. Their conversion projects use DI-NOC and specialty films heavily for cost-effective surface transformations. Columbus Ohio State location is a strong lead.",
  },
  {
    id: 'hos-013', company: 'Nationwide Hotel & Conference Center — Columbus', city: 'Columbus', state: 'OH',
    contactTitle: 'Facilities Director', website: 'nationwidehotel.com',
    category: 'dinoc',
    pitchAngle: "Large conference center-hotel adjacent to Nationwide Arena. Their constant event-driven renovation cycle includes branded wall graphics, DI-NOC elevator cabs, and wayfinding updates for major events.",
  },
  {
    id: 'hos-014', company: '21c Museum Hotel — Cincinnati', city: 'Cincinnati', state: 'OH',
    contactTitle: 'General Manager / Design Director', website: '21cmuseumhotels.com',
    category: 'dinoc',
    pitchAngle: "21c is an art-forward boutique hotel brand — Cincinnati is one of their flagship locations. Their design aesthetic demands premium surface materials. DI-NOC specialty finishes and Rea Tec architectural films align perfectly with their brand.",
  },
  {
    id: 'hos-015', company: 'AC Hotel by Marriott — Columbus Short North', city: 'Columbus', state: 'OH',
    contactTitle: 'Director of Engineering', website: 'marriott.com',
    category: 'dinoc',
    pitchAngle: "AC Hotels are a modern Marriott lifestyle brand with strong design standards. Columbus Short North location caters to creative professionals. DI-NOC for feature walls and elevator cabs on brand-mandated renovations.",
  },

  // ── Hotel Groups — Michigan ──────────────────────────────────────────────
  {
    id: 'hos-016', company: 'The Henry — Autograph Collection / Dearborn', city: 'Dearborn', state: 'MI',
    contactTitle: 'Director of Facilities', website: 'thehenrydearborn.com',
    category: 'dinoc',
    pitchAngle: "The Henry is a prestigious Autograph Collection hotel adjacent to The Henry Ford Museum. Their historic building renovations use DI-NOC extensively for surface upgrades that respect the architectural character while meeting modern standards.",
  },
  {
    id: 'hos-017', company: 'Amway Grand Plaza Hotel — Grand Rapids', city: 'Grand Rapids', state: 'MI',
    contactTitle: 'Director of Engineering & Facilities', website: 'amwaygrand.com',
    category: 'dinoc',
    pitchAngle: "The Amway Grand is Grand Rapids's iconic luxury hotel. Their ongoing renovation cycle for 682 guest rooms, multiple ballrooms, and public areas creates constant DI-NOC and specialty surface film opportunities.",
  },
  {
    id: 'hos-018', company: 'Detroit Marriott at Renaissance Center', city: 'Detroit', state: 'MI',
    contactTitle: 'Director of Property Operations', website: 'marriott.com',
    category: 'dinoc',
    pitchAngle: "The Detroit Marriott at the RenCen is one of the largest hotels in Michigan. Their renovation program covers multiple towers and thousands of linear feet of corridor. DI-NOC elevator cab and corridor specification is a significant project.",
  },
  {
    id: 'hos-019', company: 'The Inn at St. Johns — Plymouth MI', city: 'Plymouth', state: 'MI',
    contactTitle: 'Facilities Manager', website: 'innatstjohns.com',
    category: 'dinoc',
    pitchAngle: "Boutique resort and conference center west of Detroit. Their ongoing interior renovation for conference facilities, guest corridors, and event spaces is a DI-NOC opportunity. Accessible decision maker at an independent property.",
  },
  {
    id: 'hos-020', company: 'Shinola Hotel — Detroit', city: 'Detroit', state: 'MI',
    contactTitle: 'General Manager', website: 'shinola.com/hotel',
    category: 'dinoc',
    pitchAngle: "Shinola Hotel is a design-forward Detroit boutique. The Shinola brand demands premium materials throughout. DI-NOC specialty wood and metal finishes, Rea Tec architectural films — this is a high-prestige specification opportunity.",
  },

  // ── Hotel Groups — Illinois ──────────────────────────────────────────────
  {
    id: 'hos-021', company: 'Loews Chicago Hotel', city: 'Chicago', state: 'IL',
    contactTitle: 'Director of Engineering', website: 'loewshotels.com',
    category: 'dinoc',
    pitchAngle: "Loews Chicago is a 400+ room conference hotel in Streeterville. Their ongoing renovation program covers guest rooms, meeting spaces, and public areas. DI-NOC elevator and corridor specification for a Chicago high-rise is a significant project.",
  },
  {
    id: 'hos-022', company: 'Marriott Chicago Downtown Magnificent Mile', city: 'Chicago', state: 'IL',
    contactTitle: 'Director of Property Operations', website: 'marriott.com',
    category: 'dinoc',
    pitchAngle: "Flagship Marriott on Chicago's Mag Mile — one of the highest-occupancy hotels in the Midwest. Continuous renovation program for public areas, elevators, and meeting spaces. Premium DI-NOC specification.",
  },
  {
    id: 'hos-023', company: 'The Hoxton — Chicago', city: 'Chicago', state: 'IL',
    contactTitle: 'GM / Design Contact', website: 'thehoxton.com',
    category: 'dinoc',
    pitchAngle: "The Hoxton is a design-led boutique brand. Chicago location uses bold, creative interior design. DI-NOC and Rea Tec architectural films for their lobby, bar, and corridor feature wall updates.",
  },
  {
    id: 'hos-024', company: 'Ace Hotel Chicago', city: 'Chicago', state: 'IL',
    contactTitle: 'General Manager', website: 'acehotel.com',
    category: 'dinoc',
    pitchAngle: "Ace Hotel appeals to the creative and design community. Their interiors are showcase-quality. Premium DI-NOC and specialty surface films are a natural fit for their ongoing refresh projects.",
  },
  {
    id: 'hos-025', company: 'Hyatt Regency Chicago', city: 'Chicago', state: 'IL',
    contactTitle: 'Director of Engineering', website: 'hyatt.com',
    category: 'dinoc',
    pitchAngle: "Hyatt Regency Chicago is one of the largest convention hotels in the world — 2,019 rooms. Their maintenance and renovation program is continuous. DI-NOC elevator and millwork spec across 70+ floors = massive project volume.",
  },

  // ── Restaurant Groups ────────────────────────────────────────────────────
  {
    id: 'hos-026', company: 'Cunningham Restaurant Group', city: 'Indianapolis', state: 'IN',
    contactTitle: 'VP of Development / Facilities Director', website: 'cunninghamrestaurantgroup.com',
    category: 'dinoc',
    pitchAngle: "Cunningham is Indianapolis's premier restaurant group — Stone Creek Dining, Mesh, Union 50, Livery, and more. They renovate interiors constantly as concepts evolve. DI-NOC for bar surfaces, feature walls, and host stands. Also: delivery vehicle wraps for their catering division.",
  },
  {
    id: 'hos-027', company: 'HH Gregg Hospitality (Hollyhock Hill heritage)', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Operations Director', website: 'hollyhockhill.com',
    category: 'dinoc',
    pitchAngle: "Historic Indianapolis restaurant with private dining and event catering. Interior renovations for dining room and event spaces. DI-NOC for accent walls and wainscoting.",
  },
  {
    id: 'hos-028', company: 'Sun King Brewing Company', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Head of Facilities & Events', website: 'sunkingbrewing.com',
    category: 'dinoc',
    pitchAngle: "Sun King has multiple taprooms and large event facilities in Indianapolis. Their branded interior graphics, bar counter DI-NOC, and event space feature walls are constant projects. Also: delivery van fleet wraps for their distribution operation.",
  },
  {
    id: 'hos-029', company: '16 Tech / Bottleworks District — Restaurant Row', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Property Manager / Leasing Contact', website: 'bottleworksdistrict.com',
    category: 'dinoc',
    pitchAngle: "Bottleworks District has multiple restaurant tenants with recurring interior renovation needs. Getting a relationship with the property manager = referrals to every new tenant. DI-NOC for bar counters, feature walls, and interior branding.",
  },
  {
    id: 'hos-030', company: 'Bru Burger Bar / Scotty's Brewhouse Group', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Operations', website: 'bruburger.com',
    category: 'dinoc',
    pitchAngle: "Multi-location Indianapolis restaurant group with ongoing refresh projects. Bar surface DI-NOC, branded wall graphics, and feature wall treatments across their locations.",
  },
  {
    id: 'hos-031', company: 'Mimi Blue Meatballs / Restaurants by Concentrics', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Creative & Facilities Director', website: 'concentrics.net',
    category: 'dinoc',
    pitchAngle: "Concentrics Restaurants operates design-forward concepts in Indianapolis and Nashville. Their interior renovations are a DI-NOC showcase opportunity — bold feature walls, textured surface films, and branded graphics.",
  },
  {
    id: 'hos-032', company: 'Portillo\'s — Chicago / Indiana', city: 'Chicago', state: 'IL',
    contactTitle: 'Facilities Director', website: 'portillos.com',
    category: 'dinoc',
    pitchAngle: "Portillo's is a Chicago icon expanding rapidly. Their nostalgic 1950s-themed decor uses extensive interior graphics and themed surface finishes. DI-NOC and vinyl wall graphics for new location buildouts and refreshes.",
  },
  {
    id: 'hos-033', company: 'Lettuce Entertain You Enterprises — Chicago', city: 'Chicago', state: 'IL',
    contactTitle: 'VP of Design & Construction', website: 'leye.com',
    category: 'dinoc',
    pitchAngle: "Lettuce Entertain You is one of Chicago's most prolific restaurant groups — 60+ concepts across the country. Their design and construction team specifies surface finishes for dozens of renovations per year. DI-NOC and Rea Tec are natural specs.",
  },
  {
    id: 'hos-034', company: 'Boka Restaurant Group — Chicago', city: 'Chicago', state: 'IL',
    contactTitle: 'Design & Development Director', website: 'bokarestaurantgroup.com',
    category: 'dinoc',
    pitchAngle: "Boka is one of Chicago's most acclaimed restaurant groups — Girl & the Goat, Momotaro, Dove's Luncheonette, and more. Premium, design-forward interiors. DI-NOC and Rea Tec for their ongoing concept refresh and new openings.",
  },
  {
    id: 'hos-035', company: 'Darden Restaurants — Midwest Operations', city: 'Columbus', state: 'OH',
    contactTitle: 'Regional Facilities Manager', website: 'darden.com',
    category: 'dinoc',
    pitchAngle: "Darden operates Olive Garden, LongHorn Steakhouse, and Cheddar's across the Midwest — hundreds of locations. Their facility renovation program specifies DI-NOC for host stand surfaces, bar tops, and feature wall updates. Getting on Darden's approved vendor list = massive scale.",
  },
  {
    id: 'hos-036', company: "Applebee's / Dine Brands — Midwest Franchise", city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Facilities Director', website: 'applebees.com',
    category: 'dinoc',
    pitchAngle: "Dine Brands franchisees in the Midwest own 50-100 Applebee's locations. Their mandatory renovation programs (every 5-7 years) require DI-NOC for booth surfaces, bar tops, and feature wall graphics. Franchise group deal = significant volume.",
  },
  {
    id: 'hos-037', company: "Steak 'n Shake Corporate — Indianapolis HQ", city: 'Indianapolis', state: 'IN',
    contactTitle: 'Facilities Manager', website: 'steaknshake.com',
    category: 'dinoc',
    pitchAngle: "Steak 'n Shake is headquartered in Indianapolis. Their ongoing remodel program for corporate-owned stores uses DI-NOC for counter surfaces and interior accent applications. HQ relationship = national potential.",
  },
  {
    id: 'hos-038', company: 'Marsh Restaurant Group / HHM Hospitality', city: 'Columbus', state: 'OH',
    contactTitle: 'Director of Development', website: 'hhmlodging.com',
    category: 'dinoc',
    pitchAngle: "HHM is a growing hotel and restaurant management company in Ohio. Their new builds and renovations for hotels and food & beverage operations are a recurring DI-NOC and Rea Tec opportunity.",
  },
  {
    id: 'hos-039', company: 'Tony Packo\'s — Toledo OH (Multi-Location)', city: 'Toledo', state: 'OH',
    contactTitle: 'Operations Director', website: 'tonypackos.com',
    category: 'dinoc',
    pitchAngle: "Tony Packo's is a Toledo icon with multiple locations. Their renovation projects for dining room refreshes and branded wall graphics are a steady DI-NOC opportunity.",
  },
  {
    id: 'hos-040', company: 'Bob Evans Farms — Corporate HQ Columbus', city: 'Columbus', state: 'OH',
    contactTitle: 'Facilities & Renovation Director', website: 'bobevans.com',
    category: 'dinoc',
    pitchAngle: "Bob Evans is headquartered in Columbus with 400+ restaurant locations. Their national renovation program for dining room and kitchen surface updates is a DI-NOC and architectural film specification opportunity at corporate level.",
  },

  // ── Event Venues / Convention Centers ────────────────────────────────────
  {
    id: 'hos-041', company: 'Indiana Convention Center / IUPUI Campus Venues', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Facilities & Capital Projects', website: 'icclos.com',
    category: 'dinoc',
    pitchAngle: "Indiana Convention Center hosts 500+ events/year. Their ongoing renovation cycle for pre-function spaces, corridors, and public areas requires branded graphics and DI-NOC surface updates. Major event turnovers need fast, high-quality installs.",
  },
  {
    id: 'hos-042', company: 'Lucas Oil Stadium — Facilities Division', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Facilities', website: 'lucasoilstadium.com',
    category: 'dinoc',
    pitchAngle: "Lucas Oil Stadium hosts Colts games, NCAA events, and major concerts. Their concourse and suite renovation program is a recurring DI-NOC opportunity. Specialty wall treatments, branded graphics, and sponsor-branded surface installs.",
  },
  {
    id: 'hos-043', company: 'Bankers Life Fieldhouse (now Gainbridge Fieldhouse)', city: 'Indianapolis', state: 'IN',
    contactTitle: 'VP of Facilities', website: 'gainbridgefieldhouse.com',
    category: 'dinoc',
    pitchAngle: "The Pacers arena underwent a major renovation. Concourse wall graphics, suite feature walls, and DI-NOC for premium club areas are recurring projects around naming rights and sponsor refresh cycles.",
  },
  {
    id: 'hos-044', company: 'Victory Field / Indianapolis Indians', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Facilities', website: 'milb.com',
    category: 'dinoc',
    pitchAngle: "Victory Field is one of the most celebrated minor league ballparks in the country. Their ongoing concourse and premium area renovations include branded graphics, DI-NOC for suite interiors, and sponsor activation installs.",
  },
  {
    id: 'hos-045', company: 'Ruoff Music Center — Noblesville', city: 'Noblesville', state: 'IN',
    contactTitle: 'Operations Director', website: 'livenation.com',
    category: 'dinoc',
    pitchAngle: "Ruoff (formerly Deer Creek) is one of the highest-capacity outdoor amphitheaters in the US. Their facility renovations and sponsor activation installs require large-format graphics and surface film applications across the venue.",
  },
  {
    id: 'hos-046', company: 'Nationwide Arena — Columbus', city: 'Columbus', state: 'OH',
    contactTitle: 'VP of Facilities & Operations', website: 'nationwidearena.com',
    category: 'dinoc',
    pitchAngle: "Nationwide Arena hosts the Blue Jackets plus major concerts and events. Concourse DI-NOC, branded wall graphics, premium club renovations — their facility upgrade program is continuous and budget-rich.",
  },
  {
    id: 'hos-047', company: 'Little Caesars Arena — Detroit', city: 'Detroit', state: 'MI',
    contactTitle: 'Director of Facilities', website: 'littlecaesarsarena.com',
    category: 'dinoc',
    pitchAngle: "Little Caesars Arena hosts the Red Wings and Pistons. Their multi-purpose design includes premium clubs and retail concourses that undergo regular refresh cycles. DI-NOC and large-format graphics are standard in arena renovation specs.",
  },
  {
    id: 'hos-048', company: 'United Center — Chicago', city: 'Chicago', state: 'IL',
    contactTitle: 'VP of Facilities', website: 'unitedcenter.com',
    category: 'dinoc',
    pitchAngle: "United Center is home to the Blackhawks and Bulls and one of the busiest arenas in the world. Their continuous improvement program for premium clubs, suites, and concourses is a DI-NOC and architectural film powerhouse.",
  },
  {
    id: 'hos-049', company: 'McCormick Place — Chicago Convention', city: 'Chicago', state: 'IL',
    contactTitle: 'Director of Facilities Management', website: 'mccormickplace.com',
    category: 'dinoc',
    pitchAngle: "McCormick Place is the largest convention center in North America. Their facilities team manages thousands of square feet of surface renovation annually. DI-NOC and large-format graphics for branded expo halls and permanent wayfinding.",
  },
  {
    id: 'hos-050', company: 'Cincinnati Music Hall / Museum Center', city: 'Cincinnati', state: 'OH',
    contactTitle: 'Director of Facilities & Capital Projects', website: 'cincinnatiarts.org',
    category: 'dinoc',
    pitchAngle: "Cincinnati Music Hall completed a $193M renovation in 2017. Their ongoing maintenance and specialty events program continues to require high-quality surface treatments. DI-NOC for historic restoration applications is a premium specification.",
  },

  // ── Catering / Food Service Fleet ────────────────────────────────────────
  {
    id: 'hos-051', company: 'Aramark — Indiana University / Purdue Catering', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Fleet Manager', website: 'aramark.com',
    category: 'fleet',
    pitchAngle: "Aramark operates catering and food service across Indiana universities and corporate campuses. Their delivery fleet of vans and box trucks runs constant routes. Fleet wraps with Aramark branding. DI-NOC for their food service renovation projects.",
  },
  {
    id: 'hos-052', company: 'Sodexo — Midwest Healthcare & University Division', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Facilities Director', website: 'sodexo.com',
    category: 'fleet',
    pitchAngle: "Sodexo manages food service and facilities at hospitals, universities, and corporate campuses across the Midwest. Their fleet of catering delivery vehicles + DI-NOC for cafeteria and dining renovation projects.",
  },
  {
    id: 'hos-053', company: 'Centerplate / Sodexo Live — Stadium Catering', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Operations Director', website: 'sodexolive.com',
    category: 'fleet',
    pitchAngle: "Sodexo Live manages food and beverage at Lucas Oil Stadium, Gainbridge Fieldhouse, and other Indiana venues. Their catering vehicles and event support fleet are fleet wrap targets.",
  },
  {
    id: 'hos-054', company: 'Taher Inc. — Midwest K-12 Food Service', city: 'Minneapolis', state: 'IL',
    contactTitle: 'Regional Fleet Manager', website: 'taher.com',
    category: 'fleet',
    pitchAngle: "Taher provides food service management to K-12 schools across the Midwest. Their delivery vans and supply vehicles are fleet wrap candidates. School district relationships provide referrals to our school bus lead base.",
  },
  {
    id: 'hos-055', company: 'Gordon Food Service — Indiana / Ohio', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Fleet Director', website: 'gfs.com',
    category: 'fleet',
    pitchAngle: "GFS is one of the largest food distributors in North America. Their massive semi and van fleet throughout Indiana and Ohio is already branded — but their local delivery vans and catering support vehicles are fleet wrap targets.",
  },

  // ── Catering Companies ───────────────────────────────────────────────────
  {
    id: 'hos-056', company: 'TASTE Catering — Indianapolis', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Owner / Operations Director', website: 'tastecatering.com',
    category: 'fleet',
    pitchAngle: "TASTE is a premium Indianapolis catering company. Their van and delivery fleet moves through the city's most high-profile corporate and social events. Fleet wrap = daily brand exposure at elite venues.",
  },
  {
    id: 'hos-057', company: 'Classic Fare Catering — Indianapolis', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Owner / General Manager', website: 'classicfarecatering.com',
    category: 'fleet',
    pitchAngle: "Classic Fare is one of Indiana's most established caterers for corporate events, weddings, and galas. Their fleet wrap is a branding opportunity that mirrors the quality of their food presentation.",
  },
  {
    id: 'hos-058', company: 'Cuisine Concepts Catering — Chicago', city: 'Chicago', state: 'IL',
    contactTitle: 'Operations Manager', website: 'cuisineconcepts.com',
    category: 'fleet',
    pitchAngle: "Chicago luxury caterer serving Fortune 500 corporate events and galas. Their fleet of catering vans is a rolling showcase for their brand. Fleet wrap targets their event delivery vehicles.",
  },
  {
    id: 'hos-059', company: 'Zingerman\'s Roadhouse / Ann Arbor Food Group', city: 'Ann Arbor', state: 'MI',
    contactTitle: 'Operations Director / Catering Manager', website: 'zingermans.com',
    category: 'fleet',
    pitchAngle: "Zingerman's is a legendary Ann Arbor food brand with multiple businesses including a catering operation. Their delivery and catering fleet in Ann Arbor. Boutique business with strong brand pride — fleet wrap is an easy pitch.",
  },
  {
    id: 'hos-060', company: 'Gilchrist Catering / Events by CM — Columbus', city: 'Columbus', state: 'OH',
    contactTitle: 'Owner / Events Director', website: 'gilchristcatering.com',
    category: 'fleet',
    pitchAngle: "Columbus premium catering and events company serving corporate clients and large galas. Fleet wrap on their delivery vans. Short sales cycle — owner is the decision maker.",
  },

  // ── Breweries / Taprooms / Entertainment ─────────────────────────────────
  {
    id: 'hos-061', company: '3 Floyds Brewing — Munster IN', city: 'Munster', state: 'IN',
    contactTitle: 'Operations Director', website: '3floyds.com',
    category: 'fleet',
    pitchAngle: "3 Floyds is one of America's most acclaimed craft breweries. Their delivery fleet, taproom shuttle, and event vehicles are strong fleet wrap candidates. Their bold visual branding translates perfectly to vehicle graphics.",
  },
  {
    id: 'hos-062', company: 'Toppling Goliath Brewing — Iowa/Indiana Distribution', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Distribution Manager', website: 'tgbrews.com',
    category: 'fleet',
    pitchAngle: "Craft brewery with strong Midwest distribution footprint. Their delivery trucks and vans need fleet graphics that match their high-demand brand identity.",
  },
  {
    id: 'hos-063', company: 'Goose Island Beer — Chicago Distribution', city: 'Chicago', state: 'IL',
    contactTitle: 'Fleet & Distribution Manager', website: 'gooseisland.com',
    category: 'fleet',
    pitchAngle: "Goose Island (AB InBev) is a Chicago craft beer icon with massive Midwest distribution. Their delivery fleet wrap is a brand visibility opportunity at every bar, restaurant, and retail account they service.",
  },
  {
    id: 'hos-064', company: 'Dave & Buster\'s — Midwest Locations', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Facilities Director', website: 'daveandbusters.com',
    category: 'dinoc',
    pitchAngle: "Dave & Buster's undergoes regular interior renovations for game floor refreshes and bar updates. DI-NOC for bar and counter surfaces, branded wall graphics for game sections. Their renovation cycle is ongoing.",
  },
  {
    id: 'hos-065', company: 'Round1 Entertainment — Indiana / Ohio', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Facilities Manager', website: 'round1usa.com',
    category: 'dinoc',
    pitchAngle: "Round1 is a Japanese entertainment concept expanding rapidly in US malls. Their interior design uses extensive branded wall graphics and specialty surface treatments. New store buildouts and renovations are a DI-NOC opportunity.",
  },

  // ── Hotel Technology / Management Companies ─────────────────────────────
  {
    id: 'hos-066', company: 'Real Hospitality Group — Chicago', city: 'Chicago', state: 'IL',
    contactTitle: 'VP of Design & Construction', website: 'realhospitalitygroup.com',
    category: 'dinoc',
    pitchAngle: "Real Hospitality manages 40+ hotel properties across the US with a strong Midwest portfolio. Their centralized design and construction team specifies DI-NOC for all property improvements across their managed portfolio.",
  },
  {
    id: 'hos-067', company: 'Sage Hospitality — Midwest Portfolio', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Construction & Design', website: 'sagehospitality.com',
    category: 'dinoc',
    pitchAngle: "Sage manages boutique and lifestyle hotels in Indiana and nearby markets. Their design-forward approach to hotel renovation makes them strong DI-NOC and Rea Tec specifiers.",
  },
  {
    id: 'hos-068', company: 'Pyramid Global Hospitality', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional VP of Operations', website: 'pyramidglobalhosp.com',
    category: 'dinoc',
    pitchAngle: "Pyramid Global manages 300+ hotels and resorts worldwide with a strong Midwest portfolio. Their centralized renovation program is where DI-NOC specifications are made. Corporate vendor approval = national rollout.",
  },
  {
    id: 'hos-069', company: 'Aimbridge Hospitality — Great Lakes Region', city: 'Chicago', state: 'IL',
    contactTitle: 'Regional Director of Engineering', website: 'aimbridgehospitality.com',
    category: 'dinoc',
    pitchAngle: "Aimbridge is the world's largest independent hotel management company. Their Great Lakes region covers dozens of Indiana, Ohio, Michigan, and Illinois hotels. Getting approved as an Aimbridge preferred vendor = access to their entire portfolio.",
  },
  {
    id: 'hos-070', company: 'Concord Hospitality — Indiana / Ohio', city: 'Raleigh', state: 'IN',
    contactTitle: 'VP of Design & Construction', website: 'concordhospitality.com',
    category: 'dinoc',
    pitchAngle: "Concord develops and manages Marriott, Hilton, and Hyatt brands across the Midwest. Their design and construction team specifies surface materials for PIPs and new builds. DI-NOC is a standard in their renovation specifications.",
  },

  // ── Event / Wedding Venues ────────────────────────────────────────────────
  {
    id: 'hos-071', company: 'Ritz Charles — Indianapolis Venues', city: 'Carmel', state: 'IN',
    contactTitle: 'Director of Facilities & Events', website: 'ritzcharles.com',
    category: 'dinoc',
    pitchAngle: "Ritz Charles operates multiple upscale event venues in Indianapolis. Their venue renovation for corporate events and weddings includes DI-NOC accent surfaces and branded wall graphics for the event experience.",
  },
  {
    id: 'hos-072', company: 'The Crane Bay — Indianapolis Waterfront Venue', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Venue Manager', website: 'cranebay.com',
    category: 'dinoc',
    pitchAngle: "Crane Bay is a stunning waterfront event venue on the White River. Their industrial-chic aesthetic is a DI-NOC metal and concrete finish showcase. Ongoing renovation projects for event space upgrades.",
  },
  {
    id: 'hos-073', company: 'The Conrad Indianapolis — Luxury Hotel & Venue', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Director of Engineering', website: 'conradindianapolis.com',
    category: 'dinoc',
    pitchAngle: "The Conrad is Indianapolis's most luxurious hotel. Their renovation program maintains 5-star standards for art installation, surface materials, and feature wall treatments. Premium DI-NOC and Rea Tec specification.",
  },
  {
    id: 'hos-074', company: 'Columbus Museum of Art / Short North Arts Venues', city: 'Columbus', state: 'OH',
    contactTitle: 'Director of Facilities', website: 'columbusmuseum.org',
    category: 'dinoc',
    pitchAngle: "Arts institutions in Columbus's Short North arts district renovate spaces frequently for exhibitions and events. DI-NOC and specialty surface films for exhibition spaces, wayfinding, and branded installations.",
  },
  {
    id: 'hos-075', company: 'Adler Planetarium / Field Museum — Chicago Events', city: 'Chicago', state: 'IL',
    contactTitle: 'Director of Special Events & Facilities', website: 'adlerplanetarium.org',
    category: 'dinoc',
    pitchAngle: "Chicago's lakefront cultural institutions host major corporate and social events. Their branded wayfinding, DI-NOC surface treatments, and specialty graphics for event spaces are a recurring project pipeline.",
  },

  // ── Quick Service / Fast Casual Renovation ───────────────────────────────
  {
    id: 'hos-076', company: 'McDonald\'s Owner/Operator Group — Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Franchise Construction Manager', website: 'mcdonalds.com',
    category: 'dinoc',
    pitchAngle: "McDonald's Experience of the Future remodel program requires complete interior surface renovation including DI-NOC for counter surfaces, menu board surrounds, and feature wall treatments. Indiana franchise groups own 100+ locations.",
  },
  {
    id: 'hos-077', company: 'Subway Development Corp. — Indiana Franchise', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Development Director', website: 'subway.com',
    category: 'dinoc',
    pitchAngle: "Subway's Fresh Forward redesign requires extensive DI-NOC and vinyl surface applications for counter wraps, menu board surrounds, and wall graphics. Indiana has 600+ Subway locations — franchise group remodel contract = huge volume.",
  },
  {
    id: 'hos-078', company: 'Panera Bread — Corporate Bakery-Cafe Renovations', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Facilities Manager', website: 'panerabread.com',
    category: 'dinoc',
    pitchAngle: "Panera's Warmth renovation program uses wood-grain DI-NOC for wall treatments, counter surfaces, and booth dividers. Their Midwest renovation cycle is a direct DI-NOC sales opportunity.",
  },
  {
    id: 'hos-079', company: 'Culver\'s — Midwest Franchise Operations', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Franchise Facilities Coordinator', website: 'culvers.com',
    category: 'dinoc',
    pitchAngle: "Culver's has 600+ Midwest locations. Their new build and remodel program specifies branded graphics and surface treatments. Franchise owners make local renovation decisions with brand guideline guidance.",
  },
  {
    id: 'hos-080', company: 'Starbucks District — Indianapolis / Columbus', city: 'Indianapolis', state: 'IN',
    contactTitle: 'District Manager / Facilities Contact', website: 'starbucks.com',
    category: 'dinoc',
    pitchAngle: "Starbucks renovates stores on a regular cycle and uses branded wall graphics, DI-NOC for counter and bar surfaces, and specialty finishes for their premium store designs. District-level facilities contacts manage local renovation approvals.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────

function pluralize(n, s, p) {
  return `${n.toLocaleString()} ${n === 1 ? s : p}`;
}

async function main() {
  console.log('\n🏨 WrapLeads — Hospitality & Restaurant Seed');
  console.log(`   ${HOSPITALITY_LEADS.length} leads: hotels, restaurants, venues, catering\n`);

  try { await pool.query('SELECT 1 FROM leads LIMIT 1'); }
  catch (e) { console.error('❌ DB not ready:', e.message); process.exit(1); }

  const userRes = await pool.query(`SELECT id FROM users LIMIT 1`);
  if (!userRes.rows.length) { console.error('❌ No users found.'); process.exit(1); }
  const userId = userRes.rows[0].id;

  let inserted = 0, skipped = 0;

  for (const lead of HOSPITALITY_LEADS) {
    const companyRes = await pool.query(`
      INSERT INTO companies (source, source_id, name, city, state, country, industry, website, raw_data)
      VALUES ('seed_hospitality', $1, $2, $3, $4, 'US', 'hospitality', $5, $6::jsonb)
      ON CONFLICT (source, source_id) DO UPDATE SET
        name = EXCLUDED.name, city = EXCLUDED.city, state = EXCLUDED.state,
        website = EXCLUDED.website, raw_data = EXCLUDED.raw_data, updated_at = NOW()
      RETURNING id
    `, [
      lead.id,
      lead.company,
      lead.city,
      lead.state,
      lead.website || null,
      JSON.stringify({ record_type: 'hospitality', category: lead.category, pitch_angle: lead.pitchAngle }),
    ]);
    const clientId = companyRes.rows[0].id;

    const res = await pool.query(`
      INSERT INTO leads (
        user_id, client_id, company_name, city, state,
        category, status, contact_title, website, pitch_angle
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, $8, $9)
      ON CONFLICT (user_id, client_id) DO NOTHING
      RETURNING id
    `, [
      userId, clientId,
      lead.company, lead.city, lead.state,
      lead.category,
      lead.contactTitle,
      lead.website || null,
      lead.pitchAngle,
    ]);

    if (res.rowCount > 0) inserted++; else skipped++;
  }

  console.log(`✓ Done`);
  console.log(`   ${pluralize(inserted, 'new hospitality lead', 'new hospitality leads')} inserted`);
  console.log(`   ${pluralize(skipped, 'record', 'records')} skipped (already existed)\n`);
  console.log(`💡 Next steps:`);
  console.log(`   - Filter by category='dinoc' → hotel management groups are top priority`);
  console.log(`   - White Lodging + Aimbridge + Pyramid = 300+ hotels with one vendor approval`);
  console.log(`   - Filter by category='fleet' → catering company vans are fast fleet wins\n`);

  await pool.end();
}

main().catch(e => { console.error('\n❌ Failed:', e.message); process.exit(1); });
