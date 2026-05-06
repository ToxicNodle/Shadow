import { useState } from 'react';
import type { Lead } from '../../../api/types';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';

interface Props {
  lead: Lead;
}

const EMAIL_TYPES = ['Introduction', 'Follow-up', 'Fleet Proposal', 'Re-engage'];
const TONES = ['Professional', 'Friendly', 'Direct', 'Consultative'];

export default function EmailTab({ lead }: Props) {
  const settings = useAppStore((s) => s.settings);
  const showToast = useAppStore((s) => s.showToast);
  const setApolloOpen = useAppStore((s) => s.setApolloOpen);
  const setApolloLeadId = useAppStore((s) => s.setApolloLeadId);

  const [emailType, setEmailType] = useState(EMAIL_TYPES[0]);
  const [tone, setTone] = useState(TONES[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);

  async function generate() {
    setLoading(true);
    setResult(null);
    try {
      const data = await api.generateEmail({ lead, emailType, tone, settings });
      setResult(data);
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    if (!result) return;
    const text = `Subject: ${result.subject}\n\n${result.body}`;
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
  }

  function openMailTo() {
    if (!result || !lead.email) return;
    const url = `mailto:${lead.email}?subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(result.body)}`;
    window.open(url, '_blank');
  }

  function openApollo() {
    setApolloLeadId(lead.id);
    setApolloOpen(true);
  }

  return (
    <div>
      <div className="field-group">
        <label className="field-label">Email Type</label>
        <div className="chip-group">
          {EMAIL_TYPES.map((t) => (
            <button key={t} className={`chip ${emailType === t ? 'active' : ''}`} onClick={() => setEmailType(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Tone</label>
        <div className="chip-group">
          {TONES.map((t) => (
            <button key={t} className={`chip ${tone === t ? 'active' : ''}`} onClick={() => setTone(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {!lead.email && (
        <button className="apollo-find-btn" onClick={openApollo}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Find contact email with Apollo
        </button>
      )}

      <button className="generate-btn" onClick={generate} disabled={loading}>
        {loading ? <><span className="spinner" /> Generating…</> : '⚡ Generate Email'}
      </button>

      {result && (
        <div className="email-preview">
          <div className="email-subject-row">
            <span className="label">Sub</span>
            <span className="subject">{result.subject}</span>
          </div>
          <div className="email-body">{result.body}</div>
          <div className="email-actions">
            <button className="btn" onClick={copyToClipboard}>Copy</button>
            {lead.email && (
              <button className="btn btn-primary" onClick={openMailTo}>Open in Mail</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
