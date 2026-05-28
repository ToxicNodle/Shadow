import { useState, useRef } from 'react';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';

interface SmartFollowupLead {
  serverId: number;
  company: string;
  contactName: string | null;
  status: string;
  email: string | null;
}

interface Props {
  lead: SmartFollowupLead;
  /** Called when user clicks "Use This Draft" so EmailTab can pre-populate */
  onUseDraft?: (subject: string, body: string) => void;
}

type ResultState = {
  ok: boolean;
  fallback: boolean;
  subject: string;
  body: string;
  tone: string;
  reasoningNote: string;
};

export default function SmartFollowupButton({ lead, onUseDraft }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editableBody, setEditableBody] = useState('');
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  async function handleGenerate() {
    if (!lead.serverId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.generateSmartFollowup(lead.serverId);
      setResult(data);
      setEditableBody(data.body);
      setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function copyText(text: string, which: 'subject' | 'body') {
    navigator.clipboard.writeText(text).then(() => {
      if (which === 'subject') {
        setCopiedSubject(true);
        setTimeout(() => setCopiedSubject(false), 1800);
      } else {
        setCopiedBody(true);
        setTimeout(() => setCopiedBody(false), 1800);
      }
      showToast('Copied to clipboard');
    });
  }

  function handleUseDraft() {
    if (!result) return;
    if (onUseDraft) {
      onUseDraft(result.subject, editableBody);
      showToast('Draft loaded into composer');
    } else {
      // Fallback: copy full draft to clipboard
      copyText(`Subject: ${result.subject}\n\n${editableBody}`, 'body');
      showToast('Draft copied to clipboard');
    }
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        onClick={handleGenerate}
        disabled={loading}
        style={{
          width: '100%',
          padding: '9px 14px',
          borderRadius: 8,
          border: '1px solid rgba(77,138,245,0.4)',
          background: loading
            ? 'rgba(77,138,245,0.08)'
            : 'linear-gradient(135deg, rgba(77,138,245,0.18), rgba(77,138,245,0.08))',
          color: '#4d8af5',
          fontSize: 13,
          fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          transition: 'all 0.15s',
        }}
      >
        {loading ? (
          <>
            <span className="spinner" style={{ width: 13, height: 13, borderColor: '#4d8af5', borderTopColor: 'transparent' }} />
            Analyzing relationship history…
          </>
        ) : (
          <>
            <span style={{ fontSize: 15 }}>✨</span>
            Smart Follow-up
          </>
        )}
      </button>

      {error && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 6,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          fontSize: 12, color: '#ef4444',
        }}>
          {error}
        </div>
      )}

      {result && (
        <div
          ref={previewRef}
          style={{
            marginTop: 10,
            border: '1px solid rgba(77,138,245,0.3)',
            borderRadius: 10,
            overflow: 'hidden',
            background: 'var(--bg-input)',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 13 }}>✨</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4d8af5' }}>Smart Follow-up Draft</span>
              {result.fallback && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>(template)</span>
              )}
              <span style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                padding: '2px 6px', borderRadius: 4,
                background: 'rgba(77,138,245,0.12)', color: '#4d8af5',
                letterSpacing: '0.05em',
              }}>
                {result.tone}
              </span>
            </div>
            <button
              onClick={() => setResult(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
              title="Dismiss"
            >
              ×
            </button>
          </div>

          {/* Subject line */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  Subject
                </span>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {result.subject}
                </div>
              </div>
              <button
                className="btn"
                style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
                onClick={() => copyText(result.subject, 'subject')}
              >
                {copiedSubject ? '✓ Copied' : 'Copy Subject'}
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                Body
              </span>
              <button
                className="btn"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => copyText(editableBody, 'body')}
              >
                {copiedBody ? '✓ Copied' : 'Copy Body'}
              </button>
            </div>
            <textarea
              value={editableBody}
              onChange={(e) => setEditableBody(e.target.value)}
              rows={8}
              style={{
                width: '100%',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 12,
                lineHeight: 1.6,
                padding: '8px 10px',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Reasoning note */}
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'rgba(77,138,245,0.04)' }}>
            <span style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600, fontStyle: 'normal', color: '#4d8af5' }}>Why this angle: </span>
              {result.reasoningNote}
            </span>
          </div>

          {/* Actions */}
          <div style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, flex: 1 }}
              onClick={handleUseDraft}
            >
              Use This Draft
            </button>
            <button
              className="btn"
              style={{ fontSize: 12 }}
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? '…' : 'Regenerate'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
