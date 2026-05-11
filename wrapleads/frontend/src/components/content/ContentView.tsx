import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { WrapContent, ContentSchedule } from '../../api/types';

const ALL_TAGS = ['brand', 'promo', 'seasonal', 'holiday', 'event', 'racing'];

// ── Content Upload Modal ──────────────────────────────────────────────────────

function UploadModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mut = useMutation({
    mutationFn: () => api.uploadContent(file!, name, tags),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['content'] }); onClose(); },
  });

  function handleFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Upload Content</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            className={`vision-dropzone ${preview ? 'vision-dropzone-filled' : ''}`}
            style={{ height: preview ? 'auto' : 120 }}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {preview
              ? <img src={preview} alt="preview" style={{ maxHeight: 200, borderRadius: 6, objectFit: 'contain' }} />
              : <><div className="vision-dropzone-icon">🖼</div><p className="vision-dropzone-label">Click to upload image</p></>}
          </div>
          <div className="field-group">
            <label className="field-label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Promo 2025" />
          </div>
          <div className="field-group">
            <label className="field-label">Tags</label>
            <div className="content-tag-picker">
              {ALL_TAGS.map((t) => (
                <button
                  key={t}
                  className={`content-tag-btn ${tags.includes(t) ? 'active' : ''}`}
                  onClick={() => setTags((s) => s.includes(t) ? s.filter((x) => x !== t) : [...s, t])}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!file || !name || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Schedule Modal ────────────────────────────────────────────────────────────

function ScheduleModal({ schedule, contentList, onClose }: {
  schedule: ContentSchedule | 'new';
  contentList: WrapContent[];
  onClose: () => void;
}) {
  const isNew = schedule === 'new';
  const qc = useQueryClient();
  const [form, setForm] = useState({
    content_id: isNew ? (contentList[0]?.id ?? 0) : (schedule as ContentSchedule).content_id,
    vehicle_group: isNew ? 'all' : (schedule as ContentSchedule).vehicle_group,
    start_date: isNew ? new Date().toISOString().split('T')[0] : (schedule as ContentSchedule).start_date,
    end_date: isNew ? '' : ((schedule as ContentSchedule).end_date ?? ''),
    start_time: isNew ? '' : ((schedule as ContentSchedule).start_time ?? ''),
    end_time: isNew ? '' : ((schedule as ContentSchedule).end_time ?? ''),
    geo_trigger: isNew ? '' : ((schedule as ContentSchedule).geo_trigger ?? ''),
    priority: isNew ? 0 : (schedule as ContentSchedule).priority,
    notes: isNew ? '' : ((schedule as ContentSchedule).notes ?? ''),
  });

  const createMut = useMutation({
    mutationFn: () => api.createSchedule({ ...form, end_date: form.end_date || null, start_time: form.start_time || null, end_time: form.end_time || null, geo_trigger: form.geo_trigger || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedules'] }); onClose(); },
  });
  const updateMut = useMutation({
    mutationFn: () => api.updateSchedule((schedule as ContentSchedule).id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedules'] }); onClose(); },
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteSchedule((schedule as ContentSchedule).id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedules'] }); onClose(); },
  });

  const VEHICLE_GROUPS = ['all', 'fleet', 'racing', 'construction', 'custom'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isNew ? 'Schedule Content' : 'Edit Schedule'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field-group">
            <label className="field-label">Content</label>
            <select className="input" value={form.content_id}
              onChange={(e) => setForm((s) => ({ ...s, content_id: Number(e.target.value) }))}>
              {contentList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Vehicle Group</label>
              <select className="input" value={form.vehicle_group}
                onChange={(e) => setForm((s) => ({ ...s, vehicle_group: e.target.value }))}>
                {VEHICLE_GROUPS.map((g) => <option key={g} value={g}>{g === 'all' ? 'All Vehicles' : g}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Priority</label>
              <input className="input" type="number" min={0} value={form.priority}
                onChange={(e) => setForm((s) => ({ ...s, priority: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Start Date</label>
              <input className="input" type="date" value={form.start_date}
                onChange={(e) => setForm((s) => ({ ...s, start_date: e.target.value }))} />
            </div>
            <div className="field-group">
              <label className="field-label">End Date (optional)</label>
              <input className="input" type="date" value={form.end_date}
                onChange={(e) => setForm((s) => ({ ...s, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Start Time (optional)</label>
              <input className="input" type="time" value={form.start_time}
                onChange={(e) => setForm((s) => ({ ...s, start_time: e.target.value }))} />
            </div>
            <div className="field-group">
              <label className="field-label">End Time (optional)</label>
              <input className="input" type="time" value={form.end_time}
                onChange={(e) => setForm((s) => ({ ...s, end_time: e.target.value }))} />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">Geographic Trigger (optional)</label>
            <input className="input" value={form.geo_trigger}
              onChange={(e) => setForm((s) => ({ ...s, geo_trigger: e.target.value }))}
              placeholder="e.g. Indianapolis, IN within 50 miles" />
          </div>
          <div className="field-group">
            <label className="field-label">Notes</label>
            <textarea className="input" rows={2} value={form.notes}
              onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {!isNew && (
              <button className="btn" style={{ color: 'var(--red)', marginRight: 'auto' }}
                onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>Delete</button>
            )}
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary"
              disabled={!form.content_id || !form.start_date || createMut.isPending || updateMut.isPending}
              onClick={() => isNew ? createMut.mutate() : updateMut.mutate()}>
              {isNew ? 'Schedule' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ContentView ──────────────────────────────────────────────────────────

export default function ContentView() {
  const [tab, setTab] = useState<'library' | 'schedule' | 'active'>('library');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [scheduleModal, setScheduleModal] = useState<ContentSchedule | 'new' | null>(null);
  const qc = useQueryClient();

  const { data: contentData, isLoading: loadingContent } = useQuery({
    queryKey: ['content'],
    queryFn: () => api.getContent(),
    staleTime: 60_000,
  });
  const { data: scheduleData, isLoading: loadingSchedules } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.getSchedules(),
    staleTime: 60_000,
  });
  const { data: activeData } = useQuery({
    queryKey: ['content', 'active'],
    queryFn: () => api.getActiveContent(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteContent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content'] }),
  });

  const contentList = contentData?.content ?? [];
  const scheduleList = scheduleData?.schedules ?? [];
  const filtered = tagFilter === 'all' ? contentList : contentList.filter((c) => c.tags?.includes(tagFilter));

  async function exportSchedule() {
    const data = await api.exportSchedule();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wrap-content-schedule-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  }

  return (
    <div className="content-root">
      <div className="content-header">
        <div>
          <h1 className="content-title">Dynamic Wrap Content</h1>
          <p className="content-sub">Manage and schedule graphics for programmable vehicle surfaces.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'library' && (
            <button className="btn btn-primary" onClick={() => setShowUpload(true)}>+ Upload Content</button>
          )}
          {tab === 'schedule' && (
            <>
              <button className="btn" onClick={exportSchedule}>⬇ Export JSON</button>
              <button className="btn btn-primary" onClick={() => setScheduleModal('new')} disabled={contentList.length === 0}>
                + Add Schedule
              </button>
            </>
          )}
        </div>
      </div>

      {(activeData?.active?.length ?? 0) > 0 && (
        <div className="content-active-banner">
          <span className="content-active-dot" />
          <strong>Active now:</strong>
          {activeData!.active.map((a) => (
            <span key={a.vehicle_group} className="content-active-item">
              {a.vehicle_group === 'all' ? 'All vehicles' : a.vehicle_group} — {a.content?.name}
            </span>
          ))}
        </div>
      )}

      <div className="jobs-tabs">
        <button className={`jobs-tab ${tab === 'library' ? 'active' : ''}`} onClick={() => setTab('library')}>
          Content Library <span className="jobs-tab-badge">{contentList.length}</span>
        </button>
        <button className={`jobs-tab ${tab === 'schedule' ? 'active' : ''}`} onClick={() => setTab('schedule')}>
          Schedule <span className="jobs-tab-badge">{scheduleList.length}</span>
        </button>
        <button className={`jobs-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
          Active Now
        </button>
      </div>

      {/* ── Library Tab ── */}
      {tab === 'library' && (
        <>
          <div className="content-tag-filter">
            {['all', ...ALL_TAGS].map((t) => (
              <button key={t} className={`content-tag-btn ${tagFilter === t ? 'active' : ''}`}
                onClick={() => setTagFilter(t)}>{t}</button>
            ))}
          </div>
          {loadingContent && <div className="pv-loading"><span className="spinner" /></div>}
          {!loadingContent && filtered.length === 0 && (
            <div className="jobs-empty">
              <div className="jobs-empty-icon">🖼</div>
              <p>No content yet.</p>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowUpload(true)}>Upload your first design</button>
            </div>
          )}
          <div className="content-grid">
            {filtered.map((c) => (
              <div key={c.id} className="content-card">
                {c.image_url
                  ? <img src={c.image_url} alt={c.name} className="content-card-img" />
                  : <div className="content-card-placeholder">🖼</div>}
                <div className="content-card-body">
                  <span className="content-card-name">{c.name}</span>
                  <div className="content-card-tags">
                    {c.tags?.map((t) => <span key={t} className="content-tag-pill">{t}</span>)}
                  </div>
                  <div className="content-card-actions">
                    <button className="btn" style={{ fontSize: 11 }}
                      onClick={() => setScheduleModal('new')}>Schedule</button>
                    <button className="btn" style={{ fontSize: 11, color: 'var(--red)' }}
                      onClick={() => deleteMut.mutate(c.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Schedule Tab ── */}
      {tab === 'schedule' && (
        <>
          {loadingSchedules && <div className="pv-loading"><span className="spinner" /></div>}
          {!loadingSchedules && scheduleList.length === 0 && (
            <div className="jobs-empty">
              <div className="jobs-empty-icon">📅</div>
              <p>No schedules yet.</p>
              {contentList.length === 0
                ? <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Upload content first, then create a schedule.</p>
                : <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setScheduleModal('new')}>Create first schedule</button>}
            </div>
          )}
          <div className="content-schedule-list">
            {scheduleList.map((s) => (
              <div key={s.id} className="content-schedule-row" onClick={() => setScheduleModal(s)}>
                <div className="content-sched-thumb">
                  {s.content?.image_url
                    ? <img src={s.content.image_url} alt="" className="content-sched-img" />
                    : <div className="content-sched-placeholder">🖼</div>}
                </div>
                <div className="content-sched-info">
                  <span className="content-sched-name">{s.content?.name ?? `Content #${s.content_id}`}</span>
                  <span className="content-sched-meta">
                    {s.vehicle_group === 'all' ? 'All vehicles' : s.vehicle_group}
                    {' · '}{s.start_date}{s.end_date ? ` → ${s.end_date}` : ' onwards'}
                    {s.start_time && ` · ${s.start_time}${s.end_time ? `–${s.end_time}` : ''}`}
                  </span>
                  {s.geo_trigger && <span className="content-sched-geo">📍 {s.geo_trigger}</span>}
                </div>
                <span className="content-sched-priority">P{s.priority}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Active Now Tab ── */}
      {tab === 'active' && (
        <div style={{ padding: '16px 0' }}>
          {(activeData?.active?.length ?? 0) === 0 ? (
            <div className="jobs-empty">
              <div className="jobs-empty-icon">📺</div>
              <p>Nothing scheduled for right now.</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Schedules activate based on date, time, and geographic rules.</p>
            </div>
          ) : (
            <div className="content-active-list">
              {activeData!.active.map((a, i) => (
                <div key={i} className="content-active-row">
                  {a.content?.image_url && <img src={a.content.image_url} alt="" className="content-active-img" />}
                  <div>
                    <div className="content-card-name">{a.content?.name}</div>
                    <div className="content-sched-meta">
                      {a.vehicle_group === 'all' ? 'All vehicles' : `${a.vehicle_group} vehicles`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
      {scheduleModal && (
        <ScheduleModal
          schedule={scheduleModal}
          contentList={contentList}
          onClose={() => setScheduleModal(null)}
        />
      )}
    </div>
  );
}
