import { useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { LeadCategory } from '../../api/types';

type Step = 'company' | 'brand' | 'capture' | 'result';

interface Brand {
  name: string;
  domain: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  tagline: string;
}

const STYLE_OPTIONS: { value: string; label: string; sub: string }[] = [
  { value: 'full_wrap',   label: 'Full Wrap',     sub: 'Color-change, entire body' },
  { value: 'partial',     label: 'Partial Wrap',  sub: 'Doors, hood, rear panels' },
  { value: 'logo_focus',  label: 'Logo + Contact', sub: 'White base, branded' },
  { value: 'matte_brand', label: 'Matte Premium', sub: 'Brand color, matte finish' },
  { value: 'stripes',     label: 'Stripes',       sub: 'Front-to-back accent' },
];

interface Props {
  onClose: () => void;
}

export default function PitchModeModal({ onClose }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const settings = useAppStore((s) => s.settings);
  const hasOpenAI = !!settings.openaiApiKey;

  const [step, setStep] = useState<Step>('company');
  const [companyName, setCompanyName] = useState('');
  const [brand, setBrand] = useState<Brand | null>(null);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [style, setStyle] = useState('full_wrap');

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ image_url: string; original_url: string } | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function lookup() {
    if (!companyName.trim()) return;
    setLookingUp(true);
    setLookupErr(null);
    try {
      const { brand: b } = await api.brandLookup(companyName.trim());
      setBrand(b);
      setStep('brand');
    } catch (e) {
      setLookupErr((e as Error).message);
    } finally {
      setLookingUp(false);
    }
  }

  function handlePhoto(f: File) {
    if (!f.type.startsWith('image/')) { showToast('Please pick an image', 'error'); return; }
    setPhoto(f);
    const reader = new FileReader();
    reader.onload = (e) => setPhotoUrl(e.target?.result as string);
    reader.readAsDataURL(f);
    setStep('capture');
  }

  async function generate() {
    if (!photo || !brand) return;
    setGenerating(true);
    setGenErr(null);
    setResult(null);
    try {
      const r = await api.pitchPreview(photo, {
        companyName: brand.name,
        primary_color: brand.primary_color,
        secondary_color: brand.secondary_color,
        tagline: brand.tagline,
        style,
      });
      setResult({ image_url: r.image_url, original_url: r.original_url });
      setStep('result');
    } catch (e) {
      setGenErr((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function shareResult() {
    if (!result) return;
    try {
      const blob = await fetch(result.image_url).then((r) => r.blob());
      const file = new File([blob], `${brand?.name || 'wrap'}-mockup.png`, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${brand?.name} wrap concept`, text: `What a wrap could look like on this vehicle.` });
      } else {
        const a = document.createElement('a');
        a.href = result.image_url;
        a.download = file.name;
        a.click();
      }
    } catch {
      // user cancelled or share failed — non-fatal
    }
  }

  async function saveToLead() {
    if (!brand || !result) return;
    setSaving(true);
    try {
      const clientId = `pitch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const created = await api.createLead({
        clientId,
        company: brand.name,
        category: 'fleet' as LeadCategory,
        website: brand.domain ? `https://${brand.domain}` : '',
        pitchAngle: `In-person pitch: ${brand.tagline || 'showed live AR wrap mockup on their vehicle'}`,
        status: 'contacted',
        notes: `Showed AR wrap preview during in-person visit.\nBrand colors: ${brand.primary_color} / ${brand.secondary_color}.`,
      });
      if (created?.id) {
        await api.logActivity(created.id, {
          type: 'note_added',
          subject: 'AR pitch demo shown in person',
          body: `Live wrap mockup generated using ${brand.primary_color} primary / ${brand.secondary_color} accent.`,
          metadata: { mockup_url: result.image_url, brand_domain: brand.domain, style },
        });
      }
      showToast(`Saved ${brand.name} to leads`, 'success');
      onClose();
    } catch (e) {
      showToast(`Save failed: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 520, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>📱</span>
            <div>
              <h2 className="modal-title" style={{ margin: 0 }}>Pitch Mode</h2>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                Show a prospect what their vehicle could look like — live, in their colors.
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 4, fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            <span style={{ opacity: step === 'company' ? 1 : 0.45 }}>1 · Company</span>
            <span>→</span>
            <span style={{ opacity: step === 'brand' ? 1 : (brand ? 0.7 : 0.3) }}>2 · Brand</span>
            <span>→</span>
            <span style={{ opacity: step === 'capture' ? 1 : (photo ? 0.7 : 0.3) }}>3 · Photo</span>
            <span>→</span>
            <span style={{ opacity: step === 'result' ? 1 : 0.3 }}>4 · Mockup</span>
          </div>

          {!hasOpenAI && step !== 'company' && (
            <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f59e0b' }}>
              ⚠ Add your OpenAI API key in Settings → Design Studio to generate the mockup.
            </div>
          )}

          {/* ── Step 1: Company name ────────────────────────────────────────── */}
          {step === 'company' && (
            <>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Prospect's company name
              </label>
              <input
                className="input"
                style={{ fontSize: 16, padding: 14 }}
                placeholder="e.g. Midwest Plumbing Co"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }}
                autoFocus
              />
              {lookupErr && (
                <div style={{ color: 'var(--red)', fontSize: 12 }}>{lookupErr}</div>
              )}
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 15 }}
                disabled={!companyName.trim() || lookingUp}
                onClick={lookup}
              >
                {lookingUp ? (
                  <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Looking up brand…</>
                ) : 'Find their brand →'}
              </button>
            </>
          )}

          {/* ── Step 2: Brand confirmation ──────────────────────────────────── */}
          {step === 'brand' && brand && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--bg-elev)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border)',
                }}>
                  {brand.logo_url ? (
                    <img
                      src={brand.logo_url}
                      alt={brand.name}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <span style={{ fontWeight: 800, color: '#333', fontSize: 22 }}>{brand.name.slice(0, 1)}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{brand.name}</div>
                  {brand.domain && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{brand.domain}</div>}
                  {brand.tagline && <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 2 }}>{brand.tagline}</div>}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Brand colors (tap to adjust)</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: 'var(--bg-elev)', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }}>
                    <input
                      type="color"
                      value={brand.primary_color}
                      onChange={(e) => setBrand({ ...brand, primary_color: e.target.value.toUpperCase() })}
                      style={{ width: 36, height: 36, border: 'none', background: 'transparent', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Primary</div>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{brand.primary_color}</div>
                    </div>
                  </label>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: 'var(--bg-elev)', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }}>
                    <input
                      type="color"
                      value={brand.secondary_color}
                      onChange={(e) => setBrand({ ...brand, secondary_color: e.target.value.toUpperCase() })}
                      style={{ width: 36, height: 36, border: 'none', background: 'transparent', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Accent</div>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{brand.secondary_color}</div>
                    </div>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setStep('company')}>← Wrong company</button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 2, justifyContent: 'center', padding: 14, fontSize: 15 }}
                  onClick={() => setStep('capture')}
                >
                  Take photo of vehicle →
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: Camera / photo ──────────────────────────────────────── */}
          {step === 'capture' && brand && (
            <>
              {photoUrl ? (
                <div>
                  <img src={photoUrl} alt="vehicle" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)' }} />
                </div>
              ) : (
                <div style={{ background: 'var(--bg-elev)', border: '2px dashed var(--border)', borderRadius: 12, padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Snap the prospect's vehicle</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Side or 3/4 angle works best. Daylight, full vehicle in frame.</div>
                </div>
              )}

              {/* Hidden inputs — camera vs gallery */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }}
              />

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Wrap style</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
                  {STYLE_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      className={`btn${style === s.value ? ' btn-primary' : ''}`}
                      style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
                      onClick={() => setStyle(s.value)}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{s.label}</span>
                      <span style={{ fontSize: 10, opacity: 0.8 }}>{s.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {genErr && (
                <div style={{ color: 'var(--red)', fontSize: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>
                  {genErr}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center', padding: 14, fontSize: 14 }}
                    onClick={() => cameraRef.current?.click()}
                  >
                    📸 {photoUrl ? 'Retake photo' : 'Open camera'}
                  </button>
                  <button
                    className="btn"
                    style={{ justifyContent: 'center', padding: 14, fontSize: 14 }}
                    onClick={() => galleryRef.current?.click()}
                  >
                    🖼 Pick photo
                  </button>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: 16, fontSize: 16, background: brand.primary_color, color: '#fff', borderColor: brand.primary_color }}
                  disabled={!photo || generating || !hasOpenAI}
                  onClick={generate}
                >
                  {generating ? (
                    <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Wrapping the vehicle…</>
                  ) : `🎨 Show ${brand.name} wrapped`}
                </button>
              </div>
            </>
          )}

          {/* ── Step 4: Result ──────────────────────────────────────────────── */}
          {step === 'result' && result && brand && (
            <>
              <div style={{ position: 'relative' }}>
                <img src={result.image_url} alt={`${brand.name} wrap concept`} style={{ width: '100%', borderRadius: 10, border: `2px solid ${brand.primary_color}` }} />
                <div style={{
                  position: 'absolute', top: 8, left: 8,
                  background: brand.primary_color, color: '#fff', padding: '4px 10px',
                  borderRadius: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.04em',
                }}>
                  {brand.name.toUpperCase()} — CONCEPT
                </div>
              </div>

              <details style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                <summary style={{ cursor: 'pointer' }}>Show original photo</summary>
                <img src={result.original_url} alt="original" style={{ width: '100%', borderRadius: 8, marginTop: 6 }} />
              </details>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button className="btn" style={{ justifyContent: 'center', padding: 12 }} onClick={shareResult}>
                  📤 Share / Download
                </button>
                <button className="btn" style={{ justifyContent: 'center', padding: 12 }} onClick={() => { setResult(null); setPhoto(null); setPhotoUrl(null); setStep('capture'); }}>
                  🔄 Try another style
                </button>
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 14, background: brand.primary_color, borderColor: brand.primary_color }}
                disabled={saving}
                onClick={saveToLead}
              >
                {saving ? 'Saving…' : `💾 Save ${brand.name} to my leads`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
