import { useState } from 'react';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';
import type { Lead } from '../../../api/types';

interface Script {
  hook: string;
  valueStatement: string;
  proofPoint: string;
  callToAction: string;
  totalTimeEstimate: number;
  talkingPoints: string[];
}

interface Props {
  lead: Lead;
}

export default function VideoPitchPanel({ lead }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const [script, setScript] = useState<Script | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!lead.serverId) return null;

  async function generate() {
    setLoading(true);
    try {
      const r = await api.generateVideoPitchScript(lead.serverId!);
      setScript(r.script);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to generate script', 'error');
    } finally {
      setLoading(false);
    }
  }

  function fullScript() {
    if (!script) return '';
    return [
      script.hook,
      '',
      script.valueStatement,
      '',
      script.proofPoint,
      '',
      script.callToAction,
    ].join('\n');
  }

  async function copyScript() {
    await navigator.clipboard.writeText(fullScript());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const SECTION_LABEL: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '.1em', color: 'var(--text-faint)', marginBottom: 4, display: 'block',
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)' }}>
          🎬 Video Pitch Script
        </div>
        <button
          className="btn"
          style={{ fontSize: 11, padding: '3px 10px', color: '#4d8af5', borderColor: 'rgba(77,138,245,0.4)' }}
          onClick={generate}
          disabled={loading}
        >
          {loading ? <span className="spinner" style={{ width: 10, height: 10 }} /> : script ? 'Regenerate' : 'Generate Script'}
        </button>
      </div>

      {!script && !loading && (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
          Generate a 90-second personalized script for a video message (Loom, BombBomb, iPhone). Video outreach gets 3–5× more replies than email.
        </div>
      )}

      {script && (
        <div style={{ border: '1px solid rgba(77,138,245,0.25)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elev)' }}>
          {/* Talking points strip */}
          <div style={{ background: 'rgba(77,138,245,0.08)', padding: '8px 12px', borderBottom: '1px solid rgba(77,138,245,0.15)' }}>
            <span style={SECTION_LABEL}>Talking Points — keep visible while recording</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {script.talkingPoints.map((p, i) => (
                <span key={i} style={{
                  fontSize: 11, background: 'rgba(77,138,245,0.15)', color: '#4d8af5',
                  padding: '2px 8px', borderRadius: 6, fontWeight: 600,
                }}>
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* Script sections */}
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Hook (0–15s)', text: script.hook, color: '#f59e0b' },
              { label: 'Value Statement (15–45s)', text: script.valueStatement, color: '#4d8af5' },
              { label: 'Proof Point (45–70s)', text: script.proofPoint, color: '#22c55e' },
              { label: 'Call to Action (70–90s)', text: script.callToAction, color: '#f4551c' },
            ].map(({ label, text, color }) => (
              <div key={label}>
                <span style={{ ...SECTION_LABEL, color }}>{label}</span>
                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{text}</div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                ~{script.totalTimeEstimate}s estimated · aim for one take, natural delivery
              </span>
              <button
                className="btn"
                style={{ fontSize: 11, color: copied ? '#22c55e' : '#4d8af5', borderColor: copied ? '#22c55e50' : 'rgba(77,138,245,0.4)' }}
                onClick={copyScript}
              >
                {copied ? '✓ Copied' : 'Copy Full Script'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
