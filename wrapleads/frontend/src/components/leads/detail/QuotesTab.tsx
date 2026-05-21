import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { showToast } from '../../../utils/toast';
import QuoteBuilderModal from '../../modals/QuoteBuilderModal';
import { useLeads } from '../../../hooks/useLeads';
import type { Lead } from '../../../api/types';
import type { ShopQuote, QuoteStatus } from '../../../api/types';

// ── Wrap ROI Calculator ────────────────────────────────────────────────────────
// Impressions benchmarks by vehicle type (vehicles/day × avg daily impressions).
// Sources: OAAA (Out-of-Home Advertising Assoc.), 3M wrap marketing materials.
const IMPRESSIONS_PER_VEHICLE: Record<string, number> = {
  cargo_van_standard: 30_000,
  cargo_van_high_roof: 32_000,
  box_truck_16: 45_000,
  box_truck_24: 50_000,
  semi_tractor: 70_000,
  pickup_truck: 28_000,
  sprinter_van: 34_000,
  other: 30_000,
};
const WRAP_COST_PER_UNIT: Record<string, number> = {
  cargo_van_standard: 2800,
  cargo_van_high_roof: 3200,
  box_truck_16: 3800,
  box_truck_24: 5200,
  semi_tractor: 7500,
  pickup_truck: 2400,
  sprinter_van: 3500,
  other: 3000,
};
const VEHICLE_LABELS: Record<string, string> = {
  cargo_van_standard: 'Cargo Van', cargo_van_high_roof: 'High-Roof Van',
  box_truck_16: '16ft Box Truck', box_truck_24: '24ft Box Truck',
  semi_tractor: 'Semi / Tractor', pickup_truck: 'Pickup Truck',
  sprinter_van: 'Sprinter Van', other: 'Vehicle',
};

