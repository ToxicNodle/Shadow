import { useState } from 'react';
import type { Lead } from '../../api/types';
import { CATEGORIES, STATUSES } from '../../api/types';
import { useAppStore } from '../../store/useAppStore';
import { scoreBreakdown, scoreLabel, SCORE_COLORS } from '../../utils/scoring';

const CAT_COLORS: Record<string, string> = {
  fleet: '#3b82f6',
  racing: '#ef4444',
  gc_referral: '#f59e0b',
  construction: '#f97316',
  dinoc: '#8b5cf6',
  reatec: '#a855f7',
  colorchange: '#ec4899',
  wallgraphics: '#14b8a6',
  design: '#06b6d4',
  other: '#6b7280',
};

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

  const [showBreakdown, setShowBreakdown] = useState(false);
  const breakdown = scoreBreakdown(lead);
  const score = breakdown.total;
  const label = scoreLabel(score);
  const color = SCORE_COLORS[label];

  const catColor = CAT_COLORS[lead.category] ?? '#6b7280';
  const initials = lead.company
    ? lead.company.replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '?';

  function fmt(date: string) {
    if (!date) return '—';
    try {
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(date));
    } catch {
      return '—';
    }
  }

  const isOverdue = lead.followupDueAt
    ? new Date(lead.followupDueAt) < new Date()
    : false;

  return (
    <div
      className={`lead-row ${selected ? 'selected' : ''}${isOverdue ? ' lead-row-overdue' : ''}`}
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

      {/* Company avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div
          className="lead-avatar"
          style={{
            background: `${catColor}1a`,
            color: catColor,
            border: `1px solid ${catColor}33`,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="lead-company">{lead.company}</div>
          <div className="lead-contact">
            {lead.contactName || <span style={{ color: 'var(--text-faint)' }}>No contact</span>}
            {lead.contactTitle ? ` · ${lead.contactTitle}` : ''}
          </div>
        </div>
      </div>

      <div className="lead-location">
        {lead.city && lead.state ? `${lead.city}, ${lead.state}` : lead.state || '—'}
      </div>

      <div className="lead-fleet">{lead.fleetSize || '—'}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className={`status-tag ${lead.status}`}>{STATUSES[lead.status]}</span>
        {isOverdue && (
          <span className="lead-overdue-dot" title="Follow-up overdue" />
        )}
      </div>

      <div className="lead-email" title={lead.email}>{lead.email || '—'}</div>

      <div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>
          {CATEGORIES[lead.category]}
        </div>
        <div className="lead-date">{fmt(lead.lastContacted)}</div>
      </div>

      {/* Score badge with breakdown popover */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div
          className="score-badge"
          style={{ background: `${color}1a`, color, border: `1px solid ${color}33` }}
          onMouseEnter={() => setShowBreakdown(true)}
          onMouseLeave={() => setShowBreakdown(false)}
          onClick={(e) => { e.stopPropagation(); setShowBreakdown((v) => !v); }}
        >
          {score}
        </div>
        {showBreakdown && (
          <div className="score-breakdown-pop" onClick={(e) => e.stopPropagation()}>
            <div className="score-breakdown-title">Score Breakdown</div>
            {breakdown.factors.map((f) => (
              <div key={f.label} className="score-breakdown-row">
                <span className="score-breakdown-label">{f.label}</span>
                <span className="score-breakdown-pts" style={{ color: f.points > 0 ? color : 'var(--text-faint)' }}>
                  +{f.points}
                </span>
              </div>
            ))}
            <div className="score-breakdown-total">Total: {score} / 100</div>
          </div>
        )}
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
