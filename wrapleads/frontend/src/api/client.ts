export function getToken(): string {
  return localStorage.getItem('wl_token') ?? '';
}

export function setToken(token: string): void {
  localStorage.setItem('wl_token', token);
}

export function logout(): void {
  localStorage.removeItem('wl_token');
  localStorage.removeItem('wl_user');
  window.location.href = '/login';
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function authFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts?.headers as Record<string, string>),
    Authorization: `Bearer ${token}`,
  };

  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    logout();
    throw new ApiError(401, 'Session expired');
  }

  if (res.status === 402) {
    let msg = 'Subscription required';
    try { const e = await res.json(); msg = e.error ?? msg; } catch {}
    // Open paywall — lazy require to avoid circular import at module load
    import('../store/useAppStore').then(({ useAppStore }) => {
      useAppStore.getState().setPaywallOpen(true);
    });
    throw new ApiError(402, msg);
  }

  if (!res.ok) {
    let msg = res.statusText;
    try { const e = await res.json(); msg = e.error ?? e.message ?? msg; } catch {}
    throw new ApiError(res.status, msg);
  }

  return res.json() as Promise<T>;
}

// ---- Typed API helpers ----

import type { Lead, User, SavedSearch, CarrierSearchParams, CarrierSearchResult, CarrierStats, BlueprintResult, PipelineAnalytics, QueuedEmail, Bid, BidSummary, InstalledJob, VisionQuoteResult, DesignBrief, MockupResult, FleetVehicle, FleetImportResult, WrapContent, ContentSchedule, EinkDevice, EinkPushLog, JobPhoto, AppNotification, PortalLink, MaterialItem } from './types';

