import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';

const FORMAT_LABELS: Record<string, string> = {
  'first.last': 'first.last',
  'firstlast':  'firstlast',
  'flast':      'flast',
  'firstl':     'firstl',
  'first.l':    'first.l',
  'f.last':     'f.last',
  'first':      'first',
  'role':       'role',
  'other':      'other',
};

function confidenceColor(c: number): string {
  if (c >= 0.7) return '#10b981';
  if (c >= 0.5) return '#f59e0b';
  return '#94a3b8';
}

interface Props {
  lead: Lead;
  onSelectEmail: (email: string) => void;
}

export default function FindEmailPanel({ lead, onSelectEmail }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Awaited<ReturnType<typeof api.findEmail>> | null>(null);

  const canRun = !!(lead.contactName && lead.website);

  const mut = useMutation({
    mutationFn: () => {
      if (!lead.serverId) throw new Error('Lead must be saved to server first');
      return api.findEmail(lead.serverId, { probe: false });
    },
    onSuccess: (data) => {
      setResults(data);
      qc.invalidateQueries({ queryKey: ['lead-activities', lead.serverId] });
    },
  });

  if (!canRun && !open) {
    return null;
  }

  return (
    <div className="find-email-panel">
      <button
        className="find-email-toggle"
        onClick={() => { setOpen(!open); if (!results && canRun) mut.mutate(); }}
        disabled={!canRun}
        title={canRun ? 'Generate candidate emails' : 'Need contact name + website'}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>Find email{open && results ? ` · ${results.candidates.length} found` : ''}</span>
        <span className="find-email-free-tag">FREE</span>
      </button>

      {open && (
        <div className="find-email-content">
          {mut.isPending && (
            <div className="find-email-loading">
              <span className="spinner" /> Searching MX records and generating candidates…
            </div>
          )}
          {results && (
            <>
              <div className="find-email-mx">
                <span className="find-email-mx-label">MX:</span>
                {results.mx?.ok ? (
                  <>
                    <span style={{ color: '#10b981' }}>✓ {results.mx.provider || 'reachable'}</span>
                    {results.mx.records && results.mx.records[0] && (
                      <span className="find-email-mx-host">{results.mx.records[0].exchange}</span>
                    )}
                  </>
                ) : (
                  <span style={{ color: '#ef4444' }}>✗ no records — domain may not accept email</span>
                )}
              </div>
              {results.candidates.length > 0 ? (
                <ul className="find-email-list">
                  {results.candidates.slice(0, 8).map((c) => (
                    <li key={c.email} className="find-email-item">
                      <button
                        className="find-email-pick"
                        onClick={() => { onSelectEmail(c.email); setOpen(false); }}
                        title={`Use this as the contact email (${FORMAT_LABELS[c.format] || c.format})`}
                      >
                        <span className="find-email-pick-icon">+</span>
                        <span className="find-email-pick-addr">{c.email}</span>
                      </button>
                      <span className="find-email-format">{FORMAT_LABELS[c.format] || c.format}</span>
                      <div className="find-email-conf">
                        <div
                          className="find-email-conf-bar"
                          style={{
                            width: `${Math.round(c.confidence * 100)}%`,
                            background: confidenceColor(c.confidence),
                          }}
                        />
                      </div>
                      <span className="find-email-conf-pct" style={{ color: confidenceColor(c.confidence) }}>
                        {Math.round(c.confidence * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="find-email-empty">No candidates generated (check name + website).</div>
              )}
              <div className="find-email-hint">
                Click any candidate to set it as the lead's email. Confidence is based on B2B
                naming-convention frequency — verify by sending a real email or via Hunter.io.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
