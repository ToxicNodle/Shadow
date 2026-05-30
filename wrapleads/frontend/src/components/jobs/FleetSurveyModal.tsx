import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { VehicleType } from '../../api/types';
import { VEHICLE_TYPE_LABELS } from '../../api/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Condition = 'new' | 'good' | 'aging' | 'damaged';

interface SurveyVehicle {
  id: string;
  type: VehicleType;
  count: number;
  condition: Condition;
  hasExistingWrap: boolean;
  notes: string;
}

interface Props {
  onClose: () => void;
  /** Called with vehicle list + company when user wants to build a quote */
  onExport: (company: string, vehicles: SurveyVehicle[]) => void;
}

// ── Sq footage table (per vehicle, full wrap) ─────────────────────────────────
const SQ_FT: Record<string, number> = {
  cargo_van: 340, box_truck: 570, sprinter: 320, pickup: 280,
  semi_tractor: 620, semi_trailer: 1040, '53ft_trailer': 1180,
  flatbed: 480, bus: 980, rv: 1200, suv: 230, passenger_car: 195,
  food_truck: 440, boat: 260, trailer: 360, other: 350,
};

const CONDITION_META: Record<Condition, { label: string; color: string; note: string }> = {
  new:     { label: 'New / No Wrap', color: '#22c55e', note: 'First wrap — clean surface' },
  good:    { label: 'Good / Rewrap',  color: '#4d8af5', note: 'Existing wrap in good shape' },
  aging:   { label: 'Aging',          color: '#f59e0b', note: 'Peeling or faded — needs prep' },
  damaged: { label: 'Damaged',        color: '#ef4444', note: 'Body damage — may need extra work' },
};

const VEHICLE_ICONS: Record<string, string> = {
  cargo_van: '🚐', box_truck: '🚚', sprinter: '🚐', pickup: '🛻',
  semi_tractor: '🚛', semi_trailer: '🚛', '53ft_trailer': '🚛',
  flatbed: '🚚', bus: '🚌', rv: '🏕', suv: '🚙', passenger_car: '🚗',
  food_truck: '🚐', boat: '⛵', trailer: '🚛', other: '🚗',
};

