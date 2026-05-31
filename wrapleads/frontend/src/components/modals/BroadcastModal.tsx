import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Lead } from '../../api/types';

interface Props {
  leads: Lead[];
  onClose: () => void;
  onSent: () => void;
}

type Preview = {
  leadId: number;
  company: string;
  contactName: string | null;
  email: string | null;
  aiOpener: string;
  fullBody: string;
};

export default function BroadcastModal({ leads, onClose, onSent }: Props) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [aiPersonalize, setAiPersonalize] = useState(false);
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [expandedPreview, setExpandedPreview] = useState<number | null>(null);
  const [result, setResult] = useState<{ sent: number; skipped: number; errors: number } | null>(null);
  const [sendError, setSendError] = useState('');

  const withEmail = leads.filter((l) => l.email);
  const leadServerIds = leads.filter((l) => l.serverId).map((l) => l.serverId!);

  const previewMut = useMutation({
    mutationFn: () => api.previewAIBroadcast(leadServerIds, subject, body),
    onSuccess: (data) => setPreviews(data.previews),
    onError: (e: Error) => setSendError(e.message || 'Preview failed'),
  });

  const sendMut = useMutation({
    mutationFn: () => api.broadcastEmail(leadServerIds, subject, body, aiPersonalize),
    onSuccess: (data) => {
      setResult(data);
      setTimeout(onSent, 2500);
    },
    onError: (e: Error) => setSendError(e.message || 'Broadcast failed — check your Resend API key in Settings.'),
  });

  const canSend = subject.trim() && body.trim() && withEmail.length > 0 && !sendMut.isPending;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Broadcast Email</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="broadcast-recipient-strip">
            <span className="broadcast-recipient-count">{leads.length} leads selected</span>
            <span className="broadcast-recipient-email">
              {withEmail.length} have email · {leads.length - withEmail.length} will be skipped
            </span>
          </div>

          {result ? (
            <div className="broadcast-result">
              <div style={{ color: 'var(--green)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
                  <circle cx="12" cy="12" r="10"/><polyline points="16 8 10 14 7 11"/>
                </svg>
              </div>
              <p style={{ fontWeight: 700, margin: '8px 0 4px' }}>
                {aiPersonalize ? 'AI-personalized broadcast sent!' : 'Broadcast sent!'}
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                {result.sent} sent · {result.skipped} skipped (no email) · {result.errors} errors
              </p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                Use <code>{'{{company}}'}</code> and <code>{'{{name}}'}</code> for personalization.
              </p>
              <div className="field-group">
                <label className="field-label">Subject</label>
                <input
                  className="input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Summer wrap special — limited slots available"
                />
              </div>
              <div className="field-group">
                <label className="field-label">Message</label>
                <textarea
                  className="input"
                  rows={7}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={`Hi {{name}},\n\nJust wanted to reach out to {{company}} about an upcoming promotion…`}
                />
              </div>

              {/* AI Personalize toggle */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 8,
                background: aiPersonalize ? 'rgba(77,138,245,0.1)' : 'var(--surface-2)',
                border: `1px solid ${aiPersonalize ? 'rgba(77,138,245,0.35)' : 'var(--border-subtle)'}`,
                transition: 'all 0.2s',
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: aiPersonalize ? '#4d8af5' : 'var(--text)', marginBottom: 2 }}>
                    AI Personalize
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Claude generates a unique opener for each lead based on their data
                  </div>
                </div>
                <button
                  onClick={() => { setAiPersonalize(!aiPersonalize); setPreviews(null); }}
                  style={{
                    width: 40, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer',
                    background: aiPersonalize ? '#4d8af5' : 'var(--border)',
                    position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3, left: aiPersonalize ? 21 : 3,
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </button>
              </div>

              {/* AI Preview section */}
              {aiPersonalize && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4d8af5', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Preview (first 3 leads)
                    </span>
                    <button
                      onClick={() => previewMut.mutate()}
                      disabled={!subject.trim() || !body.trim() || previewMut.isPending}
                      style={{
                        background: 'rgba(77,138,245,0.15)', color: '#4d8af5', border: '1px solid rgba(77,138,245,0.3)',
                        borderRadius: 5, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        opacity: (!subject.trim() || !body.trim() || previewMut.isPending) ? 0.5 : 1,
                      }}
                    >
                      {previewMut.isPending ? 'Generating…' : 'Generate Preview'}
                    </button>
                  </div>

                  {previews && previews.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {previews.map((p, i) => (
                        <div
                          key={p.leadId}
                          style={{
                            background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
                            borderRadius: 7, overflow: 'hidden',
                          }}
                        >
                          <button
                            onClick={() => setExpandedPreview(expandedPreview === i ? null : i)}
                            style={{
                              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                              padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                            }}
                          >
                            <div style={{
                              width: 24, height: 24, borderRadius: 6,
                              background: 'rgba(77,138,245,0.15)', color: '#4d8af5',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 800, flexShrink: 0,
                            }}>
                              {p.company.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{p.company}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.aiOpener}
                              </div>
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{expandedPreview === i ? '▲' : '▼'}</span>
                          </button>
                          {expandedPreview === i && (
                            <div style={{
                              padding: '0 12px 12px', borderTop: '1px solid var(--border-subtle)',
                              fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                              maxHeight: 200, overflowY: 'auto',
                            }}>
                              <div style={{ paddingTop: 10 }}>{p.fullBody}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {sendError && <div className="error-box">{sendError}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={onClose}>Cancel</button>
                <button
                  className="btn btn-primary"
                  disabled={!canSend}
                  onClick={() => sendMut.mutate()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {aiPersonalize && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  )}
                  {sendMut.isPending
                    ? `Sending to ${withEmail.length}…`
                    : aiPersonalize
                    ? `AI-Send to ${withEmail.length} leads`
                    : `Send to ${withEmail.length} leads`
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
