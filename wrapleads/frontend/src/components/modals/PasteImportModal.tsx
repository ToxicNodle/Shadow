import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { ParsedContact, LeadCategory } from '../../api/types';
import { CATEGORIES } from '../../api/types';
import Modal from '../ui/Modal';

type Stage = 'paste' | 'loading' | 'preview' | 'importing';

interface DraftLead extends ParsedContact {
  _id: string;
  included: boolean;
}

const CAT_COLORS: Record<LeadCategory, string> = {
  fleet:            '#60a5fa',
  dinoc:            '#c084fc',
  construction:     '#ff6b35',
  design:           '#f472b6',
  reatec:           '#facc15',
  colorchange:      '#f87171',
  wallgraphics:     '#4ade80',
  gc_referral:      '#2dd4bf',
  racing:           '#ef4444',
  commercial_solar: '#fbbf24',
};

export default function PasteImportModal() {
  const { pasteImportOpen, setPasteImportOpen, showToast } = useAppStore((s) => ({
    pasteImportOpen: s.pasteImportOpen,
    setPasteImportOpen: s.setPasteImportOpen,
    showToast: s.showToast,
  }));
  const qc = useQueryClient();

  const [stage, setStage] = useState<Stage>('paste');
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<DraftLead[]>([]);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);

  if (!pasteImportOpen) return null;

  function handleClose() {
    setPasteImportOpen(false);
    setTimeout(() => { setStage('paste'); setText(''); setDrafts([]); setError(''); setEditingId(null); }, 200);
  }

  async function handleExtract() {
    if (!text.trim()) return;
    setStage('loading');
    setError('');
    try {
      const { leads } = await api.parseContacts(text);
      if (!leads.length) {
        setError('No contacts found. Try pasting more structured text with company names and contact info.');
        setStage('paste');
        return;
      }
      setDrafts(leads.map((l, i) => ({ ...l, _id: `draft-${i}`, included: true })));
      setStage('preview');
    } catch (e: unknown) {
      setError((e as Error).message);
      setStage('paste');
    }
  }

  function toggleInclude(id: string) {
    setDrafts((d) => d.map((l) => l._id === id ? { ...l, included: !l.included } : l));
  }

  function updateDraft(id: string, patch: Partial<DraftLead>) {
    setDrafts((d) => d.map((l) => l._id === id ? { ...l, ...patch } : l));
  }

  async function handleImport() {
    const toImport = drafts.filter((d) => d.included);
    if (!toImport.length) return;
    setStage('importing');
    setImportProgress(0);
    const now = new Date().toISOString();
    let success = 0;
    for (let i = 0; i < toImport.length; i++) {
      const d = toImport[i];
      try {
        await api.createLead({
          company: d.company, category: d.category, status: 'cold',
          contactName: d.contactName ?? '', contactTitle: d.contactTitle ?? '',
          phone: d.phone ?? '', email: d.email ?? '',
          city: d.city ?? '', state: d.state ?? '',
          pitchAngle: d.pitchAngle, fleetSize: '',
          address: '', website: '', notes: '',
          lastContacted: '', createdAt: now, updatedAt: now,
        });
        success++;
      } catch {
        // skip individual failures — final toast shows actual count
      }
      setImportProgress(i + 1);
    }
    qc.invalidateQueries({ queryKey: ['leads'] });
    showToast(`${success} lead${success !== 1 ? 's' : ''} imported`);
    handleClose();
  }

  const includedCount = drafts.filter((d) => d.included).length;

  return (
    <Modal
      title={
        stage === 'paste' || stage === 'loading' ? 'AI Contact Import' :
        stage === 'preview' ? `Review ${drafts.length} Extracted Lead${drafts.length !== 1 ? 's' : ''}` :
        'Importing…'
      }
      onClose={handleClose}
      wide
    >
      {/* ── PASTE STAGE ── */}
      {(stage === 'paste' || stage === 'loading') && (
        <>
          <p className="paste-help">
            Paste any contact info — from Perplexity, Google, emails, spreadsheets, or notes.
            Claude will extract company names, contacts, titles, phones, and suggest a pitch angle.
          </p>
          <textarea
            className="paste-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Example:\n\nLocal Property Management Companies\n\nAcme Property Group — Jane Smith (CEO), Bob Jones (VP Property Mgmt) · 555-841-9900\nPremier Commercial — Mike Davis (Managing Dir) · 555-639-0515\nCity Realty Partners — Sarah Lee (Founder) · 555-870-3920`}
            disabled={stage === 'loading'}
            autoFocus
          />
          {error && <div className="paste-error">{error}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={handleClose} disabled={stage === 'loading'}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleExtract}
              disabled={!text.trim() || stage === 'loading'}
            >
              {stage === 'loading' ? (
                <><span className="spinner" style={{ width: 14, height: 14, marginRight: 6 }} />Extracting…</>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" opacity=".3" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  Extract Leads with AI
                </>
              )}
            </button>
          </div>
          <div className="paste-footer-note">Powered by Claude · only companies you approve will be imported</div>
        </>
      )}

      {/* ── PREVIEW STAGE ── */}
      {stage === 'preview' && (
        <>
          <div className="paste-preview-bar">
            <span>{includedCount} of {drafts.length} leads selected</span>
            <button className="btn" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setStage('paste')}>
              ← Edit text
            </button>
          </div>

          <div className="paste-cards">
            {drafts.map((d) => (
              <div key={d._id} className={`paste-card ${d.included ? '' : 'excluded'}`}>
                <div className="paste-card-check">
                  <input
                    type="checkbox"
                    checked={d.included}
                    onChange={() => toggleInclude(d._id)}
                    style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
                  />
                </div>

                <div className="paste-card-body">
                  {editingId === d._id ? (
                    <EditableCard draft={d} onChange={(patch) => updateDraft(d._id, patch)} onDone={() => setEditingId(null)} />
                  ) : (
                    <>
                      <div className="paste-card-top">
                        <span className="paste-company">{d.company}</span>
                        <span
                          className="paste-cat"
                          style={{ background: CAT_COLORS[d.category] + '22', color: CAT_COLORS[d.category], borderColor: CAT_COLORS[d.category] + '55' }}
                        >
                          {CATEGORIES[d.category]}
                        </span>
                      </div>
                      {d.contactName && (
                        <div className="paste-contact">
                          {d.contactName}{d.contactTitle ? ` · ${d.contactTitle}` : ''}
                        </div>
                      )}
                      <div className="paste-meta">
                        {d.phone && <span>{d.phone}</span>}
                        {d.email && <span>{d.email}</span>}
                        {(d.city || d.state) && <span>{[d.city, d.state].filter(Boolean).join(', ')}</span>}
                      </div>
                      {d.pitchAngle && (
                        <div className="paste-pitch">{d.pitchAngle}</div>
                      )}
                    </>
                  )}
                </div>

                {editingId !== d._id && (
                  <button className="paste-edit-btn" onClick={() => setEditingId(d._id)} title="Edit">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="modal-actions">
            <button className="btn" onClick={handleClose}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={includedCount === 0}
            >
              Import {includedCount} Lead{includedCount !== 1 ? 's' : ''}
            </button>
          </div>
        </>
      )}

      {/* ── IMPORTING STAGE ── */}
      {stage === 'importing' && (
        <div className="paste-importing">
          <span className="spinner spinner-lg" />
          <div className="paste-importing-text">
            Importing {importProgress} of {drafts.filter((d) => d.included).length}…
          </div>
          <div className="paste-progress-bar">
            <div
              className="paste-progress-fill"
              style={{ width: `${(importProgress / drafts.filter((d) => d.included).length) * 100}%` }}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

function EditableCard({ draft, onChange, onDone }: {
  draft: DraftLead;
  onChange: (patch: Partial<DraftLead>) => void;
  onDone: () => void;
}) {
  return (
    <div className="paste-edit-form">
      <input className="input" style={{ fontSize: 12 }} value={draft.company}
        onChange={(e) => onChange({ company: e.target.value })} placeholder="Company" />
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="input" style={{ fontSize: 12, flex: 1 }} value={draft.contactName ?? ''}
          onChange={(e) => onChange({ contactName: e.target.value })} placeholder="Contact name" />
        <input className="input" style={{ fontSize: 12, flex: 1 }} value={draft.contactTitle ?? ''}
          onChange={(e) => onChange({ contactTitle: e.target.value })} placeholder="Title" />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="input" style={{ fontSize: 12, flex: 1 }} value={draft.phone ?? ''}
          onChange={(e) => onChange({ phone: e.target.value })} placeholder="Phone" />
        <input className="input" style={{ fontSize: 12, flex: 1 }} value={draft.email ?? ''}
          onChange={(e) => onChange({ email: e.target.value })} placeholder="Email" />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="input" style={{ fontSize: 12, flex: 1 }} value={draft.city ?? ''}
          onChange={(e) => onChange({ city: e.target.value })} placeholder="City" />
        <input className="input" style={{ fontSize: 12, width: 60 }} value={draft.state ?? ''}
          onChange={(e) => onChange({ state: e.target.value })} placeholder="ST" maxLength={2} />
        <select className="select" style={{ fontSize: 12, flex: 1 }} value={draft.category}
          onChange={(e) => onChange({ category: e.target.value as LeadCategory })}>
          {Object.entries(CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <input className="input" style={{ fontSize: 12 }} value={draft.pitchAngle}
        onChange={(e) => onChange({ pitchAngle: e.target.value })} placeholder="Pitch angle" />
      <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: 'flex-end' }} onClick={onDone}>Done</button>
    </div>
  );
}
