import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Bid, BidStatus, BidProjectType, BidPlatform } from '../../api/types';

function requestBidNotifications(bids: Bid[]) {
  if (!('Notification' in window)) return;
  Notification.requestPermission().then((perm) => {
    if (perm !== 'granted') return;
    const today = new Date();
    bids.forEach((b) => {
      if (!b.bid_due || ['won','lost','no_bid'].includes(b.status)) return;
      const diff = Math.ceil((new Date(b.bid_due).getTime() - today.getTime()) / 86_400_000);
      if (diff === 1) {
        new Notification('Bid due TOMORROW', {
          body: `${b.project_name}${b.gc_name ? ` — ${b.gc_name}` : ''}`,
          icon: '/favicon.ico',
        });
      } else if (diff === 2) {
        new Notification('Bid due in 2 days', {
          body: `${b.project_name}${b.gc_name ? ` — ${b.gc_name}` : ''}`,
          icon: '/favicon.ico',
        });
      }
    });
  });
}

const COLUMNS: { status: BidStatus; label: string; color: string }[] = [
  { status: 'tracking',    label: 'Tracking',    color: '#6366f1' },
  { status: 'submitted',   label: 'Submitted',   color: '#3b82f6' },
  { status: 'shortlisted', label: 'Shortlisted', color: '#f59e0b' },
  { status: 'won',         label: 'Won',         color: '#22c55e' },
  { status: 'lost',        label: 'Lost / No Bid', color: '#6b7280' },
];

const PROJECT_TYPE_LABELS: Record<BidProjectType, string> = {
  fleet_graphics: 'Fleet Graphics', dinoc: 'DI-NOC / Rea Tec',
  signage: 'Signage', color_change: 'Color Change', mixed: 'Mixed', general: 'General',
};

const PLATFORM_LABELS: Record<string, string> = {
  building_connected: 'BuildingConnected', isqft: 'iSqFt', planhub: 'PlanHub',
  sam_gov: 'SAM.gov', indot: 'INDOT', direct: 'Direct / Phone', other: 'Other',
};

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ── Add / Edit Bid Modal ──────────────────────────────────────────────────────

interface BidFormData {
  project_name: string;
  gc_name: string;
  architect: string;
  project_type: BidProjectType;
  bid_due: string;
  estimated_value: string;
  source_platform: BidPlatform | '';
  source_url: string;
  status: BidStatus;
  notes: string;
}

const emptyForm = (): BidFormData => ({
  project_name: '', gc_name: '', architect: '', project_type: 'general',
  bid_due: '', estimated_value: '', source_platform: '', source_url: '',
  status: 'tracking', notes: '',
});

function fromBid(b: Bid): BidFormData {
  return {
    project_name: b.project_name,
    gc_name: b.gc_name ?? '',
    architect: b.architect ?? '',
    project_type: b.project_type,
    bid_due: b.bid_due ? b.bid_due.slice(0, 10) : '',
    estimated_value: b.estimated_value ? String(b.estimated_value) : '',
    source_platform: (b.source_platform as BidPlatform) ?? '',
    source_url: b.source_url ?? '',
    status: b.status,
    notes: b.notes ?? '',
  };
}

interface BidModalProps {
  bid?: Bid;
  onClose: () => void;
  onSave: (data: Partial<Bid>) => void;
  saving: boolean;
}

