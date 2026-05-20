import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import type { LeadSort } from '../../store/useAppStore';
import LeadRow from './LeadRow';
import { scoreLead } from '../../utils/scoring';
import { api, getToken } from '../../api/client';
import { STATUSES } from '../../api/types';
import type { LeadStatus } from '../../api/types';
import BroadcastModal from '../modals/BroadcastModal';

function downloadCSV() {
  fetch('/leads/export', { headers: { Authorization: `Bearer ${getToken()}` } })
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'wrapleads-export.csv'; a.click();
      URL.revokeObjectURL(url);
    });
}

export default function LeadList() {
  const { leads, isLoading } = useLeads();
  const {
    activeFilter, currentLeadId, setCurrentLeadId, setFilter,
    leadSort, setLeadSort,
    selectedLeadIds, selectAllLeads, clearLeadSelection,
    setBulkOutreachOpen, setCsvImportOpen, setPasteImportOpen,
    pendingOpenLeadServerId, setPendingOpenLeadServerId,
  } = useAppStore((s) => ({
    activeFilter: s.activeFilter,
    currentLeadId: s.currentLeadId,
    setCurrentLeadId: s.setCurrentLeadId,
    setFilter: s.setFilter,
    leadSort: s.leadSort,
    setLeadSort: s.setLeadSort,
    selectedLeadIds: s.selectedLeadIds,
    selectAllLeads: s.selectAllLeads,
    clearLeadSelection: s.clearLeadSelection,
    setBulkOutreachOpen: s.setBulkOutreachOpen,
    setCsvImportOpen: s.setCsvImportOpen,
    setPasteImportOpen: s.setPasteImportOpen,
    pendingOpenLeadServerId: s.pendingOpenLeadServerId,
    setPendingOpenLeadServerId: s.setPendingOpenLeadServerId,
  }));

  const qc = useQueryClient();
  const [hotOnly, setHotOnly] = useState(false);
  const [seqStatus, setSeqStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  // Deep-link from notification: auto-open the lead that matches pendingOpenLeadServerId
  useEffect(() => {
    if (!pendingOpenLeadServerId || !leads.length) return;
    const match = leads.find((l) => l.serverId === pendingOpenLeadServerId);
    if (match) {
      setCurrentLeadId(match.id);
      setPendingOpenLeadServerId(null);
    }
  }, [pendingOpenLeadServerId, leads]);

  const bulkSeqMut = useMutation({
    mutationFn: (ids: number[]) => api.bulkActivateSequences(ids),
    onMutate: () => setSeqStatus('running'),
    onSettled: () => { setSeqStatus('done'); setTimeout(() => setSeqStatus('idle'), 3000); },
  });

  const bulkStatusMut = useMutation({
    mutationFn: ({ ids, status }: { ids: number[]; status: string }) =>
      api.bulkUpdateLeads(ids, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); clearLeadSelection(); setBulkStatusOpen(false); },
  });

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const base = leads.filter((l) => {
      if (activeFilter.category !== 'all' && l.category !== activeFilter.category) return false;
      if (activeFilter.status !== 'all' && l.status !== activeFilter.status) return false;
      if (activeFilter.state && l.state !== activeFilter.state) return false;
      if (activeFilter.followupDue && !(l.followupDueAt && l.followupDueAt <= today)) return false;
      if (hotOnly && scoreLead(l) < 65) return false;
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
      <div className="lead-list-wrap">
        <div className="lead-list-header">
          <div />
          <span>Company</span>
          <span>Location</span>
          <span>Fleet</span>
          <span>Status</span>
          <span>Email</span>
          <span>Category / Last</span>
          <span>Score</span>
          <span />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="lead-skeleton-row">
            <div className="skeleton" style={{ width: 14, height: 14, borderRadius: 3 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
                <div className="skeleton" style={{ height: 12, width: `${55 + (i * 13) % 35}%` }} />
                <div className="skeleton" style={{ height: 10, width: `${30 + (i * 17) % 30}%` }} />
              </div>
            </div>
            <div className="skeleton" style={{ height: 11, width: '70%' }} />
            <div className="skeleton" style={{ height: 11, width: '50%' }} />
            <div className="skeleton" style={{ height: 20, width: 72, borderRadius: 12 }} />
            <div className="skeleton" style={{ height: 11, width: '80%' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div className="skeleton" style={{ height: 10, width: '90%' }} />
              <div className="skeleton" style={{ height: 10, width: '60%' }} />
            </div>
            <div className="skeleton" style={{ height: 22, width: 38, borderRadius: 10 }} />
            <div className="skeleton" style={{ width: 22, height: 22, borderRadius: 6 }} />
          </div>
        ))}
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
          className="btn btn-ai-import"
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => setPasteImportOpen(true)}
          title="Paste any contact info — AI extracts leads instantly"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" opacity=".4" />
            <path d="M12 6v6l4 2" />
          </svg>
          AI Import
        </button>

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

        <button
          className="btn"
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={downloadCSV}
          title="Export all leads as CSV"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>

        <button
          className={`btn ${hotOnly ? 'btn-primary' : ''}`}
          style={{ fontSize: 12, padding: '4px 10px', gap: 5 }}
          onClick={() => setHotOnly((h) => !h)}
          title="Show only hot leads (score ≥ 65)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2c0 6-6 8-6 14a6 6 0 0 0 12 0c0-6-6-8-6-14z"/><path d="M12 12c0 3-2 4-2 7a2 2 0 0 0 4 0c0-3-2-4-2-7z"/></svg>
          Hot
        </button>

        <span className="lead-count-badge">{filtered.length} / {leads.length}</span>
      </div>

      {/* Bulk selection toolbar */}
      {selCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '8px 14px', background: 'var(--accent)', borderRadius: 6,
          margin: '0 0 8px', color: '#fff', fontSize: 13,
        }}>
          <span style={{ fontWeight: 600 }}>{selCount} selected</span>
          <button
            className="btn"
            style={{ fontSize: 11, background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => setBulkOutreachOpen(true)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            Bulk Email
          </button>
          <button
            className="btn"
            style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '3px 10px' }}
            disabled={seqStatus === 'running'}
            onClick={() => {
              const ids = leads.filter((l) => selectedLeadIds.has(l.id) && l.serverId).map((l) => l.serverId!);
              if (ids.length) bulkSeqMut.mutate(ids);
            }}
          >
            {seqStatus === 'running' ? 'Activating…' : seqStatus === 'done' ? '✓ Done' : 'Activate Sequences'}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              className="btn"
              style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '3px 10px' }}
              onClick={() => setBulkStatusOpen((o) => !o)}
            >
              Move Stage ↓
            </button>
            {bulkStatusOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 50, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>
                {(Object.entries(STATUSES) as [LeadStatus, string][]).map(([s, label]) => (
                  <button
                    key={s}
                    style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    onClick={() => {
                      const ids = leads.filter((l) => selectedLeadIds.has(l.id) && l.serverId).map((l) => l.serverId!);
                      if (ids.length) bulkStatusMut.mutate({ ids, status: s });
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="btn"
            style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '3px 10px' }}
            onClick={() => setBroadcastOpen(true)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
            Broadcast
          </button>
          <button
            className="btn"
            style={{ fontSize: 11, background: 'transparent', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.3)', padding: '3px 10px' }}
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
          <div className="lead-list-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
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

      {broadcastOpen && (
        <BroadcastModal
          leads={leads.filter((l) => selectedLeadIds.has(l.id))}
          onClose={() => setBroadcastOpen(false)}
          onSent={() => { clearLeadSelection(); setBroadcastOpen(false); }}
        />
      )}
    </div>
  );
}
