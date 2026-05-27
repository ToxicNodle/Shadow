import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { useAuth } from '../../hooks/useAuth';
import { CATEGORIES, STATUSES } from '../../api/types';
import PipelineDoctorCard from './PipelineDoctorCard';
import TerritoryIntelCard from './TerritoryIntelCard';

function fmtRev(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

const SOURCE_LABELS: Record<string, string> = {
  fmcsa: 'FMCSA Database', apollo: 'Apollo Enrichment', sos: 'State SOS Registry',
  google_places: 'Google Places', manual: 'Manual Entry', news_signal: 'News Signal',
  inbound: 'Inbound', referral: 'Referral', auto_seed: 'Starter Leads',
  seed: 'Starter Leads',
};
const CAT_COLORS: Record<string, string> = {
  fleet: '#3b82f6', dinoc: '#8b5cf6', gc_referral: '#f59e0b',
  construction: '#f97316', colorchange: '#ec4899', racing: '#ef4444',
  reatec: '#06b6d4', design: '#84cc16', wallgraphics: '#a78bfa', other: '#6b7280',
};

function RevenueAttributionCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['revenue-attribution'],
    queryFn: () => api.getRevenueAttribution(),
    staleTime: 5 * 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="an-card" style={{ gridColumn: '1 / -1' }}>
        <div className="an-card-title">Revenue Attribution</div>
        <div style={{ display: 'flex', gap: 16 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 80, flex: 1, borderRadius: 8 }} />)}
        </div>
      </div>
    );
  }

  const { bySource, byCategory, velocity, totalWonRevenue } = data;
  const maxSource = Math.max(...bySource.map((s) => s.estimated_revenue), 1);
  const maxCat = Math.max(...byCategory.map((c) => c.estimated_revenue ?? 0), 1);

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div className="an-card-title">Revenue Attribution</div>
      {totalWonRevenue === 0 ? (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
          Win your first deal to see revenue attribution.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          {/* By Source */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
              By Lead Source
            </div>
            {bySource.map((s) => (
              <div key={s.source} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: 'var(--text)' }}>{SOURCE_LABELS[s.source] ?? s.source}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{fmtRev(s.estimated_revenue)} · {s.sharePct}%</span>
                </div>
                <div style={{ height: 5, background: 'var(--border)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${(s.estimated_revenue / maxSource) * 100}%`, background: 'var(--accent)', borderRadius: 99, transition: 'width 0.4s' }} />
                </div>
              </div>
            ))}
          </div>

          {/* By Category with close rate */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
              By Vertical (won revenue)
            </div>
            {byCategory.filter((c) => (c.estimated_revenue ?? 0) > 0).map((c) => (
              <div key={c.category} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: CAT_COLORS[c.category] ?? 'var(--text)', fontWeight: 600 }}>{CATEGORIES[c.category as keyof typeof CATEGORIES] ?? c.category}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{fmtRev(c.estimated_revenue ?? 0)} · {c.closeRate}%</span>
                </div>
                <div style={{ height: 5, background: 'var(--border)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${((c.estimated_revenue ?? 0) / maxCat) * 100}%`, background: CAT_COLORS[c.category] ?? 'var(--accent)', borderRadius: 99, transition: 'width 0.4s' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Time-to-close by category */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
              Avg Days to Close
            </div>
            {velocity.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Not enough data yet.</div>
            ) : (
              velocity.map((v) => {
                const fastest = velocity[0]?.avg_days ?? 1;
                const pct = fastest > 0 ? Math.min(100, (v.avg_days / (velocity[velocity.length - 1]?.avg_days ?? v.avg_days)) * 100) : 50;
                return (
                  <div key={v.category} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: 'var(--text)' }}>{CATEGORIES[v.category as keyof typeof CATEGORIES] ?? v.category}</span>
                      <span style={{ color: v.avg_days <= 21 ? '#10b981' : v.avg_days <= 45 ? '#f59e0b' : '#ef4444' }}>{v.avg_days}d</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--border)', borderRadius: 99 }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: v.avg_days <= 21 ? '#10b981' : v.avg_days <= 45 ? '#f59e0b' : '#ef4444',
                        borderRadius: 99, transition: 'width 0.4s',
                      }} />
                    </div>
                  </div>
                );
              })
            )}
            <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-faint)' }}>
              Total won revenue: <strong style={{ color: '#10b981' }}>{fmtRev(totalWonRevenue)}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Activity Heatmap ──────────────────────────────────────────────────────────
