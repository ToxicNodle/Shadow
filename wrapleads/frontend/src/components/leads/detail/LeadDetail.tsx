import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLeads } from '../../../hooks/useLeads';
import { useAppStore } from '../../../store/useAppStore';
import { CATEGORIES, STATUSES } from '../../../api/types';
import { api } from '../../../api/client';
import { winProbability, winProbabilityColor } from '../../../utils/scoring';
import type { Lead } from '../../../api/types';
import InfoTab from './InfoTab';
import EmailTab from './EmailTab';
import NotesTab from './NotesTab';
import ActivityTab from './ActivityTab';
import DesignStudioTab from './DesignStudioTab';
import QuotesTab from './QuotesTab';

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

type Tab = 'info' | 'email' | 'quotes' | 'activity' | 'notes' | 'design';

function PortalShareBtn({ leadServerId }: { leadServerId: number }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

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
          </div>
        </>
      )}
    </div>
  );
}

export default function LeadDetail() {
  const { leads } = useLeads();
  const { currentLeadId, setCurrentLeadId, quickOpenTab, setQuickOpenTab } = useAppStore((s) => ({
    currentLeadId: s.currentLeadId,
    setCurrentLeadId: s.setCurrentLeadId,
    quickOpenTab: s.quickOpenTab,
    setQuickOpenTab: s.setQuickOpenTab,
  }));
  const [activeTab, setActiveTab] = useState<Tab>('info');

  const lead = leads.find((l) => l.id === currentLeadId);

  // Consume quickOpenTab when a lead opens (e.g. from Mission "Email Now" shortcut)
  useEffect(() => {
    if (!lead || !quickOpenTab) return;
    setActiveTab(quickOpenTab);
    setQuickOpenTab(null);
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lead) return;
    const TAB_KEYS: Record<string, Tab> = {
      i: 'info', e: 'email', q: 'quotes', a: 'activity', n: 'notes', d: 'design',
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

  return (
    <aside className="lead-detail-panel" style={{ position: 'relative' }}>
      <div className="lead-detail-header">
        <button className="lead-detail-close" onClick={() => setCurrentLeadId(null)} title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="lead-detail-company">{lead.company}</div>
        <div className="lead-detail-meta">
          <span className={`status-tag ${lead.status}`}>{STATUSES[lead.status]}</span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{CATEGORIES[lead.category]}</span>
          {lead.city && lead.state && (
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{lead.city}, {lead.state}</span>
          )}
          {lead.serverId && <PortalShareBtn leadServerId={lead.serverId} />}
        </div>
      </div>
      <DealMetricsStrip lead={lead} />

      <div className="lead-detail-tabs">
        {(['info', 'email', 'quotes', 'activity', 'notes', 'design'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`detail-tab ${activeTab === t ? 'active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t === 'design' ? 'Design Studio' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="lead-detail-content" key={lead.id}>
        {activeTab === 'info'     && <InfoTab lead={lead} />}
        {activeTab === 'email'    && <EmailTab lead={lead} />}
        {activeTab === 'quotes'   && <QuotesTab lead={lead} />}
        {activeTab === 'activity' && <ActivityTab lead={lead} />}
        {activeTab === 'notes'    && <NotesTab lead={lead} />}
        {activeTab === 'design'   && <DesignStudioTab lead={lead} />}
      </div>
    </aside>
  );
}
