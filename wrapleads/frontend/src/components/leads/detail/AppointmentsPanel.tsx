import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';

const APPT_TYPES = [
  { value: 'measurement', label: 'Fleet Measurement' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'design-review', label: 'Design Review' },
  { value: 'install', label: 'Install Appointment' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'other', label: 'Other' },
];

const TYPE_COLOR: Record<string, string> = {
  measurement: '#f59e0b', consultation: '#4d8af5', 'design-review': '#8b5cf6',
  install: '#22c55e', 'follow-up': '#f4551c', other: '#94a3b8',
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    + ' at '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isPast(iso: string) {
  return new Date(iso).getTime() < Date.now() - 3600_000;
}

interface Props {
  leadId: number;
}

export default function AppointmentsPanel({ leadId }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  // form state
  const [title, setTitle] = useState('');
  const [type, setType] = useState('measurement');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['appointments', leadId],
    queryFn: () => api.getAppointments({ leadId }),
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: () => {
      const scheduledAt = new Date(`${dateStr}T${timeStr}`).toISOString();
      return api.createAppointment({
        leadId,
        title: title || APPT_TYPES.find((t) => t.value === type)?.label || 'Appointment',
        apptType: type,
        scheduledAt,
        durationMins: parseInt(duration) || 60,
        location: location || undefined,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      showToast('Appointment scheduled', 'success');
      qc.invalidateQueries({ queryKey: ['appointments', leadId] });
      qc.invalidateQueries({ queryKey: ['upcoming-appointments'] });
      resetForm();
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const doneMut = useMutation({
    mutationFn: (id: number) => api.updateAppointment(id, { status: 'completed' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['appointments', leadId] }); qc.invalidateQueries({ queryKey: ['upcoming-appointments'] }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteAppointment(id),
    onSuccess: () => { showToast('Appointment deleted'); qc.invalidateQueries({ queryKey: ['appointments', leadId] }); qc.invalidateQueries({ queryKey: ['upcoming-appointments'] }); },
  });

  function resetForm() {
    setShowForm(false); setTitle(''); setType('measurement');
    setDateStr(''); setTimeStr('09:00'); setDuration('60'); setLocation(''); setNotes('');
  }

  const appts = data?.appointments ?? [];
  const upcoming = appts.filter((a) => a.status === 'upcoming' && !isPast(a.scheduled_at));
  const past = appts.filter((a) => a.status === 'completed' || isPast(a.scheduled_at));

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)' }}>
          Appointments
          {upcoming.length > 0 && (
            <span style={{ marginLeft: 6, background: '#4d8af5', color: '#fff', borderRadius: 8, padding: '1px 6px', fontSize: 10 }}>
              {upcoming.length}
            </span>
          )}
        </div>
        <button
          className="btn"
          style={{ fontSize: 11, padding: '3px 10px', color: '#4d8af5', borderColor: 'rgba(77,138,245,0.4)' }}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ Schedule'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{
          border: '1px solid rgba(77,138,245,0.3)', borderRadius: 10, padding: '12px 14px',
          background: 'var(--bg-elev)', marginBottom: 10,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', display: 'block', marginBottom: 3 }}>Type</label>
              <select className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={type} onChange={(e) => setType(e.target.value)}>
                {APPT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', display: 'block', marginBottom: 3 }}>Duration</label>
              <select className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={duration} onChange={(e) => setDuration(e.target.value)}>
                {['30','45','60','90','120'].map((d) => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', display: 'block', marginBottom: 3 }}>Date</label>
              <input className="input" type="date" style={{ fontSize: 12, padding: '5px 8px', width: '100%' }} value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', display: 'block', marginBottom: 3 }}>Time</label>
              <input className="input" type="time" style={{ fontSize: 12, padding: '5px 8px', width: '100%' }} value={timeStr} onChange={(e) => setTimeStr(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', display: 'block', marginBottom: 3 }}>Location (optional)</label>
            <input className="input" style={{ fontSize: 12, padding: '5px 8px', width: '100%' }} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Their lot, your shop, video call…" />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', display: 'block', marginBottom: 3 }}>Notes (optional)</label>
            <textarea className="input" rows={2} style={{ fontSize: 12, padding: '5px 8px', width: '100%', resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bring the 3M sample kit, ask about the F-650s…" />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
            disabled={!dateStr || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Save Appointment'}
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '4px 0' }}>Loading…</div>}

      {/* Upcoming */}
      {upcoming.map((a) => (
        <div key={a.id} style={{
          border: `1px solid ${TYPE_COLOR[a.appt_type] || '#4d8af5'}30`,
          borderLeft: `3px solid ${TYPE_COLOR[a.appt_type] || '#4d8af5'}`,
          borderRadius: 8, padding: '9px 12px', marginBottom: 6,
          background: 'var(--bg-elev)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{a.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {fmtDateTime(a.scheduled_at)} · {a.duration_mins} min
              </div>
              {a.location && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>📍 {a.location}</div>}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                className="btn"
                style={{ fontSize: 10, padding: '2px 8px', color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}
                onClick={() => doneMut.mutate(a.id)}
                disabled={doneMut.isPending}
                title="Mark completed"
              >Done</button>
              <button
                className="btn"
                style={{ fontSize: 10, padding: '2px 6px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                onClick={() => deleteMut.mutate(a.id)}
                title="Delete"
              >×</button>
            </div>
          </div>
        </div>
      ))}

      {/* Empty upcoming */}
      {!isLoading && upcoming.length === 0 && !showForm && (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '4px 0' }}>No upcoming appointments — schedule one above.</div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 11, color: 'var(--text-faint)', cursor: 'pointer', listStyle: 'none' }}>
            ▸ {past.length} past appointment{past.length !== 1 ? 's' : ''}
          </summary>
          <div style={{ marginTop: 6 }}>
            {past.map((a) => (
              <div key={a.id} style={{
                border: '1px solid var(--border-subtle)', borderRadius: 7,
                padding: '7px 10px', marginBottom: 5, opacity: 0.6,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{a.title}</div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{fmtDateTime(a.scheduled_at)}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
