import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';

export default function WinDebriefPanel({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const mut = useMutation({
    mutationFn: () => api.generateWinDebrief(lead.serverId!),
    onSuccess: () => {
      setOpen(true);
      qc.invalidateQueries({ queryKey: ['win-pattern-library'] });
    },
  });

  if (lead.status !== 'won' || !lead.serverId) return null;

  const d = mut.data?.debrief;

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      {!d && (
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 7, padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(0,217,126,0.1)', border: '1px solid rgba(0,217,126,0.25)',
            color: '#00d97e', fontSize: 12, fontWeight: 700,
          }}
        >
          {mut.isPending ? (
            <><span className="spinner" style={{ width: 12, height: 12 }} /> Analyzing win…</>
          ) : (
            '🏆 Generate Win Debrief'
          )}
        </button>
      )}

      {d && (
        <div style={{
          background: 'rgba(0,217,126,0.06)', border: '1px solid rgba(0,217,126,0.2)',
          borderRadius: 10, overflow: 'hidden',
        }}>
          <button
            onClick={() => setOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#00d97e' }}>🏆 Win Debrief</span>
              {mut.data?.cached && (
                <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>cached</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {d.days_to_close != null && (
                <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{d.days_to_close}d to close</span>
              )}
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{open ? '▲' : '▼'}</span>
            </div>
          </button>

          {open && (
            <div style={{ padding: '0 14px 14px' }}>
              {/* Summary */}
              {d.summary && (
                <div style={{
                  fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6,
                  padding: '8px 10px', borderRadius: 6,
                  background: 'rgba(0,217,126,0.08)', border: '1px solid rgba(0,217,126,0.15)',
                  marginBottom: 12,
                }}>
                  {d.summary}
                </div>
              )}

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                {d.days_to_close != null && (
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Days to close</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>{d.days_to_close}</div>
                  </div>
                )}
                {d.touch_count != null && (
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Touchpoints</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>{d.touch_count}</div>
                  </div>
                )}
                {d.deal_value_est != null && (
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Est. value</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#00d97e', lineHeight: 1 }}>
                      ${d.deal_value_est >= 1000 ? `${(d.deal_value_est / 1000).toFixed(1)}K` : Math.round(d.deal_value_est).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              {/* Key signal + winning tactic */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {d.key_signal && (
                  <div style={{ padding: '7px 10px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Key signal</div>
                    <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.4 }}>{d.key_signal}</div>
                  </div>
                )}
                {d.winning_tactic && (
                  <div style={{ padding: '7px 10px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Winning tactic</div>
                    <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.4 }}>{d.winning_tactic}</div>
                  </div>
                )}
              </div>

              {/* Pattern tags */}
              {d.pattern_tags?.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {d.pattern_tags.map((tag) => (
                    <span key={tag} style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                      background: 'rgba(0,217,126,0.12)', color: '#00d97e',
                      textTransform: 'lowercase',
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
