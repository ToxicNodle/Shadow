import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { AppNotification } from '../../api/types';

const ICONS: Record<string, string> = {
  aging_wrap: '⏰',
  call_completed: '📞',
  call_initiated: '📲',
  email_reply: '✉️',
  sequence_complete: '🚀',
  sequence_activated: '🚀',
  bid_due_soon: '📋',
  new_lead: '⭐',
  post_call_chain_fired: '💬',
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { setMode, setPendingOpenLeadServerId } = useAppStore((s) => ({
    setMode: s.setMode,
    setPendingOpenLeadServerId: s.setPendingOpenLeadServerId,
  }));

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.getNotifications(),
    staleTime: 30_000,
  });

  const readAllMut = useMutation({
    mutationFn: () => api.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const readMut = useMutation({
    mutationFn: (id: number) => api.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications: AppNotification[] = data?.notifications ?? [];

  function handleNotificationClick(n: AppNotification) {
    if (!n.read_at) readMut.mutate(n.id);
    const meta = n.metadata as Record<string, unknown>;
    const leadId = typeof meta?.lead_id === 'number' ? meta.lead_id : null;
    if (n.type === 'aging_wrap') { setMode('jobs'); onClose(); return; }
    if (n.type === 'bid_due_soon') { setMode('bids'); onClose(); return; }
    if (leadId) {
      setPendingOpenLeadServerId(leadId);
      setMode('leads');
      onClose();
    }
  }

  return (
    <>
      <div className="notif-backdrop" onClick={onClose} />
      <div className="notif-panel">
        <div className="notif-header">
          <span className="notif-title">Notifications</span>
          {(data?.unread ?? 0) > 0 && (
            <button className="notif-read-all" onClick={() => readAllMut.mutate()}>
              Mark all read
            </button>
          )}
        </div>

        {isLoading && <div style={{ padding: '20px', textAlign: 'center' }}><span className="spinner" /></div>}

        {!isLoading && notifications.length === 0 && (
          <div className="notif-empty">
            <span style={{ fontSize: 28 }}>🔔</span>
            <p>All caught up!</p>
          </div>
        )}

        <div className="notif-list">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`notif-row ${!n.read_at ? 'unread' : ''}`}
              onClick={() => handleNotificationClick(n)}
            >
              <span className="notif-icon">{ICONS[n.type] ?? '🔔'}</span>
              <div className="notif-content">
                <span className="notif-row-title">{n.title}</span>
                {n.body && <span className="notif-row-body">{n.body}</span>}
                <span className="notif-row-time">{timeAgo(n.created_at)}</span>
              </div>
              <button
                className="notif-delete"
                onClick={(e) => { e.stopPropagation(); deleteMut.mutate(n.id); }}
              >✕</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
