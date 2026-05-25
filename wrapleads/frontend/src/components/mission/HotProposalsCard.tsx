import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const TIER_META = {
  blazing: { color: '#ef4444', label: 'BLAZING', icon: '🔥' },
  hot:     { color: '#f97316', label: 'HOT',     icon: '⚡' },
  warm:    { color: '#f59e0b', label: 'WARM',    icon: '✨' },
  cool:    { color: '#94a3b8', label: 'COOL',    icon: '·' },
} as const;

function fmtAgo(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function HotProposalsCard() {
  const setMode = useAppStore((s) => s.setMode);
  const setCurrentLeadId = useAppStore((s) => s.setCurrentLeadId);

  const { data, isLoading } = useQuery({
    queryKey: ['proposal-heat'],
    queryFn: () => api.getProposalHeat(),
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  if (isLoading) return null;
  const hot = data?.hot ?? [];
  if (hot.length === 0) return null;

  // Only show top 3 in the card, but expose the count
  const top = hot.slice(0, 3);

  function openLead(leadServerId: number | undefined) {
    if (!leadServerId) return;
    setMode('leads');
    setCurrentLeadId(String(leadServerId));
  }

  return (
    <div className="mission-card hot-proposals-card" style={{ borderLeftColor: '#ef4444' }}>
      <div className="hot-proposals-header">
        <div>
          <div className="hot-proposals-label">
            <span className="hot-proposals-pulse" />
            PROPOSAL HEAT
          </div>
          <div className="hot-proposals-title">
            {hot.length} proposal{hot.length !== 1 ? 's' : ''} being viewed
          </div>
        </div>
        <div className="hot-proposals-count-badge">{hot.length}</div>
      </div>

      <div className="hot-proposals-list">
        {top.map((p) => {
          const meta = TIER_META[p.tier];
          const company = p.lead?.company ?? p.title;
          return (
            <button
              key={p.id}
              className="hot-proposal-row"
              onClick={() => openLead(p.lead?.id)}
              style={{ borderLeft: `2px solid ${meta.color}` }}
              title={p.lead ? `Open ${company}` : 'No lead linked'}
            >
              <div className="hot-proposal-icon" style={{ color: meta.color }}>
                {meta.icon}
              </div>
              <div className="hot-proposal-meta">
                <div className="hot-proposal-company">{company}</div>
                <div className="hot-proposal-stats">
                  <span style={{ color: meta.color, fontWeight: 700, fontSize: 9, letterSpacing: '0.1em' }}>
                    {meta.label}
                  </span>
                  <span className="hot-proposal-dot">·</span>
                  <span><strong>{p.viewCount}</strong> view{p.viewCount !== 1 ? 's' : ''}</span>
                  <span className="hot-proposal-dot">·</span>
                  <span>{fmtAgo(p.hoursSinceView)}</span>
                </div>
              </div>
              <div className="hot-proposal-score" style={{ color: meta.color }}>
                {p.heatScore}
              </div>
            </button>
          );
        })}
      </div>

      <div className="hot-proposals-footer">
        Engagement signal: a prospect viewing your proposal repeatedly is shopping it.
        Call now — close rates double in the first hour of repeat views.
      </div>
    </div>
  );
}
