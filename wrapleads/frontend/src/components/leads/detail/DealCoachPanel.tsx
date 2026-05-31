import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';

const URGENCY_COLOR: Record<string, string> = {
  low: '#00d97e', medium: '#f59e0b', high: '#f97316', critical: '#ef4444',
};

const URGENCY_LABEL: Record<string, string> = {
  low: 'Low urgency', medium: 'Follow up soon', high: 'Act this week', critical: 'Close now',
};

const ELIGIBLE_STATUSES = ['contacted', 'replied', 'meeting', 'proposal'];

export default function DealCoachPanel({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [triggered, setTriggered] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['deal-coach', lead.serverId],
    queryFn: () => api.getDealCoach(lead.serverId!),
    enabled: !!lead.serverId && triggered,
    staleTime: 30 * 60_000,
    retry: false,
  });

  if (!ELIGIBLE_STATUSES.includes(lead.status)) return null;

  function launch() {
    setTriggered(true);
    setOpen(true);
  }

  const urgency = data?.urgencyLevel ?? 'medium';
  const urgencyColor = URGENCY_COLOR[urgency];

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      {/* Trigger button */}
      {!triggered && (
        <button
          onClick={launch}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 7, padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(77,138,245,0.1)', border: '1px solid rgba(77,138,245,0.25)',
            color: '#4d8af5', fontSize: 12, fontWeight: 700,
          }}
        >
          🎯 Coach Me — Get 3 Closing Tactics
        </button>
      )}

      {triggered && (
        <div style={{
          background: 'rgba(77,138,245,0.06)', border: '1px solid rgba(77,138,245,0.2)',
          borderRadius: 10, overflow: 'hidden',
        }}>
          {/* Header */}
          <button
            onClick={() => setOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🎯 Deal Coach</span>
              {data && (
                <span style={{
                  fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                  padding: '2px 7px', borderRadius: 10,
                  background: `${urgencyColor}20`, color: urgencyColor,
                }}>
                  {URGENCY_LABEL[urgency]}
                </span>
              )}
              {isLoading && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Analyzing deal…</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {data && !data.fallback && (
                <span style={{ fontSize: 20, fontWeight: 900, color: urgencyColor, lineHeight: 1 }}>
                  {data.closingProbability}%
                </span>
              )}
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{open ? '▲' : '▼'}</span>
            </div>
          </button>

          {open && (
            <div style={{ padding: '0 14px 14px' }}>
              {isLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} className="skeleton" style={{ height: 60, borderRadius: 6 }} />
                  ))}
                </div>
              )}

              {data && (
                <>
                  {/* Key insight */}
                  {data.keyInsight && (
                    <div style={{
                      fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
                      padding: '6px 10px', borderRadius: 6,
                      background: 'rgba(77,138,245,0.08)', border: '1px solid rgba(77,138,245,0.15)',
                      marginBottom: 12, fontStyle: 'italic',
                    }}>
                      💡 {data.keyInsight}
                    </div>
                  )}

                  {/* Closing probability bar */}
                  {!data.fallback && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>
                        <span>Close probability</span>
                        <span style={{ color: urgencyColor, fontWeight: 700 }}>{data.closingProbability}%</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${data.closingProbability}%`, height: '100%', background: urgencyColor, borderRadius: 2, transition: 'width 0.5s ease' }} />
                      </div>
                      {data.daysInPipeline != null && (
                        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
                          {data.daysInPipeline}d in pipeline
                          {data.daysInStage != null && ` · ${data.daysInStage}d since last contact`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tactics */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.tactics.map((t, i) => (
                      <div key={i} style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                            background: 'rgba(77,138,245,0.2)', color: '#4d8af5',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 900,
                          }}>
                            {i + 1}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
                            {t.title}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.5, marginBottom: 4, paddingLeft: 26 }}>
                          {t.action}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.4, paddingLeft: 26, fontStyle: 'italic' }}>
                          {t.rationale}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Refresh link */}
                  <button
                    onClick={() => setTriggered(false)}
                    style={{ marginTop: 10, fontSize: 10, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    ↺ Refresh analysis
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
