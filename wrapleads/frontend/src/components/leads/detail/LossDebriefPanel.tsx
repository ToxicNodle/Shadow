import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';

const RECOVER_COLORS = {
  high: '#00d97e',
  medium: '#f59e0b',
  low: '#ef4444',
};

const RECOVER_LABELS = {
  high: 'Recoverable',
  medium: 'Possible',
  low: 'Unlikely',
};

function Section({ icon, label, text }: { icon: string; label: string; text: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 4 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

export default function LossDebriefPanel({ lead }: { lead: Lead }) {
  const [expanded, setExpanded] = useState(false);

  const { mutate, data, isPending } = useMutation({
    mutationFn: () => api.generateLossDebrief(lead.serverId!),
  });

  if (!lead.serverId || lead.status !== 'lost') return null;

  function handleToggle() {
    if (!expanded) {
      setExpanded(true);
      if (!data) mutate();
    } else {
      setExpanded(false);
    }
  }

  const debrief = data?.debrief;
  const recoverColor = debrief ? RECOVER_COLORS[debrief.recoverability] : '#94a3b8';

  return (
    <div style={{
      border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10,
      overflow: 'hidden', marginBottom: 12,
    }}>
      <button
        onClick={handleToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'rgba(239,68,68,0.05)', border: 'none', cursor: 'pointer',
          color: 'var(--text)', fontSize: 13, fontWeight: 600,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>💀</span>
          <span>Deal Post-Mortem</span>
          {debrief && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
              color: recoverColor, background: `${recoverColor}18`,
              padding: '2px 7px', borderRadius: 4,
            }}>
              {RECOVER_LABELS[debrief.recoverability]}
            </span>
          )}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '14px', background: 'var(--bg)', borderTop: '1px solid rgba(239,68,68,0.15)' }}>
          {isPending && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '4px 0' }}>
              Analyzing deal history…
            </div>
          )}

          {debrief && (
            <>
              <Section icon="🔍" label="What Went Wrong" text={debrief.whatWentWrong} />
              <Section icon="⚡" label="Missed Moment" text={debrief.missedOpportunity} />

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12,
              }}>
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: `${recoverColor}08`, border: `1px solid ${recoverColor}28`,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: recoverColor, marginBottom: 4 }}>
                    Recoverability
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: recoverColor }}>
                    {RECOVER_LABELS[debrief.recoverability]}
                  </div>
                </div>
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 4 }}>
                    Recovery Plan
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                    {debrief.recoverInstructions}
                  </div>
                </div>
              </div>

              <Section icon="▶" label="Next Time" text={debrief.whatToDoNext} />

              <div style={{
                padding: '10px 12px', borderRadius: 8, marginTop: 4,
                background: 'rgba(244,85,28,0.05)', border: '1px solid rgba(244,85,28,0.2)',
                fontSize: 12, color: 'var(--text)', lineHeight: 1.5,
                fontStyle: 'italic',
              }}>
                <span style={{ fontStyle: 'normal', fontSize: 10, fontWeight: 700, color: '#f4551c', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Lesson:{' '}
                </span>
                {debrief.lessonLearned}
              </div>

              {!data.fallback && (
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => mutate()}
                    style={{
                      padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                      background: 'var(--surface)', color: 'var(--text-muted)',
                      fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    Re-analyze
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
