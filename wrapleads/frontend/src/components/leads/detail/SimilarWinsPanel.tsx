import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';
import { useAppStore } from '../../../store/useAppStore';

const CAT_LABELS: Record<string, string> = {
  fleet: 'Fleet', design: 'Design', construction: 'Construction',
  dinoc: 'DI-NOC', reatec: 'Reatec', colorchange: 'Color Change',
  wallgraphics: 'Wall Graphics', gc_referral: 'GC Referral', racing: 'Racing',
};

const VEH_LABELS: Record<string, string> = {
  cargo_van_standard: 'cargo van', cargo_van_large: 'large van', box_truck_small: 'box truck',
  box_truck_medium: 'box truck', box_truck_large: 'box truck', semi_truck: 'semi truck',
  flatbed: 'flatbed', pickup_truck: 'pickup', suv_large: 'SUV', sedan: 'sedan',
};

function SocialProofLine({ company, category, state, city, fleet_size }: {
  company: string; category: string; state: string | null; city: string | null; fleet_size: string | null;
}) {
  const vehLabel = category === 'fleet' && fleet_size ? `${fleet_size} vehicles` : CAT_LABELS[category] ?? category;
  const loc = [city, state].filter(Boolean).join(', ');
  return (
    <span>
      Wrapped {vehLabel} for <strong>{company}</strong>{loc ? ` in ${loc}` : ''}
    </span>
  );
}

interface Props {
  lead: Lead;
}

export default function SimilarWinsPanel({ lead }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const { showToast } = useAppStore((s) => ({ showToast: s.showToast }));

  const serverId = lead.serverId;
  const { data, isLoading } = useQuery({
    queryKey: ['similar-wins', serverId],
    queryFn: () => api.getSimilarWins(serverId!),
    staleTime: 10 * 60_000,
    enabled: !!serverId,
  });

  const wins = data?.wins ?? [];
  const jobs = data?.jobs ?? [];

  if (isLoading) return null;
  if (!wins.length && !jobs.length) return null;

  function copyProof(text: string, id: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(id);
    showToast('Copied to clipboard');
    setTimeout(() => setCopied(null), 2000);
  }

  function buildPitch(item: { company: string; category: string; state: string | null; city: string | null; fleet_size?: string | null; vehicle_count?: number; vehicle_type?: string }): string {
    const companyName = lead.company || 'your company';
    const loc = [item.city, item.state].filter(Boolean).join(', ');
    const category = 'category' in item ? item.category : 'fleet';
    const vehDetail = item.fleet_size ? `${item.fleet_size}-vehicle fleet` : item.vehicle_count ? `${item.vehicle_count} ${VEH_LABELS[item.vehicle_type ?? ''] ?? 'vehicles'}` : 'fleet';
    return `We recently completed a ${CAT_LABELS[category] ?? category} wrap project for ${item.company}${loc ? ` in ${loc}` : ''} — ${vehDetail}. I'd love to show you what we did for them and how a similar approach could work for ${companyName}.`;
  }

  const allItems = [
    ...jobs.map((j) => ({ ...j, category: j.wrap_category, _type: 'job' as const })),
    ...wins.filter((w) => w.relevance_score >= 2).map((w) => ({ ...w, _type: 'win' as const })),
  ].slice(0, 4);

  if (!allItems.length) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)', marginBottom: 8 }}>
        Social Proof — Similar Work
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {allItems.map((item) => {
          const pitch = buildPitch(item);
          const isCopied = copied === `${item._type}-${item.id}`;
          return (
            <div
              key={`${item._type}-${item.id}`}
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '7px 10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, flex: 1 }}>
                <SocialProofLine
                  company={item.company}
                  category={item.category}
                  state={item.state ?? null}
                  city={item.city ?? null}
                  fleet_size={'fleet_size' in item ? item.fleet_size ?? null : item.vehicle_count ? String(item.vehicle_count) : null}
                />
                {item._type === 'job' && 'install_date' in item && (
                  <span style={{ color: 'var(--text-faint)', fontSize: 10, marginLeft: 4 }}>
                    · {new Date(item.install_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
              <button
                onClick={() => copyProof(pitch, `${item._type}-${item.id}`)}
                title="Copy pitch line using this as social proof"
                style={{
                  fontSize: 10, padding: '2px 7px', flexShrink: 0,
                  background: isCopied ? '#22c55e22' : 'transparent',
                  border: `1px solid ${isCopied ? '#22c55e' : 'var(--border)'}`,
                  borderRadius: 4, color: isCopied ? '#22c55e' : 'var(--text-faint)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {isCopied ? '✓' : 'Copy'}
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 6 }}>
        Click "Copy" to copy a ready-to-use pitch referencing this won deal
      </div>
    </div>
  );
}
