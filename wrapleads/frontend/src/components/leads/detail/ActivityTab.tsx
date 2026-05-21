import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Lead, LeadActivity, ActivityType } from '../../../api/types';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';

// ── Pipeline Journey Swimlane ─────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  new: '#6366f1', contacted: '#3b82f6', replied: '#0ea5e9',
  meeting: '#f59e0b', proposal: '#f97316', won: '#22c55e', lost: '#ef4444',
};

function PipelineJourney({ lead, activities }: { lead: Lead; activities: LeadActivity[] }) {
  // Extract stage transition events from status_changed activities (oldest first)
  const transitions = activities
    .filter((a) => a.type === 'status_changed' && (a.metadata as Record<string,unknown>)?.to)
    .map((a) => ({
      to: String((a.metadata as Record<string,unknown>).to ?? ''),
      at: new Date(a.created_at),
    }))
    .reverse(); // oldest first

  if (transitions.length === 0) return null;

  // Build stages with entry time and days spent
  const stages: { stage: string; days: number; enteredAt: Date }[] = [];
  for (let i = 0; i < transitions.length; i++) {
    const curr = transitions[i];
    const nextAt = transitions[i + 1]?.at ?? new Date();
    const days = Math.max(0, Math.round((nextAt.getTime() - curr.at.getTime()) / 86_400_000));
    stages.push({ stage: curr.to, days, enteredAt: curr.at });
  }

  // Current stage if not in transitions (lead might still be in initial 'new')
  const lastKnown = stages[stages.length - 1]?.stage;
  if (lead.status !== lastKnown && lead.status !== 'new') {
    // Already covered by last transition
  }

  const maxDays = Math.max(...stages.map((s) => s.days), 1);

  return (
    <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        Pipeline Journey
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', overflowX: 'auto' }}>
        {stages.map((s, i) => {
          const color = STAGE_COLORS[s.stage] ?? '#6b7280';
          const heightPct = maxDays > 0 ? Math.max(20, (s.days / maxDays) * 80) : 20;
          const isCurrent = i === stages.length - 1;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 52 }}>
              {/* Days label */}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {s.days === 0 ? '<1d' : `${s.days}d`}
              </div>
              {/* Bar */}
              <div style={{
                width: 44, height: heightPct, borderRadius: '4px 4px 0 0',
                background: color,
                opacity: isCurrent ? 1 : 0.6,
                border: isCurrent ? `2px solid ${color}` : 'none',
                boxSizing: 'border-box',
                position: 'relative',
              }}>
                {isCurrent && (
                  <div style={{ position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)', fontSize: 8, color, fontWeight: 800, whiteSpace: 'nowrap' }}>
                    NOW
                  </div>
                )}
              </div>
              {/* Stage label */}
              <div style={{ fontSize: 9, color: isCurrent ? color : 'var(--text-muted)', fontWeight: isCurrent ? 700 : 400, textAlign: 'center', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                {s.stage}
              </div>
            </div>
          );
        })}
      </div>
      {/* Total timeline */}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
        {stages.reduce((s, st) => s + st.days, 0)} days total in pipeline
      </div>
    </div>
  );
}

interface Props { lead: Lead; }

const TYPE_LABELS: Record<ActivityType | string, { icon: ReactNode; label: string; color: string }> = {
  email_sent:         { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, label: 'Email sent',         color: '#60a5fa' },
  email_copied:       { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>, label: 'Email copied',       color: '#94a3b8' },
  email_generated:    { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>, label: 'Email drafted',      color: '#c084fc' },
  draft_email:        { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>, label: 'Pre-drafted pitch',  color: '#c084fc' },
  status_changed:     { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>, label: 'Status changed',     color: '#fb923c' },
  note_added:         { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, label: 'Note added',         color: '#4ade80' },
  called:             { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/></svg>, label: 'Call logged',        color: '#34d399' },
  meeting_set:        { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, label: 'Meeting set',        color: '#facc15' },
  sequence_activated: { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label: 'Drip sequence live', color: '#ff6b35' },
  quote_created:  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>, label: 'Quote created',       color: '#60a5fa' },
  quote_sent:     { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,                                                   label: 'Quote sent to client', color: '#3b82f6' },
  quote_accepted: { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,                                                                                                   label: 'Quote accepted!',      color: '#10b981' },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffMin < 2) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ActivityTab({ lead }: Props) {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);

  const { data, isLoading } = useQuery({
    queryKey: ['activities', lead.serverId],
    queryFn: () => api.getActivities(lead.serverId!),
    enabled: !!lead.serverId,
    staleTime: 30_000,
  });

  const logMutation = useMutation({
    mutationFn: (type: 'called' | 'meeting_set' | 'note_added') =>
      api.logActivity(lead.serverId!, { type }),
    onSuccess: (_, type) => {
      const meta = TYPE_LABELS[type as keyof typeof TYPE_LABELS];
      if (meta) showToast(`${meta.label} logged`);
      qc.invalidateQueries({ queryKey: ['activities', lead.serverId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const activities = data?.activities ?? [];

  return (
    <div>
      {/* Quick-log buttons */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['called', 'meeting_set'] as const).map((type) => {
          const meta = TYPE_LABELS[type];
          return (
            <button
              key={type}
              className="btn"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => logMutation.mutate(type)}
              disabled={logMutation.isPending}
            >
              Log {meta.label.replace(' logged', '').replace(' set', '')}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div className="loading" style={{ padding: 20 }}>
          <span className="spinner" />
        </div>
      )}

      {/* Pipeline journey swimlane — only when there are stage transitions */}
      {!isLoading && activities.length > 0 && (
        <PipelineJourney lead={lead} activities={activities} />
      )}

      {!isLoading && activities.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-faint)', fontSize: 13 }}>
          No activity yet. Send an email or log a call to start the timeline.
        </div>
      )}

      <div className="activity-timeline">
        {activities.map((a: LeadActivity) => {
          const meta = TYPE_LABELS[a.type] ?? { icon: '•', label: a.type, color: 'var(--text-dim)' };
          const statusMeta = a.type === 'status_changed' && a.metadata;
          const isDraftEmail = a.type === 'draft_email';
          return (
            <div key={a.id} className="activity-item">
              <div className="activity-icon" style={{ color: meta.color, background: meta.color + '18' }}>
                {meta.icon}
              </div>
              <div className="activity-body">
                <div className="activity-header">
                  <span className="activity-label" style={{ color: meta.color }}>{meta.label}</span>
                  <span className="activity-time">{fmtDate(a.created_at)}</span>
                </div>
                {statusMeta && (
                  <div className="activity-detail">
                    {String((a.metadata as Record<string,unknown>)?.from ?? '').replace(/_/g, ' ')}
                    {' → '}
                    <strong>{String((a.metadata as Record<string,unknown>)?.to ?? '').replace(/_/g, ' ')}</strong>
                  </div>
                )}
                {a.subject && (
                  <div className="activity-detail" style={{ fontWeight: 600 }}>{a.subject}</div>
                )}
                {isDraftEmail && a.body ? (
                  <div className="activity-draft-email">
                    <pre className="activity-draft-email-body">{a.body}</pre>
                    <button
                      className="btn"
                      style={{ fontSize: 12, padding: '6px 12px', marginTop: 8 }}
                      onClick={() => {
                        navigator.clipboard.writeText(a.body || '');
                        showToast('Draft copied — paste into your email client');
                      }}
                    >
                      Copy draft to clipboard
                    </button>
                  </div>
                ) : a.body && (
                  <div className="activity-detail activity-body-preview">
                    {a.body.slice(0, 120)}{a.body.length > 120 ? '…' : ''}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
