import { useQuery } from '@tanstack/react-query';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import type { LeadCategory, LeadStatus } from '../../api/types';
import { CATEGORIES, STATUSES } from '../../api/types';
import { api } from '../../api/client';

const CATEGORY_ORDER: LeadCategory[] = [
  'racing', 'fleet', 'colorchange', 'dinoc', 'reatec', 'wallgraphics', 'design', 'construction', 'gc_referral',
];
const STATUS_ORDER: LeadStatus[] = ['cold', 'contacted', 'replied', 'meeting', 'proposal', 'won', 'lost'];

const CAT_COLORS: Record<string, string> = {
  fleet: '#3b82f6',
  racing: '#ef4444',
  gc_referral: '#f59e0b',
  construction: '#f97316',
  dinoc: '#8b5cf6',
  reatec: '#a855f7',
  colorchange: '#ec4899',
  wallgraphics: '#14b8a6',
  design: '#06b6d4',
};

const STATUS_COLORS: Record<string, string> = {
  cold: '#6b7280',
  contacted: '#3b82f6',
  replied: '#0ea5e9',
  meeting: '#a855f7',
  proposal: '#f59e0b',
  won: '#22c55e',
  lost: '#ef4444',
};

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
        <div style={{ marginBottom: 8 }}>
          <div className="sidebar-section-title" style={{ color: 'var(--red)' }}>Follow-up Due</div>
          <button
            className={`filter-pill ${activeFilter.followupDue ? 'active' : ''}`}
            onClick={() => setFilter({ followupDue: !activeFilter.followupDue })}
          >
            <span className="filter-dot" style={{ background: '#ef4444' }} />
            Past-due
            <span className="filter-pill-count" style={activeFilter.followupDue ? { background: 'rgba(239,68,68,0.2)', color: '#f87171' } : {}}>
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
          <span className="filter-dot" style={{ background: 'var(--text-faint)' }} />
          All
          <span className="filter-pill-count">{leads.length}</span>
        </button>
        {CATEGORY_ORDER.map((cat) => {
          const count = countCategory(cat);
          if (!count) return null;
          return (
            <button
              key={cat}
              className={`filter-pill ${activeFilter.category === cat ? 'active' : ''}`}
              onClick={() => setFilter({ category: cat })}
            >
              <span className="filter-dot" style={{ background: CAT_COLORS[cat] ?? 'var(--text-faint)' }} />
              {CATEGORIES[cat]}
              <span className="filter-pill-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div>
        <div className="sidebar-section-title">Status</div>
        <button
          className={`filter-pill ${activeFilter.status === 'all' ? 'active' : ''}`}
          onClick={() => setFilter({ status: 'all' })}
        >
          <span className="filter-dot" style={{ background: 'var(--text-faint)' }} />
          All
          <span className="filter-pill-count">{leads.length}</span>
        </button>
        {STATUS_ORDER.map((st) => {
          const count = countStatus(st);
          if (!count) return null;
          return (
            <button
              key={st}
              className={`filter-pill ${activeFilter.status === st ? 'active' : ''}`}
              onClick={() => setFilter({ status: st })}
            >
              <span className="filter-dot" style={{ background: STATUS_COLORS[st] ?? 'var(--text-faint)' }} />
              {STATUSES[st]}
              <span className="filter-pill-count">{count}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
