#!/usr/bin/env node
/**
 * seed-schools.js — Seeds Indiana school districts, AIA interior designers,
 * and municipal/county fleet leads into WrapLeads for all registered users.
 *
 * Run: node seed-schools.js
 * Safe to re-run (uses ON CONFLICT DO NOTHING via client_id).
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Indiana School Corporations (bus fleet leads) ──────────────────────────
// Source: Indiana DOE school corporation directory + IDOE transportation data
const SCHOOL_LEADS = [
  { id: 'sch-001', company: 'MSD of Wayne Township', city: 'Indianapolis', state: 'IN', fleetSize: '120', contactTitle: 'Transportation Director', pitchAngle: 'One of Indy\'s largest districts — 120+ buses for standardized fleet wrap reinforces brand and improves student safety visibility.' },
  { id: 'sch-002', company: 'Indianapolis Public Schools', city: 'Indianapolis', state: 'IN', fleetSize: '350', contactTitle: 'Fleet Manager', pitchAngle: 'IPS operates 350+ buses — district-wide wrap refresh with route info + safety graphics is a multi-year revenue opportunity.' },
  { id: 'sch-003', company: 'MSD of Lawrence Township', city: 'Indianapolis', state: 'IN', fleetSize: '95', contactTitle: 'Transportation Director', pitchAngle: 'Growing northeast Indy district — branded bus wraps with school colors drive community pride and sponsor-board potential.' },
  { id: 'sch-004', company: 'MSD of Pike Township', city: 'Indianapolis', state: 'IN', fleetSize: '85', contactTitle: 'Transportation Supervisor', pitchAngle: 'Diverse district with strong community identity — safety stripes + school graphics on buses are highly visible daily.' },
  { id: 'sch-005', company: 'MSD of Washington Township', city: 'Indianapolis', state: 'IN', fleetSize: '70', contactTitle: 'Operations Director', pitchAngle: 'North Indy district; buses double as moving billboards for the community school brand.' },
  { id: 'sch-006', company: 'Hamilton Southeastern Schools', city: 'Fishers', state: 'IN', fleetSize: '140', contactTitle: 'Transportation Director', pitchAngle: 'One of Indiana\'s fastest-growing districts — consistently buying new buses; fleet wrap program ties new additions to a unified look.' },
  { id: 'sch-007', company: 'Carmel Clay Schools', city: 'Carmel', state: 'IN', fleetSize: '110', contactTitle: 'Director of Operations', pitchAngle: 'High-budget district; premium wrap materials (3M) match the Carmel brand standards — color-change and graphics package.' },
  { id: 'sch-008', company: 'Noblesville Schools', city: 'Noblesville', state: 'IN', fleetSize: '90', contactTitle: 'Transportation Supervisor', pitchAngle: 'Rapidly growing Hamilton County — new bus purchases annually; establish as preferred wrap vendor for long-term contract.' },
  { id: 'sch-009', company: 'Westfield Washington Schools', city: 'Westfield', state: 'IN', fleetSize: '60', contactTitle: 'Transportation Director', pitchAngle: 'Fast-growing Westfield; strong school pride culture makes bus wraps an easy sell to parents and administration.' },
  { id: 'sch-010', company: 'Zionsville Community Schools', city: 'Zionsville', state: 'IN', fleetSize: '55', contactTitle: 'Director of Operations', pitchAngle: 'Affluent northwest suburban district — quality over cost; DI-NOC on interior fleet + full exterior bus wrap package.' },
  { id: 'sch-011', company: 'Avon Community School Corporation', city: 'Avon', state: 'IN', fleetSize: '100', contactTitle: 'Transportation Director', pitchAngle: 'West Indy suburb with strong athletics identity — bus wraps with varsity graphics serve dual community marketing role.' },
  { id: 'sch-012', company: 'Brownsburg Community School Corporation', city: 'Brownsburg', state: 'IN', fleetSize: '85', contactTitle: 'Fleet Manager', pitchAngle: 'Rapidly growing district; consistent new-bus additions make a fleet wrap program easy to maintain year over year.' },
  { id: 'sch-013', company: 'Plainfield Community School Corporation', city: 'Plainfield', state: 'IN', fleetSize: '65', contactTitle: 'Transportation Supervisor', pitchAngle: 'Hendricks County growth corridor — safety visibility + school branding on buses appeals to safety-conscious board.' },
  { id: 'sch-014', company: 'Greenwood Community School Corporation', city: 'Greenwood', state: 'IN', fleetSize: '50', contactTitle: 'Director of Operations', pitchAngle: 'South Indy suburban district; safety stripes and route numbering graphics improve visibility and bus ID.' },
  { id: 'sch-015', company: 'Center Grove Community School Corporation', city: 'Greenwood', state: 'IN', fleetSize: '80', contactTitle: 'Transportation Director', pitchAngle: 'Top-rated Johnson County district — high parent engagement = high visibility ROI for branded bus wraps.' },
  { id: 'sch-016', company: 'Fort Wayne Community Schools', city: 'Fort Wayne', state: 'IN', fleetSize: '220', contactTitle: 'Transportation Director', pitchAngle: 'Indiana\'s second largest district; district-wide bus wrap standardization is a large contract opportunity.' },
  { id: 'sch-017', company: 'Northwest Allen County Schools', city: 'Fort Wayne', state: 'IN', fleetSize: '90', contactTitle: 'Fleet Manager', pitchAngle: 'Growing Fort Wayne suburb — annual bus purchases; long-term preferred vendor agreement for consistent fleet look.' },
  { id: 'sch-018', company: 'Southwest Allen County Schools', city: 'Fort Wayne', state: 'IN', fleetSize: '70', contactTitle: 'Transportation Supervisor', pitchAngle: 'South Fort Wayne growth area; safety + branding wrap package is straightforward pitch to transportation committee.' },
  { id: 'sch-019', company: 'East Allen County Schools', city: 'New Haven', state: 'IN', fleetSize: '75', contactTitle: 'Director of Operations', pitchAngle: 'East Allen district serving rural + suburban routes; high-visibility safety wraps reduce liability exposure.' },
  { id: 'sch-020', company: 'Evansville Vanderburgh School Corporation', city: 'Evansville', state: 'IN', fleetSize: '180', contactTitle: 'Transportation Director', pitchAngle: 'Southwest Indiana\'s largest district; bus fleet wrap refresh with safety colors + school branding serves 180+ vehicles.' },
  { id: 'sch-021', company: 'South Bend Community School Corporation', city: 'South Bend', state: 'IN', fleetSize: '160', contactTitle: 'Fleet Manager', pitchAngle: 'Major northern Indiana district with diverse routes; branded fleet wraps with Notre Dame-adjacent community identity.' },
  { id: 'sch-022', company: 'Penn-Harris-Madison School Corporation', city: 'Mishawaka', state: 'IN', fleetSize: '110', contactTitle: 'Transportation Director', pitchAngle: 'Growing St. Joseph County district; high parent involvement = community buy-in for bus wrap program.' },
  { id: 'sch-023', company: 'Lafayette School Corporation', city: 'Lafayette', state: 'IN', fleetSize: '80', contactTitle: 'Transportation Supervisor', pitchAngle: 'Tippecanoe County seat; university town culture values visual quality — premium bus wraps reinforce community brand.' },
  { id: 'sch-024', company: 'Tippecanoe School Corporation', city: 'Lafayette', state: 'IN', fleetSize: '95', contactTitle: 'Director of Operations', pitchAngle: 'Suburban Lafayette; consistent fleet growth makes annual wrap refresh contracts achievable.' },
  { id: 'sch-025', company: 'Muncie Community Schools', city: 'Muncie', state: 'IN', fleetSize: '70', contactTitle: 'Transportation Director', pitchAngle: 'Ball State university town; revitalization focus makes school pride branding a community priority.' },
  { id: 'sch-026', company: 'Anderson Community School Corporation', city: 'Anderson', state: 'IN', fleetSize: '85', contactTitle: 'Fleet Manager', pitchAngle: 'Madison County seat — cost-effective safety wrap package with reflective materials reduces after-dark risk.' },
  { id: 'sch-027', company: 'Vigo County School Corporation', city: 'Terre Haute', state: 'IN', fleetSize: '120', contactTitle: 'Transportation Director', pitchAngle: 'West Indiana\'s largest district; Terre Haute serves diverse geography — high-visibility safety graphics priority.' },
  { id: 'sch-028', company: 'Bartholomew Consolidated School Corporation', city: 'Columbus', state: 'IN', fleetSize: '95', contactTitle: 'Director of Operations', pitchAngle: 'Cummins HQ town with design-forward culture — Columbus expects quality; premium bus wrap reflects community standards.' },
  { id: 'sch-029', company: 'Elkhart Community Schools', city: 'Elkhart', state: 'IN', fleetSize: '130', contactTitle: 'Transportation Supervisor', pitchAngle: 'North Indiana RV capital — fleet wrap expertise in vehicle graphics is directly relevant to this transportation-heavy community.' },
  { id: 'sch-030', company: 'Goshen Community Schools', city: 'Goshen', state: 'IN', fleetSize: '70', contactTitle: 'Transportation Director', pitchAngle: 'Elk hart County community; established bus fleet with aging graphics — refresh wrap program is well-timed.' },
];

// ─── AIA Indiana Interior Designers (DI-NOC / Rea Tec leads) ────────────────
const AIA_LEADS = [
  { id: 'aia-ext-001', company: 'Browning Day', city: 'Indianapolis', state: 'IN', contactTitle: 'Principal / Director of Interior Design', website: 'browningday.com', pitchAngle: 'Large multidisciplinary firm with active healthcare, civic, and higher-ed practice — DI-NOC wood/stone films on interior surfaces are specified repeatedly across their project types.' },
  { id: 'aia-ext-002', company: 'Schmidt Associates', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Lead', website: 'schmidtassociates.com', pitchAngle: 'Healthcare + education focus; DI-NOC antimicrobial films and Rea Tec surface films are directly applicable to their core market verticals.' },
  { id: 'aia-ext-003', company: 'Ratio Design', city: 'Indianapolis', state: 'IN', contactTitle: 'Principal, Business Development', email: 'tsteinhardt@ratioarchitects.com', phone: '317-633-4040', website: 'ratiodesign.com', pitchAngle: 'Constant adaptive-reuse and historic-preservation work where DI-NOC wood/stone films enable code-compliant refinishing of existing surfaces.' },
  { id: 'aia-ext-004', company: 'Wiss Janney Elstner Associates', city: 'Indianapolis', state: 'IN', contactTitle: 'Senior Associate / Interior Finishes', pitchAngle: 'Forensic + restoration engineering firm — DI-NOC surface films as cost-effective alternative to full material replacement on interior surfaces.' },
  { id: 'aia-ext-005', company: 'RQAW Corporation', city: 'Indianapolis', state: 'IN', contactTitle: 'Director of Interior Design', website: 'rqaw.com', pitchAngle: 'Municipal, justice, and public safety facilities — wall graphics and DI-NOC wayfinding applications are standard across their project types.' },
  { id: 'aia-ext-006', company: 'CSO Architects', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Principal', website: 'csoarchitects.com', pitchAngle: 'Mixed-use, multifamily, and hospitality practice — DI-NOC accent surfaces in lobbies and amenity areas are high-ROI per square foot.' },
  { id: 'aia-ext-007', company: 'Shiel Sexton', city: 'Indianapolis', state: 'IN', contactTitle: 'Facilities / Interior Finishes', website: 'shielsexton.com', pitchAngle: 'Large GC with in-house design capability — Rea Tec and DI-NOC films are value-engineering alternatives when owner budgets are squeezed.' },
  { id: 'aia-ext-008', company: 'Fanning Howey', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Lead', website: 'fanninghowey.com', pitchAngle: 'K-12 and higher-ed specialist; school cafeteria and corridor wall graphics + DI-NOC are durable, low-maintenance, and visually impactful.' },
  { id: 'aia-ext-009', company: 'MSA Design', city: 'Indianapolis', state: 'IN', contactTitle: 'Senior Interior Designer', website: 'msadesign.com', pitchAngle: 'Multidisciplinary firm with strong hospitality and retail practice — wall graphics, DI-NOC wood panels, and branded environments.' },
  { id: 'aia-ext-010', company: 'Cripe Architects + Engineers', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Director', website: 'cripe.biz', pitchAngle: 'Broad commercial practice; Rea Tec + DI-NOC used as cost-effective surface upgrades in tenant improvement and renovation projects.' },
  { id: 'aia-ext-011', company: 'American Structurepoint', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Lead', website: 'structurepoint.com', pitchAngle: 'Large engineering firm with interior design studio — transportation, civic, and commercial projects with wall graphic and surface film specs.' },
  { id: 'aia-ext-012', company: 'KJWW Engineering / Woolpert', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Finishes Coordinator', pitchAngle: 'Government and defense facility specialist — durable DI-NOC surface films for interior upgrades without full renovation disruption.' },
  { id: 'aia-ext-013', company: 'Mortar', city: 'Indianapolis', state: 'IN', contactTitle: 'Creative Director / Brand Environments', website: 'mortar.com', pitchAngle: 'Brand experience agency — environmental graphics, wall wraps, and dimensional signage are core to their client work.' },
  { id: 'aia-ext-014', company: 'Rowland Design', city: 'Indianapolis', state: 'IN', contactTitle: 'Principal', website: 'rowlanddesign.com', pitchAngle: 'Hospitality and commercial interiors + environmental graphics — opportunity as wide-format install partner for brand-environment projects.' },
  { id: 'aia-ext-015', company: 'Parallel Design Group', city: 'Indianapolis', state: 'IN', contactTitle: 'Principal Designer', website: 'paralleldg.com', pitchAngle: 'Multifamily lobbies and amenity spaces are heavy DI-NOC users — durability + design flexibility for high-traffic surfaces.' },
  { id: 'aia-ext-016', company: 'KTGY Architecture + Planning', city: 'Indianapolis', state: 'IN', contactTitle: 'Senior Interior Designer', website: 'ktgy.com', pitchAngle: 'Multifamily and mixed-use specialist with national portfolio — standardized DI-NOC finish specs across Indianapolis projects.' },
  { id: 'aia-ext-017', company: 'Rundell Ernstberger Associates', city: 'Indianapolis', state: 'IN', contactTitle: 'Principal / Project Lead', website: 'rea-inc.com', pitchAngle: 'Landscape architecture + planning firm with public space focus; environmental graphics and wayfinding wraps on public infrastructure.' },
  { id: 'aia-ext-018', company: 'Synthesis Inc.', city: 'Indianapolis', state: 'IN', contactTitle: 'Interior Design Director', website: 'synthesisarch.com', pitchAngle: 'Corporate interiors and tenant improvement specialist — DI-NOC is a frequent value-engineering substitute for millwork in Class A offices.' },
  { id: 'aia-ext-019', company: 'Architects Group Ltd', city: 'Fort Wayne', state: 'IN', contactTitle: 'Principal / Interior Design', pitchAngle: 'Northeast Indiana multi-service firm; school and civic projects are high-use of wall graphics and durable surface films.' },
  { id: 'aia-ext-020', company: 'Design Collaborative', city: 'Fort Wayne', state: 'IN', contactTitle: 'Senior Interior Designer', website: 'designcollaborative.com', pitchAngle: 'Healthcare and education focus in Fort Wayne; DI-NOC antimicrobial and textured films directly address their clients\' surface durability needs.' },
  { id: 'aia-ext-021', company: 'Ohlmann Cullen Architects', city: 'South Bend', state: 'IN', contactTitle: 'Interior Design Lead', pitchAngle: 'Notre Dame–area firm with civic, education, and hospitality practice — wall graphics and environmental branding are frequent scope items.' },
  { id: 'aia-ext-022', company: 'Troyer Group', city: 'Mishawaka', state: 'IN', contactTitle: 'Director of Interior Architecture', website: 'troyergroup.com', pitchAngle: 'Northern Indiana firm; healthcare and education specialize in long-lifecycle finishes — DI-NOC is ideal cost/durability balance.' },
  { id: 'aia-ext-023', company: 'Evergreen Real Estate Group', city: 'Chicago', state: 'IL', contactTitle: 'Director of Interior Design', website: 'evergreenreg.com', pitchAngle: 'Multifamily developer with strong Midwest footprint — DI-NOC accent walls and lobby graphics are standard across their communities.' },
  { id: 'aia-ext-024', company: 'Antunovich Associates', city: 'Chicago', state: 'IL', contactTitle: 'Interior Design Principal', website: 'antunovich.com', pitchAngle: 'Hospitality + adaptive reuse firm; DI-NOC wood/metal films enable budget-friendly heritage aesthetic in historic buildings.' },
  { id: 'aia-ext-025', company: 'INFORM Studio', city: 'Northville', state: 'MI', contactTitle: 'Director of Interior Design', phone: '248-449-3564', website: 'in-formstudio.com', pitchAngle: 'Mixed-use, retail, hospitality, learning environments — multidisciplinary WBE firm specifies finishes across large public-realm projects.' },
];

// ─── Municipal / County Fleet Leads ─────────────────────────────────────────
const MUNICIPAL_LEADS = [
  { id: 'mun-001', company: 'City of Indianapolis DPW Fleet', city: 'Indianapolis', state: 'IN', fleetSize: '800+', contactTitle: 'Fleet Manager', pitchAngle: 'Indianapolis operates 800+ city vehicles — standardized fleet wrap with city branding + department ID is a major contract opportunity. Annual procurement cycles.' },
  { id: 'mun-002', company: 'Marion County Sheriff Fleet', city: 'Indianapolis', state: 'IN', fleetSize: '200', contactTitle: 'Fleet Coordinator', pitchAngle: 'Law enforcement + transport vehicles; color-change wraps and graphics packages for vehicle rebranding cycles.' },
  { id: 'mun-003', company: 'Hamilton County Highway Dept', city: 'Noblesville', state: 'IN', fleetSize: '120', contactTitle: 'Fleet Supervisor', pitchAngle: 'Fast-growing county fleet; highway and maintenance vehicles benefit from high-visibility safety wraps and department graphics.' },
  { id: 'mun-004', company: 'City of Fort Wayne Fleet Services', city: 'Fort Wayne', state: 'IN', fleetSize: '300', contactTitle: 'Fleet Manager', pitchAngle: 'Fort Wayne city fleet includes utility, public works, and transit vehicles — city branding refresh is a multi-department contract.' },
  { id: 'mun-005', company: 'Allen County Highway Dept', city: 'Fort Wayne', state: 'IN', fleetSize: '150', contactTitle: 'Operations Manager', pitchAngle: 'County maintenance fleet; reflective safety graphics + department branding on trucks and equipment is standard county procurement.' },
  { id: 'mun-006', company: 'IndyGo (Indianapolis Public Transit)', city: 'Indianapolis', state: 'IN', fleetSize: '180', contactTitle: 'Director of Bus Operations', website: 'indygo.net', pitchAngle: 'IndyGo operates 180 buses across city routes; full-wrap advertising panels and route-brand graphics are ongoing revenue opportunities.' },
  { id: 'mun-007', company: 'City of Carmel Street Dept', city: 'Carmel', state: 'IN', fleetSize: '85', contactTitle: 'Fleet Coordinator', pitchAngle: 'One of Indiana\'s highest-income cities — premium graphics expectations; city vehicles reflect Carmel\'s design-forward brand.' },
  { id: 'mun-008', company: 'Johnson County Highway Dept', city: 'Franklin', state: 'IN', fleetSize: '95', contactTitle: 'Highway Superintendent', pitchAngle: 'South Indy suburb growing rapidly; county fleet expands annually — vendor of record for vehicle graphics is achievable.' },
  { id: 'mun-009', company: 'Hendricks County Fleet', city: 'Danville', state: 'IN', fleetSize: '80', contactTitle: 'Fleet Manager', pitchAngle: 'West of Indy growth corridor; county departments share fleet management — single vendor for all department graphics.' },
  { id: 'mun-010', company: 'City of Evansville Fleet Mgmt', city: 'Evansville', state: 'IN', fleetSize: '250', contactTitle: 'Fleet Services Director', pitchAngle: 'Southwest Indiana\'s largest city fleet; multi-department vehicle graphics contract with public works, utilities, and parks.' },
  { id: 'mun-011', company: 'Vectren / CenterPoint Energy Indiana', city: 'Evansville', state: 'IN', fleetSize: '400', contactTitle: 'Fleet Manager', website: 'centerpointenergy.com', pitchAngle: 'Utility company with 400+ service vehicles across Indiana — uniform fleet wrap refresh aligns with parent company rebrand.' },
  { id: 'mun-012', company: 'NIPSCO (NiSource)', city: 'Merrillville', state: 'IN', fleetSize: '500', contactTitle: 'Fleet Operations Manager', website: 'nipsco.com', pitchAngle: 'Northern Indiana utility with 500+ field vehicles; ongoing rebrand and fleet standardization creates multi-year wrap contract.' },
];

async function seedLeads(userId, userEmail) {
  let inserted = 0;
  let skipped = 0;

  const allLeads = [
    ...SCHOOL_LEADS.map(l => ({ ...l, category: 'fleet' })),
    ...AIA_LEADS.map(l => ({ ...l, category: 'dinoc' })),
    ...MUNICIPAL_LEADS.map(l => ({ ...l, category: 'fleet' })),
  ];

  for (const lead of allLeads) {
    try {
      const r = await pool.query(`
        INSERT INTO leads (
          user_id, client_id, company, category, state, city,
          contact_name, contact_title, email, phone, website,
          fleet_size, pitch_angle, status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'cold',NOW(),NOW())
        ON CONFLICT (user_id, client_id) DO NOTHING
      `, [
        String(userId),
        lead.id,
        lead.company,
        lead.category,
        lead.state,
        lead.city || null,
        lead.contactName || null,
        lead.contactTitle || null,
        lead.email || null,
        lead.phone || null,
        lead.website || null,
        lead.fleetSize || null,
        lead.pitchAngle || null,
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
  console.log('\nWrapLeads — School / AIA / Municipal Lead Seeder');
  console.log('='.repeat(50));

  const { rows: users } = await pool.query('SELECT id, email FROM users ORDER BY id');
  if (!users.length) {
    console.log('No users found. Register an account first, then re-run.');
    process.exit(0);
  }

  const total = SCHOOL_LEADS.length + AIA_LEADS.length + MUNICIPAL_LEADS.length;
  console.log(`\nSeeding ${total} leads across ${users.length} user(s):`);
  console.log(`  · ${SCHOOL_LEADS.length} Indiana school district bus fleets`);
  console.log(`  · ${AIA_LEADS.length} AIA interior design firms (DI-NOC)`);
  console.log(`  · ${MUNICIPAL_LEADS.length} municipal / utility fleets`);
  console.log('');

  for (const user of users) {
    await seedLeads(user.id, user.email);
  }

  console.log('\nDone.\n');
  await pool.end();
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { LEADS: [...SCHOOL_LEADS, ...AIA_LEADS, ...MUNICIPAL_LEADS] };
