/**
 * WrapLeads — Commercial Solar Scout Seed
 * ----------------------------------------
 * Curated list of commercial properties primed for rooftop / ground-mount
 * solar. These power the Commercial Solar Scout module on new accounts so
 * the Discover view and solar-score sort look real on day one.
 *
 * Profile: warehouses, distribution centers, manufacturing facilities, cold
 * storage, and self-storage portfolios with high daytime electrical load
 * and flat / metal / membrane roofs that suit panel mounts.
 *
 * Revenue profile (broker commission per closed installer referral):
 *   - Small commercial (<100kW):     $1,500 –  $4,000
 *   - Mid commercial (100kW–500kW):  $5,000 – $12,000
 *   - Large commercial (>500kW):    $15,000 – $40,000
 *
 * Module: CommonJS — exported as `LEADS` and consumed by `lib/autoSeed.js`.
 */

const SOLAR_LEADS = [
  // ── Arizona — Phoenix metro ──────────────────────────────────────────────
  {
    clientId: 'solar-001',
    company: 'Phoenix Distribution Hub',
    category: 'commercial_solar',
    city: 'Phoenix', state: 'AZ',
    contactTitle: 'Director of Facilities',
    website: null,
    pitchAngle: '180,000 sqft flat-roof distribution center — APS commercial rate, 12-month payback under TIME-OF-USE shift.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-002',
    company: 'Sunbelt Cold Storage',
    category: 'commercial_solar',
    city: 'Tolleson', state: 'AZ',
    contactTitle: 'Plant Manager',
    pitchAngle: '24/7 refrigeration load + 220,000 sqft membrane roof — ideal for 1.2MW system with battery storage.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-003',
    company: 'Desert Metalworks Manufacturing',
    category: 'commercial_solar',
    city: 'Chandler', state: 'AZ',
    contactTitle: 'VP of Operations',
    pitchAngle: '95,000 sqft metal-roof manufacturing — heavy daytime kWh draw on SRP commercial.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-004',
    company: 'Cactus Self Storage Portfolio',
    category: 'commercial_solar',
    city: 'Mesa', state: 'AZ',
    contactTitle: 'Property Manager',
    pitchAngle: '5-facility portfolio, ~40,000 sqft each — community solar credit eligible, low maintenance.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-005',
    company: 'Valley Data Center West',
    category: 'commercial_solar',
    city: 'Goodyear', state: 'AZ',
    contactTitle: 'Sustainability Director',
    pitchAngle: '24/7 server load + ESG reporting pressure — colocation customers demanding green PPA.',
    source: 'auto_seed',
  },

  // ── Texas — Houston / Dallas ─────────────────────────────────────────────
  {
    clientId: 'solar-006',
    company: 'Bayou Logistics Center',
    category: 'commercial_solar',
    city: 'Houston', state: 'TX',
    contactTitle: 'Director of Facilities',
    pitchAngle: '310,000 sqft flat TPO roof — Centerpoint commercial rate + Texas grid spikes = strong ROI.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-007',
    company: 'Lone Star Beverage Distribution',
    category: 'commercial_solar',
    city: 'Dallas', state: 'TX',
    contactTitle: 'COO',
    pitchAngle: '180,000 sqft refrigerated warehouse — TXU commercial, peak-shaving opportunity.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-008',
    company: 'Permian Industrial Park East',
    category: 'commercial_solar',
    city: 'Midland', state: 'TX',
    contactTitle: 'Property Manager',
    pitchAngle: '6-tenant industrial park, ~75,000 sqft each metal-roof — landlord pass-through structure.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-009',
    company: 'Houston Medical Supply Warehouse',
    category: 'commercial_solar',
    city: 'Houston', state: 'TX',
    contactTitle: 'VP of Real Estate',
    pitchAngle: '140,000 sqft, single-story, owner-occupied — Section 179 + ITC stack appealing.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-010',
    company: 'Frisco Tech Manufacturing',
    category: 'commercial_solar',
    city: 'Frisco', state: 'TX',
    contactTitle: 'Plant Manager',
    pitchAngle: '85,000 sqft, daytime production shifts — high coincidence with solar generation curve.',
    source: 'auto_seed',
  },

  // ── California — Inland Empire ───────────────────────────────────────────
  {
    clientId: 'solar-011',
    company: 'Inland Logistics Center',
    category: 'commercial_solar',
    city: 'Ontario', state: 'CA',
    contactTitle: 'Director of Operations',
    pitchAngle: '450,000 sqft mega-warehouse — SCE NEM 3.0 commercial, AB-2143 prevailing wage applies.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-012',
    company: 'San Bernardino Cold Chain',
    category: 'commercial_solar',
    city: 'San Bernardino', state: 'CA',
    contactTitle: 'Chief Operating Officer',
    pitchAngle: '195,000 sqft cold storage — Title 24 compliance + battery storage rebate opportunity.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-013',
    company: 'Mojave Industrial Park',
    category: 'commercial_solar',
    city: 'Victorville', state: 'CA',
    contactTitle: 'Property Manager',
    pitchAngle: '8-building industrial park, mix of metal and membrane roofs — community solar potential.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-014',
    company: 'Sacramento Valley Foods Co-Pack',
    category: 'commercial_solar',
    city: 'Stockton', state: 'CA',
    contactTitle: 'Facilities Manager',
    pitchAngle: 'SMUD service area + 120,000 sqft membrane roof — production lines running 6am–10pm.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-015',
    company: 'Bay Area Data Logistics',
    category: 'commercial_solar',
    city: 'Fremont', state: 'CA',
    contactTitle: 'Sustainability Director',
    pitchAngle: 'PG&E E-19 customer + corporate ESG mandate — full RFP cycle next quarter.',
    source: 'auto_seed',
  },

  // ── Florida — South FL / Tampa ───────────────────────────────────────────
  {
    clientId: 'solar-016',
    company: 'Tampa Bay Distribution Co',
    category: 'commercial_solar',
    city: 'Tampa', state: 'FL',
    contactTitle: 'COO',
    pitchAngle: '250,000 sqft flat roof + FL no state income tax + 100% ITC pass-through.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-017',
    company: 'Miami Logistics Park',
    category: 'commercial_solar',
    city: 'Doral', state: 'FL',
    contactTitle: 'Director of Facilities',
    pitchAngle: 'Hurricane-rated mounting opportunity — 160,000 sqft warehouse, FPL commercial demand charges.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-018',
    company: 'Orlando Self Storage Group',
    category: 'commercial_solar',
    city: 'Orlando', state: 'FL',
    contactTitle: 'Property Manager',
    pitchAngle: '4-property portfolio, simple metal roofs, climate-controlled = strong daytime load.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-019',
    company: 'Jacksonville Marine Manufacturing',
    category: 'commercial_solar',
    city: 'Jacksonville', state: 'FL',
    contactTitle: 'Plant Manager',
    pitchAngle: '110,000 sqft boat manufacturer — JEA municipal rates, paint booth electrical load.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-020',
    company: 'Gulf Coast Cold Storage',
    category: 'commercial_solar',
    city: 'St. Petersburg', state: 'FL',
    contactTitle: 'VP of Real Estate',
    pitchAngle: '85,000 sqft refrigerated — Duke Energy commercial demand, summer peak coincides with PV peak.',
    source: 'auto_seed',
  },

  // ── New Jersey / New York — high-CPL solar markets ───────────────────────
  {
    clientId: 'solar-021',
    company: 'Newark Distribution Terminal',
    category: 'commercial_solar',
    city: 'Newark', state: 'NJ',
    contactTitle: 'Director of Operations',
    pitchAngle: '380,000 sqft warehouse — NJ TREC SuSI program + PSEG demand response stacking.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-022',
    company: 'Long Island Industrial Holdings',
    category: 'commercial_solar',
    city: 'Hauppauge', state: 'NY',
    contactTitle: 'Property Manager',
    pitchAngle: '6-tenant business park — PSEG-LI commercial customers, NY-Sun MW Block.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-023',
    company: 'Hudson Valley Cold Storage',
    category: 'commercial_solar',
    city: 'Newburgh', state: 'NY',
    contactTitle: 'Plant Manager',
    pitchAngle: '95,000 sqft cold storage — Central Hudson commercial + NYSERDA incentive available.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-024',
    company: 'Garden State Self Storage',
    category: 'commercial_solar',
    city: 'Edison', state: 'NJ',
    contactTitle: 'COO',
    pitchAngle: '3-facility portfolio along NJ Turnpike corridor — community solar pollination opportunity.',
    source: 'auto_seed',
  },

  // ── Illinois / Ohio — Midwest manufacturing belt ─────────────────────────
  {
    clientId: 'solar-025',
    company: 'Chicagoland Logistics Hub',
    category: 'commercial_solar',
    city: 'Joliet', state: 'IL',
    contactTitle: 'Director of Facilities',
    pitchAngle: '420,000 sqft single-story warehouse — Illinois Shines REC program + ComEd commercial.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-026',
    company: 'Columbus Metal Fabrication',
    category: 'commercial_solar',
    city: 'Columbus', state: 'OH',
    contactTitle: 'Plant Manager',
    pitchAngle: '120,000 sqft metal-roof fabricator — AEP commercial rate, daytime heavy load.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-027',
    company: 'Cleveland Industrial Park',
    category: 'commercial_solar',
    city: 'Cleveland', state: 'OH',
    contactTitle: 'Property Manager',
    pitchAngle: '5-building industrial park — Illuminating Co commercial, IRA Energy Communities bonus.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-028',
    company: 'Midwest Food Processing',
    category: 'commercial_solar',
    city: 'Aurora', state: 'IL',
    contactTitle: 'Sustainability Director',
    pitchAngle: '150,000 sqft processing facility — corporate sustainability targets + Net Zero by 2030.',
    source: 'auto_seed',
  },

  // ── Georgia / North Carolina — Sunbelt expansion ─────────────────────────
  {
    clientId: 'solar-029',
    company: 'Atlanta Distribution Center',
    category: 'commercial_solar',
    city: 'Forest Park', state: 'GA',
    contactTitle: 'Director of Operations',
    pitchAngle: '275,000 sqft warehouse — Georgia Power commercial, IRA energy community bonus 10% adder.',
    source: 'auto_seed',
  },
  {
    clientId: 'solar-030',
    company: 'Charlotte Logistics Group',
    category: 'commercial_solar',
    city: 'Charlotte', state: 'NC',
    contactTitle: 'COO',
    pitchAngle: '195,000 sqft membrane roof — Duke Energy commercial + NC HB 951 utility procurement.',
    source: 'auto_seed',
  },
];

module.exports = { LEADS: SOLAR_LEADS };
