import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { useAuth } from '../../hooks/useAuth';
import { CATEGORIES, STATUSES } from '../../api/types';

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

export default function AnalyticsView() {
  const setMode = useAppStore((s) => s.setMode);
  const setCurrentLeadId = useAppStore((s) => s.setCurrentLeadId);
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.getAnalytics(),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
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

  const { summary, byStatus, wonTrend, byCategory, activity30d, winLossFactors, competitors, topLeads, jobs, topCustomers, emailPerf, quoteRevenue, velocity, byState, referrals } = data;
  const maxTrend = Math.max(...wonTrend.map((t) => t.won), 1);
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

        {/* ── Won Trend ── */}
        <div className="an-card">
          <div className="an-card-title">Deals Won — Last 6 Months</div>
          {wonTrend.length === 0 ? (
            <div className="an-empty">No won deals yet — keep pushing.</div>
          ) : (
            <div className="an-trend-bars">
              {wonTrend.map((t) => (
                <div key={t.month} className="an-trend-col">
                  <div className="an-trend-val">{t.won}</div>
                  <div
                    className="an-trend-bar"
                    style={{ height: `${Math.max(4, Math.round((t.won / maxTrend) * 80))}px` }}
                  />
                  <div className="an-trend-label">{t.month}</div>
                </div>
              ))}
            </div>
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

        {/* ── Competitor Leaderboard ── */}
        {competitors && competitors.length > 0 && (
          <div className="an-card">
            <div className="an-card-title">Competitors You Lost To</div>
            <div className="an-bar-list">
              {competitors.map((c, i) => (
                <BarRow
                  key={c.competitor}
                  label={`${i + 1}. ${c.competitor}`}
                  value={c.count}
                  max={maxComp}
                  color="#ef4444"
                />
              ))}
            </div>
          </div>
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

        {/* ── AI Pipeline Narrative ── */}
        <PipelineNarrativeCard />

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
