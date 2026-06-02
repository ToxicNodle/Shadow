import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const CAT_LABEL: Record<string, string> = {
  fleet: 'Fleet', design: 'Design', construction: 'Construction',
  dinoc: 'DI-NOC', reatec: 'Reatec', colorchange: 'Color Change',
  wallgraphics: 'Wall', gc_referral: 'GC Ref', racing: 'Racing',
};

function daysAgoLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.round(ms / 86_400_000);
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}yr ago`;
}

export default function RescueQueueCard() {
  const { setMode, setCurrentLeadId, showToast } = useAppStore((s) => ({
    setMode: s.setMode,
    setCurrentLeadId: s.setCurrentLeadId,
    showToast: s.showToast,
  }));

  const [triggering, setTriggering] = useState<number[]>([]);

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['rescue-queue'],
    queryFn: () => api.getRescueQueue(),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const triggerMut = useMutation({
    mutationFn: (ids: number[]) => api.triggerRescue(ids),
    onSuccess: (result) => {
      showToast(`${result.queued} re-engagement email${result.queued !== 1 ? 's' : ''} queued for tomorrow`);
      qc.invalidateQueries({ queryKey: ['rescue-queue'] });
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const handleTrigger = async (ids: number[]) => {
    setTriggering(ids);
    try { await triggerMut.mutateAsync(ids); } finally { setTriggering([]); }
  };

  const queued = data?.queued ?? [];
  const candidates = data?.candidates ?? [];

  if (isLoading) return null;
  if (!queued.length && !candidates.length) return null;

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>♻</span>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)' }}>
            Lost Lead Rescue
          </span>
        </div>
        {candidates.length > 0 && (
          <button
            onClick={() => handleTrigger(candidates.map((c) => c.id))}
            disabled={triggerMut.isPending}
            style={{
              fontSize: 10, fontWeight: 600, padding: '3px 8px',
              background: triggerMut.isPending ? 'var(--border)' : '#4d8af5',
              color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
            }}
          >
            {triggerMut.isPending ? 'Drafting…' : `Draft ${candidates.length} Email${candidates.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {/* Queued emails */}
      {queued.length > 0 && (
        <div>
          <div style={{ padding: '6px 14px 2px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)' }}>
            Scheduled
          </div>
          {queued.map((item) => (
            <div
              key={`q-${item.id}`}
              onClick={() => { setMode('leads'); setCurrentLeadId(String(item.id)); }}
              style={{
                padding: '8px 14px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 8,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.company}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.subject}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>
                  Sends {new Date(item.send_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 1 }}>
                  {CAT_LABEL[item.category] ?? item.category} · {item.state}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Candidates needing rescue */}
      {candidates.length > 0 && (
        <div>
          <div style={{ padding: '6px 14px 2px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)' }}>
            Ready to Rescue
          </div>
          {candidates.map((item) => (
            <div
              key={`c-${item.id}`}
              style={{
                padding: '8px 14px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
                onClick={() => { setMode('leads'); setCurrentLeadId(String(item.id)); }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>{item.company}</div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>
                  Lost {daysAgoLabel(item.lost_at)} · {CAT_LABEL[item.category] ?? item.category} · {item.state}
                </div>
              </div>
              <button
                onClick={() => handleTrigger([item.id])}
                disabled={triggering.includes(item.id) || triggerMut.isPending}
                style={{
                  fontSize: 10, padding: '3px 8px', background: 'transparent',
                  border: '1px solid var(--border)', borderRadius: 4,
                  color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {triggering.includes(item.id) ? '…' : 'Rescue'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '7px 14px', fontSize: 9, color: 'var(--text-faint)' }}>
        AI re-engagement emails are sent tomorrow at optimal time · auto-generated daily at 9 AM
      </div>
    </div>
  );
}
