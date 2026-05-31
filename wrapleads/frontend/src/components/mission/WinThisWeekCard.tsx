import { useMemo } from 'react';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import { winProbability } from '../../utils/scoring';
import type { Lead } from '../../api/types';

const REV_EST: Record<string, number> = {
  fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000,
  colorchange: 3500, racing: 40000, reatec: 5500, design: 3000,
  wallgraphics: 2500, other: 2500,
};

function fmtK(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toLocaleString()}`;
}

function closePredictionScore(lead: Lead): number {
  let score = 0;

  // Stage weight
  if (lead.status === 'proposal') score += 40;
  else if (lead.status === 'meeting') score += 25;
  else if (lead.status === 'replied') score += 10;
  else return 0; // only predict on high-intent stages

  // Win probability from the shared utility
  score += winProbability(lead) * 0.4;

  // Recent activity bonus — last_contacted within 7 days
  if (lead.lastContacted) {
    const daysSince = (Date.now() - new Date(lead.lastContacted).getTime()) / 86_400_000;
    if (daysSince <= 3) score += 15;
    else if (daysSince <= 7) score += 8;
  }

  // Has both phone and email = easier to close
  if (lead.phone) score += 5;
  if (lead.email) score += 5;

  // Followup due soon = urgency signal
  if (lead.followupDueAt) {
    const daysUntil = (new Date(lead.followupDueAt).getTime() - Date.now()) / 86_400_000;
    if (daysUntil >= 0 && daysUntil <= 7) score += 12;
    else if (daysUntil < 0) score += 6; // overdue but still in pipeline
  }

  // Fleet size bonus for fleet category (more units = bigger deal = higher incentive)
  if (lead.category === 'fleet' && lead.fleetSize) {
    const fs = parseInt(lead.fleetSize);
    if (fs >= 50) score += 10;
    else if (fs >= 20) score += 6;
  }

  return score;
}

export default function WinThisWeekCard() {
  const { leads } = useLeads();
  const { setCurrentLeadId, setQuickOpenTab } = useAppStore((s) => ({
    setCurrentLeadId: s.setCurrentLeadId,
    setQuickOpenTab: s.setQuickOpenTab,
  }));

  const predictions = useMemo(() => {
    return leads
      .filter((l) => ['proposal', 'meeting', 'replied'].includes(l.status))
      .map((l) => ({ lead: l, score: closePredictionScore(l) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [leads]);

  const totalExpected = predictions.reduce((sum, { lead }) => {
    const prob = winProbability(lead) / 100;
    return sum + prob * (REV_EST[lead.category] ?? 2500);
  }, 0);

  type QuickTab = 'info' | 'email' | 'quotes' | 'activity' | 'notes' | 'design';
  function openLead(id: string, tab: QuickTab) {
    setCurrentLeadId(id);
    setQuickOpenTab(tab);
  }

  if (!predictions.length) {
    return (
      <div className="hot-proposals-card" style={{ borderColor: 'var(--border)', opacity: 0.6 }}>
        <div className="hot-proposals-header" style={{ color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
            </svg>
            Win This Week
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '6px 0' }}>
          Move leads to Proposal or Meeting stage to see close predictions here.
        </div>
      </div>
    );
  }

  return (
    <div className="hot-proposals-card" style={{ borderColor: '#22c55e' }}>
      <div className="hot-proposals-header" style={{ color: '#22c55e' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="hot-proposals-pulse" style={{ background: '#22c55e', boxShadow: '0 0 0 0 rgba(34,197,94,.4)' }} />
          Win This Week
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
          background: 'rgba(34,197,94,.12)', color: '#22c55e',
        }}>
          ~{fmtK(Math.round(totalExpected))} expected
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
        Ranked by close probability · stage, engagement, and timing signals
      </div>

      {predictions.map(({ lead }, i) => {
        const prob = winProbability(lead);
        const rev = REV_EST[lead.category] ?? 2500;
        const barColor = prob >= 65 ? '#22c55e' : prob >= 45 ? '#f59e0b' : '#6366f1';
        const STATUS_LABEL: Record<string, string> = { proposal: 'Proposal', meeting: 'Meeting', replied: 'Replied' };
        const statusLabel = STATUS_LABEL[lead.status] ?? lead.status;

        return (
          <div
            key={lead.id}
            className="hot-proposal-row"
            style={{ cursor: 'pointer', borderLeft: `2px solid ${barColor}` }}
            onClick={() => openLead(lead.id, lead.status === 'proposal' ? 'quotes' : 'email' as QuickTab)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flex: 1, minWidth: 0 }}>
              <span style={{
                fontSize: 9, fontWeight: 800, color: 'var(--bg)', background: barColor,
                borderRadius: 99, padding: '1px 6px', flexShrink: 0,
              }}>
                #{i + 1}
              </span>
              <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lead.company}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                  <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${prob}%`, height: '100%', background: barColor, borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: barColor, minWidth: 28 }}>{prob}%</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{
                    fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em',
                    color: 'var(--text-faint)',
                  }}>
                    {statusLabel} · {lead.category}
                  </span>
                </div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{fmtK(rev)}</div>
                <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>est. value</div>
              </div>
            </div>
          </div>
        );
      })}

      {predictions.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-faint)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)', marginTop: 4 }}>
          Click any row to open the lead · Expected = win% × deal size
        </div>
      )}
    </div>
  );
}
