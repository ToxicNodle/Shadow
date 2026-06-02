import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';

const SIGNAL_BADGES: Record<string, { label: string; icon: string; color: string }> = {
  email_opened:    { label: 'Email opens',     icon: '📧', color: '#4d8af5' },
  proposal_viewed: { label: 'Proposal views',  icon: '📄', color: '#f97316' },
  replied:         { label: 'Replied',          icon: '💬', color: '#00d97e' },
  wrap_aging:      { label: 'Wrap expiring',   icon: '🔧', color: '#fbbf24' },
};

function scoreToHeat(score: number): { label: string; color: string; bg: string } {
  if (score >= 25) return { label: '🔥 Very Hot',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
  if (score >= 15) return { label: '⚡ Hot',        color: '#f97316', bg: 'rgba(249,115,22,0.10)' };
  if (score >= 8)  return { label: '↑ Warm',        color: '#fbbf24', bg: 'rgba(251,191,36,0.10)' };
  return                   { label: '· Active',     color: '#4d8af5', bg: 'rgba(77,138,245,0.08)' };
}

function timeAgoShort(iso?: string) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export default function IntentSignalsCard() {
  const { setMode, setPendingOpenLeadServerId } = useAppStore((s) => ({
    setMode: s.setMode,
    setPendingOpenLeadServerId: s.setPendingOpenLeadServerId,
  }));

  const { data, isLoading } = useQuery({
    queryKey: ['intent-signals'],
    queryFn: () => api.getIntentSignals(),
    staleTime: 3 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const leads = data?.leads ?? [];

  if (!isLoading && leads.length === 0) return null;

  function openLead(id: number) {
    setPendingOpenLeadServerId(id);
    setMode('leads');
  }

  return (
    <section className="mission-card">
      <div className="mission-card-header">
        <div>
          <div className="mission-card-label">Intent Signals</div>
          <div className="mission-card-subtitle">
            Leads showing buying signals right now — email opens, proposal views, replies, aging wraps
          </div>
        </div>
        {leads.length > 0 && (
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--accent)',
            background: 'rgba(244,85,28,0.12)', padding: '3px 8px', borderRadius: 12,
          }}>
            {leads.length} active
          </div>
        )}
      </div>

      {isLoading && (
        <div style={{ padding: '12px 0', textAlign: 'center' }}>
          <span className="spinner" style={{ width: 14, height: 14 }} />
        </div>
      )}

      {leads.map((lead) => {
        const heat = scoreToHeat(lead.score);
        return (
          <div
            key={lead.leadId}
            className="mission-item"
            onClick={() => openLead(lead.leadId)}
            style={{ cursor: 'pointer' }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: heat.bg, border: `1px solid ${heat.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 12, color: heat.color,
            }}>
              {lead.company[0]?.toUpperCase()}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                  {lead.company}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                  background: heat.bg, color: heat.color,
                }}>
                  {heat.label}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {lead.signals.map((sig, i) => {
                  const badge = SIGNAL_BADGES[sig.type];
                  if (!badge) return null;
                  return (
                    <span
                      key={i}
                      style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 10,
                        background: `${badge.color}14`, border: `1px solid ${badge.color}30`,
                        color: badge.color, display: 'flex', alignItems: 'center', gap: 3,
                      }}
                    >
                      {badge.icon}
                      {sig.count != null && sig.count > 1 ? ` ×${sig.count}` : ''}
                      {sig.type === 'wrap_aging' && sig.daysUntilExpiry != null
                        ? ` ${sig.daysUntilExpiry}d left`
                        : sig.lastAt ? ` ${timeAgoShort(sig.lastAt)}` : ''}
                    </span>
                  );
                })}
              </div>
            </div>

            <div style={{
              flexShrink: 0, fontSize: 13, fontWeight: 900, color: heat.color,
              width: 30, textAlign: 'right', letterSpacing: '-0.5px',
            }}>
              {lead.score}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-faint)', borderTop: '1px solid var(--border-subtle)', paddingTop: 6 }}>
        Score: email open=3pts · proposal view=4pts · reply=10pts · aging wrap=6pts · refreshes every 5 min
      </div>
    </section>
  );
}
