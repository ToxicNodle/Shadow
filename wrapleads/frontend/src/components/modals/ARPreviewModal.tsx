import { useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const WRAP_PRESETS = [
  { value: 'full color-change wrap, matte black finish, clean modern look', label: 'Matte Black' },
  { value: 'full color-change wrap, gloss white with blue accent stripe, corporate fleet style', label: 'Fleet White/Blue' },
  { value: 'full color-change wrap, bold orange and black, aggressive commercial brand', label: 'Bold Orange' },
  { value: 'full color-change wrap, matte army green, tactical offroad look', label: 'Tactical Green' },
  { value: 'full color-change wrap, chrome silver, luxury premium finish', label: 'Chrome Silver' },
  { value: 'partial wrap, company logo and contact info on doors and rear, white base vehicle', label: 'Logo/Contact' },
];

interface Props {
  onClose: () => void;
  presetDescription?: string;
}

export default function ARPreviewModal({ onClose, presetDescription }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const settings = useAppStore((s) => s.settings);
  const hasOpenAI = !!settings.openaiApiKey;

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState(presetDescription ?? WRAP_PRESETS[0].value);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ image_url: string; original_url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(f: File) {
    if (!f.type.startsWith('image/')) { showToast('Please upload an image file', 'error'); return; }
    setFile(f);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  function pickPreset(idx: number) {
    setSelectedPreset(idx);
    setDescription(WRAP_PRESETS[idx].value);
  }

  async function generate() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.arPreview(file, description);
      setResult(res);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function download(url: string, name: string) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box ar-modal-box"
        style={{ maxWidth: 740 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 22, height: 22, display: 'flex', color: 'var(--accent)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.54 0 3-.36 4.29-1.01l-3.29-3.29C12.33 18.23 11.17 18.5 10 18.5c-3.59 0-6.5-2.91-6.5-6.5S6.41 5.5 10 5.5c1.41 0 2.72.45 3.79 1.21l3.21-3.21C15.44 2.45 13.77 2 12 2z"/></svg></span>
            <div>
              <h2 className="modal-title" style={{ margin: 0 }}>AR Wrap Preview</h2>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                Upload any vehicle photo → see your wrap applied instantly
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!hasOpenAI && (
            <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f59e0b' }}>
              Add your OpenAI API key in Settings → Design Studio to enable AI wrap generation.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: result ? '1fr 1fr' : '1fr', gap: 16 }}>
            {/* Upload panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                className={`ar-dropzone${dragging ? ' dragging' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              >
                {preview ? (
                  <img src={preview} alt="vehicle" className="ar-dropzone-img" />
                ) : (
                  <div className="ar-dropzone-empty">
                    <span style={{ width: 32, height: 32, display: 'flex', color: 'var(--text-faint)', margin: '0 auto' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Drop vehicle photo here</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>or click to browse — JPEG/PNG, max 10 MB</span>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
              {preview && (
                <button className="btn" style={{ fontSize: 11, alignSelf: 'flex-start' }} onClick={() => { setFile(null); setPreview(null); setResult(null); }}>
                  ✕ Remove photo
                </button>
              )}
            </div>

            {/* Result panel */}
            {result && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="ar-result-label">AI Wrap Concept</div>
                <img src={result.image_url} alt="wrap mockup" className="ar-result-img" />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary" style={{ fontSize: 11, flex: 1 }} onClick={() => download(result.image_url, 'wrap-mockup.png')}>
                    ⬇ Download
                  </button>
                  <button className="btn" style={{ fontSize: 11, flex: 1 }} onClick={() => { setResult(null); }}>
                    🔄 Regenerate
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Wrap style presets */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Wrap Style</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {WRAP_PRESETS.map((p, i) => (
                <button
                  key={i}
                  className={`btn${selectedPreset === i ? ' btn-primary' : ''}`}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => pickPreset(i)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom description */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Custom Description</div>
            <textarea
              className="input"
              rows={2}
              style={{ width: '100%', resize: 'vertical', fontSize: 12 }}
              placeholder="Describe the wrap in detail — colors, style, layout, branding elements…"
              value={description}
              onChange={(e) => { setDescription(e.target.value); setSelectedPreset(-1); }}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--red)', fontSize: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 14 }}
            disabled={!file || loading || !hasOpenAI}
            onClick={generate}
          >
            {loading ? (
              <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Applying wrap to your vehicle…</>
            ) : result ? (
              'Generate Another'
            ) : (
              'Apply Wrap to Vehicle'
            )}
          </button>

          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
            Powered by OpenAI gpt-image-1 · Result is an AI concept, not an exact measurement
          </p>
        </div>
      </div>
    </div>
  );
}
