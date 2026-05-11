#!/usr/bin/env node
/**
 * seed-dealerships.js — Seeds auto dealer leads across IN, OH, MI, IL, KY
 * into the WrapLeads CRM leads table.
 *
 * Dealers are a massive fleet wrap opportunity:
 *   1. Service department vans/trucks (10–30 vehicles per rooftop)
 *   2. Loaner fleets, shuttle vans, courtesy vehicles
 *   3. DI-NOC for showroom renovations, feature walls, elevator cabs
 *   4. Color-change + protection film for lot vehicles
 *
 * Multi-rooftop dealer groups have 50–200+ fleet vehicles each.
 *
 * Run: node seed-dealerships.js
 * Safe to re-run — ON CONFLICT DO NOTHING via client_id.
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DEALER_LEADS = [
  // ── Indiana — Indianapolis Metro ─────────────────────────────────────────
  {
    id: 'dlr-001', company: 'Ray Skillman Automotive Group', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Fleet & Commercial Director', website: 'rayskillman.com',
    fleetSize: '200+', category: 'fleet',
    pitchAngle: "Ray Skillman operates 15+ rooftops in Indianapolis — their service fleet is enormous. Full-color branded graphics on every service van = rolling billboards across the metro. Also strong DI-NOC candidate for showroom renovations when brands mandate refreshes.",
  },
  {
    id: 'dlr-002', company: 'Tom Wood Automotive Group', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Operations Director / General Manager', website: 'tomwood.com',
    fleetSize: '150+', category: 'fleet',
    pitchAngle: "Tom Wood runs Jaguar, Land Rover, Porsche, Volkswagen, and Subaru rooftops in Indianapolis. Premium brands = premium service fleet wrap expectations. Their loaner fleet alone is 80+ vehicles. DI-NOC for showroom accent walls is a fit with their luxury brand standards.",
  },
  {
    id: 'dlr-003', company: 'Andy Mohr Automotive', city: 'Plainfield', state: 'IN',
    contactTitle: 'Director of Fixed Operations', website: 'andymohr.com',
    fleetSize: '120+', category: 'fleet',
    pitchAngle: "Andy Mohr has 10+ rooftops in the Indianapolis market — Ford, Chevy, Honda, Toyota, and more. Their service department shuttle vans and loaner vehicles run thousands of miles/month. Fleet wrap contract with one group = 100+ vehicles.",
  },
  {
    id: 'dlr-004', company: 'Dreyer & Reinbold BMW / Audi / Porsche', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Service Director / Facility Manager', website: 'dreyerandreinbold.com',
    fleetSize: '60+', category: 'fleet',
    pitchAngle: "Luxury Bavarian dealer group — brand standards require premium presentation. DI-NOC architectural film for showroom renovation is a natural fit. Service loaners and courtesy vans need consistent luxury-level graphics to match the brand image.",
  },
  {
    id: 'dlr-005', company: 'Bob Rohrman Auto Group — Indiana', city: 'Lafayette', state: 'IN',
    contactTitle: 'Group Fleet Manager', website: 'rohrman.com',
    fleetSize: '180+', category: 'fleet',
    pitchAngle: "Bob Rohrman runs 20+ rooftops across Indiana and Illinois — one of the largest Midwest dealer groups. Their service fleet and shuttle vans span dozens of locations. A group-level fleet wrap agreement would be transformative.",
  },
  {
    id: 'dlr-006', company: 'Hubler Automotive Group', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Fixed Operations Director', website: 'hubler.com',
    fleetSize: '100+', category: 'fleet',
    pitchAngle: "Hubler has been Indianapolis's family dealer group for 80+ years — strong community brand. Service department vehicles are ripe for full-color fleet graphics. Their Hubler Chevrolet, Toyota, and Nissan rooftops all share service operations.",
  },
  {
    id: 'dlr-007', company: 'Hare Automotive', city: 'Noblesville', state: 'IN',
    contactTitle: 'General Manager / Service Director', website: 'hare.com',
    fleetSize: '60', category: 'fleet',
    pitchAngle: "Hare Chevrolet in Noblesville is one of the top-volume Chevy dealers in Indiana. Their service fleet and off-site shuttle vans see high daily mileage. Fleet wrap + DI-NOC for their showroom renovation pipeline.",
  },
  {
    id: 'dlr-008', company: "O'Brien Toyota / AutoPark Indiana", city: 'Indianapolis', state: 'IN',
    contactTitle: 'Fleet Sales Manager', website: 'obrientoyota.com',
    fleetSize: '75', category: 'fleet',
    pitchAngle: "O'Brien Toyota runs a high-volume service department with 30+ loaner vehicles. Their AutoPark campus spans multiple brands. Fleet wrap conversation should start with the shuttle and loaner program.",
  },
  {
    id: 'dlr-009', company: 'Don Hinds Ford / Lincoln', city: 'Fishers', state: 'IN',
    contactTitle: 'Service Manager', website: 'donhinds.com',
    fleetSize: '50', category: 'fleet',
    pitchAngle: "Don Hinds Ford in Fishers serves the affluent north Indianapolis market. Ford fleet vehicles are the most common wrap canvas in the country. Their company vehicles, shuttle vans, and loaner fleet are straightforward fleet wrap wins.",
  },
  {
    id: 'dlr-010', company: 'Gurley Leep Automotive Group', city: 'Mishawaka', state: 'IN',
    contactTitle: 'Operations Director', website: 'gurleyleep.com',
    fleetSize: '90', category: 'fleet',
    pitchAngle: "Gurley Leep is the dominant dealer group in South Bend/Mishawaka — 8+ rooftops covering Toyota, Honda, Volkswagen, Buick, and more. Fleet wraps for their service and shuttle vehicles, DI-NOC for showroom updates.",
  },
  {
    id: 'dlr-011', company: 'Blossom Chevrolet', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Service Director', website: 'blossomchevrolet.com',
    fleetSize: '40', category: 'fleet',
    pitchAngle: "Blossom is one of Indy's legacy Chevrolet dealers — well-established brand. Silverado and Colorado service trucks are the backbone of their fleet. Fleet graphics and DI-NOC for their service reception renovation.",
  },
  {
    id: 'dlr-012', company: 'Penske Automotive — Indiana Rooftops', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Retail Operations Manager', website: 'penskeautomotive.com',
    fleetSize: '200+', category: 'fleet',
    pitchAngle: "Penske operates multiple luxury and volume rooftops in Indianapolis. Corporate dealer groups like Penske negotiate fleet wrap contracts at the group level — getting into Penske = recurring multi-location revenue.",
  },
  {
    id: 'dlr-013', company: 'Indy Luxury Group (BMW Indy / Mercedes Indy)', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Facility & Brand Compliance Manager', website: 'bmwindy.com',
    fleetSize: '60', category: 'fleet',
    pitchAngle: "BMW and Mercedes brand compliance requires showroom quality to match product quality. DI-NOC architectural film for reception walls, service lane graphics, and customer lounge renovations. Plus 40+ loaner vehicle fleet.",
  },
  {
    id: 'dlr-014', company: 'AutoMax Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'General Manager', website: 'automaxindiana.com',
    fleetSize: '35', category: 'fleet',
    pitchAngle: "Independent used vehicle group with strong repeat customer base. Fleet wrap on their driver vehicles and lot prep vans, DI-NOC for showroom refresh — accessible decision maker, faster sales cycle than large groups.",
  },
  {
    id: 'dlr-015', company: 'Camping World / Good Sam — Indianapolis', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Retail Operations Manager', website: 'campingworld.com',
    fleetSize: '40', category: 'fleet',
    pitchAngle: "Camping World's Indianapolis location moves dozens of RVs per month. Their delivery and service fleet is a constant presence on I-465. RV-adjacent fleet (tow vehicles, shuttle vans) + DI-NOC for the store interior refresh.",
  },

  // ── Indiana — Fort Wayne ──────────────────────────────────────────────────
  {
    id: 'dlr-016', company: 'North American Auto Group (Fort Wayne)', city: 'Fort Wayne', state: 'IN',
    contactTitle: 'Service Director / Fleet Manager', website: 'northamericanauto.com',
    fleetSize: '80', category: 'fleet',
    pitchAngle: "North American covers multiple brands in Fort Wayne — a regional hub with high commercial vehicle density. Fleet wraps and DI-NOC for showroom renovations when each brand cycles its CI update.",
  },
  {
    id: 'dlr-017', company: 'Bob Thomas Ford Lincoln', city: 'Fort Wayne', state: 'IN',
    contactTitle: 'General Manager', website: 'bobthomasford.com',
    fleetSize: '50', category: 'fleet',
    pitchAngle: "Bob Thomas is the dominant Ford dealer in the Fort Wayne market. Transit vans, F-150s, and Explorers make up their service fleet. Fleet wrap contract = easy brand consistency.",
  },
  {
    id: 'dlr-018', company: 'Glenbrook Dodge / Chrysler / Jeep / Ram', city: 'Fort Wayne', state: 'IN',
    contactTitle: 'Service Manager', website: 'glenbrookdodge.com',
    fleetSize: '45', category: 'fleet',
    pitchAngle: "High-volume Ram and Jeep dealer — Ram ProMaster and ProMaster City vans are among the most-wrapped fleet vehicles in the country. Their service department fleet is a natural starting conversation.",
  },

  // ── Ohio — Columbus ──────────────────────────────────────────────────────
  {
    id: 'dlr-019', company: 'Germain Motor Company', city: 'Columbus', state: 'OH',
    contactTitle: 'Group Operations Director', website: 'germainmotorcompany.com',
    fleetSize: '200+', category: 'fleet',
    pitchAngle: "Germain is one of Ohio's largest dealer groups — 20+ rooftops across Columbus, Cincinnati, and Nashville. Group-level fleet agreement would cover 150+ service and loaner vehicles. DI-NOC for their constant brand refresh projects.",
  },
  {
    id: 'dlr-020', company: 'Ricart Automotive Group', city: 'Columbus', state: 'OH',
    contactTitle: 'Fleet & Commercial Director', website: 'ricart.com',
    fleetSize: '150+', category: 'fleet',
    pitchAngle: "Ricart operates the 'World's Largest Ford Store' claim and a massive used vehicle campus in Groveport. Their service fleet, BRT (Bus Rapid Transit) shuttles, and delivery vans are high-visibility across Columbus. Fleet wrap = rolling brand.",
  },
  {
    id: 'dlr-021', company: 'Performance Columbus Dealer Group', city: 'Columbus', state: 'OH',
    contactTitle: 'Director of Fixed Operations', website: 'performancecolumbus.com',
    fleetSize: '120', category: 'fleet',
    pitchAngle: "Performance Columbus runs Lexus, Acura, Infiniti, and Cadillac in central Ohio. Luxury brands require premium presentation. DI-NOC for showroom feature walls, loaner fleet wrap in coordinated luxury graphics.",
  },
  {
    id: 'dlr-022', company: 'Bob Boyd Lincoln / Ford', city: 'Columbus', state: 'OH',
    contactTitle: 'General Manager', website: 'bobboyd.com',
    fleetSize: '60', category: 'fleet',
    pitchAngle: "Bob Boyd is a cornerstone Columbus Ford dealer. Their service department runs dozens of loaner and shuttle vehicles. Fleet wrap with Ford Transit vans is a fast win.",
  },
  {
    id: 'dlr-023', company: 'Byers Auto Group', city: 'Columbus', state: 'OH',
    contactTitle: 'Group Fleet Manager', website: 'byersauto.com',
    fleetSize: '140', category: 'fleet',
    pitchAngle: "Byers is a generational Ohio dealer group covering 10+ brands. Their large-format shuttle and loaner fleet runs daily across Columbus suburbs. Fleet wrap + DI-NOC for ongoing showroom CI programs.",
  },
  {
    id: 'dlr-024', company: 'Jeff Wyler Automotive Family — Ohio', city: 'Cincinnati', state: 'OH',
    contactTitle: 'Corporate Fleet Director', website: 'jeffwyler.com',
    fleetSize: '200+', category: 'fleet',
    pitchAngle: "Jeff Wyler is one of the largest dealer groups in the Ohio/Indiana/Kentucky tri-state. Multi-rooftop fleet wrap agreement + DI-NOC for their constant brand refresh renovations. Group purchase = significant scale.",
  },
  {
    id: 'dlr-025', company: 'Coughlin Automotive Group', city: 'Columbus', state: 'OH',
    contactTitle: 'Operations Director', website: 'coughlinautomotive.com',
    fleetSize: '160', category: 'fleet',
    pitchAngle: "Coughlin covers 15+ rooftops across Ohio — Chevrolet, Ford, Hyundai, Nissan, and more. Their service fleet is one of the largest in central Ohio. Wrap their vans, target their facility manager for DI-NOC.",
  },
  {
    id: 'dlr-026', company: 'Ganley Automotive Group', city: 'Cleveland', state: 'OH',
    contactTitle: 'Group Fleet Director', website: 'ganley.com',
    fleetSize: '180+', category: 'fleet',
    pitchAngle: "Ganley is Cleveland's dominant multi-brand dealer group with 25+ rooftops. Northeast Ohio fleet = massive vehicle wrap market. Group-level relationship = annual contract.",
  },
  {
    id: 'dlr-027', company: 'Fred Martin Superstore', city: 'Barberton', state: 'OH',
    contactTitle: 'Service Director', website: 'fredmartinsuperstore.com',
    fleetSize: '80', category: 'fleet',
    pitchAngle: "Fred Martin is one of the highest-volume dealers in Northeast Ohio — their service department runs 30+ loaner vehicles constantly. Fleet wrap starting point: their shuttle and loaner van program.",
  },
  {
    id: 'dlr-028', company: 'Spitzer Automotive — Ohio', city: 'Elyria', state: 'OH',
    contactTitle: 'Group Operations Manager', website: 'spitzer.com',
    fleetSize: '120', category: 'fleet',
    pitchAngle: "Spitzer runs 10+ rooftops across Northeast Ohio. Their service fleets and transportation vehicles are a consistent fleet wrap target. DI-NOC for showroom renovations when Spitzer cycles brand updates.",
  },
  {
    id: 'dlr-029', company: 'Kings Automall / Kings Chevrolet', city: 'Cincinnati', state: 'OH',
    contactTitle: 'Service Manager / Fleet Coordinator', website: 'kingsauto.com',
    fleetSize: '70', category: 'fleet',
    pitchAngle: "Kings Automall is one of the busiest Chevy dealers in the Cincinnati metro. Silverado and Transit pickups dominate their service fleet. Fleet graphics and DI-NOC for facility renovations.",
  },
  {
    id: 'dlr-030', company: 'Dealer.com / AutoNation Ohio Rooftops', city: 'Columbus', state: 'OH',
    contactTitle: 'Regional Fleet & Facilities Director', website: 'autonation.com',
    fleetSize: '300+', category: 'fleet',
    pitchAngle: "AutoNation operates multiple Ohio rooftops as a public dealer group. Corporate account potential — fleet wrap contract across Ohio locations would be one of the largest single agreements in the region.",
  },

  // ── Michigan ─────────────────────────────────────────────────────────────
  {
    id: 'dlr-031', company: 'LaFontaine Automotive Group', city: 'Highland', state: 'MI',
    contactTitle: 'Corporate Fleet Director', website: 'lafontaine.com',
    fleetSize: '250+', category: 'fleet',
    pitchAngle: "LaFontaine is Michigan's largest family-owned dealer group — 20+ rooftops from Metro Detroit to Lansing. Their community-focused brand is a natural storytelling subject for vehicle wraps. Group-level fleet wrap contract = 150+ vehicles.",
  },
  {
    id: 'dlr-032', company: 'Fox Motors — Michigan', city: 'Grand Rapids', state: 'MI',
    contactTitle: 'Group Operations Director', website: 'foxmotors.com',
    fleetSize: '180+', category: 'fleet',
    pitchAngle: "Fox Motors covers 10+ brands in West Michigan and the Upper Peninsula. Their commitment to community is strong — wrap their service and loaner fleet to reinforce it. DI-NOC for showroom renovations across the group.",
  },
  {
    id: 'dlr-033', company: 'Serra Automotive — Michigan', city: 'Grand Rapids', state: 'MI',
    contactTitle: 'Fleet & Facilities Manager', website: 'serracars.com',
    fleetSize: '160+', category: 'fleet',
    pitchAngle: "Serra has rooftops across Michigan and Indiana. Multi-state dealer group = group-level fleet wrap agreement. Their brand identity is consistent across locations — fleet wraps should be too.",
  },
  {
    id: 'dlr-034', company: 'Suburban Ford of Sterling Heights', city: 'Sterling Heights', state: 'MI',
    contactTitle: 'Service & Fleet Director', website: 'suburbanfordsterlingheights.com',
    fleetSize: '90', category: 'fleet',
    pitchAngle: "Suburban Ford is one of Metro Detroit's highest-volume Ford dealers. Transit commercial vans and F-150s make up their service and loaner fleet. Fleet wraps with Ford Transit are among the most popular formats.",
  },
  {
    id: 'dlr-035', company: 'Golling Chrysler Dodge Jeep Ram', city: 'Bloomfield Hills', state: 'MI',
    contactTitle: 'General Manager', website: 'golling.com',
    fleetSize: '70', category: 'fleet',
    pitchAngle: "Golling is a premium CDJR dealer in Bloomfield Hills — upscale market. Ram ProMasters in their service fleet, DI-NOC for showroom accent walls matching Jeep brand standards.",
  },
  {
    id: 'dlr-036', company: 'Varsity Ford / Lincoln — Ann Arbor', city: 'Ann Arbor', state: 'MI',
    contactTitle: 'Service Operations Manager', website: 'varsityford.com',
    fleetSize: '60', category: 'fleet',
    pitchAngle: "University market dealer — Varsity Ford serves Ann Arbor's professional and academic community. Fleet wrap on their Transit vans and company vehicles reinforces their community presence.",
  },
  {
    id: 'dlr-037', company: 'Mike Morse Collision & Rental Rooftop Group', city: 'Detroit', state: 'MI',
    contactTitle: 'Operations Director', website: 'mikemorse.com',
    fleetSize: '80', category: 'fleet',
    pitchAngle: "High-volume Detroit area group with strong service department. Fleet graphics, paint protection film, and DI-NOC for their service lane and customer lounge renovation.",
  },
  {
    id: 'dlr-038', company: 'Kelly Auto Group — Michigan', city: 'Lansing', state: 'MI',
    contactTitle: 'Fleet Manager', website: 'kellyauto.com',
    fleetSize: '70', category: 'fleet',
    pitchAngle: "Kelly covers Ford, Chevrolet, Chrysler, and more in the Lansing market. Their loaner and service fleet moves constantly through the state capital area. Fleet wrap deal = strong regional referrals.",
  },
  {
    id: 'dlr-039', company: 'Kia of Lansing / Hyundai of Lansing', city: 'Lansing', state: 'MI',
    contactTitle: 'Service Director', website: 'kiaoflansingmi.com',
    fleetSize: '35', category: 'fleet',
    pitchAngle: "Korean brand dealers are investing heavily in service experience upgrades. Loaner fleet wraps + DI-NOC for service lane renovation are fast-approval projects.",
  },
  {
    id: 'dlr-040', company: 'RV One Superstores — Michigan', city: 'Grand Rapids', state: 'MI',
    contactTitle: 'Retail Operations Manager', website: 'rvone.com',
    fleetSize: '45', category: 'fleet',
    pitchAngle: "RV dealers have large service lots and delivery crews with high-visibility vehicle needs. RV One's Grand Rapids location is a major Great Lakes campus. Fleet wrap on their service and delivery vehicles.",
  },

  // ── Illinois ─────────────────────────────────────────────────────────────
  {
    id: 'dlr-041', company: 'McGrath Automotive Group — Illinois', city: 'Chicago', state: 'IL',
    contactTitle: 'Group Fleet & Facilities Manager', website: 'mcgrathauto.com',
    fleetSize: '200+', category: 'fleet',
    pitchAngle: "McGrath runs 10+ rooftops in the Chicago suburbs — Acura, Honda, Buick, Cadillac, and more. Suburban Chicago fleet vehicles cover massive daily mileage. DI-NOC for showroom renovations, fleet wraps for service vans.",
  },
  {
    id: 'dlr-042', company: 'Patrick Dealer Group — Illinois', city: 'Schaumburg', state: 'IL',
    contactTitle: 'Corporate Operations Director', website: 'patrickdealergroup.com',
    fleetSize: '170+', category: 'fleet',
    pitchAngle: "Patrick covers BMW, Mercedes, Cadillac, Volvo, Maserati, and more in Chicagoland. Ultra-luxury group = maximum DI-NOC showroom fit. Their loaner fleet of premium vehicles needs consistent brand wraps.",
  },
  {
    id: 'dlr-043', company: 'Zeigler Automotive Group — Illinois', city: 'Schaumburg', state: 'IL',
    contactTitle: 'Group Fleet Director', website: 'zieglerautomotive.com',
    fleetSize: '220+', category: 'fleet',
    pitchAngle: "Zeigler has exploded into one of the Midwest's biggest groups — 30+ rooftops in IL, IN, MI, and WI. A corporate fleet wrap agreement with Zeigler would be one of the largest single deals in the region.",
  },
  {
    id: 'dlr-044', company: 'Napleton Automotive Group', city: 'Chicago', state: 'IL',
    contactTitle: 'Regional Fleet Manager', website: 'napleton.com',
    fleetSize: '300+', category: 'fleet',
    pitchAngle: "Napleton is one of the country's 15 largest dealer groups with massive Chicago market presence. Corporate fleet wrap contract = 200+ vehicles minimum. They also have constant showroom renovation activity.",
  },
  {
    id: 'dlr-045', company: 'Mike Anderson Chevrolet — Illinois', city: 'Chicago', state: 'IL',
    contactTitle: 'Service Director', website: 'mikeandersonchevy.com',
    fleetSize: '80', category: 'fleet',
    pitchAngle: "Mike Anderson Chevy is one of the highest-volume Chevy stores in Illinois. Their service fleet and courtesy vans cover all of Chicago's south side. Fleet wrap + Silverado and Express van graphics.",
  },
  {
    id: 'dlr-046', company: 'Elmhurst Toyota', city: 'Elmhurst', state: 'IL',
    contactTitle: 'Fixed Operations Director', website: 'elmhursttoyota.com',
    fleetSize: '70', category: 'fleet',
    pitchAngle: "Elmhurst Toyota is a consistently top-20 Toyota dealer in the Midwest. Sienna and Highlander loaners plus Tacoma service trucks — natural fleet wrap targets. DI-NOC for service reception and lounge renovation.",
  },
  {
    id: 'dlr-047', company: 'Rosen Automotive Group — Illinois', city: 'Chicago', state: 'IL',
    contactTitle: 'Operations Manager', website: 'rosenauto.com',
    fleetSize: '90', category: 'fleet',
    pitchAngle: "Rosen operates in the Chicago north suburbs with Honda, Nissan, and other brands. Service shuttle vans and loaner vehicles + DI-NOC for ongoing brand compliance renovations.",
  },
  {
    id: 'dlr-048', company: 'Bloomington Normal Autopark Group', city: 'Bloomington', state: 'IL',
    contactTitle: 'General Manager', website: 'bnAutopark.com',
    fleetSize: '80', category: 'fleet',
    pitchAngle: "Bloomington-Normal Autopark covers most major brands at a campus location. University market dealer with consistent service fleet. Fleet wraps + DI-NOC for the campus renovation cycles.",
  },
  {
    id: 'dlr-049', company: 'Landmark Ford / Lincoln — Springfield IL', city: 'Springfield', state: 'IL',
    contactTitle: 'Service Director', website: 'landmarkford.com',
    fleetSize: '50', category: 'fleet',
    pitchAngle: "State capital Ford dealer — government fleet adjacency means visibility matters. Fleet wraps on their service trucks. DI-NOC for their showroom renovation when Ford mandates CI updates.",
  },
  {
    id: 'dlr-050', company: 'Car-X Tire & Auto / Mavis Discount Tire — Illinois Stores', city: 'Chicago', state: 'IL',
    contactTitle: 'Regional Operations Manager', website: 'carx.com',
    fleetSize: '60', category: 'fleet',
    pitchAngle: "Service chain with 40+ Illinois locations — their service vans and courtesy vehicles run constantly across Chicagoland. Fleet wrap agreement with Car-X/Mavis covers the whole network.",
  },

  // ── Kentucky ──────────────────────────────────────────────────────────────
  {
    id: 'dlr-051', company: 'Swope Family of Dealerships', city: 'Louisville', state: 'KY',
    contactTitle: 'Group Fleet Manager', website: 'swopeauto.com',
    fleetSize: '120', category: 'fleet',
    pitchAngle: "Swope is Louisville's largest dealer group — 8 rooftops covering Toyota, Hyundai, Chrysler, Ford, and more. Fleet wrap + DI-NOC for showroom renovations. Strong family-owned brand that values presentation.",
  },
  {
    id: 'dlr-052', company: 'Oxmoor Auto Group', city: 'Louisville', state: 'KY',
    contactTitle: 'Director of Operations', website: 'oxmoorauto.com',
    fleetSize: '100', category: 'fleet',
    pitchAngle: "Oxmoor Auto Group covers BMW, Mercedes, Porsche, and Toyota in Louisville's most affluent corridor. Luxury brand = premium DI-NOC interior fit plus high-end loaner fleet wraps.",
  },
  {
    id: 'dlr-053', company: 'Paul Miller Ford Lincoln', city: 'Louisville', state: 'KY',
    contactTitle: 'Service Manager', website: 'paulmillerford.com',
    fleetSize: '60', category: 'fleet',
    pitchAngle: "Paul Miller is a landmark Louisville Ford store with deep community roots. Transit van fleet and F-150 service trucks — classic fleet wrap targets.",
  },
  {
    id: 'dlr-054', company: 'Tafel Motors — Louisville', city: 'Louisville', state: 'KY',
    contactTitle: 'General Manager', website: 'tafelmotors.com',
    fleetSize: '50', category: 'fleet',
    pitchAngle: "Tafel covers Porsche, Audi, and Volkswagen in Louisville. DI-NOC for VW and Audi brand-mandated showroom refresh programs. Loaner fleet for premium brands should match premium presentation.",
  },
  {
    id: 'dlr-055', company: 'Lexington Toyota / Lexington Chevy Group', city: 'Lexington', state: 'KY',
    contactTitle: 'Fixed Operations Director', website: 'lexingtontoyota.com',
    fleetSize: '80', category: 'fleet',
    pitchAngle: "Lexington's high-volume Toyota and Chevy stores serve Central Kentucky's strong economy. Fleet wraps on Tacoma and Silverado service trucks, DI-NOC for Toyota's ongoing showroom renovation mandates.",
  },

  // ── RV / Powersports / Specialty Dealers ────────────────────────────────
  {
    id: 'dlr-056', company: 'Colerain RV — Cincinnati', city: 'Cincinnati', state: 'OH',
    contactTitle: 'Service Operations Manager', website: 'colerain.com',
    fleetSize: '35', category: 'fleet',
    pitchAngle: "One of the largest RV dealerships in the country by volume. Their service and delivery fleet is extensive. RV prep vehicles and service trucks wrap well. DI-NOC for their indoor service reception and showroom.",
  },
  {
    id: 'dlr-057', company: "Pete's RV Center — Indiana", city: 'South Bend', state: 'IN',
    contactTitle: 'General Manager', website: 'petesrv.com',
    fleetSize: '30', category: 'fleet',
    pitchAngle: "Pete's is a major Great Lakes RV dealer. Fleet wrap on their delivery and service vehicles. DI-NOC for their indoor showroom renovation — RV dealers invest heavily in the customer experience.",
  },
  {
    id: 'dlr-058', company: 'Motoamerica / Harley-Davidson of Indianapolis', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Service Director / General Manager', website: 'hdindianapolis.com',
    fleetSize: '20', category: 'fleet',
    pitchAngle: "HD dealers have strong brand graphics traditions. Service van and courtesy vehicle wraps should be full H-D brand identity. DI-NOC for their showroom renovation when H-D mandates Harley Authentics retail standards.",
  },
  {
    id: 'dlr-059', company: "Russ Darrow Group — Wisconsin/Illinois", city: 'Milwaukee', state: 'IL',
    contactTitle: 'Corporate Fleet Director', website: 'russdarrow.com',
    fleetSize: '180+', category: 'fleet',
    pitchAngle: "Russ Darrow has 20+ rooftops in Wisconsin and Northern Illinois. Cross-border group = regional fleet wrap agreement opportunity. Their consistent brand identity across locations is a strong fleet wrap argument.",
  },
  {
    id: 'dlr-060', company: 'AutoNation USA — Indianapolis', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Operations Director', website: 'autonation.com',
    fleetSize: '100+', category: 'fleet',
    pitchAngle: "AutoNation's Indianapolis used car superstore operates a large delivery and courtesy fleet. Corporate account at a national group level — getting approved as a preferred vendor with AutoNation could unlock 60+ rooftops nationally.",
  },

  // ── Specialty Dealers / Service Chains ──────────────────────────────────
  {
    id: 'dlr-061', company: 'Firestone Complete Auto Care — Indiana District', city: 'Indianapolis', state: 'IN',
    contactTitle: 'District Operations Manager', website: 'firestonecompleteautocare.com',
    fleetSize: '50', category: 'fleet',
    pitchAngle: "Firestone operates 40+ locations across Indiana. Their mobile tire and service vehicles plus district manager vehicles are fleet wrap targets. District-level deal = 50+ vehicles.",
  },
  {
    id: 'dlr-062', company: 'Jiffy Lube — Regional Franchise Group (IN/IL)', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Franchise Director', website: 'jiffylube.com',
    fleetSize: '40', category: 'fleet',
    pitchAngle: "Jiffy Lube franchise groups operate their own service and supply vehicles. Regional franchise owner runs 20-30 locations — their supply and area manager vehicles are fleet wrap targets.",
  },
  {
    id: 'dlr-063', company: 'Midas — Midwest Franchise Group', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Manager / Franchise Owner', website: 'midas.com',
    fleetSize: '35', category: 'fleet',
    pitchAngle: "Midas franchise groups in the Midwest use mobile units for outreach events and supply runs. Fleet graphics reinforce the Midas brand on the road.",
  },
  {
    id: 'dlr-064', company: 'Gerber Collision & Glass — Indiana Locations', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Director', website: 'gerbercollision.com',
    fleetSize: '60', category: 'fleet',
    pitchAngle: "Gerber Collision's Indiana shops run tow trucks, mobile estimators, and courtesy vehicles across the state. Fleet wrap with consistent Gerber brand graphics. DI-NOC for their customer reception renovation.",
  },
  {
    id: 'dlr-065', company: 'Service King Collision — Midwest Locations', city: 'Chicago', state: 'IL',
    contactTitle: 'Regional Fleet Manager', website: 'serviceking.com',
    fleetSize: '80', category: 'fleet',
    pitchAngle: "Service King/Crash Champions runs 30+ Midwest collision shops with tow, rental, and mobile estimating fleets. Group-level fleet wrap agreement = significant vehicle count.",
  },

  // ── Multi-State Mega Groups ───────────────────────────────────────────────
  {
    id: 'dlr-066', company: 'Lithia Motors — Midwest Rooftops', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Operations VP', website: 'lithiamotors.com',
    fleetSize: '400+', category: 'fleet',
    pitchAngle: "Lithia is one of the 3 largest dealer groups in the US. Their Midwest acquisitions (including former Meadowbrook and others) = massive fleet. Getting approved as Lithia preferred fleet vendor = national potential.",
  },
  {
    id: 'dlr-067', company: 'Hendrick Automotive Group — Midwest', city: 'Columbus', state: 'OH',
    contactTitle: 'Regional Fleet Director', website: 'hendrickauto.com',
    fleetSize: '300+', category: 'fleet',
    pitchAngle: "Hendrick operates in Columbus, Cleveland, and other Midwest markets. As one of the 5 largest dealer groups in the country, preferred vendor status with Hendrick = extraordinary recurring revenue.",
  },
  {
    id: 'dlr-068', company: 'Group 1 Automotive — Chicago Area', city: 'Chicago', state: 'IL',
    contactTitle: 'Regional Fleet & Facilities Manager', website: 'group1auto.com',
    fleetSize: '200+', category: 'fleet',
    pitchAngle: "Group 1 Automotive operates multiple Chicago rooftops as a publicly traded group. Their corporate facilities manager handles fleet wrap approvals. Multi-rooftop agreement = significant recurring revenue.",
  },
  {
    id: 'dlr-069', company: 'Asbury Automotive — Midwest Rooftops', city: 'Columbus', state: 'OH',
    contactTitle: 'Regional Operations Director', website: 'asburyauto.com',
    fleetSize: '250+', category: 'fleet',
    pitchAngle: "Asbury is expanding rapidly in Ohio and the Midwest through acquisitions. New-acquisition rooftops need branded fleet wraps fast. Getting in during the integration period = sticky long-term relationship.",
  },
  {
    id: 'dlr-070', company: 'Sonic Automotive — Great Lakes Region', city: 'Detroit', state: 'MI',
    contactTitle: 'Regional Fleet Coordinator', website: 'sonicautomotive.com',
    fleetSize: '200+', category: 'fleet',
    pitchAngle: "Sonic Automotive has strong Michigan presence plus EchoPark used car stores. Their EchoPark standalone stores are a new format with consistent fleet wrap needs. Corporate preferred vendor status = regional and national upside.",
  },

  // ── Used Car Superstores / Independent Groups ────────────────────────────
  {
    id: 'dlr-071', company: 'Byrider Franchise Group — Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Operations Director', website: 'byrider.com',
    fleetSize: '40', category: 'fleet',
    pitchAngle: "J.D. Byrider is headquartered in Indianapolis with 100+ franchise locations nationwide. Their Indianapolis corporate fleet plus franchise support vehicles are fleet wrap targets. HQ deal = national franchise referrals.",
  },
  {
    id: 'dlr-072', company: 'CarMax — Indiana / Ohio Locations', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Operations Manager', website: 'carmax.com',
    fleetSize: '80', category: 'fleet',
    pitchAngle: "CarMax runs large logistics and transport fleets across their Midwest locations. Their vehicle transport and associate courtesy vehicles are fleet wrap targets. Corporate vendor approval = multi-location account.",
  },
  {
    id: 'dlr-073', company: 'DriveTime Automotive — Midwest', city: 'Indianapolis', state: 'IN',
    contactTitle: 'District Manager', website: 'drivetime.com',
    fleetSize: '35', category: 'fleet',
    pitchAngle: "DriveTime operates 30+ Midwest locations with consistent corporate branding. Their district manager and corporate vehicles plus delivery/transport vehicles are fleet wrap candidates.",
  },
  {
    id: 'dlr-074', company: 'United Auto Credit / UACC — Indiana Dealers', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Account Manager', website: 'unitedautocredit.com',
    fleetSize: '25', category: 'fleet',
    pitchAngle: "UACC's field reps and account managers drive branded vehicles across Indiana. Their regional office vehicles and field team fleet are a modest but accessible fleet wrap target.",
  },
  {
    id: 'dlr-075', company: 'First Merchants Auto / Meridian Bank Auto', city: 'Muncie', state: 'IN',
    contactTitle: 'Regional Sales Director', website: 'firstmerchants.com',
    fleetSize: '30', category: 'fleet',
    pitchAngle: "Auto finance/bank-affiliated fleet vehicles for their dealer development team. Branded vehicles for their regional reps — short sales cycle on a fleet wrap decision with a finance company.",
  },

  // ── Auction / Wholesale / Commercial Fleet ──────────────────────────────
  {
    id: 'dlr-076', company: 'ADESA Indianapolis Auto Auction', city: 'Plainfield', state: 'IN',
    contactTitle: 'General Manager / Operations Director', website: 'adesa.com',
    fleetSize: '60', category: 'fleet',
    pitchAngle: "ADESA Indianapolis is one of the largest auto auctions in the Midwest. Their lot attendant and transport vehicles run 24/7 across a massive campus. Fleet wraps + interior DI-NOC for their customer facilities renovation.",
  },
  {
    id: 'dlr-077', company: 'Manheim Indianapolis Auto Auction', city: 'Indianapolis', state: 'IN',
    contactTitle: 'General Manager', website: 'manheim.com',
    fleetSize: '70', category: 'fleet',
    pitchAngle: "Manheim is Cox Automotive's auction brand — their Indianapolis location processes 100k+ vehicles/year. Their lot and transport fleet is substantial. Corporate vendor status with Cox = significant scale.",
  },
  {
    id: 'dlr-078', company: 'Indiana Auto Auction — Terre Haute', city: 'Terre Haute', state: 'IN',
    contactTitle: 'Operations Manager', website: 'indianaaa.com',
    fleetSize: '25', category: 'fleet',
    pitchAngle: "Independent auto auction with its own lot vehicles and transport fleet. Accessible decision maker, strong repeat business potential.",
  },
  {
    id: 'dlr-079', company: 'NAAA Member Dealer Fleet Group — Ohio', city: 'Columbus', state: 'OH',
    contactTitle: 'Fleet Director / Wholesale Manager', website: 'naaa.com',
    fleetSize: '50', category: 'fleet',
    pitchAngle: "NAAA-affiliated wholesale dealers in Ohio operate transport and courtesy fleets. Auction-adjacent accounts have high vehicle volume and clear fleet wrap ROI.",
  },
  {
    id: 'dlr-080', company: 'Enterprise Fleet Management — Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Fleet Account Manager', website: 'enterprisefleet.com',
    fleetSize: '500+', category: 'fleet',
    pitchAngle: "Enterprise Fleet Management manages corporate fleets for hundreds of Indiana companies. Getting into Enterprise's network as a preferred fleet graphics vendor = exponential lead pipeline. They manage the fleet for Fortune 500 clients.",
  },

  // ── Specialty / Power Sports / Equipment Dealers ──────────────────────────
  {
    id: 'dlr-081', company: 'Tracker Marine / Bass Pro Shops — Indianapolis', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Store Operations Manager', website: 'basspro.com',
    fleetSize: '30', category: 'fleet',
    pitchAngle: "Bass Pro / Tracker Marine runs large service departments and delivery operations. Their service vans and retail delivery vehicles are fleet wrap targets. DI-NOC for their massive retail renovation projects.",
  },
  {
    id: 'dlr-082', company: 'Midwest Tractor Sales', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Service Manager', website: 'midwesttractorsales.com',
    fleetSize: '25', category: 'fleet',
    pitchAngle: "Heavy equipment dealer with service fleet. Kubota and John Deere service trucks are fleet wrap candidates. High visibility in agricultural and commercial markets.",
  },
  {
    id: 'dlr-083', company: 'Ohio Cat (Caterpillar Dealer)', city: 'Columbus', state: 'OH',
    contactTitle: 'Fleet Manager', website: 'ohiocat.com',
    fleetSize: '200+', category: 'fleet',
    pitchAngle: "Ohio Cat is the Caterpillar dealer for all of Ohio — their service truck fleet is enormous. Bright yellow Cat-branded fleet wraps across 200+ service vehicles = one of the highest-ROI fleet programs in the region.",
  },
  {
    id: 'dlr-084', company: 'MacAllister Machinery (CAT Dealer — Indiana)', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Fleet & Facilities Director', website: 'macallister.com',
    fleetSize: '150+', category: 'fleet',
    pitchAngle: "MacAllister is Indiana's Cat dealer — 8 locations covering the whole state. Service fleet wraps with Cat yellow and their distinct branding. Large fleet + high-visibility industry = strong ROI argument.",
  },
  {
    id: 'dlr-085', company: 'Van Keppel Equipment — Illinois / Kansas', city: 'Chicago', state: 'IL',
    contactTitle: 'Service Operations Manager', website: 'vankeppel.com',
    fleetSize: '60', category: 'fleet',
    pitchAngle: "Construction equipment dealer with extensive service fleet. Their service trucks and technician vehicles run constant job site routes — high visibility for fleet wrap graphics.",
  },

  // ── Rental Car / Mobility ─────────────────────────────────────────────────
  {
    id: 'dlr-086', company: 'Hertz — Indianapolis Franchise Operations', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Operations Director', website: 'hertz.com',
    fleetSize: '300+', category: 'fleet',
    pitchAngle: "Hertz's Indianapolis airport and off-airport locations run massive transport and shuttle fleets. Their 15-passenger shuttle vans are prime fleet wrap candidates — high passenger visibility, constant airport loop.",
  },
  {
    id: 'dlr-087', company: 'Avis Budget Group — Ohio Airport Operations', city: 'Columbus', state: 'OH',
    contactTitle: 'Fleet Operations Manager', website: 'avis.com',
    fleetSize: '250+', category: 'fleet',
    pitchAngle: "Avis/Budget at Columbus and Cleveland airports operate large shuttle fleets. Airport shuttle vans see thousands of business travelers daily — one of the highest-impression fleet wrap formats available.",
  },
  {
    id: 'dlr-088', company: 'National / Alamo / Enterprise — Michigan Airports', city: 'Detroit', state: 'MI',
    contactTitle: 'Regional Fleet Manager', website: 'nationalcar.com',
    fleetSize: '400+', category: 'fleet',
    pitchAngle: "Enterprise Holdings brands at DTW and Grand Rapids airports operate massive shuttle fleets. Fleet wrap at airport level = enormous daily impression count. Corporate vendor status = national rollout opportunity.",
  },
  {
    id: 'dlr-089', company: 'Wheels Fleet Leasing (Element Fleet)', city: 'Chicago', state: 'IL',
    contactTitle: 'Regional Account Director', website: 'elementfleet.com',
    fleetSize: '1000+', category: 'fleet',
    pitchAngle: "Element/Wheels is one of the largest fleet management companies in North America. Getting approved as an Element preferred fleet graphics vendor = access to their entire corporate client portfolio across the Midwest.",
  },
  {
    id: 'dlr-090', company: 'ARI Fleet (Holman Enterprises)', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Sales Manager', website: 'arifleet.com',
    fleetSize: '500+', category: 'fleet',
    pitchAngle: "ARI/Holman manages corporate fleets for hundreds of companies. Their Indianapolis office serves the entire Midwest market. Fleet graphics vendor approval at ARI = pipeline access to their full client list.",
  },

  // ── Quick Lube / Auto Service Chains ────────────────────────────────────
  {
    id: 'dlr-091', company: 'Heartland Valvoline Express Care — Indiana Franchise', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Franchise Operations Director', website: 'valvoline.com',
    fleetSize: '30', category: 'fleet',
    pitchAngle: "Valvoline franchise groups in Indiana operate 30-50 locations with mobile outreach and fleet service vehicles. Fleet wrap + DI-NOC for their service bay renovation.",
  },
  {
    id: 'dlr-092', company: 'Grease Monkey / SpeeDee Midwest Franchise', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Director', website: 'greasemonkey.com',
    fleetSize: '20', category: 'fleet',
    pitchAngle: "Service quick-change franchise with branded vehicles for mobile outreach. Small fleet, accessible decision maker, fast to close.",
  },
  {
    id: 'dlr-093', company: "Dobbs Tire & Auto Centers — Illinois", city: 'St. Louis', state: 'IL',
    contactTitle: 'Regional Operations Manager', website: 'dobbstire.com',
    fleetSize: '45', category: 'fleet',
    pitchAngle: "Dobbs operates 40+ Illinois / Missouri locations with service and delivery vehicles. Fleet wrap across their branded vehicle fleet.",
  },
  {
    id: 'dlr-094', company: 'Monro Muffler Brake — Midwest District', city: 'Chicago', state: 'IL',
    contactTitle: 'District Manager', website: 'monro.com',
    fleetSize: '50', category: 'fleet',
    pitchAngle: "Monro operates 60+ Illinois/Indiana/Michigan locations. Their district manager vehicles and mobile service vans are fleet wrap targets. District-level deal = 50+ vehicles.",
  },
  {
    id: 'dlr-095', company: 'Tires Plus / Firestone — Illinois Franchise', city: 'Chicago', state: 'IL',
    contactTitle: 'Regional Fleet Manager', website: 'tiresplus.com',
    fleetSize: '40', category: 'fleet',
    pitchAngle: "Tires Plus/Firestone franchise groups use mobile service and delivery vehicles. Fleet wrap with consistent brand graphics across their Illinois network.",
  },

  // ── Body Shops / Paint Protection ───────────────────────────────────────
  {
    id: 'dlr-096', company: 'ABRA Auto Body & Glass — Indiana', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Regional Director', website: 'abraauto.com',
    fleetSize: '35', category: 'fleet',
    pitchAngle: "ABRA/Crash Champions runs body shops across Indiana. Their tow trucks and courtesy vehicles are fleet wrap candidates. Their customer base (post-accident vehicle owners) is a direct referral target for color-change wraps.",
  },
  {
    id: 'dlr-097', company: 'Classic Collision — Ohio', city: 'Columbus', state: 'OH',
    contactTitle: 'Regional Operations Director', website: 'classiccollision.com',
    fleetSize: '40', category: 'fleet',
    pitchAngle: "Classic Collision is one of the fastest-growing MSO chains. Their Ohio expansion = new shops needing branded tow and courtesy fleets. DI-NOC for their customer lounge renovations.",
  },
  {
    id: 'dlr-098', company: 'Safelite AutoGlass — Great Lakes District', city: 'Columbus', state: 'OH',
    contactTitle: 'District Fleet Manager', website: 'safelite.com',
    fleetSize: '200+', category: 'fleet',
    pitchAngle: "Safelite's mobile fleet is one of the most recognizable in America — their vans are wrapped already. But as they refresh their fleet, they'll need updated graphics. Corporate approval = massive recurring contract.",
  },
  {
    id: 'dlr-099', company: 'Maaco Collision Repair — Indiana Franchise Network', city: 'Indianapolis', state: 'IN',
    contactTitle: 'Franchise Development Director', website: 'maaco.com',
    fleetSize: '30', category: 'fleet',
    pitchAngle: "Maaco franchise owners in Indiana run their own tow and courtesy vehicle fleets. Franchise-level deal is fast to close. Ironic pitch: the paint shop that gets fleet wrapped for free advertising.",
  },
  {
    id: 'dlr-100', company: 'AutoSource — Chicago Fleet Remarketing', city: 'Chicago', state: 'IL',
    contactTitle: 'Fleet Disposition Manager', website: 'autosourcechicago.com',
    fleetSize: '50', category: 'fleet',
    pitchAngle: "Fleet remarketing companies buy corporate fleets and resell them. Their acquisition and transport vehicles need branding. Also: companies selling their wrapped vehicles to fleet remarketers are a referral source.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────

function pluralize(n, s, p) {
  return `${n.toLocaleString()} ${n === 1 ? s : p}`;
}

async function main() {
  console.log('\n🚗 WrapLeads — Auto Dealership Seed');
  console.log(`   ${DEALER_LEADS.length} dealership leads across IN, OH, MI, IL, KY\n`);

  try { await pool.query('SELECT 1 FROM leads LIMIT 1'); }
  catch (e) { console.error('❌ DB not ready:', e.message); process.exit(1); }

  // Get demo user
  const userRes = await pool.query(`SELECT id FROM users LIMIT 1`);
  if (!userRes.rows.length) { console.error('❌ No users found.'); process.exit(1); }
  const userId = userRes.rows[0].id;

  let inserted = 0, skipped = 0;

  for (const lead of DEALER_LEADS) {
    // Ensure client exists in companies table
    const companyRes = await pool.query(`
      INSERT INTO companies (source, source_id, name, city, state, country, industry, website, raw_data)
      VALUES ('seed_dealerships', $1, $2, $3, $4, 'US', 'fleet', $5, $6::jsonb)
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
      JSON.stringify({ record_type: 'auto_dealer', fleet_size: lead.fleetSize, pitch_angle: lead.pitchAngle }),
    ]);
    const clientId = companyRes.rows[0].id;

    const res = await pool.query(`
      INSERT INTO leads (
        user_id, client_id, company_name, city, state,
        category, status, contact_title, website,
        pitch_angle, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, $8, $9, $10)
      ON CONFLICT (user_id, client_id) DO NOTHING
      RETURNING id
    `, [
      userId, clientId,
      lead.company, lead.city, lead.state,
      lead.category,
      lead.contactTitle,
      lead.website || null,
      lead.pitchAngle,
      `Fleet: ${lead.fleetSize} vehicles`,
    ]);

    if (res.rowCount > 0) inserted++; else skipped++;
  }

  console.log(`✓ Done`);
  console.log(`   ${pluralize(inserted, 'new dealership lead', 'new dealership leads')} inserted`);
  console.log(`   ${pluralize(skipped, 'record', 'records')} skipped (already existed)\n`);
  console.log(`💡 Next steps:`);
  console.log(`   - Filter by category='fleet' in My Leads`);
  console.log(`   - Activate drip sequence on the top 10 dealer groups`);
  console.log(`   - Group-level deals (Zeigler, Lithia, Napleton) = 200+ vehicle contracts\n`);

  await pool.end();
}

main().catch(e => { console.error('\n❌ Failed:', e.message); process.exit(1); });
