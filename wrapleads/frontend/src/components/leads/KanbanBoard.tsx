import { useState } from 'react';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import { scoreLead, scoreLabel } from '../../utils/scoring';
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

                return (
                  <div
                    key={lead.id}
                    className={`kanban-card${isDragging ? ' is-dragging' : ''}`}
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
                      <span className="kanban-company">{lead.company}</span>
                      <span className={`score-badge score-${lbl}`}>{s}</span>
                    </div>
                    {lead.contactName && (
                      <div className="kanban-card-contact">{lead.contactName}</div>
                    )}
                    {(lead.city || lead.state) && (
                      <div className="kanban-card-loc">
                        {[lead.city, lead.state].filter(Boolean).join(', ')}
                      </div>
                    )}
                    <div className="kanban-card-footer">
                      <span className="kanban-cat-dot" style={{ background: CATEGORY_COLORS[lead.category] ?? '#6b7280' }} title={lead.category} />
                      {lead.fleetSize && (
                        <span className="kanban-fleet">{lead.fleetSize}v</span>
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
