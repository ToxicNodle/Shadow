import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function SignalLeadsCard() {
  const qc = useQueryClient();
  const { showToast, setMode } = useAppStore();
  const [imported, setImported] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['news-signals'],
    queryFn: api.getNewsSignals,
    staleTime: 15 * 60_000,
    refetchOnWindowFocus: false,
  });

  const importMut = useMutation({
    mutationFn: (id: number) => api.importCarrier(id),
    onSuccess: (_res, id) => {
      setImported(prev => new Set(prev).add(id));
      qc.invalidateQueries({ queryKey: ['leads'] });
      showToast('Lead imported from market signal');
    },
  });

  const signals = data?.signals ?? [];
  if (isLoading || signals.length === 0) return null;

  return (
    <div style={{
      background: 'var(--bg-elev)',
      border: '1px solid rgba(77,138,245,0.25)',
      borderRadius: 14,
      padding: '16px 18px',
      marginBottom: 14,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>📡</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Market Signals</span>
          <span style={{
            fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
            background: 'rgba(77,138,245,0.15)', color: '#4d8af5', padding: '2px 7px', borderRadius: 4,
          }}>
            LIVE
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          Press releases → leads
        </span>
      </div>

      {/* Signal rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {signals.slice(0, 5).map((s) => {
          const alreadyImported = imported.has(s.id);
          const headline = s.notes?.headline ?? s.name;
          const url = s.notes?.url;

          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              gap: 10, padding: '8px 10px',
              background: 'var(--surface)', borderRadius: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                  {s.name}
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--text-muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {headline.length > 60 ? headline.slice(0, 60) + '…' : headline}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    {relativeTime(s.createdAt)}
                  </span>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 10, color: '#4d8af5', textDecoration: 'none' }}
                    >
                      Source ↗
                    </a>
                  )}
                </div>
              </div>

              <button
                onClick={() => {
                  if (alreadyImported) { setMode('leads'); }
                  else importMut.mutate(s.id);
                }}
                disabled={importMut.isPending}
                style={{
                  flexShrink: 0, padding: '4px 10px', borderRadius: 6,
                  border: alreadyImported ? '1px solid rgba(0,217,126,0.3)' : '1px solid rgba(77,138,245,0.3)',
                  background: alreadyImported ? 'rgba(0,217,126,0.08)' : 'rgba(77,138,245,0.08)',
                  color: alreadyImported ? '#00d97e' : '#4d8af5',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {alreadyImported ? '✓ In CRM' : '+ Import'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
