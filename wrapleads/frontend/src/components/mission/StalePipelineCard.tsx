import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const STATUS_COLORS: Record<string, string> = {
  contacted: '#3b82f6', replied: '#0ea5e9', meeting: '#f59e0b', proposal: '#f97316',
};

const CAT_LABELS: Record<string, string> = {
  fleet: 'Fleet', gc_referral: 'GC', construction: 'Const.', racing: 'Racing',
  dinoc: 'DI-NOC', reatec: 'Rea-Tec', colorchange: 'Color', design: 'Design', wallgraphics: 'Wall',
};

export default function StalePipelineCard() {
  const setPendingOpenLeadServerId = useAppStore((s) => s.setPendingOpenLeadServerId);
  const setMode = useAppStore((s) => s.setMode);

  const { data, isLoading } = useQuery({
    queryKey: ['stale-pipeline'],
    queryFn: () => api.getStalePipeline(),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  function openLead(leadId: number) {
    setPendingOpenLeadServerId(leadId);
    setMode('leads');
  }

  const leads = data?.leads ?? [];

  if (isLoading) {
    return (
      <div className="mission-card">
        <div className="skeleton" style={{ height: 80, borderRadius: 8 }} />
      </div>
    );
  }

  if (!leads.length) return null;

  return (
    <div className="mission-card" style={{ borderLeftColor: '#f97316' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f97316' }}>
            Stale Pipeline
          </span>
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 99,
            background: 'rgba(249,115,22,0.15)', color: '#f97316', fontWeight: 700,
          }}>
            {leads.length} deal{leads.length !== 1 ? 's' : ''} at risk
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>No activity 14+ days</span>
      </div>

      {/* Lead list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {leads.map((lead) => {
          const statusColor = STATUS_COLORS[lead.status] ?? '#f97316';
          const staleDays = Math.round(lead.daysStale);
          const isOverdue = lead.followupDueAt && new Date(lead.followupDueAt) < new Date();

          return (
            <button
              key={lead.leadId}
              onClick={() => openLead(lead.leadId)}
              style={{
                width: '100%', textAlign: 'left',
                background: 'var(--surface-2)',
                border: `1px solid ${isOverdue ? '#ef444440' : 'var(--border-subtle)'}`,
                borderLeft: `3px solid ${statusColor}`,
                borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              {/* Stale days indicator */}
              <div style={{
                flexShrink: 0, width: 36, textAlign: 'center',
                borderRight: '1px solid var(--border-subtle)', paddingRight: 10,
              }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: staleDays >= 30 ? '#ef4444' : '#f97316', lineHeight: 1 }}>
                  {staleDays}
                </div>
                <div style={{ fontSize: 8, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>days</div>
              </div>

              {/* Lead info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lead.company}
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: `${statusColor}20`, color: statusColor, fontWeight: 700,
                  }}>
                    {lead.status}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    {CAT_LABELS[lead.category] ?? lead.category}
                  </span>
                  {lead.fleetSize && (
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>· {lead.fleetSize} vehicles</span>
                  )}
                  {isOverdue && (
                    <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 700 }}>⚠ overdue</span>
                  )}
                </div>
              </div>

              {/* Action hint */}
              <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>Open →</span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        These deals are going cold. A single follow-up today can revive them.
      </div>
    </div>
  );
}
