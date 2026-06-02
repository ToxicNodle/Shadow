import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { useLeads } from '../../hooks/useLeads';

function fmtAgo(h: number): string {
  if (h < 0.1) return 'just now';
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  return `${h.toFixed(1)}h ago`;
}

const CATEGORY_EMOJI: Record<string, string> = {
  fleet: '🚛', construction: '🏗', dinoc: '🎨', racing: '🏁',
  colorchange: '🎨', wallgraphics: '🖼', gc_referral: '🤝',
  reatec: '🪟', design: '✏️',
};

export default function PerfectTimingCard() {
  const { setCurrentLeadId, setQuickOpenTab } = useAppStore((s) => ({
    setCurrentLeadId: s.setCurrentLeadId,
    setQuickOpenTab: s.setQuickOpenTab,
  }));
  const { leads } = useLeads();

  const { data, isLoading } = useQuery({
    queryKey: ['perfect-timing'],
    queryFn: () => api.getPerfectTiming(2),
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  const items = data?.leads ?? [];

  function openLead(clientId: string) {
    const lead = leads.find((l) => l.id === clientId);
    if (lead) {
      setCurrentLeadId(lead.id);
      setQuickOpenTab('email');
    }
  }

  if (isLoading) {
    return (
      <div className="hot-proposals-card" style={{ borderColor: 'var(--signal-blue)' }}>
        <div className="hot-proposals-header" style={{ color: 'var(--signal-blue)' }}>
          <span>Perfect Timing</span>
          <span className="spinner" style={{ width: 12, height: 12 }} />
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="hot-proposals-card" style={{ borderColor: 'var(--border)', opacity: 0.6 }}>
        <div className="hot-proposals-header" style={{ color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Perfect Timing
          </span>
          <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-faint)' }}>watching…</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '6px 0' }}>
          No email opens in the last 2 hours. This card will light up when a prospect opens your email.
        </div>
      </div>
    );
  }

  return (
    <div className="hot-proposals-card" style={{ borderColor: 'var(--signal-blue)' }}>
      <div className="hot-proposals-header" style={{ color: 'var(--signal-blue)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="hot-proposals-pulse" style={{ background: 'var(--signal-blue)', boxShadow: '0 0 0 0 var(--signal-blue-glow)' }} />
          Perfect Timing
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
          background: 'var(--signal-blue-subtle)', color: 'var(--signal-blue)',
        }}>
          {items.length} active
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
        They opened your email — perfect moment to follow up
      </div>
      {items.slice(0, 4).map((item) => (
        <div
          key={`${item.leadId}-${item.openedAt}`}
          className="hot-proposal-row"
          onClick={() => openLead(item.clientId)}
          style={{ cursor: 'pointer', borderLeft: '2px solid var(--signal-blue)' }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <span style={{ fontSize: 13 }}>{CATEGORY_EMOJI[item.category] ?? '📧'}</span>
              <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.company}
              </span>
              {item.openCount > 1 && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: 'var(--signal-blue-subtle)', color: 'var(--signal-blue)', flexShrink: 0 }}>
                  ×{item.openCount}
                </span>
              )}
            </div>
            {item.subject && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                "{item.subject}"
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--signal-blue)', fontWeight: 700 }}>{fmtAgo(item.hoursAgo)}</div>
            <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 2, textTransform: 'capitalize' }}>{item.status}</div>
          </div>
        </div>
      ))}
      {items.length > 4 && (
        <div style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'center', paddingTop: 6 }}>
          +{items.length - 4} more
        </div>
      )}
    </div>
  );
}
