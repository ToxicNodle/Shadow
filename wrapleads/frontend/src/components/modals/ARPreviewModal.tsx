import { useRef, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const WRAP_PRESETS = [
  { value: 'full color-change wrap, matte black finish, clean modern look', label: 'Matte Black' },
  { value: 'full color-change wrap, gloss white with blue accent stripe, corporate fleet style', label: 'Fleet White/Blue' },
  { value: 'full color-change wrap, bold orange and black, aggressive commercial brand', label: 'Bold Orange' },
  { value: 'full color-change wrap, matte army green, tactical offroad look', label: 'Tactical Green' },
  { value: 'full color-change wrap, chrome silver, luxury premium finish', label: 'Chrome Silver' },
  { value: 'partial wrap, company logo and contact info on doors and rear, white base vehicle', label: 'Logo/Contact' },
  { value: 'full color-change wrap, deep navy blue, matte finish, minimal logo placement', label: 'Navy Matte' },
  { value: 'full color-change wrap, gloss candy apple red, race-inspired livery', label: 'Race Red' },
];

interface Props {
  onClose: () => void;
  presetDescription?: string;
}

// ── Before / After comparison slider ─────────────────────────────────────────
function ComparisonSlider({ original, result }: { original: string; result: string }) {
  const [pos, setPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function updatePos(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(Math.max(3, Math.min(97, ((clientX - rect.left) / rect.width) * 100)));
  }

  const onMouseDown = useCallback((e: React.MouseEvent) => { dragging.current = true; updatePos(e.clientX); }, []);
  const onMouseMove = useCallback((e: React.MouseEvent) => { if (dragging.current) updatePos(e.clientX); }, []);
  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => { dragging.current = true; updatePos(e.touches[0].clientX); }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => { if (dragging.current) updatePos(e.touches[0].clientX); }, []);
  const onTouchEnd = useCallback(() => { dragging.current = false; }, []);

  return (
    <div
      ref={containerRef}
      className="ar-slider-root"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* AI result — full width behind */}
      <img src={result} className="ar-slider-img" alt="AI wrap" draggable={false} />

      {/* Original — clipped to left of slider */}
      <div className="ar-slider-original" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={original} className="ar-slider-img" alt="original" draggable={false} />
      </div>

      {/* Divider */}
      <div className="ar-slider-divider" style={{ left: `${pos}%` }}>
        <div className="ar-slider-handle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" /><polyline points="9 18 3 12 9 6" style={{ transform: 'scaleX(-1)', transformOrigin: '6px 12px' }} />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="ar-slider-label ar-slider-label-left">ORIGINAL</div>
      <div className="ar-slider-label ar-slider-label-right">AI WRAP</div>
    </div>
  );
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
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dropDragging, setDropDragging] = useState(false);

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
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function download(url: string, name: string) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
  }

  function copyImageUrl() {
    if (!result) return;
    navigator.clipboard.writeText(result.image_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetPhoto() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box ar-modal-box"
        style={{ maxWidth: result ? 820 : 620, transition: 'max-width 0.3s ease' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 22, height: 22, display: 'flex', color: 'var(--accent)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </span>
            <div>
              <h2 className="modal-title" style={{ margin: 0 }}>AR Wrap Preview</h2>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                {result ? 'Drag the slider to compare before & after' : 'Upload any vehicle photo → see your wrap applied instantly'}
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!hasOpenAI && (
            <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f59e0b' }}>
              Add your OpenAI API key in <strong>Settings → Design Studio</strong> to enable AI wrap generation.
            </div>
          )}

          {/* Comparison slider — full width when result is ready */}
          {result && preview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ComparisonSlider original={preview} result={result.image_url} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary" style={{ fontSize: 11, flex: 1 }} onClick={() => download(result.image_url, 'wrap-concept.png')}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download
                </button>
                <button className="btn" style={{ fontSize: 11, flex: 1 }} onClick={copyImageUrl}>
                  {copied ? '✓ Copied!' : '🔗 Copy Link'}
                </button>
                <button className="btn" style={{ fontSize: 11 }} onClick={() => setResult(null)}>
                  Try Another Style
                </button>
                <button className="btn" style={{ fontSize: 11, color: 'var(--text-faint)' }} onClick={resetPhoto}>
                  New Photo
                </button>
              </div>
            </div>
          ) : (
            /* Upload zone */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                className={`ar-dropzone${dropDragging ? ' dragging' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDropDragging(true); }}
                onDragLeave={() => setDropDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDropDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              >
                {preview ? (
                  <img src={preview} alt="vehicle" className="ar-dropzone-img" />
                ) : (
                  <div className="ar-dropzone-empty">
                    <span style={{ width: 36, height: 36, display: 'flex', color: 'var(--text-faint)', margin: '0 auto 8px' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Drop vehicle photo here</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>or click to browse — JPEG/PNG, max 10 MB</span>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
              {preview && (
                <button className="btn" style={{ fontSize: 11, alignSelf: 'flex-start' }} onClick={resetPhoto}>
                  ✕ Remove photo
                </button>
              )}
            </div>
          )}

          {/* Wrap style presets */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Wrap Style Preset</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
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
              placeholder="Describe the wrap — colors, style, layout, branding elements…"
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
              'Generate New Concept'
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Apply Wrap to Vehicle
              </>
            )}
          </button>

          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
            Powered by OpenAI DALL-E · Concept only — not an exact measurement or final proof
          </p>
        </div>
      </div>
    </div>
  );
}
