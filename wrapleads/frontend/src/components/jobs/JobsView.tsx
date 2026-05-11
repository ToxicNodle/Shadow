import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { InstalledJob, VehicleType, LeadCategory } from '../../api/types';
import { VEHICLE_TYPE_LABELS, CATEGORIES } from '../../api/types';

// ── Job Form Modal ────────────────────────────────────────────────────────────

interface JobModalProps {
  job: InstalledJob | 'new';
  onClose: () => void;
}

function JobModal({ job, onClose }: JobModalProps) {
  const isNew = job === 'new';
  const qc = useQueryClient();
  const [form, setForm] = useState({
    company: isNew ? '' : (job as InstalledJob).company,
    vehicle_type: (isNew ? 'cargo_van_standard' : (job as InstalledJob).vehicle_type) as VehicleType,
    vehicle_count: isNew ? 1 : (job as InstalledJob).vehicle_count,
    wrap_category: (isNew ? 'fleet' : (job as InstalledJob).wrap_category) as LeadCategory,
    material: isNew ? '' : ((job as InstalledJob).material ?? ''),
    install_date: isNew ? new Date().toISOString().split('T')[0] : (job as InstalledJob).install_date.split('T')[0],
    life_years: isNew ? 5 : (job as InstalledJob).life_years,
    notes: isNew ? '' : ((job as InstalledJob).notes ?? ''),
  });

  const createMut = useMutation({
    mutationFn: () => api.createJob(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); onClose(); },
  });
  const updateMut = useMutation({
    mutationFn: () => api.updateJob((job as InstalledJob).id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); onClose(); },
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteJob((job as InstalledJob).id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); onClose(); },
  });

  const f = (k: keyof typeof form) => ({
    value: String(form[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((s) => ({ ...s, [k]: e.target.value })),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isNew ? 'Log Completed Job' : 'Edit Job'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Company</label>
              <input className="input" {...f('company')} placeholder="John's Logistics" />
            </div>
            <div className="field-group">
              <label className="field-label">Vehicle Count</label>
              <input className="input" type="number" min={1} {...f('vehicle_count')} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Vehicle Type</label>
              <select className="input" value={form.vehicle_type} onChange={(e) => setForm((s) => ({ ...s, vehicle_type: e.target.value as VehicleType }))}>
                {Object.entries(VEHICLE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Category</label>
              <select className="input" value={form.wrap_category} onChange={(e) => setForm((s) => ({ ...s, wrap_category: e.target.value as LeadCategory }))}>
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Install Date</label>
              <input className="input" type="date" {...f('install_date')} />
            </div>
            <div className="field-group">
              <label className="field-label">Expected Lifespan</label>
              <select className="input" value={form.life_years} onChange={(e) => setForm((s) => ({ ...s, life_years: Number(e.target.value) }))}>
                <option value={3}>3 years</option>
                <option value={4}>4 years</option>
                <option value={5}>5 years (default)</option>
                <option value={7}>7 years</option>
              </select>
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">Material</label>
            <input className="input" {...f('material')} placeholder="3M 1080, Avery 900, Arlon 3000…" />
          </div>
          <div className="field-group">
            <label className="field-label">Notes</label>
            <textarea className="input" rows={2} {...f('notes')} placeholder="Any notes about the job…" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            {!isNew && (
              <button className="btn" style={{ color: 'var(--red)', marginRight: 'auto' }}
                onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
                Delete
              </button>
            )}
            <button className="btn" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={!form.company || createMut.isPending || updateMut.isPending}
              onClick={() => isNew ? createMut.mutate() : updateMut.mutate()}
            >
              {isNew ? 'Log Job' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Aging Job Card ────────────────────────────────────────────────────────────

function urgencyClass(days: number | undefined) {
  if (days === undefined || days < 0) return 'jobs-expiry-red';
  if (days < 30) return 'jobs-expiry-orange';
  if (days < 90) return 'jobs-expiry-yellow';
  return 'jobs-expiry-green';
}

function expiryLabel(days: number | undefined) {
  if (days === undefined) return '';
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  return `${days}d until refresh`;
}

// ── Main JobsView ─────────────────────────────────────────────────────────────

export default function JobsView() {
  const [tab, setTab] = useState<'all' | 'aging'>('all');
  const [modal, setModal] = useState<InstalledJob | 'new' | null>(null);
  const qc = useQueryClient();

  const { data: allData, isLoading: loadingAll } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.getJobs(),
    staleTime: 60_000,
  });
  const { data: agingData, isLoading: loadingAging } = useQuery({
    queryKey: ['jobs', 'aging'],
    queryFn: () => api.getAgingJobs(),
    staleTime: 60_000,
  });

  const jobs = tab === 'all' ? (allData?.jobs ?? []) : (agingData?.jobs ?? []);
  const isLoading = tab === 'all' ? loadingAll : loadingAging;

  const totalVehicles = allData?.jobs.reduce((s, j) => s + j.vehicle_count, 0) ?? 0;
  const agingCount = agingData?.jobs.length ?? 0;

  async function reEngage(job: InstalledJob) {
    if (!job.lead_id) return;
    await api.logActivity(job.lead_id, {
      type: 'note_added',
      subject: 'Wrap Refresh Reminder',
      body: `Wrap installed ${job.install_date.split('T')[0]} on ${job.vehicle_count} ${VEHICLE_TYPE_LABELS[job.vehicle_type as VehicleType] ?? job.vehicle_type}(s) is approaching refresh window (${job.life_years} year lifespan). Follow up about renewal.`,
    });
    await api.updateLead(job.lead_id, { followupDueAt: new Date().toISOString().split('T')[0] } as any);
    qc.invalidateQueries({ queryKey: ['leads'] });
  }

  return (
    <div className="jobs-root">
      <div className="jobs-header">
        <div>
          <h1 className="jobs-title">Wrap Lifecycle Tracker</h1>
          <p className="jobs-sub">Track every install. Surface re-order opportunities automatically.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>
          + Log Completed Job
        </button>
      </div>

      <div className="jobs-stats">
        <div className="jobs-stat">
          <span className="jobs-stat-val">{allData?.jobs.length ?? 0}</span>
          <span className="jobs-stat-label">Jobs Logged</span>
        </div>
        <div className="jobs-stat">
          <span className="jobs-stat-val">{totalVehicles}</span>
          <span className="jobs-stat-label">Vehicles Wrapped</span>
        </div>
        <div className={`jobs-stat ${agingCount > 0 ? 'jobs-stat-alert' : ''}`}>
          <span className="jobs-stat-val">{agingCount}</span>
          <span className="jobs-stat-label">Aging / Expiring</span>
        </div>
      </div>

      <div className="jobs-tabs">
        <button className={`jobs-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          All Jobs
        </button>
        <button className={`jobs-tab ${tab === 'aging' ? 'active' : ''}`} onClick={() => setTab('aging')}>
          Aging Alerts {agingCount > 0 && <span className="jobs-tab-badge">{agingCount}</span>}
        </button>
      </div>

      {isLoading && (
        <div className="pv-loading"><span className="spinner" /><span>Loading jobs…</span></div>
      )}

      {!isLoading && jobs.length === 0 && (
        <div className="jobs-empty">
          {tab === 'aging'
            ? <><div className="jobs-empty-icon">✅</div><p>No wraps expiring in the next 90 days.</p></>
            : <><div className="jobs-empty-icon">📋</div><p>No jobs logged yet.</p><p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Log your first completed install to start tracking the wrap lifecycle.</p></>
          }
        </div>
      )}

      {!isLoading && jobs.length > 0 && (
        <div className="jobs-list">
          {jobs.map((job) => (
            <div key={job.id} className="jobs-row" onClick={() => setModal(job)}>
              <div className="jobs-row-main">
                <span className="jobs-row-company">{job.company}</span>
                <span className="jobs-row-meta">
                  {job.vehicle_count} × {VEHICLE_TYPE_LABELS[job.vehicle_type as VehicleType] ?? job.vehicle_type}
                  {' · '}{CATEGORIES[job.wrap_category as keyof typeof CATEGORIES] ?? job.wrap_category}
                  {job.material && ` · ${job.material}`}
                </span>
                <span className="jobs-row-date">Installed {job.install_date.split('T')[0]} · {job.life_years}yr lifespan</span>
              </div>
              <div className="jobs-row-right">
                <span className={`jobs-expiry-badge ${urgencyClass(job.days_until_expiry)}`}>
                  {expiryLabel(job.days_until_expiry)}
                </span>
                {job.lead_id && (job.days_until_expiry === undefined || job.days_until_expiry <= 90) && (
                  <button
                    className="btn"
                    style={{ fontSize: 11 }}
                    onClick={(e) => { e.stopPropagation(); reEngage(job); }}
                  >
                    Re-engage
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <JobModal job={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
