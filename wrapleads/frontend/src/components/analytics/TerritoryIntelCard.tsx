import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';

const MAX_BAR = 100;

export default function TerritoryIntelCard() {
  const setMode                 = useAppStore((s) => s.setMode);
  const setPendingDiscoverSearch = useAppStore((s) => s.setPendingDiscoverSearch);

  const { data, isLoading } = useQuery({
    queryKey: ['territory-intel'],
    queryFn: () => api.getTerritoryIntel(),
    staleTime: 60 * 60_000,
  });

  function launchDiscover(state: string) {
    setPendingDiscoverSearch({ states: [state], minFleet: 25, limit: 50 });
    setMode('discover');
  }

  const top = data?.territories ?? [];
  const maxScore = top[0]?.opportunity_score ?? 1;

  return (
    <section className="an-card" style={{ borderTop: '3px solid #4d8af5' }}>
      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', marginBottom: 6 }}>
        Territory Intel — Untouched Opportunity by State
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Ranked by available wrap opportunity (sweet-spot carriers you haven't contacted yet × avg fleet size).
        Green = states where you've already won deals.
      </p>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-faint)', fontSize: 11 }}>
          Analyzing carrier data…
        </div>
      )}

      {!isLoading && top.length === 0 && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-faint)', fontSize: 11 }}>
          No carrier data found. Run the FMCSA ingest to unlock territory intel.
        </div>
      )}

      {top.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {top.map((t, i) => {
            const barPct = Math.round((t.opportunity_score / maxScore) * MAX_BAR);
            const barColor = t.has_won ? '#00d97e' : t.penetration_pct >= 20 ? '#f4551c' : '#4d8af5';
            return (
              <div
                key={t.state}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 8px', borderRadius: 6,
                  background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                  cursor: 'pointer',
                }}
                onClick={() => launchDiscover(t.state)}
                title={`Launch Discover filtered to ${t.state}`}
              >
                <span style={{ fontSize: 10, color: 'var(--text-faint)', width: 18, textAlign: 'right', flexShrink: 0 }}>
                  {i + 1}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 800, color: t.has_won ? '#00d97e' : 'var(--text)',
                  width: 28, flexShrink: 0,
                }}>
                  {t.state}
                  {t.has_won && <span style={{ fontSize: 8, marginLeft: 2 }}>★</span>}
                </span>
                <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                  <div style={{ width: `${barPct}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 36, textAlign: 'right', flexShrink: 0 }}>
                  {t.untouched.toLocaleString()}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-faint)', width: 44, textAlign: 'right', flexShrink: 0 }}>
                  {t.penetration_pct}% hit
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); launchDiscover(t.state); }}
                  style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 4,
                    background: 'rgba(77,138,245,0.12)', border: '1px solid rgba(77,138,245,0.25)',
                    color: '#4d8af5', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Search
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 9, color: 'var(--text-faint)', borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
        ★ = states where you have won deals · "Untouched" = sweet-spot carriers (25–500 units) not yet in your pipeline
      </div>
    </section>
  );
}
