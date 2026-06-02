#!/usr/bin/env node
/**
 * WrapOS MCP Server
 *
 * Exposes the WrapOS CRM API as MCP tools so LLM agents can:
 *   - Search and manage leads (vehicle wrap prospects)
 *   - Discover fleet carriers from the FMCSA 2M-carrier database
 *   - Generate and send AI-powered outreach emails
 *   - Create and track proposals
 *   - Query pipeline analytics
 *   - Log jobs and lifecycle events
 *   - Manage bids
 *
 * Configuration (environment variables):
 *   WRAPOS_BASE_URL   WrapOS server URL  (default: http://localhost:3001)
 *   WRAPOS_TOKEN      JWT auth token from localStorage key "wl_token"
 *
 * Usage:
 *   WRAPOS_TOKEN=eyJ... node dist/index.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { clientFromEnv } from './client.js';
import { json, listResult, ok } from './format.js';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const client = clientFromEnv();
const server = new McpServer({
  name: 'wrapos',
  version: '1.0.0',
});

// ---------------------------------------------------------------------------
// LEADS — CRM lead management
// ---------------------------------------------------------------------------

server.registerTool('leads_list', {
  description:
    'List leads in the WrapOS CRM. Filter by status, category, state, or search text. ' +
    'Returns company name, contact, status, category, fleet size, score, and last-contacted date. ' +
    'Status values: new | cold | contacted | replied | meeting | proposal | won | lost. ' +
    'Category values: fleet | design | construction | dinoc | reatec | colorchange | wallgraphics | gc_referral | racing.',
  inputSchema: z.object({
    status: z.enum(['new','cold','contacted','replied','meeting','proposal','won','lost']).optional()
      .describe('Filter by CRM status'),
    category: z.enum(['fleet','design','construction','dinoc','reatec','colorchange','wallgraphics','gc_referral','racing']).optional()
      .describe('Filter by lead category / wrap type'),
    state: z.string().max(2).optional().describe('2-letter US state code'),
    q: z.string().optional().describe('Full-text search across company name, contact, notes'),
    limit: z.number().int().min(1).max(200).default(50).describe('Max results (default 50)'),
    offset: z.number().int().min(0).default(0).describe('Pagination offset'),
    sort: z.enum(['score','recent','followup','company']).optional()
      .describe('Sort order: score (wrap score desc), recent (last contacted), followup (due soonest), company (alphabetical)'),
  }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const params = new URLSearchParams();
  if (args.status) params.set('status', args.status);
  if (args.category) params.set('category', args.category);
  if (args.state) params.set('state', args.state);
  if (args.q) params.set('q', args.q);
  params.set('limit', String(args.limit));
  params.set('offset', String(args.offset));
  if (args.sort) params.set('sort', args.sort);

  const data = await client.get<{ leads: unknown[]; total?: number }>(`/leads?${params}`);
  return { content: [{ type: 'text', text: listResult('Leads', data.leads, data.total) }] };
});

server.registerTool('leads_get', {
  description: 'Get full details for a single lead by its server ID, including contact info, notes, tags, follow-up date, and activity history.',
  inputSchema: z.object({
    id: z.number().int().positive().describe('Lead server ID (serverId from leads_list)'),
    include_activities: z.boolean().default(true).describe('Include activity timeline (emails, calls, notes)'),
  }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const lead = await client.get<unknown>(`/leads/${args.id}`);
  const result: Record<string, unknown> = { lead };

  if (args.include_activities) {
    try {
      const acts = await client.get<{ activities: unknown[] }>(`/leads/${args.id}/activities`);
      result.activities = acts.activities;
    } catch { /* activities optional */ }
  }

  return { content: [{ type: 'text', text: json(result) }] };
});

