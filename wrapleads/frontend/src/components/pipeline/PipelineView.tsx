import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { useCountUp } from '../../hooks/useCountUp';
import { useLeads } from '../../hooks/useLeads';
import { winProbability, scoreLead, SCORE_COLORS, scoreLabel } from '../../utils/scoring';
import type { LeadStatus, LeadCategory } from '../../api/types';
import InstallCapacityCard from './InstallCapacityCard';

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

// ── Quick Win Predictor ───────────────────────────────────────────────────────

// ── Deal Coach ────────────────────────────────────────────────────────────────
// Rule-based coaching tips for active deals — no LLM, always accurate.

const URGENCY_COLOR_DC: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#3b82f6' };

interface CoachTip {
  icon: string;
  text: string;
  urgency: 'critical' | 'high' | 'medium';
}

function buildTip(status: string, daysSince: number | null): CoachTip | null {
  const d = daysSince;
  if (status === 'replied') {
    if (d !== null && d > 7)  return { icon: '⚡', text: `Hot moment fading — ${d}d since they replied. Book a call today before they forget you.`, urgency: 'critical' };
    if (d !== null && d <= 2) return { icon: '🔥', text: `Just replied ${d || '<1'}d ago — strike while hot. Propose a meeting time now.`, urgency: 'high' };
    return { icon: '📞', text: `Replied ${d ?? '?'}d ago. Perfect window — propose a quick Zoom or site walk.`, urgency: 'medium' };
  }
  if (status === 'meeting') {
    if (d !== null && d > 10) return { icon: '⚠️', text: `Meeting was ${d}d ago with no proposal sent. Quote now or risk losing momentum.`, urgency: 'high' };
    if (d !== null && d <= 3)  return { icon: '✏️', text: `Meeting ${d}d ago — build the proposal while it's fresh. Aim to send by EOD.`, urgency: 'medium' };
    return { icon: '📋', text: `Post-meeting — time to build the quote. Momentum is on your side.`, urgency: 'medium' };
  }
  if (status === 'proposal') {
    if (d !== null && d > 14) return { icon: '🤝', text: `Proposal out ${d}d with no reply. Try a different angle: send ROI numbers or a fleet case study.`, urgency: 'high' };
    if (d !== null && d >= 4)  return { icon: '📬', text: `Proposal out ${d}d. Good time to check in — confirm they've had a chance to review.`, urgency: 'medium' };
    return { icon: '✅', text: `Proposal fresh (${d ?? '?'}d old). Watch email open tracking — expect a reply soon.`, urgency: 'medium' };
  }
  if (status === 'contacted') {
    if (d !== null && d > 21)  return { icon: '❄️', text: `${d}d of silence. Try a completely fresh subject line, or mark cold and revisit next quarter.`, urgency: 'high' };
    if (d !== null && d > 8)   return { icon: '📧', text: `Last touch ${d}d ago. Send a follow-up with a new hook — seasonal angle or a recent case study.`, urgency: 'medium' };
    return null; // Contacted within 8 days — no coaching needed yet
  }
  return null;
}

