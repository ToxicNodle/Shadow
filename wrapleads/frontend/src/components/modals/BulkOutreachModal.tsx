import { useState } from 'react';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';

const TONES = ['Professional', 'Friendly', 'Direct', 'Consultative'];

interface EmailResult {
  leadId: string;
  company: string;
  subject: string;
  body: string;
}

export default function BulkOutreachModal() {
  const { leads } = useLeads();
  const { selectedLeadIds, settings, showToast, clearLeadSelection, setBulkOutreachOpen } = useAppStore((s) => ({
    selectedLeadIds: s.selectedLeadIds,
    settings: s.settings,
    showToast: s.showToast,
    clearLeadSelection: s.clearLeadSelection,
    setBulkOutreachOpen: s.setBulkOutreachOpen,
  }));

  const [tone, setTone] = useState(TONES[0]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<EmailResult[] | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const selectedLeads = leads.filter((l) => selectedLeadIds.has(l.id));
  const capped = selectedLeads.slice(0, 30);

  async function generate() {
    setLoading(true);
    setResults(null);
    try {
      const data = await api.bulkEmail({ leads: capped, tone, settings });
      setResults(data.emails);
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setBulkOutreachOpen(false);
  }

  function copy(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied!');
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    });
  }

  function copyAll() {
    if (!results) return;
    const text = results.map((r) =>
      `--- ${r.company} ---\nSubject: ${r.subject}\n\n${r.body}`
    ).join('\n\n================\n\n');
    navigator.clipboard.writeText(text).then(() => showToast('All emails copied!'));
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 680, width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <div>
            <div className="modal-title" style={{ margin: 0 }}>Bulk Outreach</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''} selected
              {selectedLeads.length > 30 && <span style={{ color: 'var(--yellow)' }}> · capped at 30</span>}
            </div>
          </div>
          <button className="btn btn-icon" onClick={close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Lead chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, flexShrink: 0 }}>
          {capped.map((l) => (
            <span key={l.id} style={{
              background: 'var(--bg-input)', borderRadius: 4, padding: '3px 8px',
              fontSize: 12, color: 'var(--text-dim)',
            }}>
              {l.company}
            </span>
          ))}
        </div>

        <div className="field-group" style={{ flexShrink: 0 }}>
          <label className="field-label">Tone</label>
          <div className="chip-group">
            {TONES.map((t) => (
              <button key={t} className={`chip ${tone === t ? 'active' : ''}`} onClick={() => setTone(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {!results && (
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px', flexShrink: 0 }}
            onClick={generate}
            disabled={loading || capped.length === 0}
          >
            {loading
              ? <><span className="spinner" /> Generating {capped.length} emails…</>
              : `Generate ${capped.length} Personalized Emails`}
          </button>
        )}

        {results && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexShrink: 0 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={copyAll}>
                Copy All {results.length} Emails
              </button>
              <button className="btn" onClick={() => { setResults(null); }}>Regenerate</button>
              <button className="btn" onClick={() => { close(); clearLeadSelection(); }}>Done</button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {results.map((r, i) => (
                <div key={i} style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{r.company}</span>
                    <button
                      className="btn"
                      style={{ fontSize: 11, padding: '3px 9px' }}
                      onClick={() => copy(`Subject: ${r.subject}\n\n${r.body}`, i)}
                    >
                      {copiedIdx === i ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                    <strong style={{ color: 'var(--text)' }}>Subject:</strong> {r.subject}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: 120, overflowY: 'auto' }}>
                    {r.body}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
