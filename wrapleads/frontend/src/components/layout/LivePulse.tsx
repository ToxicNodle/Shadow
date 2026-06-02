import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

// Live activity indicator — a low-key bottom-right pulse that reflects
// real-time state.  Surfaces: # of active sequences, last action, queued
// emails, hot proposals.  Makes the app feel like a live system, not a
// static dashboard.

export default function LivePulse() {
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);

  const { data: mission } = useQuery({
    queryKey: ['mission'],
    queryFn: () => api.getMission(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: heat } = useQuery({
    queryKey: ['proposal-heat'],
    queryFn: () => api.getProposalHeat(),
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  // Repaint every 30s so "last action" stays fresh
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const active = mission?.sequences?.active ?? 0;
  const queued = mission?.sequences?.pendingEmails ?? 0;
  const overdueCount = mission?.overdue?.length ?? 0;
  const repliedCount = mission?.replied?.length ?? 0;
  const hotCount = heat?.count ?? 0;

  const isActive = active > 0 || queued > 0;
  const isUrgent = overdueCount > 0 || repliedCount > 0 || hotCount > 0;

  const dotColor = isUrgent ? '#ef4444' : isActive ? '#10b981' : '#94a3b8';

  return (
    <div
      className={`live-pulse${expanded ? ' expanded' : ''}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="live-pulse-dot-wrap">
        <span className="live-pulse-dot" style={{ background: dotColor }} />
        <span className="live-pulse-ring" style={{ borderColor: dotColor }} />
      </div>
      <span className="live-pulse-text">
        {isUrgent ? 'Signal active' : isActive ? 'Live' : 'Idle'}
      </span>

      {expanded && (
        <div className="live-pulse-panel" onClick={(e) => e.stopPropagation()}>
          <div className="live-pulse-row">
            <span className="live-pulse-row-label">Active sequences</span>
            <span className="live-pulse-row-value" style={{ color: active > 0 ? '#10b981' : 'var(--text-faint)' }}>
              {active}
            </span>
          </div>
          <div className="live-pulse-row">
            <span className="live-pulse-row-label">Queued emails</span>
            <span className="live-pulse-row-value">{queued}</span>
          </div>
          <div className="live-pulse-row">
            <span className="live-pulse-row-label">Overdue follow-ups</span>
            <span className="live-pulse-row-value" style={{ color: overdueCount > 0 ? '#f59e0b' : 'var(--text-faint)' }}>
              {overdueCount}
            </span>
          </div>
          <div className="live-pulse-row">
            <span className="live-pulse-row-label">Awaiting reply</span>
            <span className="live-pulse-row-value" style={{ color: repliedCount > 0 ? '#10b981' : 'var(--text-faint)' }}>
              {repliedCount}
            </span>
          </div>
          <div className="live-pulse-row">
            <span className="live-pulse-row-label">Hot proposals</span>
            <span className="live-pulse-row-value" style={{ color: hotCount > 0 ? '#ef4444' : 'var(--text-faint)' }}>
              {hotCount}
            </span>
          </div>
          <div className="live-pulse-divider" />
          <div className="live-pulse-footer">
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: dotColor, marginRight: 6, verticalAlign: 'middle' }} />
            Auto-refresh every 60s
          </div>
        </div>
      )}
    </div>
  );
}
