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

import type { Lead, User, SavedSearch, CarrierSearchParams, CarrierSearchResult, CarrierStats, BlueprintResult, PipelineAnalytics, QueuedEmail, Bid, BidSummary, InstalledJob, VisionQuoteResult, DesignBrief, MockupResult, FleetVehicle, FleetImportResult, WrapContent, ContentSchedule, EinkDevice, EinkPushLog, JobPhoto, AppNotification, PortalLink } from './types';

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
  sendEmail: (serverId: number, payload: { subject: string; body: string; toEmail: string; toName?: string }) =>
    authFetch<{ ok: boolean; resend_id?: string }>(`/leads/${serverId}/send-email`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
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
  createJob: (job: Partial<InstalledJob>) =>
    authFetch<{ job: InstalledJob }>('/jobs', { method: 'POST', body: JSON.stringify(job) }),
  updateJob: (id: number, updates: Partial<InstalledJob>) =>
    authFetch<{ job: InstalledJob }>(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteJob: (id: number) =>
    authFetch<{ ok: boolean }>(`/jobs/${id}`, { method: 'DELETE' }),

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
  getProposalUrl: (token: string) => `${window.location.origin}/proposals/${token}`,
  getMyQuoteLink: () => authFetch<{ token: string; url: string }>('/me/quote-link'),
  getProposalViewCount: (id: number) => authFetch<{ view_count: number; last_viewed_ago: string | null }>(`/proposals/${id}/views`),

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
  captureWinLoss: (leadId: number, factor: string, notes: string, competitor?: string) =>
    authFetch<{ ok: boolean }>(`/leads/${leadId}/win-loss`, { method: 'POST', body: JSON.stringify({ factor, notes, competitor }) }),

  // SMS outreach
  sendSms: (leadId: number, message: string) =>
    authFetch<{ ok: boolean; sid?: string }>(`/leads/${leadId}/sms`, { method: 'POST', body: JSON.stringify({ message }) }),

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

  broadcastEmail: (leadIds: number[], subject: string, body: string) =>
    authFetch<{ ok: boolean; sent: number; skipped: number; errors: number }>(
      '/leads/broadcast',
      { method: 'POST', body: JSON.stringify({ leadIds, subject, body }) }
    ),

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
};
