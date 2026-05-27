import { useState, useRef } from 'react';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';

interface BattleCard {
  theirStrengths: string[];
  ourAdvantages: string[];
  talkTrack: string[];
  closingMove: string;
}

type PhotoAnalysis = {
  visualObservations: string[];
  competitorStrengths: string[];
  competitorWeaknesses: string[];
  counterPitch: string;
  keySellingPoints: string[];
  estimatedQuality: 'budget' | 'mid-range' | 'premium';
};

const COMMON_COMPETITORS = [
  'ShopVOX', 'Sign Tracker', 'Jobber', 'Wraps CRM', 'local sign shop',
  '3M certified installer', 'national fleet account',
];

const QUALITY_COLOR: Record<string, string> = {
  budget: '#f59e0b',
  'mid-range': '#4d8af5',
  premium: '#22c55e',
};

interface Props {
  lead: Lead;
}

export default function CompetitiveIntelTab({ lead: _lead }: Props) {
  const [mode, setMode] = useState<'name' | 'photo'>('name');
  const [competitor, setCompetitor] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ competitor: string; lossCount: number; card: BattleCard } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Photo analysis state
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoResult, setPhotoResult] = useState<PhotoAnalysis | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function generate() {
    const c = competitor.trim();
    if (!c) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.getCounterStrategy(c);
      setResult({ competitor: r.competitor, lossCount: r.lossCount, card: r.card });
    } catch (e: any) {
      setError(e.message || 'Failed to generate battle card');
    } finally {
      setLoading(false);
    }
  }

  function handlePhotoSelect(file: File) {
    setPhotoFile(file);
    setPhotoResult(null);
    setPhotoError(null);
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function analyzePhoto() {
    if (!photoFile) return;
    setPhotoLoading(true);
    setPhotoError(null);
    try {
      const r = await api.analyzeCompetitorPhoto(photoFile);
      setPhotoResult(r.analysis);
    } catch (e: any) {
      setPhotoError(e.message || 'Analysis failed');
    } finally {
      setPhotoLoading(false);
    }
  }

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['name', 'photo'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
              background: mode === m ? 'var(--accent)18' : 'transparent',
              color: mode === m ? 'var(--accent)' : 'var(--text-faint)',
            }}
          >
            {m === 'name' ? '⚔ Battle Card' : '📸 Photo Intel'}
          </button>
        ))}
      </div>

      {mode === 'name' && (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
            Enter a competitor name and Claude analyzes your past losses to generate talking points, counter-pitches, and a closing move.
          </p>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-faint)', marginBottom: 6 }}>
              Quick Select
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COMMON_COMPETITORS.map((c) => (
                <button
                  key={c}
                  className="btn"
                  style={{ fontSize: 11, padding: '3px 10px', opacity: competitor === c ? 1 : 0.7, border: competitor === c ? '1px solid var(--accent)' : undefined }}
                  onClick={() => setCompetitor(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              className="input"
              style={{ flex: 1, fontSize: 13 }}
              placeholder="Type competitor name…"
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') generate(); }}
            />
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, whiteSpace: 'nowrap' }}
              disabled={!competitor.trim() || loading}
              onClick={generate}
            >
              {loading ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Analyzing…</> : 'Generate Battle Card'}
            </button>
          </div>

          {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
                  vs. {result.competitor}
                </div>
                {result.lossCount > 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--red)', background: 'rgba(239,68,68,.12)', borderRadius: 99, padding: '2px 10px', fontWeight: 600 }}>
                    {result.lossCount} recorded loss{result.lossCount > 1 ? 'es' : ''}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--bg-elev-2)', borderRadius: 99, padding: '2px 10px' }}>
                    No recorded losses yet
                  </div>
                )}
              </div>

              <BattleSection color="#ef4444" icon="⚠" label="Their Strengths" items={result.card.theirStrengths} note="Know what you're up against" />
              <BattleSection color="#00d97e" icon="✦" label="Your Advantages" items={result.card.ourAdvantages} note="Lead with these on the call" />
              <BattleSection color="#4d8af5" icon="💬" label="Talk Track" items={result.card.talkTrack} note="Say these on the sales call" />

              <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>🎯</span>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-faint)' }}>
                    Closing Move
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, fontStyle: 'italic', borderLeft: '3px solid var(--accent)', paddingLeft: 12 }}>
                  "{result.card.closingMove}"
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ fontSize: 11 }} onClick={() => { setResult(null); setCompetitor(''); }}>
                  New Competitor
                </button>
                <button className="btn" style={{ fontSize: 11 }} onClick={generate}>Regenerate</button>
              </div>
            </div>
          )}

          {!result && !loading && (
            <div style={{ marginTop: 24, padding: 20, background: 'var(--bg-elev)', borderRadius: 10, border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⚔️</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Competitive Battle Card</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
                AI analyzes your loss history to generate targeted counter-pitches, talk tracks, and closing moves for any competitor.
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'photo' && (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
            Upload a photo of a competitor's vehicle wrap. Claude Vision will identify quality issues, missed opportunities, and generate a counter-pitch to use with prospects.
          </p>

          {/* Drop zone */}
          {!photoPreview ? (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f?.type.startsWith('image/')) handlePhotoSelect(f);
              }}
              style={{
                border: '2px dashed var(--border)', borderRadius: 12, padding: '32px 20px',
                textAlign: 'center', cursor: 'pointer', marginBottom: 16,
                background: 'var(--bg-elev)',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>📸</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                Drop competitor wrap photo here
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>or click to browse</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePhotoSelect(f);
              }} />
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 8 }}>
                <img src={photoPreview} alt="Competitor wrap" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, border: '1px solid var(--border)' }} />
                <button
                  onClick={() => { setPhotoPreview(null); setPhotoFile(null); setPhotoResult(null); }}
                  style={{
                    position: 'absolute', top: 6, right: 6, width: 22, height: 22,
                    borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none',
                    color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '22px',
                  }}
                >×</button>
              </div>
              <div>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 12 }}
                  disabled={photoLoading}
                  onClick={analyzePhoto}
                >
                  {photoLoading ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Analyzing wrap…</> : 'Analyze This Wrap'}
                </button>
              </div>
            </div>
          )}

          {photoError && <div className="error-box" style={{ marginBottom: 12 }}>{photoError}</div>}

          {photoResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Photo Analysis</div>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
                  color: QUALITY_COLOR[photoResult.estimatedQuality] ?? '#4d8af5',
                  background: (QUALITY_COLOR[photoResult.estimatedQuality] ?? '#4d8af5') + '18',
                  borderRadius: 99, padding: '2px 8px',
                }}>
                  {photoResult.estimatedQuality} quality
                </span>
              </div>

              <BattleSection
                color="#6b7280"
                icon="👁"
                label="Visual Observations"
                items={photoResult.visualObservations}
                note="What the photo reveals"
              />
              <BattleSection
                color="#ef4444"
                icon="⚠"
                label="Their Weaknesses"
                items={photoResult.competitorWeaknesses}
                note="Use these in your pitch"
              />
              <BattleSection
                color="#00d97e"
                icon="✦"
                label="Your Key Selling Points"
                items={photoResult.keySellingPoints}
                note="Lead with these when competing"
              />

              <div style={{ background: 'var(--bg-elev)', border: '1px solid #4d8af533', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#4d8af5', marginBottom: 8 }}>
                  Counter-Pitch Script
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, fontStyle: 'italic', borderLeft: '3px solid #4d8af5', paddingLeft: 12 }}>
                  "{photoResult.counterPitch}"
                </div>
              </div>

              <button className="btn" style={{ fontSize: 11, alignSelf: 'flex-start' }} onClick={() => { setPhotoResult(null); setPhotoPreview(null); setPhotoFile(null); }}>
                Analyze Another Photo
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BattleSection({ color, icon, label, items, note }: {
  color: string; icon: string; label: string; items: string[]; note: string;
}) {
  return (
    <div style={{ background: 'var(--bg-elev)', border: `1px solid ${color}33`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color }}>
            {label}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>{note}</div>
        </div>
      </div>
      <ul style={{ margin: 0, padding: '0 0 0 16px', listStyle: 'none' }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, marginBottom: 4, position: 'relative' }}>
            <span style={{ position: 'absolute', left: -14, color, fontWeight: 700 }}>›</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