function ActivityHeatmap({ data }: { data: { day: string; count: number }[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Build a map of day → count for fast lookup
  const countMap = new Map(data.map((d) => [d.day, d.count]));
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  // Build 91-day grid: find the Sunday on or before 91 days ago
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Start from the Sunday of the first week
  const startDay = new Date(today);
  startDay.setDate(today.getDate() - 90);
  startDay.setDate(startDay.getDate() - startDay.getDay()); // back to Sunday

  const weeks: Date[][] = [];
  let cur = new Date(startDay);
  while (cur <= today) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS = ['S','M','T','W','T','F','S'];

  function cellColor(n: number): string {
    if (n === 0) return 'var(--border)';
    const intensity = Math.min(1, n / Math.max(maxCount * 0.75, 4));
    const lightness = Math.round(55 - intensity * 30); // 55% → 25%
    return `hsl(225, 70%, ${lightness}%)`;
  }

  function isoDay(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  // Month labels: one per week column when the week contains the 1st of a month
  const monthLabels = weeks.map((w) => {
    const hasFirst = w.some((d) => d.getDate() === 1);
    if (hasFirst) {
      const d = w.find((d) => d.getDate() === 1)!;
      return MONTHS[d.getMonth()];
    }
    return null;
  });

  const totalActivity = data.reduce((s, d) => s + d.count, 0);
  const activeDays = data.filter((d) => d.count > 0).length;

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="an-card-title" style={{ margin: 0 }}>Activity Calendar</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {totalActivity} touchpoints · {activeDays} active days (last 91 days)
        </div>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
          {/* Day-of-week labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 18, marginRight: 4 }}>
            {DAYS.map((d, i) => (
              <div key={i} style={{ width: 10, height: 10, fontSize: 8, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {i % 2 === 1 ? d : ''}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Month label */}
              <div style={{ height: 14, fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap', lineHeight: '14px' }}>
                {monthLabels[wi] ?? ''}
              </div>
              {/* Day cells */}
              {week.map((day, di) => {
                const key = isoDay(day);
                const count = countMap.get(key) ?? 0;
                const isFuture = day > today;
                return (
                  <div
                    key={di}
                    style={{
                      width: 10, height: 10, borderRadius: 2,
                      background: isFuture ? 'transparent' : cellColor(count),
                      cursor: count > 0 ? 'default' : 'default',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      if (isFuture) return;
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setTooltip({
                        x: rect.left + window.scrollX,
                        y: rect.top + window.scrollY,
                        text: `${count} touchpoint${count !== 1 ? 's' : ''} on ${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y - 32,
          background: 'var(--bg-elev)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 8px', fontSize: 11,
          color: 'var(--text)', pointerEvents: 'none', zIndex: 9999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)', whiteSpace: 'nowrap',
        }}>
          {tooltip.text}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Less</span>
        {[0, 1, 3, 5, 8].map((n) => (
          <div key={n} style={{ width: 10, height: 10, borderRadius: 2, background: cellColor(n) }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>More</span>
      </div>
    </div>
  );
}

// ── Win Rate Matrix ───────────────────────────────────────────────────────────
const CAT_LABEL_SHORT: Record<string, string> = {
  fleet: 'Fleet', dinoc: 'DI-NOC', gc_referral: 'GC Ref', construction: 'Constr.',
  colorchange: 'Color Chg', racing: 'Racing', reatec: 'Reatec',
  design: 'Design', wallgraphics: 'Wall', other: 'Other',
};

function WinRateMatrix() {
  const { data, isLoading } = useQuery({
    queryKey: ['win-matrix'],
    queryFn: () => api.getWinMatrix(),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="an-card" style={{ gridColumn: '1 / -1' }}>
        <div className="an-card-title">Win Rate Intelligence</div>
        <div className="skeleton" style={{ height: 120, borderRadius: 8, marginTop: 12 }} />
      </div>
    );
  }
  if (!data || data.topStates.length === 0 || data.categories.length === 0) return null;

  const { topStates, categories, matrix, revTrend, catRates } = data;

  function rateColor(rate: number): string {
    if (rate >= 60) return '#10b981';
    if (rate >= 35) return '#f59e0b';
    if (rate >= 15) return '#f97316';
    return '#ef4444';
  }
  function rateBg(rate: number): string {
    if (rate >= 60) return '#10b98122';
    if (rate >= 35) return '#f59e0b18';
    if (rate >= 15) return '#f9731614';
    return '#ef444412';
  }

  const maxRev = Math.max(...revTrend.map((r) => r.revenue), 1);

  function fmtMonth(ym: string) {
    const [y, m] = ym.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="an-card-title" style={{ margin: 0 }}>Win Rate Intelligence</div>
        {catRates.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Best vertical: <strong style={{ color: '#10b981' }}>{CAT_LABEL_SHORT[catRates[0].category] ?? catRates[0].category}</strong> at <strong style={{ color: '#10b981' }}>{catRates[0].winRate}%</strong>
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* ── Category × State matrix ── */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Win Rate by Category × State
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 10 }}>Vertical</th>
                {topStates.map((s) => (
                  <th key={s} style={{ textAlign: 'center', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.filter((cat) => matrix[cat]).map((cat) => (
                <tr key={cat}>
                  <td style={{ padding: '3px 6px', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11 }}>
                    {CAT_LABEL_SHORT[cat] ?? cat}
                  </td>
                  {topStates.map((state) => {
                    const cell = matrix[cat]?.[state];
                    if (!cell) return <td key={state} style={{ padding: '3px 4px', textAlign: 'center' }}><span style={{ color: 'var(--text-faint)', fontSize: 10 }}>—</span></td>;
                    return (
                      <td key={state} style={{ padding: '2px 3px', textAlign: 'center' }}>
                        <div title={`${cell.won}/${cell.total} leads`} style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 36, height: 22, borderRadius: 4, fontSize: 10, fontWeight: 700,
                          background: rateBg(cell.winRate), color: rateColor(cell.winRate),
                        }}>
                          {cell.winRate}%
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#10b98122', border: '1px solid #10b981', borderRadius: 2, display: 'inline-block' }} />≥60%</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#f59e0b18', border: '1px solid #f59e0b', borderRadius: 2, display: 'inline-block' }} />35–59%</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#f9731614', border: '1px solid #f97316', borderRadius: 2, display: 'inline-block' }} />15–34%</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#ef444412', border: '1px solid #ef4444', borderRadius: 2, display: 'inline-block' }} />&lt;15%</span>
          </div>
        </div>

        {/* ── 12-month revenue trend ── */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            12-Month Revenue Trend (Est.)
          </div>
          {revTrend.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', padding: '24px 0' }}>No closed deals in the last 12 months yet.</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
                {revTrend.map((r) => {
                  const pct = (r.revenue / maxRev) * 100;
                  return (
                    <div key={r.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}
                      title={`${fmtMonth(r.month)}: $${r.revenue.toLocaleString()}`}>
                      <div style={{ width: '100%', height: `${Math.max(4, pct)}%`, background: 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: 0.85 }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {revTrend.map((r) => (
                  <div key={r.month} style={{ flex: 1, fontSize: 9, color: 'var(--text-faint)', textAlign: 'center', overflow: 'hidden' }}>
                    {fmtMonth(r.month).split(' ')[0]}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--text-muted)' }}>12-month total</span>
                <strong style={{ color: '#10b981' }}>
                  ${revTrend.reduce((s, r) => s + r.revenue, 0).toLocaleString()} est.
                </strong>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Pipeline Velocity Card ────────────────────────────────────────────────────
const STAGE_COLORS_VEL: Record<string, string> = {
  new: '#6366f1', contacted: '#3b82f6', replied: '#0ea5e9',
  meeting: '#f59e0b', proposal: '#f97316',
};
const STAGE_LABEL_VEL: Record<string, string> = {
  new: 'New', contacted: 'Contacted', replied: 'Replied', meeting: 'Meeting', proposal: 'Proposal',
};
const STATUS_DOT: Record<string, string> = {
  contacted: '#3b82f6', replied: '#0ea5e9', meeting: '#f59e0b', proposal: '#f97316',
};

function PipelineVelocityCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-velocity'],
    queryFn: () => api.getPipelineVelocity(),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="an-card" style={{ gridColumn: '1 / -1' }}>
        <div className="an-card-title">Pipeline Velocity</div>
        <div className="skeleton" style={{ height: 80, borderRadius: 8, marginTop: 12 }} />
      </div>
    );
  }

  const vel = data?.velocity ?? [];
  const withData = vel.filter((v) => v.avgDays !== null);
  if (withData.length === 0) return null;

  const maxDays = Math.max(...withData.map((v) => v.avgDays ?? 0), 1);

  function fmtDays(d: number | null) {
    if (d === null) return '—';
    if (d < 1) return '<1d';
    return `${d}d`;
  }

  const active = data?.activeWithPrediction ?? [];

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="an-card-title" style={{ margin: 0 }}>Pipeline Velocity</div>
        {data?.totalAvgCycleDays != null && data.totalAvgCycleDays > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            avg cycle <strong style={{ color: 'var(--text)' }}>{data.totalAvgCycleDays}d</strong> new → proposal
          </span>
        )}
        {data?.bottleneck && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: '#f59e0b14', padding: '2px 8px', borderRadius: 99 }}>
            ⚠ Bottleneck: {STAGE_LABEL_VEL[data.bottleneck] ?? data.bottleneck}
          </span>
        )}
      </div>

      {/* Stage bars */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {vel.map((v) => {
          const color = STAGE_COLORS_VEL[v.stage] ?? '#6b7280';
          const isBottleneck = v.stage === data?.bottleneck;
          const pct = v.avgDays !== null ? (v.avgDays / maxDays) * 100 : 0;
          return (
            <div key={v.stage} style={{ flex: '1 1 80px', minWidth: 64 }}>
              <div style={{ fontSize: 10, color: isBottleneck ? '#f59e0b' : 'var(--text-muted)', fontWeight: isBottleneck ? 700 : 400, marginBottom: 4, textTransform: 'capitalize' }}>
                {STAGE_LABEL_VEL[v.stage] ?? v.stage}
                {isBottleneck && ' ⚠'}
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginBottom: 4 }}>
                <div style={{
                  height: '100%', width: `${pct}%`, borderRadius: 99,
                  background: isBottleneck ? '#f59e0b' : color,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: isBottleneck ? '#f59e0b' : color }}>
                {fmtDays(v.avgDays)}
              </div>
              {v.sampleSize > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{v.sampleSize} leads</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Predicted close dates for active deals */}
      {active.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Predicted Close Dates — Active Deals
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {active.map((d) => {
              const dot = STATUS_DOT[d.status] ?? '#6b7280';
              return (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 8,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.company}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{d.status}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: d.daysToClose <= 14 ? '#10b981' : 'var(--text)' }}>
                      {new Date(d.predictedClose).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{d.daysToClose}d out</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sequence Performance Card ─────────────────────────────────────────────────
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TONE_COLOR: Record<string, string> = {
  professional: '#6366f1', casual: '#10b981', direct: '#f97316', local: '#f59e0b', unknown: '#94a3b8',
};

function EmailTimingCard() {
  const { setCurrentLeadId, setMode } = useAppStore((s) => ({
    setCurrentLeadId: s.setCurrentLeadId,
    setMode: s.setMode,
  }));
  const { data, isLoading } = useQuery({
    queryKey: ['email-timing'],
    queryFn: () => api.getEmailTiming(),
    staleTime: 15 * 60_000,
  });

  if (isLoading) return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div className="skeleton" style={{ height: 80, borderRadius: 8 }} />
    </div>
  );

  const d = data;
  if (!d?.ok || d.totalOpens < 5) return (
    <div className="an-card" style={{ gridColumn: '1 / -1', opacity: 0.7 }}>
      <div className="an-card-title">Email Send-Time Intelligence</div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
        Send at least 5 tracked emails to unlock open-time patterns. Once you do, WrapOS will tell you exactly when your prospects read their emails.
      </p>
    </div>
  );

  const maxHour = Math.max(...d.byHour.map(h => h.opens), 1);
  const maxDow  = Math.max(...d.byDow.map(h => h.opens), 1);

  const hourLabel = (h: number) => h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="an-card-title" style={{ margin: 0 }}>Email Send-Time Intelligence</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
            When your prospects actually open emails — last 90 days, {d.totalOpens} opens tracked
          </div>
        </div>
        {d.bestDow && d.bestHours.length > 0 && (
          <div style={{
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 700, color: '#10b981',
          }}>
            Best window: {d.bestDow.label} {d.bestHours[0]?.label}–{d.bestHours[1]?.label}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: d.activeReaders.length > 0 ? 16 : 0 }}>
        {/* Hour-of-day bars */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>
            Hour of day (EST)
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48 }}>
            {d.byHour.map(h => {
              const pct = (h.opens / maxHour) * 100;
              const isBest = d.bestHours.some(b => b.hour === h.hour);
              return (
                <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                  title={`${hourLabel(h.hour)}: ${h.opens} open${h.opens !== 1 ? 's' : ''}`}>
                  <div style={{
                    width: '100%', height: Math.max(2, Math.round(pct * 0.44)),
                    background: isBest ? '#10b981' : h.opens > 0 ? '#10b98130' : 'var(--border)',
                    borderRadius: '2px 2px 0 0',
                  }} />
                  {(h.hour % 4 === 0) && (
                    <span style={{ fontSize: 8, color: 'var(--text-faint)', marginTop: 2 }}>{hourLabel(h.hour)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Day-of-week bars */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>
            Day of week
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 48 }}>
            {d.byDow.map(day => {
              const pct = (day.opens / maxDow) * 100;
              const isBest = d.bestDow?.dow === day.dow;
              return (
                <div key={day.dow} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
                  title={`${day.label}: ${day.opens} opens`}>
                  <div style={{
                    width: '100%', height: Math.max(2, Math.round(pct * 0.44)),
                    background: isBest ? '#10b981' : day.opens > 0 ? '#10b98130' : 'var(--border)',
                    borderRadius: '2px 2px 0 0',
                  }} />
                  <span style={{ fontSize: 9, color: isBest ? '#10b981' : 'var(--text-faint)', fontWeight: isBest ? 700 : 400 }}>
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active readers */}
      {d.activeReaders.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>
            Recent openers — reach out now while you're top of mind
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {d.activeReaders.slice(0, 6).map(r => {
              const when = r.hoursAgo < 24
                ? `${Math.round(r.hoursAgo)}h ago`
                : `${Math.round(r.hoursAgo / 24)}d ago`;
              return (
                <div
                  key={r.leadId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    background: 'var(--bg-elev)', border: '1px solid var(--border-subtle)',
                    borderRadius: 7, padding: '5px 10px', cursor: 'pointer',
                  }}
                  onClick={() => { setCurrentLeadId(String(r.leadId)); setMode('leads'); }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{r.company}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{when}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SequencePerformanceCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['sequence-performance'],
    queryFn: () => api.getSequencePerformance(),
    staleTime: 5 * 60_000,
  });

  if (isLoading || !data || (data.tones.length === 0 && data.byDow.length === 0)) return null;

  const maxToneSent = Math.max(...data.tones.map((t) => t.sent), 1);

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div className="an-card-title">Sequence Performance Intelligence</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
        Which tones, days, and steps are converting your pipeline
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>

        {/* Tone breakdown */}
        {data.tones.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 10 }}>
              By Tone
            </div>
            {data.tones.map((t) => (
              <div key={t.tone} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TONE_COLOR[t.tone] ?? '#94a3b8', textTransform: 'capitalize' }}>{t.tone}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.progressRate}% reply rate</span>
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(3, (t.sent / maxToneSent) * 100)}%`, background: TONE_COLOR[t.tone] ?? '#94a3b8', borderRadius: 99 }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                  {t.sent} sent · {t.progressed} progressed · {t.won} won
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Best day of week */}
        {data.byDow.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 10 }}>
              Best Day to Start
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 80 }}>
              {DOW_LABELS.map((label, dow) => {
                const entry = data.byDow.find((d) => d.dow === dow);
                const rate = entry?.progressRate ?? 0;
                const sent = entry?.sent ?? 0;
                const maxRate = Math.max(...data.byDow.map((d) => d.progressRate), 1);
                const h = maxRate > 0 ? Math.max(4, Math.round((rate / maxRate) * 70)) : 4;
                const isBest = rate === Math.max(...data.byDow.map((d) => d.progressRate)) && sent > 0;
                return (
                  <div key={dow} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ fontSize: 9, color: isBest ? '#6366f1' : 'var(--text-faint)', fontWeight: isBest ? 700 : 400 }}>
                      {rate > 0 ? `${rate}%` : ''}
                    </div>
                    <div style={{ width: '100%', height: h, background: isBest ? '#6366f1' : (sent > 0 ? 'var(--border)' : 'transparent'), borderRadius: 3, transition: 'height 0.3s ease' }} />
                    <div style={{ fontSize: 9, color: isBest ? '#6366f1' : 'var(--text-muted)', fontWeight: isBest ? 700 : 400 }}>{label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step open rates */}
        {data.byStep.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 10 }}>
              Email Open Rate by Step
            </div>
            {data.byStep.slice(0, 4).map((s) => (
              <div key={s.day} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--text)' }}>Day {s.day} email</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.openRate}% open</span>
                </div>
                <div style={{ height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(2, s.openRate)}%`, background: '#3b82f6', borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineNarrativeCard() {
  const [narrative, setNarrative] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api.generatePipelineNarrative(),
    onSuccess: (d) => setNarrative(d.narrative),
  });
  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="an-card-title" style={{ margin: 0 }}>AI Pipeline Forecast</div>
        <button
          className="btn btn-primary"
          style={{ fontSize: 11 }}
          disabled={mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? 'Analyzing…' : narrative ? '↺ Refresh' : 'Generate Forecast'}
        </button>
      </div>
      {!narrative && !mut.isPending && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Claude analyzes your full pipeline and writes a plain-English forecast for the next 30 days — where the money is, what the risks are, and the one move that would have the most impact this week.
        </p>
      )}
      {mut.isPending && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          <span className="spinner" /> Reading your pipeline…
        </div>
      )}
      {narrative && (
        <div className="pipeline-narrative">{narrative}</div>
      )}
    </div>
  );
}

// ── 3-Month Revenue Forecast Card ────────────────────────────────────────────
function RevenueForecastCard() {
  const { setCurrentLeadId, setMode } = useAppStore((s) => ({
    setCurrentLeadId: s.setCurrentLeadId,
    setMode: s.setMode,
  }));
  const { data, isLoading } = useQuery({
    queryKey: ['revenue-forecast'],
    queryFn: () => api.getRevenueForecast(),
    staleTime: 10 * 60_000,
  });

  if (isLoading) return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div className="skeleton" style={{ height: 100, borderRadius: 8 }} />
    </div>
  );

  const d = data;
  if (!d?.ok) return null;

  const fmtK = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toLocaleString()}`;
  const maxHigh = Math.max(...d.projections.map(p => p.high), 1);

  const STATUS_COLOR: Record<string, string> = {
    proposal: '#22c55e', meeting: '#4d8af5', replied: '#f59e0b', contacted: 'var(--text-faint)',
  };

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="an-card-title" style={{ margin: 0 }}>3-Month Revenue Projection</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
            Pipeline × {d.hasHistory ? 'your historical' : 'industry'} win rates — confidence range by stage
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Pipeline total</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.5px' }}>
            {fmtK(d.pipelineTotal)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {d.projections.map((proj) => {
          const barPct = maxHigh > 0 ? (proj.high / maxHigh) * 100 : 0;
          const expectedPct = maxHigh > 0 ? (proj.expected / maxHigh) * 100 : 0;
          const goalPct = d.monthlyGoal > 0 ? Math.min(100, (proj.expected / d.monthlyGoal) * 100) : 0;
          const atGoal = d.monthlyGoal > 0 && proj.expected >= d.monthlyGoal;

          return (
            <div key={proj.month} style={{
              background: 'var(--bg-elev)', border: `1px solid ${proj.month === 0 ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: proj.month === 0 ? 'var(--accent)' : 'var(--text-faint)', marginBottom: 10 }}>
                {proj.label} {proj.month === 0 && '(now)'}
              </div>

              {/* Stacked bar: low → expected → high */}
              <div style={{ position: 'relative', height: 36, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barPct}%`, background: 'rgba(77,138,245,0.2)', borderRadius: 4 }} />
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${expectedPct}%`, background: '#4d8af5', borderRadius: 4 }} />
                {d.monthlyGoal > 0 && (
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0, left: `${Math.min(99, d.monthlyGoal / maxHigh * 100)}%`,
                    width: 1.5, background: atGoal ? '#22c55e' : '#ef4444',
                  }} />
                )}
              </div>

              <div style={{ fontSize: 20, fontWeight: 900, color: '#4d8af5', letterSpacing: '-0.5px', marginBottom: 2 }}>
                {fmtK(proj.expected)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                {fmtK(proj.low)} – {fmtK(proj.high)} range
              </div>
              {d.monthlyGoal > 0 && (
                <div style={{ fontSize: 10, color: atGoal ? '#22c55e' : '#ef4444', marginTop: 4, fontWeight: 600 }}>
                  {atGoal ? `↑ ${fmtK(proj.expected - d.monthlyGoal)} over goal` : `${Math.round(goalPct)}% of ${fmtK(d.monthlyGoal)} goal`}
                </div>
              )}

              {/* Top leads for this month */}
              {proj.leads.length > 0 && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border-subtle)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {proj.leads.slice(0, 3).map(l => (
                    <div
                      key={l.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                      onClick={() => { setCurrentLeadId(String(l.id)); setMode('leads'); }}
                    >
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: STATUS_COLOR[l.status] ?? 'var(--text-faint)', flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {l.company}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--text-faint)', flexShrink: 0 }}>{l.winRate}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!d.hasHistory && (
        <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, fontStyle: 'italic' }}>
          Using industry-average win rates. Close more deals to unlock personalized projections based on your actual history.
        </p>
      )}
    </div>
  );
}

// ── Win Pattern AI Card ───────────────────────────────────────────────────────
function WinPatternCard() {
  const [result, setResult] = useState<{ patterns: string; chips: { label: string; color: string }[] } | null>(null);
  const mut = useMutation({
    mutationFn: () => api.getWinPatterns(),
    onSuccess: (d) => setResult(d),
  });
  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="an-card-title" style={{ margin: 0 }}>Win Pattern Analysis</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
            Claude identifies your highest-probability prospect profile from past wins and losses
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ fontSize: 11, flexShrink: 0 }}
          disabled={mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? 'Analyzing…' : result ? '↺ Re-analyze' : 'Analyze My Wins'}
        </button>
      </div>

      {result?.chips && result.chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {result.chips.map((chip) => (
            <span key={chip.label} style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
              background: `${chip.color}18`, color: chip.color,
              border: `1px solid ${chip.color}30`,
            }}>
              {chip.label}
            </span>
          ))}
        </div>
      )}

      {!result && !mut.isPending && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          Claude analyzes your won and lost deals to surface the exact customer profile you close most — vertical, fleet size, geography, and timing. The more wins you log, the sharper the insight.
        </p>
      )}
      {mut.isPending && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          <span className="spinner" /> Reading your win history…
        </div>
      )}
      {result && (
        <div className="pipeline-narrative">{result.patterns}</div>
      )}
    </div>
  );
}

// ── US State Heatmap ──────────────────────────────────────────────────────────
const STATE_GRID: Record<string, { c: number; r: number }> = {
  WA:{c:0,r:0}, MT:{c:1,r:0}, ND:{c:2,r:0}, MN:{c:3,r:0}, WI:{c:4,r:0}, MI:{c:5,r:0}, NY:{c:8,r:0}, VT:{c:9,r:0}, ME:{c:10,r:0},
  OR:{c:0,r:1}, ID:{c:1,r:1}, SD:{c:2,r:1}, IA:{c:3,r:1}, IL:{c:4,r:1}, IN:{c:5,r:1}, OH:{c:6,r:1}, PA:{c:7,r:1}, NJ:{c:8,r:1}, NH:{c:9,r:1}, MA:{c:10,r:1},
  CA:{c:0,r:2}, NV:{c:1,r:2}, WY:{c:2,r:2}, NE:{c:3,r:2}, MO:{c:4,r:2}, KY:{c:5,r:2}, WV:{c:6,r:2}, VA:{c:7,r:2}, MD:{c:8,r:2}, DE:{c:9,r:2}, CT:{c:10,r:2},
  AZ:{c:1,r:3}, UT:{c:2,r:3}, CO:{c:3,r:3}, KS:{c:4,r:3}, AR:{c:5,r:3}, TN:{c:6,r:3}, NC:{c:7,r:3}, SC:{c:8,r:3}, RI:{c:10,r:3},
  NM:{c:2,r:4}, OK:{c:3,r:4}, LA:{c:4,r:4}, MS:{c:5,r:4}, AL:{c:6,r:4}, GA:{c:7,r:4}, FL:{c:8,r:4},
  TX:{c:3,r:5},
  AK:{c:0,r:6}, HI:{c:1,r:6},
};

const COLS = 11;
const ROWS = 7;

function StateHeatmap({ byState, onStateClick }: { byState: { state: string; count: number }[]; onStateClick: (state: string) => void }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const countMap = new Map(byState.map((d) => [d.state, d.count]));
  const maxCount = Math.max(...byState.map((d) => d.count), 1);

  function cellBg(count: number): string {
    if (count === 0) return 'var(--border)';
    const intensity = Math.min(1, count / maxCount);
    const lightness = Math.round(50 - intensity * 25);
    const saturation = Math.round(60 + intensity * 20);
    return `hsl(225, ${saturation}%, ${lightness}%)`;
  }

  const CELL = 34;
  const GAP = 3;
  const width = COLS * (CELL + GAP) - GAP;
  const height = ROWS * (CELL + GAP) - GAP;

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="an-card-title" style={{ margin: 0 }}>Lead Density Map</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {byState.length} state{byState.length !== 1 ? 's' : ''} · click to search in Discover
        </div>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ position: 'relative', width, height, flexShrink: 0 }}>
          {Object.entries(STATE_GRID).map(([state, { c, r }]) => {
            const count = countMap.get(state) ?? 0;
            const x = c * (CELL + GAP);
            const y = r * (CELL + GAP);
            const hasLeads = count > 0;
            return (
              <div
                key={state}
                style={{
                  position: 'absolute',
                  left: x, top: y,
                  width: CELL, height: CELL,
                  borderRadius: 5,
                  background: cellBg(count),
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  cursor: hasLeads ? 'pointer' : 'default',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                  boxShadow: hasLeads ? `0 0 0 1px hsl(225, 80%, ${Math.round(45 - (count / maxCount) * 20)}%)30` : 'none',
                }}
                onClick={() => hasLeads && onStateClick(state)}
                onMouseEnter={(e) => {
                  const rect = (e.target as HTMLElement).closest('div')!.getBoundingClientRect();
                  setTooltip({ x: rect.left + CELL / 2 + window.scrollX, y: rect.top + window.scrollY, text: `${state}: ${count} lead${count !== 1 ? 's' : ''}` });
                  if (hasLeads) (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  setTooltip(null);
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                }}
              >
                <div style={{ fontSize: 9, fontWeight: 800, color: count > 0 ? '#fff' : 'var(--text-faint)', letterSpacing: '0.02em', lineHeight: 1 }}>
                  {state}
                </div>
                {count > 0 && (
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.75)', lineHeight: 1, marginTop: 2 }}>
                    {count}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x - 50, top: tooltip.y - 38,
          background: 'var(--bg-elev)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 10px', fontSize: 11,
          color: 'var(--text)', pointerEvents: 'none', zIndex: 9999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)', whiteSpace: 'nowrap',
        }}>
          {tooltip.text}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>0</span>
        {[0, 0.2, 0.4, 0.7, 1].map((i) => (
          <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: i === 0 ? 'var(--border)' : `hsl(225, ${Math.round(60 + i * 20)}%, ${Math.round(50 - i * 25)}%)` }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>max</span>
      </div>
    </div>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

const STATUS_COLORS: Record<string, string> = {
  new: '#6366f1',
  cold: '#94a3b8',
  contacted: '#3b82f6',
  replied: '#8b5cf6',
  meeting: '#f59e0b',
  proposal: '#f97316',
  won: '#22c55e',
  lost: '#ef4444',
};

const FACTOR_LABELS: Record<string, string> = {
  price: 'Price', timeline: 'Timeline', relationship: 'Relationship',
  quality: 'Quality', competition: 'Competition', no_budget: 'No Budget',
  not_ready: 'Not Ready', other: 'Other',
};

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="an-stat-card">
      <div className="an-stat-label">{label}</div>
      <div className="an-stat-value" style={accent ? { color: accent } : {}}>{value}</div>
      {sub && <div className="an-stat-sub">{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, color, count }: { label: string; value: number; max: number; color?: string; count?: number | string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 2;
  return (
    <div className="an-bar-row">
      <div className="an-bar-label">{label}</div>
      <div className="an-bar-track">
        <div className="an-bar-fill" style={{ width: `${w}%`, background: color || 'var(--accent)' }} />
      </div>
      <div className="an-bar-count">{count ?? value}</div>
    </div>
  );
}

// ── Competitive Intelligence Card ────────────────────────────────────────────
function CompetitorIntelCard({
  competitors,
  maxComp,
}: {
  competitors: { competitor: string; count: number }[];
  maxComp: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [battleCards, setBattleCards] = useState<Record<string, { theirStrengths: string[]; ourAdvantages: string[]; talkTrack: string[]; closingMove: string }>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const showToast = useAppStore((s) => s.showToast);

  async function fetchStrategy(competitor: string) {
    if (active === competitor) { setActive(null); return; }
    setActive(competitor);
    if (battleCards[competitor]) return; // cached
    setLoading(competitor);
    try {
      const res = await api.getCounterStrategy(competitor);
      setBattleCards((prev) => ({ ...prev, [competitor]: res.card }));
    } catch (e: unknown) {
      showToast((e as Error).message || 'AI unavailable', 'error');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="an-card-title" style={{ margin: 0 }}>Competitive Intelligence</div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Click a competitor for AI battle card</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {competitors.map((c, i) => {
          const pct = maxComp > 0 ? (c.count / maxComp) * 100 : 0;
          const isOpen = active === c.competitor;
          const card = battleCards[c.competitor];
          const isLoading = loading === c.competitor;

          return (
            <div key={c.competitor} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {/* Competitor row */}
              <button
                onClick={() => fetchStrategy(c.competitor)}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <div style={{ width: 22, height: 22, borderRadius: 6, background: '#ef444422', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#ef4444' }}>{i + 1}</span>
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{c.competitor}</div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: '#ef4444', borderRadius: 99 }} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{c.count} loss{c.count !== 1 ? 'es' : ''}</div>
                <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {isLoading ? '…' : isOpen ? '▲ hide' : 'battle card ▼'}
                </div>
              </button>

              {/* Battle card */}
              {isOpen && (
                <div style={{ padding: '0 12px 14px', borderTop: '1px solid var(--border)' }}>
                  {isLoading && <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '10px 0' }}>Generating counter-strategy…</p>}
                  {card && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                      {/* Their strengths */}
                      <div style={{ background: '#ef444411', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Their strengths</div>
                        {(card.theirStrengths ?? []).map((s, j) => (
                          <div key={j} style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>· {s}</div>
                        ))}
                      </div>
                      {/* Our advantages */}
                      <div style={{ background: '#10b98111', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Your advantages</div>
                        {(card.ourAdvantages ?? []).map((s, j) => (
                          <div key={j} style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>· {s}</div>
                        ))}
                      </div>
                      {/* Talk track */}
                      <div style={{ gridColumn: '1 / -1', background: '#3b82f611', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Talk Track</div>
                        {(card.talkTrack ?? []).map((s, j) => (
                          <div key={j} style={{ fontSize: 12, color: 'var(--text)', marginBottom: 6, paddingLeft: 8, borderLeft: '2px solid #3b82f6' }}>{s}</div>
                        ))}
                      </div>
                      {/* Closing move */}
                      {card.closingMove && (
                        <div style={{ gridColumn: '1 / -1', background: '#f59e0b11', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Closing Move</div>
                          <div style={{ fontSize: 12, color: 'var(--text)', fontStyle: 'italic' }}>&ldquo;{card.closingMove}&rdquo;</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ICP_CAT_LABELS: Record<string, string> = {
  fleet: 'Fleet Wraps', dinoc: 'DI-NOC', gc_referral: 'GC Referral',
  construction: 'Construction', colorchange: 'Color Change', racing: 'Motorsport',
  reatec: 'Rea-Tec', design: 'Design / Arch', wallgraphics: 'Wall Graphics',
};
const ICP_CAT_COLORS: Record<string, string> = {
  fleet: '#3b82f6', dinoc: '#8b5cf6', gc_referral: '#f59e0b',
  construction: '#f97316', colorchange: '#ec4899', racing: '#ef4444',
  reatec: '#a855f7', design: '#06b6d4', wallgraphics: '#14b8a6',
};

function ICPCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['icp'],
    queryFn: () => api.getICP(),
    staleTime: 10 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="an-card">
        <div className="an-card-title">Ideal Customer Profile</div>
        <div className="skeleton" style={{ height: 100, borderRadius: 8, marginTop: 12 }} />
      </div>
    );
  }

  if (!data?.ok || !data.hasData || (data.categoryBreakdown?.length ?? 0) === 0) return null;

  const topColor = ICP_CAT_COLORS[data.topCategory ?? ''] ?? '#6366f1';

  return (
    <div className="an-card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="an-card-title" style={{ margin: 0 }}>Ideal Customer Profile</div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          derived from {data.wonCount} won deal{data.wonCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Spotlight */}
      <div style={{
        background: `${topColor}10`, border: `1px solid ${topColor}28`,
        borderRadius: 10, padding: '12px 14px', marginBottom: 14,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
      }}>
        {data.topCategory && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Top Vertical</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: topColor }}>
              {ICP_CAT_LABELS[data.topCategory] ?? data.topCategory}
            </div>
          </div>
        )}
        {data.topState && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Best Market</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{data.topState}</div>
          </div>
        )}
        {data.medianFleetSize && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Median Fleet</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{data.medianFleetSize} units</div>
          </div>
        )}
        {data.fleetRange && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Sweet Spot</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
              {data.fleetRange.min}–{data.fleetRange.max} trucks
            </div>
          </div>
        )}
      </div>

      {/* Category breakdown */}
      {data.categoryBreakdown?.map((b) => {
        const color = ICP_CAT_COLORS[b.cat] ?? '#6b7280';
        return (
          <div key={b.cat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>
              {ICP_CAT_LABELS[b.cat] ?? b.cat}
            </div>
            <div style={{ flex: 2, height: 6, background: 'var(--surface-hover)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${b.pct}%`, background: color, borderRadius: 99, opacity: 0.7 }} />
            </div>
            <div style={{ width: 30, fontSize: 11, fontWeight: 700, color, textAlign: 'right', flexShrink: 0 }}>
              {b.pct}%
            </div>
          </div>
        );
      })}

      <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10, marginBottom: 0 }}>
        Use Discover to find more companies matching this profile.
      </p>
    </div>
  );
}

// ── Pipeline Health Score ─────────────────────────────────────────────────────
interface BenchmarkMetric {
  label: string;
  userValue: number | null;
  benchmark: number;
  unit: string;
  higherIsBetter: boolean;
  tip: string;
  score: number; // 0-25
}

function scoreBenchmark(value: number | null, benchmark: number, higherIsBetter: boolean, max = 25): number {
  if (value === null) return max * 0.5; // neutral when no data
  const ratio = higherIsBetter ? value / benchmark : benchmark / value;
  return Math.round(Math.min(max, Math.max(0, ratio * max)));
}

function metricColor(score: number, max = 25): string {
  const pct = score / max;
  if (pct >= 0.8) return '#10b981';
  if (pct >= 0.55) return '#f59e0b';
  return '#ef4444';
}

function PipelineHealthCard() {
  const { data } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.getAnalytics(),
    staleTime: 5 * 60_000,
  });

  if (!data?.summary) return null;
  const { summary, activity30d, emailPerf } = data;

  const openRate = emailPerf && emailPerf.totalTracked > 0
    ? Math.round((emailPerf.opens7d / emailPerf.totalTracked) * 100)
    : null;
  const monthlyActivity = (activity30d?.emails ?? 0) + (activity30d?.calls ?? 0);

  const metrics: BenchmarkMetric[] = [
    {
      label: 'Win Rate',
      userValue: summary?.winRate ?? null,
      benchmark: 22,
      unit: '%',
      higherIsBetter: true,
      tip: 'Prioritize leads already at Meeting or Proposal stage.',
      score: scoreBenchmark(summary?.winRate ?? null, 22, true),
    },
    {
      label: 'Days to Close',
      userValue: summary?.avgDaysToClose !== null && summary?.avgDaysToClose !== undefined
        ? Math.round(summary.avgDaysToClose) : null,
      benchmark: 24,
      unit: 'd',
      higherIsBetter: false,
      tip: 'Same-day follow-up after a reply cuts close time by 40%.',
      score: scoreBenchmark(summary?.avgDaysToClose ?? null, 24, false),
    },
    {
      label: 'Email Open Rate',
      userValue: openRate,
      benchmark: 28,
      unit: '%',
      higherIsBetter: true,
      tip: 'Add the prospect\'s fleet size and city to the subject line.',
      score: scoreBenchmark(openRate, 28, true),
    },
    {
      label: 'Monthly Outreach',
      userValue: monthlyActivity,
      benchmark: 50,
      unit: ' touches',
      higherIsBetter: true,
      tip: 'Use Bulk Sequence launch in Discover to scale outreach fast.',
      score: scoreBenchmark(monthlyActivity, 50, true),
    },
  ];

  const totalScore = metrics.reduce((s, m) => s + m.score, 0);
  const scoreLabel = totalScore >= 80 ? 'Elite' : totalScore >= 60 ? 'Strong' : totalScore >= 40 ? 'Building' : 'Needs Work';
  const scoreLabelColor = totalScore >= 80 ? '#10b981' : totalScore >= 60 ? '#3b82f6' : totalScore >= 40 ? '#f59e0b' : '#ef4444';
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (totalScore / 100) * circumference;

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div className="an-card-title">Pipeline Health Score</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 20 }}>
        Your shop vs. wrap industry benchmarks — updated each time analytics refresh
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 32, alignItems: 'center' }}>
        {/* Gauge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <svg width="120" height="120" viewBox="0 0 88 88">
            <circle cx="44" cy="44" r="36" fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle
              cx="44" cy="44" r="36" fill="none"
              stroke={scoreLabelColor} strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 44 44)"
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
            <text x="44" y="40" textAnchor="middle" fill="var(--text)" fontSize="20" fontWeight="800" fontFamily="var(--mono)">
              {totalScore}
            </text>
            <text x="44" y="56" textAnchor="middle" fill={scoreLabelColor} fontSize="9" fontWeight="700" letterSpacing="1">
              / 100
            </text>
          </svg>
          <div style={{ fontSize: 14, fontWeight: 800, color: scoreLabelColor }}>{scoreLabel}</div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'center' }}>
            Industry benchmark: 22% win rate · 24d close · 28% open rate · 50 touches/mo
          </div>
        </div>

        {/* Metric breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {metrics.map((m) => {
            const color = metricColor(m.score);
            const barPct = (m.score / 25) * 100;
            const needsWork = m.score < 14;
            return (
              <div key={m.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{m.label}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      benchmark: {m.benchmark}{m.unit}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: 'var(--mono)' }}>
                      {m.userValue !== null ? `${m.userValue}${m.unit}` : '—'}
                    </span>
                  </div>
                </div>
                <div style={{ height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 99, transition: 'width 0.8s ease' }} />
                </div>
                {needsWork && (
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
                    💡 {m.tip}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Market Penetration Analysis ───────────────────────────────────────────────
function MarketPenetrationCard() {
  const setMode = useAppStore((s) => s.setMode);
  const setPendingDiscoverSearch = useAppStore((s) => s.setPendingDiscoverSearch);

  const { data, isLoading } = useQuery({
    queryKey: ['market-opportunity'],
    queryFn: () => api.getMarketOpportunity(),
    staleTime: 15 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="an-card" style={{ gridColumn: '1 / -1' }}>
        <div className="an-card-title">Market Penetration Analysis</div>
        <div className="skeleton" style={{ height: 140, borderRadius: 8, marginTop: 12 }} />
      </div>
    );
  }

  if (!data?.ok || !data.opportunities || data.opportunities.length === 0) return null;

  const { opportunities, totalUntapped } = data;

  function goDiscover(state: string) {
    setPendingDiscoverSearch({ states: [state], sort: 'wrap_score', limit: 25, offset: 0, minFleet: 10, maxFleet: 500, industries: null });
    setMode('discover');
  }

  const maxLeads = Math.max(...opportunities.map((o) => o.lead_count), 1);

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="an-card-title" style={{ margin: 0 }}>Market Penetration Analysis</div>
        {totalUntapped > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', background: '#22c55e14', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {totalUntapped.toLocaleString()} carriers untapped
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
        Your pipeline vs. FMCSA fleet database — find white space in your target markets
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {opportunities.map((o) => {
          const pct = o.penetration_pct ?? 0;
          const barColor = pct >= 20 ? '#f59e0b' : pct >= 8 ? '#3b82f6' : '#22c55e';
          const leadPct = maxLeads > 0 ? (o.lead_count / maxLeads) * 100 : 0;
          return (
            <div
              key={o.state}
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg-elev)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{o.state}</span>
                  {o.won_count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', background: '#22c55e14', padding: '1px 5px', borderRadius: 3 }}>
                      {o.won_count} won
                    </span>
                  )}
                </div>
                <button
                  onClick={() => goDiscover(o.state)}
                  style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--accent)',
                    background: 'var(--accent-subtle)', border: '1px solid var(--accent-glow)',
                    borderRadius: 5, padding: '2px 8px', cursor: 'pointer',
                  }}
                >
                  Search →
                </button>
              </div>

              {/* Pipeline bar */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                  <span>Your leads</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{o.lead_count.toLocaleString()}</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elev-2)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(2, leadPct)}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.5s ease' }} />
                </div>
              </div>

              {/* Penetration rate */}
              {o.target_carriers > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                    <span>Market penetration</span>
                    <span style={{ fontWeight: 700, color: barColor }}>{pct}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elev-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: barColor, borderRadius: 3, transition: 'width 0.5s ease' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
                    {o.untapped_count.toLocaleString()} carriers untapped · {o.target_carriers.toLocaleString()} total addressable
                  </div>
                </div>
              )}
              {o.target_carriers === 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
                  Load FMCSA data to see market size
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-soft)', fontSize: 11, color: 'var(--text-faint)' }}>
        Market size from FMCSA Motor Carrier Census · fleet range 10–500 vehicles · click "Search →" to prospect any state
      </div>
    </div>
  );
}

