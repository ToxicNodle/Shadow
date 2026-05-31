import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#4d8af5';

  return (
    <svg width="88" height="88" viewBox="0 0 88 88" style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      {/* Progress */}
      <circle
        cx="44" cy="44" r={r} fill="none"
        stroke={color} strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '44px 44px', transition: 'stroke-dashoffset 0.8s ease' }}
      />
      {/* Score number */}
      <text x="44" y="46" textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 18, fontWeight: 900, fill: color, fontFamily: 'var(--display)' }}>
        {score}
      </text>
      <text x="44" y="60" textAnchor="middle"
        style={{ fontSize: 7, fontWeight: 700, fill: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--body)' }}>
        TODAY
      </text>
    </svg>
  );
}

const ACTIVITY_ITEMS = [
  { key: 'calls',    label: 'Calls',    pts: 3, color: '#f97316' },
  { key: 'emails',   label: 'Emails',   pts: 1, color: '#4d8af5' },
  { key: 'advances', label: 'Advances', pts: 3, color: '#a78bfa' },
  { key: 'wins',     label: 'Wins',     pts: 10, color: '#22c55e' },
] as const;

export default function TodayScoreCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['today-score'],
    queryFn: () => api.getTodayScore(),
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });

  const score = data?.score ?? 0;
  const scoreColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#4d8af5';
  const label = score >= 80 ? 'Outstanding' : score >= 60 ? 'Strong Day' : score >= 40 ? 'Good Progress' : score >= 20 ? 'Getting Started' : 'Start Dialing';

  return (
    <div style={{
      background: 'var(--bg-elev)', border: `1px solid ${scoreColor}33`,
      borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 16, alignItems: 'center',
    }}>
      {isLoading ? (
        <div style={{ width: 88, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="spinner" />
        </div>
      ) : (
        <ScoreRing score={score} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-faint)' }}>
            Today&apos;s Score
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, color: scoreColor,
            background: scoreColor + '18', borderRadius: 99, padding: '1px 7px',
          }}>
            {label}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {ACTIVITY_ITEMS.map(({ key, label: itemLabel, pts, color }) => {
            const count = data?.[key] ?? 0;
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 40 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: count > 0 ? color : 'var(--text-faint)', letterSpacing: '-1px' }}>
                  {count}
                </div>
                <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '.05em' }}>
                  {itemLabel}
                </div>
                <div style={{ fontSize: 8, color: count > 0 ? color + 'aa' : 'var(--border)', marginTop: 1 }}>
                  +{pts}pts ea
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6 }}>
          Score resets at midnight · Max 100 pts/day
        </div>
      </div>
    </div>
  );
}
