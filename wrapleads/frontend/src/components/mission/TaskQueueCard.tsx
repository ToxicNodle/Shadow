import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

type Task = {
  id: number;
  user_id: string;
  lead_id: number | null;
  title: string;
  notes: string | null;
  type: string;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: string;
  created_at: string;
  lead_company: string | null;
  lead_status: string | null;
  lead_category: string | null;
};

const TYPE_ICONS: Record<string, string> = {
  call: '📞', email: '✉️', follow_up: '🔁', meeting: '📅',
  admin: '📋', manual: '✓', ai_suggested: '⚡',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444', normal: 'var(--text-faint)', low: 'var(--border)',
};

function fmtTime(date: string) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 3600000) return 'just now';
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TaskQueueCard() {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);
  const setPendingOpenLeadServerId = useAppStore((s) => s.setPendingOpenLeadServerId);
  const setMode = useAppStore((s) => s.setMode);

  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.getTasks(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const completeMut = useMutation({
    mutationFn: (id: number) => api.updateTask(id, { completed: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const createMut = useMutation({
    mutationFn: (title: string) => api.createTask({ title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setNewTitle('');
      setAdding(false);
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const generateMut = useMutation({
    mutationFn: () => api.generateAITasks(),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      showToast(`${d.generated} AI tasks added for today`, 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const tasks: Task[] = data?.tasks ?? [];
  const completedToday = data?.completedToday ?? [];
  const highPriority = tasks.filter((t) => t.priority === 'high');
  const normalPriority = tasks.filter((t) => t.priority !== 'high');

  return (
    <div className="mission-card" style={{ gridColumn: '1 / -1' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Today's Tasks
          </div>
          {tasks.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
              background: highPriority.length > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)',
              color: highPriority.length > 0 ? '#ef4444' : 'var(--text-muted)',
            }}>
              {tasks.length} left
            </span>
          )}
          {completedToday.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
              background: 'rgba(0,217,126,0.1)', color: '#00d97e',
            }}>
              {completedToday.length} done today
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending}
            title="Generate AI task list for today"
            style={{
              background: 'rgba(77,138,245,0.12)', color: '#4d8af5',
              border: '1px solid rgba(77,138,245,0.25)',
              borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700,
              cursor: generateMut.isPending ? 'not-allowed' : 'pointer',
              opacity: generateMut.isPending ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            {generateMut.isPending ? 'Generating…' : 'AI Tasks'}
          </button>
          <button
            onClick={() => setAdding(true)}
            style={{
              background: 'var(--surface-2)', color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Add Task
          </button>
        </div>
      </div>

      {/* Quick add */}
      {adding && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTitle.trim()) createMut.mutate(newTitle.trim());
              if (e.key === 'Escape') { setAdding(false); setNewTitle(''); }
            }}
            placeholder="Task description…"
            style={{
              flex: 1, background: 'var(--surface-2)', border: '1px solid var(--accent)',
              borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text)', outline: 'none',
            }}
          />
          <button
            onClick={() => newTitle.trim() && createMut.mutate(newTitle.trim())}
            disabled={!newTitle.trim()}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Add
          </button>
          <button
            onClick={() => { setAdding(false); setNewTitle(''); }}
            style={{
              background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '6px 10px', fontSize: 11, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Task list */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 7 }} />)}
        </div>
      ) : tasks.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '20px 16px',
          background: 'rgba(255,255,255,0.02)', borderRadius: 10,
          border: '1px dashed var(--border-subtle)',
        }}>
          <div style={{ fontSize: 20, marginBottom: 6 }}>✅</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
            No tasks for today
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
            Click "AI Tasks" to generate a prioritized to-do list from your pipeline
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[...highPriority, ...normalPriority].map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={() => completeMut.mutate(task.id)}
              onDelete={() => deleteMut.mutate(task.id)}
              onLeadClick={(leadId) => {
                if (leadId) {
                  setPendingOpenLeadServerId(leadId);
                  setMode('leads');
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Completed today strip */}
      {completedToday.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
              fontSize: 11, color: 'var(--text-faint)', fontWeight: 600,
            }}
          >
            {showCompleted ? '▲' : '▶'} {completedToday.length} completed today
          </button>
          {showCompleted && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {completedToday.map((t) => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 10px', borderRadius: 6,
                  background: 'rgba(0,217,126,0.05)', border: '1px solid rgba(0,217,126,0.1)',
                  opacity: 0.7,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00d97e" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'line-through' }}>{t.title}</span>
                  {t.lead_company && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>· {t.lead_company}</span>}
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 'auto' }}>{fmtTime(t.completed_at!)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task, onComplete, onDelete, onLeadClick,
}: {
  task: Task;
  onComplete: () => void;
  onDelete: () => void;
  onLeadClick: (leadId: number | null) => void;
}) {
  const isOverdue = task.due_date && task.due_date < new Date().toISOString().split('T')[0];

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px',
      borderRadius: 7, border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.25)' : 'var(--border-subtle)'}`,
      background: isOverdue ? 'rgba(239,68,68,0.04)' : 'var(--surface-2)',
      transition: 'opacity 0.2s',
    }}>
      {/* Priority bar */}
      <div style={{
        width: 3, height: '100%', minHeight: 28, borderRadius: 99,
        background: PRIORITY_COLORS[task.priority] || 'var(--border)',
        flexShrink: 0, alignSelf: 'stretch',
      }} />

      {/* Type icon */}
      <div style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
        {TYPE_ICONS[task.type] ?? '✓'}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
          {task.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          {task.lead_company && task.lead_id && (
            <button
              onClick={() => onLeadClick(task.lead_id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: 10, color: '#4d8af5', fontWeight: 600,
              }}
            >
              {task.lead_company} →
            </button>
          )}
          {task.notes && (
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{task.notes}</span>
          )}
          {isOverdue && (
            <span style={{ fontSize: 9, fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              OVERDUE
            </span>
          )}
        </div>
      </div>

      {/* Complete button */}
      <button
        onClick={onComplete}
        title="Mark complete"
        style={{
          width: 22, height: 22, borderRadius: 5, flexShrink: 0,
          background: 'transparent', border: '2px solid var(--border)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s', marginTop: 1,
        }}
        onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.borderColor = '#00d97e'; (e.target as HTMLButtonElement).style.background = 'rgba(0,217,126,0.1)'; }}
        onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.target as HTMLButtonElement).style.background = 'transparent'; }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="3">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>

      {/* Delete */}
      <button
        onClick={onDelete}
        title="Remove task"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-faint)', padding: '2px 4px', borderRadius: 4,
          opacity: 0.4, fontSize: 14, lineHeight: 1, flexShrink: 0, marginTop: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
