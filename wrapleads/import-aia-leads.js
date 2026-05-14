#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wrapleads:wrapleads@localhost:5432/wrapleads';

// ---------------------------------------------------------------------------
// Parsed from: AIAIIDA_ARCHITECTURE_DESIGN_LEADERSHIP__260512_121533.txt
// Indiana business directory — architecture, design, construction, HVAC/plumbing
// ---------------------------------------------------------------------------

const LEADS = [
  // ── AIA / IIDA LEADERSHIP ────────────────────────────────────────────────
  {
    clientId: 'aia-dinoc-001',
    company: 'AIA Indianapolis',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Marlee Cawthorn, AIA',
    contactTitle: 'President, AIA Indianapolis',
    pitchAngle: 'DI-NOC architectural film for commercial interiors — spec-grade finishes without full renovation. Ideal for member firm projects.',
  },
  {
    clientId: 'aia-dinoc-002',
    company: 'AIA Indianapolis',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Jason Lee Larrison, AIA',
    contactTitle: 'Vice President, AIA Indianapolis',
    pitchAngle: 'DI-NOC architectural film for commercial interiors — spec-grade finishes without full renovation.',
  },
  {
    clientId: 'aia-dinoc-003',
    company: 'AIA Indianapolis',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Kate Warpool, AIA',
    contactTitle: 'Secretary, AIA Indianapolis',
    pitchAngle: 'DI-NOC architectural film for commercial interiors — spec-grade finishes without full renovation.',
  },
  {
    clientId: 'aia-dinoc-004',
    company: 'AIA Indianapolis',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Megan Phillippe, AIA',
    contactTitle: 'Treasurer, AIA Indianapolis',
    pitchAngle: 'DI-NOC architectural film for commercial interiors — spec-grade finishes without full renovation.',
  },
  {
    clientId: 'aia-dinoc-005',
    company: 'AIA Indiana',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Jason Shelley',
    contactTitle: 'Executive Director, AIA Indiana',
    pitchAngle: 'DI-NOC architectural film — certified preferred installer for Indiana AIA member projects.',
  },
  {
    clientId: 'aia-dinoc-006',
    company: 'Browning Day',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Jonathan R. Hess, AIA',
    contactTitle: '2025 AIA Gold Medalist / Principal',
    pitchAngle: 'DI-NOC architectural film for premium commercial interiors — surface transformation without renovation downtime.',
  },
  {
    clientId: 'aia-dinoc-007',
    company: 'CORE Planning Strategies',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Debra Kunce, FAIA',
    contactTitle: '2023 AIA Gold Medalist / Principal',
    pitchAngle: 'DI-NOC architectural film for commercial and civic interiors — spec-grade finishes for CORE Planning projects.',
  },
  {
    clientId: 'aia-dinoc-008',
    company: 'IIDA Indiana',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Ellie Watkins',
    contactTitle: 'President, IIDA Indiana',
    pitchAngle: 'DI-NOC architectural film for interior design projects — certified preferred installer in Indiana.',
  },
  {
    clientId: 'aia-dinoc-009',
    company: 'IIDA Indiana',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Rachel Lindemann',
    contactTitle: 'VP of Advocacy, IIDA Indiana',
    pitchAngle: 'DI-NOC architectural film for interior design projects — certified preferred installer in Indiana.',
  },

  // ── ARCHITECTURE & INTERIOR DESIGN FIRMS ─────────────────────────────────
  {
    clientId: 'aia-dinoc-010',
    company: 'RATIO Design',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Bill Browne Jr., FAIA',
    contactTitle: 'Principal',
    pitchAngle: 'DI-NOC architectural film for RATIO Design commercial interiors — wall, millwork, and surface transformation.',
    notes: 'Additional contacts: Melissa Brewer (RID), Angie Wallin',
  },
  {
    clientId: 'aia-dinoc-011',
    company: 'RATIO Design',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Melissa Brewer, RID',
    contactTitle: 'Interior Designer',
    pitchAngle: 'DI-NOC architectural film for RATIO Design commercial interiors — wall, millwork, and surface transformation.',
  },
  {
    clientId: 'aia-dinoc-012',
    company: 'RATIO Design',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Angie Wallin',
    contactTitle: 'Interior Designer',
    pitchAngle: 'DI-NOC architectural film for RATIO Design commercial interiors — wall, millwork, and surface transformation.',
  },
  {
    clientId: 'aia-dinoc-013',
    company: 'Phanomen Design',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Joseph Lese',
    contactTitle: 'Principal',
    pitchAngle: 'DI-NOC architectural film for Phanomen Design commercial and hospitality projects.',
    notes: 'Additional contact: Loree Everette',
  },
  {
    clientId: 'aia-dinoc-014',
    company: 'Phanomen Design',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Loree Everette',
    contactTitle: 'Designer',
    pitchAngle: 'DI-NOC architectural film for Phanomen Design commercial and hospitality projects.',
  },
  {
    clientId: 'aia-dinoc-015',
    company: 'Theory Interior Design',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Courtney Walker',
    contactTitle: 'Principal',
    pitchAngle: 'DI-NOC architectural film for high-end residential and commercial interiors — surface films that match Theory\'s finish standards.',
    notes: 'Additional contact: Lindsey Richard',
  },
  {
    clientId: 'aia-dinoc-016',
    company: 'Theory Interior Design',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Lindsey Richard',
    contactTitle: 'Designer',
    pitchAngle: 'DI-NOC architectural film for high-end residential and commercial interiors.',
  },
  {
    clientId: 'aia-dinoc-017',
    company: 'Schmidt Associates',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Wayne Schmidt, FAIA',
    contactTitle: 'Principal',
    pitchAngle: 'DI-NOC architectural film for Schmidt Associates healthcare, civic, and commercial projects.',
  },
  {
    clientId: 'aia-dinoc-018',
    company: 'Blackline Studio',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Antone Sgro, AIA',
    contactTitle: 'Principal',
    pitchAngle: 'DI-NOC architectural film for Blackline Studio commercial interiors — surface films for modern design.',
  },
  {
    clientId: 'aia-dinoc-019',
    company: 'One 10 Studio',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Brandon Farley, AIA',
    contactTitle: 'Principal',
    pitchAngle: 'DI-NOC architectural film for One 10 Studio commercial and mixed-use projects.',
  },
  {
    clientId: 'aia-dinoc-020',
    company: 'Progress Studio',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'DI-NOC architectural film for commercial, healthcare, and hospitality projects — certified installer in Indiana.',
    notes: 'Specializes in commercial, healthcare, and hospitality',
  },
  {
    clientId: 'aia-dinoc-021',
    company: 'Schott Design',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'DI-NOC architectural film for sustainable commercial interiors — surface films that support green design goals.',
    notes: 'Specializes in commercial and sustainable interiors',
  },
  {
    clientId: 'aia-dinoc-022',
    company: 'Four Point Design',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'DI-NOC architectural film for healthcare and higher education interiors — durable, hygienic surface finishes.',
    notes: 'Specializes in healthcare and higher education',
  },
  {
    clientId: 'aia-dinoc-023',
    company: 'Parallel Design Group',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'DI-NOC architectural film for commercial and multifamily interiors — surface transformation without renovation downtime.',
    notes: 'Specializes in commercial and multifamily',
  },
  {
    clientId: 'aia-dinoc-024',
    company: 'Lantz Collective',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Barry Lantz',
    contactTitle: 'Co-founder',
    pitchAngle: 'DI-NOC architectural film for Lantz Collective interior projects — premium surface finishes.',
    notes: 'Co-founders: Barry Lantz and Amanda Lantz',
  },
  {
    clientId: 'aia-dinoc-025',
    company: 'Adam Gibson Design',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Adam Gibson',
    contactTitle: 'Principal / Owner',
    pitchAngle: 'DI-NOC architectural film for Adam Gibson Design commercial and residential projects.',
  },
  {
    clientId: 'aia-dinoc-026',
    company: 'Julie O\'Brien Design Group',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Julie O\'Brien',
    contactTitle: 'Principal / Owner',
    pitchAngle: 'DI-NOC architectural film for Julie O\'Brien Design Group interior projects.',
  },

  // ── ARCHITECTURAL FILM — DISTRIBUTORS ────────────────────────────────────
  {
    clientId: 'aia-film-001',
    company: 'FDC Graphic Films, Inc.',
    category: 'dinoc',
    city: 'South Bend', state: 'IN',
    pitchAngle: 'Certified DI-NOC installer partnership — 3M DI-NOC master distributor. Referral and co-install opportunities on large commercial jobs.',
    notes: '3M DI-NOC Master Distributor for Indiana',
  },
  {
    clientId: 'aia-film-002',
    company: 'Koroseal Interior Products',
    category: 'reatec',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Sangetsu REATEC distributor — certified installer partnership for architectural film application on commercial projects.',
    notes: 'Sangetsu REATEC Distributor for Indianapolis area',
  },
  {
    clientId: 'aia-film-003',
    company: 'EPD (Electronic Printing & Design)',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Authorized 3M Network partner — DI-NOC installer collaboration for large-format and architectural film projects.',
    notes: 'Authorized 3M Network partner',
  },

  // ── ARCHITECTURAL FILM — CERTIFIED INSTALLERS (PEERS/COMPETITORS) ─────────
  {
    clientId: 'aia-film-004',
    company: 'Indy Auto Graphics',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Industry peer — 3M Endorsed DI-NOC Certified installer. Potential referral or overflow partnership on commercial interior projects.',
    notes: '3M Endorsed DI-NOC Certified installer. Competitor/peer — referral potential.',
  },
  {
    clientId: 'aia-film-005',
    company: 'Solar Tinting LLC / Solar Concepts',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: '3M Certified installer — potential referral or co-install partnership on large commercial projects.',
    notes: 'Locations in Indy and Carmel. 3M Certified. Competitor/peer.',
  },
  {
    clientId: 'aia-film-006',
    company: 'Window Film Depot',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: '3M & Belbien installer — statewide presence. Potential referral partner for wrap and DI-NOC overflow.',
    notes: 'Statewide. 3M & Belbien installer. Competitor/peer.',
  },
  {
    clientId: 'aia-film-007',
    company: 'Indianapolis Window Film',
    category: 'dinoc',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Exterior refinishing specialist — potential DI-NOC referral partner for interior architectural film projects.',
    notes: 'Exterior refinishing specialist. Competitor/peer.',
  },

  // ── CONSTRUCTION & FACILITY MANAGEMENT ───────────────────────────────────
  {
    clientId: 'aia-const-001',
    company: 'Shiel Sexton',
    category: 'construction',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps and job site signage for Shiel Sexton — brand every truck on Commission Row and commercial construction sites.',
    notes: 'General Contractor — Commission Row projects',
  },
  {
    clientId: 'aia-const-002',
    company: 'Kort Builders',
    category: 'construction',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps and tenant improvement signage for Kort Builders — commercial construction and interior fit-out.',
    notes: 'Commercial and tenant improvement contractor',
  },
  {
    clientId: 'aia-const-003',
    company: 'Compass CCG',
    category: 'construction',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Compass CCG design/build crews — branded trucks for every job site.',
    notes: 'Design/Build contractor',
  },
  {
    clientId: 'aia-const-004',
    company: 'Hearn Construction, Inc.',
    category: 'construction',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Hearn Construction — office and restaurant renovation crews with branded vehicles.',
    notes: 'Specializes in office and restaurant renovations',
  },
  {
    clientId: 'aia-const-005',
    company: 'Surface Experts of Indianapolis West',
    category: 'construction',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Vehicle wraps for Surface Experts franchise trucks — branded fleet for every surface repair and resurfacing job.',
    notes: 'Surface repair and resurfacing franchise',
  },
  {
    clientId: 'aia-const-006',
    company: 'Cunningham Restaurant Group Facilities',
    category: 'construction',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps and DI-NOC interior film for Cunningham Restaurant Group facilities team — Commission Row operator.',
    notes: 'Restaurant group facilities operator — Commission Row',
  },

  // ── HVAC & PLUMBING — NAMED FIRMS WITH DECISION-MAKER CONTACTS ───────────
  {
    clientId: 'aia-hvac-001',
    company: 'Mission Mechanical',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Scott Mahar',
    contactTitle: 'President & Owner',
    pitchAngle: 'Fleet vehicle wraps for Mission Mechanical service trucks — turn every service call into a rolling billboard across Indianapolis.',
    notes: 'Additional contacts: Michael Arbuckle (Owner), Jon Arbuckle (VP), Chris Sides (Purchaser)',
  },
  {
    clientId: 'aia-hvac-002',
    company: 'Peterman Brothers',
    category: 'fleet',
    city: 'Greenwood', state: 'IN',
    contactName: 'Chad Peterman',
    contactTitle: 'President & CEO',
    pitchAngle: 'Fleet vehicle wraps for Peterman Brothers HVAC trucks — large Indianapolis-area service fleet, high brand visibility opportunity.',
    notes: 'Additional contacts: Tyler Peterman (Co-owner), Kristy Muse (Director of Branch Operations), Alan (Director of Service Operations)',
  },
  {
    clientId: 'aia-hvac-003',
    company: 'Chapman Heating, Air Conditioning & Plumbing',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Tiffany Sanders',
    contactTitle: 'President & CEO',
    pitchAngle: 'Fleet vehicle wraps for Chapman HVAC and plumbing trucks — professional branded fleet for Indianapolis home service leader.',
    notes: 'Additional contacts: Jeffrey Chapman (President), Troy Gill (Manager, Purchasing) — Troy is likely the purchasing decision-maker',
  },
  {
    clientId: 'aia-hvac-004',
    company: 'Complete Comfort Heating, Air & Plumbing',
    category: 'fleet',
    city: 'Greenwood', state: 'IN',
    contactName: 'Kenneth Hale',
    contactTitle: 'Owner & Manager',
    pitchAngle: 'Fleet vehicle wraps for Complete Comfort service trucks — branded fleet for Greenwood and south Indianapolis market.',
    notes: 'Additional contacts: Blake Johnson (Operations Manager), Michael Caylor (Assistant Manager)',
  },
  {
    clientId: 'aia-hvac-005',
    company: 'Howald Heating, Air Conditioning & Plumbing',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    contactName: 'Hayley Howald',
    contactTitle: 'CEO',
    pitchAngle: 'Fleet vehicle wraps for Howald HVAC trucks — family business with strong Indianapolis brand presence, ready for a fleet refresh.',
    notes: 'Additional contact: Larry Howald (Owner/Founder)',
  },

  // ── ADDITIONAL HVAC & PLUMBING ────────────────────────────────────────────
  {
    clientId: 'aia-hvac-bulk-001',
    company: '317 Plumber',
    category: 'fleet',
    city: 'Fishers', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for 317 Plumber service trucks — brand every service call in the Fishers and north Indianapolis market.',
  },
  {
    clientId: 'aia-hvac-bulk-002',
    company: 'Acme Plumbing',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Acme Plumbing — professional branded trucks for Indianapolis residential and commercial service.',
  },
  {
    clientId: 'aia-hvac-bulk-003',
    company: 'Advocate Plumbing',
    category: 'fleet',
    city: 'Noblesville', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Advocate Plumbing — branded service trucks for the Noblesville and Hamilton County market.',
  },
  {
    clientId: 'aia-hvac-bulk-004',
    company: 'Allen Plumbing Co.',
    category: 'fleet',
    city: 'Greenwood', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Allen Plumbing — branded trucks for Greenwood and south Indianapolis plumbing services.',
  },
  {
    clientId: 'aia-hvac-bulk-005',
    company: 'Ardizzone Enterprises, Inc.',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Ardizzone Enterprises — professional branded fleet for Indianapolis mechanical services.',
  },
  {
    clientId: 'aia-hvac-bulk-006',
    company: 'B & W Plumbing & Heating Co.',
    category: 'fleet',
    city: 'Speedway', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for B & W Plumbing — local Speedway shop, branded trucks for the greater Indianapolis market.',
  },
  {
    clientId: 'aia-hvac-bulk-007',
    company: 'Bassett Services Inc.',
    category: 'fleet',
    city: 'Plainfield', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Bassett Services — branded HVAC and plumbing trucks for the west Indianapolis and Plainfield market.',
  },
  {
    clientId: 'aia-hvac-bulk-008',
    company: 'Benjamin Franklin Plumbing',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Benjamin Franklin Plumbing franchise trucks — national brand, local fleet, custom graphics.',
  },
  {
    clientId: 'aia-hvac-bulk-009',
    company: 'Broad Ripple Service Experts',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Broad Ripple Service Experts — branded HVAC trucks for the Broad Ripple and north Indianapolis market.',
  },
  {
    clientId: 'aia-hvac-bulk-010',
    company: "Carter's My Plumber LLC",
    category: 'fleet',
    city: 'Greenwood', state: 'IN',
    pitchAngle: "Fleet vehicle wraps for Carter's My Plumber — branded service trucks for south Indianapolis and Greenwood.",
  },
  {
    clientId: 'aia-hvac-bulk-011',
    company: 'Control Tech Heating & Cooling',
    category: 'fleet',
    city: 'Zionsville', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Control Tech HVAC — branded service trucks for Zionsville and northwest Indianapolis market.',
  },
  {
    clientId: 'aia-hvac-bulk-012',
    company: "Deaton's Mechanical Company, Inc.",
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: "Fleet vehicle wraps for Deaton's Mechanical — professional branded trucks for Indianapolis commercial mechanical services.",
  },
  {
    clientId: 'aia-hvac-bulk-013',
    company: 'DEEM',
    category: 'fleet',
    city: 'Fishers', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for DEEM — branded mechanical and engineering service vehicles for the Fishers market.',
  },
  {
    clientId: 'aia-hvac-bulk-014',
    company: 'Elite Plumbing & Sewer',
    category: 'fleet',
    city: 'Bargersville', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Elite Plumbing & Sewer — professional branded trucks for Johnson County and south Indianapolis.',
  },
  {
    clientId: 'aia-hvac-bulk-015',
    company: 'Ferrer Mechanical & Electrical',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Ferrer Mechanical — branded service trucks for Indianapolis mechanical and electrical contracting.',
  },
  {
    clientId: 'aia-hvac-bulk-016',
    company: 'Fite Plumbing LLC',
    category: 'fleet',
    city: 'Plainfield', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Fite Plumbing — branded service trucks for the Plainfield and west Indianapolis market.',
  },
  {
    clientId: 'aia-hvac-bulk-017',
    company: 'GEMCO LLC',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for GEMCO — professional branded trucks for Indianapolis mechanical contracting.',
  },
  {
    clientId: 'aia-hvac-bulk-018',
    company: 'Godby Heating Plumbing Electrical',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Godby — multi-service HVAC, plumbing, and electrical fleet. High brand visibility across Indianapolis.',
  },
  {
    clientId: 'aia-hvac-bulk-019',
    company: 'Hope Plumbing, LLC',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Hope Plumbing — branded service trucks for Indianapolis residential plumbing.',
  },
  {
    clientId: 'aia-hvac-bulk-020',
    company: 'L.D. Smith Plumbing, Inc.',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for L.D. Smith Plumbing — professional branded trucks for Indianapolis commercial and residential plumbing.',
  },
  {
    clientId: 'aia-hvac-bulk-021',
    company: 'L.E. Isley & Sons, Inc.',
    category: 'fleet',
    city: 'Westfield', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for L.E. Isley & Sons — family plumbing business with Hamilton County fleet.',
  },
  {
    clientId: 'aia-hvac-bulk-022',
    company: 'Mister Quik Home Services',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Mister Quik — large Indianapolis home services fleet. Custom graphics to match their brand identity.',
  },
  {
    clientId: 'aia-hvac-bulk-023',
    company: 'Mowery Heating, Air & Plumbing',
    category: 'fleet',
    city: 'Brownsburg', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Mowery — Brownsburg HVAC and plumbing fleet. Branded trucks for Hendricks County market.',
  },
  {
    clientId: 'aia-hvac-bulk-024',
    company: 'Greiner Brothers, Inc.',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Greiner Brothers — commercial mechanical contractor with Indianapolis metro fleet.',
    notes: 'Commercial mechanical contractor',
  },
  {
    clientId: 'aia-hvac-bulk-025',
    company: 'North Mechanical Contracting, Inc.',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for North Mechanical — commercial maintenance fleet branded for Indianapolis commercial properties.',
    notes: 'Commercial maintenance contractor',
  },
  {
    clientId: 'aia-hvac-bulk-026',
    company: 'Bright Sheet Metal',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Bright Sheet Metal — commercial HVAC fabrication and install fleet.',
    notes: 'Commercial HVAC fabrication',
  },
  {
    clientId: 'aia-hvac-bulk-027',
    company: 'Leach & Russell Mechanical',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Leach & Russell Mechanical — commercial HVAC and plumbing service fleet.',
    notes: 'Commercial HVAC and plumbing',
  },
  {
    clientId: 'aia-hvac-bulk-028',
    company: 'Sullivan & Poore, Inc.',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Sullivan & Poore — union mechanical contractor fleet in Indianapolis.',
    notes: 'Union mechanical contractor',
  },
  {
    clientId: 'aia-hvac-bulk-029',
    company: 'Irish Mechanical Services',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Irish Mechanical — commercial HVAC and plumbing fleet across Indianapolis.',
    notes: 'Commercial HVAC and plumbing',
  },
  {
    clientId: 'aia-hvac-bulk-030',
    company: 'Johnson Melloh',
    category: 'fleet',
    city: 'Indianapolis', state: 'IN',
    pitchAngle: 'Fleet vehicle wraps for Johnson Melloh — commercial mechanical and energy services fleet.',
    notes: 'Commercial mechanical and energy services',
  },
];

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const emailIdx = args.indexOf('--user-email');
  const idIdx = args.indexOf('--user-id');

  let userId;

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    if (idIdx !== -1) {
      userId = args[idIdx + 1];
      if (!userId) { console.error('--user-id requires a value'); process.exit(1); }
    } else if (emailIdx !== -1) {
      const email = args[emailIdx + 1];
      if (!email) { console.error('--user-email requires a value'); process.exit(1); }
      const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (!rows.length) { console.error(`No user found with email: ${email}`); process.exit(1); }
      userId = String(rows[0].id);
      console.log(`Resolved user_id=${userId} for ${email}`);
    } else {
      console.error('Usage: node import-aia-leads.js --user-email owner@example.com');
      console.error('       node import-aia-leads.js --user-id 123');
      process.exit(1);
    }

    let inserted = 0;
    let skipped = 0;

    for (const lead of LEADS) {
      const { rows } = await pool.query(
        `INSERT INTO leads (
          user_id, client_id, company, category, city, state,
          contact_name, contact_title, pitch_angle, status, source, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new','import_aia',$10)
        ON CONFLICT (user_id, client_id) DO NOTHING
        RETURNING id`,
        [
          userId,
          lead.clientId,
          lead.company,
          lead.category,
          lead.city || null,
          lead.state || null,
          lead.contactName || null,
          lead.contactTitle || null,
          lead.pitchAngle || null,
          lead.notes || null,
        ]
      );
      if (rows.length) inserted++;
      else skipped++;
    }

    console.log(`\nDone. Inserted: ${inserted} | Skipped (already exists): ${skipped} | Total: ${LEADS.length}`);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
