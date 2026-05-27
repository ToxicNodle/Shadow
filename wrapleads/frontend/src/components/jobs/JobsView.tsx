import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { InstalledJob, VehicleType, LeadCategory, JobPhoto } from '../../api/types';
import { VEHICLE_TYPE_LABELS, CATEGORIES } from '../../api/types';
import MaterialCatalogModal from '../modals/MaterialCatalogModal';
import FleetAgingMap from './FleetAgingMap';

// ── Case Study Generator ──────────────────────────────────────────────────────
function CaseStudyPanel({ job }: { job: InstalledJob }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const showToast = useAppStore((s) => s.showToast);

  const { data, isLoading } = useQuery({
    queryKey: ['case-study', job.id],
    queryFn: () => api.getCaseStudy(job.id),
    staleTime: 5 * 60_000,
  });

  const genMut = useMutation({
    mutationFn: () => api.generateCaseStudy(job.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['case-study', job.id] }); showToast('Case study generated!'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const cs = data?.caseStudy;

  function copyText() {
    if (!cs) return;
    const stats = cs.stats_json;
    const text = [
      cs.headline.toUpperCase(),
      '',
      cs.narrative,
      '',
      `── STATS ──`,
      `Vehicles wrapped: ${stats?.vehicles ?? job.vehicle_count}`,
      `Installed: ${stats?.installMonth ?? job.install_date}`,
      `Wrap lifespan: ${stats?.lifespanYears ?? job.life_years} years`,
      `Est. annual impressions: ${(stats?.impressionsPerYear ?? 0).toLocaleString()}`,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Case study copied!');
    });
  }

  if (isLoading) {
    return <div className="loading"><span className="spinner" /></div>;
  }

  if (!cs) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No case study yet</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Claude will write a professional 3-paragraph case study from this job's data.
        </div>
        <button
          className="btn btn-primary"
          onClick={() => genMut.mutate()}
          disabled={genMut.isPending}
        >
          {genMut.isPending ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Generating…</> : '✦ Generate Case Study'}
        </button>
        {genMut.isError && <div className="error-box" style={{ marginTop: 10 }}>{(genMut.error as Error).message}</div>}
      </div>
    );
  }

  const stats = cs.stats_json;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        padding: '14px 16px', background: 'var(--surface)', borderRadius: 10,
        border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 10, lineHeight: 1.3 }}>{cs.headline}</div>
        <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{cs.narrative}</div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { val: stats?.vehicles ?? job.vehicle_count, label: 'Vehicles' },
          { val: `${stats?.lifespanYears ?? job.life_years}yr`, label: 'Lifespan' },
          { val: stats?.installMonth?.split(' ')?.[0] ?? '—', label: 'Month' },
          { val: `${Math.round((stats?.impressionsPerYear ?? 0) / 1_000_000 * 10) / 10}M`, label: 'Impr/yr' },
        ].map(({ val, label }) => (
          <div key={label} style={{ textAlign: 'center', padding: '8px', background: 'var(--bg-elev)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>{val}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Photos */}
      {cs.photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {cs.photos.slice(0, 4).map((p) => (
            <img key={p.id} src={p.url} alt={p.caption ?? ''} style={{ height: 80, width: 120, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={copyText}>
          {copied ? '✓ Copied!' : 'Copy Case Study'}
        </button>
        {cs.token && (
          <a
            href={`/case-studies/${cs.token}`}
            target="_blank"
            rel="noopener"
            className="btn"
            style={{ fontSize: 12 }}
            title="View public case study page"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Public Page
          </a>
        )}
        <button className="btn" style={{ fontSize: 12 }} onClick={() => genMut.mutate()} disabled={genMut.isPending}>
          {genMut.isPending ? <span className="spinner" style={{ width: 11, height: 11 }} /> : '↻ Regenerate'}
        </button>
      </div>
    </div>
  );
}

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
          {genMut.isPending ? 'Generating…' : 'Generate Social Posts'}
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
                {copiedIG ? '✓ Copied!' : 'Copy'}
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
                {copiedLI ? '✓ Copied!' : 'Copy'}
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
  const [uploadQueue, setUploadQueue] = useState<{ file: File; id: string; done: boolean }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['job-photos', jobId],
    queryFn: () => api.getJobPhotos(jobId),
    staleTime: 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: (photoId: number) => api.deleteJobPhoto(photoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-photos', jobId] }),
  });

  const uploadFiles = useCallback(async (files: File[]) => {
    const entries = files.map((f) => ({ file: f, id: Math.random().toString(36).slice(2), done: false }));
    setUploadQueue((q) => [...q, ...entries]);
    for (const entry of entries) {
      try {
        await api.uploadJobPhoto(jobId, entry.file, '', photoType);
        setUploadQueue((q) => q.map((e) => e.id === entry.id ? { ...e, done: true } : e));
      } catch { /* individual upload failure — non-fatal */ }
    }
    qc.invalidateQueries({ queryKey: ['job-photos', jobId] });
    setTimeout(() => setUploadQueue([]), 1200);
  }, [jobId, photoType, qc]);

  async function handleUpload(file: File) {
    await api.uploadJobPhoto(jobId, file, caption, photoType);
    qc.invalidateQueries({ queryKey: ['job-photos', jobId] });
    setCaption('');
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length) uploadFiles(files);
  }

  const photos: JobPhoto[] = data?.photos ?? [];
  const TYPE_COLORS: Record<string, string> = { before: '#f59e0b', after: '#22c55e', detail: '#6366f1', other: '#6b7280' };
  const uploading = uploadQueue.some((e) => !e.done);

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
          <label className="field-label">Caption (single upload only)</label>
          <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Driver side — finished" />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length === 1) handleUpload(files[0]);
              else if (files.length > 1) uploadFiles(files);
            }} />
          <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? `Uploading ${uploadQueue.filter((e) => !e.done).length}…` : '+ Add Photo(s)'}
          </button>
        </div>
      </div>

      {/* Drag-drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${isDragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 10, padding: '16px', textAlign: 'center', fontSize: 12,
          color: isDragOver ? 'var(--accent)' : 'var(--text-faint)',
          background: isDragOver ? 'rgba(244,85,28,.04)' : 'transparent',
          transition: 'all 0.15s ease', cursor: 'pointer',
        }}
        onClick={() => fileRef.current?.click()}
      >
        {uploadQueue.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {uploadQueue.map((e) => (
              <span key={e.id} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: e.done ? 'rgba(34,197,94,.15)' : 'rgba(244,85,28,.12)', color: e.done ? '#22c55e' : 'var(--accent)' }}>
                {e.done ? '✓' : '⋯'} {e.file.name.slice(0, 16)}
              </span>
            ))}
          </div>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 4, display: 'block', margin: '0 auto 6px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Drop images here or click to bulk upload
          </>
        )}
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
  const showToast = useAppStore((s) => s.showToast);
  const setMode = useAppStore((s) => s.setMode);
  const [activeTab, setActiveTab] = useState<'details' | 'photos' | 'social' | 'case-study'>('details');
  const [matCatalogOpen, setMatCatalogOpen] = useState(false);
  const [form, setForm] = useState({
    company: isNew ? '' : (job as InstalledJob).company,
    vehicle_type: (isNew ? 'cargo_van_standard' : (job as InstalledJob).vehicle_type) as VehicleType,
    vehicle_count: isNew ? 1 : (job as InstalledJob).vehicle_count,
    wrap_category: (isNew ? 'fleet' : (job as InstalledJob).wrap_category) as LeadCategory,
    material: isNew ? '' : ((job as InstalledJob).material ?? ''),
    install_date: isNew ? new Date().toISOString().split('T')[0] : (job as InstalledJob).install_date.split('T')[0],
    life_years: isNew ? 5 : (job as InstalledJob).life_years,
    notes: isNew ? '' : ((job as InstalledJob).notes ?? ''),
    job_revenue: isNew ? '' : String((job as InstalledJob).job_revenue ?? ''),
    material_cost: isNew ? '' : String((job as InstalledJob).material_cost ?? ''),
    labor_hours: isNew ? '' : String((job as InstalledJob).labor_hours ?? ''),
  });

  function formPayload() {
    return {
      ...form,
      job_revenue: form.job_revenue ? Number(form.job_revenue) : 0,
      material_cost: form.material_cost ? Number(form.material_cost) : 0,
      labor_hours: form.labor_hours ? Number(form.labor_hours) : 0,
    };
  }

  const createMut = useMutation({
    mutationFn: () => api.createJob(formPayload()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); onClose(); },
  });
  const updateMut = useMutation({
    mutationFn: () => api.updateJob((job as InstalledJob).id, formPayload()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); onClose(); },
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteJob((job as InstalledJob).id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); onClose(); },
  });

  const reorderMut = useMutation({
    mutationFn: () => api.createReorderLead((job as InstalledJob).id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      showToast(data.existing ? 'Re-order lead already exists — opening leads view' : 'Re-order lead created!', 'success');
      setMode('leads');
      onClose();
    },
    onError: (e: Error) => showToast(e.message, 'error'),
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
            <button className={`jobs-tab ${activeTab === 'photos' ? 'active' : ''}`} onClick={() => setActiveTab('photos')}>Photos</button>
            <button className={`jobs-tab ${activeTab === 'social' ? 'active' : ''}`} onClick={() => setActiveTab('social')}>Social Posts</button>
            <button className={`jobs-tab ${activeTab === 'case-study' ? 'active' : ''}`} onClick={() => setActiveTab('case-study')}>Case Study</button>
          </div>
        )}
        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(!isNew && activeTab === 'photos') ? (
          <PhotoGallery jobId={(job as InstalledJob).id} />
        ) : (!isNew && activeTab === 'social') ? (
          <SocialPostPanel job={job as InstalledJob} />
        ) : (!isNew && activeTab === 'case-study') ? (
          <CaseStudyPanel job={job as InstalledJob} />
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
            <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Material
              <button type="button" className="btn" style={{ fontSize: 10, padding: '2px 8px', marginLeft: 8 }} onClick={() => setMatCatalogOpen(true)}>Browse Catalog</button>
            </label>
            <input className="input" {...f('material')} placeholder="3M 1080, Avery 900, Arlon 3000…" />
          </div>
          {matCatalogOpen && (
            <MaterialCatalogModal
              onClose={() => setMatCatalogOpen(false)}
              onSelect={(name) => setForm((s) => ({ ...s, material: name }))}
            />
          )}
          <div className="field-group">
            <label className="field-label">Notes</label>
            <textarea className="input" rows={2} {...f('notes')} placeholder="Any notes about the job…" />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)', marginBottom: 10 }}>
              Margin Tracking (optional)
            </div>
            <div className="field-row">
              <div className="field-group">
                <label className="field-label">Job Revenue ($)</label>
                <input className="input" type="number" min={0} step={100} {...f('job_revenue')} placeholder="0" />
              </div>
              <div className="field-group">
                <label className="field-label">Material Cost ($)</label>
                <input className="input" type="number" min={0} step={50} {...f('material_cost')} placeholder="0" />
              </div>
            </div>
            {form.job_revenue && form.material_cost && Number(form.job_revenue) > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4 }}>
                Gross margin: <strong style={{ color: ((Number(form.job_revenue) - Number(form.material_cost)) / Number(form.job_revenue)) >= 0.4 ? '#22c55e' : '#f59e0b' }}>
                  {Math.round(((Number(form.job_revenue) - Number(form.material_cost)) / Number(form.job_revenue)) * 100)}%
                </strong> · ${(Number(form.job_revenue) - Number(form.material_cost)).toLocaleString()} gross profit
              </div>
            )}
            <div className="field-group" style={{ marginTop: 10 }}>
              <label className="field-label">Labor Hours (optional)</label>
              <input className="input" type="number" min={0} step={0.5} {...f('labor_hours')} placeholder="0" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            {!isNew && (
              <button className="btn" style={{ color: 'var(--red)', marginRight: 'auto' }}
                onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
                Delete
              </button>
            )}
            {!isNew && (
              <button
                className="btn"
                style={{ color: 'var(--signal-blue, #4d8af5)', borderColor: 'rgba(77,138,245,0.35)', fontSize: 12 }}
                onClick={() => reorderMut.mutate()}
                disabled={reorderMut.isPending}
                title="Create a re-order CRM lead for this client"
              >
                {reorderMut.isPending ? <span className="spinner" style={{ width: 11, height: 11 }} /> : '🔄 Create Re-Order Lead'}
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

// ── Wrap Portfolio Strip ──────────────────────────────────────────────────────

const REV_EST: Record<string, number> = {
  fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000,
  colorchange: 3500, racing: 40000, reatec: 5500, design: 3000, wallgraphics: 2500,
};

function WrapPortfolioStrip({ jobs }: { jobs: InstalledJob[] }) {
  if (jobs.length === 0) return null;

  const totalVehicles = jobs.reduce((s, j) => s + j.vehicle_count, 0);
  const totalValue    = jobs.reduce((s, j) => s + j.vehicle_count * (REV_EST[j.wrap_category] ?? 3500), 0);
  const avgJobValue   = Math.round(totalValue / jobs.length);

  const byCat: Record<string, number> = {};
  jobs.forEach((j) => {
    byCat[j.wrap_category] = (byCat[j.wrap_category] ?? 0) + j.vehicle_count * (REV_EST[j.wrap_category] ?? 3500);
  });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxCat = catEntries[0]?.[1] ?? 1;

  const fmtVal = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1_000)}K`;

  const recentJob = [...jobs].sort((a, b) =>
    new Date(b.install_date).getTime() - new Date(a.install_date).getTime()
  )[0];
  const daysSinceLast = recentJob
    ? Math.floor((Date.now() - new Date(recentJob.install_date).getTime()) / 86_400_000)
    : null;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14,
      padding: '14px 16px', background: 'var(--surface)', borderRadius: 10,
      border: '1px solid var(--border)', margin: '0 0 16px',
    }}>
      {/* Portfolio value */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
          Portfolio Value Installed
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)', lineHeight: 1, marginBottom: 4 }}>
          {fmtVal(totalValue)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {totalVehicles} vehicles · avg {avgJobValue >= 1000 ? fmtVal(avgJobValue) : `$${avgJobValue}`}/job
        </div>
        {daysSinceLast !== null && (
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
            Last install: {daysSinceLast === 0 ? 'today' : `${daysSinceLast}d ago`}
          </div>
        )}
      </div>

      {/* Revenue by category */}
      {catEntries.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>
            Revenue by Category
          </div>
          {catEntries.map(([cat, val]) => (
            <div key={cat} style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: 'var(--text)' }}>{CATEGORIES[cat as keyof typeof CATEGORIES] ?? cat}</span>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtVal(val)}</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 99 }}>
                <div style={{ height: '100%', width: `${(val / maxCat) * 100}%`, background: 'var(--accent)', borderRadius: 99, opacity: 0.75, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Re-order pipeline */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>
          Re-order Pipeline
        </div>
        {(() => {
          const expiring90 = jobs.filter((j) => (j.days_until_expiry ?? Infinity) <= 90 && (j.days_until_expiry ?? -1) >= 0);
          const expiring180 = jobs.filter((j) => (j.days_until_expiry ?? Infinity) > 90 && (j.days_until_expiry ?? Infinity) <= 180);
          const expiredVal = jobs
            .filter((j) => (j.days_until_expiry ?? 0) < 0)
            .reduce((s, j) => s + j.vehicle_count * (REV_EST[j.wrap_category] ?? 3500), 0);
          const soon90Val = expiring90.reduce((s, j) => s + j.vehicle_count * (REV_EST[j.wrap_category] ?? 3500), 0);
          const soon180Val = expiring180.reduce((s, j) => s + j.vehicle_count * (REV_EST[j.wrap_category] ?? 3500), 0);
          const rows = [
            { label: 'Overdue / expired', val: expiredVal, color: '#ef4444' },
            { label: 'Due within 90d',    val: soon90Val,  color: '#f97316' },
            { label: 'Due 90–180d',       val: soon180Val, color: '#f59e0b' },
          ].filter((r) => r.val > 0);
          if (rows.length === 0) return (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No expiring wraps in 180 days</div>
          );
          return rows.map((r) => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{fmtVal(r.val)}</span>
            </div>
          ));
        })()}
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
  const [tab, setTab] = useState<'all' | 'aging' | 'map'>('all');
  const [modal, setModal] = useState<InstalledJob | 'new' | null>(null);
  const [creatingLeadFor, setCreatingLeadFor] = useState<number | null>(null);
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);
  const setMode = useAppStore((s) => s.setMode);

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
    try {
      await api.logActivity(job.lead_id, {
        type: 'note_added',
        subject: 'Wrap Refresh Reminder',
        body: `Wrap installed ${job.install_date.split('T')[0]} on ${job.vehicle_count} ${VEHICLE_TYPE_LABELS[job.vehicle_type as VehicleType] ?? job.vehicle_type}(s) is approaching refresh window (${job.life_years} year lifespan). Follow up about renewal.`,
      });
      await api.updateLead(job.lead_id, { followupDueAt: new Date().toISOString().split('T')[0] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      showToast(`${job.company} queued for follow-up`, 'success');
    } catch {
      showToast('Failed to queue re-engagement', 'error');
    }
  }

  async function quickCreateReorderLead(e: React.MouseEvent, job: InstalledJob) {
    e.stopPropagation();
    setCreatingLeadFor(job.id);
    try {
      const data = await api.createReorderLead(job.id);
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      showToast(data.existing ? 'Re-order lead already exists — going to leads' : `Re-order lead created for ${job.company}!`, 'success');
      setMode('leads');
    } catch {
      showToast('Failed to create re-order lead', 'error');
    } finally {
      setCreatingLeadFor(null);
    }
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

      <WrapPortfolioStrip jobs={allData?.jobs ?? []} />

      <div className="jobs-tabs">
        <button className={`jobs-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          All Jobs
        </button>
        <button className={`jobs-tab ${tab === 'aging' ? 'active' : ''}`} onClick={() => setTab('aging')}>
          Aging Alerts {agingCount > 0 && <span className="jobs-tab-badge">{agingCount}</span>}
        </button>
        <button className={`jobs-tab ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>
          Fleet Map
        </button>
      </div>

      {tab === 'map' && <FleetAgingMap />}

      {tab !== 'map' && isLoading && (
        <div className="pv-loading"><span className="spinner" /><span>Loading jobs…</span></div>
      )}

      {tab !== 'map' && !isLoading && jobs.length === 0 && (
        tab === 'aging' ? (
          <div className="empty-state empty-state-sm">
            <div className="empty-state-icon" style={{ color: 'var(--green)' }}>
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="32" cy="32" r="24" stroke="currentColor" strokeWidth="2" opacity="0.3"/>
                <path d="M20 32l8 8 16-16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="empty-state-title">All clear — no aging wraps</h3>
            <p className="empty-state-sub">No vehicles are expiring in the next 90 days. Check back when installs approach their end-of-life.</p>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="28" width="52" height="22" rx="6" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
                <rect x="10" y="22" width="44" height="10" rx="4" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="16" cy="50" r="5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.2"/>
                <circle cx="48" cy="50" r="5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.2"/>
                <path d="M10 32h44" stroke="currentColor" strokeWidth="1" opacity="0.3" strokeDasharray="3 3"/>
                <path d="M28 16 L32 10 L36 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
                <line x1="32" y1="10" x2="32" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
              </svg>
            </div>
            <h3 className="empty-state-title">Start tracking your installs</h3>
            <p className="empty-state-sub">
              Log completed vehicle wraps to track their lifecycle — get aging alerts before wraps expire,
              auto-generate social posts, and trigger re-engagement campaigns at exactly the right time.
            </p>
            <div className="empty-state-actions">
              <button className="btn btn-primary" onClick={() => setModal('new')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>
                Log First Install
              </button>
            </div>
          </div>
        )
      )}

      {tab !== 'map' && !isLoading && jobs.length > 0 && (
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
                {(job.days_until_expiry === undefined || job.days_until_expiry <= 180) && (
                  <button
                    className="btn"
                    style={{ fontSize: 11, color: 'var(--signal-blue, #4d8af5)', borderColor: 'rgba(77,138,245,0.35)' }}
                    onClick={(e) => quickCreateReorderLead(e, job)}
                    disabled={creatingLeadFor === job.id}
                    title="Create a re-order CRM lead"
                  >
                    {creatingLeadFor === job.id ? <span className="spinner" style={{ width: 10, height: 10 }} /> : '→ Lead'}
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
