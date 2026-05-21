import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { useAuth } from '../../hooks/useAuth';
import { CATEGORIES, STATUSES } from '../../api/types';

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

function SequencePerformanceCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['sequence-performance'],
    queryFn: () => api.getSequencePerformance(),
    staleTime: 5 * 60_000,
  });

  if (isLoading || !data || (data.tones.length === 0 && data.byDow.length === 0)) return null;

  const maxToneSent = Math.max(...data.tones.map((t) => t.sent), 1);
  const maxDowSent = Math.max(...data.byDow.map((d) => d.sent), 1);

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

  if (!data?.ok) return null;
  const { summary, activity30d, emailPerf } = data as {
    ok: boolean;
    summary: { winRate: number | null; avgDaysToClose: number | null };
    activity30d: { emails: number; calls: number };
    emailPerf: { opens7d: number; totalTracked: number };
  };

  const openRate = emailPerf?.totalTracked > 0
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

export default function AnalyticsView() {
  const setMode = useAppStore((s) => s.setMode);
  const setCurrentLeadId = useAppStore((s) => s.setCurrentLeadId);
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

  const { summary, byStatus, wonTrend, byCategory, activity30d, winLossFactors, competitors, topLeads, jobs, topCustomers, emailPerf, quoteRevenue, velocity, byState, referrals, atRisk, activityCalendar } = data;
  const maxTrend = Math.max(...wonTrend.map((t) => t.won), 1);
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

        {/* ── Lead Geography ── */}
        {byState && byState.length > 0 && (
          <div className="an-card">
            <div className="an-card-title">Lead Geography</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Leads by state — top {byState.length}</div>
            {(() => {
              const maxCount = Math.max(...byState.map((s) => s.count), 1);
              return byState.map((s) => (
                <div key={s.state} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 26, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>{s.state}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.max(3, (s.count / maxCount) * 100)}%`,
                      background: `hsl(${220 + Math.round((s.count / maxCount) * 40)}, 70%, ${40 + Math.round((s.count / maxCount) * 20)}%)`,
                      borderRadius: 99,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 28, textAlign: 'right', flexShrink: 0 }}>{s.count}</span>
                </div>
              ));
            })()}
          </div>
        )}

        {/* ── Referral Sources ── */}
        {referrals && referrals.length > 0 && (
          <div className="an-card">
            <div className="an-card-title">Referral Sources</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Who sends you business</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {referrals.map((r, i) => (
                <div key={r.referred_by} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', width: 16, flexShrink: 0 }}>#{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.referred_by}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {r.referrals} lead{r.referrals !== 1 ? 's' : ''}
                      {r.won > 0 && <span style={{ color: '#10b981', marginLeft: 6 }}>· {r.won} won</span>}
                      {r.active > 0 && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>· {r.active} active</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {Array.from({ length: r.referrals }).map((_, j) => (
                      <div key={j} style={{ width: 8, height: 8, borderRadius: '50%', background: j < r.won ? '#10b981' : j < r.won + r.active ? '#6366f1' : 'var(--border)' }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)' }}>
              Add referral sources by editing a lead's "Referred By" field in the Info tab.
            </div>
          </div>
        )}

        {/* ── Activity Heatmap ── */}
        {activityCalendar && <ActivityHeatmap data={activityCalendar} />}

        {/* ── Win Rate Intelligence ── */}
        <WinRateMatrix />

        {/* ── Pipeline Velocity ── */}
        <PipelineVelocityCard />

        {/* ── Sequence Performance Intelligence ── */}
        <SequencePerformanceCard />

        {/* ── AI Pipeline Narrative ── */}
        <PipelineNarrativeCard />

        {/* ── Pipeline Health Score ── */}
        <PipelineHealthCard />

        {/* ── Ideal Customer Profile ── */}
        <ICPCard />

        {/* ── Market Penetration Analysis ── */}
        <MarketPenetrationCard />

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
