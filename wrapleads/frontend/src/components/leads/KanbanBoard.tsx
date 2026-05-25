import { useState, useCallback } from 'react';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import { scoreLead, scoreLabel, scoreBreakdown, SCORE_COLORS, winProbability, winProbabilityColor } from '../../utils/scoring';
import type { Lead, LeadStatus } from '../../api/types';

const CATEGORY_COLORS: Record<string, string> = {
  fleet: '#3b82f6', dinoc: '#8b5cf6', reatec: '#7c3aed', gc_referral: '#f59e0b',
  construction: '#f97316', colorchange: '#ec4899', racing: '#ef4444',
  wallgraphics: '#06b6d4', design: '#10b981',
};

const COLUMNS: { key: LeadStatus; label: string; color: string }[] = [
  { key: 'new',       label: 'New',        color: 'var(--text-muted)' },
  { key: 'cold',      label: 'Cold',       color: 'var(--text-faint)' },
  { key: 'contacted', label: 'Contacted',  color: 'var(--blue)' },
  { key: 'replied',   label: 'Replied',    color: 'var(--purple)' },
  { key: 'meeting',   label: 'Meeting',    color: 'var(--yellow)' },
  { key: 'proposal',  label: 'Proposal',   color: 'var(--accent)' },
  { key: 'won',       label: 'Won',        color: 'var(--green)' },
  { key: 'lost',      label: 'Lost',       color: 'var(--red)' },
];

// Next-action hints based on pipeline stage + recency
function nextAction(lead: Lead, daysSinceContact: number | null): string | null {
  const d = daysSinceContact;
  switch (lead.status) {
    case 'new':
      return lead.email ? 'Activate email sequence →' : 'Find email via Apollo';
    case 'cold':
      return d !== null && d > 21 ? 'Re-engage with a new angle' : 'Schedule discovery call';
    case 'contacted':
      return d !== null && d > 14 ? 'Follow-up overdue — call now' : 'Await reply or follow up';
    case 'replied':
      return 'Send proposal while momentum is hot';
    case 'meeting':
      return 'Prepare proposal for meeting';
    case 'proposal':
      return d !== null && d > 7 ? 'Check in — proposal gone cold' : 'Follow up on proposal';
    default:
      return null;
  }
}

