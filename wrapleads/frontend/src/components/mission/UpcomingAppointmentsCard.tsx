import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const TYPE_COLOR: Record<string, string> = {
  measurement: '#f59e0b', consultation: '#4d8af5', 'design-review': '#8b5cf6',
  install: '#22c55e', 'follow-up': '#f4551c', other: '#94a3b8',
};
const TYPE_LABEL: Record<string, string> = {
  measurement: 'Measurement', consultation: 'Consult', 'design-review': 'Design Review',
  install: 'Install', 'follow-up': 'Follow-up', other: 'Appointment',
};

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isTomorrow(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function dayLabel(iso: string) {
  if (isToday(iso)) return 'Today';
  if (isTomorrow(iso)) return 'Tomorrow';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function UpcomingAppointmentsCard() {
  const { setMode, setCurrentLeadId } = useAppStore();

  const { data } = useQuery({
    queryKey: ['upcoming-appointments'],
    queryFn: () => api.getUpcomingAppointments(),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const appts = data?.appointments ?? [];
  if (!appts.length) return null;

  const todayAppts = appts.filter((a) => isToday(a.scheduled_at));

  return (
    <section className="mission-card" style={{ borderLeft: '3px solid #4d8af5' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <span style={{ fontSize: 13, fontWeight: 800 }}>Upcoming Appointments</span>
          {todayAppts.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 800, background: '#ef4444', color: '#fff', borderRadius: 8, padding: '2px 7px', letterSpacing: '.03em' }}>
              {todayAppts.length} today
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{appts.length} total</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {appts.slice(0, 5).map((a) => {
          const color = TYPE_COLOR[a.appt_type] || '#94a3b8';
          const today = isToday(a.scheduled_at);
          return (
            <div
              key={a.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8,
                background: today ? `${color}10` : 'var(--bg-elev)',
                border: `1px solid ${today ? color + '40' : 'var(--border-subtle)'}`,
                cursor: a.lead_id_link ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (a.lead_id_link) {
                  setCurrentLeadId(String(a.lead_id_link));
                  setMode('leads');
                }
              }}
            >
              <div style={{
                width: 36, flexShrink: 0, textAlign: 'center',
                borderRight: `2px solid ${color}`,
                paddingRight: 10,
              }}>
                <div style={{ fontSize: 13, fontWeight: 900, color, lineHeight: 1.1 }}>
                  {new Date(a.scheduled_at).getDate()}
                </div>
                <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '.05em' }}>
                  {new Date(a.scheduled_at).toLocaleDateString('en-US', { month: 'short' })}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.company || a.title}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  <span style={{ color, fontWeight: 600 }}>{TYPE_LABEL[a.appt_type] || 'Appt'}</span>
                  {' · '}
                  {dayLabel(a.scheduled_at)} {timeLabel(a.scheduled_at)}
                  {a.location ? ` · ${a.location}` : ''}
                </div>
              </div>
              {today && (
                <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}18`, borderRadius: 4, padding: '2px 7px', flexShrink: 0 }}>
                  Today
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
