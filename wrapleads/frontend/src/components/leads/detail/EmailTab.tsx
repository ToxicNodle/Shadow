import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Lead } from '../../../api/types';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';

interface Props {
  lead: Lead;
}

const EMAIL_TYPES = ['Introduction', 'Follow-up', 'Fleet Proposal', 'Re-engage'];
const TONES = ['Professional', 'Friendly', 'Direct', 'Consultative'];

type TabMode = 'single' | 'sequence';

interface SequenceEmail {
  day: number;
  label: string;
  subject: string;
  body: string;
}

export default function EmailTab({ lead }: Props) {
  const qc = useQueryClient();
  const { settings, showToast, setApolloOpen, setApolloLeadId, setSettingsOpen } = useAppStore((s) => ({
    settings: s.settings,
    showToast: s.showToast,
    setApolloOpen: s.setApolloOpen,
    setApolloLeadId: s.setApolloLeadId,
    setSettingsOpen: s.setSettingsOpen,
  }));

  const [tabMode, setTabMode] = useState<TabMode>('single');
  const [emailType, setEmailType] = useState(EMAIL_TYPES[0]);
  const [tone, setTone] = useState(TONES[0]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);
  const [sequence, setSequence] = useState<SequenceEmail[] | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const settingsIncomplete = !settings.senderName.trim() || !settings.companyName.trim();

  async function generate() {
    if (settingsIncomplete) return;
    setLoading(true);
    setResult(null);
    setSequence(null);
    try {
      if (tabMode === 'single') {
        const data = await api.generateEmail({ lead, emailType, tone, settings });
        setResult(data);
      } else {
        const data = await api.generateSequence({ lead, tone, settings });
        setSequence(data.emails);
      }
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string, idx?: number) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard');
      if (idx !== undefined) { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 1800); }
    });
  }

  function openMailTo() {
    if (!result || !lead.email) return;
    const url = `mailto:${lead.email}?subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(result.body)}`;
    window.open(url, '_blank');
  }

  async function sendEmail() {
    if (!result || !lead.email || !lead.serverId) return;
    setSending(true);
    try {
      await api.sendEmail(lead.serverId, {
        subject: result.subject,
        body: result.body,
        toEmail: lead.email,
        toName: lead.contactName || undefined,
      });
      qc.invalidateQueries({ queryKey: ['activities', lead.serverId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      showToast('Email sent!');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      if (msg.includes('RESEND_API_KEY')) {
        // Fall back to copying — log it anyway
        copy(`Subject: ${result.subject}\n\n${result.body}`);
        showToast('Resend not configured — copied to clipboard instead');
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setSending(false);
    }
  }

  function openApollo() {
    setApolloLeadId(lead.id);
    setApolloOpen(true);
  }

  return (
    <div>
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: 'var(--bg-input)', borderRadius: 8, padding: 4 }}>
        {(['single', 'sequence'] as TabMode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setTabMode(m); setResult(null); setSequence(null); }}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: tabMode === m ? 'var(--accent)' : 'transparent',
              color: tabMode === m ? '#fff' : 'var(--text-dim)',
              transition: 'all 0.15s',
            }}
          >
            {m === 'single' ? '✉ Single Email' : '📅 3-Email Sequence'}
          </button>
        ))}
      </div>

      {tabMode === 'single' && (
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
      )}

      {tabMode === 'sequence' && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.5, padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 6 }}>
          Generates a 3-email drip: Day 1 intro, Day 4 value follow-up, Day 9 closing nudge — tailored to {lead.company}.
        </div>
      )}

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

      {settingsIncomplete && (
        <div style={{
          background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.3)',
          borderRadius: 8, padding: '12px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <span style={{ fontSize: 13, color: 'var(--yellow)', lineHeight: 1.4 }}>
            Add your name &amp; company in Settings for better emails.
          </span>
          <button className="btn" style={{ fontSize: 12, padding: '5px 10px', flexShrink: 0 }} onClick={() => setSettingsOpen(true)}>
            Open Settings
          </button>
        </div>
      )}

      <button className="generate-btn" onClick={generate} disabled={loading}>
        {loading
          ? <><span className="spinner" /> {tabMode === 'sequence' ? 'Building sequence…' : 'Generating…'}</>
          : tabMode === 'sequence' ? '📅 Generate 3-Email Sequence' : '⚡ Generate Email'}
      </button>

      {/* Single email result */}
      {result && (
        <div className="email-preview">
          <div className="email-subject-row">
            <span className="label">Sub</span>
            <span className="subject">{result.subject}</span>
          </div>
          <div className="email-body">{result.body}</div>
          <div className="email-actions">
            <button className="btn" onClick={() => copy(`Subject: ${result.subject}\n\n${result.body}`)}>Copy</button>
            {lead.email && (
              <>
                <button className="btn btn-primary" onClick={sendEmail} disabled={sending}>
                  {sending ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 5 }} />Sending…</> : '⚡ Send Email'}
                </button>
                <button className="btn" onClick={openMailTo} title="Open in your email client">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Open in Mail
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sequence results */}
      {sequence && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sequence.map((email, i) => (
            <div key={i} style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    background: 'var(--accent)', color: '#fff', borderRadius: 4,
                    fontSize: 11, fontWeight: 700, padding: '2px 7px',
                  }}>
                    Day {email.day}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>{email.label}</span>
                </div>
                <button
                  className="btn"
                  style={{ fontSize: 11, padding: '3px 9px' }}
                  onClick={() => copy(`Subject: ${email.subject}\n\n${email.body}`, i)}
                >
                  {copiedIdx === i ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                <strong style={{ color: 'var(--text)' }}>Subject:</strong> {email.subject}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                {email.body}
              </div>
            </div>
          ))}

          <button
            className="btn"
            style={{ fontSize: 12 }}
            onClick={() => {
              const text = sequence.map((e) =>
                `--- Day ${e.day}: ${e.label} ---\nSubject: ${e.subject}\n\n${e.body}`
              ).join('\n\n');
              copy(text);
            }}
          >
            Copy All 3 Emails
          </button>
        </div>
      )}
    </div>
  );
}
