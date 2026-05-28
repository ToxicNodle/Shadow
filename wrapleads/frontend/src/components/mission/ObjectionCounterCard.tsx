import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const INTENT_LABEL: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  price_question: { label: 'Pricing Objection', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: '💲' },
  not_now:        { label: 'Not Right Now',     color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: '⏳' },
  negative:       { label: 'Skeptical / No',    color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: '❌' },
};

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

interface CounterModalProps {
  leadId: number;
  company: string;
  contactName: string | null;
  intent: string;
  objectionText: string | null;
  onClose: () => void;
}

function CounterModal({ leadId, company, contactName, intent, objectionText, onClose }: CounterModalProps) {
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [tip, setTip] = useState<string | null>(null);
  const [copied, setCopied] = useState<'subject' | 'body' | null>(null);
  const showToast = useAppStore((s) => s.showToast);
  const setPendingOpenLeadServerId = useAppStore((s) => s.setPendingOpenLeadServerId);
  const setMode = useAppStore((s) => s.setMode);

  const mut = useMutation({
    mutationFn: () => api.counterObjection(leadId, intent, objectionText ?? undefined),
    onSuccess: (data) => {
      setSubject(data.subject);
      setBody(data.body);
      setTip(data.tip);
    },
  });

  function copy(what: 'subject' | 'body') {
    const text = what === 'subject' ? subject : body;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function openLead() {
    setPendingOpenLeadServerId(leadId);
    setMode('leads');
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 560,
        border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ fontSize: 18 }}>🛡️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Counter: {company}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {contactName ? `${contactName} · ` : ''}{INTENT_LABEL[intent]?.label}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-faint)', lineHeight: 1 }}>×</button>
        </div>

        {!subject && (
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: 16 }}
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
          >
            {mut.isPending ? 'Generating counter…' : '✨ Generate Counter-Response'}
          </button>
        )}

        {mut.isError && (
          <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>
            Failed to generate: {(mut.error as Error).message}
          </div>
        )}

        {subject && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Subject</label>
                <button
                  onClick={() => copy('subject')}
                  style={{ fontSize: 11, color: copied === 'subject' ? '#10b981' : '#4d8af5', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {copied === 'subject' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <input
                className="form-control"
                style={{ fontSize: 13, fontWeight: 600 }}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: tip ? 12 : 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Email Body</label>
                <button
                  onClick={() => copy('body')}
                  style={{ fontSize: 11, color: copied === 'body' ? '#10b981' : '#4d8af5', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {copied === 'body' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <textarea
                className="form-control"
                rows={8}
                style={{ fontSize: 13, lineHeight: 1.6, resize: 'vertical' }}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>

            {tip && (
              <div style={{
                fontSize: 11, color: '#4d8af5', fontStyle: 'italic',
                background: 'rgba(77,138,245,0.07)', borderRadius: 8, padding: '8px 12px', marginBottom: 16,
                borderLeft: '3px solid #4d8af5',
              }}>
                {tip}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  copy('body');
                  showToast('Email body copied to clipboard', 'success');
                  openLead();
                }}
              >
                Copy & Open Lead →
              </button>
              <button
                className="btn"
                onClick={() => mut.mutate()}
                disabled={mut.isPending}
                style={{ fontSize: 12 }}
              >
                Regenerate
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ObjectionCounterCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['mission-objections'],
    queryFn: () => api.getObjections(),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const setPendingOpenLeadServerId = useAppStore((s) => s.setPendingOpenLeadServerId);
  const setMode = useAppStore((s) => s.setMode);

  const [active, setActive] = useState<{
    leadId: number; company: string; contactName: string | null;
    intent: string; objectionText: string | null;
  } | null>(null);

  const objections = data?.objections ?? [];
  if (!isLoading && objections.length === 0) return null;

  if (isLoading) {
    return (
      <div className="mission-card" style={{ borderLeftColor: '#f59e0b' }}>
        <div className="skeleton" style={{ height: 48, borderRadius: 6 }} />
      </div>
    );
  }

  return (
    <>
      <div className="mission-card" style={{ borderLeftColor: '#f59e0b', background: 'rgba(245,158,11,0.02)' }}>
        <div className="mission-card-header" style={{ marginBottom: 12 }}>
          <span className="mission-card-icon" style={{ color: '#f59e0b' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </span>
          <span className="mission-card-title">Objection Inbox</span>
          <span className="mission-badge" style={{ background: '#f59e0b', color: '#fff' }}>{objections.length}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>last 21 days</span>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Leads who replied with a pricing question, objection, or "not now." Click counter to generate an AI re-engagement email.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {objections.map((obj) => {
            const meta = INTENT_LABEL[obj.intent] || INTENT_LABEL.negative;
            return (
              <div
                key={obj.activityId}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8,
                  background: 'var(--bg-elev)',
                  border: `1px solid ${meta.color}22`,
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>{meta.icon}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {obj.company}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {obj.summary ? obj.summary.slice(0, 55) + (obj.summary.length > 55 ? '…' : '') : meta.label} · {timeAgo(obj.receivedAt)}
                  </div>
                </div>

                <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, background: meta.bg, padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>
                  {meta.label}
                </span>

                <button
                  className="btn"
                  style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0, color: '#4d8af5', borderColor: 'rgba(77,138,245,0.3)' }}
                  onClick={() => setActive({
                    leadId: obj.leadId,
                    company: obj.company,
                    contactName: obj.contactName,
                    intent: obj.intent,
                    objectionText: obj.summary || obj.body,
                  })}
                >
                  Counter →
                </button>

                <button
                  onClick={() => { setPendingOpenLeadServerId(obj.leadId); setMode('leads'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}
                  title="Open lead"
                >
                  ↗
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {active && (
        <CounterModal
          leadId={active.leadId}
          company={active.company}
          contactName={active.contactName}
          intent={active.intent}
          objectionText={active.objectionText}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
