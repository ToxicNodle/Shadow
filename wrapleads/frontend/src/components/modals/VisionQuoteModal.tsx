import { useState, useRef } from 'react';
import { api } from '../../api/client';
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

// ── Modal Shell ───────────────────────────────────────────────────────────────

export default function VisionQuoteModal({ onClose }: Props) {
  const [tab, setTab] = useState<'quote' | 'ar'>('quote');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box vision-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', gap: 0 }}>
            <button className={`vision-modal-tab ${tab === 'quote' ? 'active' : ''}`} onClick={() => setTab('quote')}>
              📷 Vision Quote
            </button>
            <button className={`vision-modal-tab ${tab === 'ar' ? 'active' : ''}`} onClick={() => setTab('ar')}>
              ✨ AR Preview
            </button>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {tab === 'quote' ? <QuoteTab /> : <ARPreviewTab />}
      </div>
    </div>
  );
}
