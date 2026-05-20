import { useState } from 'react';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import { scoreLead, scoreLabel } from '../../utils/scoring';
import type { Lead, LeadStatus } from '../../api/types';

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
                    {(lead.city || lead.state) && (
                      <div className="kanban-card-loc">
                        {[lead.city, lead.state].filter(Boolean).join(', ')}
                      </div>
                    )}
                    <div className="kanban-card-footer">
                      {lead.fleetSize && (
                        <span className="kanban-fleet">{lead.fleetSize} units</span>
                      )}
                      {days !== null && (
                        <span className={`kanban-days${days > 14 ? ' overdue' : ''}`}>
                          {days === 0 ? 'today' : `${days}d ago`}
                        </span>
                      )}
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