export const api = {
  // Auth
  me: () => authFetch<{ user: User }>('/auth/me'),
  login: (email: string, password: string) =>
    authFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  register: (name: string, company: string, email: string, password: string) =>
    authFetch<{ token: string; user: User }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ name, company, email, password }),
    }),
  forgotPassword: (email: string) =>
    authFetch<{ ok: boolean }>('/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ email }),
    }),
  demoAvailable: () => authFetch<{ available: boolean }>('/auth/demo-available'),
  demoLogin: () =>
    authFetch<{ token: string; user: User }>('/auth/demo-login', {
      method: 'POST', body: '{}',
    }),
  resetPassword: (token: string, password: string) =>
    authFetch<{ ok: boolean }>('/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ token, password }),
    }),

  // Leads
  getLeads: () => authFetch<{ leads: Lead[] }>('/leads'),
  getLeadTags: () => authFetch<{ tags: string[] }>('/leads/tags'),
  createLead: (lead: Partial<Lead>) =>
    authFetch<{ id: number }>('/leads', { method: 'POST', body: JSON.stringify(lead) }),
  updateLead: (serverId: number, patch: Partial<Lead>) =>
    authFetch<Lead>(`/leads/${serverId}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteLead: (serverId: number) =>
    authFetch<void>(`/leads/${serverId}`, { method: 'DELETE' }),
  syncLeads: (leads: Partial<Lead>[]) =>
    authFetch<{ inserted: number; failed: number }>('/leads/sync', {
      method: 'POST', body: JSON.stringify({ leads }),
    }),
  importLeadsCSV: (file: File) => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    return fetch('/leads/import-csv', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Import failed');
      return data as { ok: boolean; imported: number; skipped: number; errors: number; total: number };
    });
  },

  // SAM.gov government opportunities
  listOpportunities: (params: { state?: string; keyword?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.state) qs.set('state', params.state);
    if (params.keyword) qs.set('keyword', params.keyword);
    if (params.limit) qs.set('limit', String(params.limit));
    return authFetch<{ source: string; opportunities: Array<{ id: string; title: string; agency: string; state: string | null; value: number | null; deadline: string; naics: string; url: string; description?: string }>; message?: string }>('/opportunities?' + qs.toString());
  },
  importOpportunity: (id: string, opp: { title: string; agency: string; state?: string | null; value?: number | null; naics?: string; url?: string }) =>
    authFetch<{ ok: boolean; lead: { id: number } }>(`/opportunities/${id}/import`, {
      method: 'POST', body: JSON.stringify(opp),
    }),

  getInboundLeads: (params: { state?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.state) qs.set('state', params.state);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    return authFetch<{
      leads: Array<{
        id: number; name: string | null; company: string; email: string | null; phone: string | null;
        city: string | null; state_code: string | null; vehicle_type: string | null; fleet_size: number | null;
        industry: string | null; message: string | null;
        concepts_json: Array<{ name: string; palette: string; description: string; estimatedCost?: string }>;
        created_at: string;
      }>;
      total: number;
    }>('/inbound-leads?' + qs.toString());
  },

  claimInboundLead: (id: number) =>
    authFetch<{ ok: boolean; lead: { id: number; company: string } }>(`/inbound-leads/${id}/claim`, { method: 'POST' }),

  importShopVoxCSV: (file: File) => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    return fetch('/leads/import-shopvox', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Import failed');
      return data as { ok: boolean; imported: number; skipped: number; errors: number; total: number };
    });
  },

  // Lead activities
  getActivities: (serverId: number) =>
    authFetch<{ activities: import('./types').LeadActivity[] }>(`/leads/${serverId}/activities`),
  logActivity: (serverId: number, activity: { type: string; subject?: string; body?: string; metadata?: Record<string, unknown> }) =>
    authFetch<import('./types').LeadActivity>(`/leads/${serverId}/activities`, {
      method: 'POST', body: JSON.stringify(activity),
    }),
  sendEmail: (serverId: number, payload: { subject: string; body: string; toEmail: string; toName?: string; template_id?: number }) =>
    authFetch<{ ok: boolean; resend_id?: string }>(`/leads/${serverId}/send-email`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
  generateSmartFollowup: (leadId: number) =>
    authFetch<{
      ok: boolean; fallback: boolean;
      subject: string; body: string; tone: string; reasoningNote: string;
    }>(`/leads/${leadId}/smart-followup`, { method: 'POST' }),

  generateMeetingPrep: (leadId: number) =>
    authFetch<{
      ok: boolean; fallback: boolean;
      companySnapshot: string;
      openingLine: string;
      pricingNote: string;
      talkTrack: string[];
      objections: Array<{ objection: string; counter: string }>;
      questionsToAsk: string[];
      closingMove: string;
      similarWinsNote: string;
      estimatedValue: number;
    }>(`/leads/${leadId}/meeting-prep`, { method: 'POST' }),

  getFollowupDue: () =>
    authFetch<{ leads: Lead[]; count: number }>('/leads/followup-due'),
  activateSequence: (serverId: number, tone?: string) =>
    authFetch<{ ok: boolean; queued: number; emails: { day: number; label: string; subject: string; body: string }[] }>(
      `/leads/${serverId}/activate-sequence`, { method: 'POST', body: JSON.stringify({ tone }) }
    ),
  getQueue: (serverId: number) =>
    authFetch<{ queue: QueuedEmail[] }>(`/leads/${serverId}/queue`),
  cancelQueueItem: (queueId: number) =>
    authFetch<{ ok: boolean }>(`/email-queue/${queueId}`, { method: 'DELETE' }),

  // Carriers
  searchCarriers: (params: CarrierSearchParams) =>
    authFetch<CarrierSearchResult>('/carriers/search', {
      method: 'POST', body: JSON.stringify(params),
    }),
  carrierStats: () => authFetch<CarrierStats>('/carriers/stats'),
  importCarrier: (companyId: number) =>
    authFetch<{ ok: boolean; leadId: number | null }>('/carriers/import', {
      method: 'POST', body: JSON.stringify({ companyId }),
    }),

  getCallOpener: (leadId: number) =>
    authFetch<{ ok: boolean; fallback: boolean; opener: string; tip: string | null; contactSuffix?: string }>(
      `/leads/${leadId}/call-opener`
    ),
  generateLossDebrief: (leadId: number) =>
    authFetch<{
      ok: boolean; fallback: boolean;
      debrief: {
        whatWentWrong: string; missedOpportunity: string;
        recoverability: 'high' | 'medium' | 'low';
        recoverInstructions: string; whatToDoNext: string; lessonLearned: string;
      };
    }>(`/leads/${leadId}/loss-debrief`, { method: 'POST', body: '{}' }),

  lookupByDot: (dotNumber: string) =>
    authFetch<{
      ok: boolean;
      carrier: {
        id: number; dotNumber: string; name: string; dbaName: string | null;
        city: string | null; state: string | null; phone: string | null; email: string | null;
        fleetSize: number | null; wrapScore: number; alreadyInCrm: boolean;
      };
    }>(`/carriers/by-dot/${dotNumber.replace(/\D/g, '')}`),

  // Saved searches
  getSavedSearches: () => authFetch<{ searches: SavedSearch[] }>('/searches/saved'),
  createSavedSearch: (name: string, filters: SavedSearch['filters']) =>
    authFetch<SavedSearch>('/searches/saved', {
      method: 'POST', body: JSON.stringify({ name, filters }),
    }),
  deleteSavedSearch: (id: number) =>
    authFetch<void>(`/searches/saved/${id}`, { method: 'DELETE' }),
  runSavedSearch: (id: number) =>
    authFetch<{ new_count: number }>(`/searches/saved/${id}/run`, { method: 'POST' }),
  toggleSavedSearchAlert: (id: number) =>
    authFetch<{ ok: boolean; alert_enabled: boolean }>(`/searches/saved/${id}/alert`, { method: 'PATCH' }),

  // Apollo
  apolloSearch: (params: { apiKey: string; company: string; domain?: string; titles: string[]; limit?: number }) =>
    authFetch<{ people: unknown[] }>('/apollo/search', { method: 'POST', body: JSON.stringify(params) }),
  apolloEnrich: (params: { apiKey: string; firstName: string; lastName: string; company: string; domain?: string }) =>
    authFetch<{ person: { email?: string } }>('/apollo/enrich', { method: 'POST', body: JSON.stringify(params) }),
  apolloTest: () => authFetch<{ ok: boolean }>('/apollo/test'),

  // AI email
  generateEmail: (params: { lead: Lead; emailType: string; tone: string; settings: object }) =>
    authFetch<{ subject: string; body: string }>('/ai/email', {
      method: 'POST', body: JSON.stringify(params),
    }),
  generateSequence: (params: { lead: Lead; tone: string; settings: object }) =>
    authFetch<{ emails: { day: number; label: string; subject: string; body: string }[] }>('/ai/sequence', {
      method: 'POST', body: JSON.stringify(params),
    }),
  bulkEmail: (params: { leads: Lead[]; tone: string; settings: object }) =>
    authFetch<{ emails: { leadId: string; company: string; subject: string; body: string }[] }>('/ai/bulk-email', {
      method: 'POST', body: JSON.stringify(params),
    }),
  generateProposal: (params: { lead: Lead; services: string[]; pricing: Record<string, number>; notes: string; settings: object }) =>
    authFetch<{ subject: string; body: string }>('/ai/proposal', {
      method: 'POST', body: JSON.stringify(params),
    }),

  // Blueprint scanner
  scanBlueprint: (file: File) => {
    const token = getToken();
    const form = new FormData();
    form.append('pdf', file);
    return fetch('/blueprint/scan', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Scan failed');
      return data as { ok: boolean; result: BlueprintResult; pages: number };
    });
  },

  // AI contact parser
  parseContacts: (text: string) =>
    authFetch<{ leads: import('./types').ParsedContact[]; count: number }>('/ai/parse-contacts', {
      method: 'POST', body: JSON.stringify({ text }),
    }),

  // Natural language lead search
  nlLeadSearch: (query: string) =>
    authFetch<{
      ok: boolean;
      parsedIntent: {
        states: string[] | null; minFleet: number | null; maxFleet: number | null;
        industries: string[] | null; textQuery: string; explanation: string;
      };
      total: number;
      results: Array<{
        id: number; dot_number: string; name: string; dba_name: string | null;
        city: string | null; state: string | null; phone: string | null; email: string | null;
        fleet_size: number | null; wrap_score: number; already_imported: boolean;
      }>;
    }>('/ai/lead-search', { method: 'POST', body: JSON.stringify({ query }) }),

  // Analytics
  analytics: () => authFetch<PipelineAnalytics>('/leads/analytics'),

  // Settings (server-persisted)
  getSettings: () => authFetch<{ settings: Partial<import('./types').Settings> }>('/settings'),
  saveSettings: (settings: Partial<import('./types').Settings>) =>
    authFetch<{ ok: boolean }>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  // Stripe
  checkout: (tier: import('./types').PlanTier = 'wrapleads') =>
    authFetch<{ url: string }>('/stripe/checkout', { method: 'POST', body: JSON.stringify({ tier }) }),
  portal: () => authFetch<{ url: string }>('/stripe/portal', { method: 'POST', body: '{}' }),

  // Mission dashboard
  getMission: () => authFetch<{
    date: string;
    overdue: { id: number; company: string; category: string; email: string; followup_due_at: string; last_contacted: string }[];
    newWithEmail: { id: number; company: string; category: string; email: string; city: string; state: string; pitch_angle: string }[];
    replied: { id: number; company: string; category: string; last_contacted: string }[];
    bidsThisWeek: { id: number; project_name: string; gc_name: string; bid_due: string; status: string; estimated_value: number }[];
    callReady: { id: number; company: string; category: string; city: string; state: string; phone: string | null; last_contacted: string; emails_sent: number }[];
    needsEmail: { id: number; company: string; category: string; city: string; state: string; contact_title: string | null; estimated_value: number }[];
    sequences: { active: number; pendingEmails: number };
    wonThisMonth: number;
    wonThisMonthRevenue: number;
    agingWraps: number;
    priorityScore: number;
    stuckDeals: { id: number; company: string; status: string; category: string; city: string; state: string; email: string; days_stale: number; last_contacted: string | null }[];
  }>('/mission'),

  // Bulk sequence activation
  bulkActivateSequences: (leadIds: number[], tone?: string) =>
    authFetch<{ ok: boolean; queued: number; failed: number; results: { id: number; status: string; company?: string; reason?: string }[] }>(
      '/leads/bulk-activate-sequences', { method: 'POST', body: JSON.stringify({ lead_ids: leadIds, tone }) }
    ),

  // AI Phone Calls (Vapi.ai)
  initiateCall: (leadId: number) =>
    authFetch<{ ok: boolean; call_id: string; status: string }>(
      '/calls/initiate', { method: 'POST', body: JSON.stringify({ lead_id: leadId }) }
    ),
  getCallStatus: (callId: string) =>
    authFetch<{ ok: boolean; status: string; endedReason?: string }>(
      `/calls/status/${callId}`
    ),

  // Apollo bulk enrichment + prospecting
  bulkEnrichLeads: (params: {
    lead_ids?: number[];
    all?: boolean;
    auto_sequence?: boolean;
    tone?: string;
    apiKey?: string;
  }) =>
    authFetch<{ ok: boolean; searched: number; enriched: number; sequencesActivated: number; results: { id: number; company: string; status: 'enriched' | 'skipped' | 'error'; email?: string; reason?: string }[] }>(
      '/apollo/bulk-enrich-leads', { method: 'POST', body: JSON.stringify(params) }
    ),
  prospect: (params: {
    industry?: string;
    location?: string | string[];
    titles?: string[];
    keywords?: string;
    limit?: number;
    category?: string;
    apiKey?: string;
  }) =>
    authFetch<{ ok: boolean; count: number; prospects: { name: string; title: string; company: string; city: string; state: string; email?: string; phone?: string; linkedin?: string; domain?: string }[] }>(
      '/apollo/prospect', { method: 'POST', body: JSON.stringify(params) }
    ),
  importProspect: (prospect: object, category: string) =>
    authFetch<{ ok: boolean; id: number; duplicate: boolean }>(
      '/apollo/import-prospect', { method: 'POST', body: JSON.stringify({ prospect, category }) }
    ),

  // Wrap Lifecycle Tracker
  getJobs: () => authFetch<{ jobs: InstalledJob[] }>('/jobs'),
  getAgingJobs: () => authFetch<{ jobs: InstalledJob[] }>('/jobs/aging'),
  getJobsAgingMap: () => authFetch<{
    byState: Record<string, { fresh: number; aging: number; due: number; overdue: number; vehicles: number }>;
    totalJobs: number; dueCount: number; overdueCount: number;
  }>('/jobs/aging-map'),
  createJob: (job: Partial<InstalledJob>) =>
    authFetch<{ job: InstalledJob }>('/jobs', { method: 'POST', body: JSON.stringify(job) }),
  updateJob: (id: number, updates: Partial<InstalledJob>) =>
    authFetch<{ job: InstalledJob }>(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteJob: (id: number) =>
    authFetch<{ ok: boolean }>(`/jobs/${id}`, { method: 'DELETE' }),
  createReorderLead: (jobId: number) =>
    authFetch<{ leadId: number; existing: boolean }>(`/jobs/${jobId}/create-reorder-lead`, { method: 'POST' }),

  getOutstandingJobs: () =>
    authFetch<{
      ok: boolean;
      jobs: Array<{
        id: number; company: string; vehicleCount: number; vehicleType: string | null;
        category: string | null; installDate: string | null; revenue: number;
        amountPaid: number; balance: number; paymentStatus: string;
        invoiceSentAt: string | null; leadEmail: string | null; leadContact: string | null;
        daysSinceInstall: number;
      }>;
    }>('/jobs/outstanding'),

  batchSendInvoices: (jobIds: number[]) =>
    authFetch<{
      ok: boolean; sent: number; skipped: number; failed: number;
      results: Array<{ jobId: number; ok: boolean; company: string | null; toEmail?: string; reason?: string }>;
    }>('/jobs/batch-send-invoices', { method: 'POST', body: JSON.stringify({ jobIds }) }),

  checkLeadNews: (leadId: number) =>
    authFetch<{
      ok: boolean; company: string;
      articles: Array<{ title: string; link: string; pubDate: string; source: string; pubMs: number }>;
    }>(`/leads/${leadId}/check-news`, { method: 'POST' }),

  // ── Discovery call guide ──
  getDiscoveryGuide: (leadId: number) =>
    authFetch<{
      ok: boolean; fallback: boolean;
      discoveryQuestions: string[];
      vehicleWorksheet: Array<{ type: string; sqFt: string; material: string; note: string }>;
      upsellChecklist: string[];
      redFlags: string[];
      estimatedValue: string;
    }>(`/leads/${leadId}/discovery-guide`),

  // ── Multi-contact manager ──
  getLeadContacts: (leadId: number) =>
    authFetch<{
      ok: boolean;
      contacts: Array<{
        id: number; name: string; title: string | null; email: string | null;
        phone: string | null; is_primary: boolean; notes: string | null; created_at: string;
      }>;
    }>(`/leads/${leadId}/contacts`),

  addLeadContact: (leadId: number, data: { name: string; title?: string; email?: string; phone?: string; is_primary?: boolean; notes?: string }) =>
    authFetch<{ ok: boolean; contact: { id: number; name: string; title: string | null; email: string | null; phone: string | null; is_primary: boolean; notes: string | null; created_at: string } }>(
      `/leads/${leadId}/contacts`, { method: 'POST', body: JSON.stringify(data) }
    ),

  updateLeadContact: (leadId: number, cid: number, data: { name?: string; title?: string; email?: string; phone?: string; is_primary?: boolean; notes?: string }) =>
    authFetch<{ ok: boolean; contact: { id: number; name: string; title: string | null; email: string | null; phone: string | null; is_primary: boolean; notes: string | null; created_at: string } }>(
      `/leads/${leadId}/contacts/${cid}`, { method: 'PATCH', body: JSON.stringify(data) }
    ),

  deleteLeadContact: (leadId: number, cid: number) =>
    authFetch<{ ok: boolean }>(`/leads/${leadId}/contacts/${cid}`, { method: 'DELETE' }),

  // ── AI email thread summarizer ──
  getEmailThreadSummary: (leadId: number) =>
    authFetch<{
      ok: boolean; fallback: boolean;
      summary: string[];
      nextAction: string;
      sentiment: 'positive' | 'neutral' | 'negative';
    }>(`/leads/${leadId}/email-summary`, { method: 'POST' }),

  // ── Quote follow-up automation ──
  scheduleQuoteFollowup: (quoteId: number) =>
    authFetch<{ ok: boolean; queued: number; days: number[] }>(
      `/quotes/${quoteId}/schedule-followup`, { method: 'POST' }
    ),

  getQuoteFollowupStatus: (quoteId: number) =>
    authFetch<{
      ok: boolean;
      scheduled: Array<{ id: number; subject: string; send_at: string; status: string }>;
    }>(`/quotes/${quoteId}/followup-status`),

  getCaseStudy: (jobId: number) =>
    authFetch<{
      caseStudy: {
        id: number; job_id: number; token: string; headline: string; narrative: string;
        stats_json: { vehicles: number; lifespanYears: number; installMonth: string; impressionsPerYear: number };
        created_at: string;
        photos: Array<{ id: number; url: string; caption: string | null }>;
      } | null;
    }>(`/jobs/${jobId}/case-study`),

  generateCaseStudy: (jobId: number) =>
    authFetch<{
      ok: boolean;
      caseStudy: {
        id: number; job_id: number; token: string; headline: string; narrative: string;
        stats_json: { vehicles: number; lifespanYears: number; installMonth: string; impressionsPerYear: number };
        created_at: string;
        photos: Array<{ id: number; url: string; caption: string | null }>;
      };
    }>(`/jobs/${jobId}/case-study`, { method: 'POST' }),

  // Computer Vision Quoting
  quoteVehicle: (file: File) => {
    const token = getToken();
    const form = new FormData();
    form.append('image', file);
    return fetch('/vision/quote-vehicle', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Vision quote failed');
      return data as VisionQuoteResult;
    });
  },

  // Pitch Mode — in-person sales demo
  brandLookup: (companyName: string) =>
    authFetch<{
      ok: boolean;
      brand: { name: string; domain: string; logo_url: string; primary_color: string; secondary_color: string; tagline: string };
    }>('/vision/brand-lookup', { method: 'POST', body: JSON.stringify({ companyName }) }),
  pitchPreview: (file: File, params: { companyName: string; primary_color: string; secondary_color: string; tagline?: string; styles?: string[]; style?: string }) => {
    const token = getToken();
    const form = new FormData();
    form.append('image', file);
    form.append('companyName', params.companyName);
    form.append('primary_color', params.primary_color);
    form.append('secondary_color', params.secondary_color);
    if (params.tagline) form.append('tagline', params.tagline);
    if (params.styles && params.styles.length) form.append('styles', params.styles.join(','));
    else if (params.style) form.append('style', params.style);
    return fetch('/vision/pitch-preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Pitch preview failed');
      return data as {
        ok: boolean;
        variants: { style: string; label: string; image_url: string }[];
        original_url: string;
        image_url: string;
      };
    });
  },

  // AR / Wrap Mockup Preview
  arPreview: (
    file: File,
    wrapDescription: string,
    opts?: { brandColors?: string; variants?: number; competitive?: boolean },
  ) => {
    const token = getToken();
    const form = new FormData();
    form.append('image', file);
    form.append('wrapDescription', wrapDescription);
    if (opts?.brandColors) form.append('brandColors', opts.brandColors);
    if (opts?.variants && opts.variants > 1) form.append('variants', String(opts.variants));
    if (opts?.competitive) form.append('competitive', '1');
    return fetch('/vision/ar-preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Preview failed');
      return data as { ok: boolean; image_url: string; image_urls?: string[]; original_url: string };
    });
  },
  // Push an AR concept to the lead's client portal → shareable approval link
  arConceptToPortal: (leadId: number | string, imageUrl: string, note?: string) =>
    authFetch<{ ok: boolean; portalUrl: string; token: string }>(
      `/leads/${leadId}/ar-concept`,
      { method: 'POST', body: JSON.stringify({ imageUrl, note }) },
    ),
  // Save an AR concept image to a job's photo gallery
  saveConceptToJob: (jobId: number, imageUrl: string, caption?: string) =>
    authFetch<{ ok: boolean; photo: JobPhoto }>(
      `/jobs/${jobId}/concept-photo`,
      { method: 'POST', body: JSON.stringify({ imageUrl, caption }) },
    ),
  // Generate a print-ready TIFF sized for an HP Latex wide-format printer
  printReadyFile: (params: {
    imageUrl: string;
    vehicleKey: string;
    sideKey: string;
    printerWidthInches: number;
    bleedInches: number;
  }): Promise<{ blob: Blob; widthIn: number; heightIn: number }> => {
    const token = getToken();
    return fetch('/vision/ar-print-ready', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).then(async (r) => {
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: 'Print file generation failed' }));
        throw new Error((d as { error?: string }).error || 'Print file generation failed');
      }
      const blob = await r.blob();
      const widthIn  = Number(r.headers.get('X-Print-Width-In')  || params.printerWidthInches);
      const heightIn = Number(r.headers.get('X-Print-Height-In') || 0);
      return { blob, widthIn, heightIn };
    });
  },

  // AI Design Generation
  generateDesignBrief: (params: { vehicleType: string; primaryColor: string; secondaryColor: string; style: string; description: string; companyName: string }) =>
    authFetch<{ ok: boolean; brief: DesignBrief }>('/ai/design-brief', { method: 'POST', body: JSON.stringify(params) }),
  generateMockup: (brief: DesignBrief) =>
    authFetch<MockupResult>('/ai/generate-mockup', { method: 'POST', body: JSON.stringify({ brief }) }),
  wrapConceptShare: (params: { leadId?: number | string; imageUrl: string; recipientEmail: string; recipientName?: string; subject?: string; note?: string }) =>
    authFetch<{ ok: boolean; trackToken: string }>('/ai/wrap-concept-share', { method: 'POST', body: JSON.stringify(params) }),

  // Fleet Management Integrations
  getSamsaraVehicles: () => authFetch<{ ok: boolean; vehicles: FleetVehicle[]; count: number }>('/integrations/samsara/vehicles'),
  importSamsaraVehicles: (vehicleIds?: string[]) =>
    authFetch<FleetImportResult>('/integrations/samsara/import', { method: 'POST', body: JSON.stringify({ vehicle_ids: vehicleIds }) }),
  getMotiveVehicles: () => authFetch<{ ok: boolean; vehicles: FleetVehicle[]; count: number }>('/integrations/motive/vehicles'),
  importMotiveVehicles: (vehicleIds?: string[]) =>
    authFetch<FleetImportResult>('/integrations/motive/import', { method: 'POST', body: JSON.stringify({ vehicle_ids: vehicleIds }) }),

  // Dynamic Wrap Content
  getContent: () => authFetch<{ content: WrapContent[] }>('/content'),
  uploadContent: (file: File, name: string, tags: string[]) => {
    const token = getToken();
    const form = new FormData();
    form.append('image', file);
    form.append('name', name);
    form.append('tags', JSON.stringify(tags));
    return fetch('/content', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Upload failed');
      return data as { ok: boolean; content: WrapContent };
    });
  },
  updateContent: (id: number, updates: Partial<WrapContent>) =>
    authFetch<{ ok: boolean; content: WrapContent }>(`/content/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteContent: (id: number) => authFetch<{ ok: boolean }>(`/content/${id}`, { method: 'DELETE' }),
  getSchedules: () => authFetch<{ schedules: ContentSchedule[] }>('/content/schedules'),
  createSchedule: (schedule: Partial<ContentSchedule>) =>
    authFetch<{ ok: boolean; schedule: ContentSchedule }>('/content/schedules', { method: 'POST', body: JSON.stringify(schedule) }),
  updateSchedule: (id: number, updates: Partial<ContentSchedule>) =>
    authFetch<{ ok: boolean; schedule: ContentSchedule }>(`/content/schedules/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteSchedule: (id: number) => authFetch<{ ok: boolean }>(`/content/schedules/${id}`, { method: 'DELETE' }),
  getActiveContent: () => authFetch<{ active: { vehicle_group: string; content: WrapContent }[] }>('/content/active'),
  exportSchedule: () => authFetch<object>('/content/export'),

  // E Ink Device Infrastructure
  getDevices: () => authFetch<{ devices: EinkDevice[] }>('/admin/devices'),
  getDeviceStatus: () => authFetch<{ total: number; online: number; offline: number; updating: number }>('/admin/devices/status'),
  registerDevice: (d: { name: string; serial_number?: string; vehicle_group: string; lead_id?: number; job_id?: number }) =>
    authFetch<{ ok: boolean; device: EinkDevice }>('/admin/devices', { method: 'POST', body: JSON.stringify(d) }),
  updateDevice: (id: number, patch: Partial<EinkDevice>) =>
    authFetch<{ ok: boolean; device: EinkDevice }>(`/admin/devices/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteDevice: (id: number) => authFetch<{ ok: boolean }>(`/admin/devices/${id}`, { method: 'DELETE' }),
  pushContentToDevice: (deviceId: number, contentId: number) =>
    authFetch<{ ok: boolean; push_log_id: number }>(`/admin/devices/${deviceId}/push`, { method: 'POST', body: JSON.stringify({ content_id: contentId }) }),
  getDevicePushLog: (deviceId: number) => authFetch<{ log: EinkPushLog[] }>(`/admin/devices/${deviceId}/log`),

  // Notifications
  getNotifications: () => authFetch<{ notifications: AppNotification[]; unread: number }>('/notifications'),
  markAllRead: () => authFetch<{ ok: boolean }>('/notifications/read-all', { method: 'PUT', body: '{}' }),
  markRead: (id: number) => authFetch<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'PUT', body: '{}' }),
  deleteNotification: (id: number) => authFetch<{ ok: boolean }>(`/notifications/${id}`, { method: 'DELETE' }),

  // Job Photos
  getJobPhotos: (jobId: number) => authFetch<{ photos: JobPhoto[] }>(`/jobs/${jobId}/photos`),
  uploadJobPhoto: (jobId: number, file: File, caption: string, photo_type: string) => {
    const token = getToken();
    const form = new FormData();
    form.append('image', file);
    form.append('caption', caption);
    form.append('photo_type', photo_type);
    return fetch(`/jobs/${jobId}/photos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Upload failed');
      return data as { ok: boolean; photo: JobPhoto };
    });
  },
  deleteJobPhoto: (photoId: number) => authFetch<{ ok: boolean }>(`/jobs/photos/${photoId}`, { method: 'DELETE' }),

  // Quote PDF (opens in new tab)
  openQuote: (bidId: number) => window.open(`/bids/${bidId}/quote?token=${getToken()}`, '_blank'),

  // Client Portal
  createPortalLink: (leadId: number) =>
    authFetch<{ ok: boolean; link: PortalLink }>('/portal-links', { method: 'POST', body: JSON.stringify({ lead_id: leadId }) }),
  getPortalLink: (leadId: number) =>
    authFetch<{ link: PortalLink | null }>(`/portal-links/lead/${leadId}`),
  deletePortalLink: (id: number) =>
    authFetch<{ ok: boolean }>(`/portal-links/${id}`, { method: 'DELETE' }),
  getPortalUrl: (token: string) => `${window.location.origin}/portal/${token}`,
  generateFleetDashboard: (leadId: number) =>
    authFetch<{ ok: boolean; url: string }>(`/portal-links/${leadId}/fleet-access`, { method: 'POST' }),

  // AI Calling — campaigns
  getCampaigns: () =>
    authFetch<{ campaigns: { id: string; name: string; eventDate: string; weeksUntil: number; leadCount: number; urgency: string }[] }>('/calls/campaigns'),
  launchCampaign: (id: string) =>
    authFetch<{ ok: boolean; total: number; queued: number; estimatedMinutes: number }>(`/calls/campaigns/${id}/launch`, { method: 'POST', body: '{}' }),

  // Proposals (shareable client HTML pages)
  createProposal: (leadId: number, extraNotes?: string, mockupUrl?: string, roiHtml?: string) =>
    authFetch<{ ok: boolean; proposal: { id: number; token: string; title: string; status: string; created_at: string } }>(`/leads/${leadId}/proposal`, { method: 'POST', body: JSON.stringify({ extra_notes: extraNotes || '', mockup_url: mockupUrl || null, roi_html: roiHtml || null }) }),
  getProposals: () => authFetch<{ proposals: { id: number; token: string; title: string; status: string; created_at: string; lead_company: string }[] }>('/proposals'),
  deleteProposal: (id: number) => authFetch<{ ok: boolean }>(`/proposals/${id}`, { method: 'DELETE' }),
  updateProposal: (id: number, data: { title?: string; intro?: string; services?: string; pricing_html?: string; timeline?: string; notes?: string; status?: string; expires_at?: string | null; pricing_options?: Array<{ label: string; description?: string; price: number; highlight?: boolean; features?: string[] }> | null }) =>
    authFetch<{ ok: boolean; proposal: Record<string, unknown>; savedVersion: number }>(`/proposals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getProposalVersions: (id: number) =>
    authFetch<{ ok: boolean; versions: Array<{ id: number; version_num: number; title: string; saved_at: string }> }>(`/proposals/${id}/versions`),
  getProposalVersion: (proposalId: number, versionId: number) =>
    authFetch<{ ok: boolean; version: Record<string, unknown> }>(`/proposals/${proposalId}/versions/${versionId}`),
  getProposalUrl: (token: string) => `${window.location.origin}/proposals/${token}`,

  // Proposal template library
  getProposalTemplates: () =>
    authFetch<{ ok: boolean; templates: Array<{ id: number; name: string; category: string | null; intro: string | null; services: string | null; pricing_html: string | null; timeline: string | null; notes: string | null; use_count: number; created_at: string }> }>('/proposals/templates'),
  saveProposalAsTemplate: (proposalId: number, name: string, category?: string) =>
    authFetch<{ ok: boolean; template: { id: number; name: string; category: string | null; created_at: string } }>(`/proposals/${proposalId}/save-as-template`, { method: 'POST', body: JSON.stringify({ name, category }) }),
  deleteProposalTemplate: (id: number) =>
    authFetch<{ ok: boolean }>(`/proposals/templates/${id}`, { method: 'DELETE' }),
  createProposalFromTemplate: (leadId: number, templateId: number) =>
    authFetch<{ ok: boolean; proposal: { id: number; token: string; title: string; status: string; created_at: string } }>('/proposals/from-template', { method: 'POST', body: JSON.stringify({ lead_id: leadId, template_id: templateId }) }),
  getMyQuoteLink: () => authFetch<{ token: string; url: string }>('/me/quote-link'),
  getMyWebhookUrl: () => authFetch<{ url: string }>('/me/webhook-url'),
  getProposalViewCount: (id: number) => authFetch<{ view_count: number; last_viewed_ago: string | null }>(`/proposals/${id}/views`),

  // Proposals needing follow-up (sent 3+ days ago, no response)
  getProposalsNeedingFollowup: () =>
    authFetch<{
      ok: boolean;
      proposals: Array<{
        id: number; token: string; title: string; status: string;
        viewCount: number; createdAt: string; lastViewedAt: string | null;
        daysSinceSent: number; daysSinceView: number | null;
        lead: { id: number; company: string; contactName: string | null; email: string | null; status: string; category: string } | null;
      }>;
    }>('/proposals/needs-followup'),

  generateProposalFollowup: (proposalId: number) =>
    authFetch<{ ok: boolean; subject: string; body: string; contact: string | null; company: string | null; fallback?: boolean }>(
      `/proposals/${proposalId}/generate-followup`, { method: 'POST', body: '{}' }
    ),

  // Proposal Heat — ranked list of proposals with active engagement
  getProposalHeat: () => authFetch<{ count: number; hot: Array<{
    id: number; title: string; token: string; viewCount: number;
    lastViewedAt: string; hoursSinceView: number; heatScore: number;
    tier: 'blazing' | 'hot' | 'warm' | 'cool';
    lead: { id: number; clientId: string; company: string; status: string; category: string; fleetSize: string | null; email: string | null } | null;
  }> }>('/proposals/heat'),

  // Perfect Timing — leads who opened emails recently
  getPerfectTiming: (hours?: number) => authFetch<{
    windowHours: number;
    leads: Array<{
      leadId: number; clientId: string; company: string; subject: string | null;
      openCount: number; openedAt: string; hoursAgo: number;
      status: string; category: string; email: string | null; phone: string | null;
    }>;
  }>(`/mission/perfect-timing${hours ? `?hours=${hours}` : ''}`),

  // Email Permutator — find candidate emails from name + domain
  findEmail: (leadId: number, opts?: { name?: string; domain?: string; probe?: boolean }) =>
    authFetch<{
      lead: { id: number; company: string; contactName: string };
      domain: string;
      name: string;
      mx: { ok: boolean; provider?: string; records?: Array<{ exchange: string; priority: number }>; error?: string } | null;
      candidates: Array<{ email: string; confidence: number; format: string; smtp?: string }>;
      error?: string;
    }>(`/leads/${leadId}/find-email`, { method: 'POST', body: JSON.stringify(opts || {}) }),

  bulkFindEmails: (leadIds?: number[]) =>
    authFetch<{
      ok: boolean; processed: number; found: number;
      results: Array<{ leadId: number; company: string; email?: string; found: boolean; confidence?: number; error?: boolean }>;
    }>('/leads/bulk-find-emails', { method: 'POST', body: JSON.stringify({ leadIds: leadIds ?? [] }) }),

  suggestAction: (leadId: number) =>
    authFetch<{ ok: boolean; suggestion: { action: string; channel: string; urgency: string; reasoning: string } }>(`/leads/${leadId}/suggest`, { method: 'POST', body: '{}' }),
  generateSocialPost: (jobData: { company: string; vehicle_type: string; vehicle_count: number; wrap_category: string; material?: string; notes?: string }) =>
    authFetch<{ ok: boolean; posts: { instagram: string; linkedin: string } }>('/ai/social-post', { method: 'POST', body: JSON.stringify(jobData) }),
  getMyPortfolioLink: () =>
    authFetch<{ token: string; url: string }>('/me/quote-link').then((r) => ({
      ...r,
      url: `/portfolio/${r.token}`,
    })),

  // Bulk lead update
  bulkUpdateLeads: (leadIds: number[], patch: { status?: string; category?: string }) =>
    authFetch<{ ok: boolean; updated: number }>('/leads/bulk-update', { method: 'POST', body: JSON.stringify({ lead_ids: leadIds, patch }) }),
  bulkTagLeads: (leadIds: number[], tag: string, action: 'add' | 'remove' = 'add') =>
    authFetch<{ ok: boolean; updated: number }>('/leads/bulk-tag', { method: 'POST', body: JSON.stringify({ lead_ids: leadIds, tag, action }) }),

  // Analytics Dashboard
  getAnalytics: () => authFetch<{
    summary: { totalLeads: number; won: number; lost: number; winRate: number | null; avgDaysToClose: number | null; pipelineValue: number };
    byStatus: Record<string, number>;
    wonTrend: { month: string; won: number; revenue: number }[];
    byCategory: { category: string; total: number; won: number; lost: number }[];
    activity30d: { emails: number; calls: number; meetings: number; sequences: number };
    winLossFactors: { factor: string; count: number }[];
    competitors: { competitor: string; count: number }[];
    topLeads: { id: number; company: string; status: string; category: string; fleet_size: string; city: string; state: string }[];
    jobs: { total_jobs: number; total_vehicles: number; aging_90d: number };
    topCustomers: { company: string; won_deals: number; jobs: number; total_vehicles: number; estimated_clv: number }[];
    emailPerf: { opens7d: number; totalTracked: number; openRatePct: number; leadsOpened: number };
    quoteRevenue: { totalQuotes: number; acceptedCount: number; acceptedValue: number; sentCount: number; sentValue: number; draftCount: number; pipelineValue: number };
    velocity: { stage: string; avg_days: number; sample: number }[];
    byState: { state: string; count: number }[];
    referrals: { referred_by: string; referrals: number; won: number; active: number }[];
    atRisk: { id: number; company: string; status: string; category: string; fleetSize: string; daysStale: number }[];
    activityCalendar: { day: string; count: number }[];
  }>('/analytics'),

  // Won deal history for trend chart drill-down
  getWonHistory: () => authFetch<{
    ok: boolean;
    deals: { id: number; company: string; category: string; city: string | null; state: string | null; month: string; revenue: number }[];
  }>('/analytics/won-history'),

  // AI Mission Brief
  getMissionBrief: () => authFetch<{ brief: string | null; reason?: string }>('/mission/brief'),

  // AI Call Script
  generateCallScript: (leadId: number) =>
    authFetch<{
      ok: boolean;
      script: {
        opening: string;
        pitch: string;
        objections: { q: string; a: string }[];
        close: string;
      };
    }>('/ai/call-script', { method: 'POST', body: JSON.stringify({ leadId }) }),

  getFollowUpRecommendation: (leadId: number) =>
    authFetch<{
      ok: boolean;
      slots: { dow: number; hour: number; hits: number; label: string }[];
      summary: string;
      dataSource: 'historical' | 'default';
      lead: { id: number; company: string };
    }>(`/leads/${leadId}/followup-recommendation`),

  getEmailEngagement: (leadId: number) =>
    authFetch<{
      ok: boolean;
      emails: {
        token: string;
        subject: string;
        open_count: number;
        opened_at: string | null;
        created_at: string;
      }[];
    }>(`/leads/${leadId}/email-engagement`),

  getNotesSummary: (leadId: number) =>
    authFetch<{ ok: boolean; summary: string }>(`/leads/${leadId}/notes-summary`, { method: 'POST' }),

  suggestLead: (company: string) =>
    authFetch<{
      ok: boolean;
      suggestion: {
        category: string;
        fleetRange: string;
        pitchAngle: string;
        confidence: 'high' | 'medium' | 'low';
      };
    }>('/ai/suggest-lead', { method: 'POST', body: JSON.stringify({ company }) }),

  getCounterStrategy: (competitor: string) =>
    authFetch<{
      ok: boolean;
      competitor: string;
      lossCount: number;
      card: {
        theirStrengths: string[];
        ourAdvantages: string[];
        talkTrack: string[];
        closingMove: string;
      };
    }>('/ai/counter-strategy', { method: 'POST', body: JSON.stringify({ competitor }) }),

  analyzeCompetitorPhoto: (file: File) => {
    const token = getToken();
    const fd = new FormData();
    fd.append('photo', file);
    return fetch('/ai/analyze-competitor-photo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Analysis failed');
      return data as {
        ok: boolean;
        analysis: {
          visualObservations: string[];
          competitorStrengths: string[];
          competitorWeaknesses: string[];
          counterPitch: string;
          keySellingPoints: string[];
          estimatedQuality: 'budget' | 'mid-range' | 'premium';
        };
      };
    });
  },

  // Win/Loss capture
  captureWinLoss: (leadId: number, factor: string, notes: string, competitor?: string, competitorPrice?: number) =>
    authFetch<{ ok: boolean }>(`/leads/${leadId}/win-loss`, { method: 'POST', body: JSON.stringify({ factor, notes, competitor, competitorPrice }) }),

  // SMS outreach
  sendSms: (leadId: number, message: string) =>
    authFetch<{ ok: boolean; sid?: string }>(`/leads/${leadId}/sms`, { method: 'POST', body: JSON.stringify({ message }) }),

  // SMS campaign sequences
  getSmsInbox: () =>
    authFetch<{ ok: boolean; messages: Array<{
      id: number; lead_id: number; body: string; created_at: string;
      company: string; phone: string | null; contact_name: string | null; sms_opted_out: boolean;
    }> }>('/mission/sms-inbox'),

  getSmsSequence: (leadId: number) =>
    authFetch<{ ok: boolean; sequence: import('./types').SmsSequence | null }>(`/leads/${leadId}/sms-sequence`),
  startSmsSequence: (leadId: number) =>
    authFetch<{ ok: boolean; sequenceId: number; steps: import('./types').SmsSequenceStep[] }>(`/leads/${leadId}/sms-sequence`, { method: 'POST' }),
  cancelSmsSequence: (leadId: number) =>
    authFetch<{ ok: boolean }>(`/leads/${leadId}/sms-sequence`, { method: 'DELETE' }),
  getSmsTemplates: (leadId: number) =>
    authFetch<{ ok: boolean; category: string; templates: Array<{ stepNum: number; dayOffset: number; message: string }> }>(`/leads/${leadId}/sms-templates`),

  // Omni (multi-channel) sequences
  getOmniTemplates: (leadId: number) =>
    authFetch<{ ok: boolean; category: string; hasEmail: boolean; hasPhone: boolean; steps: import('./types').OmniTemplateStep[] }>(`/leads/${leadId}/omni-templates`),
  startOmniSequence: (leadId: number) =>
    authFetch<{ ok: boolean; sequenceId: number; steps: import('./types').OmniSequenceStep[] }>(`/leads/${leadId}/omni-sequence`, { method: 'POST' }),
  getOmniSequence: (leadId: number) =>
    authFetch<{ ok: boolean; sequence: import('./types').OmniSequence | null }>(`/leads/${leadId}/omni-sequence`),
  cancelOmniSequence: (leadId: number) =>
    authFetch<{ ok: boolean }>(`/leads/${leadId}/omni-sequence`, { method: 'DELETE' }),
  enrichFmcsa: (leadId: number, dotNumber?: string) =>
    authFetch<{
      ok: boolean; patched: boolean;
      phone: string | null; safetyRating: string | null;
      operatingStatus: string | null; entityType: string | null;
      legalName: string | null; dotNumber: string;
    }>(`/leads/${leadId}/enrich-fmcsa`, {
      method: 'POST',
      body: dotNumber ? JSON.stringify({ dotNumber }) : '{}',
    }),

  // Bid tracker
  getBids: () => authFetch<{ bids: Bid[] }>('/bids'),
  getBidSummary: () => authFetch<BidSummary>('/bids/summary'),
  getBidIntel: () => authFetch<{
    ok: boolean;
    funnel: { stage: string; count: number; value: number }[];
    winRate: number | null;
    shortlistToWin: number | null;
    platforms: { platform: string; total: number; won: number; lost: number; winRate: number | null; avgWonValue: number }[];
    valueBuckets: { bucket: string; total: number; won: number }[];
  }>('/bids/intel'),
  getGCDirectory: () =>
    authFetch<{
      ok: boolean;
      gcs: {
        gc_name: string; total_bids: number; won_bids: number; lost_bids: number;
        active_bids: number; won_value: number; total_value: number;
        last_bid_at: string; last_won_at: string | null;
      }[];
    }>('/bids/gc-directory'),
  createBid: (bid: Partial<Bid>) =>
    authFetch<{ bid: Bid }>('/bids', { method: 'POST', body: JSON.stringify(bid) }),
  updateBid: (id: number, updates: Partial<Bid>) =>
    authFetch<{ bid: Bid }>(`/bids/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteBid: (id: number) =>
    authFetch<{ ok: boolean }>(`/bids/${id}`, { method: 'DELETE' }),
  cloneBid: (id: number) =>
    authFetch<{ bid: Bid }>(`/bids/${id}/clone`, { method: 'POST' }),

  getBidCalendarUrl: () => {
    const token = getToken();
    return `/bids/calendar.ics?token=${encodeURIComponent(token || '')}`;
  },

  getFollowupIcalUrl: () => {
    const token = getToken();
    return `/leads/followups.ics?token=${encodeURIComponent(token || '')}`;
  },

  broadcastEmail: (leadIds: number[], subject: string, body: string, aiPersonalize?: boolean) =>
    authFetch<{ ok: boolean; sent: number; skipped: number; errors: number }>(
      '/leads/broadcast',
      { method: 'POST', body: JSON.stringify({ leadIds, subject, body, aiPersonalize }) }
    ),

  previewAIBroadcast: (leadIds: number[], subject: string, body: string) =>
    authFetch<{
      ok: boolean;
      totalLeads: number;
      previews: Array<{
        leadId: number; company: string; contactName: string | null;
        email: string | null; aiOpener: string; fullBody: string;
      }>;
    }>('/leads/broadcast/preview-ai', { method: 'POST', body: JSON.stringify({ leadIds, subject, body }) }),

  getNewsSignals: () =>
    authFetch<{
      ok: boolean;
      signals: Array<{
        id: number; name: string;
        notes: { url: string; headline: string; published: string; category?: string } | null;
        createdAt: string;
      }>;
    }>('/mission/news-signals'),
  getMissionSignals: () =>
    authFetch<{ signals: Array<{ type: string; title: string; company: string; lead_id: number; ts: string }> }>('/mission/signals'),

  getImpact: () =>
    authFetch<{
      ok: boolean;
      emailsGenerated: number; sequencesActivated: number; emailsSent: number;
      wonCount: number; wonRevenue: number; hoursSaved: number; apolloEnriched: number;
    }>('/analytics/impact'),

  getRetentionRadar: () =>
    authFetch<{
      ok: boolean;
      clients: {
        job_id: number; company: string; vehicle_type: string; vehicle_count: number;
        wrap_category: string; material: string | null; install_date: string;
        life_years: number; notes: string | null; age_pct: number; days_installed: number;
        lead_id: number | null; lead_status: string | null;
        email: string | null; phone: string | null; days_since_contact: number | null;
      }[];
    }>('/mission/retention-radar'),

  getTodayScore: () =>
    authFetch<{ score: number; calls: number; emails: number; advances: number; wins: number; notes: number; date: string }>('/mission/today-score'),

  // Business card scanner
  scanBusinessCard: (file: File) => {
    const token = getToken();
    const form = new FormData();
    form.append('image', file);
    return fetch('/vision/scan-card', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Card scan failed');
      return data as { ok: boolean; lead: Partial<import('./types').Lead> };
    });
  },

  scanTruck: (file: File) => {
    const token = getToken();
    const form = new FormData();
    form.append('image', file);
    return fetch('/vision/scan-truck', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Scan failed');
      return data as {
        ok: boolean;
        extracted: {
          companyName: string | null;
          dotNumber: string | null;
          mcNumber: string | null;
          phone: string | null;
          city: string | null;
          state: string | null;
          vehicleType: string;
          fleetIndicators: string | null;
          confidence: 'high' | 'medium' | 'low';
          notes: string | null;
        };
        matches: Array<{
          id: number; dot_number: string | null; name: string;
          city: string | null; state: string | null; fleet_size: number | null;
          phone: string | null; email: string | null; already_imported: boolean;
        }>;
      };
    });
  },

  // AI pipeline narrative
  generatePipelineNarrative: () =>
    authFetch<{ ok: boolean; narrative: string }>('/ai/pipeline-narrative', { method: 'POST', body: '{}' }),

  getWinPatterns: () =>
    authFetch<{ ok: boolean; patterns: string; chips: { label: string; color: string }[] }>('/ai/win-patterns', { method: 'POST', body: '{}' }),

  // Market penetration analysis (FMCSA white-space vs. current pipeline)
  getMarketOpportunity: () =>
    authFetch<{
      ok: boolean;
      opportunities: {
        state: string;
        lead_count: number;
        won_count: number;
        active_count: number;
        total_carriers: number;
        target_carriers: number;
        penetration_pct: number | null;
        untapped_count: number;
      }[];
      totalUntapped: number;
    }>('/analytics/market-opportunity'),

  // Speed to Lead
  getSpeedToLead: () =>
    authFetch<{
      ok: boolean;
      avgHours: number | null;
      medianHours: number | null;
      contactedCount: number;
      within5min: number;
      within1hour: number;
      within24hours: number;
      waitingLeads: Array<{ id: number; company: string; category: string; createdAt: string; hoursWaiting: number }>;
    }>('/analytics/speed-to-lead'),

  // Revenue Attribution
  getRevenueAttribution: () => authFetch<{
    bySource: Array<{ source: string; won_count: number; estimated_revenue: number; avg_close_days: number | null; sharePct: number }>;
    byCategory: Array<{ category: string; total: number; won: number; estimated_revenue: number | null; avg_close_days: number | null; closeRate: number }>;
    velocity: Array<{ category: string; avg_days: number; sample: number }>;
    totalWonRevenue: number;
  }>('/analytics/revenue-attribution'),

  // Duplicate detection
  checkDuplicate: (q: string) =>
    authFetch<{ matches: Array<{ id: number; company: string; status: string; city: string; state: string }> }>(`/leads/check-duplicate?q=${encodeURIComponent(q)}`),

  // Ideal Customer Profile
  getICP: () =>
    authFetch<{
      ok: boolean;
      hasData: boolean;
      wonCount: number;
      topCategory: string | null;
      topState: string | null;
      medianFleetSize: number | null;
      fleetRange: { min: number; max: number } | null;
      categoryBreakdown: { cat: string; count: number; pct: number }[];
    }>('/analytics/icp'),

  // Win-rate matrix: category × state heatmap + revenue trend
  getWinMatrix: () =>
    authFetch<{
      ok: boolean;
      topStates: string[];
      categories: string[];
      matrix: Record<string, Record<string, { total: number; won: number; lost: number; winRate: number }>>;
      revTrend: { month: string; revenue: number }[];
      catRates: { category: string; total: number; won: number; winRate: number }[];
    }>('/analytics/win-matrix'),

  // Pipeline velocity analytics
  getPipelineVelocity: () =>
    authFetch<{
      ok: boolean;
      velocity: { stage: string; avgDays: number | null; medianDays: number | null; sampleSize: number }[];
      bottleneck: string | null;
      totalAvgCycleDays: number;
      activeWithPrediction: { id: number; company: string; status: string; predictedClose: string; daysToClose: number }[];
    }>('/analytics/pipeline-velocity'),

  // Hot email opens leaderboard
  getHotOpens: () =>
    authFetch<{
      ok: boolean;
      prospects: {
        id: number; company: string; status: string; category: string;
        email: string | null; total_opens: number;
        last_opened: string | null; last_subject: string | null;
      }[];
    }>('/analytics/hot-opens'),

  // Sequence performance analytics
  getSequencePerformance: () =>
    authFetch<{
      ok: boolean;
      tones: { tone: string; sent: number; progressed: number; won: number; progressRate: number }[];
      byDow: { dow: number; sent: number; progressed: number; progressRate: number }[];
      byStep: { day: number; sent: number; opened: number; openRate: number }[];
    }>('/analytics/sequence-performance'),

  // Global activity feed
  getActivityFeed: (limit?: number) =>
    authFetch<{
      ok: boolean;
      events: {
        id: number;
        type: string;
        subject: string | null;
        body: string | null;
        created_at: string;
        lead_id: number;
        company: string;
        category: string;
        status: string;
      }[];
    }>(`/activity/feed${limit ? `?limit=${limit}` : ''}`),

  // Onboarding
  getOnboardingStatus: () =>
    authFetch<{
      ok: boolean;
      steps: { id: string; done: boolean; title: string; hint: string }[];
      completed: number;
      total: number;
    }>('/onboarding/status'),

  // Quote / Invoice Builder
  getLeadQuotes: (leadId: number) =>
    authFetch<{ quotes: import('./types').ShopQuote[] }>(`/leads/${leadId}/quotes`),
  createQuote: (leadId: number, data: object) =>
    authFetch<{ ok: boolean; quote: import('./types').ShopQuote }>(`/leads/${leadId}/quotes`, { method: 'POST', body: JSON.stringify(data) }),
  updateQuote: (id: number, data: object) =>
    authFetch<{ ok: boolean; quote: import('./types').ShopQuote }>(`/quotes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteQuote: (id: number) =>
    authFetch<{ ok: boolean }>(`/quotes/${id}`, { method: 'DELETE' }),
  convertQuoteToJob: (quoteId: number) =>
    authFetch<{ ok: boolean; job: import('./types').InstalledJob; leadId: number }>(`/quotes/${quoteId}/convert-to-job`, { method: 'POST' }),

  // Market White Space Map
  getMarketMap: () =>
    authFetch<{
      byState: Record<string, { won: number; pipeline: number; carriers: number }>;
      totalCarriers: number;
      topOpportunityStates: string[];
    }>('/analytics/market-map'),

  // Lead Cohort Analysis
  getCohortAnalysis: () =>
    authFetch<{
      cohorts: Array<{
        month: string; total: number; won: number; lost: number;
        wonIn90d: number; winRate: number; win90dRate: number; avgCloseDays: number | null;
      }>;
      trend: 'improving' | 'declining' | 'stable';
      recentRate: number | null;
      priorRate: number | null;
    }>('/analytics/cohort'),

  getTimeToClose: () =>
    authFetch<{
      byCategory: Array<{
        category: string; wonCount: number; avgDays: number; medianDays: number;
        minDays: number; maxDays: number; debriefAvgDays: number | null; avgTouches: number | null;
      }>;
      overallAvgDays: number | null;
      overallMedianDays: number | null;
      totalWon: number;
    }>('/analytics/time-to-close'),

  // Lost Lead Rescue Queue
  getRescueQueue: () =>
    authFetch<{
      queued: Array<{ id: number; company: string; category: string; state: string; email: string; lost_at: string; send_at: string; subject: string }>;
      candidates: Array<{ id: number; company: string; category: string; state: string; email: string; lost_at: string; days_lost: number }>;
      total: number;
    }>('/mission/rescue-queue'),

  triggerRescue: (leadIds: number[]) =>
    authFetch<{ ok: boolean; queued: number }>('/mission/rescue-queue/trigger', {
      method: 'POST',
      body: JSON.stringify({ lead_ids: leadIds }),
    }),

  // Similar won deals — social proof for cold outreach on a specific lead
  getSimilarWins: (leadId: number) =>
    authFetch<{
      wins: Array<{ id: number; company: string; category: string; state: string; city: string | null; fleet_size: string | null; relevance_score: number; won_at: string }>;
      jobs: Array<{ id: number; company: string; vehicle_count: number; vehicle_type: string; wrap_category: string; install_date: string; state: string | null; city: string | null }>;
      leadCategory: string;
      leadState: string;
    }>(`/leads/${leadId}/similar-wins`),

  // Client Satisfaction — review ratings + NPS
  getSatisfaction: () =>
    authFetch<{
      ok: boolean;
      totals: { sentCount: number; ratedCount: number; avgRating: number | null; positiveCount: number; negativeCount: number; fiveStarCount: number; responseRate: number };
      recent: Array<{ id: number; company: string | null; starRating: number; feedbackText: string | null; feedbackAt: string | null; category: string | null; vehicleType: string | null; vehicleCount: number | null }>;
    }>('/analytics/satisfaction'),

  // Lead Database Coverage — record counts by source and state
  getLeadCoverage: () =>
    authFetch<{
      ok: boolean;
      grandTotal: number;
      sources: Array<{ source: string; total: number; lastUpdated: string | null; stateCount: number }>;
      states: Array<{ state: string; total: number; sources: number; fmcsa: number; sos: number; places: number; sam: number; signal: number }>;
      recentRuns: Array<{ source: string; fileName: string; startedAt: string; finishedAt: string | null; rowsRead: number | null; inserted: number | null; updated: number | null; skipped: number | null; notes: string | null }>;
    }>('/analytics/lead-coverage'),

  // Job Profitability — per-job P&L including sub labor
  getJobProfitability: (opts: { sort?: 'profit' | 'margin' | 'revenue' | 'install_date'; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (opts.sort) qs.set('sort', opts.sort);
    if (opts.limit) qs.set('limit', String(opts.limit));
    return authFetch<{
      jobs: Array<{
        id: number; company: string; vehicleType: string | null; vehicleCount: number | null;
        category: string | null; installDate: string | null; material: string | null;
        paymentStatus: string | null; revenue: number; materialCost: number; subLabor: number;
        netProfit: number; marginPct: number | null; amountPaid: number;
      }>;
      totals: { totalRevenue: number; totalMaterial: number; totalSubLabor: number; totalProfit: number; avgMargin: number | null; jobCount: number };
    }>('/analytics/job-profitability?' + qs.toString());
  },

  // 1099 Subcontractor Summary
  get1099Summary: (year?: number) =>
    authFetch<{
      ok: boolean; year: number; totalPaid: number; needs1099Count: number;
      subs: Array<{
        id: number; name: string; email?: string | null; tax_id?: string | null;
        business_type?: string | null; specialty?: string | null; address?: string | null;
        assignment_count: number; total_paid: number; confirmed_paid: number; outstanding: number;
      }>;
    }>(`/analytics/1099-summary${year ? `?year=${year}` : ''}`),

  // Material Margin Analytics
  getMarginAnalytics: () =>
    authFetch<{
      byCategory: Array<{
        wrap_category: string; job_count: number; total_vehicles: number;
        avg_revenue: number; avg_material: number; avg_margin_pct: number | null;
        avg_revenue_per_vehicle: number; avg_material_per_vehicle: number;
        total_gross_profit: number; last_job_date: string;
      }>;
      totals: {
        job_count: number; total_revenue: number; total_material: number;
        total_gross_profit: number; avg_margin_pct: number | null;
        jobs_with_labor: number; total_labor_hours: number; avg_revenue_per_hour: number | null;
      } | null;
      bestMarginJobs: Array<{ company: string; wrap_category: string; job_revenue: number; material_cost: number; vehicle_count: number; install_date: string; margin_pct: number }>;
      worstMarginJobs: Array<{ company: string; wrap_category: string; job_revenue: number; material_cost: number; vehicle_count: number; install_date: string; margin_pct: number }>;
      hasData: boolean;
    }>('/analytics/margin'),

  // Proposal pipeline analytics
  getProposalAnalytics: () =>
    authFetch<{
      ok: boolean; total: number;
      byStatus: { draft: number; sent: number; approved: number; declined: number; expired: number };
      closeRate: number | null;
      avgHoursToSend: number | null;
      avgDaysToApprove: number | null;
      avgViewsApproved: number | null;
      avgViewsDeclined: number | null;
      topViewed: Array<{ id: number; title: string; status: string; viewCount: number; sentAt: string | null; company: string | null }>;
    }>('/analytics/proposals'),

  // Email template performance analytics
  getEmailTemplateAnalytics: () =>
    authFetch<{
      templates: Array<{
        id: number; label: string; tag: string | null;
        useCount: number; sends: number; opens: number;
        openRate: number; avgOpensPerOpener: number | null; lastOpenAt: string | null;
      }>;
    }>('/analytics/email-templates'),

  // CAN-SPAM unsubscribe status for a lead's email
  getUnsubscribeStatus: (leadId: number) =>
    authFetch<{ unsubscribed: boolean; email: string | null; unsubscribed_at: string | null }>(
      `/leads/${leadId}/unsubscribe-status`
    ),

  // Suppression list management
  getUnsubscribes: () =>
    authFetch<{ unsubscribes: Array<{ id: number; email: string; unsubscribed_at: string; company: string | null; lead_id: number | null }> }>('/settings/unsubscribes'),
  addUnsubscribe: (email: string) =>
    authFetch<{ ok: boolean }>('/settings/unsubscribes', { method: 'POST', body: JSON.stringify({ email }) }),
  removeUnsubscribe: (id: number) =>
    authFetch<{ ok: boolean }>(`/settings/unsubscribes/${id}`, { method: 'DELETE' }),

  // Shareable ROI calculator link pre-filled with prospect data
  getOrCreateRoiLink: (leadId: number) =>
    authFetch<{ ok: boolean; link: { token: string; view_count: number; last_viewed: string | null } }>(
      `/leads/${leadId}/roi-link`,
      { method: 'POST' }
    ),

  // Multi-location expansion — AI suggests other terminals/branches for large fleet won deals
  suggestLocations: (leadId: number) =>
    authFetch<{
      ok: boolean;
      suggestions: Array<{ company: string; city: string; state: string; fleet_size: number | null; reasoning: string }>;
      sourceCompany: string;
      sourceState: string | null;
    }>(`/leads/${leadId}/suggest-locations`, { method: 'POST' }),

  createLocationLead: (sourceLeadId: number, data: { company: string; city: string; state: string; fleet_size: number | null; category?: string }) =>
    authFetch<{ ok: boolean; leadId: number; clientId: string }>(
      `/leads/${sourceLeadId}/create-location`,
      { method: 'POST', body: JSON.stringify(data) }
    ),

  // Referral Engine — top 5 won clients that haven't been asked for a referral yet
  getReferralOpportunities: () =>
    authFetch<{
      ok: boolean;
      leads: Array<{
        leadId: number;
        company: string;
        category: string;
        contactName: string | null;
        email: string | null;
        wonAt: string;
        estValue: number;
        vehicleCount: number;
      }>;
    }>('/mission/referral-opportunities'),

  // AI referral ask — generate personalized email requesting referrals from won client
  generateReferralAsk: (leadId: number) =>
    authFetch<{ ok: boolean; subject: string; body: string; contactName: string | null }>(
      `/leads/${leadId}/referral-ask`,
      { method: 'POST' }
    ),

  getObjections: () =>
    authFetch<{
      ok: boolean;
      objections: Array<{
        activityId: number;
        leadId: number;
        company: string;
        category: string;
        contactName: string | null;
        email: string | null;
        status: string;
        intent: 'negative' | 'not_now' | 'price_question';
        summary: string | null;
        body: string | null;
        receivedAt: string;
      }>;
    }>('/mission/objections'),

  counterObjection: (leadId: number, intent: string, objectionText?: string) =>
    authFetch<{
      ok: boolean; fallback: boolean;
      subject: string; body: string; tip: string | null;
    }>(`/leads/${leadId}/counter-objection`, {
      method: 'POST',
      body: JSON.stringify({ intent, objectionText }),
    }),

  // AI-powered quick lead import from any URL
  importFromUrl: (url: string) =>
    authFetch<{
      ok: boolean;
      domain: string;
      url: string;
      lead: {
        company: string; contactName: string | null; contactTitle: string | null;
        email: string | null; phone: string | null; city: string | null; state: string | null;
        website: string; fleetSize: string | null; industry: string | null;
        category: string; pitchAngle: string | null; confidence: 'high' | 'medium' | 'low';
      };
    }>('/ai/import-from-url', { method: 'POST', body: JSON.stringify({ url }) }),

  // Detailed referral pipeline analytics
  getReferralAnalytics: () =>
    authFetch<{
      referrers: Array<{
        referred_by: string; referrals: number; won: number; active: number; lost: number;
        won_revenue: number; pipeline_value: number; closeRate: number; last_referral_at: string;
      }>;
      recent: Array<{ company: string; status: string; referred_by: string; category: string; created_at: string }>;
      referralCloseRate: number | null;
      organicCloseRate: number | null;
      totalReferredRevenue: number;
      totalPipelineValue: number;
      hasData: boolean;
    }>('/analytics/referrals'),

  // Loss Analysis — breakdown of why deals are lost and who we lost them to
  getLossAnalysis: () =>
    authFetch<{
      totalLost: number;
      byReason: Array<{ reason: string; count: number; avg_days_in_pipeline: number | null; categories: string[] }>;
      byCompetitor: Array<{ competitor: string; losses: number; categories: string[] }>;
      trend: Array<{ month: string; losses: number; recoverable: number }>;
      recoverableLeads: Array<{ id: number; company: string; category: string; lost_reason: string; lost_competitor: string | null; lost_at: string; contact_name: string | null; email: string }>;
    }>('/analytics/loss-analysis'),

  generateWinBackEmail: (leadId: number) =>
    authFetch<{ ok: boolean; subject: string; body: string }>(`/leads/${leadId}/win-back-email`, { method: 'POST' }),

  logWinLoss: (leadId: number, data: { factor: string; competitor?: string; notes?: string }) =>
    authFetch<{ ok: boolean }>(`/leads/${leadId}/win-loss`, { method: 'POST', body: JSON.stringify(data) }),

  getSeasonalIntelligence: () =>
    authFetch<{
      ok: boolean;
      currentMonth: number;
      currentMonthName: string;
      topSeasonCategory: string | null;
      seasonWins: number;
      hotPipelineLeads: Array<{ id: number; company: string; category: string; status: string; followup_due_at: string | null; fleet_size: string | null }>;
      series: Array<{ month: number; wins: number; topCat: string | null }>;
    }>('/analytics/seasonal'),

  getEmailTiming: () =>
    authFetch<{
      ok: boolean;
      byHour: Array<{ hour: number; opens: number }>;
      byDow: Array<{ dow: number; label: string; opens: number }>;
      bestHours: Array<{ hour: number; label: string; opens: number }>;
      bestDow: { dow: number; label: string; opens: number } | null;
      totalOpens: number;
      activeReaders: Array<{ leadId: number; company: string; status: string; openedAt: string; hoursAgo: number }>;
    }>('/analytics/email-timing'),

  generateLeadBrief: (leadId: number) =>
    authFetch<{ ok: boolean; brief: string }>('/ai/lead-brief', { method: 'POST', body: JSON.stringify({ leadId }) }),

  getRevenueForecast: () =>
    authFetch<{
      ok: boolean;
      projections: Array<{
        month: number;
        label: string;
        expected: number;
        low: number;
        high: number;
        leads: Array<{ id: number; company: string; status: string; category: string; winRate: number }>;
      }>;
      monthlyGoal: number;
      winRates: Record<string, number>;
      hasHistory: boolean;
      pipelineTotal: number;
    }>('/analytics/revenue-forecast'),

  getWarmReferences: (leadId: number) =>
    authFetch<{
      references: Array<{
        id: number;
        company: string;
        category: string;
        state: string;
        city: string;
        job_revenue: number | null;
        days_ago: number;
      }>;
      targetState: string;
      targetCategory: string;
    }>(`/leads/${leadId}/warm-references`),

  getPipelineDoctor: () =>
    authFetch<{
      rates: Record<string, number>;
      stageCounts: Array<{ status: string; count: number; avg_days: number }>;
      wonTotal: number;
      lostTotal: number;
      totalLeads: number;
      avgDaysToClose: number;
      worstBottleneck: { stage: string; rate: number; key: string } | null;
      diagnosis: string;
      recommendations: string[];
      healthGrade: string;
    }>('/analytics/pipeline-doctor'),

  getTerritoryIntel: () =>
    authFetch<{
      territories: Array<{
        state: string;
        total_carriers: number;
        sweet_spot: number;
        avg_fleet_size: number;
        in_pipeline: number;
        penetration_pct: number;
        untouched: number;
        has_won: boolean;
        opportunity_score: number;
      }>;
    }>('/analytics/territory-intel'),

  getReferralAsk: (leadId: number) =>
    authFetch<{ ok: boolean; subject: string; body: string }>(`/leads/${leadId}/referral-ask`),

  getIntentSignals: () =>
    authFetch<{
      leads: Array<{
        leadId: number;
        company: string;
        status: string;
        category: string;
        contactName: string | null;
        score: number;
        signals: Array<{
          type: 'email_opened' | 'proposal_viewed' | 'replied' | 'wrap_aging';
          count?: number;
          lastAt?: string;
          daysUntilExpiry?: number;
        }>;
      }>;
    }>('/mission/intent-signals'),

  getQuoteTimingIntel: (leadId: number) =>
    authFetch<{
      ok: boolean;
      hasSentQuote: boolean;
      quote?: { id: number; quoteNumber: string; title: string; total: number; sentAt: string; validDays: number };
      daysSinceSent?: number;
      validDaysLeft?: number;
      urgency?: 'on_track' | 'follow_up_now' | 'overdue';
      benchmark?: { avg: number; fast: number; slow: number };
      followUpDraft?: { subject: string; body: string } | null;
    }>(`/leads/${leadId}/quote-timing-intel`),

  getOutreachCalendar: () =>
    authFetch<{
      months: Array<{
        month: number;
        name: string;
        themes: string[];
        hot_categories: string[];
        angle: string;
        is_current: boolean;
        is_future: boolean;
        pipeline_count: number;
      }>;
      currentMonth: number;
    }>('/analytics/outreach-calendar'),

  // Project Milestone Tracker
  getMilestones: (leadId: number) =>
    authFetch<{
      milestones: Array<{
        id: number; lead_id: number; user_id: string; title: string;
        notes: string | null; completed: boolean; completed_at: string | null;
        due_date: string | null; sort_order: number; created_at: string;
      }>;
      initialized: boolean;
    }>(`/leads/${leadId}/milestones`),

  initMilestones: (leadId: number) =>
    authFetch<{
      ok: boolean;
      milestones: Array<{
        id: number; title: string; completed: boolean; sort_order: number;
      }>;
    }>(`/leads/${leadId}/milestones/init`, { method: 'POST' }),

  createMilestone: (leadId: number, data: { title: string; notes?: string; due_date?: string }) =>
    authFetch<{
      ok: boolean;
      milestone: { id: number; title: string; completed: boolean; sort_order: number };
    }>(`/leads/${leadId}/milestones`, { method: 'POST', body: JSON.stringify(data) }),

  updateMilestone: (milestoneId: number, data: { completed?: boolean; title?: string; notes?: string; due_date?: string }) =>
    authFetch<{
      ok: boolean;
      milestone: { id: number; title: string; completed: boolean; completed_at: string | null; due_date: string | null };
    }>(`/milestones/${milestoneId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteMilestone: (milestoneId: number) =>
    authFetch<{ ok: boolean }>(`/milestones/${milestoneId}`, { method: 'DELETE' }),

  // Daily Task Queue
  getTasks: () =>
    authFetch<{
      ok: boolean;
      tasks: Array<{
        id: number; user_id: string; lead_id: number | null; title: string;
        notes: string | null; type: string; completed: boolean; completed_at: string | null;
        due_date: string | null; due_time: string | null; priority: string;
        created_at: string; lead_company: string | null; lead_status: string | null; lead_category: string | null;
      }>;
      completedToday: Array<{ id: number; title: string; lead_company: string | null; completed_at: string }>;
    }>('/tasks'),

  createTask: (data: { title: string; notes?: string; type?: string; lead_id?: number; due_date?: string; due_time?: string; priority?: string }) =>
    authFetch<{ ok: boolean; task: { id: number; title: string; type: string; priority: string } }>('/tasks', {
      method: 'POST', body: JSON.stringify(data),
    }),

  updateTask: (id: number, data: { completed?: boolean; title?: string; notes?: string; due_date?: string; priority?: string }) =>
    authFetch<{ ok: boolean; task: { id: number; completed: boolean } }>(`/tasks/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),

  deleteTask: (id: number) =>
    authFetch<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),

  generateAITasks: () =>
    authFetch<{ ok: boolean; tasks: Array<{ id: number; title: string; type: string; priority: string; lead_company: string | null; notes: string | null }>; generated: number }>(
      '/tasks/generate-ai', { method: 'POST' }
    ),

  // Speed Dial — top 5 leads to contact now
  getSpeedDial: () =>
    authFetch<{
      ok: boolean;
      leads: Array<{
        leadId: number; clientId: string; company: string; contactName: string | null;
        phone: string | null; email: string | null; status: string; category: string;
        fleetSize: string | null; state: string | null; urgencyScore: number;
        daysOverdue: number; recentOpens: number; recentProposalViews: number;
        pitchAngle: string | null;
      }>;
    }>('/mission/speed-dial'),

  // Deal Coach — AI closing tactics for a specific deal
  getDealCoach: (leadId: number) =>
    authFetch<{
      ok: boolean; fallback: boolean;
      tactics: Array<{ title: string; action: string; rationale: string }>;
      closingProbability: number;
      urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
      keyInsight: string;
      daysInPipeline: number;
      daysInStage: number | null;
    }>(`/leads/${leadId}/deal-coach`),

  // Daily Briefing — AI morning summary for Mission
  getDailyBriefing: () =>
    authFetch<{ ok: boolean; briefing: string; dataOnly: boolean }>('/mission/daily-briefing'),

  // Stale Pipeline — leads stuck with no activity for 14+ days
  getStalePipeline: () =>
    authFetch<{
      ok: boolean;
      leads: Array<{
        leadId: number; clientId: string; company: string; contactName: string | null;
        category: string; status: string; email: string | null; phone: string | null;
        state: string | null; fleetSize: string | null; followupDueAt: string | null;
        lastActivityAt: string; daysStale: number; activityCount: number;
      }>;
      thresholdDays: number;
    }>('/mission/stale-pipeline'),

  // Pricing Intelligence — win rate by price tier, sweet spot identification
  getPricingIntel: (category?: string) =>
    authFetch<{
      ok: boolean; hasData: boolean;
      categories: Array<{
        category: string; wonCount: number; lostCount: number; totalDeals: number;
        winRate: number | null; avgWonPrice: number | null; avgLostPrice: number | null;
        priceDelta: number | null;
        tiers: Array<{
          label: string; minPrice: number; maxPrice: number;
          wonCount: number; lostCount: number; winRate: number | null; isSweetSpot: boolean;
        }> | null;
        sweetSpotRange: { min: number; max: number } | null;
      }>;
      overall: {
        wonCount: number; lostCount: number; winRate: number | null;
        avgWonPrice: number | null; avgLostPrice: number | null;
      } | null;
    }>(`/analytics/pricing-intel${category ? `?category=${encodeURIComponent(category)}` : ''}`),

  // Account Health — relationship vitals for a won client
  getAccountHealth: (leadId: number) =>
    authFetch<{
      ok: boolean; score: number; healthLabel: string; healthColor: string;
      daysSinceWon: number; daysSinceContact: number;
      jobCount: number; totalVehicles: number; totalRevenue: number;
      referralSent: boolean; activityCount: number;
      nearestExpiry: {
        company: string; installDate: string; expiryDate: string;
        daysToExpiry: number; vehicleCount: number; wrapCategory: string;
      } | null;
      jobs: Array<{
        id: number; vehicleCount: number; wrapCategory: string;
        installDate: string; expiryDate: string; daysToExpiry: number; revenue: number;
      }>;
    }>(`/leads/${leadId}/account-health`),

  // Win Debrief — AI "what worked" brief for a won deal
  generateWinDebrief: (leadId: number) =>
    authFetch<{
      ok: boolean; cached: boolean;
      debrief: {
        id: number; company: string; category: string | null;
        days_to_close: number | null; touch_count: number | null;
        deal_value_est: number | null; key_signal: string | null;
        winning_tactic: string | null; pattern_tags: string[];
        summary: string; created_at: string;
      };
    }>(`/leads/${leadId}/win-debrief`, { method: 'POST' }),

  // Win Pattern Library — aggregated patterns from all win debriefs (debrief system)
  getWinPatternLibrary: () =>
    authFetch<{
      ok: boolean; hasData: boolean;
      debriefs: Array<{
        id: number; company: string; category: string | null; days_to_close: number | null;
        touch_count: number | null; deal_value_est: number | null; key_signal: string | null;
        winning_tactic: string | null; pattern_tags: string[]; summary: string; created_at: string;
      }>;
      topTags: Array<{ tag: string; count: number }>;
      byCategory: Array<{ category: string; count: number; avg_days: number | null; avg_value: number | null }>;
      summary: { totalWins: number; avgDaysToClose: number | null; avgTouchCount: number | null };
    }>('/analytics/win-patterns'),

  // Pricing benchmarks from job history
  getPricingBenchmarks: (category: string) =>
    authFetch<{
      ok: boolean;
      category: string;
      hasData: boolean;
      stats: {
        job_count: number;
        avg_total: number;
        min_total: number;
        max_total: number;
        avg_per_vehicle: number | null;
        min_per_vehicle: number | null;
        max_per_vehicle: number | null;
        avg_vehicle_count: number | null;
      } | null;
      recentJobs: Array<{ company: string; job_revenue: number; vehicle_count: number; install_date: string }>;
      overallAvg: number | null;
    }>(`/analytics/pricing-benchmarks?category=${encodeURIComponent(category)}`),

  quickQuote: (vehicleType: string, vehicleCount: number, coverage: string) =>
    authFetch<{
      ok: boolean; vehicleCount: number; vehicleType: string; coverage: string;
      low: number; high: number; recommended: number; perVehicle: number;
      fromHistory: boolean; historyJobs: number;
    }>(`/tools/quick-quote?vehicleType=${vehicleType}&vehicleCount=${vehicleCount}&coverage=${coverage}`),

  // ── AI Revenue Coach ──
  aiCoach: (message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    authFetch<{ ok: boolean; reply: string }>(
      '/ai/coach',
      { method: 'POST', body: JSON.stringify({ message, history }) }
    ),

  // ── Per-lead send timing ──
  getLeadSendTiming: (leadId: number) =>
    authFetch<{
      ok: boolean; source: 'lead' | 'global' | 'default';
      dow: number; hour: number; dayLabel: string; timeLabel: string;
      opens: number; label: string; tip: string;
    }>(`/leads/${leadId}/send-timing`),

  // ── Pre-send Proposal Coach ──
  getProposalCoach: (leadId: number) =>
    authFetch<{
      ok: boolean; fallback: boolean;
      priceRange: string | null;
      avgWonPrice: number | null;
      similarDeals: number;
      emailEngagement: { totalOpens: number; lastOpen: string | null };
      advice: string[];
      subjectLine: string;
      risks: string[];
      confidence: 'high' | 'medium' | 'low';
    }>(`/ai/proposal-coach?leadId=${leadId}`),

  suggestSubjectLines: (args: { leadId?: number; currentBody?: string; currentSubject?: string }) =>
    authFetch<{ ok: boolean; suggestions: Array<{ subject: string; approach: string; why: string }> }>(
      '/ai/subject-lines',
      { method: 'POST', body: JSON.stringify(args) }
    ),

  // ── Google Review Automation ──
  requestReview: (jobId: number, opts: { clientEmail?: string; clientPhone?: string; clientName?: string; googleUrl?: string }) =>
    authFetch<{ ok: boolean; token: string; reviewUrl: string; sentVia: string[] }>(
      `/jobs/${jobId}/review-request`,
      { method: 'POST', body: JSON.stringify(opts) }
    ),

  getReviewRequests: (jobId: number) =>
    authFetch<{
      ok: boolean;
      requests: Array<{
        id: number; token: string; client_name: string | null; client_email: string | null;
        client_phone: string | null; company: string; sent_via: string | null;
        sent_at: string | null; opened_at: string | null; clicked_at: string | null; created_at: string;
      }>;
    }>(`/jobs/${jobId}/review-requests`),

  // ── VIN Decoder (NHTSA free API) ──
  decodeVin: (vin: string) =>
    authFetch<{
      ok: boolean; vin: string;
      make: string | null; model: string | null; year: string | null;
      series: string | null; trim: string | null;
      bodyClass: string | null; gvwr: string | null; vehicleType: string | null;
      doors: string | null; fuel: string | null;
      wrapType: string; label: string;
    }>(`/tools/vin/${vin.trim().toUpperCase()}`),

  // ── Deal Heat Score ──
  getHeatScore: (leadId: number) =>
    authFetch<{ ok: boolean; score: number; label: string; color: string; signals: string[] }>(
      `/leads/${leadId}/heat-score`
    ),

  getNearbyCarriers: (leadId: number) =>
    authFetch<{
      ok: boolean;
      carriers: Array<{ id: number; dot_number: string; name: string; city: string; state: string; fleet_size: number | null; phone: string | null; website: string | null; wrap_score: number }>;
      city?: string;
      state?: string;
      reason?: string;
    }>(`/leads/${leadId}/nearby-carriers`),

  // ── Portal Link Stats ──
  getPortalLinkStats: (leadId: number) =>
    authFetch<{
      ok: boolean;
      stats: { token: string; viewed_at: string | null; deposit_clicked_at: string | null; created_at: string } | null;
    }>(`/portal-links/lead/${leadId}/stats`),

  // ── Mission: Top Prospects by heat score ──
  getTopProspects: () =>
    authFetch<{
      ok: boolean;
      prospects: Array<{
        id: number; company: string; category: string; status: string;
        contactName: string | null; phone: string | null; email: string | null;
        fleetSize: number | null; score: number; label: string; color: string;
      }>;
    }>('/mission/top-prospects'),

  // ── Lead Lifetime Value ──
  getLeadLTV: (leadId: number) =>
    authFetch<{
      ok: boolean;
      jobCount: number; totalRevenue: number; totalCost: number;
      totalVehicles: number; grossMarginPct: number | null;
      firstJob: string | null; lastJob: string | null;
    }>(`/leads/${leadId}/lifetime-value`),

  // ── Mission: Expiring Quotes ──
  getExpiringQuotes: () =>
    authFetch<{
      ok: boolean;
      quotes: Array<{
        id: number; quoteNumber: string; title: string; total: number;
        expiresAt: string; daysLeft: number; leadId: number;
        company: string; contactName: string | null; email: string | null; phone: string | null;
      }>;
    }>('/mission/expiring-quotes'),

  // ── Analytics: Monthly Revenue Trend ──
  getMonthlyRevenue: () =>
    authFetch<{
      ok: boolean;
      months: Array<{ month: string; label: string; jobCount: number; revenue: number; cost: number; vehicles: number; margin: number | null }>;
      totalRevenue: number;
      avgMonthly: number;
      bestMonth: string;
    }>('/analytics/revenue-monthly'),

  // ── Quote Line Item Templates ──
  getQuoteTemplates: () =>
    authFetch<{
      ok: boolean;
      templates: Array<{ id: number; name: string; items: Array<{ description: string; qty: number; unit: string; unitPrice: number; total: number }>; created_at: string }>;
    }>('/quotes/templates'),
  saveQuoteTemplate: (name: string, items: Array<{ description: string; qty: number; unit: string; unitPrice: number; total: number }>) =>
    authFetch<{ ok: boolean; template: { id: number; name: string; items: unknown[]; created_at: string } }>(
      '/quotes/templates', { method: 'POST', body: JSON.stringify({ name, items }) }
    ),
  deleteQuoteTemplate: (id: number) =>
    authFetch<{ ok: boolean }>(`/quotes/templates/${id}`, { method: 'DELETE' }),

  // ── Job Payment Status ──
  updateJobPayment: (jobId: number, opts: { payment_status: string; amount_paid?: number }) =>
    authFetch<{ ok: boolean; job: Record<string, unknown> }>(
      `/jobs/${jobId}/payment`, { method: 'PATCH', body: JSON.stringify(opts) }
    ),
  getOverdueInvoices: () =>
    authFetch<{
      ok: boolean;
      jobs: Array<{
        id: number; company: string; vehicleCount: number; vehicleType: string;
        revenue: number; amountPaid: number; balance: number;
        installDate: string | null; paymentStatus: string; invoiceSentAt: string | null; daysOverdue: number | null;
      }>;
    }>('/mission/overdue-invoices'),

  // ── Job Social Post Generator ──
  generateJobSocialPost: (jobId: number) =>
    authFetch<{ ok: boolean; posts: { instagram: string; linkedin: string; facebook: string }; jobId: number; company: string }>(
      `/jobs/${jobId}/social-post`, { method: 'POST' }
    ),

  // ── Invoice ──
  getInvoiceUrl: (jobId: number) => `/jobs/${jobId}/invoice`,
  getWorkOrderUrl: (jobId: number) => {
    const token = getToken();
    return `/jobs/${jobId}/work-order?token=${encodeURIComponent(token || '')}`;
  },
  getCompletionReceiptUrl: (jobId: number) => {
    const token = getToken();
    return `/jobs/${jobId}/completion-receipt?token=${encodeURIComponent(token || '')}`;
  },
  sendInvoice: (jobId: number, opts: { toEmail: string; toName?: string }) =>
    authFetch<{ ok: boolean; invoiceNum: string }>(
      `/jobs/${jobId}/send-invoice`, { method: 'POST', body: JSON.stringify(opts) }
    ),
  notifyJobReady: (jobId: number, opts: { via: 'email' | 'sms' | 'both'; toEmail?: string; toPhone?: string; toName?: string; customMessage?: string }) =>
    authFetch<{ ok: boolean; sentVia: string[] }>(
      `/jobs/${jobId}/notify-ready`, { method: 'POST', body: JSON.stringify(opts) }
    ),

  // ── Job Schedule ──
  getJobSchedule: (year: number, month: number) =>
    authFetch<{ ok: boolean; jobs: import('./types').InstalledJob[] }>(`/jobs/schedule?year=${year}&month=${month}`),
  scheduleJob: (jobId: number, opts: { scheduled_install_date: string | null; scheduled_crew_count?: number }) =>
    authFetch<{ ok: boolean; job: import('./types').InstalledJob }>(`/jobs/${jobId}/schedule`, { method: 'PATCH', body: JSON.stringify(opts) }),

  // ── Subcontractors ──
  getSubcontractors: () =>
    authFetch<{ ok: boolean; subs: import('./types').Subcontractor[] }>('/subcontractors'),
  createSubcontractor: (data: { name: string; contact?: string; specialty?: string; labor_rate?: number; notes?: string }) =>
    authFetch<{ ok: boolean; sub: import('./types').Subcontractor }>('/subcontractors', { method: 'POST', body: JSON.stringify(data) }),
  updateSubcontractor: (id: number, data: Partial<{ name: string; contact: string; specialty: string; labor_rate: number; notes: string; tax_id: string; business_type: 'individual' | 'business'; email: string; address: string }>) =>
    authFetch<{ ok: boolean; sub: import('./types').Subcontractor }>(`/subcontractors/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSubcontractor: (id: number) =>
    authFetch<{ ok: boolean }>(`/subcontractors/${id}`, { method: 'DELETE' }),
  getJobSubcontractors: (jobId: number) =>
    authFetch<{ ok: boolean; assignments: import('./types').SubcontractorAssignment[] }>(`/jobs/${jobId}/subcontractors`),
  assignSubcontractor: (jobId: number, data: { sub_id: number; hours?: number; labor_cost?: number; notes?: string }) =>
    authFetch<{ ok: boolean; assignment: import('./types').SubcontractorAssignment }>(`/jobs/${jobId}/subcontractors`, { method: 'POST', body: JSON.stringify(data) }),
  removeSubAssignment: (assignmentId: number) =>
    authFetch<{ ok: boolean }>(`/jobs/sub-assignments/${assignmentId}`, { method: 'DELETE' }),
  markSubAssignmentPaid: (assignmentId: number, paidAmount?: number, undo?: boolean) =>
    authFetch<{ ok: boolean; assignment: import('./types').SubcontractorAssignment }>(
      `/jobs/sub-assignments/${assignmentId}/mark-paid`,
      { method: 'PATCH', body: JSON.stringify({ paid_amount: paidAmount, undo }) }
    ),
  getSubPayables: () =>
    authFetch<{ ok: boolean; payables: (import('./types').SubcontractorAssignment & { job_company: string; install_date: string | null; job_revenue: number; sub_email?: string })[]; totalOwed: number }>('/subcontractors/payables'),

  // ── Job Expenses ──
  getJobExpenses: (jobId: number) =>
    authFetch<{ ok: boolean; expenses: import('./types').JobExpense[]; total: number }>(`/jobs/${jobId}/expenses`),
  addJobExpense: (jobId: number, data: { category?: string; description: string; amount: number; expense_date?: string; receipt_note?: string }) =>
    authFetch<{ ok: boolean; expense: import('./types').JobExpense }>(`/jobs/${jobId}/expenses`, { method: 'POST', body: JSON.stringify(data) }),
  deleteJobExpense: (jobId: number, expenseId: number) =>
    authFetch<{ ok: boolean }>(`/jobs/${jobId}/expenses/${expenseId}`, { method: 'DELETE' }),

  // ── Job Vehicle Intake ──
  getJobVehicles: (jobId: number) =>
    authFetch<{ ok: boolean; vehicles: import('./types').JobVehicle[] }>(`/jobs/${jobId}/vehicles`),
  addJobVehicle: (jobId: number, data: Partial<import('./types').JobVehicle>) =>
    authFetch<{ ok: boolean; vehicle: import('./types').JobVehicle }>(`/jobs/${jobId}/vehicles`, { method: 'POST', body: JSON.stringify(data) }),
  updateJobVehicle: (jobId: number, vehicleId: number, data: Partial<import('./types').JobVehicle>) =>
    authFetch<{ ok: boolean; vehicle: import('./types').JobVehicle }>(`/jobs/${jobId}/vehicles/${vehicleId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteJobVehicle: (jobId: number, vehicleId: number) =>
    authFetch<{ ok: boolean }>(`/jobs/${jobId}/vehicles/${vehicleId}`, { method: 'DELETE' }),

  // ── Cash Flow ──
  getCashFlow: () =>
    authFetch<{
      totalOutstanding: number;
      collectedMtd: number;
      totalRevenue: number;
      totalPaid: number;
      current: Array<{ id: number; company: string; vehicleType: string; vehicleCount: number; category: string; revenue: number; amountPaid: number; balance: number; paymentStatus: string; installDate: string | null; invoiceSentAt: string | null; daysSinceInstall: number }>;
      mid: Array<{ id: number; company: string; vehicleType: string; vehicleCount: number; category: string; revenue: number; amountPaid: number; balance: number; paymentStatus: string; installDate: string | null; invoiceSentAt: string | null; daysSinceInstall: number }>;
      late: Array<{ id: number; company: string; vehicleType: string; vehicleCount: number; category: string; revenue: number; amountPaid: number; balance: number; paymentStatus: string; installDate: string | null; invoiceSentAt: string | null; daysSinceInstall: number }>;
    }>('/analytics/cash-flow'),

  // ── Outbound Webhooks ──
  getWebhooks: () =>
    authFetch<{
      ok: boolean;
      webhooks: Array<{ id: number; event_type: string; url: string; label: string | null; enabled: boolean; last_triggered_at: string | null; last_status_code: number | null; created_at: string }>;
      events: Array<{ value: string; label: string }>;
    }>('/webhooks'),
  createWebhook: (data: { event_type: string; url: string; label?: string; secret?: string }) =>
    authFetch<{ ok: boolean; webhook: { id: number; event_type: string; url: string; label: string | null; enabled: boolean; last_triggered_at: string | null; last_status_code: number | null; created_at: string } }>('/webhooks', { method: 'POST', body: JSON.stringify(data) }),
  toggleWebhook: (id: number, enabled: boolean) =>
    authFetch<{ ok: boolean }>(`/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  deleteWebhook: (id: number) =>
    authFetch<{ ok: boolean }>(`/webhooks/${id}`, { method: 'DELETE' }),
  testWebhook: (id: number) =>
    authFetch<{ ok: boolean; statusCode: number; error?: string }>(`/webhooks/${id}/test`, { method: 'POST' }),

  // ── Web Push ──
  getPushVapidKey: () =>
    authFetch<{ ok: boolean; publicKey: string | null }>('/push/vapid-key'),
  getPushStatus: () =>
    authFetch<{ ok: boolean; subscribed: boolean; vapidConfigured: boolean }>('/push/status'),
  subscribePush: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    authFetch<{ ok: boolean }>('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  unsubscribePush: (endpoint: string) =>
    authFetch<{ ok: boolean }>('/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) }),

  // ── Installation Contract ──
  getContractUrl: (leadId: number) => {
    const token = getToken();
    return `/leads/${leadId}/contract?token=${encodeURIComponent(token || '')}`;
  },

  // ── Fleet Growth Signals ──
  getFleetGrowthSignals: () =>
    authFetch<{ ok: boolean; signals: Array<{ id: number; company: string; category: string; status: string; fleet_size: number | null; fmcsa_fleet_size_snapshot: number | null; fmcsa_fleet_grew_at: string; contact_name: string | null; state: string | null }> }>('/leads/fleet-growth-signals'),

  // ── User Email Templates ──
  getEmailTemplates: () =>
    authFetch<{ ok: boolean; templates: Array<{ id: number; label: string; tag: string; subject: string; body: string; use_count: number; created_at: string; updated_at: string }> }>('/email-templates'),
  createEmailTemplate: (data: { label: string; tag?: string; subject: string; body: string }) =>
    authFetch<{ ok: boolean; template: { id: number; label: string; tag: string; subject: string; body: string; use_count: number; created_at: string; updated_at: string } }>('/email-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateEmailTemplate: (id: number, data: { label?: string; tag?: string; subject?: string; body?: string }) =>
    authFetch<{ ok: boolean; template: { id: number; label: string; tag: string; subject: string; body: string; use_count: number; created_at: string; updated_at: string } }>(`/email-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmailTemplate: (id: number) =>
    authFetch<{ ok: boolean }>(`/email-templates/${id}`, { method: 'DELETE' }),
  recordEmailTemplateUse: (id: number) =>
    authFetch<{ ok: boolean }>(`/email-templates/${id}/use`, { method: 'POST' }),

  // Material inventory
  getMaterials: () =>
    authFetch<{ ok: boolean; materials: MaterialItem[] }>('/materials'),
  getLowStockMaterials: () =>
    authFetch<{ ok: boolean; materials: MaterialItem[] }>('/materials/low-stock'),
  createMaterial: (data: Partial<MaterialItem>) =>
    authFetch<{ ok: boolean; material: MaterialItem }>('/materials', { method: 'POST', body: JSON.stringify(data) }),
  updateMaterial: (id: number, data: Partial<MaterialItem>) =>
    authFetch<{ ok: boolean; material: MaterialItem }>(`/materials/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  adjustMaterialStock: (id: number, delta: number, reason?: string) =>
    authFetch<{ ok: boolean; material: MaterialItem }>(`/materials/${id}/adjust`, { method: 'POST', body: JSON.stringify({ delta, reason }) }),
  deleteMaterial: (id: number) =>
    authFetch<{ ok: boolean }>(`/materials/${id}`, { method: 'DELETE' }),

  estimateMaterialCost: (params: {
    vehicle_type: string;
    vehicle_count: number;
    coverage?: 'full' | 'partial' | 'spot';
    material_id?: number;
  }) => {
    const q = new URLSearchParams({
      vehicle_type: params.vehicle_type,
      vehicle_count: String(params.vehicle_count),
      coverage: params.coverage ?? 'full',
    });
    if (params.material_id) q.set('material_id', String(params.material_id));
    return authFetch<{
      ok: boolean;
      vehicleType: string;
      vehicleLabel: string;
      vehicleCount: number;
      coverage: string;
      sqftPerVehicleLow: number;
      sqftPerVehicleHigh: number;
      totalSqftLow: number;
      totalSqftHigh: number;
      suggestions: Array<{
        id: number; name: string; sku: string | null;
        rollSqft: number; rollsNeededLow: number; rollsNeededHigh: number;
        rollsInStock: number; unitCostPerRoll: number;
        costLow: number; costHigh: number;
        canCoverWithStock: boolean; shortfall: number;
      }>;
    }>(`/materials/estimate?${q}`);
  },
};
