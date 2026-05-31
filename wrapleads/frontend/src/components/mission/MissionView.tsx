import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { useLeads } from '../../hooks/useLeads';
import ROICalculatorModal from '../modals/ROICalculatorModal';
import HotProposalsCard from './HotProposalsCard';
import PerfectTimingCard from './PerfectTimingCard';
import WinThisWeekCard from './WinThisWeekCard';
import StreakBadge from './StreakBadge';
import InboundRequestsCard from './InboundRequestsCard';
import CallSessionModal from './CallSessionModal';
import TodayScoreCard from './TodayScoreCard';
import ProposalHeatCard from './ProposalHeatCard';
import RescueQueueCard from './RescueQueueCard';
import IntentSignalsCard from './IntentSignalsCard';
import TaskQueueCard from './TaskQueueCard';
import SpeedDialCard from './SpeedDialCard';
import StalePipelineCard from './StalePipelineCard';
import ReferralEngineCard from './ReferralEngineCard';
import DailyBriefingCard from './DailyBriefingCard';
import ObjectionCounterCard from './ObjectionCounterCard';
import SignalLeadsCard from './SignalLeadsCard';
import SmsInboxCard from './SmsInboxCard';
import DarkProposalsCard from './DarkProposalsCard';
import FleetGrowthCard from './FleetGrowthCard';
import MaterialInventoryCard from './MaterialInventoryCard';
import { winProbability, scoreLead, scoreLabel, SCORE_COLORS } from '../../utils/scoring';
import type { LeadStatus, LeadCategory } from '../../api/types';

const REV_EST: Record<string, number> = {
  fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000,
  colorchange: 3500, racing: 40000, reatec: 5500, design: 3000, wallgraphics: 2500,
};

// ── AI Call Button ────────────────────────────────────────────────────────────

type CallState = 'idle' | 'calling' | 'in-progress' | 'done' | 'voicemail' | 'no-answer' | 'error';

