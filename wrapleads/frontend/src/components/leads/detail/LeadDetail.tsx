import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLeads } from '../../../hooks/useLeads';
import { useAppStore } from '../../../store/useAppStore';
import { CATEGORIES, STATUSES } from '../../../api/types';
import { api } from '../../../api/client';
import InfoTab from './InfoTab';
import EmailTab from './EmailTab';
import NotesTab from './NotesTab';
import ActivityTab from './ActivityTab';
import DesignStudioTab from './DesignStudioTab';

type Tab = 'info' | 'email' | 'activity' | 'notes' | 'design';

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
  const { currentLeadId, setCurrentLeadId } = useAppStore((s) => ({
    currentLeadId: s.currentLeadId,
    setCurrentLeadId: s.setCurrentLeadId,
  }));
  const [activeTab, setActiveTab] = useState<Tab>('info');

  const lead = leads.find((l) => l.id === currentLeadId);

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

      <div className="lead-detail-tabs">
        {(['info', 'email', 'activity', 'notes', 'design'] as Tab[]).map((t) => (
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
        {activeTab === 'activity' && <ActivityTab lead={lead} />}
        {activeTab === 'notes'    && <NotesTab lead={lead} />}
        {activeTab === 'design'   && <DesignStudioTab lead={lead} />}
      </div>
    </aside>
  );
}
