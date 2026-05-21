import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import type { LeadSort, ActiveFilter } from '../../store/useAppStore';
import LeadRow from './LeadRow';
import { scoreLead } from '../../utils/scoring';
import { api, getToken } from '../../api/client';
import { STATUSES } from '../../api/types';
import type { LeadStatus } from '../../api/types';
import BroadcastModal from '../modals/BroadcastModal';

// ── Filter Presets Bar ────────────────────────────────────────────────────────
const BUILTIN_PRESETS: { name: string; icon: string; filter: Partial<ActiveFilter> }[] = [
  { name: 'All', icon: '◎', filter: { category: 'all', status: 'all', state: '', search: '', followupDue: false } },
  { name: 'Hot', icon: '🔥', filter: { status: 'all', category: 'all', state: '', search: '', followupDue: false } },
  { name: 'Follow-up Due', icon: '⏰', filter: { category: 'all', status: 'all', state: '', search: '', followupDue: true } },
  { name: 'Replied', icon: '💬', filter: { status: 'replied', category: 'all', state: '', search: '', followupDue: false } },
  { name: 'Proposal', icon: '📋', filter: { status: 'proposal', category: 'all', state: '', search: '', followupDue: false } },
  { name: 'Won', icon: '✅', filter: { status: 'won', category: 'all', state: '', search: '', followupDue: false } },
  { name: 'Fleet', icon: '🚛', filter: { category: 'fleet', status: 'all', state: '', search: '', followupDue: false } },
  { name: 'GC Referrals', icon: '🏗', filter: { category: 'gc_referral', status: 'all', state: '', search: '', followupDue: false } },
];

const STORAGE_KEY = 'wl_filter_presets_v1';

interface CustomPreset { name: string; filter: Partial<ActiveFilter>; }

function FilterPresetsBar({ activeFilter, setFilter, leads }: {
  activeFilter: ActiveFilter;
  setFilter: (patch: Partial<ActiveFilter>) => void;
  leads: { status: string; category: string; followupDueAt?: string | null }[];
}) {
  const [custom, setCustom] = useState<CustomPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
  });
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  function saveCustom(presets: CustomPreset[]) {
    setCustom(presets);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  }

  function addPreset() {
    if (!newName.trim()) return;
    const preset: CustomPreset = { name: newName.trim(), filter: { ...activeFilter } };
    saveCustom([...custom, preset]);
    setNaming(false);
    setNewName('');
  }

  function removePreset(i: number) {
    saveCustom(custom.filter((_, idx) => idx !== i));
  }

  function isActive(filter: Partial<ActiveFilter>): boolean {
    for (const [k, v] of Object.entries(filter)) {
      if ((activeFilter as Record<string,unknown>)[k] !== v) return false;
    }
    return true;
  }

  function countFor(filter: Partial<ActiveFilter>): number {
    return leads.filter((l) => {
      if (filter.status && filter.status !== 'all' && l.status !== filter.status) return false;
      if (filter.category && filter.category !== 'all' && l.category !== filter.category) return false;
      if (filter.followupDue && !(l.followupDueAt && l.followupDueAt <= today)) return false;
      return true;
    }).length;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', overflowX: 'auto', borderBottom: '1px solid var(--border)', flexWrap: 'nowrap', scrollbarWidth: 'none' }}>
      {BUILTIN_PRESETS.map((p) => {
        const active = isActive(p.filter);
        const count = countFor(p.filter);
        if (p.name !== 'All' && count === 0) return null;
        return (
          <button
            key={p.name}
            onClick={() => setFilter(p.filter)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
              padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer',
              border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 12 }}>{p.icon}</span>
            {p.name}
            {p.name !== 'All' && <span style={{ fontSize: 10, opacity: 0.7 }}>{count}</span>}
          </button>
        );
      })}

      {/* Divider */}
      {custom.length > 0 && <span style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />}

      {/* Custom presets */}
      {custom.map((p, i) => {
        const active = isActive(p.filter);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <button
              onClick={() => setFilter(p.filter)}
              style={{
                padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer',
                border: active ? '1px solid #8b5cf6' : '1px solid var(--border)',
                background: active ? '#8b5cf6' : 'transparent',
                color: active ? '#fff' : 'var(--text-muted)',
              }}
            >
              ⚡ {p.name}
            </button>
            <button
              onClick={() => removePreset(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 11, padding: '0 2px', lineHeight: 1 }}
              title="Remove preset"
            >✕</button>
          </div>
        );
      })}

      {/* Save current filter */}
      {naming ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addPreset(); if (e.key === 'Escape') { setNaming(false); setNewName(''); } }}
            placeholder="Preset name…"
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)', width: 120 }}
          />
          <button onClick={addPreset} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #8b5cf6', background: '#8b5cf6', color: '#fff', cursor: 'pointer' }}>Save</button>
          <button onClick={() => { setNaming(false); setNewName(''); }} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
        </div>
      ) : (
        <button
          onClick={() => setNaming(true)}
          style={{ flexShrink: 0, padding: '3px 9px', borderRadius: 99, fontSize: 11, border: '1px dashed var(--border)', background: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}
          title="Save current filter as preset"
        >
          + Save filter
        </button>
      )}
    </div>
  );
}

