import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { AppNotification } from '../../api/types';

const ICONS: Record<string, ReactNode> = {
  aging_wrap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  call_completed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  referral_opportunity: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  call_initiated: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.44 2 2 0 0 1 3.59 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.97-1.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  email_reply: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  sequence_complete: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  sequence_activated: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  bid_due_soon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  new_lead: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  post_call_chain_fired: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
};

const BELL_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ReferralDraftButton({ leadId }: { leadId: number }) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const showToast = useAppStore((s) => s.showToast);

  async function draft() {
    setLoading(true);
    try {
      const res = await api.getReferralAsk(leadId);
      if (res.ok) {
        await navigator.clipboard.writeText(`Subject: ${res.subject}\n\n${res.body}`);
        setCopied(true);
        showToast('Referral email copied to clipboard', 'success');
        setTimeout(() => setCopied(false), 3000);
      }
    } catch {
      showToast('Failed to generate referral email', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); draft(); }}
      disabled={loading}
      style={{
        marginTop: 5, fontSize: 10, padding: '3px 8px', borderRadius: 4,
        background: 'rgba(0,217,126,0.12)', border: '1px solid rgba(0,217,126,0.25)',
        color: '#00d97e', cursor: 'pointer',
      }}
    >
      {loading ? '…' : copied ? '✓ Copied' : '✉ Draft Referral Ask'}
    </button>
  );
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
            <span className="notif-empty-icon">{BELL_ICON}</span>
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
              <span className="notif-icon">{ICONS[n.type] ?? BELL_ICON}</span>
              <div className="notif-content">
                <span className="notif-row-title">{n.title}</span>
                {n.body && <span className="notif-row-body">{n.body}</span>}
                {n.type === 'referral_opportunity' && typeof (n.metadata as Record<string, unknown>)?.lead_id === 'number' && (
                  <ReferralDraftButton leadId={(n.metadata as Record<string, number>).lead_id} />
                )}
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
