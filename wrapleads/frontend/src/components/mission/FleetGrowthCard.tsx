import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const CAT_COLOR: Record<string, string> = {
  fleet: '#f4551c', construction: '#f59e0b', gc_referral: '#8b5cf6',
  dinoc: '#0ea5e9', colorchange: '#ec4899', racing: '#ef4444',
};

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

export default function FleetGrowthCard() {
  const { setMode, setCurrentLeadId } = useAppStore();

  const { data } = useQuery({
    queryKey: ['fleet-growth-signals'],
    queryFn: () => api.getFleetGrowthSignals(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const signals = data?.signals ?? [];
  if (!signals.length) return null;

  return (
    <div style={{
      background: 'var(--bg-elev)',
      border: '1px solid rgba(244,85,28,0.25)',
      borderRadius: 14,
      padding: '16px 18px',
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>🚛</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Fleet Growth Alerts</span>
          <span style={{
            fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
            background: 'rgba(244,85,28,0.15)', color: '#f4551c', padding: '2px 7px', borderRadius: 4,
          }}>
            {signals.length} leads
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>FMCSA fleet changes</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {signals.slice(0, 5).map((s) => {
          const baseline = s.fmcsa_fleet_size_snapshot;
          const current = s.fleet_size;
          const growthPct = baseline && current ? Math.round(((current - baseline) / baseline) * 100) : null;
          const catColor = CAT_COLOR[s.category] ?? 'var(--accent)';

          return (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, padding: '9px 12px',
                background: 'var(--surface)', borderRadius: 8,
                cursor: 'pointer',
                borderLeft: `3px solid ${catColor}`,
              }}
              onClick={() => {
                setCurrentLeadId(String(s.id));
                setMode('leads');
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                  {s.company}
                  {s.state && <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: 6, fontSize: 11 }}>· {s.state}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Fleet grew {baseline} → <strong style={{ color: '#00d97e' }}>{current}</strong> units
                  {growthPct !== null && (
                    <span style={{ marginLeft: 6, color: '#00d97e', fontWeight: 700 }}>↑{growthPct}%</span>
                  )}
                </div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{timeAgo(s.fmcsa_fleet_grew_at)}</div>
                <div style={{
                  marginTop: 3, fontSize: 10, fontWeight: 700, color: '#f4551c',
                  background: 'rgba(244,85,28,0.1)', padding: '2px 7px', borderRadius: 4,
                }}>
                  Re-pitch
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        FMCSA monitors fleet size weekly. A 15%+ fleet increase is a strong signal to re-pitch — new vehicles need wrapping.
      </div>
    </div>
  );
}
