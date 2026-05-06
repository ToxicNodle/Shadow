import { useMemo } from 'react';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import type { LeadSort } from '../../store/useAppStore';
import LeadRow from './LeadRow';
import { scoreLead } from '../../utils/scoring';

export default function LeadList() {
  const { leads, isLoading } = useLeads();
  const {
    activeFilter, currentLeadId, setFilter,
    leadSort, setLeadSort,
    selectedLeadIds, selectAllLeads, clearLeadSelection,
    setBulkOutreachOpen, setCsvImportOpen,
  } = useAppStore((s) => ({
    activeFilter: s.activeFilter,
    currentLeadId: s.currentLeadId,
    setFilter: s.setFilter,
    leadSort: s.leadSort,
    setLeadSort: s.setLeadSort,
    selectedLeadIds: s.selectedLeadIds,
    selectAllLeads: s.selectAllLeads,
    clearLeadSelection: s.clearLeadSelection,
    setBulkOutreachOpen: s.setBulkOutreachOpen,
    setCsvImportOpen: s.setCsvImportOpen,
  }));

  const filtered = useMemo(() => {
    const base = leads.filter((l) => {
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

    return [...base].sort((a, b) => {
      if (leadSort === 'score') return scoreLead(b) - scoreLead(a);
      if (leadSort === 'company') return a.company.localeCompare(b.company);
      if (leadSort === 'status') {
        const order = ['won', 'proposal', 'meeting', 'replied', 'contacted', 'cold', 'lost'];
        return order.indexOf(a.status) - order.indexOf(b.status);
      }
      if (leadSort === 'lastContacted') {
        return (b.lastContacted || '').localeCompare(a.lastContacted || '');
      }
      return 0;
    });
  }, [leads, activeFilter, leadSort]);

  const selCount = selectedLeadIds.size;
  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selectedLeadIds.has(l.id));

  function toggleSelectAll() {
    if (allFilteredSelected) clearLeadSelection();
    else selectAllLeads(filtered.map((l) => l.id));
  }

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

        <select
          className="select"
          style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }}
          value={leadSort}
          onChange={(e) => setLeadSort(e.target.value as LeadSort)}
        >
          <option value="score">Sort: Score</option>
          <option value="company">Sort: Company</option>
          <option value="status">Sort: Status</option>
          <option value="lastContacted">Sort: Last Contacted</option>
        </select>

        <button
          className="btn"
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => setCsvImportOpen(true)}
          title="Import leads from CSV"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Import CSV
        </button>

        <span className="lead-count-badge">{filtered.length} / {leads.length}</span>
      </div>

      {/* Bulk selection toolbar */}
      {selCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', background: 'var(--accent)', borderRadius: 6,
          margin: '0 0 8px', color: '#fff', fontSize: 13,
        }}>
          <span style={{ fontWeight: 600 }}>{selCount} lead{selCount !== 1 ? 's' : ''} selected</span>
          <button
            className="btn"
            style={{ fontSize: 12, background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '4px 12px' }}
            onClick={() => setBulkOutreachOpen(true)}
          >
            ⚡ Bulk Email
          </button>
          <button
            className="btn"
            style={{ fontSize: 12, background: 'transparent', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.3)', padding: '4px 10px' }}
            onClick={clearLeadSelection}
          >
            Clear
          </button>
        </div>
      )}

      <div className="lead-list-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={toggleSelectAll}
            style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--accent)' }}
          />
        </div>
        <span>Company</span>
        <span>Location</span>
        <span>Fleet</span>
        <span>Status</span>
        <span>Email</span>
        <span>Category / Last</span>
        <span>Score</span>
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
          <LeadRow
            key={lead.id}
            lead={lead}
            selected={lead.id === currentLeadId}
            checked={selectedLeadIds.has(lead.id)}
          />
        ))
      )}
    </div>
  );
}