function estimateDeal(lead: Lead): number {
  const fleet = parseInt(lead.fleetSize || '0') || 0;
  const perUnit = lead.category === 'dinoc' ? 3000 : lead.category === 'reatec' ? 2500 : 3500;
  return Math.max(fleet, 1) * perUnit;
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

// Favicon with letter fallback for kanban cards
function KanbanFavicon({ lead }: { lead: Lead }) {
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(() => setFailed(true), []);
  const domain = lead.website?.replace(/^https?:\/\//, '').split('/')[0];
  const catColor = CATEGORY_COLORS[lead.category] ?? '#6b7280';
  const initial = lead.company?.[0]?.toUpperCase() ?? '?';

  if (domain && !failed) {
    return (
      <img
        src={`https://${domain}/favicon.ico`}
        alt=""
        width={16}
        height={16}
        className="kanban-favicon"
        onError={handleError}
      />
    );
  }
  return (
    <span
      className="kanban-favicon-letter"
      style={{ background: `${catColor}22`, color: catColor }}
    >
      {initial}
    </span>
  );
}

// Score badge with hover breakdown popover
function ScoreBadge({ lead }: { lead: Lead }) {
  const [show, setShow] = useState(false);
  const breakdown = scoreBreakdown(lead);
  const score = breakdown.total;
  const lbl = scoreLabel(score);
  const color = SCORE_COLORS[lbl];

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => { e.stopPropagation(); setShow((v) => !v); }}
    >
      <span
        className={`score-badge score-${lbl}`}
        style={{ cursor: 'default' }}
      >
        {lbl === 'hot' && <span style={{ marginRight: 2, fontSize: 9 }}>🔥</span>}
        {score}
      </span>
      {show && (
        <div className="score-breakdown-pop kanban-score-pop" onClick={(e) => e.stopPropagation()}>
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
  );
}

export default function KanbanBoard() {
  const { leads, updateLead } = useLeads();
  const { setCurrentLeadId, activeFilter } = useAppStore((s) => ({
    setCurrentLeadId: s.setCurrentLeadId,
    activeFilter: s.activeFilter,
  }));
  const [dragLead, setDragLead] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<LeadStatus | null>(null);

  const filtered = leads.filter((l) => {
    if (activeFilter.category !== 'all' && l.category !== activeFilter.category) return false;
    if (activeFilter.state && l.state !== activeFilter.state) return false;
    if (activeFilter.search) {
      const q = activeFilter.search.toLowerCase();
      if (![l.company, l.contactName, l.email, l.city].join(' ').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function handleDrop(e: React.DragEvent, status: LeadStatus) {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    const lead = leads.find((l) => l.id === leadId);
    if (lead?.serverId && lead.status !== status) {
      updateLead({ serverId: lead.serverId, patch: { status } });
    }
    setDragLead(null);
    setDragTarget(null);
  }

  return (
    <div className="kanban-board">
      {COLUMNS.map((col) => {
        const colLeads = filtered
          .filter((l) => l.status === col.key)
          .sort((a, b) => scoreLead(b) - scoreLead(a));
        const totalValue = colLeads.reduce((sum, l) => sum + estimateDeal(l), 0);
        const isTarget = dragTarget === col.key;
        const hotCount = colLeads.filter((l) => scoreLabel(scoreLead(l)) === 'hot').length;

        return (
          <div
            key={col.key}
            className={`kanban-col${isTarget ? ' drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragTarget(col.key); }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragTarget(null);
            }}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            <div className="kanban-col-header">
              <div className="kanban-col-title">
                <span className="kanban-dot" style={{ background: col.color }} />
                <span>{col.label}</span>
                {hotCount > 0 && (
                  <span className="kanban-hot-chip" title={`${hotCount} hot lead${hotCount !== 1 ? 's' : ''}`}>
                    🔥 {hotCount}
                  </span>
                )}
              </div>
              <div className="kanban-col-meta">
                <span className="kanban-count">{colLeads.length}</span>
                {totalValue > 3500 && (
                  <span className="kanban-value">{fmtMoney(totalValue)}</span>
                )}
              </div>
            </div>

            <div className="kanban-cards">
              {colLeads.map((lead) => {
                const s = scoreLead(lead);
                const lbl = scoreLabel(s);
                const days = daysSince(lead.lastContacted);
                const isDragging = dragLead === lead.id;
                const hint = nextAction(lead, days);
                const isHot = lbl === 'hot';
                const prob = !['won', 'lost'].includes(lead.status) ? winProbability(lead) : null;
                const probColor = prob !== null ? winProbabilityColor(prob) : null;

                return (
                  <div
                    key={lead.id}
                    className={`kanban-card${isDragging ? ' is-dragging' : ''}${isHot ? ' kanban-card-hot' : ''}`}
                    style={{ borderLeft: `3px solid ${col.color}` }}
                    draggable
                    onDragStart={(e) => {
                      setDragLead(lead.id);
                      e.dataTransfer.setData('text/plain', lead.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => { setDragLead(null); setDragTarget(null); }}
                    onClick={() => setCurrentLeadId(lead.id)}
                  >
                    <div className="kanban-card-header">
                      <KanbanFavicon lead={lead} />
                      <span className="kanban-company">{lead.company}</span>
                      <ScoreBadge lead={lead} />
                    </div>
                    {lead.contactName && (
                      <div className="kanban-card-contact">{lead.contactName}</div>
                    )}
                    {(lead.city || lead.state) && (
                      <div className="kanban-card-loc">
                        {[lead.city, lead.state].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {hint && !['won', 'lost'].includes(lead.status) && (
                      <div className="kanban-next-action">{hint}</div>
                    )}
                    <div className="kanban-card-footer">
                      <span className="kanban-cat-dot" style={{ background: CATEGORY_COLORS[lead.category] ?? '#6b7280' }} title={lead.category} />
                      {lead.fleetSize && (
                        <span className="kanban-fleet">{lead.fleetSize}v</span>
                      )}
                      {prob !== null && (
                        <span className="kanban-prob" style={{ color: probColor ?? undefined }} title={`${prob}% close probability`}>
                          {prob}%
                        </span>
                      )}
                      <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
                        {lead.email && <span className="kanban-data-icon" title="Has email">@</span>}
                        {lead.phone && <span className="kanban-data-icon" title="Has phone">☎</span>}
                        {days !== null && (
                          <span className={`kanban-days${days > 14 ? ' overdue' : ''}`}>
                            {days === 0 ? 'today' : `${days}d`}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Hover quick actions */}
                    <div className="kanban-card-actions" onClick={(e) => e.stopPropagation()}>
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          className="kanban-action-btn"
                          title={`Email ${lead.company}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                          Email
                        </a>
                      )}
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          className="kanban-action-btn"
                          title={`Call ${lead.company}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.72 16v.92z" />
                          </svg>
                          Call
                        </a>
                      )}
                      <button
                        className="kanban-action-btn"
                        title="Open lead detail"
                        onClick={(e) => { e.stopPropagation(); setCurrentLeadId(lead.id); }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                        Open
                      </button>
                    </div>
                  </div>
                );
              })}

              {isTarget && (
                <div className="kanban-drop-hint">Drop to move here</div>
              )}

              {colLeads.length === 0 && !isTarget && (
                <div className="kanban-empty">—</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