// ── Material Margin Dashboard ─────────────────────────────────────────────────
function MarginDashboardCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['margin-analytics'],
    queryFn: () => api.getMarginAnalytics(),
    staleTime: 10 * 60_000,
  });

  const CAT_LABELS: Record<string, string> = {
    fleet: 'Fleet', design: 'Design', construction: 'Construction',
    dinoc: 'DI-NOC', reatec: 'Reatec', colorchange: 'Color Change',
    wallgraphics: 'Wall Graphics', gc_referral: 'GC Referral', racing: 'Racing',
  };

  function fmtDollar(n: number): string {
    if (!n && n !== 0) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${Math.round(n)}`;
  }

  if (isLoading) {
    return (
      <div className="an-card" style={{ gridColumn: '1 / -1' }}>
        <div className="an-card-title">Material Margin</div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><span className="spinner" /></div>
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="an-card" style={{ gridColumn: '1 / -1' }}>
        <div className="an-card-title">Material Margin Dashboard</div>
        <div style={{ padding: '20px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>No margin data yet</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            Add Revenue and Material Cost to your completed jobs to see gross margin by category.
          </div>
        </div>
      </div>
    );
  }

  const { byCategory, totals, bestMarginJobs, worstMarginJobs } = data;
  const maxProfit = Math.max(...byCategory.map((c) => c.total_gross_profit), 1);

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div className="an-card-title">Material Margin Dashboard</div>

      {/* Summary stats row */}
      {totals && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Revenue', value: fmtDollar(totals.total_revenue), color: '#4d8af5' },
            { label: 'Total Material', value: fmtDollar(totals.total_material), color: 'var(--text-muted)' },
            { label: 'Gross Profit', value: fmtDollar(totals.total_gross_profit), color: '#22c55e' },
            { label: 'Avg Margin', value: totals.avg_margin_pct != null ? `${totals.avg_margin_pct}%` : '—', color: (totals.avg_margin_pct ?? 0) >= 40 ? '#22c55e' : '#f59e0b' },
            ...(totals.avg_revenue_per_hour ? [{ label: '$/Hour', value: `$${Math.round(totals.avg_revenue_per_hour)}`, color: 'var(--accent)' }] : []),
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, minWidth: 100 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-1px', color: s.color, fontFamily: 'var(--mono)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* By category bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {byCategory.map((c) => {
          const margin = c.avg_margin_pct ?? 0;
          const barColor = margin >= 50 ? '#22c55e' : margin >= 35 ? '#f59e0b' : '#f4551c';
          return (
            <div key={c.wrap_category}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{CAT_LABELS[c.wrap_category] ?? c.wrap_category}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{c.job_count} job{c.job_count !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--mono)', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{fmtDollar(c.avg_revenue_per_vehicle)}/vehicle</span>
                  <span style={{ color: barColor, fontWeight: 700 }}>{margin > 0 ? `${margin}%` : '—'}</span>
                  <span style={{ color: '#22c55e' }}>{fmtDollar(c.total_gross_profit)}</span>
                </div>
              </div>
              <div style={{ height: 5, background: 'var(--border)', borderRadius: 99 }}>
                <div style={{ height: '100%', width: `${(c.total_gross_profit / maxProfit) * 100}%`, background: barColor, borderRadius: 99, transition: 'width 0.4s' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Best / worst margin jobs */}
      {(bestMarginJobs.length > 0 || worstMarginJobs.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          {bestMarginJobs.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#22c55e', marginBottom: 8 }}>Highest Margin Jobs</div>
              {bestMarginJobs.map((j, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                  <span style={{ color: 'var(--text)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.company}</span>
                  <span style={{ color: '#22c55e', fontWeight: 700, fontFamily: 'var(--mono)', flexShrink: 0, marginLeft: 8 }}>{j.margin_pct}%</span>
                </div>
              ))}
            </div>
          )}
          {worstMarginJobs.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#f4551c', marginBottom: 8 }}>Lowest Margin Jobs</div>
              {worstMarginJobs.map((j, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                  <span style={{ color: 'var(--text)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.company}</span>
                  <span style={{ color: '#f4551c', fontWeight: 700, fontFamily: 'var(--mono)', flexShrink: 0, marginLeft: 8 }}>{j.margin_pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-faint)' }}>
        Gross margin = (Revenue − Material Cost) / Revenue · Add labor hours to unlock $/hour metric
      </div>
    </div>
  );
}

// ── Referral Intelligence ─────────────────────────────────────────────────────
function ReferralIntelligenceCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['referral-analytics'],
    queryFn: () => api.getReferralAnalytics(),
    staleTime: 10 * 60_000,
  });

  if (isLoading) return null;
  if (!data?.hasData) return null;

  const { referrers, recent, referralCloseRate, organicCloseRate, totalReferredRevenue, totalPipelineValue } = data;

  return (
    <div className="an-card">
      <div className="an-card-title">Referral Intelligence</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
        {referrers.length} active referral source{referrers.length !== 1 ? 's' : ''}
      </div>

      {/* Close rate comparison */}
      {referralCloseRate !== null && organicCloseRate !== null && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Referral close rate', value: `${referralCloseRate}%`, color: referralCloseRate > organicCloseRate ? '#10b981' : 'var(--text)' },
            { label: 'Organic close rate', value: `${organicCloseRate}%`, color: 'var(--text-muted)' },
            { label: 'Referred revenue won', value: totalReferredRevenue >= 1000 ? `$${Math.round(totalReferredRevenue / 1000)}K` : `$${totalReferredRevenue}`, color: '#10b981' },
            { label: 'Active pipeline', value: totalPipelineValue >= 1000 ? `$${Math.round(totalPipelineValue / 1000)}K` : `$${totalPipelineValue}`, color: 'var(--accent)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: 1, textAlign: 'center', padding: '8px 6px', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Referrer leaderboard */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {referrers.map((r, i) => {
          const barPct = referrers[0].referrals > 0 ? (r.referrals / referrers[0].referrals) * 100 : 0;
          return (
            <div key={r.referred_by} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', width: 18, textAlign: 'right', flexShrink: 0 }}>#{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.referred_by}</span>
                  <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700, flexShrink: 0 }}>{r.closeRate}% close</span>
                  {r.won_revenue > 0 && (
                    <span style={{ fontSize: 10, color: '#10b981', flexShrink: 0 }}>
                      {r.won_revenue >= 1000 ? `$${Math.round(r.won_revenue / 1000)}K won` : `$${r.won_revenue} won`}
                    </span>
                  )}
                </div>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${barPct}%`, background: '#10b981', borderRadius: 99, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                  {r.referrals} total · {r.won} won · {r.active} active
                  {r.pipeline_value > 0 && ` · $${r.pipeline_value >= 1000 ? `${Math.round(r.pipeline_value / 1000)}K` : r.pipeline_value} pipeline`}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent referrals */}
      {recent.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', marginBottom: 6 }}>
            Recent Referrals
          </div>
          {recent.slice(0, 4).map((r) => (
            <div key={r.company + r.created_at} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.company}</span>
              <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>via {r.referred_by}</span>
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                background: r.status === 'won' ? '#10b98120' : r.status === 'lost' ? '#ef444420' : '#6366f120',
                color: r.status === 'won' ? '#10b981' : r.status === 'lost' ? '#ef4444' : '#818cf8',
              }}>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-faint)' }}>
        Set a lead's "Referred By" field in the Info tab to track referral sources.
      </div>
    </div>
  );
}

