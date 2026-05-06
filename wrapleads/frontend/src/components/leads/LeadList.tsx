import { useMemo } from 'react';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import LeadRow from './LeadRow';

export default function LeadList() {
  const { leads, isLoading } = useLeads();
  const { activeFilter, currentLeadId, setFilter } = useAppStore((s) => ({
    activeFilter: s.activeFilter,
    currentLeadId: s.currentLeadId,
    setFilter: s.setFilter,
  }));

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (activeFilter.category !== 'all' && l.category !== activeFilter.category) return false;
      if (activeFilter.status !== 'all' && l.status !== activeFilter.status) return false;
      if (activeFilter.state && l.state !== activeFilter.state) return false;
      if (activeFilter.search) {
        const q = activeFilter.search.toLowerCase();
        const haystack = [l.company, l.contactName, l.email, l.city, l.state].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [leads, activeFilter]);

  if (isLoading) {
    return (
      <div className="loading">
        <span className="spinner spinner-lg" />
        <span>Loading leads...</span>
      </div>
    );
  }

  return (
    <div className="lead-list-wrap">
      <div className="lead-list-toolbar">
        <div className="lead-search-wrap">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="input"
            type="search"
            placeholder="Search leads…"
            value={activeFilter.search}
            onChange={(e) => setFilter({ search: e.target.value })}
          />
        </div>
        <span className="lead-count-badge">{filtered.length} / {leads.length}</span>
      </div>

      <div className="lead-list-header">
        <span>Company</span>
        <span>Location</span>
        <span>Fleet</span>
        <span>Status</span>
        <span>Email</span>
        <span>Category / Last</span>
        <span />
      </div>

      {filtered.length === 0 ? (
        <div className="lead-list-empty">
          <div className="empty-title">No leads found</div>
          <div className="empty-sub">
            {leads.length === 0
              ? 'Add your first lead or switch to Discover to import carriers.'
              : 'Try adjusting your filters.'}
          </div>
        </div>
      ) : (
        filtered.map((lead) => (
          <LeadRow key={lead.id} lead={lead} selected={lead.id === currentLeadId} />
        ))
      )}
    </div>
  );
}
