import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Lead } from '../../api/types';

interface Props {
  leads: Lead[];
  onClose: () => void;
  onSent: () => void;
}

export default function BroadcastModal({ leads, onClose, onSent }: Props) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<{ sent: number; skipped: number; errors: number } | null>(null);

  const withEmail = leads.filter((l) => l.email);

  const sendMut = useMutation({
    mutationFn: () => api.broadcastEmail(
      leads.filter((l) => l.serverId).map((l) => l.serverId!),
      subject,
      body
    ),
    onSuccess: (data) => {
      setResult(data);
      setTimeout(onSent, 2500);
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📢 Broadcast Email</h2>
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
              <span style={{ fontSize: 28 }}>✅</span>
              <p style={{ fontWeight: 700, margin: '8px 0 4px' }}>Broadcast sent!</p>
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
                  rows={8}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={`Hi {{name}},\n\nJust wanted to reach out to {{company}} about an upcoming promotion…`}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={onClose}>Cancel</button>
                <button
                  className="btn btn-primary"
                  disabled={!subject.trim() || !body.trim() || !withEmail.length || sendMut.isPending}
                  onClick={() => sendMut.mutate()}
                >
                  {sendMut.isPending ? `Sending to ${withEmail.length}…` : `Send to ${withEmail.length} leads`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
