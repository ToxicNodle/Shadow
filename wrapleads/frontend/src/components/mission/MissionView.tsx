import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import ROICalculatorModal from '../modals/ROICalculatorModal';

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
    <span className="mission-call-no-phone">No phone #</span>
  );

  const labels: Record<CallState, string> = {
    idle: '🤖 Auto-Call',
    calling: 'Dialing…',
    'in-progress': '📞 On Call…',
    done: '✓ Call Done',
    voicemail: '📬 Left VM',
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
        <div className="mission-bulk-result-icon">🚀</div>
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
          {mut.isPending ? `Activating ${selected.size}…` : `🚀 Activate ${selected.size} Sequences`}
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
        <div className="mission-bulk-result-icon">✅</div>
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
            : `🔍 Enrich ${selected.size} Leads`}
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
  const [industry, setIndustry] = useState(PROSPECT_INDUSTRIES[0]);
  const [location, setLocation] = useState('Indianapolis, Indiana');
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
        <span className="mission-prospector-title">🌐 Apollo Prospector — Find New Leads</span>
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
        <span className="mission-prospector-title">📅 Seasonal Campaign Blasts</span>
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
                      {isLaunching ? 'Launching…' : c.leadCount === 0 ? 'No matches' : '🚀 Launch'}
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

// ── Main MissionView ──────────────────────────────────────────────────────────

export default function MissionView() {
  const setMode = useAppStore((s) => s.setMode);
  const setFilter = useAppStore((s) => s.setFilter);
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

  function goToLead(_leadId: number) {
    // navigate to leads mode — the lead will be in the list
    setMode('leads');
  }

  function goToLeadsFiltered(status?: string, category?: string) {
    setFilter({
      status: (status as any) ?? 'all',
      category: (category as any) ?? 'all',
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

  const { overdue, newWithEmail, replied, bidsThisWeek, callReady, needsEmail, sequences, wonThisMonth, agingWraps } = data;
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
              ? "You're all caught up 🏆"
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
          <button className="btn" onClick={() => { setShowCampaigns((v) => !v); setShowProspector(false); }}>
            📅 Campaigns
          </button>
          <button className="btn" onClick={() => { setShowProspector((v) => !v); setShowCampaigns(false); }}>
            🌐 Prospector
          </button>
          <button className="btn" onClick={() => setShowROI(true)} title="Wrap ROI Calculator">
            📊 ROI
          </button>
          <button className="btn" onClick={() => refetch()}>↻ Refresh</button>
        </div>
      </div>

      {/* ── AI Brief ── */}
      {briefData?.brief && (
        <div className="mission-brief-bar">
          <span className="mission-brief-icon">🧠</span>
          <span className="mission-brief-text">{briefData.brief}</span>
        </div>
      )}

      <div className="mission-grid">

        {/* ── CALL READY — sequence complete, pick up the phone ── */}
        {(callReady?.length ?? 0) > 0 && (
          <section className="mission-card mission-card-call" style={{ gridColumn: '1 / -1' }}>
            <div className="mission-card-header">
              <span className="mission-card-icon">📞</span>
              <span className="mission-card-title">Ready for Your Call — Sequence Complete</span>
              <span className="mission-badge mission-badge-green">{callReady!.length}</span>
            </div>
            <p className="mission-call-desc">
              These leads received your full 3-email sequence and haven't replied yet.
              The next step is a phone call — email has done its job.
              {settings.vapiApiKey && settings.vapiPhoneNumberId
                ? <span className="mission-vapi-badge"> 🤖 AI Auto-Call enabled</span>
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
                          📞 Call Now
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
              <span className="mission-card-icon">⚠</span>
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
              <span className="mission-card-icon">💬</span>
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
              <span className="mission-card-icon">🏗</span>
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
              <span className="mission-card-icon">🚀</span>
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
              🚀 Activate {newWithEmail.length} Sequences Now
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
              <span className="mission-card-icon">🔍</span>
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
                ⚡ Auto-Enrich All via Apollo
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
              <span className="mission-card-icon">🔄</span>
              <span className="mission-card-title">Wrap Refresh Opportunities</span>
              <span className="mission-badge mission-badge-amber">{agingWraps}</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 12px' }}>
              {agingWraps} installed wrap{agingWraps !== 1 ? 's are' : ' is'} approaching or past the refresh window. These are re-order opportunities with existing customers.
            </p>
            <button className="btn" onClick={() => setMode('jobs')}>View Aging Alerts →</button>
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
                  email_opened: '👁', proposal_viewed: '📄', reply: '✉️', new_lead: '⭐',
                };
                const diffMs = Date.now() - new Date(s.ts).getTime();
                const hrs = Math.floor(diffMs / 3_600_000);
                const ago = hrs < 1 ? `${Math.floor(diffMs / 60_000)}m ago` : hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
                return (
                  <button
                    key={i}
                    className="signal-item"
                    onClick={() => goToLeadsFiltered()}
                  >
                    <span className="signal-icon">{SIGNAL_ICONS[s.type] ?? '🔔'}</span>
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
            <div className="mission-all-clear-icon">🏆</div>
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
