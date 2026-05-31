import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';
import { useAppStore } from '../../../store/useAppStore';

interface Props { lead: Lead }

function relFmt(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)       return 'just now';
  if (diff < 3600)     return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)    return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function absFmt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / 86400000;
  if (diff < 0)  return 'Overdue';
  if (diff < 1)  return 'Today';
  if (diff < 2)  return 'Tomorrow';
  return `in ${Math.round(diff)} days (${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#8892a4',
  sent:    '#00d97e',
  failed:  '#ef4444',
  skipped: '#6b7280',
};

const STATUS_ICON: Record<string, string> = {
  pending: '⏰',
  sent:    '✓',
  failed:  '✗',
  skipped: '—',
};

export default function SmsTab({ lead }: Props) {
  const qc = useQueryClient();
  const { showToast, setSettingsOpen } = useAppStore();
  const leadId = lead.serverId!;
  const [singleMsg, setSingleMsg] = useState('');
  const [sendingOne, setSendingOne] = useState(false);

  const { data: seqData, isLoading: seqLoading } = useQuery({
    queryKey: ['sms-sequence', leadId],
    queryFn: () => api.getSmsSequence(leadId),
    enabled: !!leadId,
    staleTime: 30_000,
  });

  const { data: tplData } = useQuery({
    queryKey: ['sms-templates', leadId],
    queryFn: () => api.getSmsTemplates(leadId),
    enabled: !!leadId && !seqData?.sequence,
    staleTime: Infinity,
  });

  const startMut = useMutation({
    mutationFn: () => api.startSmsSequence(leadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sms-sequence', leadId] });
      showToast('SMS campaign launched — first text sends in 5 minutes');
    },
    onError: (e: Error) => showToast(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: () => api.cancelSmsSequence(leadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sms-sequence', leadId] });
      showToast('SMS campaign cancelled');
    },
    onError: (e: Error) => showToast(e.message),
  });

  async function sendOne() {
    if (!singleMsg.trim()) return;
    setSendingOne(true);
    try {
      await api.sendSms(leadId, singleMsg.trim());
      setSingleMsg('');
      qc.invalidateQueries({ queryKey: ['lead-activity', leadId] });
      showToast('SMS sent');
    } catch (e: any) {
      showToast(e.message || 'Failed to send SMS');
    } finally {
      setSendingOne(false);
    }
  }

  const seq = seqData?.sequence;
  const hasPhone = !!lead.phone;

  return (
    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* No phone warning */}
      {!hasPhone && (
        <div style={{
          padding: '12px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          fontSize: 12, color: '#ef4444',
        }}>
          ⚠ No phone number on this lead. Add one in the info section to enable SMS.
        </div>
      )}

      {/* Active / completed sequence */}
      {!seqLoading && seq && (
        <div style={{
          background: 'var(--surface)', borderRadius: 10,
          border: seq.status === 'active'
            ? '1px solid rgba(77,138,245,0.3)'
            : '1px solid var(--border)',
        }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                SMS Campaign
              </span>
              <span style={{
                fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                padding: '2px 7px', borderRadius: 4,
                background: seq.status === 'active'
                  ? 'rgba(77,138,245,0.15)' : seq.status === 'completed'
                  ? 'rgba(0,217,126,0.12)' : 'rgba(255,255,255,0.05)',
                color: seq.status === 'active'
                  ? '#4d8af5' : seq.status === 'completed'
                  ? '#00d97e' : 'var(--text-faint)',
              }}>
                {seq.status}
              </span>
            </div>
            {seq.status === 'active' && (
              <button
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
                style={{
                  fontSize: 11, padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
                  border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.08)', color: '#ef4444',
                }}
              >
                Cancel
              </button>
            )}
          </div>

          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {seq.steps.map((step) => (
              <div key={step.id} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '8px 10px', borderRadius: 7,
                background: step.status === 'sent'
                  ? 'rgba(0,217,126,0.05)'
                  : step.status === 'failed'
                  ? 'rgba(239,68,68,0.05)'
                  : 'transparent',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: step.status === 'sent'
                    ? 'rgba(0,217,126,0.15)'
                    : step.status === 'failed'
                    ? 'rgba(239,68,68,0.15)'
                    : 'rgba(255,255,255,0.05)',
                  fontSize: 11, color: STATUS_COLOR[step.status] || 'var(--text-faint)',
                }}>
                  {STATUS_ICON[step.status] || step.step_num}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: STATUS_COLOR[step.status] || 'var(--text-faint)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      Step {step.step_num}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                      {step.status === 'sent' && step.sent_at
                        ? `Sent ${relFmt(step.sent_at)}`
                        : step.status === 'pending'
                        ? absFmt(step.scheduled_for)
                        : step.status === 'failed'
                        ? (step.error || 'Failed')
                        : 'Skipped'}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45,
                    maxHeight: 60, overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical' as const,
                  }}>
                    {step.message}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {seq.status !== 'active' && (
            <div style={{ padding: '0 14px 12px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => startMut.mutate()}
                disabled={startMut.isPending || !hasPhone}
                style={{
                  fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6,
                  border: '1px solid rgba(77,138,245,0.35)',
                  background: 'rgba(77,138,245,0.1)', color: '#4d8af5', cursor: 'pointer',
                }}
              >
                Launch New Campaign
              </button>
            </div>
          )}
        </div>
      )}

      {/* Campaign preview — shown when no active sequence */}
      {!seqLoading && !seq && tplData?.templates && (
        <div style={{
          background: 'var(--surface)', borderRadius: 10,
          border: '1px solid rgba(77,138,245,0.2)',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                📱 3-Touch SMS Campaign
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
                Category-aware templates · auto-scheduled · stops on reply
              </div>
            </div>
            <button
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending || !hasPhone}
              style={{
                fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 7,
                border: 'none', cursor: hasPhone ? 'pointer' : 'not-allowed',
                background: hasPhone ? '#4d8af5' : 'rgba(255,255,255,0.1)',
                color: hasPhone ? '#fff' : 'var(--text-faint)',
                opacity: startMut.isPending ? 0.6 : 1,
              }}
            >
              {startMut.isPending ? 'Launching…' : 'Launch Campaign'}
            </button>
          </div>

          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tplData.templates.map((t) => (
              <div key={t.stepNum} style={{
                padding: '8px 10px', borderRadius: 7,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4,
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: '#4d8af5',
                    background: 'rgba(77,138,245,0.1)', padding: '1px 6px', borderRadius: 3,
                  }}>
                    Step {t.stepNum}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    {t.dayOffset === 0 ? 'Sends in 5 min' : `Day ${t.dayOffset}`}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 'auto' }}>
                    {t.message.length} chars
                  </span>
                </div>
                <div style={{
                  fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5,
                }}>
                  {t.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Twilio not set up nudge */}
      {!seqLoading && !seq && !tplData && hasPhone && (
        <div style={{
          padding: '14px', borderRadius: 8,
          background: 'rgba(77,138,245,0.06)', border: '1px solid rgba(77,138,245,0.15)',
          fontSize: 12, color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <span>Connect Twilio to unlock SMS campaigns and single-tap texts.</span>
          <button
            onClick={() => setSettingsOpen(true)}
            style={{
              flexShrink: 0, fontSize: 11, fontWeight: 700,
              padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
              border: '1px solid rgba(77,138,245,0.3)',
              background: 'rgba(77,138,245,0.1)', color: '#4d8af5',
            }}
          >
            Settings →
          </button>
        </div>
      )}

      {/* Single SMS compose */}
      <div style={{
        background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)',
        padding: '12px 14px',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-faint)',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
        }}>
          Quick Text
        </div>
        <textarea
          value={singleMsg}
          onChange={(e) => setSingleMsg(e.target.value)}
          placeholder={`Send a one-off text to ${lead.contactName || lead.company}…`}
          rows={3}
          disabled={!hasPhone}
          style={{
            width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '8px 10px', color: 'var(--text)',
            fontSize: 12, lineHeight: 1.5, resize: 'vertical',
            fontFamily: 'inherit', outline: 'none',
            opacity: hasPhone ? 1 : 0.4,
          }}
        />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8,
        }}>
          <span style={{
            fontSize: 10, color: singleMsg.length > 160 ? '#f4551c' : 'var(--text-faint)',
          }}>
            {singleMsg.length} chars{singleMsg.length > 160 ? ' (2 segments)' : ''}
          </span>
          <button
            onClick={sendOne}
            disabled={!singleMsg.trim() || sendingOne || !hasPhone}
            style={{
              fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 6,
              border: 'none', cursor: singleMsg.trim() && hasPhone ? 'pointer' : 'not-allowed',
              background: singleMsg.trim() && hasPhone ? '#f4551c' : 'rgba(255,255,255,0.08)',
              color: singleMsg.trim() && hasPhone ? '#fff' : 'var(--text-faint)',
              opacity: sendingOne ? 0.6 : 1,
            }}
          >
            {sendingOne ? 'Sending…' : 'Send SMS'}
          </button>
        </div>
      </div>
    </div>
  );
}
