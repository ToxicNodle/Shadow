import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';

type Guide = {
  discoveryQuestions: string[];
  vehicleWorksheet: Array<{ type: string; sqFt: string; material: string; note: string }>;
  upsellChecklist: string[];
  redFlags: string[];
  estimatedValue: string;
  fallback: boolean;
};

function Section({ icon, title, color, children }: { icon: string; title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span>{icon}</span> {title}
      </div>
      {children}
    </div>
  );
}

export default function DiscoveryGuidePanel({ lead }: { lead: Lead }) {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const ELIGIBLE = ['replied', 'meeting'].includes(lead.status);
  const mut = useMutation({
    mutationFn: () => api.getDiscoveryGuide(lead.serverId!),
    onSuccess: (d) => { setGuide(d); setOpen(true); },
  });

  if (!lead.serverId || !ELIGIBLE) return null;

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {!open ? (
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6,
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <span style={{ fontSize: 15 }}>🔍</span>
          {mut.isPending ? 'Generating discovery guide…' : 'Generate Discovery Call Guide'}
          <span style={{
            marginLeft: 'auto', fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: '#4d8af5', padding: '1px 5px',
            border: '1px solid #4d8af550', borderRadius: 4,
          }}>AI</span>
        </button>
      ) : guide && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)' }}>
                🔍 Discovery Call Guide
              </span>
              {guide.fallback && (
                <span style={{ fontSize: 9, color: 'var(--text-faint)', fontStyle: 'italic' }}>template</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#00d97e',
                background: 'rgba(0,217,126,0.1)', border: '1px solid rgba(0,217,126,0.25)',
                borderRadius: 6, padding: '2px 8px',
              }}>
                Est. {guide.estimatedValue}
              </span>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14 }}>✕</button>
            </div>
          </div>

          {/* Discovery questions — checkable */}
          <Section icon="❓" title="Discovery Questions" color="#4d8af5">
            {guide.discoveryQuestions.map((q, i) => {
              const key = `q-${i}`;
              const done = checked.has(key);
              return (
                <div
                  key={i}
                  onClick={() => toggle(key)}
                  style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6,
                    cursor: 'pointer', opacity: done ? 0.45 : 1, transition: 'opacity 0.15s',
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                    border: `1.5px solid ${done ? '#00d97e' : 'var(--border)'}`,
                    background: done ? 'rgba(0,217,126,0.15)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {done && <span style={{ fontSize: 10, color: '#00d97e' }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, textDecoration: done ? 'line-through' : 'none' }}>{q}</span>
                </div>
              );
            })}
          </Section>

          {/* Vehicle worksheet */}
          {guide.vehicleWorksheet.length > 0 && (
            <Section icon="🚛" title="Vehicle Measurement Reference" color="var(--accent)">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Type', 'Sq Ft', 'Material', 'Note'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '4px 6px', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {guide.vehicleWorksheet.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '5px 6px', color: 'var(--text)', fontWeight: 600 }}>{row.type}</td>
                        <td style={{ padding: '5px 6px', color: 'var(--text-muted)' }}>{row.sqFt}</td>
                        <td style={{ padding: '5px 6px', color: 'var(--text-muted)' }}>{row.material}</td>
                        <td style={{ padding: '5px 6px', color: 'var(--text-faint)', fontStyle: 'italic' }}>{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Upsell + Red flags side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Section icon="⬆" title="Upsell Opportunities" color="#00d97e">
              {guide.upsellChecklist.map((u, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
                  <span style={{ color: '#00d97e', fontSize: 10, marginTop: 2, flexShrink: 0 }}>●</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{u}</span>
                </div>
              ))}
            </Section>
            <Section icon="⚠" title="Watch For" color="#f59e0b">
              {guide.redFlags.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
                  <span style={{ color: '#f59e0b', fontSize: 10, marginTop: 2, flexShrink: 0 }}>●</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{r}</span>
                </div>
              ))}
            </Section>
          </div>

          <button
            onClick={() => { setGuide(null); setOpen(false); mut.reset(); }}
            style={{ fontSize: 10, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}
          >
            Regenerate
          </button>
        </div>
      )}
      {mut.isError && (
        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>Failed to generate guide — try again.</div>
      )}
    </div>
  );
}
