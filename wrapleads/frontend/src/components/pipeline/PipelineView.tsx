import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { useCountUp } from '../../hooks/useCountUp';
import { useLeads } from '../../hooks/useLeads';
import type { LeadStatus, LeadCategory } from '../../api/types';

const STATUS_ORDER = ['new', 'contacted', 'replied', 'meeting', 'proposal', 'won', 'lost', 'cold'] as const;
const STATUS_LABELS: Record<string, string> = {
  new: 'New', contacted: 'Contacted', replied: 'Replied',
  meeting: 'Meeting Set', proposal: 'Proposal', won: 'Won', lost: 'Lost', cold: 'Cold',
};
const STATUS_COLORS: Record<string, string> = {
  new: '#6366f1', contacted: '#3b82f6', replied: '#0ea5e9',
  meeting: '#f59e0b', proposal: '#f97316', won: '#22c55e', lost: '#ef4444', cold: '#6b7280',
};

const CATEGORY_LABELS: Record<string, string> = {
  fleet: 'Fleet Wraps', dinoc: 'DI-NOC / Rea Tec', gc_referral: 'GC Spec',
  construction: 'Construction Fleet', color_change: 'Color Change',
  racing: 'Motorsport / Race Teams', other: 'Other',
};
const CATEGORY_COLORS: Record<string, string> = {
  fleet: '#3b82f6', dinoc: '#8b5cf6', gc_referral: '#f59e0b',
  construction: '#f97316', color_change: '#ec4899', racing: '#ef4444', other: '#6b7280',
};
const REV_PER_LEAD: Record<string, number> = {
  fleet: 2500, dinoc: 4500, gc_referral: 12000,
  construction: 3500, color_change: 1800, racing: 35000, other: 1500,
};

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ── Visual Conversion Funnel ──────────────────────────────────────────────────
const FUNNEL_STAGES = ['new', 'contacted', 'replied', 'meeting', 'proposal', 'won'] as const;

