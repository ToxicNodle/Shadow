import { useState, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useLeads } from '../../hooks/useLeads';
import { api } from '../../api/client';
import Modal from '../ui/Modal';
import type { LeadCategory, LeadStatus } from '../../api/types';
import { CATEGORIES, STATUSES } from '../../api/types';

interface DupMatch { id: number; company: string; status: string; city: string; state: string; }

const now = new Date().toISOString();

export default function AddLeadModal() {
  const { addLeadOpen, setAddLeadOpen } = useAppStore((s) => ({
    addLeadOpen: s.addLeadOpen,
    setAddLeadOpen: s.setAddLeadOpen,
  }));
  const { createLead } = useLeads();

  const [company, setCompany] = useState('');
  const [dupMatches, setDupMatches] = useState<DupMatch[]>([]);
  const dupTimer = useRef<ReturnType<typeof setTimeout>>();
  const [category, setCategory] = useState<LeadCategory>('fleet');
  const [status, setStatus] = useState<LeadStatus>('cold');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fleetSize, setFleetSize] = useState('');

  if (!addLeadOpen) return null;

  function handleClose() {
    setAddLeadOpen(false);
    setCompany(''); setContactName(''); setEmail(''); setPhone(''); setFleetSize('');
    setState(''); setCity('');
    setCategory('fleet'); setStatus('cold');
    setDupMatches([]);
    clearTimeout(dupTimer.current);
  }

  function handleCompanyChange(val: string) {
    setCompany(val);
    clearTimeout(dupTimer.current);
    setDupMatches([]);
    if (val.trim().length >= 3) {
      dupTimer.current = setTimeout(async () => {
        try {
          const r = await api.checkDuplicate(val.trim());
          setDupMatches(r.matches);
        } catch { /* silent */ }
      }, 450);
    }
  }

  function handleSubmit() {
    if (!company.trim()) return;
    createLead({
      company: company.trim(), category, status, state, city,
      contactName, email, phone, fleetSize,
      address: '', contactTitle: '', website: '', pitchAngle: '',
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
                <span className={`status-tag ${m.status}`} style={{ fontSize: 10 }}>{STATUSES[m.status] ?? m.status}</span>
                {m.city && m.state && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{m.city}, {m.state}</span>}
              </div>
            ))}
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
      <div className="modal-actions">
        <button className="btn" onClick={handleClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!company.trim()}>
          Add Lead
        </button>
      </div>
    </Modal>
  );
}
