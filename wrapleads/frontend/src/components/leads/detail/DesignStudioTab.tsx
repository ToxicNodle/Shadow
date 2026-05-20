import { useState } from 'react';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';
import { VEHICLE_TYPE_LABELS } from '../../../api/types';
import type { Lead, DesignBrief } from '../../../api/types';
import ARPreviewModal from '../../modals/ARPreviewModal';

const STYLE_PRESETS = [
  { value: 'bold and modern', label: 'Bold & Modern' },
  { value: 'clean and professional', label: 'Clean & Professional' },
  { value: 'luxury and premium', label: 'Luxury & Premium' },
  { value: 'aggressive and sport', label: 'Aggressive & Sport' },
  { value: 'minimalist', label: 'Minimalist' },
];

interface Props {
  lead: Lead;
}

export default function DesignStudioTab({ lead }: Props) {
  const settings = useAppStore((s) => s.settings);
  const showToast = useAppStore((s) => s.showToast);

  const [vehicleType, setVehicleType] = useState('cargo_van_standard');
  const [primaryColor, setPrimaryColor] = useState('#1a3a6b');
  const [secondaryColor, setSecondaryColor] = useState('#ff6b35');
  const [style, setStyle] = useState(STYLE_PRESETS[0].value);
  const [description, setDescription] = useState('');

  const [step, setStep] = useState<'idle' | 'brief' | 'mockup' | 'done' | 'error'>('idle');
  const [brief, setBrief] = useState<DesignBrief | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBrief, setShowBrief] = useState(false);

  // Send to client state
  const [showSend, setShowSend] = useState(false);
  const [sendEmail, setSendEmail] = useState((lead as any).contactEmail || (lead as any).contact_email || '');
  const [sendName, setSendName] = useState((lead as any).contactName || (lead as any).contact_name || '');
  const [sendNote, setSendNote] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendDone, setSendDone] = useState(false);

  const hasOpenAI = !!settings.openaiApiKey;
  const [showArPreview, setShowArPreview] = useState(false);

  async function generate() {
    setStep('brief');
    setError(null);
    setImageUrl(null);
    setBrief(null);
    try {
      const briefRes = await api.generateDesignBrief({
        vehicleType,
        primaryColor,
        secondaryColor,
        style,
        description,
        companyName: settings.companyName || lead.company,
      });
      setBrief(briefRes.brief);

      if (!hasOpenAI) {
        setStep('done');
        showToast('Design brief generated — add OpenAI key to generate the image');
        return;
      }

      setStep('mockup');
      const mockupRes = await api.generateMockup(briefRes.brief);
      setImageUrl(mockupRes.image_url);
      setStep('done');

      if (lead.serverId) {
        await api.logActivity(lead.serverId, {
          type: 'note_added',
          subject: 'Design Concept Generated',
          body: `AI design concept created: ${briefRes.brief.style}. Layout: ${briefRes.brief.layout}`,
          metadata: { image_url: mockupRes.image_url, brief: briefRes.brief },
        }).catch(() => {});
      }
    } catch (e: any) {
      setError(e.message);
      setStep('error');
    }
  }

  async function sendConcept() {
    if (!imageUrl || !sendEmail) return;
    setSendLoading(true);
    try {
      await api.wrapConceptShare({
        leadId: lead.serverId,
        imageUrl,
        recipientEmail: sendEmail,
        recipientName: sendName || undefined,
        note: sendNote || undefined,
      });
      setSendDone(true);
      showToast(`Concept sent to ${sendEmail}`);
    } catch (e: any) {
      showToast(e.message || 'Send failed', 'error');
    } finally {
      setSendLoading(false);
    }
  }

  return (
    <div className="ds-root">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <p className="ds-intro" style={{ margin: 0 }}>
          Describe the wrap → Claude writes the design brief → DALL-E renders a photorealistic concept.
          {!hasOpenAI && <span className="ds-no-key"> Add your OpenAI key in Settings to generate images.</span>}
        </p>
        <button
          className="btn"
          style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}
          onClick={() => setShowArPreview(true)}
          title="Upload a real vehicle photo and apply a wrap to it"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          AR Preview →
        </button>
      </div>

      <div className="ds-form">
        <div className="field-group">
          <label className="field-label">Vehicle Type</label>
          <select className="input" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
            {Object.entries(VEHICLE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Primary Color</label>
            <div className="ds-color-row">
              <input type="color" className="ds-color-picker" value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)} />
              <input className="input" value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)} style={{ flex: 1 }} />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">Secondary Color</label>
            <div className="ds-color-row">
              <input type="color" className="ds-color-picker" value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)} />
              <input className="input" value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)} style={{ flex: 1 }} />
            </div>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Style</label>
          <div className="ds-style-grid">
            {STYLE_PRESETS.map((p) => (
              <button
                key={p.value}
                className={`ds-style-btn ${style === p.value ? 'active' : ''}`}
                onClick={() => setStyle(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Description (optional)</label>
          <textarea className="input" rows={2} value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Bold racing stripes, company logo on doors, matte finish, number decals on hood…" />
        </div>

        <button
          className="btn btn-primary"
          disabled={step === 'brief' || step === 'mockup'}
          onClick={generate}
          style={{ alignSelf: 'flex-start' }}
        >
          {step === 'brief' ? '✦ Writing design brief…'
            : step === 'mockup' ? '✦ Rendering concept…'
            : step === 'done' ? '↻ Regenerate'
            : 'Generate Concept'}
        </button>
      </div>

      {(step === 'brief' || step === 'mockup') && (
        <div className="ds-progress">
          <span className="spinner" />
          <div className="ds-progress-steps">
            <span className={`ds-step ${step === 'brief' ? 'active' : 'done'}`}>
              {step === 'brief' ? '● Claude writing brief…' : '✓ Design brief'}
            </span>
            {hasOpenAI && (
              <span className={`ds-step ${step === 'mockup' ? 'active' : ''}`}>
                {step === 'mockup' ? '● DALL-E rendering…' : '○ Generate image'}
              </span>
            )}
          </div>
        </div>
      )}

      {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}

      {brief && (
        <div className="ds-brief-toggle">
          <button className="btn" style={{ fontSize: 11 }} onClick={() => setShowBrief((v) => !v)}>
            {showBrief ? '▴ Hide Design Brief' : '▾ View Design Brief'}
          </button>
          {showBrief && (
            <div className="ds-brief">
              <div className="ds-brief-row"><span className="ds-brief-key">Style</span><span>{brief.style}</span></div>
              <div className="ds-brief-row"><span className="ds-brief-key">Layout</span><span>{brief.layout}</span></div>
              <div className="ds-brief-row"><span className="ds-brief-key">Typography</span><span>{brief.typography}</span></div>
              <div className="ds-brief-row">
                <span className="ds-brief-key">Colors</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="ds-swatch" style={{ background: brief.primary_color }} />
                  {brief.primary_color}
                  <span className="ds-swatch" style={{ background: brief.secondary_color }} />
                  {brief.secondary_color}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {imageUrl && (
        <div className="ds-result">
          <img src={imageUrl} alt="AI wrap concept" className="ds-result-img" />
          <div className="ds-result-actions">
            <a href={imageUrl} download="wrap-concept.png" className="btn btn-primary">⬇ Download</a>
            <button className="btn" onClick={() => { setShowSend((v) => !v); setSendDone(false); }}>
              {showSend ? '✕ Cancel' : `✉ Send to ${lead.company}`}
            </button>
            <button className="btn" onClick={generate}>↻ Regenerate</button>
          </div>

          {showSend && (
            <div className="ds-send-panel">
              {sendDone ? (
                <div className="success-box" style={{ fontSize: 13 }}>
                  Concept sent to {sendEmail} and logged to this lead&apos;s activity.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Email wrap concept to client
                  </div>
                  <div className="field-row" style={{ marginBottom: 8 }}>
                    <div className="field-group">
                      <label className="field-label" style={{ fontSize: 11 }}>Client email</label>
                      <input
                        className="input"
                        style={{ fontSize: 12 }}
                        type="email"
                        placeholder="client@company.com"
                        value={sendEmail}
                        onChange={(e) => setSendEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label" style={{ fontSize: 11 }}>Contact name</label>
                      <input
                        className="input"
                        style={{ fontSize: 12 }}
                        placeholder="Alex Smith"
                        value={sendName}
                        onChange={(e) => setSendName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="field-group" style={{ marginBottom: 8 }}>
                    <label className="field-label" style={{ fontSize: 11 }}>Personal note (optional)</label>
                    <textarea
                      className="input"
                      rows={2}
                      style={{ fontSize: 12, resize: 'vertical' }}
                      placeholder="Here's a quick concept based on what we discussed…"
                      value={sendNote}
                      onChange={(e) => setSendNote(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 12 }}
                    disabled={!sendEmail || sendLoading}
                    onClick={sendConcept}
                  >
                    {sendLoading ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Sending…</> : 'Send Concept →'}
                  </button>
                </>
              )}
            </div>
          )}

          <p className="ds-result-note">AI-generated concept. Final design will vary based on exact vehicle dimensions and branding files.</p>
        </div>
      )}

      {step === 'done' && !imageUrl && brief && !hasOpenAI && (
        <div className="success-box" style={{ marginTop: 12 }}>
          Design brief ready. Add your OpenAI key in Settings to generate the visual concept.
        </div>
      )}

      {showArPreview && (
        <ARPreviewModal
          onClose={() => setShowArPreview(false)}
          lead={{ id: lead.id, serverId: lead.serverId, company: lead.company, email: lead.email, contactName: lead.contactName, category: lead.category }}
        />
      )}
    </div>
  );
}
