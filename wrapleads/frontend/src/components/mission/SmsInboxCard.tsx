import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

function relFmt(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function SmsInboxCard() {
  const { showToast, setCurrentLeadId } = useAppStore((s) => ({
    showToast: s.showToast,
    setCurrentLeadId: s.setCurrentLeadId,
  }));
  const qc = useQueryClient();
  const [replyOpen, setReplyOpen] = useState<number | null>(null); // lead_id
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['sms-inbox'],
    queryFn: api.getSmsInbox,
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });

  const messages = data?.messages ?? [];
  if (isLoading || messages.length === 0) return null;

  async function sendReply(leadId: number) {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await api.sendSms(leadId, replyText.trim());
      setReplyText('');
      setReplyOpen(null);
      qc.invalidateQueries({ queryKey: ['sms-inbox'] });
      showToast('Reply sent');
    } catch (e: any) {
      showToast(e.message || 'Failed to send SMS', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{
      background: 'var(--bg-elev)',
      border: '1px solid rgba(0,217,126,0.2)',
      borderRadius: 14,
      padding: '16px 18px',
      marginBottom: 14,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>💬</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>SMS Replies</span>
          <span style={{
            fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
            background: 'rgba(0,217,126,0.12)', color: '#00d97e',
            padding: '2px 7px', borderRadius: 4,
          }}>
            {messages.length} new
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          Inbound texts
        </span>
      </div>

      {/* Messages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.slice(0, 5).map((msg) => (
          <div key={msg.id} style={{
            background: 'var(--surface)', borderRadius: 8, overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 11px',
            }}>
              {/* Avatar */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(0,217,126,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: '#00d97e',
              }}>
                {(msg.company || '?')[0].toUpperCase()}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    {msg.company}
                  </span>
                  {msg.contact_name && (
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      · {msg.contact_name}
                    </span>
                  )}
                  <span style={{
                    fontSize: 10, color: 'var(--text-faint)', marginLeft: 'auto', flexShrink: 0,
                  }}>
                    {relFmt(msg.created_at)}
                  </span>
                </div>
                <div style={{
                  fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {msg.body}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{
              display: 'flex', gap: 6, padding: '0 11px 9px',
            }}>
              <button
                onClick={() => {
                  if (replyOpen === msg.lead_id) {
                    setReplyOpen(null);
                  } else {
                    setReplyOpen(msg.lead_id);
                    setReplyText('');
                  }
                }}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 5,
                  border: '1px solid rgba(0,217,126,0.25)',
                  background: replyOpen === msg.lead_id ? 'rgba(0,217,126,0.15)' : 'rgba(0,217,126,0.06)',
                  color: '#00d97e', cursor: 'pointer',
                }}
              >
                {replyOpen === msg.lead_id ? '✕ Cancel' : '↩ Reply'}
              </button>
              <button
                onClick={() => setCurrentLeadId(String(msg.lead_id))}
                style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 5,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                }}
              >
                View Lead →
              </button>
            </div>

            {/* Inline reply composer */}
            {replyOpen === msg.lead_id && (
              <div style={{
                padding: '0 11px 10px', borderTop: '1px solid var(--border)',
                paddingTop: 9, display: 'flex', gap: 8,
              }}>
                <input
                  autoFocus
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(msg.lead_id); } }}
                  placeholder="Type your reply… (Enter to send)"
                  style={{
                    flex: 1, background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '5px 9px', color: 'var(--text)',
                    fontSize: 12, outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={() => sendReply(msg.lead_id)}
                  disabled={!replyText.trim() || sending}
                  style={{
                    flexShrink: 0, fontSize: 11, fontWeight: 700,
                    padding: '5px 12px', borderRadius: 6, border: 'none',
                    background: replyText.trim() ? '#00d97e' : 'rgba(255,255,255,0.08)',
                    color: replyText.trim() ? '#000' : 'var(--text-faint)',
                    cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                    opacity: sending ? 0.6 : 1,
                  }}
                >
                  {sending ? '…' : 'Send'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