// ── Loss Intelligence Card ────────────────────────────────────────────────────
const LOSS_REASON_LABELS: Record<string, string> = {
  price: 'Price too high', competitor: 'Went with competitor', timing: 'Bad timing',
  not_ready: 'Not ready yet', no_budget: 'No budget', no_response: 'Went dark',
  wrong_fit: 'Wrong fit', other: 'Other', unknown: 'Unknown',
};

const CAT_LABELS: Record<string, string> = {
  fleet: 'Fleet Wraps', dinoc: 'DI-NOC', gc_referral: 'GC Referral', construction: 'Construction',
  colorchange: 'Color Change', racing: 'Racing', reatec: 'Rea Tec', design: 'Interior Design',
  wallgraphics: 'Wall Graphics',
};

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function SeasonalIntelligenceCard() {
  const { setMode, setCurrentLeadId } = useAppStore((s) => ({
    setMode: s.setMode,
    setCurrentLeadId: s.setCurrentLeadId,
  }));
  const { data, isLoading } = useQuery({
    queryKey: ['seasonal-intel'],
    queryFn: () => api.getSeasonalIntelligence(),
    staleTime: 30 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="an-card" style={{ gridColumn: '1 / -1' }}>
        <div className="skeleton" style={{ height: 80, borderRadius: 8 }} />
      </div>
    );
  }

  const d = data;
  if (!d?.ok) return null;

  const maxWins = Math.max(...(d.series.map((s) => s.wins)), 1);

  const STATUS_COLOR: Record<string, string> = {
    proposal: '#22c55e', meeting: '#4d8af5', replied: '#f59e0b', contacted: 'var(--text-faint)',
  };

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="an-card-title" style={{ margin: 0 }}>Seasonal Win Intelligence</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
            Historical win patterns by month — spot your best-selling season and prioritize accordingly
          </div>
        </div>
        {d.topSeasonCategory && d.seasonWins > 0 && (
          <div style={{
            background: 'rgba(77,138,245,0.12)', border: '1px solid rgba(77,138,245,0.3)',
            borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 700, color: '#4d8af5',
          }}>
            📅 {d.currentMonthName} sweet spot: {CAT_LABELS[d.topSeasonCategory] ?? d.topSeasonCategory}
            {d.seasonWins > 0 && <span style={{ fontWeight: 400, marginLeft: 6 }}>({d.seasonWins} historical wins)</span>}
          </div>
        )}
      </div>

      {/* Month sparkline */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 56, marginBottom: 16 }}>
        {d.series.map((s) => {
          const isCurrent = s.month === d.currentMonth;
          const height = Math.max(4, Math.round((s.wins / maxWins) * 48));
          return (
            <div key={s.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{
                width: '100%', height, borderRadius: '3px 3px 0 0',
                background: isCurrent ? '#4d8af5' : s.wins > 0 ? '#4d8af528' : 'var(--border)',
                border: isCurrent ? '1px solid #4d8af5' : 'none',
                transition: 'height 0.3s ease',
              }} />
              <span style={{
                fontSize: 9, fontWeight: isCurrent ? 800 : 400,
                color: isCurrent ? '#4d8af5' : 'var(--text-faint)',
              }}>
                {MONTH_ABBR[s.month - 1]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Hot pipeline leads for this season */}
      {d.hotPipelineLeads.length > 0 && d.topSeasonCategory && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: 8 }}>
            {CAT_LABELS[d.topSeasonCategory] ?? d.topSeasonCategory} leads to push this month ({d.hotPipelineLeads.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {d.hotPipelineLeads.map((lead) => {
              const statusColor = STATUS_COLOR[lead.status] ?? 'var(--text-faint)';
              return (
                <div
                  key={lead.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', borderRadius: 7,
                    background: 'var(--bg-elev)', border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setCurrentLeadId(String(lead.id));
                    setMode('leads');
                  }}
                >
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: statusColor, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.company}
                  </span>
                  {lead.fleet_size && (
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>
                      {lead.fleet_size} units
                    </span>
                  )}
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4,
                    background: `${statusColor}18`, color: statusColor, flexShrink: 0,
                  }}>
                    {lead.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!d.topSeasonCategory && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          Close your first deal to unlock seasonal patterns. As you log wins, WrapOS learns which months are hottest for each service category.
        </p>
      )}
    </div>
  );
}

function LossAnalysisCard() {
  const showToast = useAppStore((s) => s.showToast);
  const { data, isLoading } = useQuery({
    queryKey: ['loss-analysis'],
    queryFn: () => api.getLossAnalysis(),
    staleTime: 5 * 60_000,
  });
  const [winBackLeadId, setWinBackLeadId] = useState<number | null>(null);
  const [winBackEmail, setWinBackEmail] = useState<{ subject: string; body: string } | null>(null);
  const [winBackLoading, setWinBackLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generateWinBack(leadId: number) {
    setWinBackLeadId(leadId);
    setWinBackEmail(null);
    setWinBackLoading(true);
    try {
      const r = await api.generateWinBackEmail(leadId);
      setWinBackEmail({ subject: r.subject, body: r.body });
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setWinBackLoading(false);
    }
  }

  function copyEmail(text: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  if (isLoading) return null;
  if (!data || data.totalLost === 0) return null;

  const maxReasonCount = Math.max(...(data.byReason?.map((r) => r.count) ?? [1]), 1);

  return (
    <div className="an-card" style={{ borderColor: 'rgba(239,68,68,.25)' }}>
      <div className="an-card-header" style={{ marginBottom: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Loss Intelligence
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
          background: 'rgba(239,68,68,.12)', color: '#ef4444',
        }}>
          {data.totalLost} total losses
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Why we lose */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-faint)', marginBottom: 10 }}>
            Why We Lose
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(data.byReason ?? []).slice(0, 6).map((r) => (
              <div key={r.reason}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--text)' }}>{LOSS_REASON_LABELS[r.reason] ?? r.reason}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>{r.count}</span>
                </div>
                <div style={{ height: 3, background: 'var(--border)', borderRadius: 99 }}>
                  <div style={{ width: `${(r.count / maxReasonCount) * 100}%`, height: '100%', background: '#ef4444', borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Competitors eating our lunch */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-faint)', marginBottom: 10 }}>
            Competitors We Lose To
          </div>
          {(data.byCompetitor ?? []).length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic' }}>
              No competitor data yet — fill in the "competitor" field when marking deals lost.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data.byCompetitor ?? []).slice(0, 5).map((c) => (
                <div key={c.competitor} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.competitor}
                  </div>
                  <div style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                    background: 'rgba(239,68,68,.1)', color: '#ef4444',
                  }}>
                    {c.losses} {c.losses === 1 ? 'loss' : 'losses'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recoverable leads win-back panel */}
      {(data.recoverableLeads ?? []).length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-faint)', marginBottom: 10 }}>
            Win-Back Opportunities — Price/Timing/Not Ready
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.recoverableLeads.slice(0, 4).map((lead) => (
              <div key={lead.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{lead.company}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 8 }}>
                      {LOSS_REASON_LABELS[lead.lost_reason] ?? lead.lost_reason}
                      {' · '}
                      {new Date(lead.lost_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <button
                    className="btn"
                    style={{ fontSize: 11, padding: '3px 10px', color: '#4d8af5', borderColor: 'rgba(77,138,245,.3)', flexShrink: 0 }}
                    onClick={() => generateWinBack(lead.id)}
                    disabled={winBackLoading && winBackLeadId === lead.id}
                  >
                    {winBackLoading && winBackLeadId === lead.id ? '…' : '✉ Win Back'}
                  </button>
                </div>
                {winBackLeadId === lead.id && winBackEmail && (
                  <div style={{ marginTop: 8, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#4d8af5', marginBottom: 4 }}>
                      Subject: {winBackEmail.subject}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
                      {winBackEmail.body}
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: 11, padding: '4px 12px' }}
                      onClick={() => copyEmail(`Subject: ${winBackEmail.subject}\n\n${winBackEmail.body}`)}
                    >
                      {copied ? '✓ Copied!' : 'Copy Email'}
                    </button>
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

// ── Lead Cohort Analysis ──────────────────────────────────────────────────────
function CohortAnalysisCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['cohort-analysis'],
    queryFn: () => api.getCohortAnalysis(),
    staleTime: 10 * 60_000,
  });

  const cohorts = data?.cohorts ?? [];
  const trend = data?.trend ?? 'stable';
  const recentRate = data?.recentRate ?? null;

  if (isLoading) {
    return (
      <div className="an-card" style={{ gridColumn: '1 / -1' }}>
        <div className="an-card-title">Lead Cohort Analysis</div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <span className="spinner" />
        </div>
      </div>
    );
  }

  if (!cohorts.length) {
    return (
      <div className="an-card" style={{ gridColumn: '1 / -1' }}>
        <div className="an-card-title">Lead Cohort Analysis</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Import leads over multiple months to see cohort win rate trends.
        </p>
      </div>
    );
  }

  const maxTotal = Math.max(...cohorts.map((c) => c.total), 1);
  const TREND_COLOR = { improving: '#22c55e', declining: '#ef4444', stable: '#f59e0b' }[trend];
  const TREND_LABEL = { improving: '↑ Improving', declining: '↓ Declining', stable: '→ Stable' }[trend];

  function fmtMonth(m: string) {
    const [year, month] = m.split('-');
    const d = new Date(+year, +month - 1);
    return d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
  }

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div className="an-card-title" style={{ margin: 0 }}>Lead Cohort Analysis</div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 99,
          background: TREND_COLOR + '1a', color: TREND_COLOR, letterSpacing: '.04em',
        }}>
          {TREND_LABEL}
        </span>
        {recentRate !== null && (
          <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 'auto' }}>
            Last 3 months: <strong style={{ color: 'var(--text)' }}>{Math.round(recentRate)}%</strong> win rate
          </span>
        )}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        Leads grouped by month added — compare which intake cohorts close at the highest rate within 90 days.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 8, minWidth: cohorts.length * 72 }}>
          {cohorts.map((c) => {
            const barPct = (c.total / maxTotal) * 100;
            const winColor = c.winRate >= 20 ? '#22c55e' : c.winRate >= 10 ? '#f59e0b' : '#6366f1';
            return (
              <div key={c.month} style={{ flex: 1, minWidth: 64, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Bar */}
                <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                  <div style={{ flex: 1, position: 'relative' }} title={`${c.total} leads added`}>
                    <div style={{
                      height: `${barPct}%`, minHeight: 4,
                      background: 'var(--border)', borderRadius: '3px 3px 0 0',
                      position: 'relative', overflow: 'hidden',
                    }}>
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: `${c.winRate}%`,
                        background: winColor,
                        transition: 'height 0.3s ease',
                      }} />
                    </div>
                  </div>
                </div>
                {/* Labels */}
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-faint)', textAlign: 'center', letterSpacing: '.05em' }}>
                  {fmtMonth(c.month)}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: winColor, letterSpacing: '-0.5px' }}>
                    {c.winRate}%
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>{c.total} leads</div>
                </div>
                {c.won > 0 && (
                  <div style={{ fontSize: 9, color: '#22c55e', textAlign: 'center' }}>
                    {c.won}W
                    {c.avgCloseDays !== null && (
                      <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>{c.avgCloseDays}d</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-faint)' }}>
          <div style={{ width: 10, height: 10, background: '#22c55e', borderRadius: 2 }} />
          Win rate ≥ 20%
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-faint)' }}>
          <div style={{ width: 10, height: 10, background: '#f59e0b', borderRadius: 2 }} />
          Win rate 10–20%
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-faint)' }}>
          <div style={{ width: 10, height: 10, background: '#6366f1', borderRadius: 2 }} />
          Win rate &lt; 10%
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 'auto' }}>
          Bar height = leads added · color fill = win rate · W = wins, d = avg close days
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsView() {
  const setMode = useAppStore((s) => s.setMode);
  const setCurrentLeadId = useAppStore((s) => s.setCurrentLeadId);
  const setPendingDiscoverSearch = useAppStore((s) => s.setPendingDiscoverSearch);
  const { user } = useAuth();
  const [selectedWonMonth, setSelectedWonMonth] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.getAnalytics(),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const { data: wonHistory } = useQuery({
    queryKey: ['won-history'],
    queryFn: () => api.getWonHistory(),
    staleTime: 5 * 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="an-root">
        <div className="an-header">
          <div>
            <div className="skeleton" style={{ height: 28, width: 120, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 14, width: 240 }} />
          </div>
        </div>
        <div className="an-stat-strip">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="an-stat-card">
              <div className="skeleton" style={{ height: 11, width: '70%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 28, width: '50%' }} />
            </div>
          ))}
        </div>
        <div className="an-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="an-card">
              <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 16 }} />
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="an-bar-row" style={{ marginBottom: 10 }}>
                  <div className="skeleton" style={{ height: 11, width: '30%' }} />
                  <div className="skeleton" style={{ flex: 1, height: 6, borderRadius: 3, margin: '0 12px' }} />
                  <div className="skeleton" style={{ height: 11, width: 28 }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { summary, byStatus, wonTrend, byCategory, activity30d, winLossFactors, competitors, topLeads, jobs, topCustomers, emailPerf, quoteRevenue, velocity, byState, atRisk, activityCalendar } = data;
  const maxRevTrend = Math.max(...wonTrend.map((t) => t.revenue), 1);
  const maxCat = Math.max(...byCategory.map((c) => c.total), 1);
  const maxFactor = Math.max(...winLossFactors.map((f) => f.count), 1);
  const maxComp = Math.max(...(competitors ?? []).map((c) => c.count), 1);

  const statusOrder = ['won', 'proposal', 'meeting', 'replied', 'contacted', 'cold', 'new', 'lost'];
  const statusRows = statusOrder
    .filter((s) => byStatus[s])
    .map((s) => ({ status: s, count: byStatus[s] }));
  const maxStatus = Math.max(...statusRows.map((r) => r.count), 1);

  const totalActivity = activity30d.emails + activity30d.calls + activity30d.meetings + activity30d.sequences;

  // Revenue forecast: pipeline value × estimated close rates by stage
  const CLOSE_RATES: Record<string, number> = { proposal: 0.60, meeting: 0.35, replied: 0.20, contacted: 0.10, cold: 0.03, new: 0.05 };
  const REV_PER_LEAD: Record<string, number> = { fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000, colorchange: 3500, racing: 40000, reatec: 5500, design: 3000, wallgraphics: 2500 };
  const forecastByStage = statusOrder
    .filter((s) => CLOSE_RATES[s] && byStatus[s])
    .map((s) => {
      const avgRev = byCategory.reduce((sum, c) => sum + (REV_PER_LEAD[c.category] ?? 2500) * c.total, 0) / Math.max(summary.totalLeads, 1);
      const expected = byStatus[s] * CLOSE_RATES[s] * avgRev;
      return { stage: s, count: byStatus[s], rate: Math.round(CLOSE_RATES[s] * 100), expected };
    });
  const totalForecast = forecastByStage.reduce((sum, r) => sum + r.expected, 0);

  // ── Pipeline Health Score (0–100) ────────────────────────────────────────
  // Combines: win rate, email open rate, proposal velocity, lead data quality,
  // pipeline depth, and activity level into one grade.
  const healthScore = (() => {
    let s = 0;
    // Win rate (0–25 pts): 50%+ → full points, scales linearly
    if (summary.winRate !== null) s += Math.min(25, Math.round((summary.winRate / 50) * 25));
    // Email open rate (0–20 pts): 40%+ → full
    if (emailPerf.openRatePct > 0) s += Math.min(20, Math.round((emailPerf.openRatePct / 40) * 20));
    // Active proposals (0–15 pts): 3+ → full
    const proposalCount = byStatus['proposal'] ?? 0;
    s += Math.min(15, proposalCount * 5);
    // Activity last 30d (0–20 pts): 50+ touchpoints → full
    s += Math.min(20, Math.round((totalActivity / 50) * 20));
    // Pipeline depth — ratio of active:cold (0–10 pts)
    const active = (byStatus['replied'] ?? 0) + (byStatus['meeting'] ?? 0) + (byStatus['proposal'] ?? 0);
    const cold = (byStatus['cold'] ?? 0) + (byStatus['new'] ?? 0);
    if (cold > 0) s += Math.min(10, Math.round((active / cold) * 10));
    else if (active > 0) s += 10;
    // Avg days to close (0–10 pts): <= 30d → full
    const days = summary.avgDaysToClose;
    if (days !== null) s += Math.max(0, Math.min(10, 10 - Math.round((days - 30) / 10)));
    return Math.min(100, Math.max(0, s));
  })();
  const healthGrade = healthScore >= 80 ? 'A' : healthScore >= 65 ? 'B' : healthScore >= 50 ? 'C' : healthScore >= 35 ? 'D' : 'F';
  const healthColor = healthScore >= 80 ? '#10b981' : healthScore >= 65 ? '#22c55e' : healthScore >= 50 ? '#f59e0b' : healthScore >= 35 ? '#f97316' : '#ef4444';

  // ── Category average deal size ────────────────────────────────────────────
  const REV_EST: Record<string, number> = { fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000, colorchange: 3500, racing: 40000, reatec: 5500, design: 3000, wallgraphics: 2500, other: 2500 };
  const catDealSizes = byCategory
    .filter((c) => c.total > 0)
    .map((c) => ({ category: c.category, avg: REV_EST[c.category] ?? 2500, won: c.won, total: c.total }))
    .sort((a, b) => b.avg - a.avg);
  const maxDealSize = Math.max(...catDealSizes.map((c) => c.avg), 1);

  return (
    <div className="an-root">
      <div className="an-header">
        <div>
          <h1 className="an-title">Analytics</h1>
          <p className="an-sub">Pipeline intelligence for {user?.companyName || 'your shop'}</p>
        </div>
        <button className="btn" onClick={() => setMode('mission')}>← Mission</button>
      </div>

      {/* ── Summary Strip ── */}
      <div className="an-stat-strip">
        <StatCard label="Total Leads" value={summary.totalLeads} />
        <StatCard label="Quote Revenue" value={quoteRevenue.acceptedValue > 0 ? fmt(quoteRevenue.acceptedValue) : '—'} sub={quoteRevenue.acceptedCount > 0 ? `${quoteRevenue.acceptedCount} accepted` : 'no accepted quotes yet'} accent="#10b981" />
        <StatCard label="Quotes in Pipeline" value={quoteRevenue.sentValue > 0 ? fmt(quoteRevenue.sentValue) : '—'} sub={`${quoteRevenue.sentCount} awaiting reply`} accent="var(--accent)" />
        <StatCard label="Won This Year" value={summary.won} accent="#22c55e" />
        <StatCard label="Win Rate" value={summary.winRate !== null ? `${summary.winRate}%` : '—'} sub="won / (won+lost)" accent={summary.winRate && summary.winRate >= 30 ? '#22c55e' : '#f59e0b'} />
        <StatCard label="Email Open Rate" value={emailPerf.totalTracked > 0 ? `${emailPerf.openRatePct}%` : '—'} sub={emailPerf.totalTracked > 0 ? `${emailPerf.totalTracked} tracked` : 'send tracked emails to see'} accent={emailPerf.openRatePct >= 30 ? '#22c55e' : emailPerf.openRatePct > 0 ? '#f59e0b' : undefined} />
        <StatCard label="Avg Days to Close" value={summary.avgDaysToClose !== null ? `${summary.avgDaysToClose}d` : '—'} />
        <StatCard label="Installs Tracked" value={jobs.total_jobs} sub={`${jobs.total_vehicles ?? 0} vehicles`} />
        <StatCard label="Aging Wraps" value={jobs.aging_90d} sub="< 90 days" accent={jobs.aging_90d > 0 ? '#f59e0b' : undefined} />
      </div>

      <div className="an-grid">

        {/* ── Pipeline by Status ── */}
        <div className="an-card">
          <div className="an-card-title">Pipeline by Stage</div>
          <div className="an-bar-list">
            {statusRows.map((r) => (
              <BarRow
                key={r.status}
                label={STATUSES[r.status as keyof typeof STATUSES] || r.status}
                value={r.count}
                max={maxStatus}
                color={STATUS_COLORS[r.status]}
                count={`${r.count} (${pct(r.count, summary.totalLeads)}%)`}
              />
            ))}
          </div>
        </div>

        {/* ── Revenue at Risk ── */}
        {atRisk && atRisk.length > 0 && (() => {
          const REV_EST: Record<string, number> = { fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000, colorchange: 3500, racing: 40000, reatec: 5500, design: 3000, wallgraphics: 2500, other: 2500 };
          const totalAtRisk = atRisk.reduce((sum, r) => sum + (REV_EST[r.category] ?? 2500), 0);
          return (
            <div className="an-card" style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444', flexShrink: 0 }} />
                <div className="an-card-title" style={{ margin: 0, color: '#ef4444' }}>Revenue at Risk</div>
                <div style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 900, color: '#ef4444' }}>{fmt(totalAtRisk)}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                {atRisk.length} deal{atRisk.length !== 1 ? 's' : ''} in active stages with no activity in 14+ days — at risk of going cold.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {atRisk.map((r) => (
                  <div
                    key={r.id}
                    className="an-top-lead-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() => { setCurrentLeadId(String(r.id)); setMode('leads'); }}
                  >
                    <div className="an-top-lead-company">{r.company}</div>
                    <div className="an-top-lead-meta">
                      {CATEGORIES[r.category as keyof typeof CATEGORIES] || r.category}
                      {r.fleetSize ? ` · ${r.fleetSize} units` : ''}
                    </div>
                    <span className={`status-tag ${r.status}`}>{STATUSES[r.status as keyof typeof STATUSES] || r.status}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: r.daysStale >= 30 ? '#ef4444' : '#f59e0b', marginLeft: 'auto', flexShrink: 0 }}>
                      {r.daysStale}d silent
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-faint)' }}>
                Click any row to open the lead and send a follow-up.
              </div>
            </div>
          );
        })()}

        {/* ── Won Trend ── */}
        <div className="an-card">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="an-card-title" style={{ marginBottom: 0 }}>Revenue Won — Last 6 Months</div>
            {wonTrend.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {wonTrend.reduce((s, t) => s + t.won, 0)} deals · {(() => {
                  const total = wonTrend.reduce((s, t) => s + t.revenue, 0);
                  return total >= 1_000_000 ? `$${(total / 1_000_000).toFixed(1)}M` : `$${Math.round(total / 1_000)}K`;
                })()} est.
                {selectedWonMonth && (
                  <button
                    onClick={() => setSelectedWonMonth(null)}
                    style={{ marginLeft: 10, fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    ✕ close
                  </button>
                )}
              </div>
            )}
          </div>
          {wonTrend.length === 0 ? (
            <div className="an-empty">No won deals yet — keep pushing.</div>
          ) : (
            <>
              <div className="an-trend-bars">
                {wonTrend.map((t) => {
                  const revLabel = t.revenue >= 1000
                    ? `$${Math.round(t.revenue / 1000)}K`
                    : `$${t.revenue}`;
                  const isSelected = selectedWonMonth === t.month;
                  return (
                    <div
                      key={t.month}
                      className="an-trend-col"
                      title={`${t.won} deal${t.won !== 1 ? 's' : ''} · ${revLabel} est. — click to see deals`}
                      onClick={() => setSelectedWonMonth(isSelected ? null : t.month)}
                      style={{ cursor: 'pointer', opacity: selectedWonMonth && !isSelected ? 0.45 : 1, transition: 'opacity 0.15s' }}
                    >
                      <div className="an-trend-val" style={{ fontSize: 10 }}>{revLabel}</div>
                      <div
                        className="an-trend-bar"
                        style={{
                          height: `${Math.max(4, Math.round((t.revenue / maxRevTrend) * 80))}px`,
                          background: isSelected
                            ? 'linear-gradient(to top, #22c55e, #10b981cc)'
                            : 'linear-gradient(to top, var(--accent), #6366f1cc)',
                          boxShadow: isSelected ? '0 0 8px #22c55e60' : undefined,
                        }}
                      />
                      <div className="an-trend-label">{t.month}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 1 }}>{t.won}w</div>
                    </div>
                  );
                })}
              </div>

              {/* Drill-down: show actual deals for selected month */}
              {selectedWonMonth && (() => {
                const monthDeals = (wonHistory?.deals ?? []).filter((d) => d.month === selectedWonMonth);
                const monthTotal = monthDeals.reduce((s, d) => s + d.revenue, 0);
                if (monthDeals.length === 0) return (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
                    No deal detail available for {selectedWonMonth}.
                  </div>
                );
                return (
                  <div style={{
                    marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                      {selectedWonMonth} — {monthDeals.length} deal{monthDeals.length !== 1 ? 's' : ''} ·{' '}
                      <span style={{ color: '#22c55e' }}>
                        ${monthTotal >= 1000 ? `${Math.round(monthTotal / 1000)}K` : monthTotal} est.
                      </span>
                    </div>
                    {monthDeals.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => { setCurrentLeadId(String(d.id)); setMode('leads'); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
                          borderRadius: 7, padding: '7px 12px', cursor: 'pointer',
                          textAlign: 'left', width: '100%',
                        }}
                      >
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.company}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {CATEGORIES[d.category as keyof typeof CATEGORIES] || d.category}
                            {d.city && d.state ? ` · ${d.city}, ${d.state}` : d.state ? ` · ${d.state}` : ''}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          ${d.revenue >= 1000 ? `${Math.round(d.revenue / 1000)}K` : d.revenue}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>View →</div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* ── Category Performance ── */}
        <div className="an-card">
          <div className="an-card-title">Performance by Category</div>
          <div className="an-bar-list">
            {byCategory.map((c) => (
              <div key={c.category} className="an-cat-row">
                <div className="an-bar-row" style={{ marginBottom: 2 }}>
                  <div className="an-bar-label">{CATEGORIES[c.category as keyof typeof CATEGORIES] || c.category}</div>
                  <div className="an-bar-track">
                    <div className="an-bar-fill" style={{ width: `${Math.max(2, pct(c.total, maxCat))}%`, background: 'var(--accent)' }} />
                    {c.won > 0 && (
                      <div className="an-bar-fill an-bar-won" style={{ width: `${pct(c.won, maxCat)}%` }} />
                    )}
                  </div>
                  <div className="an-bar-count">{c.total} total · {c.won} won</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Activity Last 30d ── */}
        <div className="an-card">
          <div className="an-card-title">Activity — Last 30 Days</div>
          <div className="an-activity-grid">
            <div className="an-activity-item">
              <div className="an-activity-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></div>
              <div className="an-activity-val">{activity30d.emails}</div>
              <div className="an-activity-label">Emails Sent</div>
            </div>
            <div className="an-activity-item">
              <div className="an-activity-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/></svg></div>
              <div className="an-activity-val">{activity30d.calls}</div>
              <div className="an-activity-label">Calls Made</div>
            </div>
            <div className="an-activity-item">
              <div className="an-activity-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
              <div className="an-activity-val">{activity30d.meetings}</div>
              <div className="an-activity-label">Meetings Set</div>
            </div>
            <div className="an-activity-item">
              <div className="an-activity-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
              <div className="an-activity-val">{activity30d.sequences}</div>
              <div className="an-activity-label">Sequences Done</div>
            </div>
          </div>
          <div className="an-activity-total">{totalActivity} total touchpoints</div>
        </div>

        {/* ── Revenue Forecast ── */}
        <div className="an-card">
          <div className="an-card-title">Revenue Forecast</div>
          <div style={{ marginBottom: 10 }}>
            <div className="an-stat-value" style={{ color: 'var(--accent)', fontSize: 28 }}>{fmt(totalForecast)}</div>
            <div className="an-stat-sub">probability-weighted pipeline</div>
          </div>
          <div className="an-bar-list">
            {forecastByStage.map((r) => (
              <div key={r.stage} className="an-bar-row">
                <div className="an-bar-label">{STATUSES[r.stage as keyof typeof STATUSES]} ({r.rate}%)</div>
                <div className="an-bar-track">
                  <div className="an-bar-fill" style={{ width: `${Math.max(2, (r.expected / totalForecast) * 100)}%`, background: '#6366f1' }} />
                </div>
                <div className="an-bar-count">{fmt(r.expected)}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 10 }}>Based on avg deal size × close probability by stage</div>
        </div>

        {/* ── Pipeline Funnel + Conversion Rates ── */}
        <div className="an-card">
          <div className="an-card-title">Pipeline Funnel</div>
          {(() => {
            const FUNNEL_STAGES = ['cold', 'contacted', 'replied', 'meeting', 'proposal', 'won'] as const;
            const STAGE_COLORS: Record<string, string> = {
              cold: '#6b7280', contacted: '#3b82f6', replied: '#8b5cf6',
              meeting: '#f59e0b', proposal: '#ff6b35', won: '#22c55e',
            };
            const counts = FUNNEL_STAGES.map((s) => ({ stage: s, count: byStatus[s] ?? 0 }));
            const maxCount = Math.max(...counts.map((c) => c.count), 1);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {counts.map((row, i) => {
                  const next = counts[i + 1];
                  const convRate = next && row.count > 0 ? Math.round((next.count / row.count) * 100) : null;
                  const vel = velocity?.find((v) => v.stage === row.stage);
                  return (
                    <div key={row.stage}>
                      <div className="an-bar-row" style={{ alignItems: 'center' }}>
                        <div className="an-bar-label" style={{ color: STAGE_COLORS[row.stage], fontWeight: 600, minWidth: 72 }}>
                          {STATUSES[row.stage as keyof typeof STATUSES] || row.stage}
                        </div>
                        <div className="an-bar-track">
                          <div className="an-bar-fill" style={{ width: `${Math.max(2, (row.count / maxCount) * 100)}%`, background: STAGE_COLORS[row.stage] }} />
                        </div>
                        <div className="an-bar-count" style={{ minWidth: 60 }}>{row.count}</div>
                        {vel && vel.avg_days > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--text-faint)', minWidth: 54, textAlign: 'right' }}>{vel.avg_days}d avg</div>
                        )}
                      </div>
                      {convRate !== null && (
                        <div style={{ fontSize: 10, color: convRate >= 40 ? '#22c55e' : convRate >= 20 ? '#f59e0b' : '#ef4444', textAlign: 'center', marginTop: 2, letterSpacing: '0.03em' }}>
                          ↓ {convRate}% advance
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* ── Pipeline Health Score ── */}
        <div className="an-card">
          <div className="an-card-title">Pipeline Health Score</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                border: `4px solid ${healthColor}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 20px ${healthColor}40`,
              }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: healthColor, lineHeight: 1 }}>{healthGrade}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{healthScore}/100</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                {healthScore >= 80 ? 'Excellent — your pipeline is firing on all cylinders.' :
                 healthScore >= 65 ? 'Good — strong fundamentals, a few areas to push.' :
                 healthScore >= 50 ? 'Fair — room to improve engagement and conversion.' :
                 healthScore >= 35 ? 'Needs attention — focus on mid-funnel leads.' :
                 'Critical — pipeline needs immediate action.'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Composite score across win rate, email engagement, active proposals, pipeline depth, and close velocity.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Win Rate', pts: summary.winRate !== null ? Math.min(25, Math.round((summary.winRate / 50) * 25)) : 0, max: 25, val: summary.winRate !== null ? `${summary.winRate}%` : '—' },
              { label: 'Email Open Rate', pts: emailPerf.openRatePct > 0 ? Math.min(20, Math.round((emailPerf.openRatePct / 40) * 20)) : 0, max: 20, val: emailPerf.openRatePct > 0 ? `${emailPerf.openRatePct}%` : '—' },
              { label: 'Active Proposals', pts: Math.min(15, (byStatus['proposal'] ?? 0) * 5), max: 15, val: `${byStatus['proposal'] ?? 0} active` },
              { label: '30-Day Activity', pts: Math.min(20, Math.round((totalActivity / 50) * 20)), max: 20, val: `${totalActivity} touches` },
              { label: 'Pipeline Depth', pts: (() => { const a = (byStatus['replied'] ?? 0) + (byStatus['meeting'] ?? 0) + (byStatus['proposal'] ?? 0); const c = (byStatus['cold'] ?? 0) + (byStatus['new'] ?? 0); return c > 0 ? Math.min(10, Math.round((a / c) * 10)) : (a > 0 ? 10 : 0); })(), max: 10, val: '' },
              { label: 'Close Velocity', pts: summary.avgDaysToClose !== null ? Math.max(0, Math.min(10, 10 - Math.round((summary.avgDaysToClose - 30) / 10))) : 0, max: 10, val: summary.avgDaysToClose !== null ? `${summary.avgDaysToClose}d avg` : '—' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', width: 110, flexShrink: 0 }}>{item.label}</div>
                <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(item.pts / item.max) * 100}%`, background: healthColor, borderRadius: 99, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', width: 72, textAlign: 'right', flexShrink: 0 }}>
                  {item.val || `${item.pts}/${item.max}pts`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Category Average Deal Size ── */}
        {catDealSizes.length > 0 && (
          <div className="an-card">
            <div className="an-card-title">Avg Deal Size by Category</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
              Estimated revenue per won deal · industry benchmarks
            </div>
            <div className="an-bar-list">
              {catDealSizes.map((c) => (
                <div key={c.category} className="an-bar-row">
                  <div className="an-bar-label">{CATEGORIES[c.category as keyof typeof CATEGORIES] || c.category}</div>
                  <div className="an-bar-track">
                    <div className="an-bar-fill" style={{
                      width: `${Math.max(2, (c.avg / maxDealSize) * 100)}%`,
                      background: c.won > 0 ? '#10b981' : 'var(--accent)',
                    }} />
                  </div>
                  <div className="an-bar-count">
                    {fmt(c.avg)}{c.won > 0 && <span style={{ color: '#10b981', marginLeft: 4 }}>· {c.won}w</span>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)' }}>
              Focus on high-value categories to maximize revenue per hour of sales effort.
            </div>
          </div>
        )}

        {/* ── Win/Loss Factors ── */}
        {winLossFactors.length > 0 && (
          <div className="an-card">
            <div className="an-card-title">Win/Loss Factors</div>
            <div className="an-bar-list">
              {winLossFactors.map((f) => (
                <BarRow
                  key={f.factor}
                  label={FACTOR_LABELS[f.factor] || f.factor}
                  value={f.count}
                  max={maxFactor}
                  color="#8b5cf6"
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Competitive Intelligence ── */}
        {competitors && competitors.length > 0 && (
          <CompetitorIntelCard competitors={competitors} maxComp={maxComp} />
        )}

        {/* ── Top Leads to Work ── */}
        {topLeads.length > 0 && (
          <div className="an-card" style={{ gridColumn: '1 / -1' }}>
            <div className="an-card-title">Top Leads to Work Now</div>
            <div className="an-top-leads">
              {topLeads.map((l) => (
                <div
                  key={l.id}
                  className="an-top-lead-row"
                  onClick={() => { setCurrentLeadId(String(l.id)); setMode('leads'); }}
                >
                  <div className="an-top-lead-company">{l.company}</div>
                  <div className="an-top-lead-meta">
                    {CATEGORIES[l.category as keyof typeof CATEGORIES] || l.category}
                    {l.city && l.state ? ` · ${l.city}, ${l.state}` : ''}
                    {l.fleet_size ? ` · ${l.fleet_size} units` : ''}
                  </div>
                  <span className={`status-tag ${l.status}`}>{STATUSES[l.status as keyof typeof STATUSES] || l.status}</span>
                  <span className="an-arrow">→</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Email Intelligence ── */}
        <div className="an-card">
          <div className="an-card-title">Email Intelligence</div>
          {emailPerf.totalTracked === 0 ? (
            <div className="an-empty">Send tracked emails to see open rates and engagement metrics here.</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div className="an-stat-value" style={{ fontSize: 28, color: emailPerf.openRatePct >= 30 ? '#22c55e' : '#f59e0b' }}>
                    {emailPerf.openRatePct}%
                  </div>
                  <div className="an-stat-sub">open rate</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div className="an-stat-value" style={{ fontSize: 28, color: 'var(--accent)' }}>{emailPerf.opens7d}</div>
                  <div className="an-stat-sub">opens this week</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div className="an-stat-value" style={{ fontSize: 28, color: 'var(--text)' }}>{emailPerf.leadsOpened}</div>
                  <div className="an-stat-sub">leads engaged</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {emailPerf.totalTracked} emails with open tracking · Industry avg open rate is ~22%
                {emailPerf.openRatePct >= 30
                  ? ' — your outreach is performing above average.'
                  : emailPerf.openRatePct > 0
                    ? ' — try subject line A/B testing to improve.'
                    : '.'}
              </div>
            </>
          )}
        </div>

        {/* ── Quote Revenue Intelligence ── */}
        {quoteRevenue.totalQuotes > 0 && (
          <div className="an-card">
            <div className="an-card-title">Quote Revenue Breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Accepted', count: quoteRevenue.acceptedCount, value: quoteRevenue.acceptedValue, color: '#10b981' },
                { label: 'Awaiting reply', count: quoteRevenue.sentCount, value: quoteRevenue.sentValue, color: 'var(--accent)' },
                { label: 'Drafts', count: quoteRevenue.draftCount, value: 0, color: 'var(--text-muted)' },
              ].filter((r) => r.count > 0).map((r) => (
                <div key={r.label} className="an-bar-row">
                  <div className="an-bar-label" style={{ color: r.color, fontWeight: 600 }}>{r.label}</div>
                  <div className="an-bar-track">
                    <div className="an-bar-fill" style={{
                      width: `${quoteRevenue.totalQuotes > 0 ? Math.max(4, (r.count / quoteRevenue.totalQuotes) * 100) : 0}%`,
                      background: r.color,
                    }} />
                  </div>
                  <div className="an-bar-count">{r.count} quote{r.count !== 1 ? 's' : ''}{r.value > 0 ? ` · ${fmt(r.value)}` : ''}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>Confirmed revenue</span>
              <span style={{ fontWeight: 800, color: '#10b981', fontSize: 15 }}>{fmt(quoteRevenue.acceptedValue)}</span>
            </div>
          </div>
        )}

        {/* ── Lead Density Map ── */}
        {byState && byState.length > 0 && (
          <StateHeatmap
            byState={byState}
            onStateClick={(state) => {
              setPendingDiscoverSearch({ states: [state], sort: 'wrap_score', limit: 25, offset: 0, minFleet: 10, maxFleet: 500, industries: null });
              setMode('discover');
            }}
          />
        )}

        {/* ── Seasonal Win Intelligence ── */}
        <SeasonalIntelligenceCard />

        {/* ── Loss Intelligence ── */}
        <LossAnalysisCard />

        {/* ── Referral Intelligence ── */}
        <ReferralIntelligenceCard />

        {/* ── Activity Heatmap ── */}
        {activityCalendar && <ActivityHeatmap data={activityCalendar} />}

        {/* ── Win Rate Intelligence ── */}
        <WinRateMatrix />

        {/* ── Pipeline Velocity ── */}
        <PipelineVelocityCard />

        {/* ── Sequence Performance Intelligence ── */}
        <SequencePerformanceCard />

        {/* ── Email Send-Time Intelligence ── */}
        <EmailTimingCard />

        {/* ── AI Pipeline Narrative ── */}
        <PipelineNarrativeCard />

        {/* ── Win Pattern Analysis ── */}
        {/* ── 3-Month Revenue Projection ── */}
        <RevenueForecastCard />

        <WinPatternCard />

        {/* ── Pipeline Doctor ── */}
        <PipelineDoctorCard />

        {/* ── Pipeline Health Score ── */}
        <PipelineHealthCard />

        {/* ── Revenue Attribution ── */}
        <RevenueAttributionCard />

        {/* ── Material Margin Dashboard ── */}
        <MarginDashboardCard />

        {/* ── Lead Cohort Analysis ── */}
        <CohortAnalysisCard />

        {/* ── Ideal Customer Profile ── */}
        <ICPCard />

        {/* ── Market Penetration Analysis ── */}
        <MarketPenetrationCard />

        {/* ── Territory Intel ── */}
        <TerritoryIntelCard />

        {/* ── Customer Lifetime Value ── */}
        {topCustomers && topCustomers.length > 0 && (
          <div className="an-card" style={{ gridColumn: '1 / -1' }}>
            <div className="an-card-title">Customer Lifetime Value</div>
            <div className="an-clv-grid">
              {topCustomers.map((c, i) => (
                <div key={c.company} className="an-clv-row">
                  <div className="an-clv-rank">#{i + 1}</div>
                  <div className="an-clv-company">{c.company}</div>
                  <div className="an-clv-meta">
                    {c.won_deals > 0 && <span>{c.won_deals} deal{c.won_deals !== 1 ? 's' : ''}</span>}
                    {c.jobs > 0 && <span>{c.jobs} install{c.jobs !== 1 ? 's' : ''}</span>}
                    {c.total_vehicles > 0 && <span>{c.total_vehicles} vehicles</span>}
                  </div>
                  <div className="an-clv-value">{fmt(c.estimated_clv)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
