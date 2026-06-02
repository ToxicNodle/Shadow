import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';

function daysLabel(n: number) {
  if (n < 1) return 'today';
  if (n === 1) return '1 day ago';
  if (n < 30) return `${n}d ago`;
  if (n < 365) return `${Math.round(n / 30)}mo ago`;
  return `${Math.round(n / 365)}yr ago`;
}

function fmtRev(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export default function AccountHealthCard({ lead }: { lead: Lead }) {
  const setMode = useAppStore((s) => s.setMode);

  const { data, isLoading } = useQuery({
    queryKey: ['account-health', lead.serverId],
    queryFn: () => api.getAccountHealth(lead.serverId!),
    enabled: !!lead.serverId && lead.status === 'won',
    staleTime: 15 * 60_000,
  });

  if (lead.status !== 'won' || !lead.serverId) return null;
  if (isLoading) return null;
  if (!data?.ok) return null;

  const { score, healthLabel, healthColor, daysSinceContact, jobCount, totalVehicles, totalRevenue, referralSent, nearestExpiry, jobs } = data;

  const daysToExpiry = nearestExpiry?.daysToExpiry;
  const expiryUrgent = daysToExpiry != null && daysToExpiry <= 90;

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <div style={{
        background: `${healthColor}06`, border: `1px solid ${healthColor}25`,
        borderRadius: 10, overflow: 'hidden',
      }}>
        {/* Header strip */}
        <div style={{ height: 3, background: healthColor }} />

        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🤝 Account Health</span>
              <span style={{
                fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '2px 7px', borderRadius: 10,
                background: `${healthColor}20`, color: healthColor,
              }}>
                {healthLabel}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${healthColor}15`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: healthColor, lineHeight: 1 }}>{score}</div>
                <div style={{ fontSize: 7, color: 'var(--text-faint)', textTransform: 'uppercase' }}>score</div>
              </div>
            </div>
          </div>

          {/* Vital stats */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center', minWidth: 50 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>
                {daysSinceContact === 0 ? '0' : Math.round(daysSinceContact)}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', marginTop: 1 }}>days since contact</div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 50 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>{jobCount}</div>
              <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', marginTop: 1 }}>jobs logged</div>
            </div>
            {totalVehicles > 0 && (
              <div style={{ textAlign: 'center', minWidth: 50 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>{totalVehicles}</div>
                <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', marginTop: 1 }}>vehicles wrapped</div>
              </div>
            )}
            {totalRevenue > 0 && (
              <div style={{ textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#00d97e', lineHeight: 1 }}>{fmtRev(totalRevenue)}</div>
                <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', marginTop: 1 }}>total revenue</div>
              </div>
            )}
          </div>

          {/* Status indicators */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: referralSent ? 'rgba(0,217,126,0.12)' : 'rgba(239,68,68,0.1)',
              color: referralSent ? '#00d97e' : '#ef4444',
            }}>
              {referralSent ? '✓ Referral asked' : '✗ Referral not asked'}
            </span>
            {daysSinceContact > 60 && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(249,115,22,0.12)', color: '#f97316' }}>
                ⚠ {daysLabel(daysSinceContact)} — check in
              </span>
            )}
            {expiryUrgent && daysToExpiry != null && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                {daysToExpiry <= 0 ? `Wrap expired ${Math.abs(daysToExpiry)}d ago` : `Wrap expires in ${daysToExpiry}d`}
              </span>
            )}
          </div>

          {/* Job history mini-list */}
          {jobs.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Installed jobs</div>
              {jobs.map((j) => (
                <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text)', flex: 1 }}>
                    {j.vehicleCount} vehicle{j.vehicleCount !== 1 ? 's' : ''} · {j.wrapCategory || 'wrap'}
                  </span>
                  {j.revenue > 0 && (
                    <span style={{ fontSize: 11, color: '#00d97e', fontWeight: 700 }}>{fmtRev(j.revenue)}</span>
                  )}
                  <span style={{ fontSize: 10, color: j.daysToExpiry <= 0 ? '#ef4444' : j.daysToExpiry <= 180 ? '#f97316' : 'var(--text-faint)' }}>
                    {j.daysToExpiry <= 0 ? `exp ${Math.abs(j.daysToExpiry)}d ago` : j.daysToExpiry <= 365 ? `exp in ${j.daysToExpiry}d` : new Date(j.installDate).getFullYear()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          <button
            onClick={() => setMode('jobs')}
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'rgba(0,217,126,0.1)', border: '1px solid rgba(0,217,126,0.2)',
              color: '#00d97e', fontSize: 11, fontWeight: 700,
            }}
          >
            {jobCount === 0 ? '+ Log first install →' : 'View & manage installs →'}
          </button>
        </div>
      </div>
    </div>
  );
}
