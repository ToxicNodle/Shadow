import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';

interface Props { lead: Lead; }

const CHANNEL_ICON = { email: '📧', sms: '📱' };
const CHANNEL_LABEL = { email: 'Email', sms: 'SMS' };

const STATUS_STYLE: Record<string, { color: string; icon: string }> = {
  pending: { color: 'var(--text-faint)', icon: '⏰' },
  sent:    { color: '#00d97e', icon: '✓' },
  failed:  { color: '#ef4444', icon: '✗' },
  skipped: { color: 'var(--text-faint)', icon: '—' },
};

function relDay(dayOffset: number) {
  if (dayOffset === 0) return 'Day 0 — sends in 5 min';
  return `Day ${dayOffset}`;
}

function relTime(iso: string | null) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function OmniCampaignPanel({ lead }: Props) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [launching, setLaunching] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const sid = lead.serverId;

  const { data: tplData } = useQuery({
    queryKey: ['omni-templates', sid],
    queryFn: () => api.getOmniTemplates(sid!),
    staleTime: 5 * 60_000,
    enabled: !!sid,
  });

  const { data: seqData, isLoading: seqLoading } = useQuery({
    queryKey: ['omni-sequence', sid],
    queryFn: () => api.getOmniSequence(sid!),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!sid,
  });

  const seq = seqData?.sequence;
  const templates = tplData?.steps ?? [];
  const hasEmail = tplData?.hasEmail ?? false;
  const hasPhone = tplData?.hasPhone ?? false;
  const canLaunch = hasEmail || hasPhone;

  async function launch() {
    if (!sid) return;
    setLaunching(true);
    try {
      await api.startOmniSequence(sid);
      qc.invalidateQueries({ queryKey: ['omni-sequence', sid] });
    } finally {
      setLaunching(false);
    }
  }

  async function cancel() {
    if (!seq || !sid) return;
    setCancelling(true);
    try {
      await api.cancelOmniSequence(sid);
      qc.invalidateQueries({ queryKey: ['omni-sequence', sid] });
    } finally {
      setCancelling(false);
    }
  }

  const isActive = seq?.status === 'active';
  const isComplete = seq?.status === 'completed';

  return (
    <div style={{
      border: '1px solid rgba(77,138,245,0.22)',
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 14,
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(77,138,245,0.07)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(77,138,245,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔀</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
            4-Step Omni Campaign
          </span>
          <span style={{
            fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
            background: 'rgba(77,138,245,0.12)', color: '#4d8af5',
            padding: '2px 6px', borderRadius: 3,
          }}>
            Email + SMS
          </span>
          {isActive && (
            <span style={{
              fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
              background: 'rgba(0,217,126,0.12)', color: '#00d97e',
              padding: '2px 6px', borderRadius: 3, letterSpacing: '0.08em',
            }}>Active</span>
          )}
          {isComplete && (
            <span style={{
              fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
              background: 'rgba(255,255,255,0.06)', color: 'var(--text-faint)',
              padding: '2px 6px', borderRadius: 3, letterSpacing: '0.08em',
            }}>Complete</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!isActive && canLaunch && (
            <button
              onClick={launch}
              disabled={launching}
              style={{
                fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 5,
                border: 'none', cursor: launching ? 'not-allowed' : 'pointer',
                background: '#4d8af5', color: '#fff', opacity: launching ? 0.6 : 1,
              }}
            >
              {launching ? 'Launching…' : isComplete ? '↺ Restart' : '▶ Launch'}
            </button>
          )}
          {isActive && (
            <button
              onClick={cancel}
              disabled={cancelling}
              style={{
                fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 5,
                border: '1px solid rgba(239,68,68,0.3)', background: 'transparent',
                color: '#ef4444', cursor: cancelling ? 'not-allowed' : 'pointer',
              }}
            >
              {cancelling ? '…' : 'Cancel'}
            </button>
          )}
        </div>
      </div>

      {/* Channel availability note */}
      {(!hasEmail || !hasPhone) && !seqLoading && (
        <div style={{
          padding: '6px 14px',
          fontSize: 11, color: 'var(--text-faint)',
          background: 'rgba(255,255,255,0.02)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          {!hasEmail && !hasPhone
            ? '⚠ Add email or phone to launch campaign'
            : !hasEmail
              ? '📧 No email — email steps will be skipped'
              : '📱 No phone — SMS steps will be skipped'}
        </div>
      )}

      {/* Active sequence steps */}
      {seq && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {seq.steps.map((step) => {
            const st = STATUS_STYLE[step.status] || STATUS_STYLE.pending;
            const isExp = expanded === step.id;
            return (
              <div key={step.id}>
                <div
                  onClick={() => setExpanded(isExp ? null : step.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    cursor: 'pointer', padding: '5px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}
                >
                  <span style={{ fontSize: 13, flexShrink: 0 }}>
                    {CHANNEL_ICON[step.channel]}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0, minWidth: 52 }}>
                    {relDay(step.dayOffset)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {CHANNEL_LABEL[step.channel]}{step.subject ? ` — ${step.subject}` : ''}
                  </span>
                  <span style={{ fontSize: 11, color: st.color, flexShrink: 0 }}>
                    {st.icon} {step.status}
                    {step.sentAt ? ` · ${relTime(step.sentAt)}` : ''}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{
                    margin: '4px 0 8px 21px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 6, padding: '8px 10px',
                    fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6,
                    whiteSpace: 'pre-wrap', borderLeft: '2px solid rgba(77,138,245,0.2)',
                  }}>
                    {step.subject && (
                      <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                        Subject: {step.subject}
                      </div>
                    )}
                    {step.message}
                    {step.error && (
                      <div style={{ marginTop: 6, color: '#ef4444', fontSize: 10 }}>
                        Error: {step.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Preview templates when no active sequence */}
      {!seq && templates.length > 0 && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Preview — {tplData?.category || 'fleet'} sequence
          </div>
          {templates.map((t, i) => {
            const isExp = expanded === i;
            return (
              <div key={i}>
                <div
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    cursor: 'pointer', padding: '5px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}
                >
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{CHANNEL_ICON[t.channel]}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 52 }}>
                    {relDay(t.dayOffset)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {CHANNEL_LABEL[t.channel]}{t.subject ? ` — ${t.subject}` : ''}
                  </span>
                  <span style={{ fontSize: 10, color: '#4d8af5' }}>{t.message.length}c</span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{
                    margin: '4px 0 8px 21px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 6, padding: '8px 10px',
                    fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6,
                    whiteSpace: 'pre-wrap', borderLeft: '2px solid rgba(77,138,245,0.2)',
                  }}>
                    {t.subject && (
                      <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                        Subject: {t.subject}
                      </div>
                    )}
                    {t.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {seqLoading && (
        <div style={{ padding: 14, fontSize: 11, color: 'var(--text-faint)' }}>Loading…</div>
      )}
    </div>
  );
}
