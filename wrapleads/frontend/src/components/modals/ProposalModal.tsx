import { useState } from 'react';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';

const SERVICE_OPTIONS = [
  { id: 'fleet_full', label: 'Full Fleet Wrap' },
  { id: 'fleet_partial', label: 'Partial Fleet Wrap' },
  { id: 'color_change', label: 'Color Change Wrap' },
  { id: 'dinoc_film', label: 'DI-NOC Architectural Film' },
  { id: 'reatec_film', label: 'Rea Tec Architectural Film' },
  { id: 'wall_graphics', label: 'Wall Graphics / Wallpaper' },
  { id: 'window_graphics', label: 'Window Graphics' },
  { id: 'design_only', label: 'Design Services' },
];

const DEFAULT_PRICING: Record<string, number> = {
  fleet_full: 3500, fleet_partial: 1800, color_change: 4200,
  dinoc_film: 45, reatec_film: 38, wall_graphics: 8,
  window_graphics: 12, design_only: 800,
};

const PRICE_UNITS: Record<string, string> = {
  dinoc_film: '/sq ft', reatec_film: '/sq ft', wall_graphics: '/sq ft',
  window_graphics: '/sq ft',
};

export default function ProposalModal() {
  const { leads } = useLeads();
  const { proposalLeadId, settings, showToast, setProposalOpen } = useAppStore((s) => ({
    proposalLeadId: s.proposalLeadId,
    settings: s.settings,
    showToast: s.showToast,
    setProposalOpen: s.setProposalOpen,
  }));

  const lead = leads.find((l) => l.id === proposalLeadId);

  const [selectedServices, setSelectedServices] = useState<string[]>(['fleet_full']);
  const [pricing, setPricing] = useState<Record<string, number>>(DEFAULT_PRICING);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleService(id: string) {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  async function generate() {
    if (!lead || selectedServices.length === 0) return;
    setLoading(true);
    setResult(null);
    try {
      const activePricing: Record<string, number> = {};
      selectedServices.forEach((s) => { activePricing[s] = pricing[s] ?? 0; });
      const data = await api.generateProposal({ lead, services: selectedServices, pricing: activePricing, notes, settings });
      setResult(data);
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    if (!result) return;
    navigator.clipboard.writeText(`Subject: ${result.subject}\n\n${result.body}`)
      .then(() => { showToast('Proposal copied!'); setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  function openMailTo() {
    if (!result || !lead?.email) return;
    const url = `mailto:${lead.email}?subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(result.body)}`;
    window.open(url, '_blank');
  }

  function close() { setProposalOpen(false); }

  if (!lead) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 680, width: '100%', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <div>
            <div className="modal-title" style={{ margin: 0 }}>Generate Proposal</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{lead.company}</div>
          </div>
          <button className="btn btn-icon" onClick={close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Services */}
          <div>
            <label className="field-label">Services to Include</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
              {SERVICE_OPTIONS.map((s) => {
                const active = selectedServices.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleService(s.id)}
                    style={{
                      padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                      textAlign: 'left', transition: 'all 0.15s',
                      background: active ? 'var(--accent)' : 'var(--bg-input)',
                      color: active ? '#fff' : 'var(--text)',
                      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pricing */}
          {selectedServices.length > 0 && (
            <div>
              <label className="field-label">Pricing</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {selectedServices.map((sid) => {
                  const svc = SERVICE_OPTIONS.find((s) => s.id === sid);
                  const unit = PRICE_UNITS[sid] || '/vehicle';
                  return (
                    <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-dim)' }}>{svc?.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>$</span>
                        <input
                          className="input"
                          type="number"
                          style={{ width: 90, textAlign: 'right', padding: '4px 8px' }}
                          value={pricing[sid] ?? 0}
                          onChange={(e) => setPricing({ ...pricing, [sid]: Number(e.target.value) })}
                        />
                        <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="field-label">Additional Notes (optional)</label>
            <textarea
              className="input"
              style={{ minHeight: 64, resize: 'vertical', marginTop: 4 }}
              placeholder="Timeline, project scope, special requirements…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
            onClick={generate}
            disabled={loading || selectedServices.length === 0}
          >
            {loading ? <><span className="spinner" /> Writing proposal…</> : 'Generate Proposal'}
          </button>

          {/* Result */}
          {result && (
            <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Subject: {result.subject}</span>
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text-dim)', maxHeight: 320, overflowY: 'auto' }}>
                {result.body}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={copy}>
                  {copied ? '✓ Copied!' : 'Copy Proposal'}
                </button>
                {lead.email && (
                  <button className="btn" onClick={openMailTo}>Open in Mail</button>
                )}
                <button className="btn" onClick={() => setResult(null)}>Revise</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
