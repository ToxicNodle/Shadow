import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

const CAT_LABELS: Record<string, string> = {
  fleet: 'Fleet', gc_referral: 'GC Referral', construction: 'Construction',
  racing: 'Racing', dinoc: 'DI-NOC', reatec: 'Rea-Tec',
  colorchange: 'Color Change', design: 'Design', wallgraphics: 'Wall Graphics',
};

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function WinRateBar({ rate, isSweetSpot }: { rate: number | null; isSweetSpot: boolean }) {
  if (rate == null) return <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>—</span>;
  const color = isSweetSpot ? '#00d97e' : rate >= 60 ? '#22c55e' : rate >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${rate}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>{rate}%</span>
      {isSweetSpot && <span style={{ fontSize: 9, color: '#00d97e', fontWeight: 800 }}>★</span>}
    </div>
  );
}

export default function PricingIntelCard() {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['pricing-intel'],
    queryFn: () => api.getPricingIntel(),
    staleTime: 30 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="an-card">
        <div className="an-card-title">Pricing Intelligence</div>
        <div className="skeleton" style={{ height: 120, borderRadius: 8, marginTop: 12 }} />
      </div>
    );
  }

  if (!data?.hasData || !data.categories.length) {
    return (
      <div className="an-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div className="an-card-title" style={{ margin: 0 }}>Pricing Intelligence</div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 0' }}>
          Send and close more quotes to unlock sweet-spot pricing analysis by category.
        </p>
      </div>
    );
  }

  const { overall, categories } = data;

  return (
    <div className="an-card">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="an-card-title" style={{ margin: 0 }}>Pricing Intelligence</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
            Win rates by price tier — star ★ marks your sweet spot
          </div>
        </div>
        {overall && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>
              {overall.winRate ?? '—'}%
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>overall win rate</div>
          </div>
        )}
      </div>

      {/* Overall strip */}
      {overall && overall.avgWonPrice != null && (
        <div style={{
          display: 'flex', gap: 12, marginBottom: 14, padding: '8px 12px',
          background: 'rgba(0,217,126,0.06)', border: '1px solid rgba(0,217,126,0.2)',
          borderRadius: 8, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Avg won price</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#00d97e' }}>{fmt(overall.avgWonPrice)}</div>
          </div>
          {overall.avgLostPrice != null && (
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Avg lost price</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#ef4444' }}>{fmt(overall.avgLostPrice)}</div>
            </div>
          )}
          {overall.avgWonPrice != null && overall.avgLostPrice != null && (
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Price delta</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>
                {overall.avgWonPrice > overall.avgLostPrice
                  ? `+${fmt(overall.avgWonPrice - overall.avgLostPrice)}`
                  : fmt(overall.avgWonPrice - overall.avgLostPrice)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-category breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {categories.map((cat) => {
          const isExpanded = expandedCat === cat.category;
          return (
            <div key={cat.category} style={{
              border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden',
            }}>
              {/* Category row */}
              <button
                onClick={() => setExpandedCat(isExpanded ? null : cat.category)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 90 }}>
                  {CAT_LABELS[cat.category] ?? cat.category}
                </span>
                <div style={{ flex: 1 }}>
                  <WinRateBar rate={cat.winRate} isSweetSpot={false} />
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  {cat.sweetSpotRange && (
                    <span style={{ fontSize: 10, color: '#00d97e', fontWeight: 700 }}>
                      ★ {fmt(cat.sweetSpotRange.min)}–{fmt(cat.sweetSpotRange.max)}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    {cat.wonCount}W/{cat.lostCount}L
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Tier breakdown */}
              {isExpanded && cat.tiers && (
                <div style={{ padding: '0 12px 10px', borderTop: '1px solid var(--border-subtle)' }}>
                  {/* Avg won vs lost */}
                  {cat.avgWonPrice != null && (
                    <div style={{ display: 'flex', gap: 16, padding: '8px 0', marginBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
                      <div>
                        <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Avg won</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#00d97e' }}>{fmt(cat.avgWonPrice)}</div>
                      </div>
                      {cat.avgLostPrice != null && (
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Avg lost</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#ef4444' }}>{fmt(cat.avgLostPrice)}</div>
                        </div>
                      )}
                      {cat.priceDelta != null && (
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase' }}>You win when quoting</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                            {cat.priceDelta > 0 ? `${fmt(Math.abs(cat.priceDelta))} higher` : `${fmt(Math.abs(cat.priceDelta))} lower`} on won deals
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
                    {cat.tiers.map((tier) => (
                      <div key={tier.label} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px', borderRadius: 6,
                        background: tier.isSweetSpot ? 'rgba(0,217,126,0.08)' : 'var(--surface-2)',
                        border: tier.isSweetSpot ? '1px solid rgba(0,217,126,0.2)' : '1px solid transparent',
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', minWidth: 24 }}>
                          {tier.label}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-faint)', minWidth: 80 }}>
                          {fmt(tier.minPrice)}–{fmt(tier.maxPrice)}
                        </span>
                        <div style={{ flex: 1 }}>
                          <WinRateBar rate={tier.winRate} isSweetSpot={tier.isSweetSpot} />
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>
                          {tier.wonCount}W/{tier.lostCount}L
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
