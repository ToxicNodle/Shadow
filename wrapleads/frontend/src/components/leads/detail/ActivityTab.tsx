import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Lead, LeadActivity, ActivityType } from '../../../api/types';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';

interface Props { lead: Lead; }

const TYPE_LABELS: Record<ActivityType | string, { icon: string; label: string; color: string }> = {
  email_sent:       { icon: '✉', label: 'Email sent',        color: '#60a5fa' },
  email_copied:     { icon: '📋', label: 'Email copied',     color: '#94a3b8' },
  email_generated:  { icon: '⚡', label: 'Email drafted',    color: '#c084fc' },
  status_changed:   { icon: '◈',  label: 'Status changed',   color: '#fb923c' },
  note_added:       { icon: '📝', label: 'Note added',       color: '#4ade80' },
  called:           { icon: '📞', label: 'Call logged',      color: '#34d399' },
  meeting_set:      { icon: '📅', label: 'Meeting set',      color: '#facc15' },
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
    onSuccess: () => {
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
              onClick={() => {
                logMutation.mutate(type);
                showToast(`${meta.label} logged`);
              }}
              disabled={logMutation.isPending}
            >
              {meta.icon} Log {meta.label.replace(' logged', '').replace(' set', '')}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div className="loading" style={{ padding: 20 }}>
          <span className="spinner" />
        </div>
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
                {a.body && (
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
