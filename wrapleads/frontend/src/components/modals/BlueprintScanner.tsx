import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import type { BlueprintResult } from '../../api/types';
import { CATEGORIES } from '../../api/types';

interface Props {
  onClose: () => void;
}

const CONFIDENCE_COLOR = { high: '#22c55e', medium: '#f59e0b', low: '#94a3b8' };

export default function BlueprintScanner({ onClose }: Props) {
  const qc = useQueryClient();
  const { showToast } = useAppStore((s) => ({ showToast: s.showToast }));
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<BlueprintResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleFile(f: File) {
    if (f.type !== 'application/pdf') { showToast('Please upload a PDF file', 'error'); return; }
    setFile(f);
    setResult(null);
    setSaved(false);
  }

  async function runScan() {
    if (!file) return;
    setScanning(true);
    setResult(null);
    try {
      const { result: r } = await api.scanBlueprint(file);
      setResult(r);
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setScanning(false);
    }
  }

  async function saveLead() {
    if (!result) return;
    setSaving(true);
    try {
      const primaryType = result.opportunities[0]?.type ?? 'gc_referral';
      const specs = result.opportunities.flatMap((o) => o.specs).join('; ');
      await api.syncLeads([{
        clientId: `bp-${Date.now()}`,
        company:      result.company || file?.name.replace('.pdf', '') || 'Blueprint Lead',
        category:     primaryType,
        city:         result.city || '',
        state:        result.state || '',
        contactTitle: result.contactTitle || 'General Contractor',
        status:       'cold',
        notes:        [result.notes, specs].filter(Boolean).join('\n'),
        pitchAngle:   result.pitchAngle,
      }]);
      await qc.invalidateQueries({ queryKey: ['leads'] });
      showToast('Lead saved to CRM');
      setSaved(true);
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 600, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div className="modal-title" style={{ margin: 0 }}>Blueprint Scanner</div>
          <button className="btn btn-icon" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.5 }}>
          Upload a PDF bid spec or blueprint. Claude will scan it for DI-NOC, Rea Tec, 3M, wall graphics, or fleet wrap opportunities and extract the GC details as a lead.
        </p>

        {/* Drop zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          style={{
            border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8,
            padding: '28px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'var(--bg-hover)' : 'var(--bg-input)',
            transition: 'all 0.15s',
            marginBottom: 16,
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" style={{ marginBottom: 8 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          {file ? (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{file.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                {(file.size / 1024).toFixed(0)} KB — click to change
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Drop PDF here or click to upload</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Bid specs, blueprints, RFPs — up to 20 MB</div>
            </div>
          )}
        </div>

        {file && !result && (
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
            onClick={runScan}
            disabled={scanning}
          >
            {scanning
              ? <><span className="spinner" /> Scanning with Claude…</>
              : 'Scan for Wrap Opportunities'}
          </button>
        )}

        {/* Results */}
        {result && (
          <div style={{ marginTop: 8 }}>
            {result.hasOpportunity ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ color: 'var(--green)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="16 8 10 14 7 11"/></svg></span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Opportunity Found</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      Confidence:{' '}
                      <span style={{ color: CONFIDENCE_COLOR[result.confidence], fontWeight: 600 }}>
                        {result.confidence}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Extracted details */}
                <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 14, marginBottom: 14, fontSize: 13 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                    {result.company && <div><span style={{ color: 'var(--text-dim)' }}>Company</span><br /><strong>{result.company}</strong></div>}
                    {result.contactTitle && <div><span style={{ color: 'var(--text-dim)' }}>Role</span><br /><strong>{result.contactTitle}</strong></div>}
                    {result.projectName && <div><span style={{ color: 'var(--text-dim)' }}>Project</span><br /><strong>{result.projectName}</strong></div>}
                    {(result.city || result.state) && <div><span style={{ color: 'var(--text-dim)' }}>Location</span><br /><strong>{[result.city, result.state].filter(Boolean).join(', ')}</strong></div>}
                    {result.projectType && <div><span style={{ color: 'var(--text-dim)' }}>Project Type</span><br /><strong style={{ textTransform: 'capitalize' }}>{result.projectType}</strong></div>}
                  </div>
                </div>

                {/* Opportunities */}
                <div style={{ marginBottom: 14 }}>
                  {result.opportunities.map((o, i) => (
                    <div key={i} style={{ background: 'var(--bg-hover)', borderRadius: 6, padding: '10px 12px', marginBottom: 8, fontSize: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
                          {CATEGORIES[o.type] ?? o.type}
                        </span>
                        {o.location && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{o.location}</span>}
                      </div>
                      <div style={{ marginBottom: o.specs.length ? 4 : 0 }}>{o.description}</div>
                      {o.specs.length > 0 && (
                        <ul style={{ margin: '4px 0 0', padding: '0 0 0 16px', color: 'var(--text-dim)', fontSize: 12 }}>
                          {o.specs.map((s, j) => <li key={j}>{s}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>

                {/* Pitch angle */}
                {result.pitchAngle && (
                  <div style={{ background: 'var(--bg-input)', borderLeft: '3px solid var(--accent)', borderRadius: '0 6px 6px 0', padding: '10px 12px', marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pitch Angle</div>
                    {result.pitchAngle}
                  </div>
                )}

                {result.notes && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.5 }}>
                    <strong>Notes:</strong> {result.notes}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={saveLead}
                    disabled={saving || saved}
                  >
                    {saved ? '✓ Saved to CRM' : saving ? <><span className="spinner" /> Saving…</> : '💾 Save as Lead'}
                  </button>
                  <button className="btn" onClick={() => { setFile(null); setResult(null); setSaved(false); }}>
                    Scan another
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ width: 32, height: 32, margin: '0 auto 8px', color: 'var(--text-faint)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>No wrap opportunities found</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
                  This document doesn't appear to contain DI-NOC, architectural film, or vehicle wrap specifications.
                </div>
                <button className="btn" onClick={() => { setFile(null); setResult(null); }}>Try another file</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
