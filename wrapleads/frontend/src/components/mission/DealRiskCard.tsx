import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const CAT_LABELS: Record<string, string> = {
  fleet: 'Fleet', dinoc: 'DI-NOC', gc_referral: 'GC Ref', construction: 'Const.',
  racing: 'Racing', reatec: 'Rea-Tec', colorchange: 'Color', design: 'Design', wallgraphics: 'Wall',
};

const STATUS_LABELS: Record<string, string> = {
  contacted: 'Contacted', replied: 'Replied', meeting: 'Meeting', proposal: 'Proposal',
};

type Deal = {
  leadId: number;
  company: string;
  contactName: string | null;
  category: string;
  status: string;
  riskScore: number;
  riskLabel: string;
  riskColor: string;
  topReason: string | null;
  reasons: string[];
  daysStale: number;
  followupDueAt: string | null;
};

function RiskGauge({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
      <div
        style={{
          flex: 1, height: 5, borderRadius: 99,
          background: 'var(--surface-3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${score}%`,
            background: color,
            borderRadius: 99,
            transition: 'width 0.5s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 26, textAlign: 'right' }}>
        {score}
      </span>
    </div>
  );
}

function ReasonTooltip({ reasons, visible }: { reasons: string[]; visible: boolean }) {
  if (!visible || reasons.length <= 1) return null;
  return (
    <div
      style={{
        position: 'absolute', bottom: '100%', left: 0, zIndex: 20,
        background: 'var(--surface-3)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8, padding: '8px 10px',
        fontSize: 11, color: 'var(--text-secondary)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        whiteSpace: 'nowrap',
        marginBottom: 6,
        pointerEvents: 'none',
      }}
    >
      {reasons.map((r, i) => (
        <div key={i} style={{ marginBottom: i < reasons.length - 1 ? 4 : 0 }}>
          · {r}
        </div>
      ))}
    </div>
  );
}

function DealRow({ deal, onOpen }: { deal: Deal; onOpen: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const isOverdue = deal.followupDueAt ? new Date(deal.followupDueAt) < new Date() : false;

  return (
    <button
      onClick={() => onOpen(deal.leadId)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', textAlign: 'left',
        background: hovered ? 'var(--surface-3)' : 'var(--surface-2)',
        border: `1px solid ${hovered ? deal.riskColor + '40' : 'var(--border-subtle)'}`,
        borderLeft: `3px solid ${deal.riskColor}`,
        borderRadius: 8, padding: '9px 12px', cursor: 'pointer',
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
    >
      {/* Top row: company + risk label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {deal.company}
          </span>
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 99, fontWeight: 700,
            background: deal.riskColor + '22', color: deal.riskColor,
            border: `1px solid ${deal.riskColor}44`,
          }}>
            {deal.riskLabel}
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>
          {STATUS_LABELS[deal.status] ?? deal.status}
        </span>
      </div>

      {/* Risk bar */}
      <RiskGauge score={deal.riskScore} color={deal.riskColor} />

      {/* Top reason */}
      {deal.topReason && (
        <div style={{ position: 'relative', marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
              ⚠ {deal.topReason}
            </span>
            {isOverdue && (
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 99, background: '#ef444422', color: '#ef4444', fontWeight: 700 }}>
                OVERDUE
              </span>
            )}
            {deal.reasons.length > 1 && (
              <span style={{ fontSize: 10, color: 'var(--text-faint)', cursor: 'help' }}>
                +{deal.reasons.length - 1} more
              </span>
            )}
          </div>
          <ReasonTooltip reasons={deal.reasons} visible={hovered} />
        </div>
      )}

      {/* Bottom row: category + contact */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
          {CAT_LABELS[deal.category] ?? deal.category}
        </span>
        {deal.contactName && (
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>· {deal.contactName}</span>
        )}
      </div>
    </button>
  );
}

export default function DealRiskCard() {
  const setPendingOpenLeadServerId = useAppStore((s) => s.setPendingOpenLeadServerId);
  const setMode = useAppStore((s) => s.setMode);

  const { data, isLoading } = useQuery({
    queryKey: ['deal-risks'],
    queryFn: () => api.getDealRisks(),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  function openLead(leadId: number) {
    setPendingOpenLeadServerId(leadId);
    setMode('leads');
  }

  const deals = data?.deals ?? [];

  if (isLoading) {
    return (
      <div className="mission-card">
        <div className="skeleton" style={{ height: 80, borderRadius: 8 }} />
      </div>
    );
  }

  if (!deals.length) return null;

  const criticalCount = deals.filter((d) => d.riskScore >= 60).length;

  return (
    <div className="mission-card" style={{ borderLeftColor: '#ef4444' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: '#ef4444',
          }}>
            Deal Risk
          </span>
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 99,
            background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700,
          }}>
            {deals.length} at risk
          </span>
          {criticalCount > 0 && (
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 99,
              background: 'rgba(239,68,68,0.25)', color: '#ef4444', fontWeight: 800,
              animation: 'pulse-badge 2s infinite',
            }}>
              {criticalCount} critical
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Multi-signal scoring</span>
      </div>

      {/* Deal list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {deals.slice(0, 5).map((deal) => (
          <DealRow key={deal.leadId} deal={deal} onOpen={openLead} />
        ))}
      </div>

      {deals.length > 5 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-faint)', textAlign: 'center' }}>
          +{deals.length - 5} more at-risk deals in pipeline
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Critical', color: '#ef4444' },
          { label: 'High',     color: '#f97316' },
          { label: 'Elevated', color: '#eab308' },
          { label: 'Watch',    color: '#60a5fa' },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: color }} />
            <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
