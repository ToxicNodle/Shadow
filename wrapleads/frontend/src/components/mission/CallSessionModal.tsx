import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';

interface CallReadyLead {
  id: number;   // server ID
  company: string;
  category: string;
  email?: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  last_contacted: string | null;
  emails_sent: number;
}

interface Script {
  opening: string;
  pitch: string;
  objections: { q: string; a: string }[];
  close: string;
}

type Outcome = 'no_answer' | 'voicemail' | 'interested' | 'not_interested' | 'wrong_number' | 'callback';

const OUTCOMES: { value: Outcome; label: string; color: string; newStatus?: string }[] = [
  { value: 'no_answer',      label: 'No Answer',          color: 'var(--text-muted)',   newStatus: 'contacted' },
  { value: 'voicemail',      label: 'Left Voicemail',      color: '#6366f1' },
  { value: 'interested',     label: 'Connected — Interested', color: '#22c55e',         newStatus: 'replied' },
  { value: 'not_interested', label: 'Not Interested',      color: '#ef4444',            newStatus: 'cold' },
  { value: 'callback',       label: 'Callback Requested',  color: '#f59e0b',            newStatus: 'replied' },
  { value: 'wrong_number',   label: 'Wrong Number',        color: 'var(--text-faint)' },
];

const OUTCOME_NOTE: Record<Outcome, string> = {
  no_answer:      'Called — no answer.',
  voicemail:      'Left voicemail.',
  interested:     'Connected — prospect is interested. Follow up needed.',
  not_interested: 'Connected — not interested at this time.',
  callback:       'Connected — requested a callback.',
  wrong_number:   'Wrong number — update contact info.',
};

interface Props {
  leads: CallReadyLead[];
  onClose: () => void;
}

