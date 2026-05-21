import { useRef, useState, useCallback, useEffect } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { Lead, InstalledJob } from '../../api/types';

const WRAP_PRESETS = [
  { value: 'full color-change wrap, matte black finish, clean modern look', label: 'Matte Black', cats: ['dinoc','colorchange','design'] },
  { value: 'full color-change wrap, gloss white with blue accent stripe, corporate fleet style', label: 'Fleet White/Blue', cats: ['fleet','construction'] },
  { value: 'full color-change wrap, bold orange and black, aggressive commercial brand', label: 'Bold Orange', cats: ['construction','gc_referral','fleet'] },
  { value: 'full color-change wrap, matte army green, tactical offroad look', label: 'Tactical Green', cats: [] },
  { value: 'full color-change wrap, chrome silver, luxury premium finish', label: 'Chrome Silver', cats: ['colorchange','dinoc','racing'] },
  { value: 'partial wrap, company logo and contact info on doors and rear, white base vehicle', label: 'Logo/Contact', cats: ['fleet','gc_referral','construction'] },
  { value: 'full color-change wrap, deep navy blue, matte finish, minimal logo placement', label: 'Navy Matte', cats: ['dinoc','design'] },
  { value: 'full color-change wrap, gloss candy apple red, race-inspired livery', label: 'Race Red', cats: ['racing','colorchange'] },
];

function sortedPresets(category?: string) {
  if (!category) return WRAP_PRESETS;
  const priority = WRAP_PRESETS.filter((p) => p.cats.includes(category));
  const rest = WRAP_PRESETS.filter((p) => !p.cats.includes(category));
  return [...priority, ...rest];
}

interface Props {
  onClose: () => void;
  presetDescription?: string;
  lead?: Pick<Lead, 'id' | 'serverId' | 'company' | 'email' | 'contactName' | 'category'>;
}

// ── Before / After comparison slider ─────────────────────────────────────────
function ComparisonSlider({ original, result, leftLabel = 'ORIGINAL', rightLabel = 'AI WRAP' }: { original: string; result: string; leftLabel?: string; rightLabel?: string }) {
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
      <img src={result} className="ar-slider-img" alt="AI wrap" draggable={false} />
      <div className="ar-slider-original" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={original} className="ar-slider-img" alt="original" draggable={false} />
      </div>
      <div className="ar-slider-divider" style={{ left: `${pos}%` }}>
        <div className="ar-slider-handle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" /><polyline points="9 18 3 12 9 6" style={{ transform: 'scaleX(-1)', transformOrigin: '6px 12px' }} />
          </svg>
        </div>
      </div>
      <div className="ar-slider-label ar-slider-label-left">{leftLabel}</div>
      <div className="ar-slider-label ar-slider-label-right">{rightLabel}</div>
    </div>
  );
}

