import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { InstalledJob, VehicleType, LeadCategory, JobPhoto } from '../../api/types';
import { VEHICLE_TYPE_LABELS, CATEGORIES } from '../../api/types';

// ── Social Post Generator ─────────────────────────────────────────────────────

function SocialPostPanel({ job }: { job: InstalledJob }) {
  const [posts, setPosts] = useState<{ instagram: string; linkedin: string } | null>(null);
  const [copiedIG, setCopiedIG] = useState(false);
  const [copiedLI, setCopiedLI] = useState(false);

  const genMut = useMutation({
    mutationFn: () => api.generateSocialPost({
      company: job.company,
      vehicle_type: job.vehicle_type,
      vehicle_count: job.vehicle_count,
      wrap_category: job.wrap_category,
      material: job.material ?? undefined,
      notes: job.notes ?? undefined,
    }),
    onSuccess: (data) => setPosts(data.posts),
  });

  function copy(text: string, which: 'ig' | 'li') {
    navigator.clipboard.writeText(text);
    if (which === 'ig') { setCopiedIG(true); setTimeout(() => setCopiedIG(false), 2000); }
    else { setCopiedLI(true); setTimeout(() => setCopiedLI(false), 2000); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
        Generate ready-to-post Instagram and LinkedIn captions for this completed job.
      </p>
      {!posts && (
        <button
          className="btn btn-primary"
          style={{ alignSelf: 'flex-start' }}
          disabled={genMut.isPending}
          onClick={() => genMut.mutate()}
        >
          {genMut.isPending ? 'Generating…' : '✨ Generate Social Posts'}
        </button>
      )}
      {posts && (
        <>
          <div className="social-post-card">
            <div className="social-post-platform">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
              Instagram
            </div>
            <div className="social-post-text">{posts.instagram}</div>
            <div className="social-post-actions">
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => copy(posts.instagram, 'ig')}>
                {copiedIG ? '✓ Copied!' : '📋 Copy'}
              </button>
              <button className="btn" style={{ fontSize: 11 }} onClick={() => genMut.mutate()}>↺ Regenerate</button>
            </div>
          </div>
          <div className="social-post-card">
            <div className="social-post-platform">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              LinkedIn
            </div>
            <div className="social-post-text">{posts.linkedin}</div>
            <div className="social-post-actions">
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => copy(posts.linkedin, 'li')}>
                {copiedLI ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Photo Gallery (inside job modal) ─────────────────────────────────────────

function PhotoGallery({ jobId }: { jobId: number }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [photoType, setPhotoType] = useState<string>('before');
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['job-photos', jobId],
    queryFn: () => api.getJobPhotos(jobId),
    staleTime: 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: (photoId: number) => api.deleteJobPhoto(photoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-photos', jobId] }),
  });

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      await api.uploadJobPhoto(jobId, file, caption, photoType);
      qc.invalidateQueries({ queryKey: ['job-photos', jobId] });
      setCaption('');
    } finally {
      setUploading(false);
    }
  }

  const photos: JobPhoto[] = data?.photos ?? [];
  const TYPE_COLORS: Record<string, string> = { before: '#f59e0b', after: '#22c55e', detail: '#6366f1', other: '#6b7280' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
          <label className="field-label">Type</label>
          <select className="input" value={photoType} onChange={(e) => setPhotoType(e.target.value)}>
            <option value="before">Before</option>
            <option value="after">After</option>
            <option value="detail">Detail</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field-group" style={{ flex: 2, minWidth: 160 }}>
          <label className="field-label">Caption (optional)</label>
          <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Driver side — finished" />
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : '+ Add Photo'}
          </button>
        </div>
      </div>

      {isLoading && <div className="pv-loading"><span className="spinner" /></div>}
      {!isLoading && photos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          No photos yet. Add before and after shots to document the job.
        </div>
      )}

      <div className="photo-grid">
        {photos.map((p) => (
          <div key={p.id} className="photo-card">
            <img src={p.image_data} alt={p.caption || p.photo_type} className="photo-card-img" />
            <div className="photo-card-overlay">
              <span className="photo-type-badge" style={{ background: TYPE_COLORS[p.photo_type] ?? '#6b7280' }}>
                {p.photo_type}
              </span>
              {p.caption && <span className="photo-caption">{p.caption}</span>}
              <button className="photo-delete" onClick={() => deleteMut.mutate(p.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Job Form Modal ────────────────────────────────────────────────────────────

interface JobModalProps {
  job: InstalledJob | 'new';
  onClose: () => void;
}

function JobModal({ job, onClose }: JobModalProps) {
  const isNew = job === 'new';
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'details' | 'photos' | 'social'>('details');
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
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isNew ? 'Log Completed Job' : 'Edit Job'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {!isNew && (
          <div className="jobs-tabs" style={{ margin: '0 24px', borderBottom: '1px solid var(--border)' }}>
            <button className={`jobs-tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>Details</button>
            <button className={`jobs-tab ${activeTab === 'photos' ? 'active' : ''}`} onClick={() => setActiveTab('photos')}>📷 Photos</button>
            <button className={`jobs-tab ${activeTab === 'social' ? 'active' : ''}`} onClick={() => setActiveTab('social')}>✨ Social</button>
          </div>
        )}
        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(!isNew && activeTab === 'photos') ? (
          <PhotoGallery jobId={(job as InstalledJob).id} />
        ) : (!isNew && activeTab === 'social') ? (
          <SocialPostPanel job={job as InstalledJob} />
        ) : (
          <>
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
          </>
        )}
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
