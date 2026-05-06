#!/usr/bin/env node
/**
 * seed-designers.js — Seeds the 100 highest-priority interior design and
 * architecture firms directly into the WrapLeads CRM leads table.
 *
 * These firms are the top DI-NOC / Rea Tec / wall graphics targets across
 * Indiana + Ohio + Michigan + Illinois + Kentucky. Each has a specific pitch
 * angle and contact title — ready to email immediately.
 *
 * Run: node seed-designers.js
 * Safe to re-run (uses ON CONFLICT DO NOTHING via client_id).
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DESIGNERS = [
  // ── Indiana Top Priority ─────────────────────────────────────────────────
  { id: 'des-001', company: 'Browning Day', city: 'Indianapolis', state: 'IN', contactTitle: 'Director of Interior Design', website: 'browningday.com', pitchAngle: 'Large multidisciplinary firm with active healthcare, civic, and higher-ed practice — DI-NOC wood/stone films are specified repeatedly across their project types. One spec = multiple projects.' },
  { id: 'des-002', company: 'Schmidt Associates', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Lead', website: 'schmidtassociates.com', pitchAngle: 'Healthcare + education focus; DI-NOC antimicrobial films and Rea Tec surface films are directly applicable to their core market verticals. Pitch infection-control compliance.' },
  { id: 'des-003', company: 'Ratio Architects', city: 'Indianapolis', state: 'IN', contactTitle: 'Principal, Business Development', email: 'tsteinhardt@ratioarchitects.com', phone: '317-633-4040', website: 'ratioarchitects.com', pitchAngle: 'Constant adaptive-reuse and historic-preservation work where DI-NOC wood/stone films enable code-compliant refinishing of existing surfaces — saves cost over full replacement.' },
  { id: 'des-004', company: 'RQAW Corporation', city: 'Indianapolis', state: 'IN', contactTitle: 'Director of Interior Design', website: 'rqaw.com', pitchAngle: 'Municipal, justice, and public safety facilities — DI-NOC wayfinding films and wall graphics are standard across their project types. Government procurement = repeat business.' },
  { id: 'des-005', company: 'CSO Architects', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Principal', website: 'csoarchitects.com', pitchAngle: 'Mixed-use, multifamily, and hospitality practice — DI-NOC accent surfaces in lobbies and amenity areas are high-ROI per square foot. Active pipeline of Indy multifamily.' },
  { id: 'des-006', company: 'Fanning Howey', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Lead', website: 'fanninghowey.com', pitchAngle: 'K-12 and higher-ed specialist; school cafeteria and corridor wall graphics + DI-NOC are durable, low-maintenance — key argument for facilities managers.' },
  { id: 'des-007', company: 'MSA Design', city: 'Indianapolis', state: 'IN', contactTitle: 'Senior Interior Designer', website: 'msadesign.com', pitchAngle: 'Multidisciplinary firm with strong hospitality and retail practice — wall graphics, DI-NOC wood panels, and branded environments. Multiple project types = repeat spec.' },
  { id: 'des-008', company: 'Cripe Architects + Engineers', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Director', website: 'cripe.biz', pitchAngle: 'Broad commercial practice; DI-NOC is used as cost-effective surface upgrade in tenant improvement and renovation projects — pitch the savings vs. new millwork.' },
  { id: 'des-009', company: 'American Structurepoint', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Lead', website: 'structurepoint.com', pitchAngle: 'Large engineering firm with interior design studio — transportation, civic, and commercial projects. Transit facility interiors are ideal DI-NOC applications.' },
  { id: 'des-010', company: 'Synthesis Inc.', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Director', website: 'synthesisarch.com', pitchAngle: 'Corporate interiors and TI specialist — DI-NOC is a frequent value-engineering substitute for millwork in Class A offices. Pitch cost savings + install speed.' },
  { id: 'des-011', company: 'Mortar', city: 'Indianapolis', state: 'IN', contactTitle: 'Creative Director', website: 'mortar.com', pitchAngle: 'Brand experience agency — environmental graphics, wall wraps, and dimensional signage are core deliverables. Position as their fabrication + install partner.' },
  { id: 'des-012', company: 'Elevatus Architecture', city: 'Indianapolis', state: 'IN', contactTitle: 'Principal', website: 'elevatusarchitecture.com', pitchAngle: 'Worship and civic facilities; DI-NOC wood and stone films create premium sanctuary and lobby environments on realistic renovation budgets.' },
  { id: 'des-013', company: 'Gensler Indianapolis', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Lead', website: 'gensler.com', pitchAngle: 'Global firm with Indianapolis workplace projects — DI-NOC branding films and environmental graphics are standard Gensler deliverables. Get on their preferred vendor list.' },
  { id: 'des-014', company: 'Perkins + Will Indianapolis', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Principal', website: 'perkinswill.com', pitchAngle: 'Healthcare and higher-ed focus; DI-NOC antimicrobial and wood films are regularly specified in their project interiors. Healthcare clients = premium budget.' },
  { id: 'des-015', company: 'NBBJ Indianapolis', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Lead', website: 'nbbj.com', pitchAngle: 'Global firm with strong Indianapolis healthcare and campus practice — DI-NOC and Rea Tec are standard finish palette items. One preferred vendor relationship = multiple projects.' },
  { id: 'des-016', company: 'Design Collaborative', city: 'Fort Wayne', state: 'IN', contactTitle: 'Senior Interior Designer', website: 'designcollaborative.com', pitchAngle: 'Healthcare and education focus in Fort Wayne; DI-NOC antimicrobial and textured films directly address their clients\' surface durability needs.' },
  { id: 'des-017', company: 'Troyer Group', city: 'Mishawaka', state: 'IN', contactTitle: 'Director of Interior Architecture', website: 'troyergroup.com', pitchAngle: 'Northern Indiana firm; healthcare and education specialize in long-lifecycle finishes — DI-NOC is the ideal cost/durability balance for their clients.' },
  { id: 'des-018', company: 'Rundell Ernstberger Associates', city: 'Indianapolis', state: 'IN', contactTitle: 'Principal / Project Lead', website: 'rea-inc.com', pitchAngle: 'Landscape architecture + planning firm with public space focus; environmental graphics and wayfinding wraps on public infrastructure.' },
  { id: 'des-019', company: 'Axis Architecture + Associates', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Lead', website: 'axisarch.net', pitchAngle: 'Established Indianapolis firm with civic and corporate practice — DI-NOC and Rea Tec surface films are regular specification items.' },
  { id: 'des-020', company: 'HAFER', city: 'Evansville', state: 'IN', contactTitle: 'Interior Design Lead', website: 'haferarch.com', pitchAngle: 'Full-service architecture and engineering; southwest Indiana healthcare and civic projects use DI-NOC for surface upgrades without full renovation disruption.' },

  // ── Ohio Top Priority ────────────────────────────────────────────────────
  { id: 'des-021', company: 'DesignGroup', city: 'Columbus', state: 'OH', contactTitle: 'Director of Interior Design', website: 'designgroupinc.com', pitchAngle: 'Columbus full-service firm with healthcare, education, and corporate practice — DI-NOC surface films are standard in their interior finish palette. High project volume.' },
  { id: 'des-022', company: 'Moody Nolan', city: 'Columbus', state: 'OH', contactTitle: 'Interior Design Principal', website: 'moodynolan.com', pitchAngle: 'Award-winning firm with civic, education, and sports facility practice — environmental graphics and Rea Tec films for public-facing interiors.' },
  { id: 'des-023', company: 'GBBN Architects', city: 'Cincinnati', state: 'OH', contactTitle: 'Interior Design Lead', website: 'gbbn.com', pitchAngle: 'Education and healthcare specialist; DI-NOC antimicrobial films are directly relevant to their healthcare clients\' infection-control specs. Lead with compliance benefits.' },
  { id: 'des-024', company: 'Vocon', city: 'Cleveland', state: 'OH', contactTitle: 'Interior Design Director', website: 'vocon.com', pitchAngle: 'Workplace strategy and interiors firm; DI-NOC branding films and environmental graphics are core deliverables for corporate clients.' },
  { id: 'des-025', company: 'SHP Leading Design', city: 'Cincinnati', state: 'OH', contactTitle: 'Interior Design Lead', website: 'shp.com', pitchAngle: 'K-12 and higher-ed specialist; DI-NOC and wall graphics are frequent scope items in their school renovation projects. High project cadence.' },
  { id: 'des-026', company: 'ThenDesign Architecture', city: 'Willoughby', state: 'OH', contactTitle: 'Principal / Interior Design Lead', website: 'tda.design', pitchAngle: 'K-12 education specialist in Northeast Ohio; school renovation projects are consistent pipeline for DI-NOC wall graphics and surface films.' },
  { id: 'des-027', company: 'Gensler Columbus', city: 'Columbus', state: 'OH', contactTitle: 'Interior Design Lead', website: 'gensler.com', pitchAngle: 'Workplace and mixed-use projects; DI-NOC branding films and environmental graphics standard in Columbus office fit-outs. Get on preferred vendor list.' },
  { id: 'des-028', company: 'Perspectus Architecture', city: 'Cleveland', state: 'OH', contactTitle: 'Principal / Interior Design', website: 'perspectusarchitecture.com', pitchAngle: 'Adaptive reuse and historic renovation specialist; DI-NOC wood and stone films are go-to for code-compliant surface upgrades in landmark buildings.' },
  { id: 'des-029', company: 'FRCH Nelson', city: 'Cincinnati', state: 'OH', contactTitle: 'Interior Design Director', website: 'frch.com', pitchAngle: 'Retail, hospitality, and entertainment design firm; DI-NOC surface films are standard in their store and restaurant fit-out packages.' },
  { id: 'des-030', company: 'IA Interior Architects Cincinnati', city: 'Cincinnati', state: 'OH', contactTitle: 'Principal Interior Designer', website: 'interiorarchitects.com', pitchAngle: 'Corporate workplace interiors; DI-NOC branding films and environmental graphics are deliverables for Fortune 500 Cincinnati office clients.' },
  { id: 'des-031', company: 'M+A Architects', city: 'Columbus', state: 'OH', contactTitle: 'Interior Design Lead', website: 'maarchitects.com', pitchAngle: 'Commercial and multifamily practice; DI-NOC accent surfaces in apartment lobbies and amenity spaces.' },
  { id: 'des-032', company: 'Glaserworks', city: 'Cincinnati', state: 'OH', contactTitle: 'Principal', website: 'glaserworks.com', pitchAngle: 'Boutique architecture and interiors with adaptive reuse focus; DI-NOC wood/stone films for historic building interior upgrades.' },
  { id: 'des-033', company: 'Schooley Caldwell', city: 'Columbus', state: 'OH', contactTitle: 'Interior Design Lead', website: 'schooleycaldwell.com', pitchAngle: 'Public sector architecture with civic and judicial facility practice; DI-NOC for durable government building interior surfaces.' },
  { id: 'des-034', company: 'MSA Design Cincinnati', city: 'Cincinnati', state: 'OH', contactTitle: 'Senior Interior Designer', website: 'msadesign.com', pitchAngle: 'Hospitality and retail design; DI-NOC metallic and wood films deliver high-impact aesthetics in restaurant and retail renovations.' },
  { id: 'des-035', company: 'Champlin Architecture', city: 'Cincinnati', state: 'OH', contactTitle: 'Interior Design Lead', website: 'chamarch.com', pitchAngle: 'Commercial interiors and tenant improvement practice; DI-NOC wood and stone films as millwork alternatives in TI projects.' },

  // ── Michigan Top Priority ────────────────────────────────────────────────
  { id: 'des-036', company: 'SmithGroup', city: 'Detroit', state: 'MI', contactTitle: 'Interior Design Director', website: 'smithgroup.com', pitchAngle: 'Large multidisciplinary firm with healthcare, science, and workplace practice — DI-NOC and Rea Tec surface films are standard in their interior specifications.' },
  { id: 'des-037', company: 'Harley Ellis Devereaux', city: 'Detroit', state: 'MI', contactTitle: 'Interior Design Principal', website: 'hed.design', pitchAngle: 'Healthcare and education specialist; DI-NOC antimicrobial and textured films are directly applicable to their clinical and academic interior projects.' },
  { id: 'des-038', company: 'TMP Architecture', city: 'Bloomfield Hills', state: 'MI', contactTitle: 'Interior Design Lead', website: 'tmparchitects.com', pitch: 'K-12 education specialist; Michigan school renovation projects are consistent DI-NOC wall graphic and surface film pipeline. High project volume.' },
  { id: 'des-039', company: 'Progressive AE', city: 'Grand Rapids', state: 'MI', contactTitle: 'Senior Interior Designer', website: 'progressiveae.com', pitchAngle: 'Full-service firm with healthcare, education, and industrial practice — West Michigan clients with ongoing interior renovation programs.' },
  { id: 'des-040', company: 'Integrated Architecture', city: 'Grand Rapids', state: 'MI', contactTitle: 'Interior Design Director', website: 'intarch.com', pitchAngle: 'Education and corporate interiors practice; DI-NOC and wall graphics for school and office renovation projects across West Michigan.' },
  { id: 'des-041', company: 'Hobbs + Black', city: 'Ann Arbor', state: 'MI', contactTitle: 'Principal / Interior Design', website: 'hobbsandblack.com', pitchAngle: 'University and civic architecture; University of Michigan–adjacent practice with ongoing campus renovation projects where DI-NOC is specified.' },
  { id: 'des-042', company: 'Quinn Evans', city: 'Ann Arbor', state: 'MI', contactTitle: 'Interior Design Lead', website: 'quinnevans.com', pitchAngle: 'Historic preservation specialist; DI-NOC wood and stone films are the go-to tool for code-compliant surface refinishing in historic structures.' },
  { id: 'des-043', company: 'Ghafari Associates', city: 'Dearborn', state: 'MI', contactTitle: 'Interior Design Principal', website: 'ghafari.com', pitchAngle: 'Automotive, industrial, and commercial architecture; DI-NOC and Rea Tec for manufacturing facility and corporate campus interior upgrades.' },
  { id: 'des-044', company: 'Rossetti', city: 'Detroit', state: 'MI', contactTitle: 'Interior Design Lead', website: 'rossetti.com', pitchAngle: 'Sports, entertainment, and hospitality design; environmental graphics and DI-NOC films are standard in arena and stadium renovation packages.' },
  { id: 'des-045', company: 'Neumann/Smith Architecture', city: 'Southfield', state: 'MI', contactTitle: 'Interior Design Director', website: 'neumannsmith.com', pitchAngle: 'Detroit-area commercial and mixed-use firm; DI-NOC wood and stone films as millwork alternatives in office and retail renovation.' },
  { id: 'des-046', company: 'TowerPinkster', city: 'Kalamazoo', state: 'MI', contactTitle: 'Interior Design Lead', website: 'towerpinkster.com', pitchAngle: 'Full-service firm with healthcare and education focus; DI-NOC antimicrobial films for hospital and school renovation across Southwest Michigan.' },
  { id: 'des-047', company: 'Moore + Bruggink', city: 'Grand Rapids', state: 'MI', contactTitle: 'Principal', website: 'moorebruggink.com', pitchAngle: 'Commercial and educational practice in West Michigan; DI-NOC films for school and office interior finish upgrades.' },
  { id: 'des-048', company: 'Stantec Michigan', city: 'Detroit', state: 'MI', contactTitle: 'Interior Design Lead', website: 'stantec.com', pitchAngle: 'Infrastructure-led firm; transit and public facility interiors where DI-NOC is specified for durable surface upgrades.' },
  { id: 'des-049', company: 'GMB Architecture + Engineering', city: 'Holland', state: 'MI', contactTitle: 'Interior Design Lead', website: 'gmb.com', pitchAngle: 'West Michigan full-service firm; manufacturing, education, and civic clients with ongoing interior renovation programs.' },
  { id: 'des-050', company: 'Kingscott Associates', city: 'Kalamazoo', state: 'MI', contactTitle: 'Interior Design Principal', website: 'kingscott.com', pitchAngle: 'Municipal and civic architecture in Southwest Michigan; government facility interiors where DI-NOC surface films reduce renovation scope.' },

  // ── Illinois Top Priority ────────────────────────────────────────────────
  { id: 'des-051', company: 'Gensler Chicago', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Director', website: 'gensler.com', pitchAngle: 'Global design firm\'s Chicago office — DI-NOC branding films and environmental graphics are standard Gensler deliverables. Getting on their preferred vendor list = massive pipeline.' },
  { id: 'des-052', company: 'Perkins + Will Chicago', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Principal', website: 'perkinswill.com', pitchAngle: 'Healthcare, workplace, and higher-ed firm; DI-NOC and surface films are part of their standard interior material palette.' },
  { id: 'des-053', company: 'OKW Architects', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Lead', website: 'okwarchitects.com', pitchAngle: 'Hospitality and multifamily specialist; DI-NOC accent surfaces in hotel lobbies and apartment amenity spaces.' },
  { id: 'des-054', company: 'VOA Associates', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Director', website: 'voa.com', pitchAngle: 'Healthcare and senior living specialist; DI-NOC antimicrobial films are directly applicable to their clinical and assisted-living interior projects.' },
  { id: 'des-055', company: 'Lamar Johnson Collaborative', city: 'Chicago', state: 'IL', contactTitle: 'Senior Interior Designer', website: 'lamarjohnson.com', pitchAngle: 'Multifamily and affordable housing practice; DI-NOC films as cost-effective premium finish in apartment community common areas.' },
  { id: 'des-056', company: 'Antunovich Associates', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Principal', website: 'antunovich.com', pitchAngle: 'Hospitality + adaptive reuse firm; DI-NOC wood/metal films enable budget-friendly heritage aesthetic in historic buildings.' },
  { id: 'des-057', company: 'IA Interior Architects Chicago', city: 'Chicago', state: 'IL', contactTitle: 'Principal Interior Designer', website: 'interiorarchitects.com', pitchAngle: 'Corporate workplace interiors; DI-NOC branding films and environmental graphics standard in Fortune 500 Chicago office fit-outs.' },
  { id: 'des-058', company: 'Solomon Cordwell Buenz', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Lead', website: 'scb.com', pitchAngle: 'Mixed-use and multifamily high-rise specialist; DI-NOC accent films in Chicago condo and apartment lobby renovations.' },
  { id: 'des-059', company: 'Wight & Company', city: 'Darien', state: 'IL', contactTitle: 'Interior Design Director', website: 'wightco.com', pitchAngle: 'Full-service firm with education, healthcare, and government practice in Chicago suburbs — DI-NOC specified in school and civic renovation.' },
  { id: 'des-060', company: 'Cordogan Clark & Associates', city: 'Aurora', state: 'IL', contactTitle: 'Interior Design Lead', website: 'cordoganclark.com', pitchAngle: 'K-12 education specialist in Chicago suburbs; school renovation projects are consistent wall graphics and DI-NOC pipeline.' },
  { id: 'des-061', company: 'Cannon Design Chicago', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Principal', website: 'cannondesign.com', pitchAngle: 'Healthcare and higher-ed giant; DI-NOC antimicrobial and surface films are routine specifications in their Chicago hospital projects.' },
  { id: 'des-062', company: 'STL Architects', city: 'Chicago', state: 'IL', contactTitle: 'Principal Designer', pitchAngle: 'Boutique commercial and hospitality design; DI-NOC metallic and wood films for Chicago restaurant and hotel renovation clients.' },
  { id: 'des-063', company: 'Lothan Van Hook DeStefano Architecture', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Director', website: 'lvda.com', pitchAngle: 'Senior living and multifamily specialist; DI-NOC wood and fabric films for assisted living and memory care interior renovations.' },
  { id: 'des-064', company: 'HED Chicago', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Lead', website: 'hed.design', pitchAngle: 'Healthcare and higher-ed practice; DI-NOC surface films specified in hospital renovation and university campus projects.' },
  { id: 'des-065', company: 'Kluber Architects + Engineers', city: 'Batavia', state: 'IL', contactTitle: 'Interior Design Lead', website: 'kluber.com', pitchAngle: 'Education and municipal practice in Fox Valley suburbs; school and civic facility renovation with wall graphics and surface films.' },

  // ── Kentucky Top Priority ─────────────────────────────────────────────────
  { id: 'des-066', company: 'EOP Architects', city: 'Louisville', state: 'KY', contactTitle: 'Interior Design Lead', website: 'eoparchitects.com', pitchAngle: 'Louisville full-service firm with healthcare, education, and civic practice — DI-NOC and Rea Tec films are standard interior finish specifications.' },
  { id: 'des-067', company: 'Luckett & Farley', city: 'Louisville', state: 'KY', contactTitle: 'Interior Design Director', website: 'luckettfarley.com', pitchAngle: 'Established Louisville firm with commercial, healthcare, and government practice; DI-NOC surface films for interior renovation projects.' },
  { id: 'des-068', company: 'MCM CPG Architects', city: 'Louisville', state: 'KY', contactTitle: 'Interior Design Lead', website: 'mcm.com', pitchAngle: 'National commercial and multifamily firm with Louisville base; DI-NOC accent films in apartment community and hospitality renovations.' },
  { id: 'des-069', company: 'Brandstetter Carroll', city: 'Lexington', state: 'KY', contactTitle: 'Principal / Interior Design', website: 'bcainc.com', pitchAngle: 'Central Kentucky architecture with education and civic practice; DI-NOC wall graphics and surface films in school and university renovation.' },
  { id: 'des-070', company: 'CMTA', city: 'Louisville', state: 'KY', contactTitle: 'Interior Design Lead', website: 'cmta.com', pitchAngle: 'Engineering-led firm with building design practice; DI-NOC surface upgrades in Louisville commercial and institutional facility renovation.' },
  { id: 'des-071', company: 'GBBN Louisville', city: 'Louisville', state: 'KY', contactTitle: 'Senior Interior Designer', website: 'gbbn.com', pitchAngle: 'Healthcare and education practice; DI-NOC antimicrobial films are directly applicable to their Louisville hospital and school projects.' },
  { id: 'des-072', company: 'KZF Design', city: 'Louisville', state: 'KY', contactTitle: 'Interior Design Director', website: 'kzfdesign.com', pitchAngle: 'Full-service engineering and architecture; commercial and government renovation where DI-NOC is value-engineered into interior packages.' },
  { id: 'des-073', company: 'Arrasmith Judd Rapp Chovan', city: 'Louisville', state: 'KY', contactTitle: 'Interior Design Lead', website: 'ajrci.com', pitchAngle: 'Established Louisville AIA firm; healthcare and commercial renovation where DI-NOC and Rea Tec provide durable interior surface upgrades.' },
  { id: 'des-074', company: 'Stantec Kentucky', city: 'Louisville', state: 'KY', contactTitle: 'Interior Design Lead', website: 'stantec.com', pitchAngle: 'Infrastructure-led firm; government and transit facility interiors where DI-NOC surface films reduce renovation disruption.' },
  { id: 'des-075', company: 'JRA Architects Louisville', city: 'Louisville', state: 'KY', contactTitle: 'Principal', pitchAngle: 'Commercial and government practice in Louisville; DI-NOC surface films in municipal and commercial interior renovation projects.' },

  // ── IIDA / ASID members (interior design specialists) ───────────────────
  { id: 'des-076', company: 'Bremner Design Group', city: 'Indianapolis', state: 'IN', contactTitle: 'Principal Interior Designer', pitchAngle: 'ASID member boutique interiors practice; DI-NOC wood and metallic films for high-end Indianapolis residential and commercial renovation.' },
  { id: 'des-077', company: 'Stout + Perry Interior Design', city: 'Indianapolis', state: 'IN', contactTitle: 'Principal', pitchAngle: 'Boutique hospitality and residential interiors; Rea Tec surface films for premium renovation where budget meets luxury expectation.' },
  { id: 'des-078', company: 'Storey & Associates Interior Design', city: 'Cincinnati', state: 'OH', contactTitle: 'Principal Interior Designer', pitchAngle: 'IIDA Cincinnati member; commercial and corporate interiors — DI-NOC branding films for workplace environments.' },
  { id: 'des-079', company: 'Interior Investments', city: 'Chicago', state: 'IL', contactTitle: 'Director of Interior Design', website: 'interiorinvestments.com', pitchAngle: 'Large commercial furniture and interiors firm; DI-NOC films complement their workplace design and office installation services.' },
  { id: 'des-080', company: 'Luxe Interiors + Design Chicago', city: 'Chicago', state: 'IL', contactTitle: 'Principal Designer', pitchAngle: 'High-end residential and hospitality interiors; DI-NOC premium films (metallic, leather, wood) for luxury renovation clients.' },
  { id: 'des-081', company: 'FitzGerald Associates Architects', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Lead', website: 'fitzgeraldassoc.com', pitchAngle: 'Multifamily and mixed-use specialist; DI-NOC accent surfaces in Chicago apartment and condo renovation projects.' },
  { id: 'des-082', company: 'TK Architects', city: 'Overland Park', state: 'KS', contactTitle: 'Interior Design Lead', website: 'tkarchitects.com', pitchAngle: 'Cinema and entertainment design specialist; DI-NOC metallic and fabric films for theater lobby and auditorium renovation.' },
  { id: 'des-083', company: 'STUDIO V Design', city: 'Detroit', state: 'MI', contactTitle: 'Principal Interior Designer', pitchAngle: 'Detroit boutique commercial interiors; DI-NOC wood and stone films for the automotive city\'s corporate office renovation market.' },
  { id: 'des-084', company: 'Interphase Interiors', city: 'Columbus', state: 'OH', contactTitle: 'Director of Interior Design', pitchAngle: 'Corporate furniture and interiors dealer; DI-NOC film upgrades complement their workplace design and installation services.' },
  { id: 'des-085', company: 'IKM Architecture', city: 'Pittsburgh', state: 'PA', contactTitle: 'Interior Design Principal', website: 'ikmarch.com', pitchAngle: 'Healthcare and education specialist with Midwest reach; DI-NOC antimicrobial films for hospital and school renovation projects.' },

  // ── Design-Build GCs with in-house interiors ─────────────────────────────
  { id: 'des-086', company: 'Shiel Sexton', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Finishes Coordinator', website: 'shielsexton.com', pitchAngle: 'Large Indiana GC with in-house design; Rea Tec and DI-NOC films are value-engineering alternatives when owner budgets are squeezed on TI projects.' },
  { id: 'des-087', company: 'Pepper Construction Indiana', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Finishes Lead', website: 'pepperconstruction.com', pitchAngle: 'Design-build GC with interiors practice; DI-NOC and Rea Tec reduce millwork costs without sacrificing finish quality. Pitch the ROI.' },
  { id: 'des-088', company: 'Power Construction', city: 'Chicago', state: 'IL', contactTitle: 'Interior Finishes Coordinator', website: 'powerconstruction.net', pitchAngle: 'Large Chicago GC with healthcare and commercial practice; DI-NOC value-engineering in pre-construction for hospital and office renovation.' },
  { id: 'des-089', company: 'Turner Construction Ohio', city: 'Columbus', state: 'OH', contactTitle: 'Interior Finishes Lead', website: 'turnerconstruction.com', pitchAngle: 'Major GC with in-house design; Rea Tec and DI-NOC in pre-construction value-engineering for large hospital and campus projects.' },
  { id: 'des-090', company: 'Messer Construction', city: 'Cincinnati', state: 'OH', contactTitle: 'Interior Finishes Coordinator', website: 'messer.com', pitchAngle: 'Design-build GC with strong healthcare and higher-ed practice; DI-NOC value-engineering in renovation bid packages.' },
  { id: 'des-091', company: 'Walbridge', city: 'Detroit', state: 'MI', contactTitle: 'Finishes Coordinator', website: 'walbridge.com', pitchAngle: 'Large design-build GC with industrial and commercial practice; DI-NOC and Rea Tec films in pre-construction value-engineering packages.' },
  { id: 'des-092', company: 'Granger Construction', city: 'Lansing', state: 'MI', contactTitle: 'Interior Finishes Lead', website: 'grangerconstruction.com', pitchAngle: 'Design-build GC with public sector focus; DI-NOC and Rea Tec in pre-construction value-engineering for Michigan government projects.' },
  { id: 'des-093', company: 'Bulley & Andrews', city: 'Chicago', state: 'IL', contactTitle: 'Interior Finishes Coordinator', website: 'bulley.com', pitchAngle: 'Historic restoration and commercial GC; DI-NOC wood and stone films for code-compliant interior surface refinishing in landmark buildings.' },
  { id: 'des-094', company: 'Clayco', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Lead', website: 'claycorp.com', pitchAngle: 'Design-build giant; Rea Tec and DI-NOC films in large-scale commercial and industrial interior packages. Major pipeline opportunity.' },
  { id: 'des-095', company: 'FCL Builders', city: 'Itasca', state: 'IL', contactTitle: 'Finishes Coordinator', website: 'fclbuilders.com', pitchAngle: 'Industrial and commercial design-build GC; DI-NOC and Rea Tec in value-engineering for Chicago suburban commercial renovation.' },

  // ── High-value boutique/specialty ────────────────────────────────────────
  { id: 'des-096', company: 'pH Design Studio', city: 'Indianapolis', state: 'IN', contactTitle: 'Principal', pitchAngle: 'Boutique commercial interiors; high-end hospitality and restaurant clients in Indy where DI-NOC metallic and wood films elevate budgets.' },
  { id: 'des-097', company: 'CBRE Design Collective Chicago', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Lead', pitchAngle: 'Corporate tenant improvement and workplace design; DI-NOC films for cost-effective brand environment in Chicago office interiors.' },
  { id: 'des-098', company: 'INFORM Studio', city: 'Northville', state: 'MI', contactTitle: 'Director of Interior Design', phone: '248-449-3564', website: 'in-formstudio.com', pitchAngle: 'Mixed-use, retail, hospitality, learning environments — multidisciplinary WBE firm specifies finishes across large public-realm projects.' },
  { id: 'des-099', company: 'Victor Saroki & Associates', city: 'Birmingham', state: 'MI', contactTitle: 'Principal Designer', pitchAngle: 'Boutique commercial and residential design; high-end DI-NOC metallic and wood films for Detroit-area luxury renovation projects.' },
  { id: 'des-100', company: 'STL Architects Chicago', city: 'Chicago', state: 'IL', contactTitle: 'Creative Director', pitchAngle: 'Boutique commercial and hospitality design; DI-NOC metallic and wood films for Chicago restaurant and hotel renovation clients with premium budgets.' },
];

async function seedLeads(userId, userEmail) {
  let inserted = 0, skipped = 0;
  for (const lead of DESIGNERS) {
    try {
      const r = await pool.query(`
        INSERT INTO leads (
          user_id, client_id, company, category, state, city,
          contact_name, contact_title, email, phone, website,
          fleet_size, pitch_angle, status, created_at, updated_at
        ) VALUES ($1,$2,$3,'dinoc',$4,$5,$6,$7,$8,$9,$10,NULL,$11,'cold',NOW(),NOW())
        ON CONFLICT (user_id, client_id) DO NOTHING
      `, [
        String(userId),
        lead.id,
        lead.company,
        lead.state,
        lead.city || null,
        lead.contactName || null,
        lead.contactTitle || null,
        lead.email || null,
        lead.phone || null,
        lead.website || null,
        lead.pitchAngle || lead.pitch || null,
      ]);
      if (r.rowCount > 0) inserted++;
      else skipped++;
    } catch (e) {
      console.error(`  ✗ ${lead.company}: ${e.message}`);
    }
  }
  console.log(`  ${userEmail}: +${inserted} new leads (${skipped} already existed)`);
}

async function main() {
  console.log('\nWrapLeads — Interior Design / AIA Lead Seeder');
  console.log('='.repeat(50));

  const { rows: users } = await pool.query('SELECT id, email FROM users ORDER BY id');
  if (!users.length) {
    console.log('No users found. Register an account first, then re-run.');
    process.exit(0);
  }

  console.log(`\nSeeding ${DESIGNERS.length} designer leads across ${users.length} user(s):`);
  console.log(`  · 20 Indiana top-priority firms`);
  console.log(`  · 15 Ohio top-priority firms`);
  console.log(`  · 15 Michigan top-priority firms`);
  console.log(`  · 15 Illinois top-priority firms`);
  console.log(`  · 10 Kentucky top-priority firms`);
  console.log(`  · 10 IIDA/ASID specialists`);
  console.log(`  · 10 design-build GCs with in-house interiors`);
  console.log(`  · 5 high-value boutique firms`);
  console.log('');

  for (const user of users) {
    await seedLeads(user.id, user.email);
  }

  console.log('\nDone. All leads tagged category=dinoc, ready to email.\n');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