export default function CallSessionModal({ leads, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const [script, setScript] = useState<Script | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [showObjIdx, setShowObjIdx] = useState<number | null>(null);
  const [sessionLog, setSessionLog] = useState<{ company: string; outcome: string }[]>([]);
  const [done, setDone] = useState(false);
  const [followupLead, setFollowupLead] = useState<CallReadyLead | null>(null);
  const [followupSending, setFollowupSending] = useState<string | null>(null);
  const { leads: crmLeads } = useLeads();
  const showToast = useAppStore((s) => s.showToast);
  const qc = useQueryClient();

  const current = leads[idx] ?? null;
  const crmLead = crmLeads.find((l) => l.serverId === current?.id);

  const logMut = useMutation({
    mutationFn: ({ serverId, type, body }: { serverId: number; type: string; body: string }) =>
      api.logActivity(serverId, { type, subject: 'Call Session', body }),
  });

  const updateMut = useMutation({
    mutationFn: ({ serverId, patch }: { serverId: number; patch: Partial<{ status: string }> }) =>
      api.updateLead(serverId, patch as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });

  useEffect(() => {
    if (!current?.id) return;
    setScript(null);
    setShowObjIdx(null);
    setScriptLoading(true);
    api.generateCallScript(current.id)
      .then((r) => { if (r.script) setScript(r.script); })
      .catch(() => {})
      .finally(() => setScriptLoading(false));
  }, [idx, current?.id]);

  function advanceAfterOutcome(_lead: CallReadyLead) {
    if (idx + 1 >= leads.length) {
      setDone(true);
    } else {
      setIdx((i) => i + 1);
    }
  }

  async function logOutcome(outcome: Outcome) {
    if (!current) return;
    const conf = OUTCOMES.find((o) => o.value === outcome)!;
    const note = OUTCOME_NOTE[outcome];

    await logMut.mutateAsync({ serverId: current.id, type: 'call_logged', body: note });

    if (conf.newStatus && crmLead?.serverId) {
      updateMut.mutate({ serverId: crmLead.serverId, patch: { status: conf.newStatus } });
    }

    setSessionLog((prev) => [...prev, { company: current.company, outcome: conf.label }]);
    showToast(`${current.company}: ${conf.label}`);

    // Show post-call follow-up for hot outcomes before advancing
    if (outcome === 'interested' || outcome === 'callback') {
      setFollowupLead(current);
    } else {
      advanceAfterOutcome(current);
    }
  }

  async function sendFollowupSms(lead: CallReadyLead) {
    if (!lead.phone) { showToast('No phone number on file', 'error'); return; }
    setFollowupSending('sms');
    try {
      const crmL = crmLeads.find((l) => l.serverId === lead.id);
      const settings = await api.getSettings();
      const portfolio = (settings as any)?.shopToken
        ? `https://wrapos.app/portfolio/${(settings as any).shopToken}`
        : '';
      const firstName = (crmL?.contactName || '').split(' ')[0] || 'there';
      const msg = `Hi ${firstName}! Great talking with you. Here's our portfolio for ${lead.company}: ${portfolio || '[portfolio link]'} — let me know if you have questions!`;
      await api.sendSms(lead.id, msg);
      showToast('Portfolio SMS sent!');
    } catch (e: any) {
      showToast(e.message || 'SMS failed', 'error');
    } finally {
      setFollowupSending(null);
      setFollowupLead(null);
      advanceAfterOutcome(lead);
    }
  }

  async function sendFollowupEmail(lead: CallReadyLead) {
    const crmL = crmLeads.find((l) => l.serverId === lead.id);
    const toEmail = crmL?.email ?? lead.email;
    if (!toEmail) { showToast('No email on file', 'error'); return; }
    setFollowupSending('email');
    try {
      const firstName = (crmL?.contactName || '').split(' ')[0] || 'there';
      const settings = await api.getSettings();
      const portfolio = (settings as any)?.shopToken
        ? `https://wrapos.app/portfolio/${(settings as any).shopToken}`
        : '';
      const senderName = (settings as any)?.senderName || 'your rep';
      const shopName = (settings as any)?.companyName || 'us';
      await api.sendEmail(lead.id, {
        subject: `Great talking with you, ${firstName}!`,
        body: `Hi ${firstName},\n\nReally enjoyed our conversation today about ${lead.company}. As promised, here's our portfolio for your review:${portfolio ? `\n\n${portfolio}` : ''}\n\nI'll follow up in a couple of days, but feel free to reach out anytime.\n\n${senderName}\n${shopName}`,
        toEmail,
        toName: crmL?.contactName || undefined,
      });
      showToast('Follow-up email sent!');
    } catch (e: any) {
      showToast(e.message || 'Email failed', 'error');
    } finally {
      setFollowupSending(null);
      setFollowupLead(null);
      advanceAfterOutcome(lead);
    }
  }

  function skipFollowup() {
    const lead = followupLead;
    setFollowupLead(null);
    if (lead) advanceAfterOutcome(lead);
  }

  function skipLead() {
    if (idx + 1 >= leads.length) { setDone(true); return; }
    setIdx((i) => i + 1);
  }

  if (done) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">Session Complete 🎯</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
          <div style={{ padding: '16px 24px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
              You called {sessionLog.length} lead{sessionLog.length !== 1 ? 's' : ''} this session.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              {sessionLog.map((entry, i) => {
                const conf = OUTCOMES.find((o) => o.label === entry.outcome);
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: conf?.color ?? 'var(--text-muted)', fontWeight: 700, minWidth: 24 }}>✓</span>
                    <span style={{ flex: 1, color: 'var(--text)' }}>{entry.company}</span>
                    <span style={{ color: conf?.color ?? 'var(--text-muted)' }}>{entry.outcome}</span>
                  </div>
                );
              })}
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!current && !followupLead) {
    return null;
  }

  // Post-call follow-up panel for hot outcomes
  if (followupLead) {
    const hasPhone = !!followupLead.phone;
    const hasCrmEmail = !!(crmLeads.find((l) => l.serverId === followupLead.id)?.email ?? followupLead.email);
    return (
      <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: 32 }} onClick={skipFollowup}>
        <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: 'rgba(34,197,94,.15)', borderRadius: 8, padding: '4px 10px' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                  Strike while hot 🔥
                </span>
              </div>
            </div>
            <button className="modal-close" onClick={skipFollowup}>✕</button>
          </div>
          <div style={{ padding: '16px 24px 24px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
              {followupLead.company}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
              They're interested — follow up now while the conversation is fresh.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {hasPhone && (
                <button
                  className="btn"
                  disabled={!!followupSending}
                  onClick={() => sendFollowupSms(followupLead)}
                  style={{
                    justifyContent: 'flex-start', fontSize: 13, padding: '12px 16px',
                    background: 'rgba(0,217,126,0.08)', borderColor: 'rgba(0,217,126,0.3)',
                    color: '#00d97e',
                  }}
                >
                  {followupSending === 'sms' ? '…Sending' : '📱 Send Portfolio SMS'}
                  <span style={{ fontSize: 10, marginLeft: 'auto', color: 'var(--text-faint)' }}>with portfolio link</span>
                </button>
              )}
              {hasCrmEmail && (
                <button
                  className="btn"
                  disabled={!!followupSending}
                  onClick={() => sendFollowupEmail(followupLead)}
                  style={{
                    justifyContent: 'flex-start', fontSize: 13, padding: '12px 16px',
                    background: 'rgba(77,138,245,0.08)', borderColor: 'rgba(77,138,245,0.3)',
                    color: '#4d8af5',
                  }}
                >
                  {followupSending === 'email' ? '…Sending' : '📧 Send Follow-up Email'}
                  <span style={{ fontSize: 10, marginLeft: 'auto', color: 'var(--text-faint)' }}>portfolio + thanks</span>
                </button>
              )}
              {!hasPhone && !hasCrmEmail && (
                <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 0' }}>
                  No phone or email on file — add contact info to the lead to send follow-ups.
                </div>
              )}
              <button
                className="btn"
                disabled={!!followupSending}
                onClick={skipFollowup}
                style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}
              >
                Skip → Next Lead
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: 32 }} onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 600, maxHeight: 'calc(100vh - 64px)', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'rgba(34,197,94,.15)', borderRadius: 8, padding: '4px 10px' }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                Call Session
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{idx + 1} of {leads.length}</span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'var(--border)', margin: '0 24px' }}>
          <div style={{
            height: '100%', background: '#22c55e', borderRadius: 99,
            width: `${((idx) / leads.length) * 100}%`, transition: 'width 0.3s ease',
          }} />
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Lead Info */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.5px', marginBottom: 4 }}>
                {current.company}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {current.city && current.state && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{current.city}, {current.state}</span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'capitalize' }}>{current.category}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{current.emails_sent ?? 3} emails sent</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {current.phone ? (
                <a
                  href={`tel:${current.phone}`}
                  className="btn btn-primary"
                  style={{ fontSize: 14, padding: '8px 16px', textDecoration: 'none' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/>
                  </svg>
                  Call {current.phone}
                </a>
              ) : (
                <span style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,.12)', padding: '4px 10px', borderRadius: 6 }}>
                  No phone number
                </span>
              )}
            </div>
          </div>

          {/* Call Script */}
          <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-faint)', marginBottom: 12 }}>
              AI Call Script
              {scriptLoading && <span className="spinner" style={{ width: 10, height: 10, marginLeft: 8 }} />}
            </div>
            {script ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#4d8af5', textTransform: 'uppercase', marginBottom: 4 }}>Opening</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, fontStyle: 'italic' }}>"{script.opening}"</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#4d8af5', textTransform: 'uppercase', marginBottom: 4 }}>Pitch</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{script.pitch}</div>
                </div>
                {script.objections?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 6 }}>
                      Common Objections
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {script.objections.map((obj, i) => (
                        <div key={i}>
                          <button
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                              fontSize: 11, color: 'var(--text-muted)', padding: '3px 0', width: '100%',
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}
                            onClick={() => setShowObjIdx(showObjIdx === i ? null : i)}
                          >
                            <span style={{ color: '#f59e0b' }}>{showObjIdx === i ? '▾' : '▸'}</span>
                            {obj.q}
                          </button>
                          {showObjIdx === i && (
                            <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.6, padding: '4px 0 4px 14px', fontStyle: 'italic', borderLeft: '2px solid #f59e0b', marginLeft: 6 }}>
                              "{obj.a}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', marginBottom: 4 }}>Close</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, fontStyle: 'italic' }}>"{script.close}"</div>
                </div>
              </div>
            ) : !scriptLoading ? (
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Add ANTHROPIC_API_KEY to enable AI call scripts.</div>
            ) : null}
          </div>

          {/* Outcome buttons */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-faint)', marginBottom: 10 }}>
              Log Outcome
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  className="btn"
                  style={{
                    justifyContent: 'flex-start', fontSize: 12, padding: '10px 14px',
                    borderColor: o.color + '44', color: o.color,
                    background: o.color + '0a',
                  }}
                  onClick={() => logOutcome(o.value)}
                  disabled={logMut.isPending}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Skip */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button className="btn" style={{ fontSize: 11, color: 'var(--text-faint)' }} onClick={skipLead}>
              Skip this lead →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
