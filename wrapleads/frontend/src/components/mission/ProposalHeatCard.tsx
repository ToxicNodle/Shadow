import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const TIER_COLORS = {
  blazing: '#f4551c',
  hot: '#f97316',
  warm: '#f59e0b',
  cool: '#4d8af5',
};

const TIER_LABELS = {
  blazing: 'Blazing',
  hot: 'Hot',
  warm: 'Warm',
  cool: 'Active',
};

function HeatBar({ score }: { score: number }) {
  const pct = Math.min(100, (score / 300) * 100);
  const color = score >= 200 ? '#f4551c' : score >= 80 ? '#f97316' : score >= 30 ? '#f59e0b' : '#4d8af5';
  return (
    <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, width: 60, flexShrink: 0 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
    </div>
  );
}

export default function ProposalHeatCard() {
  const setMode = useAppStore((s) => s.setMode);
  const setFilter = useAppStore((s) => s.setFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['proposal-heat'],
    queryFn: () => api.getProposalHeat(),
    staleTime: 2 * 60_000,
    refetchInterval: 3 * 60_000,
  });

  function openLead(leadId: number) {
    setFilter({ status: 'all', category: 'all', state: '', search: '' });
    setMode('leads');
    useAppStore.getState().setCurrentLeadId(String(leadId));
  }

  if (isLoading) {
    return (
      <div className="mission-card">
        <div className="mission-card-header">
          <span className="mission-card-title">Proposal Heat</span>
        </div>
        <div style={{ padding: '8px 0' }}>
          {[1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 44, borderRadius: 8, marginBottom: 8 }} />
          ))}
        </div>
      </div>
    );
  }

  const proposals = data?.hot ?? [];
  if (proposals.length === 0) return null;

  return (
    <div className="mission-card">
      <div className="mission-card-header">
        <span className="mission-card-title">Proposal Heat</span>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
          color: '#f97316', background: '#f9731618', borderRadius: 99, padding: '2px 8px',
        }}>
          {proposals.length} active
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {proposals.slice(0, 5).map((p) => {
          const tierColor = TIER_COLORS[p.tier];
          const canOpen = !!p.lead;
          return (
            <div
              key={p.id}
              onClick={() => canOpen && p.lead && openLead(p.lead.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px',
                background: tierColor + '08',
                border: `1px solid ${tierColor}25`,
                borderLeft: `3px solid ${tierColor}`,
                borderRadius: 8,
                cursor: canOpen ? 'pointer' : 'default',
              }}
            >
              {/* Tier badge */}
              <div style={{
                fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em',
                color: tierColor, background: tierColor + '18', borderRadius: 4,
                padding: '2px 5px', flexShrink: 0,
              }}>
                {TIER_LABELS[p.tier]}
              </div>

              {/* Main info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.lead?.company ?? p.title}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>
                  {p.viewCount} view{p.viewCount !== 1 ? 's' : ''} · {p.hoursSinceView < 1
                    ? 'just now'
                    : p.hoursSinceView < 24
                    ? `${Math.round(p.hoursSinceView)}h ago`
                    : `${Math.round(p.hoursSinceView / 24)}d ago`}
                </div>
              </div>

              {/* Heat bar */}
              <HeatBar score={p.heatScore} />
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-faint)' }}>
        Heat = view recency × count — call while interest is fresh
      </div>
    </div>
  );
}
