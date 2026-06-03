import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { Lead, LeadCategory } from '../../api/types';
import { DEFAULT_SETTINGS } from '../../api/types';
import BeforeAfterSlider from '../ui/BeforeAfterSlider';
import WrapRoiPanel from '../ui/WrapRoiPanel';
import QrLeaveBehind from '../ui/QrLeaveBehind';
import { roiHtml, type RoiResult } from '../../utils/wrapRoi';

type Step = 'company' | 'brand' | 'capture' | 'result';

interface Brand {
  name: string;
  domain: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  tagline: string;
}

interface Variant {
  style: string;
  label: string;
  image_url: string;
}

const STYLE_OPTIONS: { value: string; label: string; sub: string }[] = [
  { value: 'full_wrap',   label: 'Full Wrap',     sub: 'Color-change, entire body' },
  { value: 'partial',     label: 'Partial Wrap',  sub: 'Doors, hood, rear panels' },
  { value: 'logo_focus',  label: 'Logo + Contact', sub: 'White base, branded' },
  { value: 'matte_brand', label: 'Matte Premium', sub: 'Brand color, matte finish' },
  { value: 'stripes',     label: 'Stripes',       sub: 'Front-to-back accent' },
];

const DEFAULT_STYLES = ['full_wrap', 'matte_brand', 'logo_focus'];

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
  const [selectedStyles, setSelectedStyles] = useState<string[]>(DEFAULT_STYLES);

  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [pickedVariant, setPickedVariant] = useState<Variant | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);

  // Save-to-lead picker
  const [leadSearch, setLeadSearch] = useState<string | null>(null);
  const [existingLeads, setExistingLeads] = useState<Lead[]>([]);
  const [chosenLeadId, setChosenLeadId] = useState<number | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [proposing, setProposing] = useState(false);

  // Latest ROI snapshot from the panel — included when sending a proposal.
  const [roi, setRoi] = useState<RoiResult | null>(null);
  const priceLow = parseFloat(settings.pricePerSqftLow || DEFAULT_SETTINGS.pricePerSqftLow);
  const priceHigh = parseFloat(settings.pricePerSqftHigh || DEFAULT_SETTINGS.pricePerSqftHigh);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Load leads once, filter client-side. Trigger when we hit the result step.
  useEffect(() => {
    if (step !== 'result' || existingLeads.length) return;
    api.getLeads().then(({ leads }) => setExistingLeads(leads)).catch(() => {});
  }, [step, existingLeads.length]);

  // Closest existing lead match by company name — derived, not stored.
  const bestMatch = useMemo<Lead | null>(() => {
    if (!brand) return null;
    const target = brand.name.toLowerCase().trim();
    return existingLeads.find((l) => l.company.toLowerCase().trim() === target)
      ?? existingLeads.find((l) => l.company.toLowerCase().includes(target))
      ?? null;
  }, [brand, existingLeads]);

  // Effective selection used by save/proposal: explicit choice → best match → new.
  const effectiveLeadId: number | 'new' = chosenLeadId ?? bestMatch?.serverId ?? 'new';
  const searchValue = leadSearch ?? bestMatch?.company ?? brand?.name ?? '';

  const leadOptions = useMemo(() => {
    const q = searchValue.toLowerCase().trim();
    if (!q) return existingLeads.slice(0, 6);
    return existingLeads
      .filter((l) => l.company.toLowerCase().includes(q))
      .slice(0, 6);
  }, [searchValue, existingLeads]);

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
  }

  function toggleStyle(v: string) {
    setSelectedStyles((cur) => {
      if (cur.includes(v)) return cur.length === 1 ? cur : cur.filter((x) => x !== v);
      return cur.length >= 4 ? cur : [...cur, v];
    });
  }

  async function generate() {
    if (!photo || !brand) return;
    setGenerating(true);
    setGenErr(null);
    setVariants([]);
    setPickedVariant(null);
    try {
      const r = await api.pitchPreview(photo, {
        companyName: brand.name,
        primary_color: brand.primary_color,
        secondary_color: brand.secondary_color,
        tagline: brand.tagline,
        styles: selectedStyles,
      });
      setVariants(r.variants);
      setOriginalUrl(r.original_url);
      setPickedVariant(r.variants[0] ?? null);
      setStep('result');
    } catch (e) {
      setGenErr((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function shareResult() {
    if (!pickedVariant) return;
    try {
      const blob = await fetch(pickedVariant.image_url).then((r) => r.blob());
      const file = new File([blob], `${brand?.name || 'wrap'}-${pickedVariant.style}.png`, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${brand?.name} wrap concept`, text: `What a wrap could look like on this vehicle.` });
      } else {
        const a = document.createElement('a');
        a.href = pickedVariant.image_url;
        a.download = file.name;
        a.click();
      }
    } catch {
      // user cancelled or share failed
    }
  }

  async function saveToLead() {
    if (!brand || !pickedVariant) return;
    setSaving(true);
    try {
      let leadServerId: number | undefined;
      const targetIsNew = effectiveLeadId === 'new';
      if (targetIsNew) {
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
        leadServerId = created?.id;
      } else {
        leadServerId = effectiveLeadId;
      }

      if (leadServerId) {
        await api.logActivity(leadServerId, {
          type: 'note_added',
          subject: `AR pitch demo: ${pickedVariant.label}`,
          body: `Live wrap mockup generated in ${brand.primary_color} / ${brand.secondary_color}. Style: ${pickedVariant.label}.`,
          metadata: { mockup_url: pickedVariant.image_url, brand_domain: brand.domain, style: pickedVariant.style },
        });
      }
      showToast(targetIsNew ? `Saved ${brand.name} as a new lead` : `Logged mockup on ${brand.name}`, 'success');
      onClose();
    } catch (e) {
      showToast(`Save failed: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function sendAsProposal() {
    if (!brand || !pickedVariant) return;
    setProposing(true);
    try {
      let leadServerId: number | undefined;
      if (effectiveLeadId === 'new') {
        const clientId = `pitch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const created = await api.createLead({
          clientId,
          company: brand.name,
          category: 'fleet' as LeadCategory,
          website: brand.domain ? `https://${brand.domain}` : '',
          status: 'proposal',
          notes: `Auto-created from in-person AR pitch.`,
        });
        leadServerId = created?.id;
      } else {
        leadServerId = effectiveLeadId;
      }
      if (!leadServerId) throw new Error('No lead');

      const { proposal } = await api.createProposal(
        leadServerId,
        `Generated from in-person AR pitch using ${brand.primary_color} brand color.`,
        pickedVariant.image_url,
        roi ? roiHtml(roi, brand.primary_color) : undefined,
      );
      const url = api.getProposalUrl(proposal.token);
      await navigator.clipboard.writeText(url).catch(() => {});
      showToast('Proposal created — link copied to clipboard', 'success');
      window.open(url, '_blank');
      onClose();
    } catch (e) {
      showToast(`Proposal failed: ${(e as Error).message}`, 'error');
    } finally {
      setProposing(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 560, width: '100%' }}
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
            <span style={{ opacity: step === 'result' ? 1 : 0.3 }}>4 · Concepts</span>
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

          {/* ── Step 3: Camera / photo + style picker ───────────────────────── */}
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
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Pick concepts to generate</span>
                  <span style={{ fontWeight: 600, opacity: 0.7 }}>{selectedStyles.length} / 4</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6 }}>
                  {STYLE_OPTIONS.map((s) => {
                    const active = selectedStyles.includes(s.value);
                    return (
                      <button
                        key={s.value}
                        className={`btn${active ? ' btn-primary' : ''}`}
                        style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
                        onClick={() => toggleStyle(s.value)}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{active ? '✓ ' : ''}{s.label}</span>
                        <span style={{ fontSize: 10, opacity: 0.8 }}>{s.sub}</span>
                      </button>
                    );
                  })}
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
                  disabled={!photo || generating || !hasOpenAI || !selectedStyles.length}
                  onClick={generate}
                >
                  {generating ? (
                    <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Wrapping the vehicle in {selectedStyles.length} {selectedStyles.length === 1 ? 'style' : 'styles'}…</>
                  ) : `🎨 Generate ${selectedStyles.length} ${selectedStyles.length === 1 ? 'concept' : 'concepts'}`}
                </button>
              </div>
            </>
          )}

          {/* ── Step 4: Result — variants + slider + save/proposal ──────────── */}
          {step === 'result' && pickedVariant && brand && originalUrl && (
            <>
              {/* Big preview with before/after slider */}
              <div style={{ position: 'relative' }}>
                <BeforeAfterSlider
                  before={originalUrl}
                  after={pickedVariant.image_url}
                  border={`2px solid ${brand.primary_color}`}
                />
                <div style={{
                  position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
                  background: brand.primary_color, color: '#fff', padding: '4px 10px',
                  borderRadius: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.04em',
                  whiteSpace: 'nowrap',
                }}>
                  {brand.name.toUpperCase()} · {pickedVariant.label.toUpperCase()}
                </div>
              </div>

              {/* Variant thumbnails */}
              {variants.length > 1 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {variants.length} concepts — tap to compare
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(variants.length, 4)}, 1fr)`, gap: 6 }}>
                    {variants.map((v) => {
                      const active = v.style === pickedVariant.style;
                      return (
                        <button
                          key={v.style}
                          onClick={() => setPickedVariant(v)}
                          style={{
                            padding: 0,
                            background: 'transparent',
                            border: active ? `2px solid ${brand.primary_color}` : '2px solid transparent',
                            borderRadius: 8,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            position: 'relative',
                          }}
                        >
                          <img src={v.image_url} alt={v.label} style={{ width: '100%', display: 'block' }} />
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            background: 'linear-gradient(transparent, rgba(0,0,0,.7))',
                            color: '#fff', fontSize: 10, fontWeight: 700,
                            padding: '12px 6px 4px', textAlign: 'left',
                          }}>
                            {v.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mobile billboard ROI — the money close */}
              <WrapRoiPanel
                priceLow={priceLow}
                priceHigh={priceHigh}
                brandColor={brand.primary_color}
                onRoiChange={setRoi}
              />

              {/* QR leave-behind — prospect scans, lands on a public pitch page */}
              <QrLeaveBehind brand={brand} pickedVariant={pickedVariant} roi={roi} />

              {/* Save target picker */}
              <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Save mockup to
                </div>
                <input
                  className="input"
                  placeholder="Search your leads…"
                  value={searchValue}
                  onChange={(e) => { setLeadSearch(e.target.value); setChosenLeadId(null); }}
                  style={{ width: '100%', marginBottom: 6 }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                  {leadOptions.map((l) => {
                    const active = effectiveLeadId === l.serverId;
                    return (
                      <button
                        key={l.serverId}
                        onClick={() => { setChosenLeadId(l.serverId ?? null); setLeadSearch(l.company); }}
                        style={{
                          textAlign: 'left',
                          padding: '8px 10px',
                          background: active ? brand.primary_color : 'var(--bg-card)',
                          color: active ? '#fff' : 'var(--text)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 12,
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.company}</span>
                        <span style={{ opacity: 0.6, fontSize: 10 }}>{[l.city, l.state].filter(Boolean).join(', ')}</span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => { setChosenLeadId('new'); setLeadSearch(brand.name); }}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      background: effectiveLeadId === 'new' ? brand.primary_color : 'var(--bg-card)',
                      color: effectiveLeadId === 'new' ? '#fff' : 'var(--text)',
                      border: '1px dashed var(--border)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    + Create new lead "{brand.name}"
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button className="btn" style={{ justifyContent: 'center', padding: 12 }} onClick={shareResult}>
                  📤 Share
                </button>
                <button className="btn" style={{ justifyContent: 'center', padding: 12 }} onClick={() => { setVariants([]); setPickedVariant(null); setOriginalUrl(null); setStep('capture'); }}>
                  🔄 Regenerate
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  className="btn"
                  style={{ justifyContent: 'center', padding: 14, fontSize: 13 }}
                  disabled={saving}
                  onClick={saveToLead}
                >
                  {saving ? 'Saving…' : '💾 Log to lead'}
                </button>
                <button
                  className="btn btn-primary"
                  style={{ justifyContent: 'center', padding: 14, fontSize: 13, background: brand.primary_color, borderColor: brand.primary_color }}
                  disabled={proposing}
                  onClick={sendAsProposal}
                >
                  {proposing ? 'Building…' : '📄 Send as proposal'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
