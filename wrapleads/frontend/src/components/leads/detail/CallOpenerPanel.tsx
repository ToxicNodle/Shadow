import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';

export default function CallOpenerPanel({ lead }: { lead: Lead }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const { mutate, data, isPending } = useMutation({
    mutationFn: () => api.getCallOpener(lead.serverId!),
  });

  if (!lead.serverId) return null;

  function handleToggle() {
    if (!expanded) {
      setExpanded(true);
      if (!data) mutate();
    } else {
      setExpanded(false);
    }
  }

  function handleCopy() {
    if (data?.opener) {
      navigator.clipboard.writeText(data.opener);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      overflow: 'hidden', marginBottom: 12,
    }}>
      <button
        onClick={handleToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'var(--surface)', border: 'none', cursor: 'pointer',
          color: 'var(--text)', fontSize: 13, fontWeight: 600,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>📞</span>
          <span>Call Opener</span>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#4d8af5', background: 'rgba(77,138,245,0.12)', padding: '2px 6px', borderRadius: 4,
          }}>AI</span>
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '12px 14px', background: 'var(--bg)', borderTop: '1px solid var(--border-subtle)' }}>
          {isPending && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '4px 0' }}>
              Generating opener…
            </div>
          )}

          {data && (
            <>
              <div style={{
                background: 'rgba(77,138,245,0.06)', border: '1px solid rgba(77,138,245,0.2)',
                borderRadius: 8, padding: '12px 14px', marginBottom: 10,
                fontSize: 13, lineHeight: 1.6, color: 'var(--text)',
                fontStyle: 'italic',
              }}>
                "{data.opener}"
              </div>

              {data.tip && (
                <div style={{
                  fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px',
                  background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: 6, marginBottom: 10,
                }}>
                  <span style={{ fontWeight: 700, color: '#f59e0b' }}>Coach: </span>
                  {data.tip}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleCopy}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                    background: copied ? 'rgba(0,217,126,0.1)' : 'var(--surface)',
                    color: copied ? '#00d97e' : 'var(--text-dim)',
                    fontSize: 11, cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => mutate()}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'var(--surface)', color: 'var(--text-muted)',
                    fontSize: 11, cursor: 'pointer',
                  }}
                >
                  Regenerate
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
