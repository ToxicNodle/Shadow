import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

const CAT_COLORS: Record<string, string> = {
  fleet: '#3b82f6',
  gc_referral: '#f59e0b',
  construction: '#f97316',
  racing: '#ef4444',
  dinoc: '#8b5cf6',
  colorchange: '#ec4899',
  reatec: '#06b6d4',
  design: '#84cc16',
  wallgraphics: '#a78bfa',
};

const CAT_LABELS: Record<string, string> = {
  fleet: 'Fleet',
  gc_referral: 'GC Referral',
  construction: 'Construction',
  racing: 'Racing',
  dinoc: 'DI-NOC',
  colorchange: 'Color Change',
  reatec: 'Rea-Tec',
  design: 'Design',
  wallgraphics: 'Wall Graphics',
};

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function OutreachCalendarCard() {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['outreach-calendar'],
    queryFn: () => api.getOutreachCalendar(),
    staleTime: 60 * 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="an-card" style={{ gridColumn: '1 / -1' }}>
        <div className="an-card-title">Outreach Calendar</div>
        <div className="skeleton" style={{ height: 90, borderRadius: 8 }} />
      </div>
    );
  }

  const { months, currentMonth } = data;
  const active = selectedMonth !== null
    ? months.find(m => m.month === selectedMonth)
    : months.find(m => m.is_current) ?? months[0];

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="an-card-title" style={{ marginBottom: 0 }}>Outreach Calendar — 12-Month Wrap Sales Planner</div>
        <span style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          click a month to plan
        </span>
      </div>

      {/* Month strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, marginBottom: 16 }}>
        {months.map(m => {
          const isSelected = (selectedMonth ?? currentMonth) === m.month;
          const isCurrent = m.is_current;
          return (
            <button
              key={m.month}
              onClick={() => setSelectedMonth(m.month === selectedMonth ? null : m.month)}
              style={{
                background: isSelected
                  ? 'var(--accent)'
                  : isCurrent
                  ? 'rgba(244,85,28,0.12)'
                  : m.is_future
                  ? 'var(--surface-2)'
                  : 'rgba(255,255,255,0.03)',
                border: isSelected
                  ? '1px solid var(--accent)'
                  : isCurrent
                  ? '1px solid rgba(244,85,28,0.4)'
                  : '1px solid var(--border-subtle)',
                borderRadius: 6,
                padding: '8px 4px 6px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s',
                opacity: m.is_future ? 0.7 : 1,
              }}
            >
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                color: isSelected ? '#fff' : isCurrent ? 'var(--accent)' : 'var(--text)',
                marginBottom: 4,
              }}>
                {MONTH_ABBR[m.month - 1]}
              </div>
              {/* Hot category dots */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap', minHeight: 10 }}>
                {m.hot_categories.slice(0, 3).map(cat => (
                  <div
                    key={cat}
                    title={CAT_LABELS[cat] ?? cat}
                    style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: CAT_COLORS[cat] ?? '#6b7280',
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>
              {/* Pipeline count pill */}
              {m.pipeline_count > 0 && (
                <div style={{
                  marginTop: 4,
                  fontSize: 9,
                  fontWeight: 700,
                  color: isSelected ? '#fff' : 'var(--text-muted)',
                  background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  padding: '1px 4px',
                  display: 'inline-block',
                }}>
                  {m.pipeline_count}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail panel for selected month */}
      {active && (
        <div style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10,
          padding: '16px 18px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}>
          {/* Left: angle + themes */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 8 }}>
              {MONTH_ABBR[active.month - 1]} Outreach Angle
              {active.is_current && <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 900 }}>● NOW</span>}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 12px', lineHeight: 1.5, fontStyle: 'italic' }}>
              "{active.angle}"
            </p>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 6 }}>
              Key Themes
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {active.themes.map(theme => (
                <span key={theme} style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 20,
                  background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  {theme}
                </span>
              ))}
            </div>
          </div>

          {/* Right: hot categories + pipeline */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 8 }}>
              Hottest Categories
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {active.hot_categories.map((cat, i) => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: CAT_COLORS[cat] ?? '#6b7280',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: i === 0 ? 700 : 400 }}>
                    {CAT_LABELS[cat] ?? cat}
                  </span>
                  {i === 0 && (
                    <span style={{ fontSize: 9, color: '#00d97e', fontWeight: 700, marginLeft: 'auto' }}>TOP PICK</span>
                  )}
                </div>
              ))}
            </div>
            {active.pipeline_count > 0 ? (
              <div style={{
                padding: '10px 12px',
                background: 'rgba(0,217,126,0.08)',
                border: '1px solid rgba(0,217,126,0.2)',
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#00d97e' }}>{active.pipeline_count}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>
                  active pipeline lead{active.pipeline_count !== 1 ? 's' : ''} this month
                </span>
              </div>
            ) : (
              <div style={{
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text-faint)',
              }}>
                No pipeline leads this month yet
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
