import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import type { LeadCategory, LeadStatus } from '../../api/types';
import { CATEGORIES, STATUSES } from '../../api/types';

const CATEGORY_ORDER: LeadCategory[] = ['fleet', 'design', 'construction'];
const STATUS_ORDER: LeadStatus[] = ['cold', 'contacted', 'replied', 'meeting', 'proposal', 'won', 'lost'];

export default function Sidebar() {
  const { leads } = useLeads();
  const { activeFilter, setFilter } = useAppStore((s) => ({
    activeFilter: s.activeFilter,
    setFilter: s.setFilter,
  }));

  function countCategory(cat: LeadCategory) {
    return leads.filter((l) => l.category === cat).length;
  }
  function countStatus(st: LeadStatus) {
    return leads.filter((l) => l.status === st).length;
  }

  return (
    <aside className="sidebar">
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
