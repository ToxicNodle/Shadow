import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toFixed(0)}`;
}

export default function RevenueThermometerCard() {
  const settings = useAppStore((s) => s.settings);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const goal = parseFloat(settings.monthlyRevenueGoal?.replace(/[^0-9.]/g, '') || '0');

  const { data: mission } = useQuery({
    queryKey: ['mission'],
    queryFn: () => api.getMission(),
    staleTime: 60_000,
  });

  const won = mission?.wonThisMonthRevenue ?? 0;
  const pct = goal > 0 ? Math.min(100, (won / goal) * 100) : 0;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysLeft = daysInMonth - dayOfMonth;
  const monthName = now.toLocaleString('default', { month: 'long' });

  // Pace: are we on track? (won / dayOfMonth) × daysInMonth
  const projectedTotal = dayOfMonth > 0 ? (won / dayOfMonth) * daysInMonth : 0;
  const onTrack = goal > 0 ? projectedTotal >= goal * 0.9 : null;

  // Color: blue → amber → green as pct rises
  const fillColor = pct >= 90 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#4d8af5';

  const barRef = useRef<HTMLDivElement>(null);

  return (
    <section className="pv-card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 className="pv-card-title" style={{ margin: 0 }}>{monthName} Revenue Goal</h3>
        {goal > 0 && onTrack !== null && (
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
            color: onTrack ? '#22c55e' : '#f59e0b',
            background: (onTrack ? '#22c55e' : '#f59e0b') + '18',
            borderRadius: 99, padding: '2px 8px',
          }}>
            {onTrack ? 'On Track' : 'Behind Pace'}
          </span>
        )}
      </div>

      {goal <= 0 ? (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>
            No monthly revenue goal set.
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            style={{
              fontSize: 11, fontWeight: 700, color: '#4d8af5', background: '#4d8af518',
              border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
            }}
          >
            Set Goal in Settings →
          </button>
        </div>
      ) : (
        <>
          {/* Numbers row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-1px', color: fillColor }}>
                {fmt(won)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 4 }}>won</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{fmt(goal)}</span>
              <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 3 }}>goal</span>
            </div>
          </div>

          {/* Thermometer bar */}
          <div
            ref={barRef}
            style={{
              height: 10, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginBottom: 8,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: `linear-gradient(90deg, #4d8af5 0%, ${fillColor} 100%)`,
                borderRadius: 99,
                transition: 'width 1.2s cubic-bezier(0.25, 1, 0.5, 1)',
              }}
            />
          </div>

          {/* Sub-row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-faint)' }}>
            <span>{pct.toFixed(0)}% of goal</span>
            <span>{daysLeft} day{daysLeft !== 1 ? 's' : ''} left in {monthName}</span>
          </div>

          {/* Pace projection */}
          {projectedTotal > 0 && (
            <div style={{
              marginTop: 10, padding: '6px 10px',
              background: (onTrack ? '#22c55e' : '#f59e0b') + '10',
              borderRadius: 8, fontSize: 11, color: 'var(--text-muted)',
              borderLeft: `3px solid ${onTrack ? '#22c55e' : '#f59e0b'}`,
            }}>
              At current pace → <strong style={{ color: onTrack ? '#22c55e' : '#f59e0b' }}>{fmt(projectedTotal)}</strong> projected by month end
              {!onTrack && goal > won && (
                <span style={{ color: 'var(--text-faint)' }}> · {fmt(goal - won)} to go</span>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
