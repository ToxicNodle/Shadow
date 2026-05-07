import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

function daysAgo(d: string | null | undefined) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

function daysUntil(d: string | null | undefined) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function today() {
  const d = new Date();
  return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ── Bulk Activate Panel ───────────────────────────────────────────────────────

interface BulkPanelProps {
  leads: { id: number; company: string; category: string }[];
  onDone: () => void;
}

function BulkActivatePanel({ leads, onDone }: BulkPanelProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set(leads.map((l) => l.id)));
  const [tone, setTone] = useState('professional');
  const [result, setResult] = useState<{ queued: number; failed: number } | null>(null);
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => api.bulkActivateSequences([...selected], tone),
    onSuccess: (data) => {
      setResult({ queued: data.queued, failed: data.failed });
      qc.invalidateQueries({ queryKey: ['mission'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const toggle = (id: number) => setSelected((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  if (result) {
    return (
      <div className="mission-bulk-result">
        <div className="mission-bulk-result-icon">🚀</div>
        <div className="mission-bulk-result-text">
          <strong>{result.queued} drip sequences activated.</strong>
          {result.failed > 0 && ` (${result.failed} skipped — no email on file)`}
        </div>
        <button className="btn btn-primary" onClick={onDone}>Done</button>
      </div>
    );
  }

  return (
    <div className="mission-bulk-panel">
      <div className="mission-bulk-header">
        <span className="mission-bulk-title">Activate Drip Sequences</span>
        <div className="mission-bulk-controls">
          <select className="form-control" style={{ width: 160 }} value={tone} onChange={(e) => setTone(e.target.value)}>
            <option value="professional">Professional</option>
            <option value="casual">Casual / Friendly</option>
            <option value="direct">Direct / Bold</option>
            <option value="local">Local / Community</option>
          </select>
          <button className="btn" onClick={() => setSelected(new Set(leads.map((l) => l.id)))}>All</button>
          <button className="btn" onClick={() => setSelected(new Set())}>None</button>
        </div>
      </div>
      <div className="mission-bulk-list">
        {leads.map((l) => (
          <label key={l.id} className="mission-bulk-item">
            <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
            <span className="mission-bulk-company">{l.company}</span>
            <span className="mission-bulk-cat">{l.category}</span>
          </label>
        ))}
      </div>
      <div className="mission-bulk-footer">
        <span className="mission-bulk-count">{selected.size} selected</span>
        <button className="btn" onClick={onDone}>Cancel</button>
        <button
          className="btn btn-primary"
          disabled={selected.size === 0 || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? `Activating ${selected.size}…` : `🚀 Activate ${selected.size} Sequences`}
        </button>
      </div>
    </div>
  );
}

// ── Main MissionView ──────────────────────────────────────────────────────────

export default function MissionView() {
  const setMode = useAppStore((s) => s.setMode);
  const setFilter = useAppStore((s) => s.setFilter);
  const [showBulk, setShowBulk] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mission'],
    queryFn: () => api.getMission(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  function goToLead(leadId: number) {
    // navigate to leads mode — the lead will be in the list
    setMode('leads');
  }

  function goToLeadsFiltered(status?: string, category?: string) {
    setFilter({
      status: (status as any) ?? 'all',
      category: (category as any) ?? 'all',
      state: '', search: '',
    });
    setMode('leads');
  }

  if (isLoading || !data) {
    return (
      <div className="pv-loading">
        <span className="spinner spinner-lg" />
        <span>Building your mission briefing…</span>
      </div>
    );
  }

  const { overdue, newWithEmail, replied, bidsThisWeek, sequences, wonThisMonth } = data;
  const totalActions = overdue.length + replied.length + bidsThisWeek.length;
  const hasBulkTargets = newWithEmail.length > 0;

  return (
    <div className="mission-root">
      {/* ── Header ── */}
      <div className="mission-header">
        <div>
          <div className="mission-date">{today()}</div>
          <h1 className="mission-title">
            {totalActions === 0 && newWithEmail.length === 0
              ? "You're all caught up 🏆"
              : totalActions === 0
              ? `${newWithEmail.length} leads ready to activate`
              : `${totalActions} action${totalActions !== 1 ? 's' : ''} need your attention`}
          </h1>
          <p className="mission-sub">
            {sequences.active} active drip sequences · {sequences.pendingEmails} emails queued · {wonThisMonth} won this month
          </p>
        </div>
        <button className="btn" onClick={() => refetch()}>↻ Refresh</button>
      </div>

      <div className="mission-grid">

        {/* ── Overdue Follow-ups ── */}
        {overdue.length > 0 && (
          <section className="mission-card mission-card-urgent">
            <div className="mission-card-header">
              <span className="mission-card-icon">⚠</span>
              <span className="mission-card-title">Overdue Follow-ups</span>
              <span className="mission-badge mission-badge-red">{overdue.length}</span>
            </div>
            <div className="mission-items">
              {overdue.map((l) => {
                const ago = daysAgo(l.followup_due_at);
                return (
                  <div key={l.id} className="mission-item">
                    <div className="mission-item-info">
                      <span className="mission-item-company">{l.company}</span>
                      <span className="mission-item-meta">{ago}d overdue · {l.category}</span>
                    </div>
                    <div className="mission-item-actions">
                      <button className="mission-action-btn" onClick={() => goToLead(l.id)}>
                        View →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="mission-card-footer-btn" onClick={() => goToLeadsFiltered('contacted')}>
              View all contacted leads →
            </button>
          </section>
        )}

        {/* ── Replied Leads (need proposals) ── */}
        {replied.length > 0 && (
          <section className="mission-card mission-card-hot">
            <div className="mission-card-header">
              <span className="mission-card-icon">💬</span>
              <span className="mission-card-title">Replied — Send Proposals</span>
              <span className="mission-badge mission-badge-amber">{replied.length}</span>
            </div>
            <div className="mission-items">
              {replied.map((l) => {
                const ago = daysAgo(l.last_contacted);
                return (
                  <div key={l.id} className="mission-item">
                    <div className="mission-item-info">
                      <span className="mission-item-company">{l.company}</span>
                      <span className="mission-item-meta">{ago !== null ? `${ago}d ago` : ''} · {l.category}</span>
                    </div>
                    <button className="mission-action-btn mission-action-primary" onClick={() => goToLead(l.id)}>
                      Propose →
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Bids Due This Week ── */}
        {bidsThisWeek.length > 0 && (
          <section className="mission-card mission-card-deadline">
            <div className="mission-card-header">
              <span className="mission-card-icon">🏗</span>
              <span className="mission-card-title">Bids Due This Week</span>
              <span className="mission-badge mission-badge-blue">{bidsThisWeek.length}</span>
            </div>
            <div className="mission-items">
              {bidsThisWeek.map((b) => {
                const days = daysUntil(b.bid_due);
                return (
                  <div key={b.id} className="mission-item">
                    <div className="mission-item-info">
                      <span className="mission-item-company">{b.project_name}</span>
                      <span className="mission-item-meta">
                        {b.gc_name} · {days === 0 ? 'Due TODAY' : `${days}d left`}
                        {b.estimated_value ? ` · ${fmt(b.estimated_value)}` : ''}
                      </span>
                    </div>
                    <button className="mission-action-btn" onClick={() => setMode('bids')}>
                      Track →
                    </button>
                  </div>
                );
              })}
            </div>
            <button className="mission-card-footer-btn" onClick={() => setMode('bids')}>
              Open Bid Tracker →
            </button>
          </section>
        )}

        {/* ── Bulk Activate / New Leads ── */}
        {hasBulkTargets && !showBulk && (
          <section className="mission-card mission-card-activate">
            <div className="mission-card-header">
              <span className="mission-card-icon">🚀</span>
              <span className="mission-card-title">Ready to Activate</span>
              <span className="mission-badge mission-badge-purple">{newWithEmail.length}</span>
            </div>
            <p className="mission-card-desc">
              {newWithEmail.length} leads have emails on file with no active drip sequence.
              Activate all at once — AI writes each sequence automatically.
            </p>
            <div className="mission-activate-preview">
              {newWithEmail.slice(0, 4).map((l) => (
                <span key={l.id} className="mission-preview-chip">{l.company}</span>
              ))}
              {newWithEmail.length > 4 && (
                <span className="mission-preview-chip mission-preview-more">+{newWithEmail.length - 4} more</span>
              )}
            </div>
            <button className="btn btn-primary mission-activate-btn" onClick={() => setShowBulk(true)}>
              🚀 Activate {newWithEmail.length} Sequences Now
            </button>
          </section>
        )}

        {showBulk && (
          <section className="mission-card mission-card-activate" style={{ gridColumn: '1 / -1' }}>
            <BulkActivatePanel
              leads={newWithEmail}
              onDone={() => { setShowBulk(false); refetch(); }}
            />
          </section>
        )}

        {/* ── Stats strip ── */}
        <section className="mission-stats-row">
          <div className="mission-stat-card" onClick={() => goToLeadsFiltered('won')} role="button">
            <div className="mission-stat-val mission-stat-green">{wonThisMonth}</div>
            <div className="mission-stat-label">won this month</div>
          </div>
          <div className="mission-stat-card">
            <div className="mission-stat-val mission-stat-blue">{sequences.active}</div>
            <div className="mission-stat-label">active drip sequences</div>
          </div>
          <div className="mission-stat-card">
            <div className="mission-stat-val">{sequences.pendingEmails}</div>
            <div className="mission-stat-label">emails queued</div>
          </div>
          <div className="mission-stat-card" onClick={() => goToLeadsFiltered('new')} role="button">
            <div className="mission-stat-val mission-stat-purple">{newWithEmail.length}</div>
            <div className="mission-stat-label">new leads w/ email</div>
          </div>
        </section>

        {/* ── All clear ── */}
        {totalActions === 0 && !hasBulkTargets && (
          <section className="mission-card mission-all-clear">
            <div className="mission-all-clear-icon">🏆</div>
            <h2 className="mission-all-clear-title">Pipeline is clean.</h2>
            <p className="mission-all-clear-sub">No overdue follow-ups, no pending bids, no unworked leads.</p>
            <div className="mission-all-clear-actions">
              <button className="btn btn-primary" onClick={() => setMode('discover')}>Browse Discover</button>
              <button className="btn" onClick={() => setMode('leads')}>View All Leads</button>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