function AutoCallButton({ leadId, phone }: { leadId: number; phone: string | null }) {
  const [state, setState] = useState<CallState>('idle');
  const [_callId, setCallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  async function initiateCall() {
    if (!phone) { setError('No phone number on file'); return; }
    setState('calling');
    setError(null);
    try {
      const res = await api.initiateCall(leadId);
      setCallId(res.call_id);
      setState('in-progress');
      // Poll for completion every 8s
      pollRef.current = setInterval(async () => {
        try {
          const s = await api.getCallStatus(res.call_id);
          if (s.status === 'ended') {
            stopPolling();
            const reason = s.endedReason || '';
            if (reason === 'voicemail' || reason === 'machine-detected-greeting') setState('voicemail');
            else if (reason === 'no-answer' || reason === 'customer-did-not-answer') setState('no-answer');
            else setState('done');
          }
        } catch { stopPolling(); setState('done'); }
      }, 8000);
      // Safety stop after 5 min
      setTimeout(() => { stopPolling(); if (state === 'in-progress') setState('done'); }, 300_000);
    } catch (e: any) {
      setState('error');
      setError(e.message || 'Call failed');
    }
  }

  if (!phone) return (
    <span className="mission-call-no-phone">No phone number on file</span>
  );

  const labels: Record<CallState, string> = {
    idle: 'Auto-Call',
    calling: 'Dialing…',
    'in-progress': 'On Call…',
    done: '✓ Call Done',
    voicemail: 'Left VM',
    'no-answer': '↩ No Answer',
    error: '✗ Failed',
  };

  return (
    <div className="mission-autocall-wrap">
      <button
        className={`mission-call-btn ${state === 'idle' ? 'mission-call-btn-auto' : state === 'done' ? 'mission-call-btn-done' : state === 'error' ? 'mission-call-btn-error' : 'mission-call-btn-active'}`}
        onClick={state === 'idle' ? initiateCall : undefined}
        disabled={state !== 'idle'}
      >
        {labels[state]}
      </button>
      {error && <div className="mission-call-error-tip">{error}</div>}
    </div>
  );
}

function daysAgo(d: string | null | undefined) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

function daysUntil(d: string | null | undefined) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function today() {
  const d = new Date();
  return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ── Bulk Activate Panel ───────────────────────────────────────────────────────

interface BulkPanelProps {
  leads: { id: number; company: string; category: string }[];
  onDone: () => void;
}

function BulkActivatePanel({ leads, onDone }: BulkPanelProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set(leads.map((l) => l.id)));
  const [tone, setTone] = useState('professional');
  const [result, setResult] = useState<{ queued: number; failed: number } | null>(null);
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => api.bulkActivateSequences([...selected], tone),
    onSuccess: (data) => {
      setResult({ queued: data.queued, failed: data.failed });
      qc.invalidateQueries({ queryKey: ['mission'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const toggle = (id: number) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  if (result) {
    return (
      <div className="mission-bulk-result">
        <div className="mission-bulk-result-icon" style={{ color: 'var(--accent)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <div className="mission-bulk-result-text">
          <strong>{result.queued} drip sequences activated.</strong>
          {result.failed > 0 && ` (${result.failed} skipped — no email on file)`}
        </div>
        <button className="btn btn-primary" onClick={onDone}>Done</button>
      </div>
    );
  }

  return (
    <div className="mission-bulk-panel">
      <div className="mission-bulk-header">
        <span className="mission-bulk-title">Activate Drip Sequences</span>
        <div className="mission-bulk-controls">
          <select className="form-control" style={{ width: 160 }} value={tone} onChange={(e) => setTone(e.target.value)}>
            <option value="professional">Professional</option>
            <option value="casual">Casual / Friendly</option>
            <option value="direct">Direct / Bold</option>
            <option value="local">Local / Community</option>
          </select>
          <button className="btn" onClick={() => setSelected(new Set(leads.map((l) => l.id)))}>All</button>
          <button className="btn" onClick={() => setSelected(new Set())}>None</button>
        </div>
      </div>
      <div className="mission-bulk-list">
        {leads.map((l) => (
          <label key={l.id} className="mission-bulk-item">
            <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
            <span className="mission-bulk-company">{l.company}</span>
            <span className="mission-bulk-cat">{l.category}</span>
          </label>
        ))}
      </div>
      <div className="mission-bulk-footer">
        <span className="mission-bulk-count">{selected.size} selected</span>
        <button className="btn" onClick={onDone}>Cancel</button>
        <button
          className="btn btn-primary"
          disabled={selected.size === 0 || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? `Activating ${selected.size}…` : `Activate ${selected.size} Sequences`}
        </button>
      </div>
    </div>
  );
}

// ── Enrich Panel (Apollo bulk email lookup) ──────────────────────────────────

interface EnrichPanelProps {
  leads: { id: number; company: string; category: string; city: string; state: string }[];
  apolloKey: string;
  onDone: () => void;
}

function EnrichPanel({ leads, apolloKey, onDone }: EnrichPanelProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set(leads.map((l) => l.id)));
  const [autoSeq, setAutoSeq] = useState(true);
  const [tone, setTone] = useState('professional');
  const [result, setResult] = useState<{ enriched: number; sequencesActivated: number; failed: number } | null>(null);
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () =>
      api.bulkEnrichLeads({
        lead_ids: [...selected],
        auto_sequence: autoSeq,
        tone,
        apiKey: apolloKey || undefined,
      }),
    onSuccess: (data) => {
      setResult({ enriched: data.enriched, sequencesActivated: data.sequencesActivated, failed: data.searched - data.enriched });
      qc.invalidateQueries({ queryKey: ['mission'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const toggle = (id: number) => setSelected((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  if (result) {
    return (
      <div className="mission-bulk-result">
        <div className="mission-bulk-result-icon" style={{ color: '#22c55e' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div className="mission-bulk-result-text">
          <strong>{result.enriched} leads enriched with email.</strong>
          {result.sequencesActivated > 0 && ` ${result.sequencesActivated} drip sequences auto-activated.`}
          {result.failed > 0 && ` (${result.failed} not found on Apollo)`}
        </div>
        <button className="btn btn-primary" onClick={onDone}>Done</button>
      </div>
    );
  }

  return (
    <div className="mission-bulk-panel">
      <div className="mission-bulk-header">
        <span className="mission-bulk-title">Auto-Enrich via Apollo.io</span>
        <div className="mission-bulk-controls">
          <label className="mission-enrich-toggle">
            <input type="checkbox" checked={autoSeq} onChange={(e) => setAutoSeq(e.target.checked)} />
            <span>Auto-activate sequences</span>
          </label>
          {autoSeq && (
            <select className="form-control" style={{ width: 140 }} value={tone} onChange={(e) => setTone(e.target.value)}>
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="direct">Direct</option>
              <option value="local">Local</option>
            </select>
          )}
          <button className="btn" onClick={() => setSelected(new Set(leads.map((l) => l.id)))}>All</button>
          <button className="btn" onClick={() => setSelected(new Set())}>None</button>
        </div>
      </div>
      <div className="mission-bulk-list">
        {leads.map((l) => (
          <label key={l.id} className="mission-bulk-item">
            <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
            <span className="mission-bulk-company">{l.company}</span>
            <span className="mission-bulk-cat">{l.city}, {l.state} · {l.category}</span>
          </label>
        ))}
      </div>
      <div className="mission-bulk-footer">
        <span className="mission-bulk-count">{selected.size} to enrich</span>
        <button className="btn" onClick={onDone}>Cancel</button>
        <button
          className="btn btn-primary"
          disabled={selected.size === 0 || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending
            ? `Searching Apollo… (${selected.size} leads)`
            : `Enrich ${selected.size} Leads`}
        </button>
      </div>
      {mut.isError && (
        <div className="mission-enrich-error">
          Apollo error: {(mut.error as Error).message}. Check your API key in Settings.
        </div>
      )}
    </div>
  );
}

// ── Prospector Panel (search Apollo for brand-new leads) ─────────────────────

const PROSPECT_INDUSTRIES = [
  { label: 'Auto Dealerships', value: 'automotive', category: 'fleet' },
  { label: 'Construction / GC', value: 'construction', category: 'gc_referral' },
  { label: 'Hotels / Hospitality', value: 'hospitality', category: 'dinoc' },
  { label: 'Architecture / Design', value: 'architecture', category: 'dinoc' },
  { label: 'Logistics / Trucking', value: 'logistics and supply chain', category: 'fleet' },
  { label: 'Food & Beverage / Restaurant', value: 'food and beverages', category: 'fleet' },
  { label: 'Healthcare / Medical', value: 'hospital and health care', category: 'fleet' },
  { label: 'Racing / Motorsport', value: 'sports', category: 'racing' },
  { label: 'Property Management', value: 'real estate', category: 'fleet' },
];

interface ProspectorPanelProps {
  apolloKey: string;
  onClose: () => void;
  onImported: () => void;
}

function ProspectorPanel({ apolloKey, onClose, onImported }: ProspectorPanelProps) {
  const settings = useAppStore((s) => s.settings);
  const defaultLocation = settings.city && settings.state
    ? `${settings.city}, ${settings.state}`
    : settings.city || settings.state || '';
  const [industry, setIndustry] = useState(PROSPECT_INDUSTRIES[0]);
  const [location, setLocation] = useState(defaultLocation);
  const [limit, setLimit] = useState(25);
  const [prospects, setProspects] = useState<{ name: string; title: string; company: string; city: string; state: string; email?: string; domain?: string }[]>([]);
  const [imported, setImported] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState<Set<number>>(new Set());
  const qc = useQueryClient();

  const searchMut = useMutation({
    mutationFn: () =>
      api.prospect({
        industry: industry.value,
        location,
        limit,
        category: industry.category,
        apiKey: apolloKey || undefined,
      }),
    onSuccess: (data) => {
      setProspects(data.prospects);
      setImported(new Set());
    },
  });

  async function importOne(prospect: typeof prospects[0], idx: number) {
    setImporting((s) => new Set([...s, idx]));
    try {
      await api.importProspect(prospect, industry.category);
      setImported((s) => new Set([...s, idx]));
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['mission'] });
      onImported();
    } finally {
      setImporting((s) => { const n = new Set(s); n.delete(idx); return n; });
    }
  }

  async function importAll() {
    const unimported = prospects.map((p, i) => ({ p, i })).filter(({ i }) => !imported.has(i));
    for (const { p, i } of unimported) {
      await importOne(p, i);
    }
  }

  return (
    <div className="mission-prospector">
      <div className="mission-prospector-header">
        <span className="mission-prospector-title">Apollo Prospector — Find New Leads</span>
        <button className="mission-action-btn" onClick={onClose}>✕ Close</button>
      </div>
      <div className="mission-prospector-form">
        <div className="mission-prospector-field">
          <label>Industry</label>
          <select
            className="form-control"
            value={industry.value}
            onChange={(e) => setIndustry(PROSPECT_INDUSTRIES.find((i) => i.value === e.target.value) ?? PROSPECT_INDUSTRIES[0])}
          >
            {PROSPECT_INDUSTRIES.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>
        <div className="mission-prospector-field">
          <label>Location</label>
          <input
            className="form-control"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, State"
          />
        </div>
        <div className="mission-prospector-field">
          <label>Limit</label>
          <select className="form-control" style={{ width: 80 }} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
        <button
          className="btn btn-primary"
          disabled={searchMut.isPending}
          onClick={() => searchMut.mutate()}
        >
          {searchMut.isPending ? 'Searching…' : 'Search Apollo'}
        </button>
      </div>

      {searchMut.isError && (
        <div className="mission-enrich-error">
          {(searchMut.error as Error).message}
        </div>
      )}

      {prospects.length > 0 && (
        <>
          <div className="mission-prospector-results-header">
            <span>{prospects.length} prospects found</span>
            <button
              className="btn btn-primary"
              onClick={importAll}
              disabled={imported.size === prospects.length}
            >
              Import All as Leads
            </button>
          </div>
          <div className="mission-prospector-list">
            {prospects.map((p, i) => (
              <div key={i} className={`mission-prospector-row ${imported.has(i) ? 'mission-prospector-imported' : ''}`}>
                <div className="mission-prospector-info">
                  <span className="mission-prospector-name">{p.name}</span>
                  <span className="mission-prospector-co">{p.company}</span>
                  <span className="mission-prospector-meta">
                    {p.title}{p.city ? ` · ${p.city}, ${p.state}` : ''}
                    {p.email ? ` · ${p.email}` : ''}
                  </span>
                </div>
                {imported.has(i) ? (
                  <span className="mission-prospector-done">✓ Imported</span>
                ) : (
                  <button
                    className="mission-action-btn mission-action-primary"
                    disabled={importing.has(i)}
                    onClick={() => importOne(p, i)}
                  >
                    {importing.has(i) ? '…' : 'Import'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Campaign Blast Panel ──────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  eventDate: string;
  weeksUntil: number;
  leadCount: number;
  urgency: string;
}

interface CampaignPanelProps {
  onClose: () => void;
}

function CampaignPanel({ onClose }: CampaignPanelProps) {
  const [launching, setLaunching] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { queued: number; estimatedMinutes: number }>>({});
  const [confirming, setConfirming] = useState<Campaign | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.getCampaigns(),
    staleTime: 5 * 60_000,
  });

  async function launchCampaign(campaign: Campaign) {
    setConfirming(null);
    setLaunching(campaign.id);
    try {
      const res = await api.launchCampaign(campaign.id);
      setResults((r) => ({ ...r, [campaign.id]: { queued: res.queued, estimatedMinutes: res.estimatedMinutes } }));
    } finally {
      setLaunching(null);
    }
  }

  return (
    <div className="mission-campaign-panel">
      <div className="mission-prospector-header">
        <span className="mission-prospector-title">Seasonal Campaign Blasts</span>
        <button className="mission-action-btn" onClick={onClose}>✕ Close</button>
      </div>
      <p className="mission-campaign-desc">
        One-click outbound AI call campaigns timed to real racing and seasonal events.
        The AI injects event urgency into every call automatically.
      </p>

      {isLoading && <div className="pv-loading"><span className="spinner" /><span>Loading campaigns…</span></div>}
      {isError && <div className="mission-enrich-error">Could not load campaigns. Check Vapi settings.</div>}

      {data && (
        <div className="mission-campaign-grid">
          {data.campaigns.map((c) => {
            const launched = results[c.id];
            const isLaunching = launching === c.id;
            const weeksLabel = c.weeksUntil <= 0 ? 'Happening now!' : c.weeksUntil === 1 ? '1 week away' : `${c.weeksUntil} weeks away`;
            const urgencyClass = c.weeksUntil <= 2 ? 'campaign-urgency-hot' : c.weeksUntil <= 6 ? 'campaign-urgency-warm' : 'campaign-urgency-cool';

            return (
              <div key={c.id} className="mission-campaign-card">
                <div className="mission-campaign-card-header">
                  <span className="mission-campaign-name">{c.name}</span>
                  <span className={`mission-campaign-urgency ${urgencyClass}`}>{weeksLabel}</span>
                </div>
                <p className="mission-campaign-blurb">{c.urgency}</p>
                <div className="mission-campaign-card-footer">
                  <span className="mission-campaign-count">
                    {c.leadCount} lead{c.leadCount !== 1 ? 's' : ''} match · {c.eventDate}
                  </span>
                  {launched ? (
                    <span className="mission-campaign-done">
                      ✓ {launched.queued} calls queued (~{launched.estimatedMinutes} min)
                    </span>
                  ) : (
                    <button
                      className="btn btn-primary"
                      disabled={isLaunching || c.leadCount === 0}
                      onClick={() => setConfirming(c)}
                    >
                      {isLaunching ? 'Launching…' : c.leadCount === 0 ? 'No matches' : 'Launch'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirming && (
        <div className="mission-campaign-confirm-overlay">
          <div className="mission-campaign-confirm">
            <div className="mission-campaign-confirm-title">Launch "{confirming.name}"?</div>
            <p>This will AI-call <strong>{confirming.leadCount} leads</strong> sequentially with 45-second gaps (~{Math.ceil(confirming.leadCount * 0.75)} min total).</p>
            <div className="mission-campaign-confirm-actions">
              <button className="btn" onClick={() => setConfirming(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => launchCampaign(confirming)}>Yes, Launch Campaign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Seasonal Demand Radar ─────────────────────────────────────────────────────

// Peak months (0=Jan…11=Dec) for each wrap category in the US market
const SEASONAL: Record<string, { peak: number[]; label: string }> = {
  construction: { peak: [2,3,4,5,6,7,8],      label: 'Construction season' },
  fleet:        { peak: [1,2,3,8,9,10],         label: 'Fleet refresh cycles' },
  gc_referral:  { peak: [1,2,3,4,8,9,10],       label: 'GC contract season' },
  colorchange:  { peak: [3,4,5,8,9],            label: 'Color-change demand' },
  racing:       { peak: [2,3,4,5,8,9,10],       label: 'Race season' },
  dinoc:        { peak: [0,1,2,9,10,11],         label: 'Interior film installs' },
  reatec:       { peak: [0,1,2,9,10,11],         label: 'Interior film installs' },
  wallgraphics: { peak: [0,1,2,8,9,10,11],      label: 'Office refresh budgets' },
  design:       { peak: [1,2,3,8,9,10],          label: 'Brand launches' },
};

// ── Deal Velocity Tracker ─────────────────────────────────────────────────────
// Expected max days before a deal should advance from each stage
const STAGE_STALL_DAYS: Record<string, number> = {
  new: 7, contacted: 5, replied: 3, meeting: 7, proposal: 10,
};
// Label color per momentum bucket
const MOMENTUM_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  hot:     { label: 'Hot',     color: '#10b981', bg: '#10b98118' },
  warming: { label: 'Warming', color: '#f59e0b', bg: '#f59e0b18' },
  cooling: { label: 'Cooling', color: '#94a3b8', bg: '#94a3b818' },
  stalled: { label: 'Stalled', color: '#ef4444', bg: '#ef444418' },
};

import type { Lead } from '../../api/types';

function DealVelocityCard({ leads, onLeadClick }: { leads: Lead[]; onLeadClick: (id: number) => void }) {
  const activeLead = leads.filter((l) =>
    ['new', 'contacted', 'replied', 'meeting', 'proposal'].includes(l.status)
  );

  if (activeLead.length === 0) return null;

  // Score each lead by days since last contact vs. expected stall threshold
  const scored = activeLead.map((l) => {
    const days = daysAgo(l.lastContacted) ?? daysAgo(l.createdAt) ?? 999;
    const threshold = STAGE_STALL_DAYS[l.status] ?? 7;
    const ratio = days / threshold; // >1 = past due
    let bucket: 'hot' | 'warming' | 'cooling' | 'stalled';
    if (ratio <= 0.4)      bucket = 'hot';
    else if (ratio <= 0.8) bucket = 'warming';
    else if (ratio <= 1.2) bucket = 'cooling';
    else                   bucket = 'stalled';
    return { lead: l, days, threshold, ratio, bucket };
  });

  // Show top 3 hottest + top 3 most stalled
  const hot     = scored.filter((s) => s.bucket === 'hot' || s.bucket === 'warming').slice(0, 3);
  const stalled = scored.filter((s) => s.bucket === 'stalled' || s.bucket === 'cooling').sort((a, b) => b.ratio - a.ratio).slice(0, 3);

  if (hot.length === 0 && stalled.length === 0) return null;

  const STATUS_LABEL: Record<string, string> = {
    new: 'New', contacted: 'Contacted', replied: 'Replied', meeting: 'Meeting', proposal: 'Proposal',
  };

  return (
    <section className="mission-card" style={{ borderColor: 'rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.03)' }}>
      <div className="mission-card-header">
        <span className="mission-card-icon" style={{ color: '#8b5cf6' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        </span>
        <span className="mission-card-title">Deal Velocity</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {scored.filter((s) => s.bucket === 'stalled').length} stalled · {scored.filter((s) => s.bucket === 'hot').length} hot
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        {/* Hot / Warming */}
        {hot.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Moving Fast</div>
            {hot.map(({ lead, days, bucket }) => {
              const style = MOMENTUM_STYLE[bucket];
              return (
                <button
                  key={lead.id}
                  onClick={() => lead.serverId && onLeadClick(lead.serverId)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)', textAlign: 'left' }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: style.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{STATUS_LABEL[lead.status]} · {days === 0 ? 'today' : `${days}d ago`}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: style.color, background: style.bg, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>{style.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Stalling */}
        {stalled.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>At Risk</div>
            {stalled.map(({ lead, days, threshold, bucket }) => {
              const style = MOMENTUM_STYLE[bucket];
              const overBy = days - threshold;
              return (
                <button
                  key={lead.id}
                  onClick={() => lead.serverId && onLeadClick(lead.serverId)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)', textAlign: 'left' }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: style.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{STATUS_LABEL[lead.status]} · {overBy > 0 ? `${overBy}d overdue` : `${days}d`}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: style.color, background: style.bg, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>{style.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function SeasonalRadar({ leads }: { leads: { category: string; status: string }[] }) {
  const month = new Date().getMonth();
  const alerts = useMemo(() => {
    return Object.entries(SEASONAL)
      .filter(([, info]) => info.peak.includes(month))
      .map(([cat, info]) => {
        const total = leads.filter((l) => l.category === cat && !['won','lost'].includes(l.status)).length;
        return { cat, label: info.label, total };
      })
      .filter((a) => a.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [leads, month]);

  if (alerts.length === 0) return null;

  const monthName = new Date().toLocaleString('default', { month: 'long' });

  return (
    <section className="mission-card" style={{ borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.04)' }}>
      <div className="mission-card-header">
        <span className="mission-card-icon" style={{ color: 'var(--accent)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </span>
        <span className="mission-card-title">{monthName} Demand Radar</span>
        <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, background: 'rgba(99,102,241,0.12)', padding: '2px 8px', borderRadius: 99 }}>
          Peak Season
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 10px', lineHeight: 1.5 }}>
        These categories are in peak demand this month — push them now while buyers have budget.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alerts.map((a) => (
          <div key={a.cat} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--bg-elev)', borderRadius: 8 }}>
            <span style={{ fontSize: 18 }}>
              {a.cat === 'construction' ? '🏗️' : a.cat === 'fleet' ? '🚛' : a.cat === 'gc_referral' ? '🤝' : a.cat === 'colorchange' ? '🎨' : a.cat === 'racing' ? '🏎️' : a.cat === 'dinoc' || a.cat === 'reatec' ? '🏠' : a.cat === 'wallgraphics' ? '🖼️' : '✦'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{a.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.total} active {a.cat.replace('_', ' ')} leads in pipeline</div>
            </div>
            <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--accent)', minWidth: 28, textAlign: 'right' }}>{a.total}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Revenue Goal Bar + Milestone Celebrations ────────────────────────────────

const MILESTONES = [
  { pct: 25, emoji: '🚀', label: '25% there!' },
  { pct: 50, emoji: '🔥', label: 'Halfway to goal!' },
  { pct: 75, emoji: '⚡', label: "75% — finish strong!" },
  { pct: 100, emoji: '🏆', label: 'Goal crushed!' },
];

function GoalConfetti({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active) return;
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const colors = ['#f59e0b','#10b981','#6366f1','#8b5cf6','#ef4444','#ec4899','#fbbf24'];
    type P = { x:number;y:number;vx:number;vy:number;color:string;w:number;h:number;rot:number;rs:number };
    const pts: P[] = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width, y: -10 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 5, vy: 1.5 + Math.random() * 3.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      w: 7 + Math.random() * 8, h: 4 + Math.random() * 4,
      rot: Math.random() * 360, rs: (Math.random() - 0.5) * 9,
    }));
    let raf: number, t = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas!.width, canvas!.height); t++;
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.rot += p.rs;
        if (p.y > canvas!.height + 20) continue;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, 1 - t / 190); ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
      if (t < 220) raf = requestAnimationFrame(draw);
      else { ctx.clearRect(0, 0, canvas!.width, canvas!.height); }
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  if (!active) return null;
  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }} />;
}

function RevenueGoalBar({ revenue, wonCount, goal, onSetGoal }: {
  revenue: number;
  wonCount: number;
  goal: number;
  onSetGoal: () => void;
}) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const storageKey = `wl_goal_milestones_${monthKey}`;
  const streakKey = 'wl_goal_streak';

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();
  const monthName = now.toLocaleString('default', { month: 'long' });
  const pct = goal > 0 ? Math.min(100, Math.round((revenue / goal) * 100)) : 0;
  const color = pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#6366f1';
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const showToast = useAppStore((s) => s.showToast);

  const [confetti, setConfetti] = useState(false);
  const [milestone, setMilestone] = useState<typeof MILESTONES[0] | null>(null);

  // Streak: number of months with at least 1 won deal
  const streak = (() => {
    try { return parseInt(localStorage.getItem(streakKey) ?? '0') || 0; } catch { return 0; }
  })();

  // Milestone detection
  useEffect(() => {
    if (goal <= 0) return;
    const triggered: number[] = (() => {
      try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]'); } catch { return []; }
    })();
    for (const m of MILESTONES) {
      if (pct >= m.pct && !triggered.includes(m.pct)) {
        triggered.push(m.pct);
        localStorage.setItem(storageKey, JSON.stringify(triggered));
        setMilestone(m);
        setConfetti(true);
        showToast(`${m.emoji} ${m.label}`, 'success');
        setTimeout(() => setConfetti(false), 3500);
        break;
      }
    }
  }, [pct, goal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update streak when goal hit
  useEffect(() => {
    if (pct >= 100 && wonCount > 0) {
      const lastStreak = localStorage.getItem(`${streakKey}_month`);
      if (lastStreak !== monthKey) {
        const newStreak = streak + 1;
        localStorage.setItem(streakKey, String(newStreak));
        localStorage.setItem(`${streakKey}_month`, monthKey);
      }
    }
  }, [pct]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <GoalConfetti active={confetti} />
      <div className="revenue-goal-bar" style={{ position: 'relative' }}>
        {milestone && confetti && (
          <div style={{
            position: 'absolute', top: -38, left: '50%', transform: 'translateX(-50%)',
            background: color, color: '#fff', fontSize: 12, fontWeight: 700,
            padding: '5px 14px', borderRadius: 20, whiteSpace: 'nowrap',
            animation: 'fadeInUp 0.3s ease', zIndex: 10,
          }}>
            {milestone.emoji} {milestone.label}
          </div>
        )}
        <div className="revenue-goal-left">
          <span className="revenue-goal-month">{monthName}</span>
          <span className="revenue-goal-days">{daysLeft}d left</span>
          {streak > 0 && (
            <span title={`${streak}-month win streak`} style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, marginTop: 2 }}>
              🔥 {streak}mo streak
            </span>
          )}
        </div>
        <div className="revenue-goal-center">
          {goal > 0 ? (
            <>
              <div className="revenue-goal-track" style={{ position: 'relative' }}>
                <div className="revenue-goal-fill" style={{ width: `${pct}%`, background: color, transition: 'width 0.6s ease' }} />
                {/* Milestone tick marks */}
                {[25, 50, 75].map((p) => (
                  <div key={p} style={{
                    position: 'absolute', left: `${p}%`, top: 0, bottom: 0,
                    width: 1, background: pct >= p ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                    pointerEvents: 'none',
                  }} />
                ))}
              </div>
              <div className="revenue-goal-labels">
                <span style={{ color }}>
                  {fmt(revenue)} closed · {pct}%
                  {pct >= 100 && ' 🎯'}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>goal: {fmt(goal)}</span>
              </div>
            </>
          ) : (
            <button className="btn revenue-goal-set-btn" onClick={onSetGoal}>
              Set monthly revenue goal →
            </button>
          )}
        </div>
        <div className="revenue-goal-right">
          <span className="revenue-goal-won-count">{wonCount}</span>
          <span className="revenue-goal-won-label">won</span>
        </div>
      </div>
    </>
  );
}

// ── Global Activity Feed ──────────────────────────────────────────────────────

const ACTIVITY_META: Record<string, { icon: string; color: string; label: string }> = {
  note_added:          { icon: '📝', color: '#8b5cf6', label: 'Note added' },
  email_sent:          { icon: '📤', color: '#3b82f6', label: 'Email sent' },
  email_opened:        { icon: '👁',  color: '#6366f1', label: 'Email opened' },
  email_reply:         { icon: '↩️',  color: '#22c55e', label: 'Replied' },
  status_changed:      { icon: '🔄', color: '#f59e0b', label: 'Stage updated' },
  called:              { icon: '📞', color: '#10b981', label: 'Called' },
  meeting_set:         { icon: '📅', color: '#f97316', label: 'Meeting set' },
  sequence_activated:  { icon: '⚡', color: '#6366f1', label: 'Sequence started' },
  email_generated:     { icon: '✨', color: '#8b5cf6', label: 'AI email written' },
  email_copied:        { icon: '📋', color: '#94a3b8', label: 'Email copied' },
  proposal_sent:       { icon: '📄', color: '#f97316', label: 'Proposal sent' },
  won:                 { icon: '🏆', color: '#22c55e', label: 'Deal WON' },
  lost:                { icon: '❌', color: '#ef4444', label: 'Deal lost' },
};

function feedTimeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function GlobalActivityFeed({ onLeadClick }: { onLeadClick: (id: number) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['activity-feed'],
    queryFn: () => api.getActivityFeed(25),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) return null;
  const events = data?.events ?? [];
  if (events.length === 0) return null;

  return (
    <section className="mission-card" style={{ gridColumn: '1 / -1' }}>
      <div className="mission-card-header" style={{ marginBottom: 12 }}>
        <span className="mission-card-icon" style={{ color: '#6366f1' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </span>
        <span className="mission-card-title">Recent Activity</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>across all leads · updates every min</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {events.slice(0, 20).map((ev) => {
          const meta = ACTIVITY_META[ev.type] ?? { icon: '•', color: 'var(--text-muted)', label: ev.type };
          const snippet = ev.subject || ev.body?.slice(0, 60) || meta.label;
          return (
            <button
              key={ev.id}
              onClick={() => onLeadClick(ev.lead_id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr auto',
                alignItems: 'center',
                gap: 10,
                padding: '7px 10px',
                borderRadius: 7,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 14, textAlign: 'center', lineHeight: 1 }}>{meta.icon}</span>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: meta.color }}>{ev.company}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>
                  {snippet.length > 55 ? snippet.slice(0, 55) + '…' : snippet}
                </span>
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {feedTimeAgo(ev.created_at)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Hot Leads Leaderboard ─────────────────────────────────────────────────────

const CAT_LABEL: Record<string, string> = {
  fleet: 'Fleet', dinoc: 'Di-NOC', gc_referral: 'GC Ref', construction: 'Construction',
  colorchange: 'Color Change', racing: 'Racing', reatec: 'Reatec', design: 'Design', wallgraphics: 'Wall',
};

function HotLeadsLeaderboard({ onLeadClick }: { onLeadClick: (id: number) => void }) {
  const { leads } = useLeads();
  const [expanded, setExpanded] = useState(false);

  const ranked = useMemo(() => {
    return leads
      .filter((l) => !['won', 'lost'].includes(l.status) && l.serverId)
      .map((l) => ({ lead: l, score: scoreLead(l), prob: winProbability(l) }))
      .sort((a, b) => b.score - a.score || b.prob - a.prob)
      .slice(0, expanded ? 15 : 8);
  }, [leads, expanded]);

  if (ranked.length === 0) return null;

  const topScore = ranked[0].score;

  return (
    <section className="mission-card" style={{ gridColumn: '1 / -1' }}>
      <div className="mission-card-header" style={{ marginBottom: 12 }}>
        <span className="mission-card-icon" style={{ color: '#ef4444' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </span>
        <span className="mission-card-title">Hot Leads — AI Score Ranking</span>
        <span className="mission-badge" style={{ background: '#ef4444', color: '#fff' }}>{leads.filter((l) => !['won','lost'].includes(l.status)).length} active</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ranked.map(({ lead, score, prob }, idx) => {
          const label = scoreLabel(score);
          const color = SCORE_COLORS[label];
          const barPct = topScore > 0 ? Math.round((score / topScore) * 100) : 0;
          const revEst = REV_EST[lead.category] ?? 2500;
          const expectedVal = Math.round((prob / 100) * revEst);
          return (
            <button
              key={lead.serverId}
              onClick={() => onLeadClick(lead.serverId!)}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr 140px 64px 60px',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid transparent',
                background: idx === 0 ? `${color}0a` : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = `${color}10`)}
              onMouseLeave={(e) => (e.currentTarget.style.background = idx === 0 ? `${color}0a` : 'transparent')}
            >
              {/* Rank */}
              <span style={{ fontSize: 11, fontWeight: 700, color: idx < 3 ? color : 'var(--text-faint)', textAlign: 'center' }}>
                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
              </span>

              {/* Company + category */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lead.company}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {CAT_LABEL[lead.category] ?? lead.category}
                  {lead.city ? ` · ${lead.city}` : ''}
                  {lead.state ? `, ${lead.state}` : ''}
                </div>
              </div>

              {/* Score bar */}
              <div style={{ position: 'relative', height: 6, background: 'var(--border)', borderRadius: 3 }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${barPct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
              </div>

              {/* Score badge */}
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color, background: `${color}18`, padding: '2px 7px', borderRadius: 5 }}>
                  {score}pts
                </span>
              </div>

              {/* Expected value */}
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                ~${expectedVal >= 1000 ? `${(expectedVal/1000).toFixed(0)}K` : expectedVal}
              </div>
            </button>
          );
        })}
      </div>
      {!expanded && leads.filter((l) => !['won','lost'].includes(l.status)).length > 8 && (
        <button
          onClick={() => setExpanded(true)}
          style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
        >
          Show more →
        </button>
      )}
    </section>
  );
}

// ── Setup Checklist ───────────────────────────────────────────────────────────

// ── Wrap Season Intelligence ──────────────────────────────────────────────────
// Hot months per category (1=Jan … 12=Dec). Industry-sourced seasonal demand.
const SEASON_MAP: Record<string, { months: number[]; label: string; note: string }> = {
  fleet: {
    months: [4, 5, 6, 7, 8, 9],
    label: 'Fleet Wrap Season',
    note: 'Summer logistics push — fleets rebrand before peak delivery months.',
  },
  gc_referral: {
    months: [3, 4, 5, 6, 7, 8, 9, 10],
    label: 'GC Referral Season',
    note: 'Construction is in full swing — GCs are signing subcontractors now.',
  },
  construction: {
    months: [3, 4, 5, 6, 7, 8, 9, 10],
    label: 'Construction Wrap Season',
    note: 'Site crews ramping up — branded vehicles on active job sites.',
  },
  racing: {
    months: [1, 2, 3, 4, 5, 9, 10, 11],
    label: 'Racing Season',
    note: 'Pre-season prep + fall circuit — sponsors commit wrap budgets now.',
  },
  colorchange: {
    months: [3, 4, 5, 6, 7, 8],
    label: 'Color Change Season',
    note: 'Warm weather drives enthusiasm for vehicle transformations.',
  },
  dinoc: {
    months: [10, 11, 12, 1, 2],
    label: 'DI-NOC Interior Season',
    note: 'Facility renovations peak in winter — indoor work with no weather risk.',
  },
  reatec: {
    months: [10, 11, 12, 1, 2],
    label: 'Reatec / Rea Tec Season',
    note: 'Architectural film installs follow the same cycle as DI-NOC.',
  },
  wallgraphics: {
    months: [1, 2, 3, 7, 8, 9],
    label: 'Wall Graphics Season',
    note: 'Trade show season — exhibitors order signage before Jan and July shows.',
  },
};

const REV_EST_SEASON: Record<string, number> = {
  fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000,
  colorchange: 3500, racing: 40000, reatec: 5500, design: 3000,
  wallgraphics: 2500, other: 2500,
};

function WrapSeasonCard({
  leads,
  onFilter,
}: {
  leads: { category: string; status: string }[];
  onFilter: (cat: string) => void;
}) {
  const month = new Date().getMonth() + 1; // 1-indexed

  // Find hot categories this month
  const hotCats = Object.entries(SEASON_MAP)
    .filter(([, s]) => s.months.includes(month))
    .map(([cat, s]) => {
      const active = leads.filter((l) =>
        l.category === cat && !['won', 'lost', 'cold'].includes(l.status)
      );
      return { cat, ...s, count: active.length, estValue: active.length * (REV_EST_SEASON[cat] ?? 2500) };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  if (hotCats.length === 0) return null;

  const totalLeads = hotCats.reduce((s, c) => s + c.count, 0);
  const totalValue = hotCats.reduce((s, c) => s + c.estValue, 0);
  const topSeason = hotCats[0];

  function fmtK(n: number) {
    return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
  }

  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });

  return (
    <div style={{
      background: 'linear-gradient(135deg, #f59e0b08, #f9731608)',
      border: '1px solid #f59e0b28',
      borderRadius: 12,
      padding: '12px 16px',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: '#f59e0b18',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          fontSize: 18,
        }}>
          🌡
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
            {monthName} — {topSeason.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.4 }}>
            {topSeason.note}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {hotCats.map((c) => (
              <button
                key={c.cat}
                onClick={() => onFilter(c.cat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                  borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid #f59e0b30', background: '#f59e0b12', color: '#b45309',
                }}
                title={c.note}
              >
                <span style={{ fontWeight: 800, color: '#f59e0b' }}>{c.count}</span>
                {c.cat === 'gc_referral' ? 'GC Referrals' : c.cat === 'colorchange' ? 'Color Change' : c.label.replace(' Season', '')}
                →
              </button>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#f59e0b' }}>{totalLeads}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>in-season leads</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginTop: 4 }}>{fmtK(totalValue)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>est. pipeline</div>
        </div>
      </div>
    </div>
  );
}

// ── Retention Radar ───────────────────────────────────────────────────────────

const VEHICLE_LABEL: Record<string, string> = {
  cargo_van_standard: 'Cargo Van', cargo_van_high_roof: 'High-Roof Van',
  box_truck_16: '16ft Box', box_truck_24: '24ft Box', box_truck_26: '26ft Box',
  pickup_truck: 'Pickup', semi_truck: 'Semi', sprinter: 'Sprinter',
  trailer_48: '48ft Trailer', trailer_53: '53ft Trailer', other: 'Vehicle',
};

const WRAP_CAT_LABEL: Record<string, string> = {
  fleet: 'Fleet Wrap', dinoc: 'DI-NOC', colorchange: 'Color Change',
  racing: 'Racing', construction: 'Construction', reatec: 'Reatec',
  wallgraphics: 'Wall Graphics', design: 'Design', general: 'General',
};

const REV_BY_CAT_RETENTION: Record<string, number> = {
  fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000,
  colorchange: 3500, racing: 40000, reatec: 5500, design: 3000, wallgraphics: 2500,
};

function agePctColor(pct: number) {
  if (pct >= 90) return '#ef4444';
  if (pct >= 75) return '#f97316';
  if (pct >= 60) return '#f59e0b';
  return '#10b981';
}

// ── Top Prospects by Heat Score ──────────────────────────────────────────────
function TopProspectsCard({ onLeadClick }: { onLeadClick: (id: number) => void }) {
  const setCurrentLeadId = useAppStore((s) => s.setCurrentLeadId);
  const setMode = useAppStore((s) => s.setMode);
  const { data, isLoading } = useQuery({
    queryKey: ['top-prospects'],
    queryFn: () => api.getTopProspects(),
    staleTime: 3 * 60_000,
  });

  const prospects = data?.prospects ?? [];
  if (!isLoading && prospects.length === 0) return null;

  function open(id: number) {
    setMode('leads');
    setCurrentLeadId(String(id));
    onLeadClick(id);
  }

  return (
    <div className="mission-card" style={{ borderLeft: '3px solid #f97316' }}>
      <div className="mission-card-header">
        <span className="mission-card-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" style={{ marginRight: 5 }}>
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="#f97316" stroke="none"/>
          </svg>
          Top Prospects
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>by engagement heat score</span>
      </div>

      {isLoading ? (
        <div style={{ padding: '12px 0', color: 'var(--text-faint)', fontSize: 12 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {prospects.map((p) => (
            <div
              key={p.id}
              onClick={() => open(p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: `${p.color}09`, border: `1px solid ${p.color}22`, borderRadius: 8, cursor: 'pointer', transition: 'background .15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = `${p.color}18`)}
              onMouseLeave={(e) => (e.currentTarget.style.background = `${p.color}09`)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 44, padding: '2px 4px', background: `${p.color}18`, borderRadius: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: p.color, lineHeight: 1 }}>{p.score}</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: p.color, textTransform: 'uppercase', letterSpacing: '.05em', opacity: 0.9 }}>{p.label}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.company}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {p.contactName && <span>{p.contactName} · </span>}
                  <span style={{ textTransform: 'capitalize' }}>{p.status.replace('_', ' ')}</span>
                  {p.fleetSize && <span> · {p.fleetSize} units</span>}
                </div>
              </div>
              {p.phone && (
                <a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, color: '#4d8af5', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Call →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Expiring Quotes ───────────────────────────────────────────────────────────
function ExpiringQuotesCard({ onLeadClick }: { onLeadClick: (id: number) => void }) {
  const setCurrentLeadId = useAppStore((s) => s.setCurrentLeadId);
  const setMode = useAppStore((s) => s.setMode);
  const { data, isLoading } = useQuery({
    queryKey: ['expiring-quotes'],
    queryFn: () => api.getExpiringQuotes(),
    staleTime: 5 * 60_000,
  });

  const quotes = data?.quotes ?? [];
  if (!isLoading && quotes.length === 0) return null;

  function open(leadId: number) {
    setMode('leads');
    setCurrentLeadId(String(leadId));
    onLeadClick(leadId);
  }

  return (
    <div className="mission-card" style={{ borderLeft: '3px solid #f59e0b' }}>
      <div className="mission-card-header">
        <span className="mission-card-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" style={{ marginRight: 5 }}>
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Expiring Quotes
        </span>
        <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>⚠ Act before they lapse</span>
      </div>

      {isLoading ? (
        <div style={{ padding: '12px 0', color: 'var(--text-faint)', fontSize: 12 }}>Checking…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {quotes.map((q) => {
            const urgency = q.daysLeft <= 2 ? '#ef4444' : q.daysLeft <= 4 ? '#f97316' : '#f59e0b';
            return (
              <div
                key={q.id}
                onClick={() => open(q.leadId)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: `${urgency}08`, border: `1px solid ${urgency}25`, borderRadius: 8, cursor: 'pointer', transition: 'background .15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = `${urgency}16`)}
                onMouseLeave={(e) => (e.currentTarget.style.background = `${urgency}08`)}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 40, padding: '3px 5px', background: `${urgency}18`, borderRadius: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: urgency, lineHeight: 1 }}>{q.daysLeft}</span>
                  <span style={{ fontSize: 8, fontWeight: 700, color: urgency, textTransform: 'uppercase', letterSpacing: '.05em' }}>days</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.company}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    #{q.quoteNumber} · {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(q.total)}
                  </div>
                </div>
                {q.email && (
                  <a
                    href={`mailto:${q.email}?subject=Following up on quote %23${q.quoteNumber}&body=Hi ${q.contactName || 'there'}%2C%0A%0AWanted to follow up on the quote we sent — it expires in ${q.daysLeft} day${q.daysLeft !== 1 ? 's' : ''}. Let me know if you have any questions.%0A%0ABest`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: 11, color: '#4d8af5', textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    Email →
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Overdue Invoices Alert ────────────────────────────────────────────────────
function OverdueInvoicesCard() {
  const showToast = useAppStore((s) => s.showToast);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['overdue-invoices'],
    queryFn: () => api.getOverdueInvoices(),
    staleTime: 5 * 60_000,
  });

  const jobs = data?.jobs ?? [];
  if (!isLoading && jobs.length === 0) return null;

  const totalBalance = jobs.reduce((s, j) => s + j.balance, 0);
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  async function markPaid(jobId: number, company: string) {
    try {
      await api.updateJobPayment(jobId, { payment_status: 'paid' });
      showToast(`${company} marked as paid`);
      refetch();
    } catch {
      showToast('Could not update payment status', 'error');
    }
  }

  async function markInvoiceSent(jobId: number) {
    try {
      await api.updateJobPayment(jobId, { payment_status: 'invoice_sent' });
      refetch();
    } catch { /* ignore */ }
  }

  return (
    <div className="mission-card" style={{ borderLeft: '3px solid #ef4444' }}>
      <div className="mission-card-header">
        <span className="mission-card-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" style={{ marginRight: 5 }}>
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
          Unpaid Invoices
        </span>
        {totalBalance > 0 && (
          <span style={{ fontSize: 13, fontWeight: 800, color: '#ef4444', marginLeft: 'auto' }}>{fmt(totalBalance)} outstanding</span>
        )}
      </div>

      {isLoading ? (
        <div style={{ padding: '12px 0', color: 'var(--text-faint)', fontSize: 12 }}>Checking…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {jobs.map((j) => (
            <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#ef444408', border: '1px solid #ef444422', borderRadius: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.company}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {j.vehicleCount} {j.vehicleType} · {fmt(j.revenue)}
                  {j.daysOverdue !== null && <span style={{ color: '#ef4444', marginLeft: 4 }}> · {j.daysOverdue}d ago</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {j.paymentStatus !== 'invoice_sent' && (
                  <button
                    onClick={() => markInvoiceSent(j.id)}
                    style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    Invoice Sent
                  </button>
                )}
                <button
                  onClick={() => markPaid(j.id, j.company)}
                  style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                >
                  Mark Paid ✓
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RetentionRadarCard({ onLeadClick }: { onLeadClick: (id: number) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['retention-radar'],
    queryFn: () => api.getRetentionRadar(),
    staleTime: 10 * 60_000,
  });

  const clients = data?.clients ?? [];
  if (!isLoading && clients.length === 0) return null;

  const totalEstValue = clients.reduce((s, c) => s + (REV_BY_CAT_RETENTION[c.wrap_category] ?? 2500) * c.vehicle_count, 0);

  function fmtK(n: number) { return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`; }

  return (
    <div style={{
      background: 'rgba(16,185,129,0.04)',
      border: '1px solid rgba(16,185,129,0.2)',
      borderRadius: 12,
      padding: '12px 16px',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 17 }}>🔄</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Retention Radar</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Past clients with aging wraps — re-engagement opportunities</div>
        </div>
        {!isLoading && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>{fmtK(totalEstValue)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>est. re-order value</div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {clients.map((c) => {
            const urgencyColor = agePctColor(c.age_pct);
            const vLabel = VEHICLE_LABEL[c.vehicle_type] ?? 'Vehicle';
            const catLabel = WRAP_CAT_LABEL[c.wrap_category] ?? c.wrap_category;
            const reOrderVal = (REV_BY_CAT_RETENTION[c.wrap_category] ?? 2500) * c.vehicle_count;
            const installYear = new Date(c.install_date).getFullYear();
            const yearsOld = (c.days_installed / 365.25).toFixed(1);

            return (
              <div
                key={c.job_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 8,
                  background: c.age_pct >= 90 ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${urgencyColor}22`,
                }}
              >
                {/* Age progress bar */}
                <div style={{ flexShrink: 0, width: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: urgencyColor }}>{c.age_pct}%</div>
                  <div style={{ width: 28, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, c.age_pct)}%`, height: '100%', background: urgencyColor, borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>of life</div>
                </div>

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.company}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {c.vehicle_count}× {vLabel} · {catLabel} · {installYear} ({yearsOld}yr)
                  </div>
                </div>

                {/* Contact recency */}
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: c.days_since_contact && c.days_since_contact > 180 ? '#f97316' : 'var(--text-muted)' }}>
                    {c.days_since_contact ? `${c.days_since_contact}d` : '—'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>since contact</div>
                </div>

                {/* Re-order value */}
                <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 36 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#10b981' }}>{fmtK(reOrderVal)}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>est.</div>
                </div>

                {/* CTA */}
                {c.lead_id && (
                  <button
                    onClick={() => onLeadClick(c.lead_id!)}
                    style={{
                      fontSize: 11, fontWeight: 700, color: '#10b981',
                      background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
                      borderRadius: 6, padding: '3px 10px', cursor: 'pointer', flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Re-engage →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Hot Opens Leaderboard ─────────────────────────────────────────────────────

const CAT_SHORT: Record<string, string> = {
  fleet: 'Fleet', dinoc: 'DI-NOC', gc_referral: 'GC', construction: 'Const.',
  colorchange: 'CC', racing: 'Racing', reatec: 'Reatec', design: 'Design',
  wallgraphics: 'Wall', other: 'Other',
};

const STATUS_DOT_HOT: Record<string, string> = {
  new: '#6b7280', contacted: '#3b82f6', replied: '#10b981',
  meeting: '#f59e0b', proposal: '#8b5cf6', won: '#10b981', lost: '#ef4444',
};

function daysAgoLabel(iso: string | null) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return '1d ago';
  return `${diff}d ago`;
}

function HotOpensLeaderboard({ onLeadClick }: { onLeadClick: (id: number) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hot-opens'],
    queryFn: () => api.getHotOpens(),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const prospects = data?.prospects ?? [];
  if (!isLoading && prospects.length === 0) return null;

  return (
    <div style={{
      background: 'rgba(239,68,68,0.04)',
      border: '1px solid rgba(239,68,68,0.18)',
      borderRadius: 12,
      padding: '12px 16px',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 17 }}>🔥</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Hot Prospects</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Opened your emails in the last 14 days — strike while hot</div>
        </div>
        {prospects.length > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#ef4444',
            background: 'rgba(239,68,68,0.12)', borderRadius: 99, padding: '2px 8px',
          }}>
            {prospects.length} engaged
          </span>
        )}
      </div>

      {isLoading ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '4px 0' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {prospects.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 8,
                background: i < 3 ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(239,68,68,0.1)',
              }}
            >
              {/* rank */}
              <span style={{
                fontSize: 11, fontWeight: 800, color: i === 0 ? '#ef4444' : i === 1 ? '#f97316' : 'var(--text-muted)',
                width: 16, textAlign: 'center', flexShrink: 0,
              }}>
                {i + 1}
              </span>

              {/* status dot */}
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: STATUS_DOT_HOT[p.status] ?? '#6b7280',
              }} />

              {/* company + category */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.company}
                </div>
                {p.last_subject && (
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    "{p.last_subject}"
                  </div>
                )}
              </div>

              {/* category chip */}
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
                background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 5px', flexShrink: 0,
              }}>
                {CAT_SHORT[p.category] ?? p.category}
              </span>

              {/* opens badge */}
              <span style={{
                fontSize: 11, fontWeight: 800, color: '#ef4444',
                background: 'rgba(239,68,68,0.12)', borderRadius: 99, padding: '2px 8px', flexShrink: 0,
              }}>
                {p.total_opens}×
              </span>

              {/* last opened */}
              <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0, minWidth: 44, textAlign: 'right' }}>
                {daysAgoLabel(p.last_opened)}
              </span>

              {/* CTA */}
              <button
                onClick={() => onLeadClick(p.id)}
                style={{
                  fontSize: 11, fontWeight: 700, color: '#ef4444',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 6, padding: '3px 10px', cursor: 'pointer', flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                Email Back →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── WrapLeads ROI Impact Strip ────────────────────────────────────────────────

function ImpactStrip() {
  const { data } = useQuery({
    queryKey: ['impact'],
    queryFn: () => api.getImpact(),
    staleTime: 5 * 60_000,
  });

  if (!data) return null;

  const { emailsGenerated, sequencesActivated, hoursSaved, wonCount, wonRevenue } = data;

  const hasActivity = emailsGenerated > 0 || sequencesActivated > 0 || wonCount > 0;
  if (!hasActivity) return null;

  const PLAN_COST = 79;
  const timeValue = Math.round(hoursSaved * 75);
  const totalValue = wonRevenue + timeValue;
  const roiMultiple = totalValue > 0 ? Math.max(1, Math.round(totalValue / PLAN_COST)) : 0;

  function fmtK(n: number) { return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`; }

  const chips: { icon: string; label: string; value: string | number; color: string }[] = [];
  if (emailsGenerated > 0) chips.push({ icon: '✉', label: 'AI emails written', value: emailsGenerated, color: '#3b82f6' });
  if (sequencesActivated > 0) chips.push({ icon: '⚡', label: 'sequences launched', value: sequencesActivated, color: '#8b5cf6' });
  if (hoursSaved > 0) chips.push({ icon: '⏱', label: 'hrs saved', value: hoursSaved, color: '#f59e0b' });
  if (wonCount > 0) chips.push({ icon: '🏆', label: 'won', value: `${wonCount} deals · ${fmtK(wonRevenue)}`, color: '#10b981' });

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(16,185,129,0.06))',
      border: '1px solid rgba(99,102,241,0.2)',
      borderRadius: 10,
      padding: '10px 14px',
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 14 }}>📈</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          This month:
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
        {chips.map((c) => (
          <span
            key={c.label}
            style={{
              fontSize: 11, fontWeight: 700, color: c.color,
              background: `${c.color}12`, border: `1px solid ${c.color}25`,
              borderRadius: 99, padding: '2px 10px', whiteSpace: 'nowrap',
            }}
          >
            {c.icon} {c.value} {c.label}
          </span>
        ))}
      </div>

      {roiMultiple > 1 && (
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#10b981' }}>{roiMultiple}×</span>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 4 }}>ROI vs. plan cost</span>
        </div>
      )}
    </div>
  );
}

const ONBOARDING_DISMISS_KEY = 'wl_onboarding_dismissed';

function SetupChecklist() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(ONBOARDING_DISMISS_KEY) === '1');

  const { data } = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => api.getOnboardingStatus(),
    staleTime: 5 * 60_000,
    enabled: !dismissed,
  });

  function dismiss() {
    localStorage.setItem(ONBOARDING_DISMISS_KEY, '1');
    setDismissed(true);
  }

  if (dismissed || !data) return null;
  if (data.completed === data.total) return null;

  const pct = Math.round((data.completed / data.total) * 100);

  return (
    <div style={{
      background: 'linear-gradient(135deg, #6366f108, #8b5cf608)',
      border: '1px solid #6366f130',
      borderRadius: 12,
      padding: '14px 18px',
      marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
            <svg viewBox="0 0 36 36" width="36" height="36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#6366f1" strokeWidth="3"
                strokeDasharray={`${pct} 100`} strokeDashoffset="25" strokeLinecap="round" />
            </svg>
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#6366f1' }}>{pct}%</span>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Getting started</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{data.completed} of {data.total} steps complete</div>
          </div>
        </div>
        <button onClick={dismiss} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          Dismiss
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.steps.map((step) => (
          <div key={step.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
              background: step.done ? '#6366f1' : 'transparent',
              border: step.done ? 'none' : '1.5px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {step.done && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: step.done ? 500 : 600, color: step.done ? 'var(--text-muted)' : 'var(--text)', textDecoration: step.done ? 'line-through' : 'none' }}>
                {step.title}
              </div>
              {!step.done && (
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{step.hint}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main MissionView ──────────────────────────────────────────────────────────

export default function MissionView() {
  const setMode = useAppStore((s) => s.setMode);
  const setFilter = useAppStore((s) => s.setFilter);
  const setCurrentLeadId = useAppStore((s) => s.setCurrentLeadId);
  const setQuickOpenTab = useAppStore((s) => s.setQuickOpenTab);
  const settings = useAppStore((s) => s.settings);
  const { leads } = useLeads();
  const [showBulk, setShowBulk] = useState(false);
  const [showEnrich, setShowEnrich] = useState(false);
  const [showProspector, setShowProspector] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);
  const [showROI, setShowROI] = useState(false);
  const [showCallSession, setShowCallSession] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mission'],
    queryFn: () => api.getMission(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const { data: briefData } = useQuery({
    queryKey: ['mission-brief'],
    queryFn: () => api.getMissionBrief(),
    staleTime: 60 * 60_000,
    enabled: !!data,
  });

  const { data: signalsData } = useQuery({
    queryKey: ['mission-signals'],
    queryFn: () => api.getMissionSignals(),
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  function goToLead(leadId: number) {
    setMode('leads');
    setCurrentLeadId(String(leadId));
  }

  function goToLeadEmail(leadId: number) {
    setQuickOpenTab('email');
    setMode('leads');
    setCurrentLeadId(String(leadId));
  }

  function goToLeadsFiltered(status?: string, category?: string) {
    setFilter({
      status: (status as LeadStatus) ?? 'all',
      category: (category as LeadCategory) ?? 'all',
      state: '', search: '',
    });
    setMode('leads');
  }

  // Hooks must be unconditional — compute before the early-return guard
  const expectedPipeline = useMemo(() => {
    return leads
      .filter((l) => !['won', 'lost'].includes(l.status))
      .reduce((sum, l) => sum + (winProbability(l) / 100) * (REV_EST[l.category] ?? 2500), 0);
  }, [leads]);

  const bidsDueSoon = useMemo(() => {
    const bw = data?.bidsThisWeek ?? [];
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 2); cutoff.setHours(23, 59, 59);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return bw.filter((b: { bid_due?: string }) => {
      if (!b.bid_due) return false;
      const d = new Date(b.bid_due);
      return d >= today && d <= cutoff;
    });
  }, [data?.bidsThisWeek]);

  if (isLoading || !data) {
    return (
      <div className="pv-loading">
        <span className="spinner spinner-lg" />
        <span>Building your mission briefing…</span>
      </div>
    );
  }

  const { overdue, newWithEmail, replied, bidsThisWeek, callReady, needsEmail, sequences, wonThisMonth, wonThisMonthRevenue, agingWraps, stuckDeals } = data;
  const totalActions = (callReady?.length ?? 0) + overdue.length + replied.length + bidsThisWeek.length;
  const hasBulkTargets = newWithEmail.length > 0;

  return (
    <div className="mission-root">
      {/* ── Header ── */}
      <div className="mission-header">
        <div>
          <div className="mission-date">{today()}</div>
          <h1 className="mission-title">
            {totalActions === 0 && newWithEmail.length === 0 && !needsEmail?.length
              ? "You're all caught up"
              : (callReady?.length ?? 0) > 0
              ? `${callReady!.length} lead${callReady!.length !== 1 ? 's' : ''} ready for your call`
              : totalActions === 0
              ? `${newWithEmail.length} leads ready to activate`
              : `${totalActions} action${totalActions !== 1 ? 's' : ''} need your attention`}
          </h1>
          <p className="mission-sub">
            {sequences.active} active sequences · {sequences.pendingEmails} emails queued · {wonThisMonth} won this month
            {expectedPipeline > 0 && (
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                {' '}· {fmt(Math.round(expectedPipeline))} expected
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StreakBadge />
          <button className="btn mission-header-btn" onClick={() => { setShowCampaigns((v) => !v); setShowProspector(false); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Campaigns
          </button>
          <button className="btn mission-header-btn" onClick={() => { setShowProspector((v) => !v); setShowCampaigns(false); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Prospector
          </button>
          <button className="btn mission-header-btn" onClick={() => setShowROI(true)} title="Wrap ROI Calculator">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            ROI
          </button>
          <button className="btn mission-header-btn" onClick={() => refetch()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── AI Brief ── */}
      {briefData?.brief && (
        <div className="mission-brief-bar">
          <span className="mission-brief-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3"/><circle cx="12" cy="12" r="10"/></svg></span>
          <span className="mission-brief-text">{briefData.brief}</span>
        </div>
      )}

      {/* ── Revenue Goal Bar ── */}
      <RevenueGoalBar
        revenue={wonThisMonthRevenue ?? 0}
        wonCount={wonThisMonth}
        goal={parseFloat(settings.monthlyRevenueGoal || '0')}
        onSetGoal={() => useAppStore.getState().setSettingsOpen(true)}
      />

      {/* ── SMS Inbox — inbound replies from prospects ── */}
      <SmsInboxCard />

      {/* ── Market Signals — press release auto-leads ── */}
      <SignalLeadsCard />

      {/* ── Fleet Growth Alerts — FMCSA fleet size change detection ── */}
      <FleetGrowthCard />

      {/* ── Material Inventory — low-stock vinyl/film alerts ── */}
      <MaterialInventoryCard />

      {/* ── Daily Briefing — AI morning snapshot ── */}
      <DailyBriefingCard />

      {/* ── Inbound Fleet Requests — from wrap-my-fleet consumer tool ── */}
      <InboundRequestsCard />

      {/* ── Top Prospects — highest heat score leads ── */}
      <TopProspectsCard onLeadClick={goToLead} />

      {/* ── Expiring Quotes — quotes about to lapse ── */}
      <ExpiringQuotesCard onLeadClick={goToLead} />

      {/* ── Speed Dial — top 5 leads to contact right now ── */}
      <SpeedDialCard />

      {/* ── Stale Pipeline — deals going cold with no activity ── */}
      <StalePipelineCard />

      {/* ── Referral Engine — AI referral ask for top won clients ── */}
      <ReferralEngineCard />

      {/* ── Objection Counter — AI responses to pricing/negative replies ── */}
      <ObjectionCounterCard />

      {/* ── Daily Task Queue — AI-generated + manual task list ── */}
      <TaskQueueCard />

      {/* ── Today's Score — gamified daily activity tracker ── */}
      <TodayScoreCard />

      {/* ── Win This Week — top 5 predicted closers this week ── */}
      <WinThisWeekCard />

      {/* ── Intent Signals — unified buying intent score ── */}
      <IntentSignalsCard />

      {/* ── Perfect Timing — email opens in the last 2 hours ── */}
      <PerfectTimingCard />

      {/* ── Proposals Gone Dark — sent 3+ days ago, no response ── */}
      <DarkProposalsCard />

      {/* ── Proposal Heat Score — ranked by recency × view count ── */}
      <ProposalHeatCard />

      {/* ── Hot Proposals ── */}
      <HotProposalsCard />

      {/* ── Lost Lead Rescue Queue ── */}
      <RescueQueueCard />

      {/* ── WrapLeads ROI Impact ── */}
      <ImpactStrip />

      {/* ── Setup Checklist ── */}
      <SetupChecklist />

      {/* ── Wrap Season Intelligence ── */}
      <WrapSeasonCard
        leads={leads}
        onFilter={(cat) => goToLeadsFiltered(undefined, cat)}
      />

      {/* ── Overdue Invoices — unpaid balances from completed jobs ── */}
      <OverdueInvoicesCard />

      {/* ── Retention Radar — aging wraps ready for re-engagement ── */}
      <RetentionRadarCard onLeadClick={goToLead} />

      {/* ── Hot Email Opens Leaderboard ── */}
      <HotOpensLeaderboard onLeadClick={goToLead} />

      {/* ── Hot Leads Leaderboard + Activity Feed ── */}
      <div className="mission-grid" style={{ marginBottom: 0, paddingBottom: 0 }}>
        <HotLeadsLeaderboard onLeadClick={goToLead} />
        <GlobalActivityFeed onLeadClick={goToLead} />
      </div>

      {/* ── Bids Due Today / Tomorrow ── */}
      {bidsDueSoon.length > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="3"/>
          </svg>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>
              {bidsDueSoon.length} bid{bidsDueSoon.length !== 1 ? 's' : ''} due within 48 hours
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
              {(bidsDueSoon as { project_name: string }[]).map((b) => b.project_name).join(' · ')}
            </span>
          </div>
          <button className="btn" style={{ fontSize: 11, flexShrink: 0, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={() => setMode('bids')}>
            View Bids →
          </button>
        </div>
      )}

      <div className="mission-grid">

        {/* ── CALL READY — sequence complete, pick up the phone ── */}
        {(callReady?.length ?? 0) > 0 && (
          <section className="mission-card mission-card-call" style={{ gridColumn: '1 / -1' }}>
            <div className="mission-card-header">
              <span className="mission-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/></svg></span>
              <span className="mission-card-title">Ready for Your Call — Sequence Complete</span>
              <span className="mission-badge mission-badge-green">{callReady!.length}</span>
              <button
                className="btn btn-primary"
                style={{ fontSize: 11, marginLeft: 'auto', padding: '4px 12px' }}
                onClick={() => setShowCallSession(true)}
              >
                🎯 Start Calling Session
              </button>
            </div>
            <p className="mission-call-desc">
              These leads received your full 3-email sequence and haven't replied yet.
              The next step is a phone call — email has done its job.
              {settings.vapiApiKey && settings.vapiPhoneNumberId
                ? <span className="mission-vapi-badge"> AI Auto-Call enabled</span>
                : <span className="mission-vapi-nudge"> · <button className="mission-link-btn" onClick={() => useAppStore.getState().setSettingsOpen(true)}>Add Vapi key</button> to enable AI auto-calling</span>}
            </p>
            <div className="mission-call-grid">
              {callReady!.map((l) => {
                const ago = daysAgo(l.last_contacted);
                return (
                  <div key={l.id} className="mission-call-card">
                    <div className="mission-call-name">{l.company}</div>
                    <div className="mission-call-meta">
                      {l.city && l.state ? `${l.city}, ${l.state} · ` : ''}{l.category}
                    </div>
                    <div className="mission-call-stats">
                      <span>{l.emails_sent ?? 3} emails sent</span>
                      {ago !== null && <span>{ago}d ago</span>}
                    </div>
                    <div className="mission-call-actions">
                      {l.phone ? (
                        <a href={`tel:${l.phone}`} className="mission-call-btn mission-call-btn-primary">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/></svg>
                          Call Now
                        </a>
                      ) : (
                        <button className="mission-call-btn" onClick={() => goToLead(l.id)}>
                          Add Phone # →
                        </button>
                      )}
                      {settings.vapiApiKey && settings.vapiPhoneNumberId && (
                        <AutoCallButton leadId={l.id} phone={l.phone} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Overdue Follow-ups ── */}
        {overdue.length > 0 && (
          <section className="mission-card mission-card-urgent">
            <div className="mission-card-header">
              <span className="mission-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
              <span className="mission-card-title">Overdue Follow-ups</span>
              <span className="mission-badge mission-badge-red">{overdue.length}</span>
            </div>
            <div className="mission-items">
              {overdue.map((l) => {
                const ago = daysAgo(l.followup_due_at);
                return (
                  <div key={l.id} className="mission-item">
                    <div className="mission-item-info">
                      <span className="mission-item-company">{l.company}</span>
                      <span className="mission-item-meta">{ago}d overdue · {l.category}</span>
                    </div>
                    <div className="mission-item-actions">
                      <button className="mission-action-btn" onClick={() => goToLead(l.id)}>
                        View →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="mission-card-footer-btn" onClick={() => goToLeadsFiltered('contacted')}>
              View all contacted leads →
            </button>
          </section>
        )}

        {/* ── Replied Leads (need proposals) ── */}
        {replied.length > 0 && (
          <section className="mission-card mission-card-hot">
            <div className="mission-card-header">
              <span className="mission-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
              <span className="mission-card-title">Replied — Send Proposals</span>
              <span className="mission-badge mission-badge-amber">{replied.length}</span>
            </div>
            <div className="mission-items">
              {replied.map((l) => {
                const ago = daysAgo(l.last_contacted);
                return (
                  <div key={l.id} className="mission-item">
                    <div className="mission-item-info">
                      <span className="mission-item-company">{l.company}</span>
                      <span className="mission-item-meta">{ago !== null ? `${ago}d ago` : ''} · {l.category}</span>
                    </div>
                    <button className="mission-action-btn mission-action-primary" onClick={() => goToLead(l.id)}>
                      Propose →
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Bids Due This Week ── */}
        {bidsThisWeek.length > 0 && (
          <section className="mission-card mission-card-deadline">
            <div className="mission-card-header">
              <span className="mission-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg></span>
              <span className="mission-card-title">Bids Due This Week</span>
              <span className="mission-badge mission-badge-blue">{bidsThisWeek.length}</span>
            </div>
            <div className="mission-items">
              {bidsThisWeek.map((b) => {
                const days = daysUntil(b.bid_due);
                return (
                  <div key={b.id} className="mission-item">
                    <div className="mission-item-info">
                      <span className="mission-item-company">{b.project_name}</span>
                      <span className="mission-item-meta">
                        {b.gc_name} · {days === 0 ? 'Due TODAY' : `${days}d left`}
                        {b.estimated_value ? ` · ${fmt(b.estimated_value)}` : ''}
                      </span>
                    </div>
                    <button className="mission-action-btn" onClick={() => setMode('bids')}>
                      Track →
                    </button>
                  </div>
                );
              })}
            </div>
            <button className="mission-card-footer-btn" onClick={() => setMode('bids')}>
              Open Bid Tracker →
            </button>
          </section>
        )}

        {/* ── Bulk Activate / New Leads ── */}
        {hasBulkTargets && !showBulk && (
          <section className="mission-card mission-card-activate">
            <div className="mission-card-header">
              <span className="mission-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></span>
              <span className="mission-card-title">Ready to Activate</span>
              <span className="mission-badge mission-badge-purple">{newWithEmail.length}</span>
            </div>
            <p className="mission-card-desc">
              {newWithEmail.length} leads have emails on file with no active drip sequence.
              Activate all at once — AI writes each sequence automatically.
            </p>
            <div className="mission-activate-preview">
              {newWithEmail.slice(0, 4).map((l) => (
                <span key={l.id} className="mission-preview-chip">{l.company}</span>
              ))}
              {newWithEmail.length > 4 && (
                <span className="mission-preview-chip mission-preview-more">+{newWithEmail.length - 4} more</span>
              )}
            </div>
            <button className="btn btn-primary mission-activate-btn" onClick={() => setShowBulk(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              Activate {newWithEmail.length} Sequences
            </button>
          </section>
        )}

        {showBulk && (
          <section className="mission-card mission-card-activate" style={{ gridColumn: '1 / -1' }}>
            <BulkActivatePanel
              leads={newWithEmail}
              onDone={() => { setShowBulk(false); refetch(); }}
            />
          </section>
        )}

        {/* ── Needs Email Enrichment ── */}
        {(needsEmail?.length ?? 0) > 0 && !showBulk && !showEnrich && (
          <section className="mission-card mission-card-enrich">
            <div className="mission-card-header">
              <span className="mission-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></span>
              <span className="mission-card-title">Needs Email — Can't Sequence Yet</span>
              <span className="mission-badge" style={{ background: '#6b7280' }}>{needsEmail!.length}</span>
            </div>
            <p className="mission-card-desc">
              These leads have no email on file. Auto-enrich all of them via Apollo.io in one click — email found → drip sequence fires automatically.
            </p>
            <div className="mission-items">
              {needsEmail!.slice(0, 5).map((l) => (
                <div key={l.id} className="mission-item">
                  <div className="mission-item-info">
                    <span className="mission-item-company">{l.company}</span>
                    <span className="mission-item-meta">{l.contact_title || l.category} · {l.city}, {l.state}</span>
                  </div>
                  <button className="mission-action-btn" onClick={() => goToLead(l.id)}>
                    View →
                  </button>
                </div>
              ))}
              {needsEmail!.length > 5 && (
                <div className="mission-item" style={{ justifyContent: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    +{needsEmail!.length - 5} more — {needsEmail!.length} total need email addresses
                  </span>
                </div>
              )}
            </div>
            <div className="mission-card-footer-actions">
              <button className="btn btn-primary" onClick={() => setShowEnrich(true)}>
                Auto-Enrich via Apollo
              </button>
              <button className="mission-card-footer-btn" onClick={() => goToLeadsFiltered('new')}>
                View all new leads →
              </button>
            </div>
          </section>
        )}

        {/* ── Apollo Bulk Enrich Panel ── */}
        {showEnrich && (needsEmail?.length ?? 0) > 0 && (
          <section className="mission-card mission-card-enrich" style={{ gridColumn: '1 / -1' }}>
            <EnrichPanel
              leads={needsEmail!}
              apolloKey={settings.apolloApiKey ?? ''}
              onDone={() => { setShowEnrich(false); refetch(); }}
            />
          </section>
        )}

        {/* ── Apollo Prospector ── */}
        {showProspector && (
          <section className="mission-card" style={{ gridColumn: '1 / -1', padding: 0, overflow: 'hidden' }}>
            <ProspectorPanel
              apolloKey={settings.apolloApiKey ?? ''}
              onClose={() => setShowProspector(false)}
              onImported={() => refetch()}
            />
          </section>
        )}

        {/* ── Campaign Blast ── */}
        {showCampaigns && (
          <section className="mission-card" style={{ gridColumn: '1 / -1', padding: 0, overflow: 'hidden' }}>
            <CampaignPanel onClose={() => setShowCampaigns(false)} />
          </section>
        )}

        {/* ── Aging Wraps Alert ── */}
        {(agingWraps ?? 0) > 0 && (
          <section className="mission-card" style={{ borderColor: '#f59e0b44' }}>
            <div className="mission-card-header">
              <span className="mission-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></span>
              <span className="mission-card-title">Wrap Refresh Opportunities</span>
              <span className="mission-badge mission-badge-amber">{agingWraps}</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 12px' }}>
              {agingWraps} installed wrap{agingWraps !== 1 ? 's are' : ' is'} approaching or past the refresh window. These are re-order opportunities with existing customers.
            </p>
            <button className="btn" onClick={() => setMode('jobs')}>View Aging Alerts →</button>
          </section>
        )}

        {/* ── Stuck Deals ── */}
        {(stuckDeals ?? []).length > 0 && (
          <section className="mission-card" style={{ borderColor: '#ef444440' }}>
            <div className="mission-card-header">
              <span className="mission-card-icon" style={{ color: '#ef4444' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </span>
              <span className="mission-card-title">Stuck Deals — No Activity in 14+ Days</span>
              <span className="mission-badge mission-badge-red">{stuckDeals!.length}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 10px', lineHeight: 1.5 }}>
              These deals are in active stages but haven't moved. Each day of silence reduces close probability.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stuckDeals!.map((deal) => (
                <div
                  key={deal.id}
                  className="mission-item"
                  onClick={() => goToLead(deal.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mission-item-main">
                      <span className="mission-item-company">{deal.company}</span>
                      <span className={`status-tag ${deal.status}`} style={{ fontSize: 10, marginLeft: 6 }}>{deal.status}</span>
                    </div>
                    <div className="mission-item-meta">
                      {deal.days_stale}d no activity · {deal.category}
                      {deal.city && deal.state ? ` · ${deal.city}, ${deal.state}` : ''}
                    </div>
                  </div>
                  {deal.email && (
                    <button
                      className="btn"
                      style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0, color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.3)' }}
                      title="Compose re-engagement email"
                      onClick={(e) => { e.stopPropagation(); goToLeadEmail(deal.id); }}
                    >
                      Email Now →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Stats strip ── */}
        <section className="mission-stats-row">
          <div className="mission-stat-card" onClick={() => goToLeadsFiltered('won')} role="button">
            <div className="mission-stat-val mission-stat-green">{wonThisMonth}</div>
            <div className="mission-stat-label">won this month</div>
          </div>
          <div className="mission-stat-card">
            <div className="mission-stat-val mission-stat-blue">{sequences.active}</div>
            <div className="mission-stat-label">active drip sequences</div>
          </div>
          <div className="mission-stat-card">
            <div className="mission-stat-val">{sequences.pendingEmails}</div>
            <div className="mission-stat-label">emails queued</div>
          </div>
          <div className="mission-stat-card" onClick={() => goToLeadsFiltered('new')} role="button">
            <div className="mission-stat-val mission-stat-purple">{newWithEmail.length}</div>
            <div className="mission-stat-label">new leads w/ email</div>
          </div>
          {(agingWraps ?? 0) > 0 && (
            <div className="mission-stat-card" onClick={() => setMode('jobs')} role="button">
              <div className="mission-stat-val" style={{ color: '#f59e0b' }}>{agingWraps}</div>
              <div className="mission-stat-label">wraps aging</div>
            </div>
          )}
        </section>

        {/* ── Deal Velocity Tracker ── */}
        <DealVelocityCard leads={leads} onLeadClick={goToLead} />

        {/* ── Seasonal Demand Radar ── */}
        <SeasonalRadar leads={leads} />

        {/* ── Live Signals ── */}
        {(signalsData?.signals?.length ?? 0) > 0 && (
          <section className="mission-card">
            <div className="mission-card-header">
              <span className="mission-section-label">Live Signals</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Recent engagement from your pipeline</span>
            </div>
            <div className="signal-feed">
              {signalsData!.signals.slice(0, 8).map((s, i) => {
                const SIGNAL_ICONS: Record<string, string> = {
                  email_opened: 'eye', proposal_viewed: 'doc', reply: 'mail', new_lead: 'star',
                };
                const diffMs = Date.now() - new Date(s.ts).getTime();
                const hrs = Math.floor(diffMs / 3_600_000);
                const ago = hrs < 1 ? `${Math.floor(diffMs / 60_000)}m ago` : hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
                return (
                  <button
                    key={i}
                    className="signal-item"
                    onClick={() => s.lead_id ? goToLead(s.lead_id) : goToLeadsFiltered()}
                  >
                    <span className="signal-icon">
                      {SIGNAL_ICONS[s.type] === 'eye' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                      {SIGNAL_ICONS[s.type] === 'doc' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
                      {SIGNAL_ICONS[s.type] === 'mail' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>}
                      {SIGNAL_ICONS[s.type] === 'star' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
                      {!SIGNAL_ICONS[s.type] && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
                    </span>
                    <div className="signal-body">
                      <span className="signal-company">{s.company}</span>
                      <span className="signal-title">{s.title}</span>
                    </div>
                    <span className="signal-time">{ago}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── All clear ── */}
        {totalActions === 0 && !hasBulkTargets && (
          <section className="mission-card mission-all-clear">
            <div className="mission-all-clear-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 className="mission-all-clear-title">Pipeline is clean.</h2>
            <p className="mission-all-clear-sub">No overdue follow-ups, no pending bids, no unworked leads.</p>
            <div className="mission-all-clear-actions">
              <button className="btn btn-primary" onClick={() => setMode('discover')}>Browse Discover</button>
              <button className="btn" onClick={() => setMode('leads')}>View All Leads</button>
            </div>
          </section>
        )}

      </div>

      {showROI && (
        <ROICalculatorModal
          onClose={() => setShowROI(false)}
          companyName={settings.companyName}
        />
      )}

      {showCallSession && callReady && callReady.length > 0 && (
        <CallSessionModal
          leads={callReady}
          onClose={() => setShowCallSession(false)}
        />
      )}
    </div>
  );
}
