import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { WrapContent, ContentSchedule, EinkDevice, EinkPushLog } from '../../api/types';

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

// ── Register Device Modal ─────────────────────────────────────────────────────

function RegisterDeviceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', serial_number: '', vehicle_group: 'fleet' });
  const [token, setToken] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => api.registerDevice({ name: form.name, serial_number: form.serial_number || undefined, vehicle_group: form.vehicle_group }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      setToken(data.device.device_token);
    },
  });

  if (token) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">Device Registered</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
          <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Copy this token and paste it into your E Ink controller's configuration. It's shown once.
            </p>
            <div className="device-qr-wrap">
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>DEVICE TOKEN</span>
              <code className="device-qr-token">{token}</code>
              <button className="btn" style={{ fontSize: 11 }} onClick={() => navigator.clipboard.writeText(token)}>
                Copy Token
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              Configure the device to send <code style={{ fontSize: 10 }}>Authorization: Bearer {'<token>'}</code> in all requests to <code style={{ fontSize: 10 }}>/devices/register</code> and poll <code style={{ fontSize: 10 }}>/devices/{'<id>'}/content</code>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Register E Ink Device</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field-group">
            <label className="field-label">Device Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Fleet Truck #12 — Driver Side" />
          </div>
          <div className="field-group">
            <label className="field-label">Serial Number (optional)</label>
            <input className="input" value={form.serial_number} onChange={(e) => setForm((s) => ({ ...s, serial_number: e.target.value }))} placeholder="EP3-XXXXXX" />
          </div>
          <div className="field-group">
            <label className="field-label">Vehicle Group</label>
            <select className="input" value={form.vehicle_group} onChange={(e) => setForm((s) => ({ ...s, vehicle_group: e.target.value }))}>
              {['fleet', 'racing', 'construction', 'custom', 'all'].map((g) => (
                <option key={g} value={g}>{g === 'all' ? 'All Vehicles' : g.charAt(0).toUpperCase() + g.slice(1)}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!form.name || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? 'Registering…' : 'Register Device'}
            </button>
          </div>
          {mut.isError && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>Registration failed. Check your connection.</p>}
        </div>
      </div>
    </div>
  );
}

// ── Push Content Modal ────────────────────────────────────────────────────────

