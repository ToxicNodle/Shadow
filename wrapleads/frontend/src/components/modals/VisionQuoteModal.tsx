import { useState, useRef } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import type { VisionQuoteResult } from '../../api/types';

interface Props {
  onClose: () => void;
}

function fmt(n: number) {
  return `$${n.toLocaleString()}`;
}

function DropZone({ onFile, accept, label }: { onFile: (f: File) => void; accept: string; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function handle(file: File | undefined) {
    if (file) onFile(file);
  }

  return (
    <div
      className={`vision-dropzone ${drag ? 'vision-dropzone-over' : ''}`}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
    >
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
        onChange={(e) => handle(e.target.files?.[0])} capture="environment" />
      <div className="vision-dropzone-icon">📷</div>
      <p className="vision-dropzone-label">{label}</p>
      <p className="vision-dropzone-sub">Tap to take photo or upload JPEG / PNG</p>
    </div>
  );
}

// ── Quote Tab ─────────────────────────────────────────────────────────────────

function QuoteTab() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<VisionQuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.quoteVehicle(file);
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const confidenceColor = result?.confidence === 'high' ? '#22c55e' : result?.confidence === 'medium' ? '#f59e0b' : '#ef4444';

  return (
    <div className="vision-tab-body">
      {!file ? (
        <DropZone onFile={handleFile} accept="image/jpeg,image/png,image/webp" label="Upload a vehicle photo to get an instant quote" />
      ) : (
        <div className="vision-photo-row">
          <img src={preview!} alt="Vehicle" className="vision-photo-preview" />
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setFile(null); setPreview(null); setResult(null); }}>
            Change Photo
          </button>
        </div>
      )}

      {file && !result && (
        <button className="btn btn-primary" disabled={loading} onClick={analyze} style={{ alignSelf: 'flex-start' }}>
          {loading ? 'Analyzing vehicle…' : '🔍 Get Quote'}
        </button>
      )}

      {loading && <div className="vision-scanning"><span className="spinner" /> Identifying vehicle with AI…</div>}

      {error && <div className="error-box">{error}</div>}

      {result && (
        <div className="vision-result">
          <div className="vision-result-header">
            <div>
              <span className="vision-result-label">{result.vehicleLabel}</span>
              <span className="vision-result-confidence" style={{ background: confidenceColor }}>
                {result.confidence} confidence
              </span>
            </div>
            <span className="vision-result-sqft">{result.sqftRange[0]}–{result.sqftRange[1]} sq ft</span>
          </div>
          {result.notes && <p className="vision-result-notes">{result.notes}</p>}

          <div className="vision-quote-table">
            {Object.values(result.quotes).map((q) => (
              <div key={q.label} className="vision-quote-row">
                <span className="vision-quote-type">{q.label}</span>
                <span className="vision-quote-range">{fmt(q.low)} – {fmt(q.high)}</span>
              </div>
            ))}
          </div>

          <p className="vision-result-disclaimer">Estimates based on typical sq footage and current material pricing. Actual quote may vary.</p>
        </div>
      )}
    </div>
  );
}

// ── AR Preview Tab ────────────────────────────────────────────────────────────

const AR_PRESETS = [
  'Bold full wrap: deep navy with orange diagonal stripe, company logo centered on door',
  'Clean fleet wrap: white base with blue lower band and company logo',
  'Luxury color change: matte black with gloss carbon fiber accents',
  'Racing livery: aggressive red and white with sponsor placement zones',
  'Minimalist: white base with subtle grey gradient and monogram logo',
];