function shortLabel(type: VehicleType): string {
  const full = VEHICLE_TYPE_LABELS[type] ?? type;
  return full.replace(/\s*\(.*?\)/, '').replace('Standard', '').trim();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FleetSurveyModal({ onClose, onExport }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const [company, setCompany] = useState('');
  const [vehicles, setVehicles] = useState<SurveyVehicle[]>([]);
  const [step, setStep] = useState<'setup' | 'survey' | 'review'>('setup');
  const [addingType, setAddingType] = useState<VehicleType | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Pricing estimate from settings (fallback to industry average)
  const pricePerSqftLow = 4.5;
  const pricePerSqftHigh = 7.0;

  function newVehicle(type: VehicleType): SurveyVehicle {
    return { id: Math.random().toString(36).slice(2), type, count: 1, condition: 'new', hasExistingWrap: false, notes: '' };
  }

  function addVehicle(type: VehicleType) {
    const existing = vehicles.find((v) => v.type === type && v.condition === 'new');
    if (existing) {
      setVehicles((vv) => vv.map((v) => v.id === existing.id ? { ...v, count: v.count + 1 } : v));
    } else {
      const v = newVehicle(type);
      setVehicles((vv) => [...vv, v]);
      setEditingId(v.id);
    }
    setAddingType(null);
  }

  function removeVehicle(id: string) {
    setVehicles((vv) => vv.filter((v) => v.id !== id));
  }

  function updateVehicle(id: string, patch: Partial<SurveyVehicle>) {
    setVehicles((vv) => vv.map((v) => v.id === id ? { ...v, ...patch } : v));
  }

  const totalVehicles = vehicles.reduce((s, v) => s + v.count, 0);
  const totalSqFt = vehicles.reduce((s, v) => s + (SQ_FT[v.type] ?? 350) * v.count, 0);
  const estLow = Math.round(totalSqFt * pricePerSqftLow / 100) * 100;
  const estHigh = Math.round(totalSqFt * pricePerSqftHigh / 100) * 100;

  function handleExport() {
    if (!company.trim()) { showToast('Enter company name first', 'error'); return; }
    if (!vehicles.length) { showToast('Add at least one vehicle', 'error'); return; }
    onExport(company.trim(), vehicles);
  }

  const vehicleTypes = Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 540, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">🚛 Fleet Survey</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
          {(['setup', 'survey', 'review'] as const).map((s) => (
            <button
              key={s}
              className={`jobs-tab${step === s ? ' active' : ''}`}
              onClick={() => { if (s === 'survey' && !company.trim()) return; setStep(s); }}
              style={{ textTransform: 'capitalize' }}
            >
              {s === 'setup' ? '1. Setup' : s === 'survey' ? '2. Survey' : '3. Review'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>

          {/* ── Step 1: Setup ── */}
          {step === 'setup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Walk a client's fleet and log each vehicle type + condition. Get an instant quote estimate.
              </p>
              <div className="field-group">
                <label className="field-label">Fleet / Company Name</label>
                <input
                  className="input"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Logistics"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && company.trim()) setStep('survey'); }}
                />
              </div>
              <button
                className="btn btn-primary"
                style={{ alignSelf: 'flex-start' }}
                disabled={!company.trim()}
                onClick={() => setStep('survey')}
              >
                Start Survey →
              </button>
            </div>
          )}

          {/* ── Step 2: Survey ── */}
          {step === 'survey' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Running total strip */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                <div style={{ flex: 1, background: 'var(--bg-elev-2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-1px', color: 'var(--text)' }}>{totalVehicles}</div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)' }}>Vehicles</div>
                </div>
                <div style={{ flex: 1, background: 'var(--bg-elev-2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-1px', color: 'var(--accent)' }}>
                    {estLow ? `$${Math.round(estLow / 1000)}K` : '—'}
                  </div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)' }}>Est. Low</div>
                </div>
                <div style={{ flex: 1, background: 'var(--bg-elev-2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-1px', color: '#22c55e' }}>
                    {estHigh ? `$${Math.round(estHigh / 1000)}K` : '—'}
                  </div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)' }}>Est. High</div>
                </div>
              </div>

              {/* Logged vehicles */}
              {vehicles.map((v) => (
                <div key={v.id} style={{
                  background: 'var(--bg-elev)',
                  border: `1px solid var(--border)`,
                  borderLeft: `3px solid ${CONDITION_META[v.condition].color}`,
                  borderRadius: 8, padding: '10px 12px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{VEHICLE_ICONS[v.type] ?? '🚗'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{shortLabel(v.type)}</div>
                      <div style={{ fontSize: 10, color: CONDITION_META[v.condition].color }}>
                        {CONDITION_META[v.condition].label}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button className="btn" style={{ fontSize: 14, padding: '2px 8px', lineHeight: 1 }}
                        onClick={() => updateVehicle(v.id, { count: Math.max(1, v.count - 1) })}>−</button>
                      <span style={{ fontSize: 14, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{v.count}</span>
                      <button className="btn" style={{ fontSize: 14, padding: '2px 8px', lineHeight: 1 }}
                        onClick={() => updateVehicle(v.id, { count: v.count + 1 })}>+</button>
                    </div>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, padding: '0 4px' }}
                      onClick={() => removeVehicle(v.id)}
                    >✕</button>
                  </div>

                  {editingId === v.id && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6, borderTop: '1px solid var(--border-soft)' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(Object.keys(CONDITION_META) as Condition[]).map((c) => (
                          <button
                            key={c}
                            className={`btn${v.condition === c ? ' btn-primary' : ''}`}
                            style={{ fontSize: 10, padding: '3px 8px' }}
                            onClick={() => updateVehicle(v.id, { condition: c })}
                          >
                            {CONDITION_META[c].label}
                          </button>
                        ))}
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={v.hasExistingWrap}
                          onChange={(e) => updateVehicle(v.id, { hasExistingWrap: e.target.checked })}
                        />
                        Has existing wrap to remove
                      </label>
                      <input
                        className="input"
                        value={v.notes}
                        onChange={(e) => updateVehicle(v.id, { notes: e.target.value })}
                        placeholder="Notes (color, special requirements…)"
                        style={{ fontSize: 11 }}
                      />
                      <button className="btn" style={{ fontSize: 10, alignSelf: 'flex-start' }} onClick={() => setEditingId(null)}>Done ✓</button>
                    </div>
                  )}
                  {editingId !== v.id && (
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 10, textAlign: 'left', padding: 0 }}
                      onClick={() => setEditingId(v.id)}
                    >
                      {v.notes || v.hasExistingWrap ? `${v.notes}${v.hasExistingWrap ? ' · has existing wrap' : ''}` : 'tap to add notes / condition'}
                    </button>
                  )}
                </div>
              ))}

              {/* Add vehicle type picker */}
              {addingType === null ? (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 13, padding: '10px 16px' }}
                  onClick={() => setAddingType('cargo_van' as VehicleType)}
                >
                  + Add Vehicle
                </button>
              ) : (
                <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', marginBottom: 10 }}>
                    Select Vehicle Type
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {vehicleTypes.map((t) => (
                      <button
                        key={t}
                        className="btn"
                        style={{ fontSize: 11, flexDirection: 'column', display: 'flex', alignItems: 'center', gap: 3, padding: '8px 4px' }}
                        onClick={() => addVehicle(t)}
                      >
                        <span style={{ fontSize: 20 }}>{VEHICLE_ICONS[t] ?? '🚗'}</span>
                        <span style={{ fontSize: 9, textAlign: 'center', lineHeight: 1.2 }}>{shortLabel(t)}</span>
                      </button>
                    ))}
                  </div>
                  <button className="btn" style={{ marginTop: 8, fontSize: 11 }} onClick={() => setAddingType(null)}>Cancel</button>
                </div>
              )}

              {vehicles.length > 0 && (
                <button className="btn" style={{ fontSize: 12, marginTop: 4, borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={() => setStep('review')}>
                  Review & Export →
                </button>
              )}
            </div>
          )}

          {/* ── Step 3: Review ── */}
          {step === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{company}</div>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>— fleet survey summary</span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Vehicle', 'Qty', 'Condition', 'Sq Ft', 'Est. Range'].map((h) => (
                      <th key={h} style={{ textAlign: h === 'Qty' || h === 'Sq Ft' || h === 'Est. Range' ? 'right' : 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => {
                    const sqft = (SQ_FT[v.type] ?? 350) * v.count;
                    return (
                      <tr key={v.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td style={{ padding: '8px 0', fontWeight: 600 }}>
                          {VEHICLE_ICONS[v.type]} {shortLabel(v.type)}
                          {v.hasExistingWrap && <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 4 }}>[removal]</span>}
                        </td>
                        <td style={{ textAlign: 'right', padding: '8px 8px' }}>{v.count}</td>
                        <td style={{ padding: '8px 0' }}>
                          <span style={{ fontSize: 10, color: CONDITION_META[v.condition].color }}>{CONDITION_META[v.condition].label}</span>
                        </td>
                        <td style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--text-muted)' }}>{sqft.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600 }}>
                          ${Math.round(sqft * pricePerSqftLow / 100) * 100}–${Math.round(sqft * pricePerSqftHigh / 100) * 100}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ paddingTop: 10, fontWeight: 700, fontSize: 12 }}>Total</td>
                    <td style={{ textAlign: 'right', paddingTop: 10, fontWeight: 700 }}>{totalSqFt.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', paddingTop: 10, fontWeight: 800, color: 'var(--accent)', fontSize: 13 }}>
                      ${estLow.toLocaleString()}–${estHigh.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {vehicles.some((v) => v.notes) && (
                <div style={{ background: 'var(--bg-elev-2)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', marginBottom: 8 }}>Notes</div>
                  {vehicles.filter((v) => v.notes).map((v) => (
                    <div key={v.id} style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                      <strong>{shortLabel(v.type)}</strong>: {v.notes}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => setStep('survey')}>← Back to Survey</button>
                <button
                  className="btn"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    const lines = vehicles.map((v) =>
                      `${v.count}× ${shortLabel(v.type)} (${CONDITION_META[v.condition].label})${v.notes ? ` — ${v.notes}` : ''}`
                    );
                    const summary = `Fleet Survey: ${company}\n${lines.join('\n')}\nEst: $${estLow.toLocaleString()}–$${estHigh.toLocaleString()}`;
                    navigator.clipboard.writeText(summary);
                    showToast('Survey copied to clipboard!', 'success');
                  }}
                >
                  Copy to Clipboard
                </button>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleExport}>
                  Export to Quote →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
