import { useState, useCallback } from 'react';
import type { Lead } from '../../api/types';
import { CATEGORIES, STATUSES } from '../../api/types';
import { useAppStore } from '../../store/useAppStore';
import { scoreBreakdown, scoreLabel, SCORE_COLORS, winProbability, winProbabilityColor } from '../../utils/scoring';

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
  const [faviconFailed, setFaviconFailed] = useState(false);
  const handleFaviconError = useCallback(() => setFaviconFailed(true), []);

  const faviconDomain = lead.website
    ? lead.website.replace(/^https?:\/\//, '').split('/')[0]
    : null;
  const faviconUrl = faviconDomain && !faviconFailed
    ? `https://${faviconDomain}/favicon.ico`
    : null;
  const breakdown = scoreBreakdown(lead);
  const score = breakdown.total;
  const label = scoreLabel(score);
  const color = SCORE_COLORS[label];
  const prob = !['won', 'lost'].includes(lead.status) ? winProbability(lead) : null;
  const probColor = prob !== null ? winProbabilityColor(prob) : undefined;

  const catColor = CAT_COLORS[lead.category] ?? '#6b7280';

  // Lead momentum: how recently was this lead touched?
  const daysSinceContact = lead.lastContacted
    ? Math.floor((Date.now() - new Date(lead.lastContacted).getTime()) / 86_400_000)
    : null;
  const momentum = daysSinceContact === null ? 'cold'
    : daysSinceContact <= 7 ? 'hot'
    : daysSinceContact <= 21 ? 'warm'
    : daysSinceContact <= 45 ? 'cool'
    : 'cold';
  const momentumDot = { hot: '#10b981', warm: '#f59e0b', cool: '#94a3b8', cold: 'var(--border)' }[momentum];
  const momentumTitle = {
    hot: `Active — contacted ${daysSinceContact}d ago`,
    warm: `Warm — contacted ${daysSinceContact}d ago`,
    cool: `Cooling — contacted ${daysSinceContact}d ago`,
    cold: daysSinceContact === null ? 'Never contacted' : `Stale — ${daysSinceContact}d since last contact`,
  }[momentum];
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

  const isStale = !['won', 'lost', 'new'].includes(lead.status) && (() => {
    const now = Date.now();
    if (lead.lastContacted) return now - new Date(lead.lastContacted).getTime() > 30 * 86400000;
    if (lead.createdAt) return now - new Date(lead.createdAt).getTime() > 60 * 86400000;
    return false;
  })();

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
            background: faviconUrl ? 'var(--bg-elev-2)' : `${catColor}1a`,
            color: catColor,
            border: `1px solid ${catColor}33`,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: faviconUrl ? 4 : undefined,
          }}
        >
          {faviconUrl ? (
            <img
              src={faviconUrl}
              alt=""
              width={16}
              height={16}
              style={{ borderRadius: 2, objectFit: 'contain', display: 'block' }}
              onError={handleFaviconError}
            />
          ) : initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="lead-company">{lead.company}</div>
          <div className="lead-contact">
            {lead.contactName || <span style={{ color: 'var(--text-faint)' }}>No contact</span>}
            {lead.contactTitle ? ` · ${lead.contactTitle}` : ''}
          </div>
          {lead.pitchAngle && (
            <div style={{
              fontSize: 10, color: 'var(--text-faint)', marginTop: 2,
              fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 260,
            }}>
              {lead.pitchAngle.length > 80 ? lead.pitchAngle.slice(0, 80) + '…' : lead.pitchAngle}
            </div>
          )}
          {lead.tags && lead.tags.length > 0 && (
            <div className="lead-tag-row">
              {lead.tags.slice(0, 3).map((t) => {
                let h = 0;
                for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0;
                const PALETTE = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#f97316'];
                const c = PALETTE[Math.abs(h) % PALETTE.length];
                return (
                  <span key={t} className="lead-tag-pill" style={{ background: `${c}18`, color: c, border: `1px solid ${c}44` }}>
                    {t}
                  </span>
                );
              })}
              {lead.tags.length > 3 && (
                <span className="lead-tag-pill" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  +{lead.tags.length - 3}
                </span>
              )}
            </div>
          )}
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
        {isStale && !isOverdue && (
          <span className="lead-stale-dot" title="No contact in 30+ days" />
        )}
      </div>

      <div className="lead-email" title={lead.email}>{lead.email || '—'}</div>

      <div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>
          {CATEGORIES[lead.category]}
        </div>
        <div className="lead-date">{fmt(lead.lastContacted)}</div>
      </div>

      {/* Win probability */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {prob !== null ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: probColor }} title={`${prob}% close probability`}>
            {prob}%
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>—</span>
        )}
      </div>

      {/* Score badge with breakdown popover */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{ width: 7, height: 7, borderRadius: '50%', background: momentumDot, flexShrink: 0 }}
          title={momentumTitle}
        />
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
