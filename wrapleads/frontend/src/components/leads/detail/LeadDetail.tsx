import { useState } from 'react';
import { useLeads } from '../../../hooks/useLeads';
import { useAppStore } from '../../../store/useAppStore';
import { CATEGORIES, STATUSES } from '../../../api/types';
import InfoTab from './InfoTab';
import EmailTab from './EmailTab';
import NotesTab from './NotesTab';
import ActivityTab from './ActivityTab';

type Tab = 'info' | 'email' | 'activity' | 'notes';

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
        </div>
      </div>

      <div className="lead-detail-tabs">
        {(['info', 'email', 'activity', 'notes'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`detail-tab ${activeTab === t ? 'active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="lead-detail-content">
        {activeTab === 'info'     && <InfoTab lead={lead} />}
        {activeTab === 'email'    && <EmailTab lead={lead} />}
        {activeTab === 'activity' && <ActivityTab lead={lead} />}
        {activeTab === 'notes'    && <NotesTab lead={lead} />}
      </div>
    </aside>
  );
}
