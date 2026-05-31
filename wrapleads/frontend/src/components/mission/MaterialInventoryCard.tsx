import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const ACCENT = '#f59e0b';

function fmt(n: number) {
  return Number(n).toFixed(1).replace(/\.0$/, '');
}

export default function MaterialInventoryCard() {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);
  const [adjustId, setAdjustId] = useState<number | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['materials-low-stock'],
    queryFn: () => api.getLowStockMaterials(),
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  });

  const adjustMut = useMutation({
    mutationFn: ({ id, delta }: { id: number; delta: number }) =>
      api.adjustMaterialStock(id, delta, 'Received stock'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials-low-stock'] });
      qc.invalidateQueries({ queryKey: ['materials'] });
      setAdjustId(null);
      setAdjustDelta('');
      showToast('Stock updated', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  if (isLoading) {
    return (
      <div className="mission-card" style={{ borderLeftColor: ACCENT }}>
        <div className="skeleton" style={{ height: 60, borderRadius: 8 }} />
      </div>
    );
  }

  const mats = data?.materials ?? [];
  if (mats.length === 0) return null;

  return (
    <div className="mission-card" style={{ borderLeft: `3px solid ${ACCENT}`, background: `${ACCENT}05` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 7, background: `${ACCENT}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </span>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: ACCENT }}>
            Low Material Stock
          </span>
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 99,
            background: `${ACCENT}18`, color: ACCENT, fontWeight: 700,
          }}>
            {mats.length} item{mats.length !== 1 ? 's' : ''}
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Reorder needed</span>
      </div>

      {/* Material list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {mats.map((mat) => {
          const pct = mat.reorder_at > 0
            ? Math.min(100, Math.round((mat.rolls_in_stock / (mat.reorder_at * 2)) * 100))
            : 0;
          const isEmpty = Number(mat.rolls_in_stock) === 0;

          return (
            <div key={mat.id} style={{
              background: 'var(--surface-2)', border: `1px solid ${isEmpty ? '#ef444430' : 'var(--border-subtle)'}`,
              borderRadius: 8, padding: '8px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mat.product_name}
                    </span>
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 3,
                      background: `${ACCENT}18`, color: ACCENT, fontWeight: 700, flexShrink: 0,
                    }}>
                      {mat.brand}
                    </span>
                    {isEmpty && (
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 3,
                        background: '#ef444418', color: '#ef4444', fontWeight: 700, flexShrink: 0,
                      }}>
                        OUT
                      </span>
                    )}
                  </div>

                  {/* Stock bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        width: `${pct}%`,
                        background: isEmpty ? '#ef4444' : pct < 40 ? '#f59e0b' : '#10b981',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isEmpty ? '#ef4444' : ACCENT, flexShrink: 0 }}>
                      {fmt(mat.rolls_in_stock)} / {fmt(mat.reorder_at)} rolls
                    </span>
                  </div>

                  {mat.rolls_on_order > 0 && (
                    <div style={{ fontSize: 10, color: '#4d8af5', marginTop: 2 }}>
                      {fmt(mat.rolls_on_order)} rolls on order
                    </div>
                  )}
                </div>

                {/* Receive button */}
                {adjustId === mat.id ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={adjustDelta}
                      onChange={(e) => setAdjustDelta(e.target.value)}
                      placeholder="rolls"
                      style={{
                        width: 60, fontSize: 12, padding: '4px 6px',
                        background: 'var(--bg-input)', border: '1px solid var(--border)',
                        borderRadius: 6, color: 'var(--text)', textAlign: 'center',
                      }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const d = parseFloat(adjustDelta);
                          if (!isNaN(d) && d > 0) adjustMut.mutate({ id: mat.id, delta: d });
                        }
                        if (e.key === 'Escape') { setAdjustId(null); setAdjustDelta(''); }
                      }}
                    />
                    <button
                      onClick={() => {
                        const d = parseFloat(adjustDelta);
                        if (!isNaN(d) && d > 0) adjustMut.mutate({ id: mat.id, delta: d });
                      }}
                      disabled={!adjustDelta || adjustMut.isPending}
                      style={{
                        fontSize: 11, padding: '4px 8px', borderRadius: 6, fontWeight: 700,
                        background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer',
                      }}
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => { setAdjustId(null); setAdjustDelta(''); }}
                      style={{
                        fontSize: 11, padding: '4px 6px', borderRadius: 6,
                        background: 'var(--surface-2)', color: 'var(--text-muted)',
                        border: '1px solid var(--border)', cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAdjustId(mat.id); setAdjustDelta(''); }}
                    style={{
                      fontSize: 11, fontWeight: 700, color: '#fff',
                      background: '#10b981', border: 'none',
                      borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    + Receive
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Manage full inventory in Settings → Material Inventory.
      </div>
    </div>
  );
}
