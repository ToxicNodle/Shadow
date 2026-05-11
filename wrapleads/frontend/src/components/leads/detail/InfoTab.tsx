import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Lead, LeadCategory, LeadStatus } from '../../../api/types';
import { CATEGORIES, STATUSES } from '../../../api/types';
import { useLeads } from '../../../hooks/useLeads';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../api/client';

interface Props {
  lead: Lead;
}

const CATEGORY_OPTIONS = Object.entries(CATEGORIES) as [LeadCategory, string][];
const STATUS_OPTIONS = Object.entries(STATUSES) as [LeadStatus, string][];
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

const WIN_LOSS_FACTORS = [
  { value: 'price', label: 'Price' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'relationship', label: 'Relationship' },
  { value: 'quality', label: 'Quality / Portfolio' },
  { value: 'competition', label: 'Chose Competitor' },
  { value: 'no_budget', label: 'No Budget' },
  { value: 'not_ready', label: 'Not Ready Yet' },
  { value: 'other', label: 'Other' },
];

function WinLossModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const [factor, setFactor] = useState('');
  const [notes, setNotes] = useState('');
  const mut = useMutation({
    mutationFn: () => api.captureWinLoss(lead.serverId!, factor || 'other', notes),
    onSuccess: onClose,
  });
  const outcome = lead.status === 'won' ? 'Won' : 'Lost';
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontSize: 22 }}>{outcome === 'Won' ? '🏆' : '📋'}</span>
          <h2 className="modal-title" style={{ margin: 0 }}>Deal {outcome} — What was the factor?</h2>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
          {WIN_LOSS_FACTORS.map((f) => (
            <button
              key={f.value}
              className={`btn ${factor === f.value ? 'btn-primary' : ''}`}
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => setFactor(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <textarea
          className="input"
          placeholder="Any notes? (optional)"
          rows={3}
          style={{ width: '100%', resize: 'vertical', marginBottom: 12 }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Skip</button>
          <button
            className="btn btn-primary"
            disabled={mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SmsModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  const mut = useMutation({
    mutationFn: () => api.sendSms(lead.serverId!, msg),
    onSuccess: onClose,
  });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontSize: 20 }}>💬</span>
          <h2 className="modal-title" style={{ margin: 0 }}>Text {lead.contactName || lead.company}</h2>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{lead.phone}</div>
        <textarea
          className="input"
          placeholder="Your message…"
          rows={4}
          style={{ width: '100%', resize: 'vertical', marginBottom: 12 }}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          autoFocus
        />
        {mut.isError && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{(mut.error as Error).message}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!msg.trim() || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Sending…' : '💬 Send SMS'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InfoTab({ lead }: Props) {
  const { updateLead } = useLeads();
  const { setProposalOpen } = useAppStore((s) => ({ setProposalOpen: s.setProposalOpen }));
  const [local, setLocal] = useState<Lead>(lead);
  const [showWinLoss, setShowWinLoss] = useState(false);
  const [showSms, setShowSms] = useState(false);
  const [prevStatus, setPrevStatus] = useState<LeadStatus>(lead.status);

  function patch(field: keyof Lead, value: string) {
    const updated = { ...local, [field]: value };
    setLocal(updated);
    if (field === 'status' && (value === 'won' || value === 'lost') && value !== prevStatus) {
      setPrevStatus(value as LeadStatus);
      setTimeout(() => setShowWinLoss(true), 300);
    }
    if (lead.serverId) {
      updateLead({ serverId: lead.serverId, patch: { [field]: value } });
    }
  }

  return (
    <div>
      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Category</label>
          <select
            className="select"
            value={local.category}
            onChange={(e) => patch('category', e.target.value)}
          >
            {CATEGORY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Status</label>
          <select
            className="select"
            value={local.status}
            onChange={(e) => patch('status', e.target.value)}
          >
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Company</label>
        <input
          className="input"
          value={local.company}
          onChange={(e) => setLocal({ ...local, company: e.target.value })}
          onBlur={(e) => patch('company', e.target.value)}
        />
      </div>

      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Contact Name</label>
          <input
            className="input"
            value={local.contactName}
            onChange={(e) => setLocal({ ...local, contactName: e.target.value })}
            onBlur={(e) => patch('contactName', e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Title</label>
          <input
            className="input"
            value={local.contactTitle}
            onChange={(e) => setLocal({ ...local, contactTitle: e.target.value })}
            onBlur={(e) => patch('contactTitle', e.target.value)}
          />
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Email</label>
        <input
          className="input"
          type="email"
          value={local.email}
          onChange={(e) => setLocal({ ...local, email: e.target.value })}
          onBlur={(e) => patch('email', e.target.value)}
        />
      </div>

      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Phone</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="input"
              value={local.phone}
              onChange={(e) => setLocal({ ...local, phone: e.target.value })}
              onBlur={(e) => patch('phone', e.target.value)}
              style={{ flex: 1 }}
            />
            {local.phone && (
              <button
                className="btn"
                style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
                onClick={() => setShowSms(true)}
                title="Send SMS"
              >
                💬 SMS
              </button>
            )}
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Fleet Size</label>
          <input
            className="input"
            value={local.fleetSize}
            onChange={(e) => setLocal({ ...local, fleetSize: e.target.value })}
            onBlur={(e) => patch('fleetSize', e.target.value)}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field-group">
          <label className="field-label">City</label>
          <input
            className="input"
            value={local.city}
            onChange={(e) => setLocal({ ...local, city: e.target.value })}
            onBlur={(e) => patch('city', e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">State</label>
          <select
            className="select"
            value={local.state}
            onChange={(e) => patch('state', e.target.value)}
          >
            <option value="">—</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Website</label>
        <input
          className="input"
          value={local.website}
          onChange={(e) => setLocal({ ...local, website: e.target.value })}
          onBlur={(e) => patch('website', e.target.value)}
        />
      </div>

      <div className="field-group">
        <label className="field-label">Pitch Angle</label>
        <input
          className="input"
          value={local.pitchAngle}
          onChange={(e) => setLocal({ ...local, pitchAngle: e.target.value })}
          onBlur={(e) => patch('pitchAngle', e.target.value)}
          placeholder="e.g. fleet refresh, new branding"
        />
      </div>

      <button
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '10px', marginTop: 8 }}
        onClick={() => setProposalOpen(true, lead.id)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        Generate Quote / Proposal
      </button>

      {showWinLoss && lead.serverId && (
        <WinLossModal lead={local} onClose={() => setShowWinLoss(false)} />
      )}
      {showSms && lead.serverId && (
        <SmsModal lead={local} onClose={() => setShowSms(false)} />
      )}
    </div>
  );
}
