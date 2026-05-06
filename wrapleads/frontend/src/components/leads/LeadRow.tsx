import type { Lead } from '../../api/types';
import { CATEGORIES, STATUSES } from '../../api/types';
import { useAppStore } from '../../store/useAppStore';

interface Props {
  lead: Lead;
  selected: boolean;
}

export default function LeadRow({ lead, selected }: Props) {
  const setCurrentLeadId = useAppStore((s) => s.setCurrentLeadId);

  function fmt(date: string) {
    if (!date) return '—';
    try {
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(date));
    } catch {
      return '—';
    }
  }

  return (
    <div
      className={`lead-row ${selected ? 'selected' : ''}`}
      onClick={() => setCurrentLeadId(lead.id)}
    >
      <div>
        <div className="lead-company">{lead.company}</div>
        <div className="lead-contact">
          {lead.contactName || <span style={{ color: 'var(--text-faint)' }}>No contact</span>}
          {lead.contactTitle ? ` · ${lead.contactTitle}` : ''}
        </div>
      </div>

      <div className="lead-location">
        {lead.city && lead.state ? `${lead.city}, ${lead.state}` : lead.state || '—'}
      </div>

      <div className="lead-fleet">{lead.fleetSize || '—'}</div>

      <div>
        <span className={`status-tag ${lead.status}`}>{STATUSES[lead.status]}</span>
      </div>

      <div className="lead-email" title={lead.email}>{lead.email || '—'}</div>

      <div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>
          {CATEGORIES[lead.category]}
        </div>
        <div className="lead-date">{fmt(lead.lastContacted)}</div>
      </div>

      <div>
        <button
          className="lead-menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            setCurrentLeadId(lead.id);
          }}
          title="Open"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
