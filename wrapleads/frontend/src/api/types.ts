export type LeadStatus = 'new' | 'cold' | 'contacted' | 'replied' | 'meeting' | 'proposal' | 'won' | 'lost';
export type LeadCategory = 'fleet' | 'design' | 'construction' | 'dinoc' | 'reatec' | 'colorchange' | 'wallgraphics' | 'gc_referral' | 'racing';
export type SubStatus = 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled';

export interface Lead {
  id: string;
  serverId?: number;
  clientId?: string;
  company: string;
  category: LeadCategory;
  state: string;
  city: string;
  address: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  website: string;
  fleetSize: string;
  pitchAngle: string;
  status: LeadStatus;
  notes: string;
  lastContacted: string;
  followupDueAt?: string | null;
  sourceCompanyId?: number;
  referred_by?: string | null;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export type ActivityType = 'email_sent' | 'email_copied' | 'email_generated' | 'draft_email' | 'status_changed' | 'note_added' | 'called' | 'meeting_set' | 'sequence_activated' | 'quote_created' | 'quote_sent' | 'quote_accepted';

export interface LeadActivity {
  id: string;
  type: ActivityType;
  subject?: string;
  body?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface QueuedEmail {
  id: number;
  sequence_day: number;
  subject: string;
  body: string;
  to_email: string;
  to_name?: string;
  send_at: string;
  sent_at?: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  error_msg?: string;
}

export type BidStatus = 'tracking' | 'submitted' | 'shortlisted' | 'won' | 'lost' | 'no_bid';
export type BidProjectType = 'fleet_graphics' | 'dinoc' | 'signage' | 'color_change' | 'mixed' | 'general';
export type BidPlatform = 'building_connected' | 'isqft' | 'planhub' | 'sam_gov' | 'indot' | 'direct' | 'other';

export interface Bid {
  id: number;
  user_id: string;
  lead_id?: number | null;
  lead_company?: string | null;
  project_name: string;
  gc_name?: string | null;
  architect?: string | null;
  project_type: BidProjectType;
  bid_due?: string | null;
  estimated_value?: number | null;
  source_platform?: BidPlatform | null;
  source_url?: string | null;
  status: BidStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BidSummary {
  active: number;
  won: number;
  submitted: number;
  won_value: number;
  pipeline_value: number;
  overdue_bids: number;
}

export interface Carrier {
  id: number;
  name: string;
  dba_name?: string;
  dot_number?: string;
  fleet_size?: number;
  state?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  source: string;
  wrap_score: number;
  years_since_report?: number;
  already_imported?: boolean;
}

export type PlanTier = 'wrapleads' | 'shopflow' | 'wrapos';

export interface User {
  id: number;
  email: string;
  name?: string;
  companyName?: string;
  subStatus: SubStatus;
  trialEndsAt?: string;
  subPeriodEnd?: string;
  isFirstLogin?: boolean;
  planTier: PlanTier;
}

export interface SavedSearch {
  id: number;
  name: string;
  filters: {
    states?: string[];
    minFleet?: number | null;
    maxFleet?: number | null;
    query?: string;
    sources?: string[];
    industries?: string[];
  };
  new_count: number;
  last_checked?: string;
}

export interface Settings {
  companyName: string;
  senderName: string;
  senderTitle: string;
  senderEmail: string;
  senderPhone: string;
  companyTagline: string;
  companyServices: string;
  city: string;
  state: string;
  apolloApiKey: string;
  vapiApiKey: string;
  vapiPhoneNumberId: string;
  vapiCallerName: string;
  transferPhoneNumber: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  portfolioUrl: string;
  callHumorLevel: 'none' | 'light' | 'medium' | 'high';
  pricePerSqftLow: string;
  pricePerSqftHigh: string;
  openaiApiKey: string;
  samsaraApiKey: string;
  motiveApiKey: string;
  accentColor: string;
  monthlyRevenueGoal: string;
}

export interface CarrierSearchParams {
  states?: string[] | null;
  minFleet?: number | null;
  maxFleet?: number | null;
  query?: string;
  sources?: string[] | null;
  industries?: string[] | null;
  limit?: number;
  offset?: number;
  sort?: string;
  onlyWithPhone?: boolean;
}

export interface CarrierSearchResult {
  results: Carrier[];
  total: number;
}

export interface CarrierStats {
  total: number;
  sweet_spot: number;
  states: number;
  total_units: number;
  sources?: { source: string; count: number }[];
}

export const CATEGORIES: Record<LeadCategory, string> = {
  fleet:        'Fleet / Logistics',
  design:       'Interior Design',
  construction: 'Construction',
  dinoc:        'DI-NOC (Architectural Film)',
  reatec:       'Rea Tec (Architectural Film)',
  colorchange:  'Color Change Wraps',
  wallgraphics: 'Wall Graphics / Wallpaper',
  gc_referral:  'GC Referral Partner',
  racing:       'Motorsport / Race Teams',
};

export const STATUSES: Record<LeadStatus, string> = {
  new: 'New',
  cold: 'Cold',
  contacted: 'Contacted',
  replied: 'Replied',
  meeting: 'Meeting Set',
  proposal: 'Proposal Sent',
  won: 'Won',
  lost: 'Lost',
};

export interface BlueprintOpportunity {
  type: LeadCategory;
  description: string;
  specs: string[];
  location: string;
}

export interface BlueprintResult {
  hasOpportunity: boolean;
  opportunities: BlueprintOpportunity[];
  company: string | null;
  contactTitle: string | null;
  projectName: string | null;
  city: string | null;
  state: string | null;
  projectType: string;
  pitchAngle: string;
  notes: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ParsedContact {
  company: string;
  contactName: string | null;
  contactTitle: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  category: LeadCategory;
  pitchAngle: string;
}

export interface PipelineAnalytics {
  total: number;
  byStatus: Partial<Record<LeadStatus, number>>;
  byCategory: Partial<Record<string, number>>;
  overdue: number;
  projectedRevenue: number;
  sequenceStats: {
    activeSequences: number;
    emailsSent30d: number;
  };
  recentLeads: Array<{ day: string; count: number }>;
}

export const DEFAULT_SETTINGS: Settings = {
  companyName: '',
  senderName: '',
  senderTitle: 'Installer / Sales',
  senderEmail: '',
  senderPhone: '',
  companyTagline: 'vehicle wraps, fleet graphics, DI-NOC, Rea Tec & color change',
  companyServices: 'fleet wraps and vehicle graphics, 3M DI-NOC architectural finishes, Rea Tec architectural films, custom color-change wraps',
  city: '',
  state: '',
  apolloApiKey: '',
  vapiApiKey: '',
  vapiPhoneNumberId: '',
  vapiCallerName: '',
  transferPhoneNumber: '',
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioFromNumber: '',
  portfolioUrl: '',
  callHumorLevel: 'light',
  pricePerSqftLow: '8',
  pricePerSqftHigh: '14',
  openaiApiKey: '',
  samsaraApiKey: '',
  motiveApiKey: '',
  accentColor: '',
  monthlyRevenueGoal: '',
};

// ── Wrap Lifecycle Tracker ────────────────────────────────────────────────────

export type VehicleType =
  | 'cargo_van_standard'
  | 'cargo_van_high_roof'
  | 'box_truck_16'
  | 'box_truck_24'
  | 'semi_cab_only'
  | 'semi_full'
  | 'pickup_truck'
  | 'suv_large'
  | 'sedan'
  | 'minivan'
  | 'bus_school'
  | 'flatbed'
  | 'other';

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  cargo_van_standard:  'Cargo Van (Standard)',
  cargo_van_high_roof: 'Cargo Van (High Roof)',
  box_truck_16:        '16ft Box Truck',
  box_truck_24:        '24ft Box Truck',
  semi_cab_only:       'Semi Cab (no trailer)',
  semi_full:           'Semi + 53ft Trailer',
  pickup_truck:        'Full-Size Pickup',
  suv_large:           'Large SUV / Crossover',
  sedan:               'Sedan / Compact',
  minivan:             'Minivan / Passenger Van',
  bus_school:          'School / Transit Bus',
  flatbed:             'Flatbed Truck',
  other:               'Other',
};

export interface InstalledJob {
  id: number;
  user_id: string;
  lead_id?: number | null;
  company: string;
  vehicle_type: VehicleType;
  vehicle_count: number;
  wrap_category: LeadCategory;
  material?: string | null;
  install_date: string;
  life_years: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  days_until_expiry?: number;
}

// ── Computer Vision Quote ─────────────────────────────────────────────────────

export interface VisionQuoteResult {
  ok: boolean;
  vehicleKey: string;
  vehicleLabel: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
  sqftRange: [number, number];
  quotes: {
    full:    { label: string; low: number; high: number };
    partial: { label: string; low: number; high: number };
    spot:    { label: string; low: number; high: number };
  };
}

// ── AI Design Generation ──────────────────────────────────────────────────────

export interface DesignBrief {
  primary_color: string;
  secondary_color: string;
  style: string;
  layout: string;
  typography: string;
  dall_e_prompt: string;
}

export interface MockupResult {
  ok: boolean;
  image_url: string;
  brief: DesignBrief;
}

// ── Fleet Integrations ────────────────────────────────────────────────────────

export interface FleetVehicle {
  id: string;
  name?: string;
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  license_plate?: string;
  type?: string;
}

export interface FleetImportResult {
  ok: boolean;
  imported: number;
  skipped: number;
}

// ── Dynamic Wrap Content ──────────────────────────────────────────────────────

export interface WrapContent {
  id: number;
  user_id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  tags: string[];
  created_at: string;
}

export interface ContentSchedule {
  id: number;
  user_id: string;
  content_id: number;
  content?: WrapContent;
  vehicle_group: string;
  start_date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  geo_trigger?: string | null;
  priority: number;
  notes?: string | null;
  created_at: string;
}

// ── Client Portal ────────────────────────────────────────────────────────────

export interface PortalLink {
  id: number;
  user_id: string;
  lead_id: number;
  token: string;
  label?: string | null;
  created_at: string;
}

// ── Job Photos ────────────────────────────────────────────────────────────────

export type JobPhotoType = 'before' | 'after' | 'detail' | 'concept' | 'other';

export interface JobPhoto {
  id: number;
  user_id: string;
  job_id: number;
  image_data: string;
  caption?: string | null;
  photo_type: JobPhotoType;
  created_at: string;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationType = 'aging_wrap' | 'call_completed' | 'email_reply' | 'sequence_complete' | 'bid_due_soon';

export interface AppNotification {
  id: number;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

// ── E Ink Device Infrastructure ───────────────────────────────────────────────

export interface EinkDevice {
  id: number;
  user_id: string;
  device_token: string;
  serial_number?: string | null;
  name: string;
  vehicle_group: string;
  lead_id?: number | null;
  job_id?: number | null;
  status: 'online' | 'offline' | 'updating' | 'error';
  current_content_id?: number | null;
  current_content?: WrapContent | null;
  last_seen_at?: string | null;
  last_location?: { lat: number; lng: number; timestamp: string } | null;
  firmware_version?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface EinkPushLog {
  id: number;
  device_id: number;
  content_id?: number | null;
  content?: WrapContent | null;
  pushed_at: string;
  acked_at?: string | null;
  status: 'pending' | 'delivered' | 'failed';
  error?: string | null;
}

export interface QuoteLineItem {
  id: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'invoiced';

export interface ShopQuote {
  id: number;
  lead_id: number;
  quote_number: string;
  title: string;
  status: QuoteStatus;
  line_items: QuoteLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total: number;
  notes: string | null;
  valid_days: number;
  sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}