export default function ARPreviewModal({ onClose, presetDescription, lead }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const settings = useAppStore((s) => s.settings);
  const hasOpenAI = !!settings.openaiApiKey;

  const presets = sortedPresets(lead?.category);

  const [mode, setMode] = useState<'single' | 'batch'>('single');

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState(presetDescription ?? presets[0].value);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [activeResult, setActiveResult] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dropDragging, setDropDragging] = useState(false);

  // Brand colors, variant count, competitive framing
  const [useBrandColors, setUseBrandColors] = useState(false);
  const [brandColor1, setBrandColor1] = useState('#1e3a8a');
  const [brandColor2, setBrandColor2] = useState('#f97316');
  const [variantCount, setVariantCount] = useState<1 | 3>(1);
  const [competitive, setCompetitive] = useState(false);

  // Send to client (email)
  const [showSend, setShowSend] = useState(false);
  const [sendEmail, setSendEmail] = useState(lead?.email || '');
  const [sendName, setSendName] = useState(lead?.contactName || '');
  const [sendNote, setSendNote] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendDone, setSendDone] = useState(false);

  // Portal approval link
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Save to job gallery
  const [jobs, setJobs] = useState<InstalledJob[]>([]);
  const [saveJobLoading, setSaveJobLoading] = useState(false);
  const [savedToGallery, setSavedToGallery] = useState(false);

  // Fleet batch mode
  const [batchItems, setBatchItems] = useState<{ file: File; preview: string; result: string | null; error?: string }[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchIndex, setBatchIndex] = useState(0);
  const batchFileRef = useRef<HTMLInputElement>(null);

  const brandColorsStr = useBrandColors ? `${brandColor1}, ${brandColor2}` : undefined;
  const activeUrl: string | null = results[activeResult] ?? null;

  // Load installed jobs tied to this lead so we can offer "save to gallery"
  useEffect(() => {
    if (!lead?.serverId) return;
    let cancelled = false;
    api.getJobs()
      .then((r) => { if (!cancelled) setJobs(r.jobs.filter((j) => j.lead_id === lead.serverId)); })
      .catch(() => { /* gallery save is optional */ });
    return () => { cancelled = true; };
  }, [lead?.serverId]);

  function handleFile(f: File) {
    if (!f.type.startsWith('image/')) { showToast('Please upload an image file', 'error'); return; }
    setFile(f);
    setResults([]);
    setError(null);
    setPortalUrl(null);
    setSavedToGallery(false);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  function pickPreset(idx: number) {
    setSelectedPreset(idx);
    setDescription(presets[idx].value);
  }

  async function generate() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setPortalUrl(null);
    setSavedToGallery(false);
    try {
      const res = await api.arPreview(file, description, { brandColors: brandColorsStr, variants: variantCount, competitive });
      const urls = (res.image_urls && res.image_urls.length ? res.image_urls : [res.image_url]).filter(Boolean) as string[];
      setResults(urls);
      setActiveResult(0);
      setShowSend(false);
      setSendDone(false);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function sendConcept() {
    if (!activeUrl || !sendEmail) return;
    setSendLoading(true);
    try {
      await api.wrapConceptShare({
        leadId: lead?.serverId ?? lead?.id,
        imageUrl: activeUrl,
        recipientEmail: sendEmail,
        recipientName: sendName || undefined,
        note: sendNote || undefined,
      });
      setSendDone(true);
      showToast(`Concept sent to ${sendEmail}`);
    } catch (e: unknown) {
      showToast((e as Error).message || 'Send failed', 'error');
    } finally {
      setSendLoading(false);
    }
  }

  async function createPortalLink() {
    if (!activeUrl) return;
    if (!lead?.serverId) { showToast('Save this lead before creating a portal link', 'error'); return; }
    setPortalLoading(true);
    try {
      const r = await api.arConceptToPortal(lead.serverId, activeUrl, sendNote || undefined);
      setPortalUrl(r.portalUrl);
      navigator.clipboard.writeText(r.portalUrl);
      showToast('Approval link copied — your client can view & approve');
    } catch (e: unknown) {
      showToast((e as Error).message || 'Could not create link', 'error');
    } finally {
      setPortalLoading(false);
    }
  }

  async function saveToGallery() {
    if (!activeUrl || !jobs.length) return;
    setSaveJobLoading(true);
    try {
      await api.saveConceptToJob(jobs[0].id, activeUrl, `AR wrap concept — ${description.slice(0, 80)}`);
      setSavedToGallery(true);
      showToast(`Saved to ${jobs[0].company}'s job gallery`);
    } catch (e: unknown) {
      showToast((e as Error).message || 'Save failed', 'error');
    } finally {
      setSaveJobLoading(false);
    }
  }

  function download(url: string, name: string) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
  }

  function copyImageUrl() {
    if (!activeUrl) return;
    navigator.clipboard.writeText(activeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetPhoto() {
    setFile(null);
    setPreview(null);
    setResults([]);
    setError(null);
    setShowSend(false);
    setSendDone(false);
    setPortalUrl(null);
    setSavedToGallery(false);
  }

  // ── Batch mode helpers ──────────────────────────────────────────────────────
  function addBatchFiles(files: FileList | File[]) {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 12);
    if (!imgs.length) { showToast('Please add image files', 'error'); return; }
    imgs.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        setBatchItems((prev) => prev.length >= 12 ? prev : [...prev, { file: f, preview: url, result: null }]);
      };
      reader.readAsDataURL(f);
    });
  }

  async function generateBatch() {
    if (!batchItems.length || batchRunning) return;
    setBatchRunning(true);
    for (let i = 0; i < batchItems.length; i++) {
      if (batchItems[i].result) continue;
      setBatchIndex(i);
      try {
        const res = await api.arPreview(batchItems[i].file, description, { brandColors: brandColorsStr, competitive });
        setBatchItems((prev) => prev.map((it, idx) => idx === i ? { ...it, result: res.image_url, error: undefined } : it));
      } catch (e: unknown) {
        setBatchItems((prev) => prev.map((it, idx) => idx === i ? { ...it, error: (e as Error).message } : it));
      }
    }
    setBatchRunning(false);
  }

  const batchDone = batchItems.filter((b) => b.result).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box ar-modal-box"
        style={{ maxWidth: (results.length || mode === 'batch') ? 860 : 620, transition: 'max-width 0.3s ease' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 22, height: 22, display: 'flex', color: 'var(--accent)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </span>
            <div>
              <h2 className="modal-title" style={{ margin: 0 }}>AR Wrap Preview</h2>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                {lead ? `Wrap concept for ${lead.company}` : mode === 'batch' ? 'Preview your whole fleet in one pass' : results.length ? 'Drag the slider to compare before & after' : 'Upload any vehicle photo → see your wrap applied instantly'}
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Mode tabs */}
        <div className="ar-mode-tabs">
          <button className={`ar-mode-tab${mode === 'single' ? ' active' : ''}`} onClick={() => setMode('single')}>Single Vehicle</button>
          <button className={`ar-mode-tab${mode === 'batch' ? ' active' : ''}`} onClick={() => setMode('batch')}>Fleet Batch</button>
        </div>

        <div style={{ padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!hasOpenAI && (
            <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f59e0b' }}>
              Add your OpenAI API key in <strong>Settings → Design Studio</strong> to enable AI wrap generation.
            </div>
          )}

          {mode === 'single' ? (
            <>
              {/* Comparison slider — full width when result is ready */}
              {results.length && preview && activeUrl ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <ComparisonSlider
                    original={preview}
                    result={activeUrl}
                    leftLabel={competitive ? 'UNBRANDED TODAY' : 'ORIGINAL'}
                    rightLabel={competitive ? 'WITH YOUR BRAND' : 'AI WRAP'}
                  />

                  {competitive && (
                    <div className="ar-pitch-stat">
                      A wrapped vehicle generates <strong>30,000–70,000</strong> daily impressions — that plain vehicle on the left earns <strong>zero</strong>.
                    </div>
                  )}

                  {/* Variant thumbnails */}
                  {results.length > 1 && (
                    <div className="ar-variant-row">
                      {results.map((u, i) => (
                        <button
                          key={i}
                          className={`ar-variant-thumb${activeResult === i ? ' active' : ''}`}
                          onClick={() => setActiveResult(i)}
                          title={`Variation ${i + 1}`}
                        >
                          <img src={u} alt={`Variation ${i + 1}`} />
                          <span className="ar-variant-badge">{i + 1}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" style={{ fontSize: 11, flex: 1, minWidth: 90 }} onClick={() => download(activeUrl, 'wrap-concept.png')}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      Download
                    </button>
                    <button className="btn" style={{ fontSize: 11, flex: 1, minWidth: 90 }} onClick={copyImageUrl}>
                      {copied ? '✓ Copied!' : '🔗 Copy Image'}
                    </button>
                    {lead && (
                      <button
                        className="btn"
                        style={{ fontSize: 11, flex: 1, minWidth: 110, color: showSend ? 'var(--text-faint)' : undefined }}
                        onClick={() => { setShowSend((v) => !v); setSendDone(false); }}
                      >
                        {showSend ? '✕ Cancel' : `✉ Email ${lead.company}`}
                      </button>
                    )}
                    {lead && (
                      <button className="btn" style={{ fontSize: 11, flex: 1, minWidth: 130 }} disabled={portalLoading} onClick={createPortalLink}>
                        {portalLoading ? 'Creating…' : portalUrl ? '✓ Link copied' : '🔗 Approval Link'}
                      </button>
                    )}
                    {jobs.length > 0 && (
                      <button className="btn" style={{ fontSize: 11, flex: 1, minWidth: 120 }} disabled={saveJobLoading || savedToGallery} onClick={saveToGallery}>
                        {savedToGallery ? '✓ In gallery' : saveJobLoading ? 'Saving…' : '🖼 Save to Gallery'}
                      </button>
                    )}
                    <button className="btn" style={{ fontSize: 11 }} onClick={() => setResults([])}>
                      Try Another Style
                    </button>
                    <button className="btn" style={{ fontSize: 11, color: 'var(--text-faint)' }} onClick={resetPhoto}>
                      New Photo
                    </button>
                  </div>

                  {portalUrl && (
                    <div className="ar-portal-link">
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Client approval link:</span>
                      <code>{portalUrl}</code>
                    </div>
                  )}

                  {/* Send to Client panel */}
                  {showSend && lead && (
                    <div className="ds-send-panel">
                      {sendDone ? (
                        <div className="success-box" style={{ fontSize: 13 }}>
                          Concept sent to {sendEmail} and logged to {lead.company}&apos;s activity.
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            Email wrap concept to client
                          </div>
                          <div className="field-row" style={{ marginBottom: 8 }}>
                            <div className="field-group">
                              <label className="field-label" style={{ fontSize: 11 }}>Client email</label>
                              <input className="input" style={{ fontSize: 12 }} type="email" placeholder="client@company.com"
                                value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} required />
                            </div>
                            <div className="field-group">
                              <label className="field-label" style={{ fontSize: 11 }}>Contact name</label>
                              <input className="input" style={{ fontSize: 12 }} placeholder="Alex Smith"
                                value={sendName} onChange={(e) => setSendName(e.target.value)} />
                            </div>
                          </div>
                          <div className="field-group" style={{ marginBottom: 8 }}>
                            <label className="field-label" style={{ fontSize: 11 }}>Personal note (optional)</label>
                            <textarea className="input" rows={2} style={{ fontSize: 12, resize: 'vertical' }}
                              placeholder="Here's a quick concept based on what we discussed…"
                              value={sendNote} onChange={(e) => setSendNote(e.target.value)} />
                          </div>
                          <button className="btn btn-primary" style={{ fontSize: 12 }}
                            disabled={!sendEmail || sendLoading} onClick={sendConcept}>
                            {sendLoading ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Sending…</> : 'Send Concept →'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
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
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  </div>
                  {preview && (
                    <button className="btn" style={{ fontSize: 11, alignSelf: 'flex-start' }} onClick={resetPhoto}>
                      ✕ Remove photo
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            /* ── Fleet batch mode ──────────────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                className={`ar-dropzone${dropDragging ? ' dragging' : ''}`}
                style={{ minHeight: 90 }}
                onClick={() => batchFileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDropDragging(true); }}
                onDragLeave={() => setDropDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDropDragging(false); if (e.dataTransfer.files.length) addBatchFiles(e.dataTransfer.files); }}
              >
                <div className="ar-dropzone-empty">
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Drop multiple vehicle photos</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>up to 12 — one shared style applied to the whole fleet</span>
                </div>
                <input ref={batchFileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files?.length) addBatchFiles(e.target.files); e.target.value = ''; }} />
              </div>

              {batchItems.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>{batchItems.length} vehicle{batchItems.length === 1 ? '' : 's'} · {batchDone} previewed</span>
                    <button className="btn" style={{ fontSize: 11 }} disabled={batchRunning} onClick={() => setBatchItems([])}>Clear all</button>
                  </div>
                  <div className="ar-batch-grid">
                    {batchItems.map((it, i) => (
                      <div key={i} className="ar-batch-card">
                        <img src={it.result || it.preview} alt={`vehicle ${i + 1}`} className="ar-batch-img" />
                        {batchRunning && batchIndex === i && !it.result && (
                          <div className="ar-batch-overlay"><span className="spinner" style={{ width: 18, height: 18 }} /></div>
                        )}
                        {it.result && <span className="ar-batch-tick">✓</span>}
                        {it.error && <span className="ar-batch-err" title={it.error}>!</span>}
                        {it.result && (
                          <button className="ar-batch-dl" title="Download" onClick={() => download(it.result as string, `fleet-wrap-${i + 1}.png`)}>↓</button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Wrap style presets — category-sorted when lead is provided */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Wrap Style</div>
              {lead?.category && (
                <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, background: 'rgba(99,102,241,0.12)', borderRadius: 4, padding: '1px 6px' }}>
                  Sorted for {lead.category}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {presets.map((p, i) => (
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

          {/* Brand colors */}
          <div>
            <label className="ar-toggle-row">
              <input type="checkbox" checked={useBrandColors} onChange={(e) => setUseBrandColors(e.target.checked)} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Match brand colors</span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>incorporate the client's exact palette</span>
            </label>
            {useBrandColors && (
              <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'center' }}>
                <label className="ar-color-pick">
                  <input type="color" value={brandColor1} onChange={(e) => setBrandColor1(e.target.value)} />
                  <span>{brandColor1}</span>
                </label>
                <label className="ar-color-pick">
                  <input type="color" value={brandColor2} onChange={(e) => setBrandColor2(e.target.value)} />
                  <span>{brandColor2}</span>
                </label>
              </div>
            )}
          </div>

          {/* Variant count (single mode only) + competitive pitch */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
            {mode === 'single' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Generate</span>
                <div className="ar-seg">
                  <button className={variantCount === 1 ? 'active' : ''} onClick={() => setVariantCount(1)}>1 concept</button>
                  <button className={variantCount === 3 ? 'active' : ''} onClick={() => setVariantCount(3)}>3 variations</button>
                </div>
              </div>
            )}
            <label className="ar-toggle-row">
              <input type="checkbox" checked={competitive} onChange={(e) => setCompetitive(e.target.checked)} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Competitive pitch</span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>bold framing + impressions stat</span>
            </label>
          </div>

          {error && (
            <div style={{ color: 'var(--red)', fontSize: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          {mode === 'single' ? (
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 14 }}
              disabled={!file || loading || !hasOpenAI}
              onClick={generate}
            >
              {loading ? (
                <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />{variantCount > 1 ? 'Generating variations…' : 'Applying wrap to your vehicle…'}</>
              ) : results.length ? (
                'Generate New Concept'
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  {variantCount > 1 ? 'Generate 3 Variations' : 'Apply Wrap to Vehicle'}
                </>
              )}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 14 }}
              disabled={!batchItems.length || batchRunning || !hasOpenAI}
              onClick={generateBatch}
            >
              {batchRunning ? (
                <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Wrapping vehicle {batchIndex + 1} of {batchItems.length}…</>
              ) : (
                `Wrap All ${batchItems.length || ''} Vehicles`
              )}
            </button>
          )}

          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
            Powered by OpenAI · Concept only — not an exact measurement or final proof
          </p>
        </div>
      </div>
    </div>
  );
}
