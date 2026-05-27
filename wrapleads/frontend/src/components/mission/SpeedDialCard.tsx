import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const STATUS_COLORS: Record<string, string> = {
  new: '#6366f1', contacted: '#3b82f6', replied: '#0ea5e9',
  meeting: '#f59e0b', proposal: '#f97316', won: '#22c55e',
};

const CATEGORY_LABELS: Record<string, string> = {
  fleet: 'Fleet', gc_referral: 'GC', construction: 'Construction',
  racing: 'Racing', dinoc: 'DI-NOC', reatec: 'Rea-Tec',
  colorchange: 'Color Change', design: 'Design', wallgraphics: 'Wall',
};

export default function SpeedDialCard() {
  const showToast = useAppStore((s) => s.showToast);
  const setPendingOpenLeadServerId = useAppStore((s) => s.setPendingOpenLeadServerId);
  const setMode = useAppStore((s) => s.setMode);
  const setQuickOpenTab = useAppStore((s) => s.setQuickOpenTab);

  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [currentIdx, setCurrentIdx] = useState(0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['speed-dial'],
    queryFn: () => api.getSpeedDial(),
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const allLeads = (data?.leads ?? []).filter((l) => !dismissed.has(l.leadId));
  const current = allLeads[currentIdx] ?? null;
  const remaining = allLeads.length - currentIdx;

  function skipLead() {
    if (currentIdx < allLeads.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      refetch();
      setCurrentIdx(0);
    }
  }

  function openLead(tab?: 'info' | 'email' | 'quotes' | 'activity' | 'notes' | 'design') {
    if (!current) return;
    setPendingOpenLeadServerId(current.leadId);
    if (tab) setQuickOpenTab(tab);
    setMode('leads');
  }

  function callDial() {
    if (!current?.phone) {
      showToast('No phone number on record', 'error');
      return;
    }
    window.open(`tel:${current.phone.replace(/\D/g, '')}`, '_self');
  }

  function emailDial() {
    openLead('email');
  }

  function markDone() {
    if (!current) return;
    setDismissed((s) => new Set([...s, current.leadId]));
    setCurrentIdx((i) => Math.max(0, Math.min(i, allLeads.length - 2)));
  }

  if (isLoading) {
    return (
      <div className="mission-card">
        <div className="skeleton" style={{ height: 120, borderRadius: 8 }} />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mission-card" style={{ borderLeftColor: '#4d8af5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4d8af5' }}>Speed Dial</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
          No active leads to contact right now. Win some deals and come back!
        </div>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[current.status] ?? 'var(--accent)';

  return (
    <div className="mission-card" style={{ borderLeftColor: '#4d8af5' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4d8af5' }}>
            Speed Dial
          </span>
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 99,
            background: 'rgba(77,138,245,0.15)', color: '#4d8af5', fontWeight: 700,
          }}>
            {remaining} left
          </span>
        </div>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4 }}>
          {allLeads.slice(0, 5).map((l, i) => (
            <button
              key={l.leadId}
              onClick={() => setCurrentIdx(i)}
              style={{
                width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: i === currentIdx ? '#4d8af5' : i < currentIdx ? '#00d97e' : 'var(--border)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Lead card */}
      <div style={{
        background: 'var(--surface-2)', borderRadius: 10,
        border: `1px solid ${statusColor}30`, overflow: 'hidden',
      }}>
        {/* Top strip */}
        <div style={{ height: 3, background: statusColor }} />

        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>
                {current.company}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {current.contactName && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{current.contactName}</span>
                )}
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4,
                  background: `${statusColor}20`, color: statusColor, fontWeight: 700,
                }}>
                  {current.status}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                  {CATEGORY_LABELS[current.category] ?? current.category}
                  {current.state ? ` · ${current.state}` : ''}
                </span>
              </div>
            </div>
            {/* Urgency score */}
            <div style={{
              flexShrink: 0, width: 40, height: 40, borderRadius: 8,
              background: `${current.urgencyScore > 30 ? '#ef4444' : current.urgencyScore > 15 ? '#f97316' : '#4d8af5'}15`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: current.urgencyScore > 30 ? '#ef4444' : current.urgencyScore > 15 ? '#f97316' : '#4d8af5', lineHeight: 1 }}>
                {current.urgencyScore}
              </div>
              <div style={{ fontSize: 7, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>score</div>
            </div>
          </div>

          {/* Signal badges */}
          {(current.daysOverdue > 0 || current.recentOpens > 0 || current.recentProposalViews > 0) && (
            <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
              {current.daysOverdue > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                  {Math.ceil(current.daysOverdue)}d overdue
                </span>
              )}
              {current.recentOpens > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(77,138,245,0.12)', color: '#4d8af5' }}>
                  {current.recentOpens} email open{current.recentOpens !== 1 ? 's' : ''} (48h)
                </span>
              )}
              {current.recentProposalViews > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(249,115,22,0.12)', color: '#f97316' }}>
                  proposal viewed {current.recentProposalViews}x
                </span>
              )}
            </div>
          )}

          {/* AI pitch angle */}
          {current.pitchAngle && (
            <div style={{
              fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4,
              padding: '6px 10px', borderRadius: 6,
              background: 'rgba(77,138,245,0.06)', border: '1px solid rgba(77,138,245,0.15)',
              marginBottom: 10, fontStyle: 'italic',
            }}>
              ⚡ {current.pitchAngle}
            </div>
          )}

          {/* Phone / email display */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {current.phone ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#00d97e' }}>{current.phone}</span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No phone on record</span>
            )}
            {current.email && (
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>· {current.email}</span>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={callDial}
              disabled={!current.phone}
              title={current.phone || 'No phone'}
              style={{
                flex: 1, background: current.phone ? '#00d97e' : 'var(--surface-2)',
                color: current.phone ? '#000' : 'var(--text-faint)',
                border: 'none', borderRadius: 7, padding: '7px 10px', fontSize: 11, fontWeight: 700,
                cursor: current.phone ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              📞 Call
            </button>
            <button
              onClick={emailDial}
              style={{
                flex: 1, background: 'rgba(77,138,245,0.12)', color: '#4d8af5',
                border: '1px solid rgba(77,138,245,0.25)', borderRadius: 7, padding: '7px 10px',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              ✉️ Email
            </button>
            <button
              onClick={() => openLead()}
              style={{
                background: 'var(--surface-2)', color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '7px 10px',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Open
            </button>
            <button
              onClick={markDone}
              title="Done — next lead"
              style={{
                background: 'rgba(0,217,126,0.1)', color: '#00d97e',
                border: '1px solid rgba(0,217,126,0.2)', borderRadius: 7, padding: '7px 10px',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Done ›
            </button>
            <button
              onClick={skipLead}
              title="Skip this lead"
              style={{
                background: 'none', color: 'var(--text-faint)',
                border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '7px 8px',
                fontSize: 11, cursor: 'pointer',
              }}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
