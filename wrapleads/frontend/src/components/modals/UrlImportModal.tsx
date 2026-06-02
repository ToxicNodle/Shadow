import { useState } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { useLeads } from '../../hooks/useLeads';
import type { LeadCategory } from '../../api/types';

const CATEGORY_LABELS: Record<string, string> = {
  fleet: 'Fleet', design: 'Design', construction: 'Construction',
  dinoc: 'DI-NOC', reatec: 'Reatec', colorchange: 'Color Change',
  wallgraphics: 'Wall Graphics', gc_referral: 'GC Referral', racing: 'Racing',
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high: '#10b981', medium: '#f59e0b', low: '#ef4444',
};

interface Props {
  onClose: () => void;
}

export default function UrlImportModal({ onClose }: Props) {
  const { createLead } = useLeads();
  const showToast = useAppStore((s) => s.showToast);

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState<{
    company: string; contactName: string | null; contactTitle: string | null;
    email: string | null; phone: string | null; city: string | null; state: string | null;
    website: string; fleetSize: string | null; industry: string | null;
    category: string; pitchAngle: string | null; confidence: 'high' | 'medium' | 'low';
  } | null>(null);
  const [editedLead, setEditedLead] = useState<typeof extracted>(null);
  const [adding, setAdding] = useState(false);

  async function extract() {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const result = await api.importFromUrl(url.trim());
      setExtracted(result.lead);
      setEditedLead({ ...result.lead });
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function addToLeads() {
    if (!editedLead) return;
    setAdding(true);
    const now = new Date().toISOString();
    createLead({
      company: editedLead.company,
      contactName: editedLead.contactName || '',
      contactTitle: editedLead.contactTitle || '',
      email: editedLead.email || '',
      phone: editedLead.phone || '',
      city: editedLead.city || '',
      state: editedLead.state || '',
      website: editedLead.website || '',
      fleetSize: editedLead.fleetSize || '',
      category: editedLead.category as LeadCategory,
      pitchAngle: editedLead.pitchAngle || '',
      status: 'new',
      notes: '',
      address: '',
      createdAt: now,
      updatedAt: now,
    });
    showToast(`${editedLead.company} added to your pipeline`);
    setAdding(false);
    onClose();
  }

  function set(field: string, val: string) {
    setEditedLead((prev) => prev ? { ...prev, [field]: val || null } : prev);
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(3px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 560, width: '100%', margin: '0 16px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 72px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 24 }}>🔗</div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Import from URL</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
              Paste any company website, LinkedIn page, or directory listing
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 18, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* URL input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input
            className="input"
            placeholder="https://company.com or linkedin.com/company/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') extract(); }}
            style={{ flex: 1 }}
            autoFocus
          />
          <button
            className="btn btn-primary"
            onClick={extract}
            disabled={loading || !url.trim()}
            style={{ flexShrink: 0, fontWeight: 700 }}
          >
            {loading ? (
              <><span className="spinner" style={{ width: 12, height: 12, marginRight: 5 }} />Scanning…</>
            ) : 'Extract →'}
          </button>
        </div>

        {/* Extracted data preview */}
        {editedLead && (
          <>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Extracted Data</div>
                <div style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                  background: `${CONFIDENCE_COLOR[editedLead.confidence]}22`,
                  color: CONFIDENCE_COLOR[editedLead.confidence],
                }}>
                  {editedLead.confidence.toUpperCase()} CONFIDENCE
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Company', field: 'company', required: true },
                  { label: 'Contact', field: 'contactName' },
                  { label: 'Email', field: 'email' },
                  { label: 'Phone', field: 'phone' },
                  { label: 'City', field: 'city' },
                  { label: 'State', field: 'state' },
                  { label: 'Fleet Size', field: 'fleetSize' },
                  { label: 'Website', field: 'website' },
                ].map(({ label, field }) => (
                  <div key={field} className="field-group">
                    <label className="field-label">{label}</label>
                    <input
                      className="input"
                      value={(editedLead as Record<string, string | null>)[field] || ''}
                      onChange={(e) => set(field, e.target.value)}
                      style={{ fontSize: 12 }}
                    />
                  </div>
                ))}
              </div>

              <div className="field-group" style={{ marginTop: 10 }}>
                <label className="field-label">Category</label>
                <select
                  className="select"
                  value={editedLead.category}
                  onChange={(e) => set('category', e.target.value)}
                  style={{ fontSize: 12 }}
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {editedLead.pitchAngle && (
                <div className="field-group" style={{ marginTop: 10 }}>
                  <label className="field-label">AI Pitch Angle</label>
                  <textarea
                    className="input"
                    value={editedLead.pitchAngle}
                    onChange={(e) => set('pitchAngle', e.target.value)}
                    rows={2}
                    style={{ fontSize: 12, resize: 'vertical' }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={addToLeads}
                disabled={adding || !editedLead.company}
                style={{ flex: 1, fontWeight: 700 }}
              >
                {adding ? 'Adding…' : `Add ${editedLead.company} to Pipeline →`}
              </button>
              <button
                className="btn"
                onClick={() => { setExtracted(null); setEditedLead(null); setUrl(''); }}
                style={{ fontSize: 12 }}
              >
                Clear
              </button>
            </div>
          </>
        )}

        {!extracted && !loading && (
          <div style={{ padding: '16px 0 4px', fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            <div style={{ marginBottom: 6, fontWeight: 600, color: 'var(--text-muted)' }}>Works with:</div>
            <div>🌐 Company website (e.g. acmetrucking.com)</div>
            <div>💼 LinkedIn company pages (linkedin.com/company/...)</div>
            <div>📋 Industry directory listings, press releases, news articles</div>
            <div style={{ marginTop: 8, color: 'var(--text-faint)', fontSize: 11 }}>AI extracts company name, industry, fleet size, contacts, and generates a pitch angle. Review before adding.</div>
          </div>
        )}
      </div>
    </div>
  );
}