function PushModal({ device, contentList, onClose }: { device: EinkDevice; contentList: WrapContent[]; onClose: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const mut = useMutation({
    mutationFn: () => api.pushContentToDevice(device.id, selected!),
    onSuccess: () => onClose(),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Push Content — {device.name}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Select a design to push to this device on its next poll cycle.</p>
          {contentList.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No content in library. Upload a design first.</p>
          ) : (
            <div className="content-grid" style={{ maxHeight: 300, overflowY: 'auto' }}>
              {contentList.map((c) => (
                <div
                  key={c.id}
                  className="content-card"
                  style={{ border: selected === c.id ? '2px solid var(--accent)' : undefined, cursor: 'pointer' }}
                  onClick={() => setSelected(c.id)}
                >
                  {c.image_url
                    ? <img src={c.image_url} alt={c.name} className="content-card-img" />
                    : <div className="content-card-placeholder">🖼</div>}
                  <div className="content-card-body">
                    <span className="content-card-name">{c.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!selected || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? 'Pushing…' : 'Push Now'}
            </button>
          </div>
          {mut.isSuccess && <p style={{ fontSize: 12, color: '#22c55e', margin: 0 }}>Pushed — device will pick up on next poll.</p>}
        </div>
      </div>
    </div>
  );
}

// ── Device Detail Panel ───────────────────────────────────────────────────────

function DeviceDetail({ device, onClose, onPush, onDelete }: {
  device: EinkDevice;
  onClose: () => void;
  onPush: () => void;
  onDelete: () => void;
}) {
  const { data: logData } = useQuery({
    queryKey: ['device-log', device.id],
    queryFn: () => api.getDevicePushLog(device.id),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const log: EinkPushLog[] = logData?.log ?? [];

  const isOnline = device.status === 'online' && device.last_seen_at
    ? (Date.now() - new Date(device.last_seen_at).getTime()) < 5 * 60 * 1000
    : false;
  const statusKey = isOnline ? 'online' : (device.status === 'updating' ? 'updating' : 'offline');

  function relativeTime(ts: string | null | undefined) {
    if (!ts) return 'never';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="device-detail-panel" onClick={(e) => e.stopPropagation()}>
      <div className="device-detail-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`device-status-dot ${statusKey}`} style={{ marginTop: 5 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{device.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{device.vehicle_group} · {device.serial_number || 'No serial'}</div>
          </div>
        </div>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>

      <div className="device-detail-section">
        <div className="device-detail-label">Status</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <span className={`device-status-badge ${statusKey}`}>{isOnline ? 'Online' : device.status}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last seen: {relativeTime(device.last_seen_at)}</span>
        </div>
        {device.firmware_version && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Firmware: {device.firmware_version}</div>
        )}
      </div>

      {device.current_content && (
        <div className="device-detail-section">
          <div className="device-detail-label">Current Content</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
            {device.current_content.image_url && (
              <img src={device.current_content.image_url} alt="" style={{ width: 60, height: 44, objectFit: 'cover', borderRadius: 6 }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 600 }}>{device.current_content.name}</span>
          </div>
        </div>
      )}

      <div className="device-detail-section">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ fontSize: 12, flex: 1 }} onClick={onPush}>Push Content</button>
          <button className="btn" style={{ fontSize: 12, color: 'var(--red)' }} onClick={onDelete}>Delete</button>
        </div>
      </div>

      <div className="device-detail-section" style={{ flex: 1 }}>
        <div className="device-detail-label">Push History</div>
        {log.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>No pushes yet.</p>}
        {log.map((entry) => (
          <div key={entry.id} className="push-log-row">
            <div className="push-log-thumb">
              {entry.content?.image_url
                ? <img src={entry.content.image_url} alt="" />
                : <span style={{ fontSize: 14 }}>🖼</span>}
            </div>
            <div className="push-log-info">
              <span className="push-log-name">{entry.content?.name ?? `Content #${entry.content_id}`}</span>
              <span className="push-log-time">{new Date(entry.pushed_at).toLocaleString()}</span>
            </div>
            <span className={`push-log-status ${entry.status}`}>{entry.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Device Grid ───────────────────────────────────────────────────────────────

function DeviceGrid({ contentList }: { contentList: WrapContent[] }) {
  const qc = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<EinkDevice | null>(null);
  const [pushDevice, setPushDevice] = useState<EinkDevice | null>(null);

  const { data: devicesData, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.getDevices(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const { data: statusData } = useQuery({
    queryKey: ['devices', 'status'],
    queryFn: () => api.getDeviceStatus(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteDevice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      setSelectedDevice(null);
    },
  });

  const devices: EinkDevice[] = devicesData?.devices ?? [];

  function isOnline(d: EinkDevice) {
    return d.status === 'online' && d.last_seen_at
      ? (Date.now() - new Date(d.last_seen_at).getTime()) < 5 * 60 * 1000
      : false;
  }

  function relativeTime(ts: string | null | undefined) {
    if (!ts) return 'never';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <>
      {statusData && (
        <div className="device-stats-strip">
          <div className="device-stat">
            <span className="device-stat-value">{statusData.total}</span>
            <span className="device-stat-label">Total Devices</span>
          </div>
          <div className="device-stat">
            <span className="device-stat-value" style={{ color: '#22c55e' }}>{statusData.online}</span>
            <span className="device-stat-label">Online</span>
          </div>
          <div className="device-stat">
            <span className="device-stat-value" style={{ color: 'var(--text-muted)' }}>{statusData.offline}</span>
            <span className="device-stat-label">Offline</span>
          </div>
          <div className="device-stat">
            <span className="device-stat-value" style={{ color: '#f59e0b' }}>{statusData.updating}</span>
            <span className="device-stat-label">Updating</span>
          </div>
        </div>
      )}

      {isLoading && <div className="pv-loading"><span className="spinner" /></div>}
      {!isLoading && devices.length === 0 && (
        <div className="jobs-empty">
          <div className="jobs-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:36,height:36}}><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M10.54 17.09a6 6 0 0 1 2.92 0"/><line x1="12" y1="21" x2="12" y2="21"/></svg></div>
          <p>No E Ink devices registered yet.</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Register a device to start pushing dynamic content to programmable vehicle surfaces.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowRegister(true)}>
            Register First Device
          </button>
        </div>
      )}

      <div className="device-grid">
        {devices.map((d) => {
          const online = isOnline(d);
          const statusKey = online ? 'online' : (d.status === 'updating' ? 'updating' : 'offline');
          return (
            <div key={d.id} className="device-card" onClick={() => setSelectedDevice(d)}>
              <div className="device-card-thumb">
                {d.current_content?.image_url
                  ? <img src={d.current_content.image_url} alt="" />
                  : <span className="device-card-thumb-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:20,height:20}}><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M10.54 17.09a6 6 0 0 1 2.92 0"/><line x1="12" y1="21" x2="12" y2="21"/></svg></span>}
              </div>
              <div className="device-card-body">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`device-status-dot ${statusKey}`} />
                  <span className="device-card-name">{d.name}</span>
                </div>
                <div className="device-card-meta">
                  <span className="device-group-chip">{d.vehicle_group}</span>
                  <span>·</span>
                  <span>{relativeTime(d.last_seen_at)}</span>
                </div>
                {d.current_content && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Showing: {d.current_content.name}</div>
                )}
                <div className="device-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => setPushDevice(d)}>Push Content</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showRegister && <RegisterDeviceModal onClose={() => setShowRegister(false)} />}
      {pushDevice && (
        <PushModal device={pushDevice} contentList={contentList} onClose={() => setPushDevice(null)} />
      )}
      {selectedDevice && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setSelectedDevice(null)} />
          <DeviceDetail
            device={selectedDevice}
            onClose={() => setSelectedDevice(null)}
            onPush={() => { setPushDevice(selectedDevice); setSelectedDevice(null); }}
            onDelete={() => deleteMut.mutate(selectedDevice.id)}
          />
        </>
      )}
      {showRegister && <RegisterDeviceModal onClose={() => setShowRegister(false)} />}
    </>
  );
}

// ── Main ContentView ──────────────────────────────────────────────────────────

export default function ContentView() {
  const [tab, setTab] = useState<'library' | 'schedule' | 'active' | 'devices'>('library');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [showRegisterDevice, setShowRegisterDevice] = useState(false);
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
          {tab === 'devices' && (
            <button className="btn btn-primary" onClick={() => setShowRegisterDevice(true)}>+ Register Device</button>
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
        <button className={`jobs-tab ${tab === 'devices' ? 'active' : ''}`} onClick={() => setTab('devices')}>
          Devices
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
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="6" y="6" width="52" height="38" rx="5" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
                  <rect x="6" y="6" width="52" height="38" rx="5" fill="currentColor" opacity="0.07"/>
                  <circle cx="18" cy="22" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
                  <path d="M6 34 L20 22 L30 30 L40 20 L58 34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
                  <rect x="20" y="48" width="24" height="3" rx="1.5" fill="currentColor" opacity="0.2"/>
                  <rect x="28" y="44" width="8" height="8" rx="1" fill="currentColor" opacity="0.15"/>
                  <line x1="14" y1="58" x2="50" y2="58" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.15"/>
                </svg>
              </div>
              <h3 className="empty-state-title">No designs in library</h3>
              <p className="empty-state-sub">
                Upload wrap designs, seasonal promos, and brand graphics to schedule
                across your E Ink vehicle display network and track performance.
              </p>
              <div className="empty-state-actions">
                <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>
                  Upload First Design
                </button>
              </div>
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
              <div className="jobs-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:36,height:36}}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
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
              <div className="jobs-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:36,height:36}}><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg></div>
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

      {/* ── Devices Tab ── */}
      {tab === 'devices' && (
        <DeviceGrid contentList={contentList} />
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
      {showRegisterDevice && <RegisterDeviceModal onClose={() => setShowRegisterDevice(false)} />}
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
