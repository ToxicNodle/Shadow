import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLeads } from '../../../hooks/useLeads';
import { useAppStore } from '../../../store/useAppStore';
import { CATEGORIES, STATUSES } from '../../../api/types';
import { api } from '../../../api/client';
import { winProbability, winProbabilityColor, scoreBreakdown, scoreLead, SCORE_COLORS, scoreLabel } from '../../../utils/scoring';
import type { Lead } from '../../../api/types';
import InfoTab from './InfoTab';
import EmailTab from './EmailTab';
import NotesTab from './NotesTab';
import ActivityTab from './ActivityTab';
import DesignStudioTab from './DesignStudioTab';
import QuotesTab from './QuotesTab';
import AIWhisper from './AIWhisper';
import CompetitiveIntelTab from './CompetitiveIntelTab';
import ProjectTab from './ProjectTab';
import SmsTab from './SmsTab';

// ── Deal Metrics Strip ────────────────────────────────────────────────────────
// Conservative avg revenue per lead category (mirrors REV_EST in other files)
const REV_EST: Record<string, number> = {
  fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000,
  colorchange: 3500, racing: 40000, reatec: 5500, design: 3000,
  wallgraphics: 2500, other: 2500,
};

// Active pipeline stages in order (excludes won/lost/cold)
const PIPELINE_STAGES = ['new', 'contacted', 'replied', 'meeting', 'proposal', 'won'] as const;
const STAGE_LABELS: Record<string, string> = {
  new: 'New', contacted: 'Contacted', replied: 'Replied',
  meeting: 'Meeting', proposal: 'Proposal', won: 'Won',
};
const STAGE_COLORS: Record<string, string> = {
  new: '#6366f1', contacted: '#3b82f6', replied: '#0ea5e9',
  meeting: '#f59e0b', proposal: '#f97316', won: '#22c55e',
};

