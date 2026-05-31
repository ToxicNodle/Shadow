import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

const CAT_LABELS: Record<string, string> = {
  fleet: 'Fleet', gc_referral: 'GC', construction: 'Construction',
  racing: 'Racing', dinoc: 'DI-NOC', reatec: 'Rea-Tec',
  colorchange: 'Color Change', design: 'Design', wallgraphics: 'Wall',
};

export default function WinPatternsCard() {
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['win-pattern-library'],
    queryFn: () => api.getWinPatternLibrary(),
    staleTime: 15 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="an-card">
        <div className="an-card-title">Win Pattern Library</div>
        <div className="skeleton" style={{ height: 120, borderRadius: 8, marginTop: 12 }} />
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="an-card">
        <div className="an-card-title" style={{ marginBottom: 4 }}>Win Pattern Library</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
          Win a deal and click "🏆 Generate Win Debrief" in the lead to start building your personal playbook.
        </p>
      </div>
    );
  }

  const { summary, topTags, byCategory, debriefs } = data;

  return (
    <div className="an-card">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="an-card-title" style={{ margin: 0 }}>Win Pattern Library</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
            AI-analyzed patterns from your won deals
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#00d97e', lineHeight: 1 }}>{summary.totalWins}</div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>debriefs</div>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {summary.avgDaysToClose != null && (
          <div style={{
            flex: 1, minWidth: 80, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(0,217,126,0.06)', border: '1px solid rgba(0,217,126,0.2)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>{summary.avgDaysToClose}</div>
            <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>avg days to close</div>
          </div>
        )}
        {summary.avgTouchCount != null && (
          <div style={{
            flex: 1, minWidth: 80, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(77,138,245,0.06)', border: '1px solid rgba(77,138,245,0.2)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#4d8af5', lineHeight: 1 }}>{summary.avgTouchCount}</div>
            <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>avg touchpoints</div>
          </div>
        )}
      </div>

      {/* Top pattern tags */}
      {topTags.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Your winning patterns</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {topTags.map((t) => (
              <span key={t.tag} style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                background: 'rgba(0,217,126,0.12)', color: '#00d97e',
              }}>
                {t.tag} <span style={{ opacity: 0.6 }}>×{t.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* By category */}
      {byCategory.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>By category</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {byCategory.map((c) => (
              <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{ fontWeight: 700, color: 'var(--text)', minWidth: 80 }}>
                  {CAT_LABELS[c.category] ?? c.category}
                </span>
                <span style={{ color: '#00d97e', fontWeight: 700, minWidth: 24 }}>{c.count}W</span>
                {c.avg_days != null && (
                  <span style={{ color: 'var(--text-faint)' }}>{c.avg_days}d avg</span>
                )}
                {c.avg_value != null && (
                  <span style={{ color: 'var(--text-faint)', marginLeft: 'auto' }}>
                    ~${c.avg_value >= 1000 ? `${Math.round(c.avg_value / 1000)}K` : c.avg_value.toLocaleString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent debriefs */}
      {debriefs.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Recent wins</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {debriefs.slice(0, 5).map((d, i) => (
              <div key={d.id} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.company}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>
                    {d.category ? (CAT_LABELS[d.category] ?? d.category) : ''} · {d.days_to_close != null ? `${d.days_to_close}d` : '—'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{expanded === i ? '▲' : '▼'}</span>
                </button>
                {expanded === i && d.summary && (
                  <div style={{ padding: '0 10px 10px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 6 }}>{d.summary}</div>
                    {d.pattern_tags?.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {d.pattern_tags.map((tag) => (
                          <span key={tag} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(0,217,126,0.1)', color: '#00d97e', fontWeight: 700 }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