// ── Pipeline Health Banner ────────────────────────────────────────────────────
interface HealthChip {
  key: string;
  icon: string;
  label: string;
  count: number;
  color: string;
  bg: string;
  ctaLabel: string;
  onCta: () => void;
}

function PipelineHealthBanner({
  leads,
  onFilter,
  onBulkEmail,
}: {
  leads: { id: string; email?: string | null; phone?: string | null; status: string; followupDueAt?: string | null; lastContacted?: string | null; createdAt?: string | null }[];
  onFilter: (patch: Partial<ActiveFilter>) => void;
  onBulkEmail: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  const noEmail = leads.filter((l) => !l.email && !['won', 'lost'].includes(l.status));
  const overdue  = leads.filter((l) => l.followupDueAt && l.followupDueAt < today && !['won', 'lost'].includes(l.status));
  const stale    = leads.filter((l) => {
    if (['won', 'lost', 'new', 'cold'].includes(l.status)) return false;
    if (l.lastContacted) return now - new Date(l.lastContacted).getTime() > 30 * 86_400_000;
    if (l.createdAt) return now - new Date(l.createdAt).getTime() > 45 * 86_400_000;
    return false;
  });
  const neverTouched = leads.filter((l) => l.status === 'new');

  const chips: HealthChip[] = [
    noEmail.length > 0 && {
      key: 'noEmail', icon: '✉', label: `${noEmail.length} missing email`, count: noEmail.length,
      color: '#6366f1', bg: '#6366f114',
      ctaLabel: 'Enrich →',
      onCta: () => onFilter({ search: '' }),
    },
    overdue.length > 0 && {
      key: 'overdue', icon: '⚠', label: `${overdue.length} overdue follow-up${overdue.length !== 1 ? 's' : ''}`, count: overdue.length,
      color: '#ef4444', bg: '#ef444414',
      ctaLabel: 'View →',
      onCta: () => onFilter({ followupDue: true }),
    },
    stale.length > 0 && {
      key: 'stale', icon: '🧊', label: `${stale.length} stale — 30d+ silent`, count: stale.length,
      color: '#64748b', bg: '#64748b12',
      ctaLabel: 'Re-engage →',
      onCta: () => { onFilter({ status: 'all', search: '' }); onBulkEmail(); },
    },
    neverTouched.length > 0 && {
      key: 'new', icon: '🌱', label: `${neverTouched.length} never contacted`, count: neverTouched.length,
      color: '#10b981', bg: '#10b98112',
      ctaLabel: 'Outreach →',
      onCta: () => onFilter({ status: 'new' }),
    },
  ].filter(Boolean) as HealthChip[];

  if (chips.length === 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      padding: '6px 14px', borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--surface)',
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>Pipeline Health</span>
      {chips.map((chip) => (
        <div key={chip.key} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 8px', borderRadius: 99, fontSize: 11,
          background: chip.bg, border: `1px solid ${chip.color}30`,
        }}>
          <span>{chip.icon}</span>
          <span style={{ color: 'var(--text-muted)' }}>{chip.label}</span>
          <button
            onClick={chip.onCta}
            style={{ fontSize: 10, fontWeight: 700, color: chip.color, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {chip.ctaLabel}
          </button>
        </div>
      ))}
      <button
        onClick={() => setDismissed(true)}
        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 13, lineHeight: 1, flexShrink: 0 }}
        title="Dismiss"
      >✕</button>
    </div>
  );
}

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
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [seqStatus, setSeqStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');

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

  const bulkTagMut = useMutation({
    mutationFn: ({ ids, tag }: { ids: number[]; tag: string }) => api.bulkTagLeads(ids, tag, 'add'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); setBulkTagOpen(false); setBulkTagInput(''); },
  });

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const base = leads.filter((l) => {
      if (activeFilter.category !== 'all' && l.category !== activeFilter.category) return false;
      if (activeFilter.status !== 'all' && l.status !== activeFilter.status) return false;
      if (activeFilter.state && l.state !== activeFilter.state) return false;
      if (activeFilter.followupDue && !(l.followupDueAt && l.followupDueAt <= today)) return false;
      if (hotOnly && scoreLead(l) < 65) return false;
      if (tagFilter && !(l.tags ?? []).includes(tagFilter)) return false;
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
        const order = ['won', 'proposal', 'meeting', 'replied', 'contacted', 'cold', 'new', 'lost'];
        return order.indexOf(a.status) - order.indexOf(b.status);
      }
      if (leadSort === 'lastContacted') {
        return (b.lastContacted || '').localeCompare(a.lastContacted || '');
      }
      return 0;
    });
  }, [leads, activeFilter, leadSort, hotOnly, tagFilter]);

  // Unique tags across all leads (sorted by frequency, then alpha)
  const allTags = useMemo(() => {
    const freq = new Map<string, number>();
    for (const l of leads) {
      for (const t of l.tags ?? []) freq.set(t, (freq.get(t) ?? 0) + 1);
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }, [leads]);

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
          <span>Win %</span>
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

      {/* Filter presets bar */}
      <FilterPresetsBar activeFilter={activeFilter} setFilter={setFilter} leads={leads} />

      {/* Tag filter chips — only shown when leads have tags */}
      {allTags.length > 0 && (
        <div className="tag-filter-bar">
          <span className="tag-filter-label">Tags:</span>
          {allTags.map((t) => {
            let h = 0;
            for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0;
            const PALETTE = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#f97316'];
            const c = PALETTE[Math.abs(h) % PALETTE.length];
            const active = tagFilter === t;
            return (
              <button
                key={t}
                className="tag-filter-chip"
                style={{
                  background: active ? `${c}30` : 'var(--bg-card)',
                  color: active ? c : 'var(--text-muted)',
                  border: `1px solid ${active ? c : 'var(--border)'}`,
                  fontWeight: active ? 700 : 500,
                }}
                onClick={() => setTagFilter(active ? null : t)}
              >
                {t}
                {active && <span style={{ marginLeft: 4, opacity: 0.7 }}>×</span>}
              </button>
            );
          })}
          {tagFilter && (
            <button
              className="tag-filter-chip"
              style={{ color: 'var(--text-faint)', border: '1px solid var(--border)', background: 'none' }}
              onClick={() => setTagFilter(null)}
            >
              Clear filter
            </button>
          )}
        </div>
      )}

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
          {/* Bulk Tag */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn"
              style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '3px 10px' }}
              onClick={() => setBulkTagOpen((o) => !o)}
            >
              🏷 Tag
            </button>
            {bulkTagOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 50, width: 220, boxShadow: '0 8px 24px rgba(0,0,0,.3)', padding: '10px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                  Add tag to {selCount} lead{selCount !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="input"
                    style={{ flex: 1, fontSize: 12, padding: '4px 8px' }}
                    placeholder="Tag name…"
                    value={bulkTagInput}
                    onChange={(e) => setBulkTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && bulkTagInput.trim()) {
                        const ids = leads.filter((l) => selectedLeadIds.has(l.id) && l.serverId).map((l) => l.serverId!);
                        if (ids.length) bulkTagMut.mutate({ ids, tag: bulkTagInput.trim() });
                      }
                      if (e.key === 'Escape') setBulkTagOpen(false);
                    }}
                    autoFocus
                  />
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    disabled={!bulkTagInput.trim() || bulkTagMut.isPending}
                    onClick={() => {
                      const ids = leads.filter((l) => selectedLeadIds.has(l.id) && l.serverId).map((l) => l.serverId!);
                      if (ids.length) bulkTagMut.mutate({ ids, tag: bulkTagInput.trim() });
                    }}
                  >
                    {bulkTagMut.isPending ? '…' : 'Apply'}
                  </button>
                </div>
                {allTags.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {allTags.slice(0, 8).map((t) => (
                      <button
                        key={t}
                        style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer' }}
                        onClick={() => setBulkTagInput(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
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

      <PipelineHealthBanner leads={leads} onFilter={setFilter} onBulkEmail={() => setBulkOutreachOpen(true)} />

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
        <span>Win %</span>
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