function BidModal({ bid, onClose, onSave, saving }: BidModalProps) {
  const [form, setForm] = useState<BidFormData>(bid ? fromBid(bid) : emptyForm());
  const set = (k: keyof BidFormData, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      project_name: form.project_name.trim(),
      gc_name: form.gc_name.trim() || undefined,
      architect: form.architect.trim() || undefined,
      project_type: form.project_type,
      bid_due: form.bid_due || undefined,
      estimated_value: form.estimated_value ? parseInt(form.estimated_value, 10) : undefined,
      source_platform: (form.source_platform as BidPlatform) || undefined,
      source_url: form.source_url.trim() || undefined,
      status: form.status,
      notes: form.notes.trim() || undefined,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box bid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{bid ? 'Edit Bid' : 'Log New Bid'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="bid-form">
          <div className="bid-form-row">
            <div className="form-group bid-form-wide">
              <label className="form-label">Project Name *</label>
              <input className="form-control" required value={form.project_name}
                onChange={(e) => set('project_name', e.target.value)}
                placeholder="e.g. Hyatt Place Indy — interior renovation" />
            </div>
          </div>
          <div className="bid-form-row">
            <div className="form-group">
              <label className="form-label">GC / Builder</label>
              <input className="form-control" value={form.gc_name}
                onChange={(e) => set('gc_name', e.target.value)}
                placeholder="e.g. Pepper Construction" />
            </div>
            <div className="form-group">
              <label className="form-label">Architect / Designer</label>
              <input className="form-control" value={form.architect}
                onChange={(e) => set('architect', e.target.value)}
                placeholder="e.g. RATIO Architects" />
            </div>
          </div>
          <div className="bid-form-row">
            <div className="form-group">
              <label className="form-label">Project Type</label>
              <select className="form-control" value={form.project_type}
                onChange={(e) => set('project_type', e.target.value as BidProjectType)}>
                {Object.entries(PROJECT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status}
                onChange={(e) => set('status', e.target.value as BidStatus)}>
                {COLUMNS.map((c) => (
                  <option key={c.status} value={c.status}>{c.label}</option>
                ))}
                <option value="no_bid">No Bid</option>
              </select>
            </div>
          </div>
          <div className="bid-form-row">
            <div className="form-group">
              <label className="form-label">Bid Due Date</label>
              <input className="form-control" type="date" value={form.bid_due}
                onChange={(e) => set('bid_due', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Est. Contract Value ($)</label>
              <input className="form-control" type="number" min="0" step="500"
                value={form.estimated_value}
                onChange={(e) => set('estimated_value', e.target.value)}
                placeholder="e.g. 12500" />
            </div>
          </div>
          <div className="bid-form-row">
            <div className="form-group">
              <label className="form-label">Source Platform</label>
              <select className="form-control" value={form.source_platform}
                onChange={(e) => set('source_platform', e.target.value as BidPlatform)}>
                <option value="">— Select platform —</option>
                {Object.entries(PLATFORM_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Bid Link / URL</label>
              <input className="form-control" value={form.source_url}
                onChange={(e) => set('source_url', e.target.value)}
                placeholder="https://app.buildingconnected.com/..." />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-control" rows={3} value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Contact, special requirements, scope notes..." />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : bid ? 'Save Changes' : 'Log Bid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Bid Card ─────────────────────────────────────────────────────────────────

interface BidCardProps {
  bid: Bid;
  onEdit: (b: Bid) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: BidStatus) => void;
}

function BidCard({ bid, onEdit, onDelete, onStatusChange }: BidCardProps) {
  const days = daysUntil(bid.bid_due);
  const isOverdue = days !== null && days < 0 && !['won', 'lost', 'no_bid'].includes(bid.status);
  const isUrgent  = days !== null && days >= 0 && days <= 3 && !['won', 'lost', 'no_bid'].includes(bid.status);

  return (
    <div className={`bid-card${isOverdue ? ' bid-card-overdue' : isUrgent ? ' bid-card-urgent' : ''}`}>
      <div className="bid-card-header">
        <span className="bid-card-type">{PROJECT_TYPE_LABELS[bid.project_type]}</span>
        <div className="bid-card-actions">
          <button className="bid-card-btn" onClick={() => onEdit(bid)} title="Edit">✎</button>
          <button className="bid-card-btn bid-card-btn-del" onClick={() => onDelete(bid.id)} title="Delete">✕</button>
        </div>
      </div>

      <div className="bid-card-name">{bid.project_name}</div>

      {bid.gc_name && (
        <div className="bid-card-meta">
          <span className="bid-meta-icon">🏗</span> {bid.gc_name}
        </div>
      )}
      {bid.architect && (
        <div className="bid-card-meta">
          <span className="bid-meta-icon">📐</span> {bid.architect}
        </div>
      )}
      {bid.source_platform && (
        <div className="bid-card-meta bid-card-platform">
          {PLATFORM_LABELS[bid.source_platform] ?? bid.source_platform}
        </div>
      )}

      <div className="bid-card-footer">
        {bid.estimated_value ? (
          <span className="bid-card-value">{fmt(bid.estimated_value)}</span>
        ) : (
          <span className="bid-card-value-empty">No value set</span>
        )}
        {days !== null && (
          <span className={`bid-card-due${isOverdue ? ' overdue' : isUrgent ? ' urgent' : ''}`}>
            {isOverdue
              ? `${Math.abs(days)}d overdue`
              : days === 0
              ? 'Due today'
              : `${days}d left`}
          </span>
        )}
      </div>

      {bid.status === 'tracking' && (
        <button
          className="bid-submit-btn"
          onClick={() => onStatusChange(bid.id, 'submitted')}
        >
          Mark Submitted →
        </button>
      )}
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

interface ColProps {
  status: BidStatus;
  label: string;
  color: string;
  bids: Bid[];
  onEdit: (b: Bid) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, s: BidStatus) => void;
}

function BidColumn({ status: _status, label, color, bids, onEdit, onDelete, onStatusChange }: ColProps) {
  const totalValue = bids.reduce((s, b) => s + (b.estimated_value ?? 0), 0);
  return (
    <div className="bid-column">
      <div className="bid-col-header" style={{ borderTopColor: color }}>
        <span className="bid-col-label" style={{ color }}>{label}</span>
        <span className="bid-col-count">{bids.length}</span>
        {totalValue > 0 && <span className="bid-col-value">{fmt(totalValue)}</span>}
      </div>
      <div className="bid-col-cards">
        {bids.length === 0
          ? <div className="bid-col-empty">No bids</div>
          : bids.map((b) => (
            <BidCard key={b.id} bid={b} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} />
          ))
        }
      </div>
    </div>
  );
}

// ── Bid Platform Guide ────────────────────────────────────────────────────────

const BID_PLATFORMS = [
  {
    name: 'BuildingConnected',
    url: 'https://www.buildingconnected.com',
    note: 'Free sub registration. #1 platform for commercial GC bids. Turner, Skanska, Pepper all use it.',
    tag: 'Must-have',
  },
  {
    name: 'iSqFt (ConstructConnect)',
    url: 'https://www.isqft.com',
    note: 'Register as a vendor for signage/graphics. Many Midwest GCs post ITBs here.',
    tag: 'High value',
  },
  {
    name: 'PlanHub',
    url: 'https://www.planhub.com',
    note: 'Free for subs. Search "signage", "graphics", "vinyl" for relevant ITBs.',
    tag: 'Free',
  },
  {
    name: 'SAM.gov (Federal)',
    url: 'https://sam.gov',
    note: 'Federal contract database. Search NAICS 339950 (signs), 812990 (graphics). VA hospitals, GSA buildings.',
    tag: 'Fleet + DI-NOC',
  },
  {
    name: 'INDOT (Indiana DOT)',
    url: 'https://www.in.gov/dot/div/contracts/letting/',
    note: 'Indiana highway/transit projects. Fleet graphics for vehicles, signage for transportation facilities.',
    tag: 'Indiana',
  },
  {
    name: 'Indiana IDOA eProcurement',
    url: 'https://www.in.gov/idoa/procurement/public-search-for-state-purchases/',
    note: 'State fleet graphics contracts — INDOT fleet, corrections dept vehicles, parks vehicles.',
    tag: 'Indiana',
  },
  {
    name: 'Ohio Procurement (OHIOBV)',
    url: 'https://procure.ohio.gov',
    note: 'Ohio state bids. Search for vehicle graphics, architectural film, fleet wraps.',
    tag: 'Ohio',
  },
  {
    name: 'DemandStar',
    url: 'https://www.demandstar.com',
    note: 'Free registration. City/county bids across IN, OH, MI. Best for municipal fleet graphics.',
    tag: 'Municipal',
  },
];

function PlatformGuide() {
  return (
    <div className="bid-guide">
      <h3 className="bid-guide-title">Where to Find GC Bid Contracts</h3>
      <p className="bid-guide-sub">
        Register on these platforms to receive bid invitations directly from GCs.
        Once registered, GCs can send you ITBs (Invitations to Bid) for any project
        where they need a signage/graphics/film vendor.
      </p>
      <div className="bid-guide-grid">
        {BID_PLATFORMS.map((p) => (
          <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer" className="bid-platform-card">
            <div className="bid-platform-header">
              <span className="bid-platform-name">{p.name}</span>
              <span className="bid-platform-tag">{p.tag}</span>
            </div>
            <p className="bid-platform-note">{p.note}</p>
            <span className="bid-platform-url">{p.url.replace('https://', '')}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Main BidsView ─────────────────────────────────────────────────────────────

export default function BidsView() {
  const qc = useQueryClient();
  const [modalBid, setModalBid] = useState<Bid | null | 'new'>(null);
  const [tab, setTab] = useState<'board' | 'guide'>('board');

  const { data, isLoading } = useQuery({
    queryKey: ['bids'],
    queryFn: () => api.getBids(),
  });

  useEffect(() => {
    if (data?.bids?.length) requestBidNotifications(data.bids);
  }, [data?.bids?.length]);

  const { data: summary } = useQuery({
    queryKey: ['bids-summary'],
    queryFn: () => api.getBidSummary(),
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (bid: Partial<Bid>) => api.createBid(bid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bids'] }); qc.invalidateQueries({ queryKey: ['bids-summary'] }); setModalBid(null); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<Bid> }) => api.updateBid(id, updates),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bids'] }); qc.invalidateQueries({ queryKey: ['bids-summary'] }); setModalBid(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteBid(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bids'] }); qc.invalidateQueries({ queryKey: ['bids-summary'] }); },
  });

  const bids = data?.bids ?? [];
  const saving = createMut.isPending || updateMut.isPending;

  function handleSave(formData: Partial<Bid>) {
    if (modalBid === 'new') {
      createMut.mutate(formData);
    } else if (modalBid) {
      updateMut.mutate({ id: modalBid.id, updates: formData });
    }
  }

  function handleStatusChange(id: number, status: BidStatus) {
    updateMut.mutate({ id, updates: { status } });
  }

  function handleDelete(id: number) {
    if (confirm('Delete this bid? This cannot be undone.')) {
      deleteMut.mutate(id);
    }
  }

  const colBids = (status: BidStatus) =>
    bids.filter((b) =>
      status === 'lost' ? b.status === 'lost' || b.status === 'no_bid' : b.status === status
    );

  const totalPipeline = bids
    .filter((b) => !['lost', 'no_bid'].includes(b.status))
    .reduce((s, b) => s + (b.estimated_value ?? 0), 0);

  return (
    <div className="bids-root">
      {/* Header */}
      <div className="bids-header">
        <div>
          <h1 className="bids-title">Bid Tracker</h1>
          <p className="bids-sub">Track GC bid opportunities from discovery through award</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalBid('new')}>
          + Log Bid
        </button>
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="bids-summary">
          <div className="bids-stat">
            <div className="bids-stat-val">{summary.active}</div>
            <div className="bids-stat-label">active bids</div>
          </div>
          <div className="bids-stat">
            <div className="bids-stat-val">{summary.submitted}</div>
            <div className="bids-stat-label">submitted</div>
          </div>
          <div className="bids-stat bids-stat-green">
            <div className="bids-stat-val">{summary.won}</div>
            <div className="bids-stat-label">won</div>
          </div>
          {totalPipeline > 0 && (
            <div className="bids-stat bids-stat-primary">
              <div className="bids-stat-val">
                {totalPipeline >= 1_000_000
                  ? `$${(totalPipeline / 1_000_000).toFixed(1)}M`
                  : `$${(totalPipeline / 1_000).toFixed(0)}K`}
              </div>
              <div className="bids-stat-label">pipeline value</div>
            </div>
          )}
          {summary.won_value > 0 && (
            <div className="bids-stat bids-stat-won">
              <div className="bids-stat-val">
                {summary.won_value >= 1_000_000
                  ? `$${(summary.won_value / 1_000_000).toFixed(1)}M`
                  : `$${(summary.won_value / 1_000).toFixed(0)}K`}
              </div>
              <div className="bids-stat-label">won revenue</div>
            </div>
          )}
          {summary.overdue_bids > 0 && (
            <div className="bids-stat bids-stat-warn">
              <div className="bids-stat-val">{summary.overdue_bids}</div>
              <div className="bids-stat-label">overdue</div>
            </div>
          )}
        </div>
      )}

      {/* Tab nav */}
      <div className="bids-tabs">
        <button className={`bids-tab${tab === 'board' ? ' active' : ''}`} onClick={() => setTab('board')}>
          Kanban Board
        </button>
        <button className={`bids-tab${tab === 'guide' ? ' active' : ''}`} onClick={() => setTab('guide')}>
          Where to Find Bids
        </button>
      </div>

      {tab === 'guide' ? (
        <PlatformGuide />
      ) : isLoading ? (
        <div className="pv-loading">
          <span className="spinner spinner-lg" />
          <span>Loading bids…</span>
        </div>
      ) : (
        <div className="bid-board">
          {COLUMNS.map((col) => (
            <BidColumn
              key={col.status}
              status={col.status}
              label={col.label}
              color={col.color}
              bids={colBids(col.status)}
              onEdit={setModalBid}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalBid !== null && (
        <BidModal
          bid={modalBid === 'new' ? undefined : modalBid}
          onClose={() => setModalBid(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}
