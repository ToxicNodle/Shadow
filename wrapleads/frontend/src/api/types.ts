export type LeadStatus = 'cold' | 'contacted' | 'replied' | 'meeting' | 'proposal' | 'won' | 'lost';
export type LeadCategory = 'fleet' | 'design' | 'construction' | 'dinoc' | 'reatec' | 'colorchange' | 'wallgraphics' | 'gc_referral';
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
  createdAt: string;
  updatedAt: string;
}

export type ActivityType = 'email_sent' | 'email_copied' | 'email_generated' | 'status_changed' | 'note_added' | 'called' | 'meeting_set' | 'sequence_activated';

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

export interface User {
  id: number;
  email: string;
  name?: string;
  companyName?: string;
  subStatus: SubStatus;
  trialEndsAt?: string;
  subPeriodEnd?: string;
  isFirstLogin?: boolean;
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
  apolloApiKey: string;
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
};

export const STATUSES: Record<LeadStatus, string> = {
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
  apolloApiKey: '',
};
