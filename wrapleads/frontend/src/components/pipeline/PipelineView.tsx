import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { useCountUp } from '../../hooks/useCountUp';

const STATUS_ORDER = ['new', 'contacted', 'replied', 'proposal', 'won', 'lost', 'cold'] as const;
const STATUS_LABELS: Record<string, string> = {
  new: 'New', contacted: 'Contacted', replied: 'Replied',
  proposal: 'Proposal', won: 'Won', lost: 'Lost', cold: 'Cold',
};
const STATUS_COLORS: Record<string, string> = {
  new: '#6366f1', contacted: '#3b82f6', replied: '#0ea5e9',
  proposal: '#f59e0b', won: '#22c55e', lost: '#ef4444', cold: '#6b7280',
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

  const { total, byStatus, byCategory, overdue, projectedRevenue, sequenceStats } = data;

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
      status: (status as any) ?? 'all',
      category: (category as any) ?? 'all',
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
      </div>

      <div className="pv-grid">
        {/* ── Funnel by status ── */}
        <section className="pv-card">
          <h3 className="pv-card-title">Lead Funnel</h3>
          <div className="pv-bars">
            {STATUS_ORDER.map((s) => {
              const count = byStatus[s] ?? 0;
              if (!count) return null;
              return (
                <button key={s} className="pv-bar-btn" onClick={() => goToLeads(s)}>
                  <BarRow
                    label={STATUS_LABELS[s]}
                    count={count}
                    max={maxStatus}
                    color={STATUS_COLORS[s]}
                  />
                </button>
              );
            })}
          </div>
        </section>

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
