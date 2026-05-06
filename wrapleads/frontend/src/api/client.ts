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

  if (!res.ok) {
    let msg = res.statusText;
    try { const e = await res.json(); msg = e.error ?? e.message ?? msg; } catch {}
    throw new ApiError(res.status, msg);
  }

  return res.json() as Promise<T>;
}

// ---- Typed API helpers ----

import type { Lead, User, SavedSearch, CarrierSearchParams, CarrierSearchResult, CarrierStats, BlueprintResult, PipelineAnalytics } from './types';

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
  resetPassword: (token: string, password: string) =>
    authFetch<{ ok: boolean }>('/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ token, password }),
    }),

  // Leads
  getLeads: () => authFetch<{ leads: Lead[] }>('/leads'),
  createLead: (lead: Partial<Lead>) =>
    authFetch<{ id: number }>('/leads', { method: 'POST', body: JSON.stringify(lead) }),
  updateLead: (serverId: number, patch: Partial<Lead>) =>
    authFetch<void>(`/leads/${serverId}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteLead: (serverId: number) =>
    authFetch<void>(`/leads/${serverId}`, { method: 'DELETE' }),
  syncLeads: (leads: Partial<Lead>[]) =>
    authFetch<{ inserted: number; failed: number }>('/leads/sync', {
      method: 'POST', body: JSON.stringify({ leads }),
    }),

  // Carriers
  searchCarriers: (params: CarrierSearchParams) =>
    authFetch<CarrierSearchResult>('/carriers/search', {
      method: 'POST', body: JSON.stringify(params),
    }),
  carrierStats: () => authFetch<CarrierStats>('/carriers/stats'),
  importCarrier: (companyId: number) =>
    authFetch<void>('/carriers/import', {
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

  // Analytics
  analytics: () => authFetch<PipelineAnalytics>('/leads/analytics'),

  // Settings (server-persisted)
  getSettings: () => authFetch<{ settings: Partial<import('./types').Settings> }>('/settings'),
  saveSettings: (settings: Partial<import('./types').Settings>) =>
    authFetch<{ ok: boolean }>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  // Stripe
  checkout: () => authFetch<{ url: string }>('/stripe/checkout', { method: 'POST', body: '{}' }),
  portal: () => authFetch<{ url: string }>('/stripe/portal', { method: 'POST', body: '{}' }),
};