server.registerTool('leads_create', {
  description:
    'Add a new lead to the WrapOS CRM. Use this after discovering a promising carrier via carriers_search, ' +
    'or to manually add a prospect. Returns the created lead with its server ID.',
  inputSchema: z.object({
    company: z.string().min(1).describe('Company / business name'),
    category: z.enum(['fleet','design','construction','dinoc','reatec','colorchange','wallgraphics','gc_referral','racing'])
      .describe('Primary wrap service category'),
    contact_name: z.string().optional().describe('Primary contact full name'),
    contact_title: z.string().optional().describe('Contact job title'),
    email: z.string().email().optional().describe('Contact email address'),
    phone: z.string().optional().describe('Contact phone number'),
    website: z.string().url().optional().describe('Company website URL'),
    state: z.string().max(2).optional().describe('2-letter US state code'),
    city: z.string().optional(),
    fleet_size: z.number().int().min(0).optional().describe('Number of vehicles in fleet'),
    notes: z.string().optional().describe('Internal notes, pitch angles, research findings'),
    tags: z.array(z.string()).optional().describe('Tags for filtering/segmentation'),
    source: z.string().optional().describe('Lead source (e.g. fmcsa, referral, inbound, cold_outreach)'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false },
}, async (args) => {
  const clientId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const lead = await client.post<unknown>('/leads/sync', [{
    clientId,
    company: args.company,
    category: args.category,
    contactName: args.contact_name,
    contactTitle: args.contact_title,
    email: args.email,
    phone: args.phone,
    website: args.website,
    state: args.state,
    city: args.city,
    fleetSize: args.fleet_size,
    notes: args.notes,
    tags: args.tags,
    source: args.source ?? 'mcp',
    status: 'new',
  }]);
  return { content: [{ type: 'text', text: ok('Lead created', lead) }] };
});

server.registerTool('leads_update', {
  description:
    'Update a lead\'s status, notes, contact info, follow-up date, or tags. ' +
    'Common workflow: move status to "contacted" after sending an email, "replied" when they respond, ' +
    '"proposal" when you send a quote, "won" when they sign.',
  inputSchema: z.object({
    id: z.number().int().positive().describe('Lead server ID'),
    status: z.enum(['new','cold','contacted','replied','meeting','proposal','won','lost']).optional(),
    notes: z.string().optional().describe('Replace notes field (full text)'),
    contact_name: z.string().optional(),
    contact_title: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    website: z.string().url().optional(),
    fleet_size: z.number().int().min(0).optional(),
    followup_due_at: z.string().optional().describe('ISO date for next follow-up reminder (YYYY-MM-DD)'),
    tags: z.array(z.string()).optional(),
  }),
  annotations: { readOnlyHint: false, idempotentHint: true },
}, async (args) => {
  const { id, ...rest } = args;
  const body: Record<string, unknown> = {};
  if (rest.status !== undefined) body.status = rest.status;
  if (rest.notes !== undefined) body.notes = rest.notes;
  if (rest.contact_name !== undefined) body.contactName = rest.contact_name;
  if (rest.contact_title !== undefined) body.contactTitle = rest.contact_title;
  if (rest.email !== undefined) body.email = rest.email;
  if (rest.phone !== undefined) body.phone = rest.phone;
  if (rest.website !== undefined) body.website = rest.website;
  if (rest.fleet_size !== undefined) body.fleetSize = rest.fleet_size;
  if (rest.followup_due_at !== undefined) body.followup_due_at = rest.followup_due_at;
  if (rest.tags !== undefined) body.tags = rest.tags;

  const result = await client.put<unknown>(`/leads/${id}`, body);
  return { content: [{ type: 'text', text: ok('Lead updated', result) }] };
});

server.registerTool('leads_log_activity', {
  description:
    'Log a manual activity on a lead — call notes, meeting outcomes, manual email record, ' +
    'or any custom event. Appears in the lead\'s activity timeline.',
  inputSchema: z.object({
    lead_id: z.number().int().positive().describe('Lead server ID'),
    type: z.enum(['note_added','email_sent','call_made','meeting_held','email_copied','custom'])
      .describe('Activity type'),
    subject: z.string().optional().describe('Short subject / title of the activity'),
    body: z.string().optional().describe('Full text / notes / call summary'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false },
}, async (args) => {
  const result = await client.post<unknown>(`/leads/${args.lead_id}/activities`, {
    type: args.type,
    subject: args.subject,
    body: args.body,
  });
  return { content: [{ type: 'text', text: ok('Activity logged', result) }] };
});

server.registerTool('leads_get_activities', {
  description: 'Retrieve the full activity timeline for a lead — all emails sent, calls logged, notes, status changes, and proposal events.',
  inputSchema: z.object({
    lead_id: z.number().int().positive().describe('Lead server ID'),
  }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await client.get<{ activities: unknown[] }>(`/leads/${args.lead_id}/activities`);
  return { content: [{ type: 'text', text: listResult('Activities', data.activities) }] };
});

// ---------------------------------------------------------------------------
// CARRIERS — FMCSA fleet carrier discovery
// ---------------------------------------------------------------------------

server.registerTool('carriers_search', {
  description:
    'Search the FMCSA database of 2M+ registered US fleet carriers. ' +
    'Filter by state, fleet size, cargo type, or company name. ' +
    'Returns carriers ranked by wrap score (fleet size + data freshness). ' +
    'Ideal for finding new prospects — carriers with 25-500 trucks are the "wrap sweet spot."',
  inputSchema: z.object({
    state: z.string().max(2).optional().describe('2-letter US state code (e.g. IN, OH, TX)'),
    min_fleet: z.number().int().min(1).default(10).describe('Minimum number of power units (trucks)'),
    max_fleet: z.number().int().optional().describe('Maximum number of power units'),
    query: z.string().optional().describe('Company name search (partial match)'),
    cargo: z.string().optional().describe('Cargo type filter (e.g. "general freight", "household goods")'),
    limit: z.number().int().min(1).max(100).default(25),
    offset: z.number().int().min(0).default(0),
  }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const params = new URLSearchParams();
  if (args.state) params.set('state', args.state);
  params.set('minFleet', String(args.min_fleet));
  if (args.max_fleet) params.set('maxFleet', String(args.max_fleet));
  if (args.query) params.set('q', args.query);
  if (args.cargo) params.set('cargo', args.cargo);
  params.set('limit', String(args.limit));
  params.set('offset', String(args.offset));

  const data = await client.post<{ carriers: unknown[]; total: number }>('/carriers/search', Object.fromEntries(params));
  return { content: [{ type: 'text', text: listResult('Carriers', data.carriers, data.total) }] };
});

server.registerTool('carriers_import', {
  description:
    'Import a carrier from the FMCSA database into your WrapOS CRM as a new lead. ' +
    'Use after carriers_search to add promising prospects. Provide the carrier\'s DOT number.',
  inputSchema: z.object({
    dot_number: z.string().describe('USDOT number of the carrier to import'),
    category: z.enum(['fleet','design','construction','dinoc','reatec','colorchange','wallgraphics','gc_referral','racing'])
      .default('fleet').describe('Wrap category to assign to the new lead'),
    notes: z.string().optional().describe('Initial notes to attach to the new lead'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false },
}, async (args) => {
  const result = await client.post<unknown>('/carriers/import', {
    dotNumber: args.dot_number,
    category: args.category,
    notes: args.notes,
  });
  return { content: [{ type: 'text', text: ok('Carrier imported as lead', result) }] };
});

// ---------------------------------------------------------------------------
// EMAIL — AI email generation and sending
// ---------------------------------------------------------------------------

server.registerTool('email_generate', {
  description:
    'Generate an AI-written outreach email for a lead. Returns subject and body. ' +
    'The email is personalized using the lead\'s company, fleet size, location, and contact info. ' +
    'Does NOT send the email — use email_send after reviewing.',
  inputSchema: z.object({
    lead_id: z.number().int().positive().describe('Lead server ID'),
    email_type: z.enum([
      'cold_intro','follow_up','check_in','meeting_request',
      'proposal_follow','win_back','seasonal','fleet_expansion'
    ]).default('cold_intro').describe('Email type / intent'),
    tone: z.enum(['professional','casual','urgent','consultative']).default('professional'),
    notes: z.string().optional().describe('Extra context for the AI (recent news, specific ask, etc.)'),
  }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const lead = await client.get<{ lead?: Record<string, unknown> }>(`/leads/${args.lead_id}`);
  const settings = await client.get<{ settings: Record<string, unknown> }>('/settings');

  const result = await client.post<{ subject: string; body: string }>('/ai/email', {
    lead: lead.lead ?? lead,
    emailType: args.email_type,
    tone: args.tone,
    settings: settings.settings ?? settings,
    extraContext: args.notes,
  });

  const output = `Subject: ${result.subject}\n\n${result.body}`;
  return { content: [{ type: 'text', text: output }] };
});

server.registerTool('email_send', {
  description:
    'Send an email to a lead via Resend. Requires RESEND_API_KEY to be configured in WrapOS. ' +
    'Automatically adds a tracking pixel (open detection), unsubscribe footer, and logs to activity timeline. ' +
    'Advances lead status from "cold" → "contacted" automatically.',
  inputSchema: z.object({
    lead_id: z.number().int().positive().describe('Lead server ID'),
    subject: z.string().min(1).describe('Email subject line'),
    body: z.string().min(1).describe('Email body (plain text, newlines become <br> in HTML)'),
    to_email: z.string().email().describe('Recipient email address'),
    to_name: z.string().optional().describe('Recipient display name'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false },
}, async (args) => {
  const result = await client.post<{ ok: boolean; resend_id?: string }>(`/leads/${args.lead_id}/send-email`, {
    subject: args.subject,
    body: args.body,
    toEmail: args.to_email,
    toName: args.to_name,
  });
  return { content: [{ type: 'text', text: ok(`Email sent (Resend ID: ${result.resend_id ?? 'n/a'})`) }] };
});

server.registerTool('email_generate_sequence', {
  description:
    'Generate a multi-email outreach sequence (3-5 emails) for a lead. ' +
    'Returns emails with subjects, bodies, and recommended send delays. ' +
    'Use email_activate_sequence to schedule automated sending.',
  inputSchema: z.object({
    lead_id: z.number().int().positive().describe('Lead server ID'),
    tone: z.enum(['professional','casual','urgent','consultative']).default('professional'),
  }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const lead = await client.get<unknown>(`/leads/${args.lead_id}`);
  const settings = await client.get<unknown>('/settings');

  const result = await client.post<{ emails: unknown[] }>('/ai/sequence', {
    lead,
    tone: args.tone,
    settings,
  });

  return { content: [{ type: 'text', text: listResult('Sequence emails', result.emails) }] };
});

server.registerTool('email_activate_sequence', {
  description:
    'Activate an automated email drip sequence for a lead. ' +
    'WrapOS will send 3-5 emails over 2-3 weeks with AI-written content. ' +
    'Requires RESEND_API_KEY configured in WrapOS.',
  inputSchema: z.object({
    lead_id: z.number().int().positive().describe('Lead server ID'),
    tone: z.enum(['professional','casual','urgent','consultative']).default('professional'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false },
}, async (args) => {
  const result = await client.post<unknown>(`/leads/${args.lead_id}/activate-sequence`, {
    tone: args.tone,
  });
  return { content: [{ type: 'text', text: ok('Sequence activated', result) }] };
});

// ---------------------------------------------------------------------------
// PROPOSALS — AI proposal creation and tracking
// ---------------------------------------------------------------------------

server.registerTool('proposal_create', {
  description:
    'Generate an AI-written proposal for a lead. Creates a shareable web page at a unique URL. ' +
    'The proposal includes intro, services section, pricing overview, timeline, and notes. ' +
    'Returns the proposal ID, token, and shareable link.',
  inputSchema: z.object({
    lead_id: z.number().int().positive().describe('Lead server ID'),
    extra_notes: z.string().optional()
      .describe('Extra context for the AI: vehicle types, specific asks, budget hints, timeline requirements'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false },
}, async (args) => {
  const result = await client.post<{ proposal: { id: number; token: string; title: string; status: string } }>(
    `/leads/${args.lead_id}/proposal`,
    { extra_notes: args.extra_notes ?? '' }
  );
  const p = result.proposal;
  const baseUrl = process.env.WRAPOS_BASE_URL ?? 'http://localhost:3001';
  const link = `${baseUrl}/proposals/${p.token}`;
  return {
    content: [{ type: 'text', text: `✓ Proposal created\n\nID: ${p.id}\nTitle: ${p.title}\nStatus: ${p.status}\nShare link: ${link}` }],
  };
});

server.registerTool('proposal_list', {
  description: 'List all proposals, or proposals for a specific lead. Shows status (draft/sent/approved/declined/expired), view count, and dates.',
  inputSchema: z.object({
    lead_id: z.number().int().positive().optional().describe('Filter to proposals for one lead'),
    status: z.enum(['draft','sent','approved','declined','expired']).optional(),
  }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const params = new URLSearchParams();
  if (args.status) params.set('status', args.status);
  const qs = params.size > 0 ? `?${params}` : '';

  const data = await client.get<{ proposals: unknown[] }>(`/proposals${qs}`);
  let proposals = data.proposals;

  if (args.lead_id) {
    proposals = (proposals as Array<Record<string, unknown>>).filter(p => p.lead_id === args.lead_id);
  }

  return { content: [{ type: 'text', text: listResult('Proposals', proposals) }] };
});

server.registerTool('proposal_update_status', {
  description: 'Update a proposal\'s status. Use "sent" when you share the link with the client, "approved" when they accept, "declined" if they pass.',
  inputSchema: z.object({
    proposal_id: z.number().int().positive(),
    status: z.enum(['sent','approved','declined','expired']),
    expires_at: z.string().optional().describe('Expiry date in ISO format (YYYY-MM-DD) — proposal auto-expires at midnight'),
  }),
  annotations: { readOnlyHint: false, idempotentHint: true },
}, async (args) => {
  const body: Record<string, unknown> = { status: args.status };
  if (args.expires_at) body.expires_at = new Date(args.expires_at + 'T23:59:59Z').toISOString();
  const result = await client.patch<unknown>(`/proposals/${args.proposal_id}`, body);
  return { content: [{ type: 'text', text: ok('Proposal updated', result) }] };
});

// ---------------------------------------------------------------------------
// ANALYTICS — Pipeline and performance data
// ---------------------------------------------------------------------------

server.registerTool('analytics_pipeline', {
  description:
    'Get pipeline analytics: deal count and estimated value by status, win rate, ' +
    'average days to close, and top categories by revenue. Essential for pipeline reviews.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
}, async () => {
  const data = await client.get<unknown>('/leads/analytics');
  return { content: [{ type: 'text', text: json(data) }] };
});

server.registerTool('analytics_overview', {
  description:
    'Get a full analytics overview including pipeline health, email performance, top leads, ' +
    'won revenue by category, and market coverage statistics.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
}, async () => {
  const data = await client.get<unknown>('/analytics');
  return { content: [{ type: 'text', text: json(data) }] };
});

server.registerTool('analytics_proposals', {
  description:
    'Get proposal analytics: close rate, average time from created to sent, ' +
    'average days to approve, view counts for approved vs declined proposals, ' +
    'and top 5 most-viewed proposals.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
}, async () => {
  const data = await client.get<unknown>('/analytics/proposals');
  return { content: [{ type: 'text', text: json(data) }] };
});

server.registerTool('analytics_email_performance', {
  description:
    'Get email template performance analytics: open rates, send counts, and opens per template. ' +
    'Shows which email templates your prospects actually read.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
}, async () => {
  const data = await client.get<unknown>('/analytics/email-templates');
  return { content: [{ type: 'text', text: json(data) }] };
});

server.registerTool('analytics_market_opportunity', {
  description:
    'Get market penetration stats: how many carriers exist in each state, how many are in your CRM, ' +
    'and what percentage you\'ve reached. Shows untapped opportunity by geography.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
}, async () => {
  const data = await client.get<unknown>('/analytics/market-opportunity');
  return { content: [{ type: 'text', text: json(data) }] };
});

// ---------------------------------------------------------------------------
// JOBS — Installed wraps / lifecycle tracking
// ---------------------------------------------------------------------------

server.registerTool('jobs_list', {
  description:
    'List installed wrap jobs. Each job tracks the lead, wrap category, vehicle count, ' +
    'install date, and age. Used for warranty tracking, re-order scheduling, and lifecycle alerts.',
  inputSchema: z.object({
    lead_id: z.number().int().positive().optional().describe('Filter jobs for one lead'),
    limit: z.number().int().min(1).max(100).default(25),
    offset: z.number().int().min(0).default(0),
  }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const params = new URLSearchParams();
  if (args.lead_id) params.set('leadId', String(args.lead_id));
  params.set('limit', String(args.limit));
  params.set('offset', String(args.offset));
  const data = await client.get<{ jobs: unknown[]; total?: number }>(`/jobs?${params}`);
  return { content: [{ type: 'text', text: listResult('Jobs', data.jobs, data.total) }] };
});

server.registerTool('jobs_create', {
  description:
    'Log a completed wrap installation. Triggers post-install care email and schedules ' +
    '90-day cross-sell and re-order lifecycle automation. Requires the associated lead\'s server ID.',
  inputSchema: z.object({
    lead_id: z.number().int().positive().describe('Lead server ID for the client'),
    wrap_category: z.enum(['fleet','design','construction','dinoc','reatec','colorchange','wallgraphics','gc_referral','racing']),
    vehicle_count: z.number().int().min(1).describe('Number of vehicles wrapped'),
    install_date: z.string().describe('Installation date (YYYY-MM-DD)'),
    job_revenue: z.number().optional().describe('Revenue for this job in dollars'),
    material_cost: z.number().optional().describe('Material cost in dollars'),
    notes: z.string().optional(),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false },
}, async (args) => {
  const result = await client.post<unknown>('/jobs', {
    leadId: args.lead_id,
    wrapCategory: args.wrap_category,
    vehicleCount: args.vehicle_count,
    installDate: args.install_date,
    jobRevenue: args.job_revenue,
    materialCost: args.material_cost,
    notes: args.notes,
  });
  return { content: [{ type: 'text', text: ok('Job logged', result) }] };
});

// ---------------------------------------------------------------------------
// BIDS — Bid / quote request management
// ---------------------------------------------------------------------------

server.registerTool('bids_list', {
  description:
    'List open bids / quote requests. Bids track due dates, estimated value, win probability, ' +
    'and submission status. Sorted by due date soonest first by default.',
  inputSchema: z.object({
    status: z.enum(['open','submitted','won','lost','expired']).optional(),
    limit: z.number().int().min(1).max(100).default(25),
    offset: z.number().int().min(0).default(0),
  }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const params = new URLSearchParams();
  if (args.status) params.set('status', args.status);
  params.set('limit', String(args.limit));
  params.set('offset', String(args.offset));
  const data = await client.get<{ bids: unknown[]; total?: number }>(`/bids?${params}`);
  return { content: [{ type: 'text', text: listResult('Bids', data.bids, data.total) }] };
});

server.registerTool('bids_create', {
  description: 'Create a new bid / quote request in WrapOS. Links to a lead and tracks due date, estimated value, and win probability.',
  inputSchema: z.object({
    lead_id: z.number().int().positive().optional().describe('Associated lead server ID'),
    title: z.string().min(1).describe('Bid title / project name'),
    due_date: z.string().describe('Bid due date (YYYY-MM-DD)'),
    estimated_value: z.number().optional().describe('Estimated job value in dollars'),
    win_probability: z.number().min(0).max(100).optional().describe('Estimated win probability (0-100)'),
    notes: z.string().optional(),
    category: z.enum(['fleet','design','construction','dinoc','reatec','colorchange','wallgraphics','gc_referral','racing']).optional(),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false },
}, async (args) => {
  const result = await client.post<unknown>('/bids', {
    leadId: args.lead_id,
    title: args.title,
    dueDate: args.due_date,
    estimatedValue: args.estimated_value,
    winProbability: args.win_probability,
    notes: args.notes,
    category: args.category,
  });
  return { content: [{ type: 'text', text: ok('Bid created', result) }] };
});

// ---------------------------------------------------------------------------
// MISSION — Daily priorities and follow-ups
// ---------------------------------------------------------------------------

server.registerTool('mission_followups', {
  description:
    'Get leads due for follow-up today or overdue. Returns leads sorted by urgency — ' +
    'most overdue first. Essential for daily outreach planning.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
}, async () => {
  const data = await client.get<unknown>('/leads/needs-followup');
  return { content: [{ type: 'text', text: json(data) }] };
});

server.registerTool('mission_hot_opens', {
  description:
    'Get leads who recently opened a tracked email. Sorted by recency and open count. ' +
    'Use this to prioritize who to call next — they\'re thinking about your pitch right now.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
}, async () => {
  const data = await client.get<unknown>('/mission/hot-opens');
  return { content: [{ type: 'text', text: json(data) }] };
});

server.registerTool('mission_today_score', {
  description:
    'Get today\'s activity score: emails sent, calls logged, leads advanced, and deals won. ' +
    'Shows progress toward daily outreach goals.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
}, async () => {
  const data = await client.get<unknown>('/mission/today-score');
  return { content: [{ type: 'text', text: json(data) }] };
});

server.registerTool('mission_news_signals', {
  description:
    'Get recently auto-created leads from the News Signal worker — fleet expansions, ' +
    'new contracts, and rebrands found in press releases. These are fresh, high-intent signals.',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(10),
  }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await client.get<unknown>(`/mission/news-signals?limit=${args.limit}`);
  return { content: [{ type: 'text', text: json(data) }] };
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't pollute MCP stdio
  process.stderr.write('WrapOS MCP server running on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