function ConversionFunnel({
  byStatus,
  total,
  onStageClick,
}: {
  byStatus: Record<string, number>;
  total: number;
  onStageClick: (stage: string) => void;
}) {
  const stages = FUNNEL_STAGES.map((s) => ({ status: s, count: byStatus[s] ?? 0 }));
  const topCount = Math.max(stages[0].count, 1);

  // Overall funnel conversion (new → won)
  const topToWon = stages[0].count > 0
    ? Math.round((stages[stages.length - 1].count / stages[0].count) * 100)
    : 0;

  return (
    <section className="pv-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 className="pv-card-title" style={{ margin: 0 }}>Conversion Funnel</h3>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {topToWon}% end-to-end conversion · click stage to filter leads
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {stages.map((stage, i) => {
          const prev = stages[i - 1];
          const convRate = prev && prev.count > 0
            ? Math.round((stage.count / prev.count) * 100)
            : null;
          const barWidth = Math.max(15, Math.round((stage.count / topCount) * 100));
          const color = STATUS_COLORS[stage.status] ?? '#6b7280';
          const pctOfTotal = total > 0 ? Math.round((stage.count / total) * 100) : 0;

          return (
            <div key={stage.status}>
              {convRate !== null && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '3px 0', justifyContent: 'center',
                }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                    ↓ {convRate}% converted
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                </div>
              )}
              <button
                onClick={() => onStageClick(stage.status)}
                style={{
                  display: 'block', width: `${barWidth}%`, margin: '0 auto',
                  background: `${color}18`, border: `1px solid ${color}40`,
                  borderRadius: 6, padding: '8px 14px', cursor: 'pointer',
                  transition: 'all 0.15s', textAlign: 'center',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = `${color}28`;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}80`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = `${color}18`;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}40`;
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color }}>
                    {STATUS_LABELS[stage.status]}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                    {stage.count.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {pctOfTotal}%
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Lost + Cold summary beneath funnel */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        {(['lost', 'cold'] as const).map((s) => (
          <button
            key={s}
            onClick={() => onStageClick(s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
              color: 'var(--text-muted)', fontSize: 12,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLORS[s], display: 'inline-block' }} />
            {STATUS_LABELS[s]}: <strong style={{ marginLeft: 3, color: 'var(--text)' }}>{(byStatus[s] ?? 0).toLocaleString()}</strong>
          </button>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto', alignSelf: 'center' }}>
          Not counted in funnel
        </span>
      </div>
    </section>
  );
}

function Sparkline({ data }: { data: { day: string; count: number }[] }) {
  if (!data || data.length < 2) return null;
  const W = 120, H = 32, PAD = 2;
  const counts = data.map((d) => d.count);
  const max = Math.max(...counts, 1);
  const pts = counts.map((c, i) => {
    const x = PAD + (i / (counts.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((c / max) * (H - PAD * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const total = counts.reduce((a, b) => a + b, 0);
  const trend = counts[counts.length - 1] >= counts[0] ? '#10b981' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={W} height={H} style={{ overflow: 'visible' }}>
        <polyline points={pts.join(' ')} fill="none" stroke={trend} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((pt, i) => {
          const [x, y] = pt.split(',').map(Number);
          return <circle key={i} cx={x} cy={y} r="2.5" fill={i === pts.length - 1 ? trend : 'transparent'} stroke={i === pts.length - 1 ? trend : 'transparent'} />;
        })}
      </svg>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: trend }}>{total} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>leads (7d)</span></div>
        <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{counts[counts.length - 1]} today</div>
      </div>
    </div>
  );
}

function BarRow({
  label, count, max, color, sub,
}: { label: string; count: number; max: number; color: string; sub?: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="pv-bar-row">
      <div className="pv-bar-label">
        <span>{label}</span>
        {sub && <span className="pv-bar-sub">{sub}</span>}
      </div>
      <div className="pv-bar-track">
        <div className="pv-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="pv-bar-count">{count.toLocaleString()}</span>
    </div>
  );
}

// ── 90-Day Revenue Forecast ───────────────────────────────────────────────────
// Expected weeks to close per stage (conservative)
const WEEKS_TO_CLOSE: Record<string, number> = {
  proposal: 3, meeting: 6, replied: 10, contacted: 14, new: 18,
};
// Stage close probability weights
const CLOSE_PROB: Record<string, number> = {
  proposal: 0.55, meeting: 0.35, replied: 0.22, contacted: 0.12, new: 0.05,
};
const REV_EST: Record<string, number> = {
  fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000,
  colorchange: 3500, racing: 40000, reatec: 5500, design: 3000,
  wallgraphics: 2500, other: 2500,
};

function RevenueForecastChart() {
  const { leads } = useLeads();
  const NUM_WEEKS = 12;
  const buckets = Array.from({ length: NUM_WEEKS }, (_, i) => ({ week: i, label: '', value: 0 }));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Label each bucket as "Mon D" of that week's start
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let i = 0; i < NUM_WEEKS; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i * 7);
    buckets[i].label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  // Project each active lead into a week bucket
  for (const lead of leads) {
    if (!['proposal','meeting','replied','contacted','new'].includes(lead.status)) continue;
    const weeks = WEEKS_TO_CLOSE[lead.status] ?? 18;
    const prob = CLOSE_PROB[lead.status] ?? 0.05;
    const rev = REV_EST[lead.category] ?? 2500;
    const expected = prob * rev;
    const bucket = Math.min(Math.round(weeks), NUM_WEEKS - 1);
    buckets[bucket].value += expected;
  }

  const maxVal = Math.max(...buckets.map((b) => b.value), 1);
  const total = buckets.reduce((s, b) => s + b.value, 0);

  // Find highest-value week for annotation
  const peakWeek = buckets.reduce((best, b) => b.value > best.value ? b : best, buckets[0]);

  if (total === 0) return null;

  return (
    <section className="pv-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 className="pv-card-title" style={{ margin: 0 }}>90-Day Revenue Forecast</h3>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {fmt(total)} expected · weighted by close probability
        </span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Projected weekly closes based on current pipeline stage velocity
      </p>

      {/* Bar chart */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, marginBottom: 6 }}>
        {buckets.map((b, i) => {
          const heightPct = maxVal > 0 ? (b.value / maxVal) * 100 : 0;
          const isPeak = b === peakWeek && b.value > 0;
          const isNear = i < 4;
          const barColor = isNear ? '#22c55e' : i < 8 ? '#3b82f6' : '#8b5cf6';
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
              {isPeak && (
                <div style={{ position: 'absolute', top: -18, fontSize: 9, color: '#f59e0b', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  peak ▼
                </div>
              )}
              <div style={{
                width: '100%', borderRadius: '3px 3px 0 0',
                height: `${Math.max(heightPct, b.value > 0 ? 4 : 0)}%`,
                background: barColor,
                opacity: b.value === 0 ? 0.15 : 1,
                transition: 'height 0.4s ease',
                position: 'relative',
              }}>
                {b.value > 0 && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                    fontSize: 8, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginBottom: 2,
                  }}>
                    {fmt(b.value)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Week labels — show every 3rd */}
      <div style={{ display: 'flex', gap: 4 }}>
        {buckets.map((b, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: 'var(--text-muted)', overflow: 'hidden' }}>
            {i % 3 === 0 ? b.label : ''}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 10, color: 'var(--text-muted)' }}>
        {[['#22c55e', '0–4 wks (proposal/meeting)'], ['#3b82f6', '4–8 wks (replied/contacted)'], ['#8b5cf6', '8–12 wks (new leads)']].map(([c, l]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />
            {l}
          </span>
        ))}
      </div>
    </section>
  );
}

export default function PipelineView() {
  const setMode = useAppStore((s) => s.setMode);
  const setFilter = useAppStore((s) => s.setFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['leads-analytics-full'],
    queryFn: () => api.analytics(),
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="pv-root">
        <div className="pv-hero">
          {[140, 100, 80, 100, 120].map((w, i) => (
            <div key={i} className="pv-hero-card" style={{ gap: 8 }}>
              <div className="skeleton" style={{ height: 36, width: w, borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 10, width: 90 }} />
              <div className="skeleton" style={{ height: 9, width: 70, opacity: 0.5 }} />
            </div>
          ))}
        </div>
        <div className="pv-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="pv-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="skeleton" style={{ height: 11, width: 100 }} />
              {[80, 60, 45, 70, 55].map((w, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="skeleton" style={{ height: 9, width: 70, flexShrink: 0 }} />
                  <div className="skeleton" style={{ height: 8, flex: 1, maxWidth: `${w}%` }} />
                  <div className="skeleton" style={{ height: 9, width: 30 }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { total, byStatus, byCategory, overdue, projectedRevenue, sequenceStats, recentLeads } = data;

  const activeLeads = total - (byStatus.won ?? 0) - (byStatus.lost ?? 0) - (byStatus.cold ?? 0);

  const animTotal = useCountUp(total);
  const animActive = useCountUp(activeLeads);
  const animWon = useCountUp(byStatus.won ?? 0);
  const animOverdue = useCountUp(overdue);
  const animSeq = useCountUp(sequenceStats.activeSequences);
  const animEmails = useCountUp(sequenceStats.emailsSent30d);
  const maxStatus = Math.max(...STATUS_ORDER.map((s) => (byStatus[s] ?? 0) as number), 1);
  const catEntries = Object.entries(byCategory ?? {})
    .map(([cat, count]) => [cat, count ?? 0] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(...catEntries.map(([, c]) => c), 1);

  function goToLeads(status?: string, category?: string) {
    setFilter({
      status: (status as LeadStatus) ?? 'all',
      category: (category as LeadCategory) ?? 'all',
      state: '',
      search: '',
    });
    setMode('leads');
  }

  return (
    <div className="pv-root">
      {/* ── Hero stats ── */}
      <div className="pv-hero">
        <div className="pv-hero-card pv-hero-revenue">
          <div className="pv-hero-value">{fmt(projectedRevenue)}</div>
          <div className="pv-hero-label">projected pipeline value</div>
          <div className="pv-hero-sub">conservative avg per lead × active leads</div>
        </div>
        <div className="pv-hero-card">
          <div className="pv-hero-value">{animTotal.toLocaleString()}</div>
          <div className="pv-hero-label">total leads</div>
          <div className="pv-hero-sub">{animActive} active in pipeline</div>
        </div>
        <div className="pv-hero-card pv-hero-won">
          <div className="pv-hero-value">{animWon}</div>
          <div className="pv-hero-label">won deals</div>
          <button className="pv-hero-link" onClick={() => goToLeads('won')}>view →</button>
        </div>
        {overdue > 0 && (
          <div className="pv-hero-card pv-hero-overdue">
            <div className="pv-hero-value">{animOverdue}</div>
            <div className="pv-hero-label">overdue follow-ups</div>
            <button className="pv-hero-link" onClick={() => goToLeads('contacted')}>view →</button>
          </div>
        )}
        <div className="pv-hero-card">
          <div className="pv-hero-value">{animSeq}</div>
          <div className="pv-hero-label">active drip sequences</div>
          <div className="pv-hero-sub">{animEmails} emails sent (30d)</div>
        </div>
        {recentLeads && recentLeads.length > 1 && (
          <div className="pv-hero-card">
            <Sparkline data={recentLeads} />
            <div className="pv-hero-label" style={{ marginTop: 6 }}>new leads this week</div>
          </div>
        )}
      </div>

      <div className="pv-grid">
        {/* ── Conversion Funnel ── */}
        <ConversionFunnel
          byStatus={byStatus}
          total={total}
          onStageClick={goToLeads}
        />

        {/* ── 90-Day Revenue Forecast ── */}
        <RevenueForecastChart />

        {/* ── Revenue by category ── */}
        <section className="pv-card">
          <h3 className="pv-card-title">By Vertical</h3>
          <div className="pv-bars">
            {catEntries.map(([cat, count]) => (
              <button key={cat} className="pv-bar-btn" onClick={() => goToLeads(undefined, cat)}>
                <BarRow
                  label={CATEGORY_LABELS[cat] ?? cat}
                  count={count}
                  max={maxCat}
                  color={CATEGORY_COLORS[cat] ?? '#6b7280'}
                  sub={`≈ ${fmt(count * (REV_PER_LEAD[cat] ?? 1500))} potential`}
                />
              </button>
            ))}
          </div>
        </section>

        {/* ── Action cards ── */}
        <section className="pv-card pv-actions-card">
          <h3 className="pv-card-title">Quick Actions</h3>
          <div className="pv-actions">
            {overdue > 0 && (
              <button className="pv-action-btn pv-action-warn" onClick={() => goToLeads('contacted')}>
                <span className="pv-action-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </span>
                <div>
                  <div className="pv-action-title">{overdue} overdue follow-ups</div>
                  <div className="pv-action-sub">Contacted 14+ days ago, no reply</div>
                </div>
              </button>
            )}
            <button className="pv-action-btn" onClick={() => goToLeads('new')}>
              <span className="pv-action-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8.01" y2="14" strokeWidth="3"/><line x1="12" y1="14" x2="12.01" y2="14" strokeWidth="3"/><line x1="16" y1="14" x2="16.01" y2="14" strokeWidth="3"/></svg>
              </span>
              <div>
                <div className="pv-action-title">{byStatus.new ?? 0} untouched leads</div>
                <div className="pv-action-sub">Ready to activate drip sequences</div>
              </div>
            </button>
            <button className="pv-action-btn" onClick={() => goToLeads('replied')}>
              <span className="pv-action-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </span>
              <div>
                <div className="pv-action-title">{byStatus.replied ?? 0} leads replied</div>
                <div className="pv-action-sub">Upgrade to proposal stage</div>
              </div>
            </button>
            <button className="pv-action-btn pv-action-primary" onClick={() => setMode('discover')}>
              <span className="pv-action-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <div>
                <div className="pv-action-title">Find more leads</div>
                <div className="pv-action-sub">Search 600K carriers in Discover</div>
              </div>
            </button>
          </div>
        </section>

        {/* ── Revenue breakdown table ── */}
        <section className="pv-card pv-rev-card">
          <h3 className="pv-card-title">Revenue Projection by Vertical</h3>
          <table className="pv-rev-table">
            <thead>
              <tr>
                <th>Vertical</th>
                <th>Leads</th>
                <th>Avg Deal</th>
                <th>Projection</th>
              </tr>
            </thead>
            <tbody>
              {catEntries.map(([cat, count]) => {
                const avg = REV_PER_LEAD[cat] ?? 1500;
                return (
                  <tr key={cat} onClick={() => goToLeads(undefined, cat)} className="pv-rev-row">
                    <td>
                      <span className="pv-cat-dot" style={{ background: CATEGORY_COLORS[cat] ?? '#6b7280' }} />
                      {CATEGORY_LABELS[cat] ?? cat}
                    </td>
                    <td>{count.toLocaleString()}</td>
                    <td>${avg.toLocaleString()}</td>
                    <td className="pv-rev-total">{fmt(count * avg)}</td>
                  </tr>
                );
              })}
              <tr className="pv-rev-total-row">
                <td colSpan={3}><strong>Total Pipeline</strong></td>
                <td className="pv-rev-total"><strong>{fmt(projectedRevenue)}</strong></td>
              </tr>
            </tbody>
          </table>
          <p className="pv-rev-note">
            Projection uses conservative per-lead averages. Actual deal sizes vary.
            GC spec relationships often unlock $50K+ annual contracts.
          </p>
        </section>
      </div>
    </div>
  );
}
