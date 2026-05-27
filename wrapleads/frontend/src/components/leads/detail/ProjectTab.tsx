import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';
import type { Lead } from '../../../api/types';

type Milestone = {
  id: number;
  lead_id: number;
  user_id: string;
  title: string;
  notes: string | null;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  sort_order: number;
  created_at: string;
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ProjectTab({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);
  const setMode = useAppStore((s) => s.setMode);
  const [newTitle, setNewTitle] = useState('');
  const [addingNew, setAddingNew] = useState(false);

  const leadId = lead.serverId!;
  const queryKey = ['milestones', leadId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.getMilestones(leadId),
    enabled: !!leadId,
  });

  const initMutation = useMutation({
    mutationFn: () => api.initMilestones(leadId),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      api.updateMilestone(id, { completed }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const createMutation = useMutation({
    mutationFn: (title: string) => api.createMilestone(leadId, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setNewTitle('');
      setAddingNew(false);
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteMilestone(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const milestones: Milestone[] = data?.milestones ?? [];
  const initialized = data?.initialized ?? false;
  const completed = milestones.filter((m) => m.completed).length;
  const total = milestones.length;
  const allDone = total > 0 && completed === total;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (!leadId) {
    return (
      <div style={{ padding: 16, color: 'var(--text-faint)', fontSize: 13 }}>
        Save this lead to enable project tracking.
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: initialized && total > 0 ? 10 : 0 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Project Checklist</div>
            {initialized && total > 0 && (
              <div style={{ fontSize: 11, color: allDone ? '#00d97e' : 'var(--text-faint)' }}>
                {allDone ? '✓ All steps complete' : `${completed} of ${total} steps done`}
              </div>
            )}
          </div>
          <button
            onClick={() => setAddingNew(true)}
            style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600,
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            + Step
          </button>
        </div>

        {/* Progress bar */}
        {initialized && total > 0 && (
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: allDone ? '#00d97e' : 'var(--accent)',
              borderRadius: 99,
              transition: 'width 0.4s ease',
            }} />
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 16px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 36, borderRadius: 6 }} />)}
          </div>
        ) : !initialized || total === 0 ? (
          <div style={{
            textAlign: 'center', padding: '28px 16px',
            background: 'var(--surface-2)', borderRadius: 10,
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              No project checklist yet
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Auto-generate a checklist tailored to your{' '}
              <strong>{lead.category}</strong> project — from measurements to final sign-off.
            </div>
            <button
              onClick={() => initMutation.mutate()}
              disabled={initMutation.isPending}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none',
                borderRadius: 7, padding: '8px 18px', fontSize: 12, fontWeight: 700,
                cursor: initMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: initMutation.isPending ? 0.6 : 1,
              }}
            >
              {initMutation.isPending ? 'Generating…' : 'Generate Project Checklist'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {milestones.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '8px 10px', borderRadius: 7,
                  background: m.completed ? 'rgba(0,217,126,0.06)' : 'var(--surface-2)',
                  border: `1px solid ${m.completed ? 'rgba(0,217,126,0.2)' : 'var(--border-subtle)'}`,
                  transition: 'all 0.15s',
                }}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleMutation.mutate({ id: m.id, completed: !m.completed })}
                  style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
                    background: m.completed ? '#00d97e' : 'transparent',
                    border: `2px solid ${m.completed ? '#00d97e' : 'var(--border)'}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  {m.completed && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600,
                    color: m.completed ? 'var(--text-faint)' : 'var(--text)',
                    textDecoration: m.completed ? 'line-through' : 'none',
                  }}>
                    {m.title}
                  </div>
                  {m.completed_at && (
                    <div style={{ fontSize: 10, color: '#00d97e', marginTop: 2 }}>
                      Done {fmtDate(m.completed_at)}
                    </div>
                  )}
                  {m.due_date && !m.completed && (
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                      Due {fmtDate(m.due_date)}
                    </div>
                  )}
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteMutation.mutate(m.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-faint)', padding: '2px 4px', borderRadius: 4,
                    opacity: 0.4, fontSize: 14, lineHeight: 1,
                    flexShrink: 0,
                  }}
                  title="Remove step"
                >
                  ×
                </button>
              </div>
            ))}

            {/* All done CTA */}
            {allDone && (
              <div style={{
                marginTop: 12, padding: '12px 14px',
                background: 'rgba(0,217,126,0.1)', border: '1px solid rgba(0,217,126,0.25)',
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00d97e' }}>Project Complete!</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Ready to log this install in the Jobs tracker.
                  </div>
                </div>
                <button
                  onClick={() => setMode('jobs')}
                  style={{
                    background: '#00d97e', color: '#000', border: 'none',
                    borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Log Install →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Add new step inline */}
        {addingNew && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTitle.trim()) createMutation.mutate(newTitle.trim());
                if (e.key === 'Escape') { setAddingNew(false); setNewTitle(''); }
              }}
              placeholder="New step title…"
              style={{
                flex: 1, background: 'var(--surface-2)', border: '1px solid var(--accent)',
                borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text)',
                outline: 'none',
              }}
            />
            <button
              onClick={() => newTitle.trim() && createMutation.mutate(newTitle.trim())}
              disabled={!newTitle.trim() || createMutation.isPending}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none',
                borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              Add
            </button>
            <button
              onClick={() => { setAddingNew(false); setNewTitle(''); }}
              style={{
                background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '6px 10px', fontSize: 11, cursor: 'pointer', flexShrink: 0,
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
