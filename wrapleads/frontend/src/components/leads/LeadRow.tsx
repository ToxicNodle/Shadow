import type { Lead } from '../../api/types';
import { CATEGORIES, STATUSES } from '../../api/types';
import { useAppStore } from '../../store/useAppStore';
import { scoreLead, scoreLabel, SCORE_COLORS } from '../../utils/scoring';

interface Props {
  lead: Lead;
  selected: boolean;
  checked: boolean;
}

export default function LeadRow({ lead, selected, checked }: Props) {
  const { setCurrentLeadId, toggleLeadSelection } = useAppStore((s) => ({
    setCurrentLeadId: s.setCurrentLeadId,
    toggleLeadSelection: s.toggleLeadSelection,
  }));

  const score = scoreLead(lead);
  const label = scoreLabel(score);
  const color = SCORE_COLORS[label];

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
      {/* Checkbox */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={(e) => { e.stopPropagation(); toggleLeadSelection(lead.id); }}>
        <input
          type="checkbox"
          checked={checked}
          readOnly
          style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--accent)' }}
        />
      </div>

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

      {/* Score badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: `${color}22`, color, borderRadius: 4,
          fontSize: 11, fontWeight: 700, padding: '2px 6px', minWidth: 28,
        }}>
          {score}
        </div>
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
