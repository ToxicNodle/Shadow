import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';

type Step = 'upload' | 'preview' | 'done';

interface PreviewRow {
  company: string;
  contact: string;
  email: string;
  city: string;
  state: string;
  status: string;
}

function parsePreview(text: string): { rows: PreviewRow[]; total: number } {
  const lines = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return { rows: [], total: 0 };

  const parse = (line: string) => {
    const cols: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    return cols;
  };

  const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
  const headers = parse(lines[0]).map(normalize);

  const idx = (aliases: string[]) => {
    for (const a of aliases) {
      const i = headers.indexOf(a);
      if (i !== -1) return i;
    }
    return -1;
  };

  const companyIdx = idx(['company', 'companyname', 'businessname', 'accountname', 'organization']);
  const firstIdx   = idx(['firstname', 'first']);
  const lastIdx    = idx(['lastname', 'last']);
  const contactIdx = idx(['contactname', 'contact', 'fullname']);
  const emailIdx   = idx(['email', 'emailaddress', 'primaryemail']);
  const cityIdx    = idx(['city', 'town']);
  const stateIdx   = idx(['state', 'province', 'st']);
  const statusIdx  = idx(['status', 'accountstatus', 'leadstatus', 'stage']);

  const dataRows = lines.slice(1).filter(Boolean);
  const previewRows = dataRows.slice(0, 6).map((l) => {
    const vals = parse(l);
    const get = (i: number) => (i >= 0 ? vals[i] ?? '' : '').trim();
    let contact = get(contactIdx);
    if (!contact) contact = [get(firstIdx), get(lastIdx)].filter(Boolean).join(' ');
    return {
      company: get(companyIdx),
      contact,
      email: get(emailIdx),
      city: get(cityIdx),
      state: get(stateIdx),
      status: get(statusIdx) || 'new',
    };
  }).filter(r => r.company);

  return { rows: previewRows, total: dataRows.filter(l => parse(l).some(c => c)).length };
}

export default function ShopVoxImportModal() {
  const qc = useQueryClient();
  const { showToast, setShopVoxImportOpen } = useAppStore((s) => ({
    showToast: s.showToast,
    setShopVoxImportOpen: s.setShopVoxImportOpen,
  }));

  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null);

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv')) { showToast('Please upload a .csv file', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { rows, total: t } = parsePreview(text);
      if (!rows.length) { showToast('Could not find a Company column — check your ShopVOX export', 'error'); return; }
      setFile(f);
      setPreview(rows);
      setTotal(t);
      setStep('preview');
    };
    reader.readAsText(f);
  }

  async function runImport() {
    if (!file) return;
    setImporting(true);
    try {
      const r = await api.importShopVoxCSV(file);
      await qc.invalidateQueries({ queryKey: ['leads'] });
      setResult({ imported: r.imported, skipped: r.skipped, errors: r.errors });
      setStep('done');
      showToast(`${r.imported} leads imported from ShopVOX`);
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setImporting(false);
    }
  }

  function close() { setShopVoxImportOpen(false); }
  function reset() { setStep('upload'); setFile(null); setPreview([]); setTotal(0); setResult(null); }

  const STATUS_COLOR: Record<string, string> = {
    new: '#6366f1', cold: '#64748b', contacted: '#3b82f6',
    replied: '#8b5cf6', meeting: '#f59e0b', proposal: '#f97316',
    won: '#22c55e', lost: '#ef4444',
  };

  const mapStatus = (raw: string) => {
    const s = raw.toLowerCase().replace(/[^a-z]/g, '');
    if (['prospect','lead','new','potential'].some(v => s.includes(v))) return 'new';
    if (['activecustomer','customer','active'].some(v => s.includes(v))) return 'contacted';
    if (['inactive','former'].some(v => s.includes(v))) return 'cold';
    if (['proposal','quote'].some(v => s.includes(v))) return 'proposal';
    if (['meeting'].some(v => s.includes(v))) return 'meeting';
    if (['won','closed'].some(v => s.includes(v))) return 'won';
    if (['lost'].some(v => s.includes(v))) return 'lost';
    return 'new';
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 700, width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div className="modal-title" style={{ margin: 0 }}>Migrate from ShopVOX</div>
              <span style={{ background: '#ef444420', color: '#f87171', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, letterSpacing: '.05em' }}>PE ACQUIRED</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Export your ShopVOX contacts as CSV · Upload below · Done in 2 minutes
            </div>
          </div>
          <button className="btn btn-icon" onClick={close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <>
            {/* How to export instruction */}
            <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>
              <strong style={{ color: 'var(--text)' }}>How to export from ShopVOX:</strong>
              {' '}Contacts → All Contacts → Export → CSV. Any ShopVOX contact export works — columns are auto-detected.
            </div>

            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              style={{
                border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8, padding: '40px 20px', textAlign: 'center', cursor: 'pointer',
                background: dragging ? 'var(--bg-hover)' : 'var(--bg-input)', transition: 'all 0.15s',
              }}
            >
              <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" style={{ marginBottom: 10 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Drop your ShopVOX CSV here</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                Company · Contact · Email · Phone · Status · Notes · City · State — all auto-mapped
              </div>
            </div>
          </>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10, flexShrink: 0 }}>
              <strong style={{ color: 'var(--text)' }}>{total} contacts</strong> detected ·{' '}
              Showing first {Math.min(preview.length, 6)} rows · Duplicate emails will be skipped automatically
            </div>

            <div style={{ overflowY: 'auto', flex: 1, marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {(['Company', 'Contact', 'Email', 'Location', 'Status → WrapOS'] as const).map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => {
                    const mapped = mapStatus(row.status);
                    const color = STATUS_COLOR[mapped] ?? '#6366f1';
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.company || '—'}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-dim)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.contact || '—'}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-dim)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.email || '—'}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{[row.city, row.state].filter(Boolean).join(', ') || '—'}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{row.status || '—'}</span>
                            <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>→</span>
                            <span style={{ background: `${color}20`, color, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>{mapped}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {total > 6 && (
                <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '6px 8px' }}>
                  …and {total - 6} more rows
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={runImport} disabled={importing}>
                {importing
                  ? <><span className="spinner" /> Importing…</>
                  : `Import all ${total} contacts`}
              </button>
              <button className="btn" onClick={reset}>Different file</button>
            </div>
          </>
        )}

        {/* Step 3: Done */}
        {step === 'done' && result && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ marginBottom: 16, color: 'var(--green)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48">
                <circle cx="12" cy="12" r="10" />
                <polyline points="16 8 10 14 7 11" />
              </svg>
            </div>
            <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 8 }}>You're free.</div>
            <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 24, lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text)' }}>{result.imported}</strong> contacts imported from ShopVOX
              {result.skipped > 0 && <> · <strong>{result.skipped}</strong> already existed (skipped)</>}
              {result.errors > 0 && <> · <strong style={{ color: 'var(--red)' }}>{result.errors}</strong> rows had errors</>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 24, maxWidth: 360, margin: '0 auto 24px', lineHeight: 1.6 }}>
              Your leads are in WrapOS. Re-import anytime — duplicates are skipped automatically based on email address.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={close}>View My Leads</button>
              <button className="btn" onClick={reset}>Import another file</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