function ARPreviewTab() {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [preset, setPreset] = useState(AR_PRESETS[0]);
  const [custom, setCustom] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(f: File) {
    setFile(f);
    setOriginalUrl(URL.createObjectURL(f));
    setResultUrl(null);
    setError(null);
  }

  async function generate() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResultUrl(null);
    try {
      const description = custom.trim() || preset;
      const res = await api.arPreview(file, description);
      setResultUrl(res.image_url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="vision-tab-body">
      <p className="vision-ar-intro">
        Upload a photo of any vehicle → AI applies a wrap concept to that exact vehicle.
        Great for showing prospects what their fleet could look like before they commit.
      </p>

      {!file ? (
        <DropZone onFile={handleFile} accept="image/jpeg,image/png,image/webp" label="Upload a photo of the vehicle to wrap" />
      ) : (
        <div className="vision-photo-row">
          <img src={originalUrl!} alt="Original vehicle" className="vision-photo-preview" />
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setFile(null); setOriginalUrl(null); setResultUrl(null); }}>
            Change Photo
          </button>
        </div>
      )}

      {file && (
        <>
          <div className="field-group">
            <label className="field-label">Wrap Style Preset</label>
            <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {AR_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">Custom Description (overrides preset)</label>
            <textarea className="input" rows={2} value={custom} onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. Full matte black wrap with chrome delete and Shadow Graphix logo on both doors…" />
          </div>
          <button className="btn btn-primary" disabled={loading} onClick={generate}>
            {loading ? 'Generating preview…' : '✨ Generate Wrap Preview'}
          </button>
        </>
      )}

      {loading && <div className="vision-scanning"><span className="spinner" /> OpenAI is rendering your wrap concept…</div>}
      {error && <div className="error-box">{error}</div>}

      {resultUrl && originalUrl && (
        <div className="vision-ar-result">
          <div className="vision-ar-pair">
            <div className="vision-ar-side">
              <span className="vision-ar-label">Original</span>
              <img src={originalUrl} alt="Original" className="vision-ar-img" />
            </div>
            <div className="vision-ar-side">
              <span className="vision-ar-label">With Wrap</span>
              <img src={resultUrl} alt="Wrap concept" className="vision-ar-img" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <a href={resultUrl} download="wrap-concept.png" className="btn btn-primary">
              ⬇ Download
            </a>
            <button className="btn" onClick={generate}>Regenerate</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fleet Quote Tab ───────────────────────────────────────────────────────────

const VEHICLE_OPTIONS = [
  { key: 'cargo_van_standard',  label: 'Cargo Van (Transit/Sprinter)', sqft: [200, 250] },
  { key: 'cargo_van_high_roof', label: 'High-Roof Cargo Van',          sqft: [240, 290] },
  { key: 'box_truck_16',        label: '16ft Box Truck',               sqft: [310, 360] },
  { key: 'box_truck_24',        label: '24ft Box Truck',               sqft: [420, 480] },
  { key: 'semi_cab_only',       label: 'Semi Cab (no trailer)',        sqft: [200, 260] },
  { key: 'semi_full',           label: 'Semi + 53ft Trailer',          sqft: [620, 780] },
  { key: 'pickup_truck',        label: 'Full-Size Pickup',             sqft: [150, 200] },
  { key: 'suv_large',           label: 'Large SUV / Crossover',        sqft: [160, 210] },
  { key: 'sedan',               label: 'Sedan / Compact',              sqft: [100, 145] },
  { key: 'minivan',             label: 'Minivan / Passenger Van',      sqft: [175, 220] },
  { key: 'bus_school',          label: 'School / Transit Bus',         sqft: [380, 550] },
] as const;

const WRAP_TIERS = [
  { key: 'full',    label: 'Full Wrap',    coverage: 1.0, low: 8, high: 14 },
  { key: 'partial', label: 'Partial Wrap', coverage: 0.5, low: 8, high: 14 },
  { key: 'spot',    label: 'Spot / Decal', coverage: 0.2, low: 10, high: 16 },
] as const;

interface FleetLine { vehicleKey: string; count: number }

function FleetQuoteTab() {
  const { user } = useAuth();
  const [lines, setLines] = useState<FleetLine[]>([{ vehicleKey: 'cargo_van_standard', count: 1 }]);
  const [tier, setTier] = useState<'full' | 'partial' | 'spot'>('full');
  const [copied, setCopied] = useState(false);

  function addLine() {
    setLines((l) => [...l, { vehicleKey: 'cargo_van_standard', count: 1 }]);
  }
  function removeLine(i: number) {
    setLines((l) => l.filter((_, idx) => idx !== i));
  }
  function updateLine(i: number, patch: Partial<FleetLine>) {
    setLines((l) => l.map((line, idx) => idx === i ? { ...line, ...patch } : line));
  }

  const selectedTier = WRAP_TIERS.find((t) => t.key === tier)!;
  const rows = lines.map((line) => {
    const veh = VEHICLE_OPTIONS.find((v) => v.key === line.vehicleKey) || VEHICLE_OPTIONS[0];
    const sqftLow = veh.sqft[0] * selectedTier.coverage;
    const sqftHigh = veh.sqft[1] * selectedTier.coverage;
    const unitLow = Math.round(sqftLow * selectedTier.low);
    const unitHigh = Math.round(sqftHigh * selectedTier.high);
    return {
      label: veh.label, count: line.count,
      unitLow, unitHigh,
      totalLow: unitLow * line.count,
      totalHigh: unitHigh * line.count,
    };
  });
  const grandLow = rows.reduce((s, r) => s + r.totalLow, 0);
  const grandHigh = rows.reduce((s, r) => s + r.totalHigh, 0);

  function copyQuote() {
    const txt = [
      `Fleet Quote — ${selectedTier.label}`,
      `${'─'.repeat(44)}`,
      ...rows.map((r) => `${r.count}× ${r.label.padEnd(28)} ${fmt(r.totalLow)}–${fmt(r.totalHigh)}`),
      `${'─'.repeat(44)}`,
      `TOTAL: ${fmt(grandLow)}–${fmt(grandHigh)}`,
      '',
      'Includes design. Based on standard material pricing.',
      `Contact ${user?.companyName || 'us'} for exact quote.`,
    ].join('\n');
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Wrap tier selector */}
      <div style={{ display: 'flex', gap: 6 }}>
        {WRAP_TIERS.map((t) => (
          <button key={t.key} className={`btn${tier === t.key ? ' btn-primary' : ''}`}
            style={{ fontSize: 12, flex: 1 }} onClick={() => setTier(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Vehicle lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 28px', gap: 6, alignItems: 'center' }}>
            <select className="select" style={{ fontSize: 12 }} value={line.vehicleKey}
              onChange={(e) => updateLine(i, { vehicleKey: e.target.value })}>
              {VEHICLE_OPTIONS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
            <input className="input" type="number" min={1} max={999} value={line.count} style={{ fontSize: 12, textAlign: 'center' }}
              onChange={(e) => updateLine(i, { count: Math.max(1, parseInt(e.target.value) || 1) })} />
            <button className="btn" style={{ fontSize: 11, padding: '4px 6px', color: 'var(--red)' }}
              onClick={() => lines.length > 1 && removeLine(i)}>✕</button>
          </div>
        ))}
        <button className="btn" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={addLine}>+ Add Vehicle Type</button>
      </div>

      {/* Quote table */}
      <div className="fleet-quote-table">
        <div className="fleet-quote-header">
          <span>Vehicle</span><span>Qty</span><span>Range</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="fleet-quote-row">
            <span style={{ fontSize: 11 }}>{r.label}</span>
            <span style={{ fontSize: 11, textAlign: 'center' }}>{r.count}</span>
            <span style={{ fontSize: 11, textAlign: 'right' }}>{fmt(r.totalLow)}–{fmt(r.totalHigh)}</span>
          </div>
        ))}
        <div className="fleet-quote-total">
          <span>Fleet Total</span><span /><span>{fmt(grandLow)}–{fmt(grandHigh)}</span>
        </div>
      </div>

      <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={copyQuote}>
        {copied ? '✓ Copied to clipboard!' : '📋 Copy Quote Summary'}
      </button>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
        Estimates based on industry-standard sq footage × material pricing. Final quote may vary.
      </p>
    </div>
  );
}

// ── Modal Shell ───────────────────────────────────────────────────────────────

export default function VisionQuoteModal({ onClose }: Props) {
  const [tab, setTab] = useState<'quote' | 'ar' | 'fleet'>('quote');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box vision-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', gap: 0 }}>
            <button className={`vision-modal-tab ${tab === 'quote' ? 'active' : ''}`} onClick={() => setTab('quote')}>
              📷 Vision Quote
            </button>
            <button className={`vision-modal-tab ${tab === 'fleet' ? 'active' : ''}`} onClick={() => setTab('fleet')}>
              🚛 Fleet Quote
            </button>
            <button className={`vision-modal-tab ${tab === 'ar' ? 'active' : ''}`} onClick={() => setTab('ar')}>
              ✨ AR Preview
            </button>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {tab === 'quote' ? <QuoteTab /> : tab === 'fleet' ? <FleetQuoteTab /> : <ARPreviewTab />}
      </div>
    </div>
  );
}
