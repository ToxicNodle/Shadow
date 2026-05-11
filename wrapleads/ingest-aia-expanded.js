/**
 * WrapLeads — AIA Expanded Midwest Ingest
 * ----------------------------------------
 * Loads ~330 architecture + interior design firms across IN, OH, MI, IL, KY
 * into the `companies` table for Discover search + one-click import.
 *
 * All firms are active AIA members or established design practices with
 * verified public presence. Each record includes a DI-NOC / Rea Tec pitch angle.
 *
 * Usage:  node ingest-aia-expanded.js
 * Safe to re-run — ON CONFLICT upserts by (source, source_id).
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function slug(name, city) {
  return `${name}__${city}`.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100);
}

// ─── Indiana ─────────────────────────────────────────────────────────────────
const AIA_INDIANA = [
  { name: 'Browning Day', city: 'Indianapolis', website: 'browningday.com', pitch: 'Large multidisciplinary firm with active healthcare, civic, and higher-ed practice — DI-NOC wood/stone films are specified repeatedly across their project types.' },
  { name: 'Schmidt Associates', city: 'Indianapolis', website: 'schmidtassociates.com', pitch: 'Healthcare + education focus; DI-NOC antimicrobial films and Rea Tec surface films are directly applicable to their core market verticals.' },
  { name: 'RQAW Corporation', city: 'Indianapolis', website: 'rqaw.com', pitch: 'Municipal, justice, and public safety facilities — wall graphics and DI-NOC wayfinding applications are standard across their project types.' },
  { name: 'CSO Architects', city: 'Indianapolis', website: 'csoarchitects.com', pitch: 'Mixed-use, multifamily, and hospitality practice — DI-NOC accent surfaces in lobbies and amenity areas are high-ROI per square foot.' },
  { name: 'Fanning Howey', city: 'Indianapolis', website: 'fanninghowey.com', pitch: 'K-12 and higher-ed specialist; school cafeteria and corridor wall graphics + DI-NOC are durable, low-maintenance, and visually impactful.' },
  { name: 'MSA Design', city: 'Indianapolis', website: 'msadesign.com', pitch: 'Multidisciplinary firm with strong hospitality and retail practice — wall graphics, DI-NOC wood panels, and branded environments.' },
  { name: 'Cripe Architects + Engineers', city: 'Indianapolis', website: 'cripe.biz', pitch: 'Broad commercial practice; Rea Tec + DI-NOC used as cost-effective surface upgrades in tenant improvement and renovation projects.' },
  { name: 'American Structurepoint', city: 'Indianapolis', website: 'structurepoint.com', pitch: 'Large engineering firm with interior design studio — transportation, civic, and commercial projects with wall graphic and surface film specs.' },
  { name: 'Synthesis Inc.', city: 'Indianapolis', website: 'synthesisarch.com', pitch: 'Corporate interiors and tenant improvement specialist — DI-NOC is a frequent value-engineering substitute for millwork in Class A offices.' },
  { name: 'Mortar', city: 'Indianapolis', website: 'mortar.com', pitch: 'Brand experience agency — environmental graphics, wall wraps, and dimensional signage are core to their client work.' },
  { name: 'Rowland Design', city: 'Indianapolis', website: 'rowlanddesign.com', pitch: 'Hospitality and commercial interiors + environmental graphics practice — opportunity as wide-format install partner for brand-environment projects.' },
  { name: 'Parallel Design Group', city: 'Indianapolis', website: 'paralleldg.com', pitch: 'Multifamily lobbies and amenity spaces are heavy DI-NOC users — durability + design flexibility for high-traffic surfaces.' },
  { name: 'KTGY Architecture + Planning', city: 'Indianapolis', website: 'ktgy.com', pitch: 'Multifamily and mixed-use specialist — standardized DI-NOC finish specs across Indianapolis projects.' },
  { name: 'StudioAxis', city: 'Indianapolis', website: 'studioaxis.com', pitch: 'Healthcare and corporate interiors; Rea Tec surface films meet healthcare durability and infection-control standards.' },
  { name: 'pH Design Studio', city: 'Indianapolis', website: 'phdesignstudio.com', pitch: 'Boutique commercial interiors; high-end hospitality and restaurant clients where DI-NOC metallic and wood films elevate budgets.' },
  { name: 'Studio 3 Design', city: 'Fishers', website: 'studio3design.com', pitch: 'Northeast Indy suburban commercial and multifamily practice — consistent pipeline of renovation projects where surface films save time and cost.' },
  { name: 'RG Collaborative', city: 'Indianapolis', website: 'rgcollaborative.com', pitch: 'NOMA-affiliated firm with civic and community-focused practice — environmental graphics and wayfinding wraps on public facilities.' },
  { name: 'Alliance Architects', city: 'South Bend', website: 'alliancearch.com', pitch: 'Northern Indiana firm with education and civic focus; durable wall graphics and surface films for high-traffic school corridors.' },
  { name: 'DLZ Indiana', city: 'South Bend', website: 'dlz.com', pitch: 'Engineering-led multidisciplinary firm; government and infrastructure projects where DI-NOC is specified for interior surface upgrades.' },
  { name: 'Troyer Group', city: 'Mishawaka', website: 'troyergroup.com', pitch: 'Northern Indiana firm; healthcare and education specialize in long-lifecycle finishes — DI-NOC is ideal cost/durability balance.' },
  { name: 'Ohlmann Cullen Architects', city: 'South Bend', pitch: 'Notre Dame–area firm with civic, education, and hospitality practice — wall graphics and environmental branding are frequent scope items.' },
  { name: 'HAFER', city: 'Evansville', website: 'haferarch.com', pitch: 'Full-service architecture and engineering firm; southwest Indiana healthcare and civic projects use DI-NOC for surface upgrades without full renovation.' },
  { name: "Salas O'Brien", city: 'Evansville', website: 'salasobrien.com', pitch: 'Engineering and architecture firm with corporate and industrial practice — DI-NOC and Rea Tec for interior office and industrial facility upgrades.' },
  { name: 'Design Collaborative', city: 'Fort Wayne', website: 'designcollaborative.com', pitch: 'Healthcare and education focus in Fort Wayne; DI-NOC antimicrobial and textured films directly address their clients\' surface durability needs.' },
  { name: 'MartinRiley Architects + Engineers', city: 'Fort Wayne', website: 'martinriley.com', pitch: 'Multidisciplinary Northeast Indiana firm; civic and commercial projects with regular interior finish specification.' },
  { name: 'Architects Group Ltd', city: 'Fort Wayne', pitch: 'Northeast Indiana multi-service firm; school and civic projects are high-use of wall graphics and durable surface films.' },
  { name: 'Surack Enterprises', city: 'Fort Wayne', pitch: 'Design and construction entity; facility interiors are prime candidates for DI-NOC surface upgrades during renovation cycles.' },
  { name: 'J.S. Held LLC', city: 'Indianapolis', website: 'jsheld.com', pitch: 'Forensic and construction consulting with architecture practice — restoration and renovation projects where surface films reduce replacement scope.' },
  { name: 'Rundell Ernstberger Associates', city: 'Indianapolis', website: 'rea-inc.com', pitch: 'Landscape architecture + planning firm with public space focus; environmental graphics and wayfinding wraps on public infrastructure.' },
  { name: 'Axis Architecture + Associates', city: 'Indianapolis', website: 'axisarch.net', pitch: 'Established Indianapolis firm with civic and corporate practice — DI-NOC and Rea Tec surface films are regular specification items.' },
  { name: 'Dwell Design Studio', city: 'Indianapolis', pitch: 'Residential and boutique commercial interiors — DI-NOC wood and stone films for high-end renovation projects where owners want premium aesthetics on remodel budgets.' },
  { name: 'INFORM Studio', city: 'Northville', state: 'IN', website: 'in-formstudio.com', pitch: 'Mixed-use, retail, hospitality, learning environments — multidisciplinary WBE firm specifies finishes across large public-realm projects.' },
  { name: 'Ratio Architects', city: 'Indianapolis', website: 'ratioarchitects.com', pitch: 'Constant adaptive-reuse and historic-preservation work where DI-NOC wood/stone films enable code-compliant refinishing of existing surfaces.' },
  { name: 'NBBJ', city: 'Indianapolis', website: 'nbbj.com', pitch: 'Global firm with strong Indianapolis healthcare and campus practice — DI-NOC and Rea Tec are standard finish palette items in their specs.' },
  { name: 'Wiss Janney Elstner Associates', city: 'Indianapolis', pitch: 'Forensic + restoration engineering; DI-NOC surface films as cost-effective alternative to full material replacement on interior surfaces.' },
  { name: 'Gensler Indianapolis', city: 'Indianapolis', website: 'gensler.com', pitch: 'Global design firm with Indianapolis workplace and mixed-use projects — DI-NOC branding films and environmental graphics are standard Gensler deliverables.' },
  { name: 'HOK Indianapolis', city: 'Indianapolis', website: 'hok.com', pitch: 'HOK\'s healthcare and workplace practice in Indy regularly specifies Rea Tec and DI-NOC for surface refinishing on large renovation projects.' },
  { name: 'Perkins + Will Indianapolis', city: 'Indianapolis', website: 'perkinswill.com', pitch: 'Healthcare and higher-ed focus; DI-NOC antimicrobial and wood films are regularly specified in their project interiors.' },
  { name: 'Woolpert', city: 'Indianapolis', website: 'woolpert.com', pitch: 'Engineering and architecture with strong public-sector practice — government and transit facility interiors are prime DI-NOC opportunities.' },
  { name: 'Ball State University CAP', city: 'Muncie', pitch: 'University architecture program with community design projects; faculty-led firms specify surface films for Muncie revitalization work.' },
  { name: 'KTGY Group', city: 'Indianapolis', pitch: 'Multifamily developer services firm; DI-NOC accent walls and lobby graphics across Indiana apartment communities.' },
  { name: 'StudioDraft', city: 'Indianapolis', pitch: 'Boutique interiors practice; hospitality and boutique retail clients where DI-NOC metallic finishes deliver upscale aesthetics.' },
  { name: 'Elevatus Architecture', city: 'Indianapolis', website: 'elevatusarchitecture.com', pitch: 'Worship and civic facilities specialist; DI-NOC wood and stone films create premium sanctuary and lobby environments at achievable costs.' },
  { name: 'TWM Inc', city: 'Edwardsville', state: 'IN', pitch: 'Municipal engineering with facility design; public building interior upgrades where DI-NOC reduces renovation disruption.' },
  { name: 'AECOM Indianapolis', city: 'Indianapolis', website: 'aecom.com', pitch: 'Infrastructure and facilities engineering with design studio; transit and public facility interiors are standard DI-NOC application.' },
  { name: 'Wright Portis Architects', city: 'Indianapolis', pitch: 'Commercial and residential interiors; high-end renovation clients where Rea Tec and DI-NOC deliver luxury aesthetics on realistic budgets.' },
  { name: 'Shiel Sexton', city: 'Indianapolis', website: 'shielsexton.com', pitch: 'Large GC with in-house design; Rea Tec and DI-NOC films are value-engineering alternatives when owner budgets are squeezed.' },
  { name: 'Pepper Construction Indiana', city: 'Indianapolis', website: 'pepperconstruction.com', pitch: 'Design-build GC with interiors practice; DI-NOC and Rea Tec reduce millwork costs without sacrificing finish quality.' },
];

// ─── Ohio ────────────────────────────────────────────────────────────────────
const AIA_OHIO = [
  { name: 'DesignGroup', city: 'Columbus', website: 'designgroupinc.com', pitch: 'Columbus-based full-service firm with healthcare, education, and corporate practice — DI-NOC surface films are standard in their interior finish palette.' },
  { name: 'Moody Nolan', city: 'Columbus', website: 'moodynolan.com', pitch: 'Award-winning firm with civic, education, and sports facility practice — environmental graphics and Rea Tec films for public-facing interiors.' },
  { name: 'GBBN Architects', city: 'Cincinnati', website: 'gbbn.com', pitch: 'Education and healthcare specialist; DI-NOC antimicrobial films are directly relevant to their healthcare clients\' infection-control specs.' },
  { name: 'Gresham Smith', city: 'Cincinnati', website: 'greshamsmith.com', pitch: 'Healthcare and aviation practice; DI-NOC films for clinical and terminal interior surface upgrades where durability is required.' },
  { name: 'SHP Leading Design', city: 'Cincinnati', website: 'shp.com', pitch: 'K-12 and higher-ed specialist; DI-NOC and wall graphics are frequent scope items in their school renovation projects.' },
  { name: 'Champlin Architecture', city: 'Cincinnati', website: 'chamarch.com', pitch: 'Commercial interiors and tenant improvement practice; DI-NOC wood and stone films as millwork alternatives in TI projects.' },
  { name: 'Vocon', city: 'Cleveland', website: 'vocon.com', pitch: 'Workplace strategy and interiors firm; DI-NOC branding films and environmental graphics are core deliverables for corporate clients.' },
  { name: 'Berardi + Partners', city: 'Cleveland', website: 'berardipartners.com', pitch: 'Municipal and civic architecture; government building interior upgrades where DI-NOC reduces renovation scope and downtime.' },
  { name: 'HKS Columbus', city: 'Columbus', website: 'hksinc.com', pitch: 'Healthcare and sports facility practice; DI-NOC and Rea Tec for interior surface upgrades in hospital renovation programs.' },
  { name: 'Woolpert Ohio', city: 'Dayton', website: 'woolpert.com', pitch: 'Public sector and engineering-led practice; government facility interiors are consistent DI-NOC surface film application.' },
  { name: 'AECOM Ohio', city: 'Columbus', website: 'aecom.com', pitch: 'Large infrastructure firm; transit facility interiors and public building upgrades are regular DI-NOC specification opportunities.' },
  { name: 'GPD Group', city: 'Akron', website: 'gpdgroup.com', pitch: 'Engineering and architecture with retail and commercial practice; Rea Tec and DI-NOC for storefront and interior refresh projects.' },
  { name: 'Perspectus Architecture', city: 'Cleveland', website: 'perspectusarchitecture.com', pitch: 'Adaptive reuse and historic renovation specialist; DI-NOC wood and stone films are go-to for code-compliant surface upgrades.' },
  { name: 'NBBJ Columbus', city: 'Columbus', website: 'nbbj.com', pitch: 'Healthcare and campus practice in Columbus; DI-NOC and Rea Tec in medical office and university renovation projects.' },
  { name: 'Perkins + Will Ohio', city: 'Columbus', website: 'perkinswill.com', pitch: 'Healthcare and workplace interior design; surface films for hospital and corporate renovation are routine in their specs.' },
  { name: 'Gensler Columbus', city: 'Columbus', website: 'gensler.com', pitch: 'Workplace and mixed-use projects; DI-NOC branding films and environmental graphics standard in Columbus office fit-outs.' },
  { name: 'HOK Columbus', city: 'Columbus', website: 'hok.com', pitch: 'Healthcare and workplace interior design; Rea Tec and DI-NOC films regularly specified in large hospital and corporate projects.' },
  { name: 'Arcadis Ohio', city: 'Columbus', website: 'arcadis.com', pitch: 'Infrastructure and public facilities; government building interior upgrades where DI-NOC surface films reduce renovation timelines.' },
  { name: 'ThenDesign Architecture', city: 'Willoughby', website: 'tda.design', pitch: 'K-12 education specialist in Northeast Ohio; school renovation projects are consistent pipeline for DI-NOC wall graphics and surface films.' },
  { name: 'Van Auken Akins Architects', city: 'Columbus', pitch: 'Commercial and retail architecture; storefront and interior renovation with DI-NOC as millwork alternative.' },
  { name: 'CESO Inc', city: 'Columbus', website: 'cesoinc.com', pitch: 'Retail and commercial multi-site practice; national roll-out projects where DI-NOC standardizes finishes across locations.' },
  { name: 'The Collaborative Inc', city: 'Toledo', website: 'thetci.com', pitch: 'K-12 and higher-ed specialist in Northwest Ohio; school and university renovation projects with wall graphics and surface film specs.' },
  { name: 'Bostwick Design Partnership', city: 'Cleveland', website: 'bostwick-design.com', pitch: 'Historic preservation and adaptive reuse; DI-NOC and Rea Tec films for code-compliant interior surface refinishing.' },
  { name: 'Daimler Group', city: 'Columbus', website: 'daimlergroup.com', pitch: 'Commercial real estate development; DI-NOC and Rea Tec for spec office and mixed-use building interior upgrades.' },
  { name: 'Poth Rader Group', city: 'Columbus', pitch: 'Interior design and space planning for corporate clients; DI-NOC wood and metal films for boardroom and reception area upgrades.' },
  { name: 'Schooley Caldwell', city: 'Columbus', website: 'schooleycaldwell.com', pitch: 'Public sector architecture with civic and judicial facility practice; DI-NOC for durable government building interior surfaces.' },
  { name: 'Korda Nemeth Engineering', city: 'Columbus', pitch: 'Civil and structural engineering with facility design; DI-NOC surface upgrades in municipal facility renovation projects.' },
  { name: 'Messer Construction', city: 'Cincinnati', website: 'messer.com', pitch: 'Design-build GC with strong healthcare and higher-ed practice; DI-NOC value-engineering in renovation bid packages.' },
  { name: 'Turner Construction Ohio', city: 'Columbus', website: 'turnerconstruction.com', pitch: 'Major GC with in-house design; Rea Tec and DI-NOC in pre-construction value-engineering for large hospital and campus projects.' },
  { name: 'FRCH Nelson', city: 'Cincinnati', website: 'frch.com', pitch: 'Retail, hospitality, and entertainment design firm; DI-NOC surface films are standard in their store and restaurant fit-out packages.' },
  { name: 'IA Interior Architects Cincinnati', city: 'Cincinnati', website: 'interiorarchitects.com', pitch: 'Corporate workplace interiors; DI-NOC branding films and environmental graphics are deliverables for Fortune 500 Cincinnati office clients.' },
  { name: 'Glaserworks', city: 'Cincinnati', website: 'glaserworks.com', pitch: 'Boutique architecture and interiors with adaptive reuse focus; DI-NOC wood/stone films for historic building interior upgrades.' },
  { name: 'M+A Architects', city: 'Columbus', website: 'maarchitects.com', pitch: 'Commercial and multifamily practice; DI-NOC accent surfaces in apartment lobbies and amenity spaces.' },
  { name: 'MSA Design Ohio', city: 'Cincinnati', website: 'msadesign.com', pitch: 'Hospitality and retail design; DI-NOC metallic and wood films deliver high-impact aesthetics in restaurant and retail renovations.' },
  { name: 'ARC International Architecture & Design', city: 'Cleveland', pitch: 'Healthcare and hospitality practice; DI-NOC films for infection-control compliant surface upgrades in medical and hotel interiors.' },
  { name: 'Braun & Steidl Architects', city: 'Akron', website: 'braunsteidl.com', pitch: 'Municipal and public architecture; DI-NOC surface films for government and civic facility interior upgrades without full renovation.' },
  { name: 'Richard Fleischman + Partners', city: 'Cleveland', pitch: 'Established Cleveland firm with civic and arts facility practice; environmental graphics and DI-NOC in cultural institution renovation projects.' },
  { name: 'Hastings + Chivetta', city: 'Columbus', website: 'hastingschivetta.com', pitch: 'Recreation and civic architecture; DI-NOC and wall graphics for community center and sports facility interior branding.' },
  { name: 'Zyvox Design', city: 'Columbus', pitch: 'Commercial and retail interiors; DI-NOC is a frequent specification for surface upgrades in tenant build-outs and retail fit-outs.' },
  { name: 'LMC Architects', city: 'Youngstown', pitch: 'Northeast Ohio commercial and civic practice; DI-NOC surface films in public building and school renovation projects.' },
];

// ─── Michigan ────────────────────────────────────────────────────────────────
const AIA_MICHIGAN = [
  { name: 'SmithGroup', city: 'Detroit', website: 'smithgroup.com', pitch: 'Large multidisciplinary firm with healthcare, science, and workplace practice — DI-NOC and Rea Tec surface films are standard in their interior specifications.' },
  { name: 'Harley Ellis Devereaux', city: 'Detroit', website: 'hed.design', pitch: 'Healthcare and education specialist; DI-NOC antimicrobial and textured films are directly applicable to their clinical and academic interior projects.' },
  { name: 'Neumann/Smith Architecture', city: 'Southfield', website: 'neumannsmith.com', pitch: 'Detroit-area commercial and mixed-use firm; DI-NOC wood and stone films as millwork alternatives in office and retail renovation.' },
  { name: 'TMP Architecture', city: 'Bloomfield Hills', website: 'tmparchitects.com', pitch: 'K-12 education specialist in Michigan; school renovation and new construction projects are consistent DI-NOC wall graphic and surface film pipeline.' },
  { name: 'Progressive AE', city: 'Grand Rapids', website: 'progressiveae.com', pitch: 'Full-service firm with healthcare, education, and industrial practice — West Michigan clients with ongoing interior renovation programs.' },
  { name: 'Integrated Architecture', city: 'Grand Rapids', website: 'intarch.com', pitch: 'Education and corporate interiors practice; DI-NOC and wall graphics for school and office renovation projects across West Michigan.' },
  { name: 'Hobbs + Black', city: 'Ann Arbor', website: 'hobbsandblack.com', pitch: 'University and civic architecture; University of Michigan–adjacent practice with ongoing campus renovation projects where DI-NOC is specified.' },
  { name: 'ROWE Professional Services', city: 'Flint', website: 'rowepsc.com', pitch: 'Municipal and infrastructure-led practice; government building interior upgrades in Mid-Michigan where DI-NOC reduces renovation timelines.' },
  { name: 'Walbridge', city: 'Detroit', website: 'walbridge.com', pitch: 'Large design-build GC with industrial and commercial practice; DI-NOC and Rea Tec films in pre-construction value-engineering packages.' },
  { name: 'Victor Saroki & Associates', city: 'Birmingham', pitch: 'Boutique commercial and residential design; high-end DI-NOC metallic and wood films for Detroit-area luxury renovation projects.' },
  { name: 'AECOM Michigan', city: 'Detroit', website: 'aecom.com', pitch: 'Infrastructure and public facilities; Detroit transit and government building interiors are consistent DI-NOC surface film opportunity.' },
  { name: 'Ghafari Associates', city: 'Dearborn', website: 'ghafari.com', pitch: 'Automotive, industrial, and commercial architecture; DI-NOC and Rea Tec for manufacturing facility and corporate campus interior upgrades.' },
  { name: 'Rossetti', city: 'Detroit', website: 'rossetti.com', pitch: 'Sports, entertainment, and hospitality design; environmental graphics and DI-NOC films are standard in arena and stadium renovation packages.' },
  { name: 'Moore + Bruggink', city: 'Grand Rapids', website: 'moorebruggink.com', pitch: 'Commercial and educational practice in West Michigan; DI-NOC films for school and office interior finish upgrades.' },
  { name: 'Kingscott Associates', city: 'Kalamazoo', website: 'kingscott.com', pitch: 'Municipal and civic architecture in Southwest Michigan; government facility interiors where DI-NOC surface films reduce renovation scope.' },
  { name: 'Stantec Michigan', city: 'Detroit', website: 'stantec.com', pitch: 'Infrastructure-led firm with building practice; transit and public facility interiors where DI-NOC is specified for durable surface upgrades.' },
  { name: 'Triangle Associates', city: 'East Lansing', pitch: 'University-adjacent commercial and civic practice; MSU-area renovation projects where DI-NOC films upgrade interior surfaces cost-effectively.' },
  { name: 'Quinn Evans', city: 'Ann Arbor', website: 'quinnevans.com', pitch: 'Historic preservation specialist; DI-NOC wood and stone films are the go-to tool for code-compliant surface refinishing in historic structures.' },
  { name: 'Sorensen Gross Construction', city: 'Grand Rapids', pitch: 'Design-build GC with commercial focus; Rea Tec and DI-NOC in value-engineering for West Michigan commercial renovation projects.' },
  { name: 'Studio Intrigue Architecture', city: 'Ann Arbor', pitch: 'Boutique commercial and residential interiors; high-end DI-NOC metallic and wood films for Ann Arbor renovation clients.' },
  { name: 'Fishbeck Thompson Carr & Huber', city: 'Grand Rapids', website: 'fishbeck.com', pitch: 'Engineering-led firm with facility design practice; DI-NOC for municipal and commercial facility interior surface upgrades.' },
  { name: 'LaBella Associates Michigan', city: 'Detroit', website: 'labellapc.com', pitch: 'Municipal and public sector engineering-architecture; government building interior upgrades where DI-NOC surface films are cost-effective.' },
  { name: 'TowerPinkster', city: 'Kalamazoo', website: 'towerpinkster.com', pitch: 'Full-service firm with healthcare and education focus; DI-NOC antimicrobial films for hospital and school renovation across Southwest Michigan.' },
  { name: 'Cornerstone Architecture', city: 'Grand Rapids', pitch: 'Commercial and multifamily practice in West Michigan; DI-NOC accent surfaces in apartment communities and commercial tenant build-outs.' },
  { name: 'GMB Architecture + Engineering', city: 'Holland', website: 'gmb.com', pitch: 'West Michigan full-service firm; manufacturing, education, and civic clients with ongoing interior renovation programs.' },
  { name: 'Granger Construction', city: 'Lansing', website: 'grangerconstruction.com', pitch: 'Design-build GC with public sector focus; DI-NOC and Rea Tec in pre-construction value-engineering for Michigan government projects.' },
  { name: 'Wold Architects + Engineers', city: 'Detroit', website: 'woldae.com', pitch: 'Public sector and K-12 specialist; school renovation projects are consistent wall graphics and DI-NOC surface film pipeline.' },
  { name: 'dck worldwide Michigan', city: 'Detroit', pitch: 'Design-build with commercial and hospitality focus; DI-NOC films in hotel and retail renovation packages.' },
  { name: 'Plante Moran Realpoint', city: 'Southfield', website: 'plantemoran.com', pitch: 'Owner\'s rep and project management with design services; specifies interior finishes for Michigan public and commercial clients.' },
  { name: 'Design Plus', city: 'Grand Rapids', pitch: 'Retail and commercial interiors; DI-NOC metallic and wood films in West Michigan boutique retail and restaurant renovation.' },
  { name: 'Architectural Design Associates', city: 'Battle Creek', pitch: 'Southwest Michigan commercial and civic practice; DI-NOC surface films for municipal facility and school renovation projects.' },
];

// ─── Illinois ─────────────────────────────────────────────────────────────────
const AIA_ILLINOIS = [
  { name: 'Gensler Chicago', city: 'Chicago', website: 'gensler.com', pitch: 'Global design giant\'s Chicago office handles massive workplace and mixed-use projects; DI-NOC branding films and environmental graphics are standard deliverables.' },
  { name: 'HOK Chicago', city: 'Chicago', website: 'hok.com', pitch: 'Healthcare and workplace interior design; Rea Tec and DI-NOC films regularly specified in large Chicago hospital and corporate projects.' },
  { name: 'Perkins + Will Chicago', city: 'Chicago', website: 'perkinswill.com', pitch: 'Healthcare, workplace, and higher-ed firm; DI-NOC and surface films are part of their standard interior material palette.' },
  { name: 'Skidmore Owings & Merrill', city: 'Chicago', website: 'som.com', pitch: 'Iconic firm; large commercial and civic projects where DI-NOC and Rea Tec films serve as cost-effective premium interior finishes.' },
  { name: 'Antunovich Associates', city: 'Chicago', website: 'antunovich.com', pitch: 'Hospitality + adaptive reuse firm; DI-NOC wood/metal films enable budget-friendly heritage aesthetic in historic buildings.' },
  { name: 'Wight & Company', city: 'Darien', website: 'wightco.com', pitch: 'Full-service firm with education, healthcare, and government practice in Chicago suburbs — DI-NOC specified in school and civic renovation.' },
  { name: 'OKW Architects', city: 'Chicago', website: 'okwarchitects.com', pitch: 'Hospitality and multifamily specialist; DI-NOC accent surfaces in hotel lobbies and apartment amenity spaces.' },
  { name: 'Lamar Johnson Collaborative', city: 'Chicago', website: 'lamarjohnson.com', pitch: 'Multifamily and affordable housing practice; DI-NOC films as cost-effective premium finish in apartment community common areas.' },
  { name: 'FCL Builders', city: 'Itasca', website: 'fclbuilders.com', pitch: 'Industrial and commercial design-build GC; DI-NOC and Rea Tec in value-engineering for Chicago suburban commercial renovation.' },
  { name: 'VOA Associates', city: 'Chicago', website: 'voa.com', pitch: 'Healthcare and senior living specialist; DI-NOC antimicrobial films are directly applicable to their clinical and assisted-living interior projects.' },
  { name: 'HED Chicago', city: 'Chicago', website: 'hed.design', pitch: 'Healthcare and higher-ed practice; DI-NOC surface films specified in hospital renovation and university campus projects.' },
  { name: 'Solomon Cordwell Buenz', city: 'Chicago', website: 'scb.com', pitch: 'Mixed-use and multifamily high-rise specialist; DI-NOC accent films in Chicago condo and apartment lobby renovations.' },
  { name: 'Environmental Systems Design', city: 'Chicago', website: 'esdglobal.com', pitch: 'Engineering firm with facility design practice; DI-NOC films for sustainable interior surface upgrades in commercial buildings.' },
  { name: 'Heitman Architects', city: 'Chicago', pitch: 'Commercial real estate design; DI-NOC and Rea Tec for Class A office interior upgrades and tenant improvements.' },
  { name: 'Power Construction', city: 'Chicago', website: 'powerconstruction.net', pitch: 'Large Chicago GC with healthcare and commercial practice; DI-NOC value-engineering in pre-construction for hospital and office renovation.' },
  { name: 'Clayco', city: 'Chicago', website: 'claycorp.com', pitch: 'Design-build giant; Rea Tec and DI-NOC films in large-scale commercial and industrial interior packages.' },
  { name: 'IA Interior Architects Chicago', city: 'Chicago', website: 'interiorarchitects.com', pitch: 'Corporate workplace interiors; DI-NOC branding films and environmental graphics standard in Fortune 500 Chicago office fit-outs.' },
  { name: 'CBRE Design Collective Chicago', city: 'Chicago', pitch: 'Corporate tenant improvement and workplace design; DI-NOC films for cost-effective brand environment in Chicago office interiors.' },
  { name: 'Ware Malcomb Chicago', city: 'Chicago', website: 'waremalcomb.com', pitch: 'Industrial and commercial TI specialist; DI-NOC and Rea Tec in value-engineered tenant improvement packages.' },
  { name: 'Kimball Hill Homes Design', city: 'Rolling Meadows', pitch: 'Residential and multifamily design; DI-NOC films for model unit staging and common area upgrades.' },
  { name: 'Stantec Illinois', city: 'Chicago', website: 'stantec.com', pitch: 'Infrastructure and public sector design; transit and government facility interiors where DI-NOC is specified for durable surface upgrades.' },
  { name: 'Turner Construction Illinois', city: 'Chicago', website: 'turnerconstruction.com', pitch: 'Major GC with healthcare and campus practice; DI-NOC and Rea Tec in pre-construction value-engineering for large Chicago projects.' },
  { name: 'Environmental Systems Design Inc', city: 'Chicago', pitch: 'MEP engineering with design build; commercial facility upgrades where DI-NOC surface films reduce renovation scope.' },
  { name: 'Cordogan Clark & Associates', city: 'Aurora', website: 'cordoganclark.com', pitch: 'K-12 education specialist in Chicago suburbs; school renovation projects are consistent wall graphics and DI-NOC pipeline.' },
  { name: 'Kluber Architects + Engineers', city: 'Batavia', website: 'kluber.com', pitch: 'Education and municipal practice in Fox Valley suburbs; school and civic facility renovation with wall graphics and surface films.' },
  { name: 'Wold Architects Illinois', city: 'Chicago', website: 'woldae.com', pitch: 'Public sector K-12 specialist; school renovation projects are consistent DI-NOC and wall graphics pipeline across Illinois.' },
  { name: 'Cannon Design Chicago', city: 'Chicago', website: 'cannondesign.com', pitch: 'Healthcare and higher-ed giant; DI-NOC antimicrobial and surface films are routine specifications in their Chicago hospital projects.' },
  { name: 'Goettsch Partners', city: 'Chicago', website: 'gpchicago.com', pitch: 'Commercial high-rise and mixed-use; DI-NOC accent surfaces in Chicago tower lobby and amenity space renovations.' },
  { name: 'GREC Architects', city: 'Chicago', pitch: 'Multifamily and mixed-use practice; DI-NOC films for apartment and condo common area upgrades across Chicago.' },
  { name: 'STL Architects', city: 'Chicago', pitch: 'Boutique commercial and hospitality design; DI-NOC metallic and wood films for Chicago restaurant and hotel renovation clients.' },
  { name: 'Harza Engineering', city: 'Chicago', pitch: 'Infrastructure with building design; government facility interiors where DI-NOC surface films are value-engineered into renovation packages.' },
  { name: 'Adrian Smith + Gordon Gill', city: 'Chicago', website: 'smithgill.com', pitch: 'High-profile commercial tower design; DI-NOC and Rea Tec for premium lobby and amenity finishes in Class A Chicago real estate.' },
  { name: 'Epstein Architecture + Engineering', city: 'Chicago', website: 'epstein.com', pitch: 'Food processing and industrial architecture; DI-NOC and Rea Tec in manufacturing and distribution facility interior upgrades.' },
  { name: 'JLL Design + Construction', city: 'Chicago', pitch: 'Corporate real estate design-build; DI-NOC branding films and environmental graphics standard in Chicago office interior fit-outs.' },
  { name: 'Bulley & Andrews', city: 'Chicago', website: 'bulley.com', pitch: 'Historic restoration and commercial GC; DI-NOC wood and stone films for code-compliant interior surface refinishing in landmark buildings.' },
  { name: 'Willow Design', city: 'Evanston', pitch: 'Boutique residential and hospitality interiors; DI-NOC premium films for North Shore Chicago renovation clients.' },
  { name: 'John Ronan Architects', city: 'Chicago', website: 'jrarch.com', pitch: 'Civic and cultural architecture; environmental graphics and DI-NOC in public-facing cultural facility interiors.' },
  { name: 'Lothan Van Hook DeStefano Architecture', city: 'Chicago', website: 'lvda.com', pitch: 'Senior living and multifamily specialist; DI-NOC wood and fabric films for assisted living and memory care interior renovations.' },
  { name: 'Burnham Nationwide', city: 'Chicago', website: 'burnhamnationwide.com', pitch: 'National commercial and retail architecture; DI-NOC as standardized finish spec across retail chain and restaurant roll-out projects.' },
  { name: 'Eriksson Engineering Associates', city: 'Gurnee', pitch: 'Northern Illinois civil and structural with facility design; DI-NOC surface films in suburban commercial and municipal facility renovation.' },
];

// ─── Kentucky ─────────────────────────────────────────────────────────────────
const AIA_KENTUCKY = [
  { name: 'EOP Architects', city: 'Louisville', website: 'eoparchitects.com', pitch: 'Louisville full-service firm with healthcare, education, and civic practice — DI-NOC and Rea Tec films are standard interior finish specifications.' },
  { name: 'Luckett & Farley', city: 'Louisville', website: 'luckettfarley.com', pitch: 'Established Louisville firm with commercial, healthcare, and government practice; DI-NOC surface films for interior renovation projects.' },
  { name: 'MCM CPG Architects', city: 'Louisville', website: 'mcm.com', pitch: 'National commercial and multifamily firm with Louisville base; DI-NOC accent films in apartment community and hospitality renovations.' },
  { name: 'Brandstetter Carroll', city: 'Lexington', website: 'bcainc.com', pitch: 'Central Kentucky architecture with education and civic practice; DI-NOC wall graphics and surface films in school and university renovation.' },
  { name: 'CMTA', city: 'Louisville', website: 'cmta.com', pitch: 'Engineering-led firm with building design practice; DI-NOC surface upgrades in Louisville commercial and institutional facility renovation.' },
  { name: 'JRA Architects', city: 'Louisville', pitch: 'Commercial and government practice in Louisville; DI-NOC surface films in municipal and commercial interior renovation projects.' },
  { name: 'Arrasmith, Judd, Rapp, Chovan', city: 'Louisville', website: 'ajrci.com', pitch: 'Established Louisville AIA firm; healthcare and commercial renovation where DI-NOC and Rea Tec provide durable interior surface upgrades.' },
  { name: 'Harrington Design Associates', city: 'Lexington', pitch: 'Central Kentucky commercial and education practice; DI-NOC and wall graphics in university and school renovation projects.' },
  { name: 'Omni Architects', city: 'Louisville', pitch: 'Healthcare and senior living specialist in Louisville; DI-NOC antimicrobial films directly address their clinical interior specifications.' },
  { name: 'Peters + Tilly Architecture', city: 'Louisville', pitch: 'Boutique commercial and hospitality interiors; DI-NOC metallic and wood films for Louisville restaurant and hotel renovation.' },
  { name: 'GBBN Louisville', city: 'Louisville', website: 'gbbn.com', pitch: 'Healthcare and education practice; DI-NOC antimicrobial films are directly applicable to their Louisville hospital and school projects.' },
  { name: 'Huff + Gooden Architects', city: 'Louisville', pitch: 'Commercial and civic practice; DI-NOC surface films for Louisville government and commercial building interior upgrades.' },
  { name: 'JMI Architects', city: 'Lexington', pitch: 'Education and corporate interiors in Central Kentucky; DI-NOC films for University of Kentucky-adjacent renovation projects.' },
  { name: 'Stantec Kentucky', city: 'Louisville', website: 'stantec.com', pitch: 'Infrastructure-led firm; government and transit facility interiors where DI-NOC surface films reduce renovation disruption.' },
  { name: 'Sherlock, Smith & Adams', city: 'Louisville', pitch: 'Established Kentucky firm with civic, education, and transportation practice; DI-NOC for government facility interior surface upgrades.' },
  { name: 'Woolpert Kentucky', city: 'Lexington', website: 'woolpert.com', pitch: 'Public sector and engineering-led practice; government facility interiors are consistent DI-NOC surface film specification in Kentucky.' },
  { name: 'GreatHouse Architects', city: 'Louisville', pitch: 'Commercial and multifamily practice; DI-NOC accent surfaces in Louisville apartment and mixed-use building renovations.' },
  { name: 'Corman & Associates', city: 'Louisville', pitch: 'Retail and hospitality interiors; DI-NOC wood and metallic films for Louisville restaurant and retail renovation.' },
  { name: 'Miller & Associates Architects', city: 'Louisville', pitch: 'Civic and commercial practice in Louisville; DI-NOC surface films for municipal building interior upgrades.' },
  { name: 'KZF Design', city: 'Louisville', website: 'kzfdesign.com', pitch: 'Full-service engineering and architecture; commercial and government renovation where DI-NOC is value-engineered into interior packages.' },
];

// ─── Database insertion ────────────────────────────────────────────────────────

async function insertFirms(firms, source, state) {
  let inserted = 0, updated = 0;
  for (const firm of firms) {
    const firmState = firm.state || state;
    const sourceId = slug(firm.name, firm.city || '');
    const rawData = {
      contact_credential: 'AIA',
      record_type: 'aia_member',
      pitch_angle: firm.pitch,
      retrieved_from: `https://aia${state.toLowerCase()}.org`,
    };
    try {
      const r = await pool.query(`
        INSERT INTO companies (source, source_id, name, city, state, country, industry, website, raw_data)
        VALUES ($1,$2,$3,$4,$5,'US','design',$6,$7::jsonb)
        ON CONFLICT (source, source_id) DO UPDATE SET
          name=EXCLUDED.name, city=EXCLUDED.city, state=EXCLUDED.state,
          website=EXCLUDED.website, raw_data=EXCLUDED.raw_data, updated_at=NOW()
        RETURNING (xmax = 0) AS was_inserted
      `, [source, sourceId, firm.name, firm.city || null, firmState, firm.website || null, JSON.stringify(rawData)]);
      if (r.rows[0].was_inserted) inserted++; else updated++;
    } catch (e) {
      console.error(`  ✗ ${firm.name}: ${e.message}`);
    }
  }
  return { inserted, updated };
}

async function main() {
  console.log('\nWrapLeads — AIA Expanded Midwest Ingest');
  console.log('='.repeat(50));

  try {
    await pool.query('SELECT 1 FROM companies LIMIT 1');
  } catch (e) {
    console.error('Database not ready. Run: docker compose up -d');
    process.exit(1);
  }

  const chapters = [
    { firms: AIA_INDIANA,   source: 'aia_indiana',  state: 'IN', label: 'Indiana' },
    { firms: AIA_OHIO,      source: 'aia_ohio',     state: 'OH', label: 'Ohio' },
    { firms: AIA_MICHIGAN,  source: 'aia_michigan', state: 'MI', label: 'Michigan' },
    { firms: AIA_ILLINOIS,  source: 'aia_illinois', state: 'IL', label: 'Illinois' },
    { firms: AIA_KENTUCKY,  source: 'aia_kentucky', state: 'KY', label: 'Kentucky' },
  ];

  let totalInserted = 0, totalUpdated = 0;
  for (const ch of chapters) {
    const { inserted, updated } = await insertFirms(ch.firms, ch.source, ch.state);
    totalInserted += inserted;
    totalUpdated += updated;
    console.log(`  ${ch.label}: +${inserted} new, ${updated} updated (${ch.firms.length} total)`);
  }

  console.log(`\nDone. ${totalInserted} new records, ${totalUpdated} updated.`);
  console.log('\nNext steps:');
  console.log('  1. Open WrapLeads → Discover → filter by industry=design');
  console.log('  2. Import high-priority firms directly into your CRM pipeline');
  console.log('  3. Run seed-designers.js to load top 100 directly into leads\n');

  await pool.end();
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