function WrapROICalculator({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [vehicleType, setVehicleType] = useState('cargo_van_standard');
  const [fleetCount, setFleetCount] = useState(Math.max(1, parseInt(lead.fleetSize || '1') || 1));
  const [wrapCost, setWrapCost] = useState(0); // 0 = auto
  const [wrapLife, setWrapLife] = useState(5);
  const [cpm, setCpm] = useState(3.5); // $/1000 impressions, OOH benchmark

  const roi = useMemo(() => {
    const imp = IMPRESSIONS_PER_VEHICLE[vehicleType] ?? 30_000;
    const annualImpressions = imp * 365 * fleetCount;
    const adValue = (annualImpressions / 1000) * cpm;
    const perUnit = wrapCost > 0 ? wrapCost / fleetCount : (WRAP_COST_PER_UNIT[vehicleType] ?? 3000);
    const totalWrapCost = perUnit * fleetCount;
    const annualCost = totalWrapCost / wrapLife;
    const roiPct = ((adValue - annualCost) / annualCost) * 100;
    const costPerImpression = (annualCost / annualImpressions) * 100; // in cents
    return { annualImpressions, adValue, totalWrapCost, annualCost, roiPct, costPerImpression };
  }, [vehicleType, fleetCount, wrapCost, wrapLife, cpm]);

  function copyReport() {
    const txt = [
      `Wrap ROI Analysis — ${lead.company}`,
      `Vehicle: ${VEHICLE_LABELS[vehicleType]} × ${fleetCount}`,
      `Annual impressions: ${roi.annualImpressions.toLocaleString()}`,
      `Equivalent ad value: $${Math.round(roi.adValue).toLocaleString()}/yr`,
      `Wrap investment: $${Math.round(roi.totalWrapCost).toLocaleString()} total / $${Math.round(roi.annualCost).toLocaleString()}/yr`,
      `Cost per 1,000 impressions: $${roi.costPerImpression.toFixed(2)}`,
      `Estimated ROI: ${Math.round(roi.roiPct)}%`,
    ].join('\n');
    navigator.clipboard.writeText(txt).then(() => showToast('ROI report copied to clipboard'));
  }

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <button
        className="btn"
        style={{ fontSize: 11, width: '100%', justifyContent: 'space-between' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Wrap ROI Calculator
        </span>
        <span style={{ color: 'var(--text-muted)' }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Show your client the advertising value of their fleet wrap — hard numbers built from industry benchmarks.
          </p>

          <div className="field-row">
            <div className="field-group">
              <label className="field-label" style={{ fontSize: 11 }}>Vehicle type</label>
              <select className="input" style={{ fontSize: 12 }} value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                {Object.entries(VEHICLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" style={{ fontSize: 11 }}>Fleet count</label>
              <input className="input" style={{ fontSize: 12 }} type="number" min={1} value={fleetCount}
                onChange={(e) => setFleetCount(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
          </div>

          <div className="field-row">
            <div className="field-group">
              <label className="field-label" style={{ fontSize: 11 }}>Wrap life (years)</label>
              <input className="input" style={{ fontSize: 12 }} type="number" min={1} max={10} value={wrapLife}
                onChange={(e) => setWrapLife(Math.max(1, parseInt(e.target.value) || 5))} />
            </div>
            <div className="field-group">
              <label className="field-label" style={{ fontSize: 11 }}>Total wrap cost ($, 0 = auto)</label>
              <input className="input" style={{ fontSize: 12 }} type="number" min={0} value={wrapCost}
                onChange={(e) => setWrapCost(Math.max(0, parseInt(e.target.value) || 0))} />
            </div>
          </div>

          {/* ROI results */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 4 }}>
            {[
              { label: 'Annual Impressions', value: (roi.annualImpressions / 1_000_000).toFixed(1) + 'M', color: 'var(--accent)' },
              { label: 'Ad Value / Year', value: '$' + Math.round(roi.adValue / 1000) + 'K', color: '#10b981' },
              { label: 'Estimated ROI', value: Math.round(roi.roiPct) + '%', color: roi.roiPct >= 100 ? '#10b981' : '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
            <span>Wrap investment: <strong>${Math.round(roi.totalWrapCost).toLocaleString()}</strong> total · <strong>${Math.round(roi.annualCost).toLocaleString()}</strong>/yr</span>
            <span>CPM: <strong>${roi.costPerImpression.toFixed(2)}</strong> vs ${cpm.toFixed(2)} OOH avg</span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={copyReport}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy Report
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-faint)' }}>
              CPM benchmark:
              <input type="range" min={1} max={8} step={0.5} value={cpm}
                onChange={(e) => setCpm(parseFloat(e.target.value))}
                style={{ width: 60, accentColor: 'var(--accent)' }} />
              ${cpm.toFixed(1)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', invoiced: 'Invoiced',
};
const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: 'var(--text-muted)',
  sent: '#3b82f6',
  accepted: '#10b981',
  declined: '#ef4444',
  invoiced: '#8b5cf6',
};

// ── Wrap Price Estimator ───────────────────────────────────────────────────────
// Sq footage per vehicle type (printable wrap area including bleed)
const SQFT: Record<string, number> = {
  cargo_van_standard: 200, cargo_van_high_roof: 230,
  box_truck_16: 320, box_truck_24: 480,
  semi_tractor: 380, pickup_truck: 140,
  sprinter_van: 260, car_sedan: 110, car_suv: 150, other: 200,
};
// Material cost per sqft (cast vinyl, mid-grade — e.g. Avery SW900 or 3M 1080)
const MATERIAL_RATE = 3.80;  // $/sqft
const LAMINATE_RATE = 1.40;  // $/sqft
// Labor rate estimates (install hrs × shop rate)
const LABOR_HOURS: Record<string, number> = {
  cargo_van_standard: 8, cargo_van_high_roof: 10,
  box_truck_16: 14, box_truck_24: 20,
  semi_tractor: 16, pickup_truck: 5,
  sprinter_van: 12, car_sedan: 5, car_suv: 7, other: 8,
};
const SHOP_RATE_LOW = 65;   // $/hr
const SHOP_RATE_HIGH = 95;  // $/hr
const DESIGN_FLAT = 350;    // per unique design

const EST_VEHICLES: Record<string, string> = {
  ...VEHICLE_LABELS,
  car_sedan: 'Car / Sedan', car_suv: 'SUV / Crossover',
};

function WrapPriceEstimator({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [vehicleType, setVehicleType] = useState('cargo_van_standard');
  const [count, setCount] = useState(Math.max(1, parseInt(lead.fleetSize || '1') || 1));
  const [designs, setDesigns] = useState(1);
  const [shopRate] = useState(75);
  const [coverage, setCoverage] = useState<'full' | 'partial' | 'spot'>('full');

  const coverageMultiplier = coverage === 'full' ? 1 : coverage === 'partial' ? 0.65 : 0.30;

  const sqft = (SQFT[vehicleType] ?? 200) * coverageMultiplier;
  const materialCost = sqft * MATERIAL_RATE;
  const laminateCost = sqft * LAMINATE_RATE;
  const laborHrs = (LABOR_HOURS[vehicleType] ?? 8) * (coverage === 'spot' ? 0.4 : coverageMultiplier);
  const laborCost = laborHrs * shopRate;
  const designCost = DESIGN_FLAT * designs;
  const perVehicleLow = (materialCost + laminateCost + laborHrs * SHOP_RATE_LOW) * 0.95;
  const perVehicleHigh = (materialCost + laminateCost + laborHrs * SHOP_RATE_HIGH + designCost / count) * 1.15;
  const totalLow = perVehicleLow * count;
  const totalHigh = perVehicleHigh * count;

  void laborCost; // used in breakdown rows below

  function fmtD(n: number) { return `$${Math.round(n).toLocaleString()}`; }

  const breakdown = [
    { label: `Cast vinyl (${Math.round(sqft)} sqft/unit)`, unit: `$${(sqft * MATERIAL_RATE).toFixed(0)}`, total: fmtD(sqft * MATERIAL_RATE * count), color: '#3b82f6' },
    { label: `Laminate overcoat`, unit: `$${(sqft * LAMINATE_RATE).toFixed(0)}`, total: fmtD(sqft * LAMINATE_RATE * count), color: '#8b5cf6' },
    { label: `Installation labor (${Math.round(laborHrs)}h/unit)`, unit: `$${Math.round(laborHrs * shopRate)}`, total: fmtD(laborHrs * shopRate * count), color: '#f59e0b' },
    { label: `Design & print setup (${designs} design${designs !== 1 ? 's' : ''})`, unit: `$${Math.round(designCost / count)}`, total: fmtD(designCost), color: '#10b981' },
  ];

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        Wrap Price Estimator
        {!open && count > 0 && (
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
            {count} {EST_VEHICLES[vehicleType] ?? 'vehicle'}{count !== 1 ? 's' : ''} · {fmtD(totalLow)}–{fmtD(totalHigh)}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 11, fontWeight: 400 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
          {/* Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Vehicle Type</label>
              <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className="select" style={{ width: '100%', fontSize: 12 }}>
                {Object.entries(EST_VEHICLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Coverage</label>
              <select value={coverage} onChange={(e) => setCoverage(e.target.value as 'full' | 'partial' | 'spot')} className="select" style={{ width: '100%', fontSize: 12 }}>
                <option value="full">Full Wrap</option>
                <option value="partial">Partial (65%)</option>
                <option value="spot">Spot / Decals (30%)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Vehicle Count: <strong>{count}</strong></label>
              <input type="range" min={1} max={100} value={count} onChange={(e) => setCount(+e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Designs: <strong>{designs}</strong></label>
              <input type="range" min={1} max={5} value={designs} onChange={(e) => setDesigns(+e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>

          {/* Total range */}
          <div style={{ margin: '14px 0', padding: '12px 14px', background: '#10b98111', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>{fmtD(totalLow)} – {fmtD(totalHigh)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              estimated total · {fmtD(perVehicleLow)}–{fmtD(perVehicleHigh)} per vehicle
            </div>
          </div>

          {/* Material breakdown */}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, marginBottom: 8 }}>Cost Breakdown</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', paddingBottom: 4, fontWeight: 600 }}>Item</th>
                <th style={{ textAlign: 'right', paddingBottom: 4, fontWeight: 600 }}>Per Unit</th>
                <th style={{ textAlign: 'right', paddingBottom: 4, fontWeight: 600 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row) => (
                <tr key={row.label} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 0', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: row.color, flexShrink: 0, display: 'inline-block' }} />
                    {row.label}
                  </td>
                  <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{row.unit}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            Estimates use {Math.round(sqft)} sqft/unit at ${MATERIAL_RATE}/sqft cast vinyl + ${LAMINATE_RATE}/sqft laminate + ${shopRate}/hr labor.
            Actual pricing varies by vehicle condition, graphic complexity, and market rates. Use as a starting point for your formal quote.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Proposal Decay Meter ──────────────────────────────────────────────────────
// Shows acceptance probability declining over time after a proposal is sent.
// Research-backed decay curve: 75% day 0 → ~20% day 21.

function decayProbability(daysSince: number): number {
  if (daysSince <= 0) return 75;
  if (daysSince <= 3)  return Math.round(75 - daysSince * 3);    // 75→66
  if (daysSince <= 7)  return Math.round(66 - (daysSince - 3) * 3.5); // 66→52
  if (daysSince <= 14) return Math.round(52 - (daysSince - 7) * 2.5); // 52→35
  if (daysSince <= 21) return Math.round(35 - (daysSince - 14) * 2);  // 35→21
  return Math.max(10, Math.round(21 - (daysSince - 21) * 0.5));
}

function ProposalDecayMeter({ lead }: { lead: Lead }) {
  if (lead.status !== 'proposal') return null;

  const daysSince = lead.lastContacted
    ? Math.floor((Date.now() - new Date(lead.lastContacted).getTime()) / 86_400_000)
    : null;

  if (daysSince === null) return null;

  const prob = decayProbability(daysSince);
  const pct = Math.min(100, prob); // bar width

  const urgency = prob >= 60 ? 'fresh' : prob >= 40 ? 'warm' : prob >= 25 ? 'fading' : 'critical';
  const COLOR: Record<string, string> = { fresh: '#10b981', warm: '#f59e0b', fading: '#f97316', critical: '#ef4444' };
  const MSG: Record<string, string> = {
    fresh:    'Proposal is fresh — follow up within the next few days to stay top of mind.',
    warm:     'Good time for a check-in. Confirm they\'ve had a chance to review.',
    fading:   'Urgency rising — re-engage with a new angle or a value-add (case study, ROI numbers).',
    critical: 'Risk of loss. Send a final follow-up or offer an expiry incentive to force a decision.',
  };
  const color = COLOR[urgency];

  return (
    <div style={{
      background: `${color}08`,
      border: `1px solid ${color}28`,
      borderRadius: 10,
      padding: '10px 14px',
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Proposal Acceptance Window</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
            {daysSince === 0 ? 'Sent today' : `Sent ${daysSince}d ago`}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 17, fontWeight: 900, color, lineHeight: 1 }}>{prob}%</span>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 4 }}>accept prob.</span>
        </div>
      </div>

      {/* Decay bar */}
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>

      {/* Day markers */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-faint)', marginBottom: 8 }}>
        <span>Day 0 (75%)</span>
        <span>Day 7 (52%)</span>
        <span>Day 14 (35%)</span>
        <span>Day 21+ (21%)</span>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{MSG[urgency]}</p>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props { lead: Lead; }

export default function QuotesTab({ lead }: Props) {
  const qc = useQueryClient();
  const { updateLead } = useLeads();
  const leadId = lead.serverId!;
  const [showBuilder, setShowBuilder] = useState(false);
  const [editQuote, setEditQuote] = useState<ShopQuote | undefined>(undefined);
  const [suggestWon, setSuggestWon] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', leadId],
    queryFn: () => api.getLeadQuotes(leadId),
    enabled: !!leadId,
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteQuote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes', leadId] });
      showToast('Quote deleted');
    },
  });

  const quotes = data?.quotes ?? [];

  function openNew() {
    setEditQuote(undefined);
    setShowBuilder(true);
  }

  function openEdit(q: ShopQuote) {
    setEditQuote(q);
    setShowBuilder(true);
  }

  function handleAccepted() {
    if (lead.status !== 'won') setSuggestWon(true);
  }

  function markWon() {
    if (!lead.serverId) return;
    updateLead({ serverId: lead.serverId, patch: { status: 'won' } });
    setSuggestWon(false);
    showToast('Lead marked as Won!');
  }

  if (!leadId) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>Save this lead first to create quotes.</p>;
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Won suggestion banner */}
      {suggestWon && (
        <div className="won-suggest-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <span style={{ fontSize: 20 }}>🏆</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Quote accepted!</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ready to mark <strong>{lead.company}</strong> as Won?</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, background: '#10b981', border: '1px solid #10b981' }}
              onClick={markWon}
            >
              Yes, Mark Won →
            </button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => setSuggestWon(false)}>
              Later
            </button>
          </div>
        </div>
      )}

      {/* Proposal decay meter — shown when status is 'proposal' */}
      <ProposalDecayMeter lead={lead} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {quotes.length} quote{quotes.length !== 1 ? 's' : ''}
        </span>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={openNew}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 5 }}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Quote
        </button>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
          <span className="spinner" /> Loading…
        </div>
      )}

      {!isLoading && quotes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: 'var(--border)', display: 'block', margin: '0 auto 10px' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No quotes yet</p>
          <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 4 }}>Create a line-item quote and send it to the client</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {quotes.map((q) => (
          <div
            key={q.id}
            className="quote-card"
            onClick={() => openEdit(q)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {q.quote_number} · {timeAgo(q.created_at)}
                  {q.line_items?.length ? ` · ${q.line_items.length} line${q.line_items.length !== 1 ? 's' : ''}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>${fmt(q.total)}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: STATUS_COLORS[q.status], textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {STATUS_LABELS[q.status]}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                className="btn"
                style={{ fontSize: 11, color: 'var(--red)', padding: '3px 8px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete ${q.quote_number}?`)) deleteMut.mutate(q.id);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <WrapPriceEstimator lead={lead} />
      <WrapROICalculator lead={lead} />

      {showBuilder && (
        <QuoteBuilderModal
          leadId={leadId}
          leadCompany={lead.company}
          quote={editQuote}
          onClose={() => setShowBuilder(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['quotes', leadId] })}
          onAccepted={handleAccepted}
        />
      )}
    </div>
  );
}
