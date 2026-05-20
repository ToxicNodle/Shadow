import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Lead, LeadStatus } from '../../api/types';

interface Props {
  onClose: () => void;
}

export default function CardScanModal({ onClose }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanned, setScanned] = useState<Partial<Lead> | null>(null);
  const [form, setForm] = useState<Partial<Lead>>({});
  const [saved, setSaved] = useState(false);

  const scanMut = useMutation({
    mutationFn: (file: File) => api.scanBusinessCard(file),
    onSuccess: (data) => {
      if (data.ok && data.lead) {
        setScanned(data.lead);
        setForm({ ...data.lead, category: data.lead.category || 'fleet', status: 'cold' as LeadStatus });
      }
    },
  });

  const saveMut = useMutation({
    mutationFn: () => api.createLead(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      setSaved(true);
      setTimeout(onClose, 1800);
    },
  });

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    scanMut.mutate(file);
  }

  function f(k: keyof Lead) {
    return {
      value: (form[k] as string) ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((s) => ({ ...s, [k]: e.target.value })),
    };
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Business Card Scanner</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {saved ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ marginBottom: 12, color: 'var(--green)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="40" height="40"><circle cx="12" cy="12" r="10"/><polyline points="16 8 10 14 7 11"/></svg>
              </div>
              <p style={{ fontWeight: 700, margin: 0 }}>Lead created from card!</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{form.company}</p>
            </div>
          ) : !scanned ? (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                Take a photo of a business card. Claude Vision reads every field and creates the lead instantly.
              </p>
              <div
                className="card-scan-dropzone"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              >
                {preview ? (
                  <img src={preview} alt="Card preview" className="card-scan-preview" />
                ) : (
                  <div className="card-scan-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 40, height: 40, color: 'var(--text-faint)' }}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/><line x1="6" y1="18" x2="8" y2="18"/></svg>
                    <span>Drop card photo here or tap to choose</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>JPEG or PNG · max 10MB</span>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              {scanMut.isPending && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                  <span className="spinner" /> Reading card with AI…
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {preview && <img src={preview} alt="Card" style={{ width: 100, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, margin: '0 0 4px' }}>✓ Card read — review and confirm</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Edit any field before saving.</p>
                </div>
              </div>

              <div className="field-row">
                <div className="field-group">
                  <label className="field-label">Company</label>
                  <input className="input" {...f('company')} />
                </div>
                <div className="field-group">
                  <label className="field-label">Contact Name</label>
                  <input className="input" {...f('contactName')} />
                </div>
              </div>
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label">Title</label>
                  <input className="input" {...f('contactTitle')} />
                </div>
                <div className="field-group">
                  <label className="field-label">Email</label>
                  <input className="input" type="email" {...f('email')} />
                </div>
              </div>
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label">Phone</label>
                  <input className="input" {...f('phone')} />
                </div>
                <div className="field-group">
                  <label className="field-label">Website</label>
                  <input className="input" {...f('website')} />
                </div>
              </div>
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label">City</label>
                  <input className="input" {...f('city')} />
                </div>
                <div className="field-group">
                  <label className="field-label">State</label>
                  <input className="input" {...f('state')} maxLength={2} style={{ textTransform: 'uppercase' }} />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Notes (from card)</label>
                <input className="input" {...f('notes')} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
                <button className="btn" onClick={() => { setScanned(null); setPreview(null); }}>← Rescan</button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={onClose}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    disabled={!form.company || saveMut.isPending}
                    onClick={() => saveMut.mutate()}
                  >
                    {saveMut.isPending ? 'Creating…' : 'Create Lead'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