function DealCoachCard({ onLeadClick }: { onLeadClick: (id: number) => void }) {
  const { leads } = useLeads();

  const items = useMemo(() => {
    return leads
      .filter((l) => ['replied', 'meeting', 'proposal', 'contacted'].includes(l.status) && l.serverId)
      .map((l) => {
        const daysSince = l.lastContacted
          ? Math.floor((Date.now() - new Date(l.lastContacted).getTime()) / 86_400_000)
          : null;
        const tip = buildTip(l.status, daysSince);
        if (!tip) return null;
        const rev = REV_PER_LEAD[l.category] ?? 1500;
        return { lead: l, tip, rev };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => {
        const urgencyRank = { critical: 0, high: 1, medium: 2 };
        const uDiff = urgencyRank[a.tip.urgency] - urgencyRank[b.tip.urgency];
        return uDiff !== 0 ? uDiff : b.rev - a.rev;
      })
      .slice(0, 6);
  }, [leads]);

  if (items.length === 0) return null;

  const critCount = items.filter((i) => i.tip.urgency === 'critical').length;
  const highCount = items.filter((i) => i.tip.urgency === 'high').length;

  return (
    <section className="pv-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 className="pv-card-title" style={{ margin: 0 }}>
            Deal Coach
            {critCount > 0 && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#ef4444', background: '#ef444418', padding: '1px 6px', borderRadius: 99, verticalAlign: 'middle' }}>
                {critCount} urgent
              </span>
            )}
          </h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {items.length} active deals · {critCount + highCount} need your attention now
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(({ lead, tip }) => {
          const color = URGENCY_COLOR_DC[tip.urgency];
          const stageColor: Record<string, string> = { replied: '#3b82f6', meeting: '#f59e0b', proposal: '#f97316', contacted: '#6366f1' };
          const sc = stageColor[lead.status] ?? '#6b7280';
          return (
            <div
              key={lead.serverId}
              style={{
                display: 'grid', gridTemplateColumns: '28px 1fr auto',
                alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 9,
                border: `1px solid ${color}22`,
                background: tip.urgency === 'critical' ? `${color}06` : 'transparent',
              }}
            >
              <span style={{ fontSize: 17, textAlign: 'center' }}>{tip.icon}</span>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                    {lead.company}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: sc, background: `${sc}18`, padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>
                    {lead.status}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{tip.text}</div>
              </div>

              <button
                onClick={() => onLeadClick(lead.serverId!)}
                style={{
                  fontSize: 11, fontWeight: 700, color,
                  background: `${color}10`, border: `1px solid ${color}30`,
                  borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Act →
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Predicted Close Calendar ─────────────────────────────────────────────────
// Shows active deals bucketed by predicted month of close, based on avg days
// remaining from current stage (industry benchmarks).

const STAGE_DAYS_REMAINING: Record<string, number> = {
  proposal: 9, meeting: 16, replied: 26, contacted: 45,
};

const MONTH_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa'];

function PredictedCloseCalendar({ onLeadClick }: { onLeadClick: (id: number) => void }) {
  const { leads } = useLeads();

  const { months, totalExpected } = useMemo(() => {
    const active = leads.filter((l) =>
      ['proposal', 'meeting', 'replied', 'contacted'].includes(l.status) && l.serverId
    );

    // Bucket into next 3 calendar months
    const now = new Date();
    const monthBuckets: Array<{
      label: string;
      year: number;
      month: number;
      deals: Array<{ lead: typeof active[0]; daysToClose: number; prob: number; rev: number }>;
    }> = Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return {
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        year: d.getFullYear(),
        month: d.getMonth(),
        deals: [],
      };
    });

    let totalExp = 0;
    for (const lead of active) {
      const daysToClose = STAGE_DAYS_REMAINING[lead.status] ?? 30;
      const closeDate = new Date(Date.now() + daysToClose * 86_400_000);
      const diffMonths = (closeDate.getFullYear() - now.getFullYear()) * 12 + (closeDate.getMonth() - now.getMonth());
      if (diffMonths >= 0 && diffMonths < 3) {
        const prob = winProbability(lead);
        const rev = REV_PER_LEAD[lead.category] ?? 1500;
        const expVal = Math.round((prob / 100) * rev);
        monthBuckets[diffMonths].deals.push({ lead, daysToClose, prob, rev });
        totalExp += expVal;
      }
    }

    return { months: monthBuckets, totalExpected: totalExp };
  }, [leads]);

  const hasAnyDeals = months.some((m) => m.deals.length > 0);
  if (!hasAnyDeals) return null;

  return (
    <section className="pv-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 className="pv-card-title" style={{ margin: 0 }}>Predicted Close Calendar</h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Based on average days per stage · probability-weighted
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#6366f1', lineHeight: 1 }}>{fmt(totalExpected)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>90-day expected value</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {months.map((m, mi) => {
          const color = MONTH_COLORS[mi];
          const monthExpected = m.deals.reduce((s, d) => s + Math.round((winProbability(d.lead) / 100) * (REV_PER_LEAD[d.lead.category] ?? 1500)), 0);
          return (
            <div
              key={m.label}
              style={{
                border: `1px solid ${color}28`,
                borderRadius: 10,
                overflow: 'hidden',
                background: mi === 0 ? `${color}06` : 'transparent',
              }}
            >
              {/* Month header */}
              <div style={{
                padding: '8px 12px',
                background: `${color}12`,
                borderBottom: `1px solid ${color}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 12, fontWeight: 800, color }}>{m.label}</span>
                {m.deals.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>{fmt(monthExpected)}</span>
                )}
              </div>

              {/* Deal list */}
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5, minHeight: 60 }}>
                {m.deals.length === 0 ? (
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', paddingTop: 4 }}>No closes predicted</span>
                ) : (
                  m.deals
                    .sort((a, b) => winProbability(b.lead) - winProbability(a.lead))
                    .slice(0, 5)
                    .map(({ lead }) => {
                      const prob = winProbability(lead);
                      const stageColor: Record<string, string> = { proposal: '#f97316', meeting: '#f59e0b', replied: '#3b82f6', contacted: '#6366f1' };
                      const sc = stageColor[lead.status] ?? '#6b7280';
                      return (
                        <button
                          key={lead.serverId}
                          onClick={() => onLeadClick(lead.serverId!)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '3px 4px', borderRadius: 5, textAlign: 'left',
                            transition: 'background 0.12s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = `${color}12`)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lead.company}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: prob >= 40 ? '#10b981' : 'var(--text-muted)', flexShrink: 0 }}>
                            {prob}%
                          </span>
                        </button>
                      );
                    })
                )}
                {m.deals.length > 5 && (
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', paddingLeft: 4 }}>+{m.deals.length - 5} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Action Calendar ─────────────────────────────────────────────────────────
// Unified month/week calendar showing follow-up due dates (from leads) and bid
// submission deadlines (from bids) — no backend needed, computed from existing data.

const CAL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CAL_WEEKDAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ActionCalendar({ onLeadClick }: { onLeadClick: (id: number) => void }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { leads } = useLeads();

  const { data: bidsData } = useQuery({
    queryKey: ['bids'],
    queryFn: () => api.getBids(),
    staleTime: 60_000,
  });
  const bids = bidsData?.bids ?? [];

  // Monday of the current week
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const monday = useMemo(() => {
    const d = new Date(today);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return d;
  }, [today]);

  const weeks = useMemo(() =>
    Array.from({ length: 5 }, (_, wi) =>
      Array.from({ length: 7 }, (_, di) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + wi * 7 + di);
        return d;
      })
    ), [monday]);

  // Group leads by follow-up date
  const followupByDate = useMemo(() => {
    const map = new Map<string, typeof leads>();
    for (const lead of leads) {
      if (!lead.followupDueAt || ['won', 'lost'].includes(lead.status)) continue;
      const key = lead.followupDueAt.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(lead);
    }
    return map;
  }, [leads]);

  // Group bids by due date
  const bidsByDate = useMemo(() => {
    const map = new Map<string, typeof bids>();
    for (const bid of bids) {
      if (!bid.bid_due || ['won', 'lost', 'no_bid'].includes(bid.status)) continue;
      const key = bid.bid_due.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(bid);
    }
    return map;
  }, [bids]);

  if (followupByDate.size === 0 && bidsByDate.size === 0) return null;

  const todayKey = isoDay(today);
  const displayDate = selectedDate ?? todayKey;
  const followupsForDate = followupByDate.get(displayDate) ?? [];
  const bidsForDate = bidsByDate.get(displayDate) ?? [];

  const totalFollowups = followupByDate.size;
  const totalBidsDue = bidsByDate.size;

  return (
    <section className="pv-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 className="pv-card-title" style={{ margin: 0 }}>Action Calendar</h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {totalFollowups} follow-up{totalFollowups !== 1 ? 's' : ''} scheduled
            {totalBidsDue > 0 && ` · ${totalBidsDue} bid deadline${totalBidsDue !== 1 ? 's' : ''}`}
            {' '} · next 5 weeks
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-muted)', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
            Follow-up
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
            Bid due
          </span>
        </div>
      </div>

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 3 }}>
        {CAL_WEEKDAYS.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text-faint)', paddingBottom: 2, letterSpacing: '.04em' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
          {week.map((day, di) => {
            const dKey = isoDay(day);
            const fups = followupByDate.get(dKey) ?? [];
            const bdus = bidsByDate.get(dKey) ?? [];
            const isToday = dKey === todayKey;
            const isPast = day < today;
            const isSelected = dKey === displayDate;
            const hasEvents = fups.length > 0 || bdus.length > 0;
            const isWeekend = di >= 5;
            const showMonth = di === 0 || day.getDate() === 1;

            return (
              <button
                key={dKey}
                onClick={() => hasEvents ? setSelectedDate(isSelected ? null : dKey) : undefined}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '5px 2px 4px', borderRadius: 7,
                  border: isSelected ? '1px solid var(--accent)' : isToday ? '1px solid rgba(99,102,241,0.35)' : '1px solid transparent',
                  background: isSelected ? 'var(--accent-subtle)' : isToday ? 'rgba(99,102,241,0.07)' : 'transparent',
                  cursor: hasEvents ? 'pointer' : 'default',
                  opacity: isPast && !hasEvents ? 0.3 : 1,
                  transition: 'background 0.12s, border-color 0.12s',
                  minWidth: 0,
                }}
              >
                {showMonth && (
                  <span style={{ fontSize: 8, color: 'var(--text-faint)', lineHeight: 1.2, marginBottom: 1 }}>
                    {CAL_MONTHS[day.getMonth()]}
                  </span>
                )}
                <span style={{
                  fontSize: 12, fontWeight: isToday ? 800 : 500,
                  color: isToday ? '#6366f1' : isWeekend ? 'var(--text-muted)' : 'var(--text)',
                  lineHeight: showMonth ? 1 : 1.6,
                }}>
                  {day.getDate()}
                </span>
                <div style={{ display: 'flex', gap: 2, marginTop: 3, minHeight: 6 }}>
                  {fups.length > 0 && (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} title={`${fups.length} follow-up${fups.length !== 1 ? 's' : ''}`} />
                  )}
                  {bdus.length > 0 && (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} title={`${bdus.length} bid${bdus.length !== 1 ? 's' : ''} due`} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}

      {/* Event detail for selected / today */}
      {(followupsForDate.length > 0 || bidsForDate.length > 0) && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-soft)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>
            {new Date(displayDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          {followupsForDate.map((lead) => (
            <button
              key={lead.id}
              onClick={() => lead.serverId && onLeadClick(lead.serverId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 10px', borderRadius: 7, marginBottom: 4,
                background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
                cursor: lead.serverId ? 'pointer' : 'default', textAlign: 'left',
                transition: 'border-color 0.12s',
              }}
              onMouseEnter={(e) => { if (lead.serverId) (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f640'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lead.company}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>Follow-up due</span>
              {lead.serverId && <span style={{ fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>→</span>}
            </button>
          ))}
          {bidsForDate.map((bid) => (
            <div
              key={bid.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 7, marginBottom: 4,
                background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {bid.project_name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                Bid due{bid.gc_name ? ` · ${bid.gc_name}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const STAGE_VELOCITY_COLORS: Record<string, string> = {
  new: '#6366f1', contacted: '#3b82f6', replied: '#0ea5e9', meeting: '#f59e0b', proposal: '#f97316',
};

function PipelineVelocityCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-velocity'],
    queryFn: () => api.getPipelineVelocity(),
    staleTime: 120_000,
  });

  if (isLoading) {
    return (
      <section className="pv-card">
        <div className="skeleton" style={{ height: 11, width: 140, marginBottom: 14 }} />
        {[100, 70, 55, 80, 65].map((w, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div className="skeleton" style={{ height: 9, width: 72, flexShrink: 0 }} />
            <div className="skeleton" style={{ height: 7, width: `${w}%`, flex: 1 }} />
            <div className="skeleton" style={{ height: 9, width: 32 }} />
          </div>
        ))}
      </section>
    );
  }

  if (!data?.ok || !data.velocity.length) return null;

  const stagesWithData = data.velocity.filter((v) => v.avgDays !== null);
  if (stagesWithData.length === 0) return null;

  const maxDays = Math.max(...stagesWithData.map((v) => v.avgDays ?? 0), 1);
  const bottleneck = data.bottleneck;

  return (
    <section className="pv-card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 className="pv-card-title" style={{ margin: 0 }}>Stage Velocity</h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Avg days spent per stage · based on historical transitions
          </p>
        </div>
        {data.totalAvgCycleDays > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#6366f1', lineHeight: 1 }}>{data.totalAvgCycleDays}d</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>avg cycle</div>
          </div>
        )}
      </div>

      {bottleneck && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
          padding: '6px 10px', borderRadius: 7,
          background: `${STAGE_VELOCITY_COLORS[bottleneck] ?? '#6b7280'}12`,
          border: `1px solid ${STAGE_VELOCITY_COLORS[bottleneck] ?? '#6b7280'}28`,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"
            style={{ color: STAGE_VELOCITY_COLORS[bottleneck] ?? '#6b7280', flexShrink: 0 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            Bottleneck: <strong style={{ color: STAGE_VELOCITY_COLORS[bottleneck] ?? '#6b7280' }}>
              {STATUS_LABELS[bottleneck] ?? bottleneck}
            </strong> — leads stall longest here
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {stagesWithData.map((v) => {
          const color = STAGE_VELOCITY_COLORS[v.stage] ?? '#6b7280';
          const barPct = Math.max(6, Math.round(((v.avgDays ?? 0) / maxDays) * 100));
          const isBottleneck = v.stage === bottleneck;
          return (
            <div key={v.stage} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 72, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>
                {STATUS_LABELS[v.stage] ?? v.stage}
              </div>
              <div style={{ flex: 1, height: 8, background: 'var(--surface-hover)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${barPct}%`, borderRadius: 4,
                  background: color,
                  opacity: isBottleneck ? 1 : 0.6,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{ width: 36, fontSize: 11, fontWeight: 700, color: isBottleneck ? color : 'var(--text-muted)', flexShrink: 0 }}>
                {v.avgDays}d
              </div>
            </div>
          );
        })}
      </div>

      {data.activeWithPrediction.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Next predicted closes
          </div>
          {data.activeWithPrediction.slice(0, 4).map((d) => {
            const color = STATUS_COLORS[d.status] ?? '#6b7280';
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', gap: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {d.company}
                </div>
                <span style={{ fontSize: 10, color, background: `${color}15`, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                  {STATUS_LABELS[d.status] ?? d.status}
                </span>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {d.predictedClose}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QuickWinPredictor({ onLeadClick }: { onLeadClick: (id: number) => void }) {
  const { leads } = useLeads();
  const [showAll, setShowAll] = useState(false);

  const candidates = useMemo(() => {
    return leads
      .filter((l) => ['meeting', 'proposal', 'replied'].includes(l.status) && l.serverId)
      .map((l) => {
        const prob = winProbability(l);
        const score = scoreLead(l);
        const rev = REV_PER_LEAD[l.category] ?? 1500;
        const expectedVal = Math.round((prob / 100) * rev);
        return { lead: l, prob, score, rev, expectedVal };
      })
      .sort((a, b) => b.expectedVal - a.expectedVal || b.prob - a.prob);
  }, [leads]);

  const displayed = showAll ? candidates : candidates.slice(0, 5);
  const totalUpside = candidates.reduce((sum, c) => sum + c.expectedVal, 0);

  if (candidates.length === 0) return null;

  return (
    <section className="pv-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 className="pv-card-title" style={{ margin: 0 }}>
            Quick Win Predictor
            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', verticalAlign: 'middle' }}>
              meeting · proposal · replied
            </span>
          </h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {candidates.length} deals within striking distance · {fmt(totalUpside)} expected value if closed
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>{fmt(totalUpside)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>probability-weighted upside</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {displayed.map(({ lead, prob, score, rev, expectedVal }, idx) => {
          const label = scoreLabel(score);
          const color = SCORE_COLORS[label];
          const stageColor: Record<string, string> = { meeting: '#f59e0b', proposal: '#f97316', replied: '#3b82f6' };
          const sc = stageColor[lead.status] ?? '#6b7280';
          return (
            <button
              key={lead.serverId}
              onClick={() => onLeadClick(lead.serverId!)}
              style={{
                display: 'grid',
                gridTemplateColumns: '20px 1fr auto auto auto',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 9,
                border: `1px solid ${idx === 0 ? '#22c55e33' : 'var(--border)'}`,
                background: idx === 0 ? '#22c55e06' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#22c55e08')}
              onMouseLeave={(e) => (e.currentTarget.style.background = idx === 0 ? '#22c55e06' : 'transparent')}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textAlign: 'center' }}>
                {idx + 1}
              </span>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lead.company}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: sc, background: `${sc}18`, padding: '1px 5px', borderRadius: 3 }}>
                    {lead.status}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {CATEGORY_LABELS[lead.category] ?? lead.category}
                  </span>
                  {lead.contactName && (
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>· {lead.contactName}</span>
                  )}
                </div>
              </div>

              {/* Win probability gauge */}
              <div style={{ textAlign: 'center', minWidth: 52 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: prob >= 35 ? '#22c55e' : prob >= 20 ? '#f59e0b' : 'var(--text-muted)', lineHeight: 1 }}>
                  {prob}%
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>close prob</div>
              </div>

              {/* AI Score */}
              <div style={{ textAlign: 'center', minWidth: 44 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}18`, padding: '2px 6px', borderRadius: 4 }}>
                  {score}
                </span>
                <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 1 }}>score</div>
              </div>

              {/* Expected value */}
              <div style={{ textAlign: 'right', minWidth: 56 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', lineHeight: 1 }}>{fmt(expectedVal)}</div>
                <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>of {fmt(rev)}</div>
              </div>
            </button>
          );
        })}
      </div>

      {candidates.length > 5 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
        >
          Show {candidates.length - 5} more →
        </button>
      )}
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
  const closedCount = (byStatus.won ?? 0) + (byStatus.lost ?? 0);
  const closeRate = closedCount > 0 ? (byStatus.won ?? 0) / closedCount : 0.24;

  const animTotal = useCountUp(total);
  const animActive = useCountUp(activeLeads);
  const animWon = useCountUp(byStatus.won ?? 0);
  const animOverdue = useCountUp(overdue);
  const animSeq = useCountUp(sequenceStats.activeSequences);
  const animEmails = useCountUp(sequenceStats.emailsSent30d);
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

        {/* ── Action Calendar ── */}
        <ActionCalendar onLeadClick={(id) => { setFilter({ status: 'all', category: 'all', state: '', search: '' }); setMode('leads'); useAppStore.getState().setCurrentLeadId(String(id)); }} />

        {/* ── Pipeline Stage Velocity ── */}
        <PipelineVelocityCard />

        {/* ── Predicted Close Calendar ── */}
        <PredictedCloseCalendar onLeadClick={(id) => { setFilter({ status: 'all', category: 'all', state: '', search: '' }); setMode('leads'); useAppStore.getState().setCurrentLeadId(String(id)); }} />

        {/* ── Deal Coach ── */}
        <DealCoachCard onLeadClick={(id) => { setFilter({ status: 'all', category: 'all', state: '', search: '' }); setMode('leads'); useAppStore.getState().setCurrentLeadId(String(id)); }} />

        {/* ── Quick Win Predictor ── */}
        <QuickWinPredictor onLeadClick={(id) => { setFilter({ status: 'all', category: 'all', state: '', search: '' }); setMode('leads'); useAppStore.getState().setCurrentLeadId(String(id)); }} />

        {/* ── Install Capacity Intelligence ── */}
        <InstallCapacityCard
          proposalCount={byStatus.proposal ?? 0}
          closeRate={closeRate}
        />

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
