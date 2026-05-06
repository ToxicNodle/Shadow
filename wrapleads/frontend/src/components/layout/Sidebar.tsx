import { useQuery } from '@tanstack/react-query';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import type { LeadCategory, LeadStatus } from '../../api/types';
import { CATEGORIES, STATUSES } from '../../api/types';
import { api } from '../../api/client';

const CATEGORY_ORDER: LeadCategory[] = [
  'fleet', 'colorchange', 'dinoc', 'reatec', 'wallgraphics', 'design', 'construction', 'gc_referral',
];
const STATUS_ORDER: LeadStatus[] = ['cold', 'contacted', 'replied', 'meeting', 'proposal', 'won', 'lost'];

export default function Sidebar() {
  const { leads } = useLeads();
  const { activeFilter, setFilter } = useAppStore((s) => ({
    activeFilter: s.activeFilter,
    setFilter: s.setFilter,
  }));

  const { data: followupData } = useQuery({
    queryKey: ['followup-due'],
    queryFn: () => api.getFollowupDue(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const followupCount = followupData?.count ?? 0;

  function countCategory(cat: LeadCategory) {
    return leads.filter((l) => l.category === cat).length;
  }
  function countStatus(st: LeadStatus) {
    return leads.filter((l) => l.status === st).length;
  }

  return (
    <aside className="sidebar">
      {followupCount > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="sidebar-section-title" style={{ color: 'var(--red, #ef4444)' }}>⚠ Follow-up Due</div>
          <button
            className={`filter-pill ${activeFilter.followupDue ? 'active' : ''}`}
            style={{ background: activeFilter.followupDue ? 'rgba(239,68,68,0.15)' : undefined,
                     borderColor: activeFilter.followupDue ? 'rgba(239,68,68,0.4)' : undefined }}
            onClick={() => setFilter({ followupDue: !activeFilter.followupDue })}
          >
            Past-due follow-ups
            <span className="filter-pill-count" style={{ background: '#ef4444', color: '#fff' }}>
              {followupCount}
            </span>
          </button>
        </div>
      )}

      <div>
        <div className="sidebar-section-title">Category</div>
        <button
          className={`filter-pill ${activeFilter.category === 'all' ? 'active' : ''}`}
          onClick={() => setFilter({ category: 'all' })}
        >
          All <span className="filter-pill-count">{leads.length}</span>
        </button>
        {CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            className={`filter-pill ${activeFilter.category === cat ? 'active' : ''}`}
            onClick={() => setFilter({ category: cat })}
          >
            {CATEGORIES[cat]}
            <span className="filter-pill-count">{countCategory(cat)}</span>
          </button>
        ))}
      </div>

      <div>
        <div className="sidebar-section-title">Status</div>
        <button
          className={`filter-pill ${activeFilter.status === 'all' ? 'active' : ''}`}
          onClick={() => setFilter({ status: 'all' })}
        >
          All <span className="filter-pill-count">{leads.length}</span>
        </button>
        {STATUS_ORDER.map((st) => (
          <button
            key={st}
            className={`filter-pill ${activeFilter.status === st ? 'active' : ''}`}
            onClick={() => setFilter({ status: st })}
          >
            {STATUSES[st]}
            <span className="filter-pill-count">{countStatus(st)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
