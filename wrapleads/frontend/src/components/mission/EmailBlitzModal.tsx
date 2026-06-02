import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

type Candidate = {
  id: number;
  company: string;
  contactName: string | null;
  category: string;
  status: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  fleetSize: string | null;
  pitchAngle: string | null;
  notes: string | null;
  followupDueAt: string | null;
  daysSinceContact: number;
  recentEmailCount: number;
};

const STATUS_COLORS: Record<string, string> = {
  contacted: '#3b82f6', replied: '#0ea5e9', meeting: '#f59e0b', proposal: '#f97316',
};

const STATUS_LABELS: Record<string, string> = {
  contacted: 'Contacted', replied: 'Replied', meeting: 'Meeting', proposal: 'Proposal',
};

const CAT_LABELS: Record<string, string> = {
  fleet: 'Fleet', dinoc: 'DI-NOC', gc_referral: 'GC Ref', construction: 'Const.',
  racing: 'Racing', reatec: 'Rea-Tec', colorchange: 'Color', design: 'Design', wallgraphics: 'Wall',
};

interface Props {
  onClose: () => void;
}

export default function EmailBlitzModal({ onClose }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const settings = useAppStore((s) => s.settings);
  const qc = useQueryClient();

  const [idx, setIdx] = useState(0);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [snoozed, setSnoozed] = useState(0);
  const [done, setDone] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['blitz-candidates'],
    queryFn: () => api.getBlitzCandidates(),
    staleTime: Infinity,
    gcTime: 0,
  });

  const candidates = data?.candidates ?? [];
  const current = candidates[idx] ?? null;
  const total = candidates.length;
  const pct = total > 0 ? Math.round((idx / total) * 100) : 0;

  // Generate email when we move to a new lead
  const generateEmail = useCallback(async (lead: Candidate) => {
    setSubject('');
    setBody('');
    setGenError(null);
    setGenerating(true);
    try {
      const r = await api.generateBlitzEmail({
        lead: {
          company: lead.company,
          contactName: lead.contactName,
          category: lead.category,
          status: lead.status,
          city: lead.city,
          state: lead.state,
          fleetSize: lead.fleetSize,
          pitchAngle: lead.pitchAngle,
        },
        settings: {
          companyName: settings?.companyName ?? '',
          senderName: settings?.senderName ?? '',
          senderTitle: settings?.senderTitle ?? '',
          senderEmail: settings?.senderEmail ?? '',
          senderPhone: settings?.senderPhone ?? '',
          companyServices: settings?.companyServices ?? '',
          companyTagline: settings?.companyTagline ?? '',
        },
      });
      setSubject(r.subject);
      setBody(r.body);
    } catch (e: any) {
      setGenError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [settings]);

  useEffect(() => {
    if (current) generateEmail(current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, current?.id]);

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error('No lead');
      await api.sendEmail(current.id, {
        subject,
        body,
        toEmail: current.email,
        toName: current.contactName ?? undefined,
      });
    },
    onSuccess: () => {
      setSent((s) => s + 1);
      showToast(`Email sent to ${current?.company}`, 'success');
      qc.invalidateQueries({ queryKey: ['leads'] });
      advance();
    },
    onError: (e: Error) => {
      showToast(e.message || 'Send failed', 'error');
    },
  });

  const snoozeMut = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error('No lead');
      const until = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
      await api.snoozeLead(current.id, until);
    },
    onSuccess: () => {
      setSnoozed((s) => s + 1);
      showToast(`${current?.company} snoozed 2 weeks`, 'success');
      advance();
    },
    onError: (e: Error) => {
      showToast(e.message || 'Snooze failed', 'error');
    },
  });

  function advance() {
    if (idx + 1 >= total) {
      setDone(true);
    } else {
      setIdx((i) => i + 1);
    }
  }

  function skip() {
    setSkipped((s) => s + 1);
    advance();
  }

  if (isLoading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading blitz queue…</div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
        onClick={onClose}
      >
        <div
          style={{
            background: 'var(--surface-1)', border: '1px solid var(--border-subtle)',
            borderRadius: 16, padding: 40, maxWidth: 360, textAlign: 'center',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            You're all caught up!
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 24 }}>
            No leads are overdue for a follow-up email right now.
          </div>
          <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
        onClick={onClose}
      >
        <div
          style={{
            background: 'var(--surface-1)', border: '1px solid var(--border-subtle)',
            borderRadius: 16, padding: 40, maxWidth: 400, textAlign: 'center',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
            Blitz Complete!
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginBottom: 24 }}>
            {[
              { val: sent,    label: 'Sent',    color: '#22c55e' },
              { val: skipped, label: 'Skipped', color: 'var(--text-faint)' },
              { val: snoozed, label: 'Snoozed', color: '#8b5cf6' },
            ].map(({ val, label, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color }}>{val}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 24 }}>
            {sent > 0 ? `${sent} personalized follow-up email${sent !== 1 ? 's' : ''} sent. Replies will auto-classify and update lead status.` : 'No emails sent this session.'}
          </div>
          <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[current?.status ?? ''] ?? '#6b7280';
  const isOverdue = current?.followupDueAt ? new Date(current.followupDueAt) < new Date() : false;
  const isBusy = sendMut.isPending || snoozeMut.isPending;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface-1)', border: '1px solid var(--border-subtle)',
          borderRadius: 16, padding: '0', maxWidth: 600, width: '95vw',
          maxHeight: '92vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>⚡ Email Blitz</span>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 99,
              background: 'rgba(244,85,28,0.15)', color: '#f4551c', fontWeight: 700,
            }}>
              {idx + 1} of {total}
            </span>
          </div>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, padding: '4px 8px' }}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'var(--surface-3)', flexShrink: 0 }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: '#f4551c', transition: 'width 0.3s ease',
          }} />
        </div>

        <div style={{ padding: '20px', flex: 1 }}>
          {/* Lead info card */}
          <div style={{
            background: 'var(--surface-2)',
            border: `1px solid var(--border-subtle)`,
            borderLeft: `4px solid ${statusColor}`,
            borderRadius: 10, padding: '14px 16px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {current?.company}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700,
                    background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44`,
                  }}>
                    {STATUS_LABELS[current?.status ?? ''] ?? current?.status}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    {CAT_LABELS[current?.category ?? ''] ?? current?.category}
                  </span>
                  {current?.state && (
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{current.state}</span>
                  )}
                  {current?.fleetSize && (
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{current.fleetSize} vehicles</span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {isOverdue ? (
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700,
                    background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                  }}>
                    OVERDUE
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    {Math.round(current?.daysSinceContact ?? 0)}d since contact
                  </span>
                )}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              → {current?.email}
              {current?.contactName && ` · ${current.contactName}`}
              {current?.recentEmailCount ? ` · ${current.recentEmailCount} email${current.recentEmailCount !== 1 ? 's' : ''} in 30d` : ''}
            </div>
          </div>

          {/* Email compose area */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)' }}>
                Subject
              </label>
              {generating && (
                <span style={{ fontSize: 11, color: '#f4551c', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="spinner" style={{ width: 10, height: 10 }} />
                  AI generating…
                </span>
              )}
              {genError && (
                <button
                  style={{ fontSize: 11, color: '#f4551c', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => current && generateEmail(current)}
                >
                  ↺ Retry
                </button>
              )}
              {!generating && !genError && subject && (
                <button
                  style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => current && generateEmail(current)}
                >
                  ↺ Regenerate
                </button>
              )}
            </div>
            <input
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={generating ? 'Generating subject…' : genError ? 'AI unavailable — type subject manually' : ''}
              style={{ marginBottom: 10 }}
            />
            <textarea
              className="input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                generating ? 'Generating email body…' :
                genError ? 'AI unavailable — type your follow-up email here' :
                'Follow-up email body'
              }
              rows={7}
              style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              style={{ fontSize: 12, padding: '6px 12px', color: '#8b5cf6', borderColor: 'rgba(139,92,246,0.4)' }}
              onClick={() => snoozeMut.mutate()}
              disabled={isBusy}
              title="Snooze this lead for 2 weeks"
            >
              💤 Snooze 2wk
            </button>
            <button
              className="btn"
              style={{ flex: 1, fontSize: 12, padding: '6px 12px', justifyContent: 'center' }}
              onClick={skip}
              disabled={isBusy}
            >
              Skip →
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 2, justifyContent: 'center', fontSize: 13, fontWeight: 700 }}
              onClick={() => sendMut.mutate()}
              disabled={isBusy || !subject.trim() || !body.trim() || generating}
            >
              {sendMut.isPending ? (
                <><span className="spinner" style={{ width: 14, height: 14 }} /> Sending…</>
              ) : (
                `⚡ Send & Next${idx + 1 >= total ? '' : ` (${total - idx - 1} left)`}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
