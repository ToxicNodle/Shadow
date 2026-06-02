import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 3600);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const VEHICLE_ICONS: Record<string, string> = {
  van: '🚐', 'box truck': '🚛', 'semi truck': '🚛', 'pickup truck': '🛻',
  suv: '🚙', trailer: '🚛', bus: '🚌', car: '🚗',
};

export default function InboundRequestsCard() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const showToast = useAppStore((s) => s.showToast);
  const setMode = useAppStore((s) => s.setMode);
  const setCurrentLeadId = useAppStore((s) => s.setCurrentLeadId);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['inbound-leads'],
    queryFn: () => api.getInboundLeads({ limit: 10 }),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const claimMut = useMutation({
    mutationFn: (id: number) => api.claimInboundLead(id),
    onSuccess: (res) => {
      showToast(`${res.lead.company} added to your leads!`, 'success');
      qc.invalidateQueries({ queryKey: ['inbound-leads'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['mission'] });
      setMode('leads');
      setCurrentLeadId(String(res.lead.id));
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  if (isLoading) return null;
  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;
  if (total === 0) return null;

  return (
    <div className="mission-card" style={{ borderColor: 'rgba(0,217,126,0.3)', background: 'rgba(0,217,126,0.02)' }}>
      {/* Header */}
      <div className="mission-card-header" style={{ marginBottom: 14 }}>
        <span className="mission-card-icon" style={{ color: 'var(--ghost-green)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34" />
            <polygon points="18 2 22 6 12 16 8 16 8 12 18 2" />
          </svg>
        </span>
        <span className="mission-card-title">Inbound Fleet Requests</span>
        <span
          className="mission-badge"
          style={{ background: 'var(--ghost-green)', color: '#000', fontWeight: 900, marginLeft: 'auto' }}
        >
          {total} new
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        Fleet managers who used <strong style={{ color: 'var(--ghost-green)' }}>wrap-my-fleet.com</strong> and
        requested a local installer. One click to claim as a lead.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {leads.slice(0, 5).map((lead) => {
          const icon = VEHICLE_ICONS[(lead.vehicle_type || '').toLowerCase()] ?? '🚐';
          const isExpanded = expanded === lead.id;
          const topConcept = lead.concepts_json?.[0];

          return (
            <div
              key={lead.id}
              style={{
                background: 'var(--bg-elev)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}
            >
              {/* Summary row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr auto',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
                onClick={() => setExpanded(isExpanded ? null : lead.id)}
              >
                <span style={{ fontSize: 18 }}>{icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.company}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {lead.fleet_size ? `${lead.fleet_size} ${lead.vehicle_type || 'vehicles'}` : lead.vehicle_type || 'Fleet'}
                    {lead.city ? ` · ${lead.city}` : ''}
                    {lead.state_code ? `, ${lead.state_code}` : ''}
                    <span style={{ marginLeft: 6, color: 'var(--text-faint)' }}>{timeAgo(lead.created_at)}</span>
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: '0 12px 14px', borderTop: '1px solid var(--border)' }}>
                  {lead.message && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, marginBottom: 10, fontStyle: 'italic' }}>
                      "{lead.message}"
                    </p>
                  )}

                  {topConcept && (
                    <div style={{
                      background: 'rgba(0,217,126,0.05)', border: '1px solid rgba(0,217,126,0.15)',
                      borderRadius: 8, padding: '10px 12px', marginBottom: 12,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ghost-green)', marginBottom: 4 }}>
                        AI Concept Shown
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{topConcept.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{topConcept.palette}</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                    {lead.email && <span>✉ {lead.email}</span>}
                    {lead.phone && <span>📞 {lead.phone}</span>}
                    {lead.industry && <span>🏢 {lead.industry}</span>}
                  </div>

                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', fontSize: 13 }}
                    disabled={claimMut.isPending}
                    onClick={() => claimMut.mutate(lead.id)}
                  >
                    {claimMut.isPending && claimMut.variables === lead.id
                      ? 'Claiming…'
                      : '+ Claim as Lead'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {total > 5 && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <a
            href="/wrap-my-fleet"
            target="_blank"
            rel="noopener"
            style={{ fontSize: 12, color: 'var(--text-muted)' }}
          >
            {total - 5} more requests · Share wrap-my-fleet.com to get more →
          </a>
        </div>
      )}

      <div style={{
        marginTop: 14, padding: '10px 12px',
        background: 'rgba(0,0,0,0.2)', borderRadius: 8,
        fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5,
      }}>
        Share <strong style={{ color: 'var(--text-muted)' }}>wrap-my-fleet.com</strong> with fleet managers.
        Every time they get concepts, you get a chance to claim the lead.
      </div>
    </div>
  );
}