function DealMetricsStrip({ lead }: { lead: Lead }) {
  const prob = winProbability(lead);
  const probColor = winProbabilityColor(prob);
  const dealEst = REV_EST[lead.category] ?? 2500;
  const expectedVal = Math.round((prob / 100) * dealEst);
  const daysInPipeline = lead.createdAt
    ? Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86_400_000)
    : null;

  // Stage progress indicator
  const stageIdx = PIPELINE_STAGES.indexOf(lead.status as typeof PIPELINE_STAGES[number]);
  const isActive = stageIdx >= 0;

  function fmtK(n: number) {
    return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toLocaleString()}`;
  }

  if (lead.status === 'lost' || lead.status === 'cold') return null;

  return (
    <div style={{ padding: '8px 16px 4px', borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Pipeline stage progress */}
      {isActive && (
        <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
          {PIPELINE_STAGES.map((s, i) => {
            const active = i <= stageIdx;
            const current = i === stageIdx;
            return (
              <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{
                  height: 3, width: '100%', borderRadius: 99,
                  background: active ? (STAGE_COLORS[s] ?? 'var(--accent)') : 'var(--border)',
                  transition: 'background 0.2s',
                }} />
                {current && (
                  <span style={{ fontSize: 9, color: STAGE_COLORS[s], fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {STAGE_LABELS[s]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Metrics row */}
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)', paddingBottom: 6 }}>
        <span>
          Est. deal{' '}
          <strong style={{ color: 'var(--text)' }}>{fmtK(dealEst)}</strong>
        </span>
        <span>·</span>
        <span>
          Win prob{' '}
          <strong style={{ color: probColor }}>{prob}%</strong>
        </span>
        <span>·</span>
        <span>
          Expected{' '}
          <strong style={{ color: '#10b981' }}>{fmtK(expectedVal)}</strong>
        </span>
        {daysInPipeline !== null && (
          <>
            <span>·</span>
            <span style={{ marginLeft: 'auto' }}>
              <strong style={{ color: daysInPipeline > 45 ? '#f59e0b' : 'var(--text)' }}>
                {daysInPipeline}d
              </strong>{' '}in pipeline
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Next Best Action Bar ──────────────────────────────────────────────────────
interface NBA {
  icon: string;
  text: string;
  cta: string;
  tab: string | null;
  color: string;
  urgency: 'high' | 'medium' | 'low';
}

function computeNBA(lead: Lead): NBA | null {
  const now = Date.now();
  const daysSince = lead.lastContacted
    ? Math.floor((now - new Date(lead.lastContacted).getTime()) / 86_400_000)
    : null;
  const overdueBy = lead.followupDueAt && new Date(lead.followupDueAt).getTime() < now
    ? Math.floor((now - new Date(lead.followupDueAt).getTime()) / 86_400_000)
    : null;

  // Overdue — highest priority
  if (overdueBy !== null && !['won', 'lost'].includes(lead.status)) {
    return {
      icon: '⚠',
      text: overdueBy === 0 ? 'Follow-up due today.' : `Follow-up ${overdueBy}d overdue.`,
      cta: 'Draft Email →',
      tab: 'email',
      color: '#ef4444',
      urgency: 'high',
    };
  }

  if (lead.status === 'won' || lead.status === 'lost' || lead.status === 'cold') return null;

  // No email — unlock enrichment
  if (!lead.email && !lead.phone && lead.status === 'new') {
    return {
      icon: '🔍',
      text: 'No contact info yet — add an email or phone to enable AI outreach.',
      cta: 'Add Info →',
      tab: 'info',
      color: '#6366f1',
      urgency: 'medium',
    };
  }

  // New — never touched
  if (lead.status === 'new') {
    return {
      icon: '✉',
      text: 'First touch not sent yet. AI can write a personalized opener in seconds.',
      cta: 'Generate Email →',
      tab: 'email',
      color: '#3b82f6',
      urgency: 'medium',
    };
  }

  // Contacted — push for reply
  if (lead.status === 'contacted') {
    if (daysSince !== null && daysSince > 10) {
      return {
        icon: '📬',
        text: `${daysSince} days since last contact. A short follow-up doubles reply rates.`,
        cta: 'Follow Up →',
        tab: 'email',
        color: '#f59e0b',
        urgency: daysSince > 21 ? 'high' : 'medium',
      };
    }
    return {
      icon: '📬',
      text: 'Waiting for reply. Consider a personalized follow-up if no response by day 7.',
      cta: 'Draft Follow-up →',
      tab: 'email',
      color: '#64748b',
      urgency: 'low',
    };
  }

  // Replied — move to meeting
  if (lead.status === 'replied') {
    return {
      icon: '📞',
      text: 'They replied! Hot moment — schedule a call or discovery meeting now.',
      cta: 'Log Meeting →',
      tab: 'activity',
      color: '#10b981',
      urgency: 'high',
    };
  }

  // Meeting — generate proposal
  if (lead.status === 'meeting') {
    return {
      icon: '📋',
      text: 'Meeting set. Strike while it\'s fresh — generate a quote while details are top of mind.',
      cta: 'Build Quote →',
      tab: 'quotes',
      color: '#f97316',
      urgency: 'medium',
    };
  }

  // Proposal — follow up for decision
  if (lead.status === 'proposal') {
    if (daysSince !== null && daysSince > 5) {
      return {
        icon: '🤝',
        text: `Proposal sent ${daysSince} days ago. A friendly check-in drives 40% faster decisions.`,
        cta: 'Check In →',
        tab: 'email',
        color: '#f59e0b',
        urgency: daysSince > 14 ? 'high' : 'medium',
      };
    }
    return {
      icon: '🤝',
      text: 'Proposal out — give them a few days, then follow up with a decision prompt.',
      cta: 'Plan Follow-up →',
      tab: 'email',
      color: '#64748b',
      urgency: 'low',
    };
  }

  return null;
}

function NextActionBar({ lead, onTabChange }: { lead: Lead; onTabChange: (t: string) => void }) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const dismissKey = `wl_nba_dismissed_${lead.id}_${todayKey}`;
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(dismissKey));

  const nba = computeNBA(lead);
  if (!nba || dismissed) return null;

  function dismiss(e: React.MouseEvent) {
    e.stopPropagation();
    localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  }

  const bg = nba.urgency === 'high'
    ? `${nba.color}15`
    : nba.urgency === 'medium' ? `${nba.color}0d` : 'var(--surface)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px',
      background: bg,
      borderBottom: `1px solid ${nba.color}28`,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{nba.icon}</span>
      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, lineHeight: 1.4 }}>{nba.text}</span>
      {nba.tab && (
        <button
          onClick={() => nba.tab && onTabChange(nba.tab)}
          style={{
            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
            padding: '4px 10px', borderRadius: 6, border: `1px solid ${nba.color}50`,
            background: `${nba.color}18`, color: nba.color, cursor: 'pointer',
          }}
        >
          {nba.cta}
        </button>
      )}
      <button
        onClick={dismiss}
        title="Dismiss for today"
        style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, lineHeight: 1, padding: '2px 4px' }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Score Breakdown Modal ─────────────────────────────────────────────────────
const SCORE_TIPS: Record<string, { condition: (l: Lead) => boolean; tip: string }[]> = {
  fleet: [
    { condition: (l) => !parseInt(l.fleetSize) || parseInt(l.fleetSize) < 5, tip: 'Ask about fleet size — even a rough number unlocks 6–30 pts.' },
  ],
  data: [
    { condition: (l) => !l.email, tip: 'Add email address (+6 pts). Use Apollo enrichment to find it.' },
    { condition: (l) => !l.contactName, tip: 'Add a contact name (+4 pts). Check LinkedIn or Google Maps.' },
    { condition: (l) => !l.phone, tip: 'Add a phone number (+3 pts). Look up the company on Google.' },
    { condition: (l) => !l.pitchAngle, tip: 'Set a pitch angle (+2 pts). Describe the wrap opportunity in one line.' },
  ],
  status: [
    { condition: (l) => l.status === 'new', tip: 'Send first touch — moving to Contacted adds +10 pts.' },
    { condition: (l) => l.status === 'contacted', tip: 'Get a reply — moving to Replied adds +15 pts and 2× close probability.' },
    { condition: (l) => l.status === 'replied', tip: 'Book a meeting — adds +20 pts and puts you in the top-tier close window.' },
  ],
};

function ScoreBreakdownModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const bd = scoreBreakdown(lead);
  const prob = winProbability(lead);
  const lbl = scoreLabel(bd.total);
  const color = SCORE_COLORS[lbl];

  // Collect applicable improvement tips
  const tips: string[] = [];
  for (const [key, checks] of Object.entries(SCORE_TIPS)) {
    void key;
    for (const { condition, tip } of checks) {
      if (condition(lead)) tips.push(tip);
    }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 380, maxHeight: '85vh', overflowY: 'auto',
        background: 'var(--bg-elev)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24, zIndex: 2001,
        boxShadow: '0 20px 60px rgba(0,0,0,.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Lead Health Score</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lead.company}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Score gauge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: '14px 16px', background: 'var(--surface)', borderRadius: 10 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            border: `4px solid ${color}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 20, fontWeight: 800, color }}>{bd.total}</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{lbl}</span>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>{prob}%</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>estimated close probability</div>
          </div>
        </div>

        {/* Factor bars */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Score Breakdown</div>
          {bd.factors.map((f) => {
            const pct = f.max > 0 ? (f.points / f.max) * 100 : 0;
            const barColor = pct >= 80 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
            return (
              <div key={f.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text)' }}>{f.label}</span>
                  <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{f.points}/{f.max}</span>
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 99, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Coaching tips */}
        {tips.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              How to Improve
            </div>
            {tips.map((tip, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                <span style={{ color: '#f59e0b', flexShrink: 0 }}>→</span>
                {tip}
              </div>
            ))}
          </div>
        )}
        {tips.length === 0 && (
          <div style={{ fontSize: 12, color: '#10b981', textAlign: 'center', padding: '8px 0' }}>
            ✓ This lead is fully optimized. Focus on moving through pipeline stages.
          </div>
        )}
      </div>
    </>
  );
}

type Tab = 'timeline' | 'email' | 'quotes' | 'notes' | 'design' | 'intel' | 'project' | 'sms';

function PortalShareBtn({ leadServerId }: { leadServerId: number }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [fleetUrl, setFleetUrl] = useState<string | null>(null);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetCopied, setFleetCopied] = useState(false);

  async function generateFleetDash() {
    setFleetLoading(true);
    try {
      const r = await api.generateFleetDashboard(leadServerId);
      setFleetUrl(r.url);
    } finally {
      setFleetLoading(false);
    }
  }

  function copyFleetUrl() {
    if (!fleetUrl) return;
    navigator.clipboard.writeText(fleetUrl);
    setFleetCopied(true);
    setTimeout(() => setFleetCopied(false), 2000);
  }

  const { data } = useQuery({
    queryKey: ['portal-link', leadServerId],
    queryFn: () => api.getPortalLink(leadServerId),
    staleTime: 60_000,
    enabled: showPanel,
  });

  const createMut = useMutation({
    mutationFn: () => api.createPortalLink(leadServerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-link', leadServerId] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deletePortalLink(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-link', leadServerId] }),
  });

  const link = data?.link;
  const portalUrl = link ? api.getPortalUrl(link.token) : null;

  function copyUrl() {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="btn"
        style={{ fontSize: 11 }}
        onClick={() => setShowPanel((o) => !o)}
        title="Share client portal"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Share
      </button>
      {showPanel && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowPanel(false)} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 300,
            background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10,
            padding: 16, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,.4)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Client Portal</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              Share a private link with your client. They can view job status, photos, quote, and approve online.
            </p>
            {!link ? (
              <button className="btn btn-primary" style={{ width: '100%', fontSize: 12 }}
                disabled={createMut.isPending} onClick={() => createMut.mutate()}>
                {createMut.isPending ? 'Generating…' : 'Generate Portal Link'}
              </button>
            ) : (
              <>
                <div style={{ background: 'var(--bg-elev-2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', color: 'var(--text-muted)', marginBottom: 8 }}>
                  {portalUrl}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary" style={{ flex: 1, fontSize: 11 }} onClick={copyUrl}>
                    {copied ? '✓ Copied!' : 'Copy Link'}
                  </button>
                  <button className="btn" style={{ fontSize: 11 }} onClick={() => window.open(portalUrl!, '_blank')}>
                    Preview
                  </button>
                  <button className="btn" style={{ fontSize: 11, color: 'var(--red)' }}
                    onClick={() => deleteMut.mutate(link.id)} disabled={deleteMut.isPending}>
                    Revoke
                  </button>
                </div>
              </>
            )}

            {/* Fleet Maintenance Dashboard */}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>🚛 Fleet Wrap Dashboard</div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                Share a permanent care guide + wrap history page for this fleet client.
              </p>
              {!fleetUrl ? (
                <button className="btn" style={{ width: '100%', fontSize: 11 }}
                  disabled={fleetLoading} onClick={generateFleetDash}>
                  {fleetLoading ? 'Generating…' : 'Generate Fleet Dashboard'}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary" style={{ flex: 1, fontSize: 11 }} onClick={copyFleetUrl}>
                    {fleetCopied ? '✓ Copied!' : 'Copy Fleet URL'}
                  </button>
                  <button className="btn" style={{ fontSize: 11 }} onClick={() => window.open(fleetUrl, '_blank')}>
                    Preview
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function LeadDetail() {
  const { leads } = useLeads();
  const { currentLeadId, setCurrentLeadId, quickOpenTab, setQuickOpenTab, setMode, setPendingDiscoverSearch } = useAppStore((s) => ({
    currentLeadId: s.currentLeadId,
    setCurrentLeadId: s.setCurrentLeadId,
    quickOpenTab: s.quickOpenTab,
    setQuickOpenTab: s.setQuickOpenTab,
    setMode: s.setMode,
    setPendingDiscoverSearch: s.setPendingDiscoverSearch,
  }));
  const [activeTab, setActiveTab] = useState<Tab>('timeline');
  const [showScoreModal, setShowScoreModal] = useState(false);

  const lead = leads.find((l) => l.id === currentLeadId);

  // Map legacy quickOpenTab values into the new tab set
  useEffect(() => {
    if (!lead || !quickOpenTab) return;
    const mapping: Record<string, Tab> = {
      email: 'email', quotes: 'quotes', notes: 'notes',
      design: 'design', activity: 'timeline', info: 'timeline',
    };
    setActiveTab(mapping[quickOpenTab] ?? 'timeline');
    setQuickOpenTab(null);
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lead) return;
    const TAB_KEYS: Record<string, Tab> = {
      t: 'timeline', e: 'email', q: 'quotes', n: 'notes', d: 'design', i: 'intel',
    };
    function onKey(ev: KeyboardEvent) {
      const tag = (ev.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === 'Escape') { setCurrentLeadId(null); return; }
      const next = TAB_KEYS[ev.key.toLowerCase()];
      if (next) { ev.preventDefault(); setActiveTab(next); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lead, setCurrentLeadId]);

  if (!lead) {
    return <div className="lead-detail-panel closed" />;
  }

  // Map NBA tab targets to our new tab set
  function handleNBATab(t: string) {
    const mapping: Record<string, Tab> = {
      email: 'email', quotes: 'quotes', notes: 'notes',
      design: 'design', activity: 'timeline', info: 'timeline',
    };
    setActiveTab(mapping[t] ?? 'timeline');
  }

  const scoreColor = SCORE_COLORS[scoreLabel(scoreLead(lead))];

  return (
    <aside className="lead-detail-panel lead-detail-panel--wide" style={{ position: 'relative' }}>
      {/* ── Slim header ── */}
      <div className="lead-detail-header">
        <button className="lead-detail-close" onClick={() => setCurrentLeadId(null)} title="Close (Esc)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="lead-detail-company">{lead.company}</div>
        <div className="lead-detail-meta">
          <span className={`status-tag ${lead.status}`}>{STATUSES[lead.status]}</span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{CATEGORIES[lead.category]}</span>
          {lead.city && lead.state && (
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{lead.city}, {lead.state}</span>
          )}
          <button
            onClick={() => setShowScoreModal(true)}
            title="View score breakdown"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 99, border: 'none', cursor: 'pointer',
              background: scoreColor + '22', color: scoreColor, fontSize: 11, fontWeight: 700,
            }}
          >
            {scoreLead(lead)} pts
          </button>
          {lead.serverId && <PortalShareBtn leadServerId={lead.serverId} />}
          <button
            className="btn"
            style={{ fontSize: 11 }}
            title="Find similar companies in the FMCSA database"
            onClick={() => {
              const CAT_TO_INDUSTRY: Record<string, string> = {
                fleet: 'freight', construction: 'construction_fleet',
                gc_referral: 'construction_general', racing: 'trucking',
                dinoc: 'freight', reatec: 'freight', colorchange: 'freight',
                design: 'design_general', wallgraphics: 'design_general',
              };
              const fleet = parseInt(lead.fleetSize ?? '') || 0;
              setPendingDiscoverSearch({
                states: lead.state ? [lead.state] : null,
                industries: CAT_TO_INDUSTRY[lead.category] ? [CAT_TO_INDUSTRY[lead.category]] : null,
                minFleet: fleet > 0 ? Math.max(1, Math.floor(fleet * 0.5)) : null,
                maxFleet: fleet > 0 ? Math.ceil(fleet * 2) : null,
                sort: 'wrap_score', limit: 25, offset: 0,
              });
              setMode('discover');
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Find Similar
          </button>
        </div>
      </div>

      <DealMetricsStrip lead={lead} />
      <NextActionBar lead={lead} onTabChange={handleNBATab} />
      <AIWhisper lead={lead} />
      {showScoreModal && <ScoreBreakdownModal lead={lead} onClose={() => setShowScoreModal(false)} />}

      {/* ── Two-pane body ── */}
      <div className="lead-detail-two-pane">
        {/* Left — editable contact/info + AI tools */}
        <div className="ld-left">
          <InfoTab lead={lead} />
        </div>

        {/* Right — activity timeline + communication tabs */}
        <div className="ld-right">
          <div className="ld-right-tabs">
            {([
              { id: 'timeline', label: 'Timeline' },
              { id: 'email',    label: 'Email' },
              { id: 'sms',      label: '📱 SMS' },
              { id: 'quotes',   label: 'Quotes' },
              { id: 'notes',    label: 'Notes' },
              { id: 'design',   label: 'Design' },
              { id: 'intel',    label: '⚔ Intel' },
              { id: 'project',  label: '📋 Project' },
            ] as { id: Tab; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                className={`ld-tab ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ld-right-content" key={lead.id}>
            {activeTab === 'timeline' && <ActivityTab lead={lead} />}
            {activeTab === 'email'    && <EmailTab lead={lead} />}
            {activeTab === 'sms'      && <SmsTab lead={lead} />}
            {activeTab === 'quotes'   && <QuotesTab lead={lead} />}
            {activeTab === 'notes'    && <NotesTab lead={lead} />}
            {activeTab === 'design'   && <DesignStudioTab lead={lead} />}
            {activeTab === 'intel'    && <CompetitiveIntelTab lead={lead} />}
            {activeTab === 'project'  && <ProjectTab lead={lead} />}
          </div>
        </div>
      </div>
    </aside>
  );
}
