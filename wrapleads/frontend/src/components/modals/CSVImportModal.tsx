import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import type { Lead, LeadCategory } from '../../api/types';
import { CATEGORIES } from '../../api/types';

const VALID_CATEGORIES = Object.keys(CATEGORIES) as LeadCategory[];

// Fields we try to detect from CSV headers
const FIELD_MAP: Record<string, keyof Lead> = {
  company: 'company', business: 'company', name: 'company', 'business name': 'company',
  contact: 'contactName', 'contact name': 'contactName', 'first name': 'contactName', fullname: 'contactName',
  title: 'contactTitle', role: 'contactTitle', position: 'contactTitle',
  email: 'email', 'email address': 'email',
  phone: 'phone', telephone: 'phone', mobile: 'phone',
  city: 'city',
  state: 'state', st: 'state',
  website: 'website', url: 'website', domain: 'website',
  fleet: 'fleetSize', 'fleet size': 'fleetSize', vehicles: 'fleetSize', trucks: 'fleetSize',
  notes: 'notes', note: 'notes',
  category: 'category', type: 'category', 'lead type': 'category',
  status: 'status',
  pitch: 'pitchAngle', 'pitch angle': 'pitchAngle',
};

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
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
  const headers = parse(lines[0]);
  const rows = lines.slice(1).filter(Boolean).map((l) => {
    const vals = parse(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

function mapRow(row: Record<string, string>): Partial<Lead> {
  const lead: Partial<Lead> = { status: 'cold', category: 'fleet' };
  for (const [rawKey, val] of Object.entries(row)) {
    const key = rawKey.toLowerCase().trim();
    const field = FIELD_MAP[key];
    if (field && val) {
      if (field === 'category') {
        const cat = val.toLowerCase().trim() as LeadCategory;
        (lead as Record<string, unknown>)[field] = VALID_CATEGORIES.includes(cat) ? cat : 'fleet';
      } else {
        (lead as Record<string, unknown>)[field] = val;
      }
    }
  }
  return lead;
}

export default function CSVImportModal() {
  const qc = useQueryClient();
  const { showToast, setCsvImportOpen } = useAppStore((s) => ({
    showToast: s.showToast,
    setCsvImportOpen: s.setCsvImportOpen,
  }));
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Partial<Lead>[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<{ inserted: number; failed: number } | null>(null);

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv')) { showToast('Please upload a .csv file', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows } = parseCSV(text);
      setHeaders(h);
      setRawRows(rows);
      setPreview(rows.slice(0, 5).map(mapRow));
      setDone(null);
    };
    reader.readAsText(f);
  }

  async function runImport() {
    if (!rawRows.length) return;
    setImporting(true);
    try {
      const leads = rawRows.map((r, i) => ({ ...mapRow(r), clientId: `csv-${Date.now()}-${i}` }));
      const result = await api.syncLeads(leads);
      await qc.invalidateQueries({ queryKey: ['leads'] });
      setDone(result);
      showToast(`Imported ${result.inserted} leads`);
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setImporting(false);
    }
  }

  function close() { setCsvImportOpen(false); }
  function reset() { setHeaders([]); setPreview([]); setRawRows([]); setDone(null); }

  const PREVIEW_FIELDS: (keyof Lead)[] = ['company', 'contactName', 'email', 'city', 'state', 'category', 'status'];

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 680, width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <div>
            <div className="modal-title" style={{ margin: 0 }}>Import CSV</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              Upload a spreadsheet of leads — columns are auto-detected
            </div>
          </div>
          <button className="btn btn-icon" onClick={close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!headers.length && (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            style={{
              border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8, padding: '36px 20px', textAlign: 'center', cursor: 'pointer',
              background: dragging ? 'var(--bg-hover)' : 'var(--bg-input)', transition: 'all 0.15s',
            }}
          >
            <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" style={{ marginBottom: 8 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Drop CSV here or click to upload</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              Columns auto-detected: company, email, phone, city, state, fleet size, category, status, etc.
            </div>
          </div>
        )}

        {headers.length > 0 && !done && (
          <>
            <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>
              <strong style={{ color: 'var(--text)' }}>{rawRows.length} rows</strong> detected ·{' '}
              Detected columns: {headers.join(', ')}
            </div>

            {/* Preview table */}
            <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {PREVIEW_FIELDS.map((f) => (
                      <th key={f} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {f}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {PREVIEW_FIELDS.map((f) => (
                        <td key={f} style={{ padding: '5px 8px', color: 'var(--text-dim)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {String(row[f] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rawRows.length > 5 && (
                <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '6px 8px' }}>
                  …and {rawRows.length - 5} more rows
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={runImport}
                disabled={importing}
              >
                {importing ? <><span className="spinner" /> Importing…</> : `Import ${rawRows.length} Leads`}
              </button>
              <button className="btn" onClick={reset}>Change file</button>
            </div>
          </>
        )}

        {done && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ marginBottom: 12, color: 'var(--green)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="40" height="40"><circle cx="12" cy="12" r="10"/><polyline points="16 8 10 14 7 11"/></svg>
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Import Complete!</div>
            <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 20 }}>
              <strong>{done.inserted}</strong> leads imported
              {done.failed > 0 && <>, <strong>{done.failed}</strong> skipped</>}
            </div>
            <button className="btn btn-primary" onClick={close}>View My Leads</button>
          </div>
        )}
      </div>
    </div>
  );
}
