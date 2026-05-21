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

const WIN_PROB: Partial<Record<BidStatus, number>> = {
  tracking: 15, submitted: 30, shortlisted: 65,
};

const WIN_PROB_COLOR = (p: number) =>
  p >= 60 ? { bg: 'rgba(34,197,94,0.15)', fg: '#22c55e' }
  : p >= 25 ? { bg: 'rgba(99,102,241,0.15)', fg: '#6366f1' }
  : { bg: 'rgba(107,114,128,0.12)', fg: '#9ca3af' };

interface BidCardProps {
  bid: Bid;
  onEdit: (b: Bid) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: BidStatus) => void;
}

function BidCard({ bid, onEdit, onDelete, onStatusChange }: BidCardProps) {
  const [confirmDel, setConfirmDel] = useState(false);
  const days = daysUntil(bid.bid_due);
  const isOverdue = days !== null && days < 0 && !['won', 'lost', 'no_bid'].includes(bid.status);
  const isUrgent  = days !== null && days >= 0 && days <= 3 && !['won', 'lost', 'no_bid'].includes(bid.status);
  const winProb = WIN_PROB[bid.status];
  const probStyle = winProb !== undefined ? WIN_PROB_COLOR(winProb) : null;

  return (
    <div className={`bid-card${isOverdue ? ' bid-card-overdue' : isUrgent ? ' bid-card-urgent' : ''}`}>
      <div className="bid-card-header">
        <span className="bid-card-type">{PROJECT_TYPE_LABELS[bid.project_type]}</span>
        <div className="bid-card-actions">
          {confirmDel ? (
            <>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 2 }}>Delete?</span>
              <button className="bid-card-btn bid-card-btn-del" onClick={() => onDelete(bid.id)} title="Confirm delete">Yes</button>
              <button className="bid-card-btn" onClick={() => setConfirmDel(false)} title="Cancel">No</button>
            </>
          ) : (
            <>
              <button className="bid-card-btn" onClick={() => api.openQuote(bid.id)} title="Preview Quote">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </button>
              <button className="bid-card-btn" onClick={() => onEdit(bid)} title="Edit">✎</button>
              <button className="bid-card-btn bid-card-btn-del" onClick={() => setConfirmDel(true)} title="Delete">✕</button>
            </>
          )}
        </div>
      </div>

      <div className="bid-card-name">{bid.project_name}</div>

      {bid.gc_name && (
        <div className="bid-card-meta">
          <span className="bid-meta-icon"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg></span> {bid.gc_name}
        </div>
      )}
      {bid.architect && (
        <div className="bid-card-meta">
          <span className="bid-meta-icon"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span> {bid.architect}
        </div>
      )}
      {bid.source_platform && (
        <div className="bid-card-meta bid-card-platform">
          {PLATFORM_LABELS[bid.source_platform] ?? bid.source_platform}
        </div>
      )}

      {bid.notes && (
        <div className="bid-card-notes-preview">
          {bid.notes.length > 90 ? bid.notes.slice(0, 90) + '…' : bid.notes}
        </div>
      )}

      <div className="bid-card-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {bid.estimated_value ? (
            <span className="bid-card-value">{fmt(bid.estimated_value)}</span>
          ) : (
            <span className="bid-card-value-empty">No value set</span>
          )}
          {probStyle && winProb !== undefined && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
              background: probStyle.bg, color: probStyle.fg,
            }}>
              {winProb}% win
            </span>
          )}
        </div>
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
        <button className="bid-submit-btn" onClick={() => onStatusChange(bid.id, 'submitted')}>
          Mark Submitted →
        </button>
      )}
      {bid.status === 'submitted' && (
        <button className="bid-submit-btn" onClick={() => onStatusChange(bid.id, 'shortlisted')}>
          Mark Shortlisted →
        </button>
      )}
      {bid.status === 'shortlisted' && (
        <div className="bid-advance-btns">
          <button
            className="bid-advance-btn bid-advance-won"
            onClick={() => onStatusChange(bid.id, 'won')}
          >
            Won ✓
          </button>
          <button
            className="bid-advance-btn bid-advance-lost"
            onClick={() => onStatusChange(bid.id, 'lost')}
          >
            Lost ✗
          </button>
        </div>
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

// ── Bid Intelligence Panel ────────────────────────────────────────────────────
const STAGE_COLORS_BID: Record<string, string> = {
  tracking: '#6366f1', submitted: '#3b82f6', shortlisted: '#f59e0b', won: '#22c55e',
};
const PLATFORM_SHORT: Record<string, string> = {
  building_connected: 'BuildConn.', isqft: 'iSqFt', planhub: 'PlanHub',
  sam_gov: 'SAM.gov', indot: 'INDOT', direct: 'Direct', other: 'Other',
};

function BidIntelPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['bid-intel'],
    queryFn: () => api.getBidIntel(),
    staleTime: 60_000,
  });

  if (isLoading || !data) return null;
  const { funnel, winRate, shortlistToWin, platforms, valueBuckets } = data;

  const hasFunnelData = funnel.some((f) => f.count > 0);
  if (!hasFunnelData && platforms.length === 0) return null;

  const maxFunnel = Math.max(...funnel.map((f) => f.count), 1);
  const maxBucket = Math.max(...valueBuckets.map((b) => b.total), 1);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14,
      padding: '14px 16px', background: 'var(--surface)', borderRadius: 10,
      border: '1px solid var(--border)', margin: '0 0 16px',
    }}>

      {/* Stage Funnel */}
      {hasFunnelData && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Stage Funnel
          </div>
          {funnel.map((f) => {
            const color = STAGE_COLORS_BID[f.stage] ?? '#6b7280';
            const pct = (f.count / maxFunnel) * 100;
            return (
              <div key={f.stage} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: 'var(--text)', textTransform: 'capitalize', fontWeight: 500 }}>{f.stage}</span>
                  <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{f.count}</span>
                </div>
                <div style={{ height: 5, background: 'var(--border)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 11, flexWrap: 'wrap' }}>
            {winRate !== null && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Overall win rate </span>
                <strong style={{ color: winRate >= 40 ? '#10b981' : winRate >= 20 ? '#f59e0b' : '#ef4444' }}>{winRate}%</strong>
              </div>
            )}
            {shortlistToWin !== null && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Shortlisted → won </span>
                <strong style={{ color: '#10b981' }}>{shortlistToWin}%</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Platform Performance */}
      {platforms.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Best Platforms
          </div>
          {platforms.slice(0, 5).map((p) => (
            <div key={p.platform} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 11, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {PLATFORM_SHORT[p.platform] ?? p.platform}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{p.won}/{p.total}</span>
              {p.winRate !== null && (
                <span style={{
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                  color: p.winRate >= 40 ? '#10b981' : p.winRate >= 20 ? '#f59e0b' : '#6b7280',
                }}>
                  {p.winRate}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Value Sweet Spot */}
      {valueBuckets.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Value Sweet Spot
          </div>
          {valueBuckets.map((b) => {
            const winPct = b.total > 0 ? Math.round((b.won / b.total) * 100) : 0;
            return (
              <div key={b.bucket} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{b.bucket}</span>
                  <span style={{ color: winPct >= 40 ? '#10b981' : 'var(--text-muted)', fontWeight: winPct >= 40 ? 700 : 400 }}>{winPct}% win</span>
                </div>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${(b.total / maxBucket) * 100}%`, background: 'var(--accent)', borderRadius: 99, opacity: 0.7 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
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
    deleteMut.mutate(id);
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

      {/* Bid Intelligence Panel */}
      <BidIntelPanel />

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
      ) : bids.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="8" y="16" width="14" height="36" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="25" y="24" width="14" height="28" rx="3" fill="currentColor" opacity="0.25" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="42" y="10" width="14" height="42" rx="3" fill="currentColor" opacity="0.4" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="15" cy="13" r="4" fill="currentColor" opacity="0.6"/>
              <circle cx="32" cy="21" r="4" fill="currentColor" opacity="0.6"/>
              <circle cx="49" cy="7" r="4" fill="currentColor"/>
            </svg>
          </div>
          <h3 className="empty-state-title">No bids tracked yet</h3>
          <p className="empty-state-sub">
            Track GC bid opportunities from discovery through award — BuildingConnected,
            iSqFt, PlanHub, SAM.gov, and more. Log a bid to start building your pipeline.
          </p>
          <div className="empty-state-actions">
            <button className="btn btn-primary" onClick={() => setModalBid('new')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>
              Log Your First Bid
            </button>
            <button className="btn" onClick={() => setTab('guide')}>
              Browse Platforms →
            </button>
          </div>
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
