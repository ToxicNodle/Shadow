import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import ROICalculatorModal from '../modals/ROICalculatorModal';
import type { LeadStatus, LeadCategory } from '../../api/types';

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
    n.has(id) ? n.delete(id) : n.add(id);
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
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
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

// ── Revenue Goal Bar ─────────────────────────────────────────────────────────

function RevenueGoalBar({ revenue, wonCount, goal, onSetGoal }: {
  revenue: number;
  wonCount: number;
  goal: number;
  onSetGoal: () => void;
}) {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();
  const monthName = now.toLocaleString('default', { month: 'long' });
  const pct = goal > 0 ? Math.min(100, Math.round((revenue / goal) * 100)) : 0;
  const color = pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#6366f1';
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <div className="revenue-goal-bar">
      <div className="revenue-goal-left">
        <span className="revenue-goal-month">{monthName}</span>
        <span className="revenue-goal-days">{daysLeft}d left</span>
      </div>
      <div className="revenue-goal-center">
        {goal > 0 ? (
          <>
            <div className="revenue-goal-track">
              <div className="revenue-goal-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <div className="revenue-goal-labels">
              <span style={{ color }}>
                {fmt(revenue)} closed
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
  );
}

// ── Main MissionView ──────────────────────────────────────────────────────────

export default function MissionView() {
  const setMode = useAppStore((s) => s.setMode);
  const setFilter = useAppStore((s) => s.setFilter);
  const setCurrentLeadId = useAppStore((s) => s.setCurrentLeadId);
  const setQuickOpenTab = useAppStore((s) => s.setQuickOpenTab);
  const settings = useAppStore((s) => s.settings);
  const [showBulk, setShowBulk] = useState(false);
  const [showEnrich, setShowEnrich] = useState(false);
  const [showProspector, setShowProspector] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);
  const [showROI, setShowROI] = useState(false);

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
            {sequences.active} active drip sequences · {sequences.pendingEmails} emails queued · {wonThisMonth} won this month
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
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

      <div className="mission-grid">

        {/* ── CALL READY — sequence complete, pick up the phone ── */}
        {(callReady?.length ?? 0) > 0 && (
          <section className="mission-card mission-card-call" style={{ gridColumn: '1 / -1' }}>
            <div className="mission-card-header">
              <span className="mission-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/></svg></span>
              <span className="mission-card-title">Ready for Your Call — Sequence Complete</span>
              <span className="mission-badge mission-badge-green">{callReady!.length}</span>
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
    </div>
  );
}
