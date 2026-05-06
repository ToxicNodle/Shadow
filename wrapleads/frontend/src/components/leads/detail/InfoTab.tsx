import { useState } from 'react';
import type { Lead, LeadCategory, LeadStatus } from '../../../api/types';
import { CATEGORIES, STATUSES } from '../../../api/types';
import { useLeads } from '../../../hooks/useLeads';

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

export default function InfoTab({ lead }: Props) {
  const { updateLead } = useLeads();
  const [local, setLocal] = useState<Lead>(lead);

  function patch(field: keyof Lead, value: string) {
    const updated = { ...local, [field]: value };
    setLocal(updated);
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
          <input
            className="input"
            value={local.phone}
            onChange={(e) => setLocal({ ...local, phone: e.target.value })}
            onBlur={(e) => patch('phone', e.target.value)}
          />
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
    </div>
  );
}
