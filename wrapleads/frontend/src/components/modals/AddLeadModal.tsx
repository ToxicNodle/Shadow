import { useState, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useLeads } from '../../hooks/useLeads';
import { api } from '../../api/client';
import Modal from '../ui/Modal';
import type { LeadCategory, LeadStatus } from '../../api/types';
import { CATEGORIES, STATUSES } from '../../api/types';

interface DupMatch { id: number; company: string; status: string; city: string; state: string; }

interface AISuggestion {
  category: string;
  fleetRange: string;
  pitchAngle: string;
  confidence: 'high' | 'medium' | 'low';
}

const CONFIDENCE_COLOR: Record<string, string> = { high: '#10b981', medium: '#f59e0b', low: '#94a3b8' };

const now = new Date().toISOString();

export default function AddLeadModal() {
  const { addLeadOpen, setAddLeadOpen } = useAppStore((s) => ({
    addLeadOpen: s.addLeadOpen,
    setAddLeadOpen: s.setAddLeadOpen,
  }));
  const { createLead } = useLeads();

  const [company, setCompany] = useState('');
  const [dupMatches, setDupMatches] = useState<DupMatch[]>([]);
  const dupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [category, setCategory] = useState<LeadCategory>('fleet');
  const [status, setStatus] = useState<LeadStatus>('cold');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fleetSize, setFleetSize] = useState('');
  const [pitchAngle, setPitchAngle] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  if (!addLeadOpen) return null;

  function handleClose() {
    setAddLeadOpen(false);
    setCompany(''); setContactName(''); setEmail(''); setPhone(''); setFleetSize('');
    setState(''); setCity(''); setPitchAngle('');
    setCategory('fleet'); setStatus('cold');
    setDupMatches([]); setAiSuggestion(null); setAiLoading(false);
    clearTimeout(dupTimer.current); clearTimeout(aiTimer.current);
  }

  function handleCompanyChange(val: string) {
    setCompany(val);
    clearTimeout(dupTimer.current);
    clearTimeout(aiTimer.current);
    setDupMatches([]);
    setAiSuggestion(null);

    if (val.trim().length >= 3) {
      // Dup check after 450ms
      dupTimer.current = setTimeout(async () => {
        try {
          const r = await api.checkDuplicate(val.trim());
          setDupMatches(r.matches);
        } catch { /* silent */ }
      }, 450);

      // AI suggestion after 1.2s of no typing
      aiTimer.current = setTimeout(async () => {
        setAiLoading(true);
        try {
          const r = await api.suggestLead(val.trim());
          if (r.suggestion?.category) setAiSuggestion(r.suggestion);
        } catch { /* silent — AI is optional */ } finally {
          setAiLoading(false);
        }
      }, 1200);
    }
  }

  function acceptAiSuggestion() {
    if (!aiSuggestion) return;
    if (aiSuggestion.category && Object.keys(CATEGORIES).includes(aiSuggestion.category)) {
      setCategory(aiSuggestion.category as LeadCategory);
    }
    if (aiSuggestion.fleetRange && aiSuggestion.fleetRange !== 'unknown') {
      // Use lower bound of range as fleet size
      setFleetSize(aiSuggestion.fleetRange.split('-')[0]);
    }
    if (aiSuggestion.pitchAngle) setPitchAngle(aiSuggestion.pitchAngle);
    setAiSuggestion(null);
  }

  function handleSubmit() {
    if (!company.trim()) return;
    createLead({
      company: company.trim(), category, status, state, city,
      contactName, email, phone, fleetSize,
      address: '', contactTitle: '', website: '', pitchAngle,
      notes: '', lastContacted: '', createdAt: now, updatedAt: now,
    });
    handleClose();
  }

  return (
    <Modal title="Add Lead" onClose={handleClose}>
      <div className="field-group">
        <label className="field-label">Company *</label>
        <input
          className="input"
          value={company}
          onChange={(e) => handleCompanyChange(e.target.value)}
          placeholder="Acme Logistics"
          autoFocus
        />
        {dupMatches.length > 0 && (
          <div className="dup-warning">
            <div className="dup-warning-title">Similar leads already exist:</div>
            {dupMatches.map((m) => (
              <div key={m.id} className="dup-item">
                <strong>{m.company}</strong>
                <span className={`status-tag ${m.status}`} style={{ fontSize: 10 }}>{STATUSES[m.status as LeadStatus] ?? m.status}</span>
                {m.city && m.state && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{m.city}, {m.state}</span>}
              </div>
            ))}
          </div>
        )}

        {/* AI suggestion banner */}
        {aiLoading && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #8b5cf6', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
            AI analyzing company…
          </div>
        )}
        {aiSuggestion && (
          <div style={{ marginTop: 8, padding: '10px 12px', background: '#8b5cf611', border: '1px solid #8b5cf633', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>✨</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', marginBottom: 4 }}>
                AI Suggestion
                <span style={{ marginLeft: 6, fontSize: 10, color: CONFIDENCE_COLOR[aiSuggestion.confidence], fontWeight: 400 }}>
                  {aiSuggestion.confidence} confidence
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                <strong>{CATEGORIES[aiSuggestion.category as LeadCategory] ?? aiSuggestion.category}</strong>
                {aiSuggestion.fleetRange && aiSuggestion.fleetRange !== 'unknown' && ` · ~${aiSuggestion.fleetRange} vehicles`}
                {aiSuggestion.pitchAngle && <div style={{ color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>{aiSuggestion.pitchAngle}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={acceptAiSuggestion}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid #8b5cf6', background: '#8b5cf6', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
              >Accept</button>
              <button
                onClick={() => setAiSuggestion(null)}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >✕</button>
            </div>
          </div>
        )}
      </div>
      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Category</label>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value as LeadCategory)}>
            {Object.entries(CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Status</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)}>
            {Object.entries(STATUSES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field-group">
          <label className="field-label">City</label>
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Dallas" />
        </div>
        <div className="field-group">
          <label className="field-label">State</label>
          <input className="input" value={state} onChange={(e) => setState(e.target.value)} placeholder="TX" maxLength={2} />
        </div>
      </div>
      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Contact Name</label>
          <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jane Smith" />
        </div>
        <div className="field-group">
          <label className="field-label">Fleet Size</label>
          <input className="input" value={fleetSize} onChange={(e) => setFleetSize(e.target.value)} placeholder="12" />
        </div>
      </div>
      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@acme.com" />
        </div>
        <div className="field-group">
          <label className="field-label">Phone</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        </div>
      </div>
      <div className="field-group">
        <label className="field-label">Pitch Angle <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(optional)</span></label>
        <input className="input" value={pitchAngle} onChange={(e) => setPitchAngle(e.target.value)} placeholder="e.g. Full fleet rebrand before trade show season" />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={handleClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!company.trim()}>
          Add Lead
        </button>
      </div>
    </Modal>
  );
}
