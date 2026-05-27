import { useState } from 'react';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';

interface BattleCard {
  theirStrengths: string[];
  ourAdvantages: string[];
  talkTrack: string[];
  closingMove: string;
}

const COMMON_COMPETITORS = [
  'ShopVOX', 'Sign Tracker', 'Jobber', 'Wraps CRM', 'local sign shop',
  '3M certified installer', 'national fleet account',
];

interface Props {
  lead: Lead;
}

export default function CompetitiveIntelTab({ lead: _lead }: Props) {
  const [competitor, setCompetitor] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ competitor: string; lossCount: number; card: BattleCard } | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div style={{ padding: '16px 0' }}>
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
            {result.lossCount > 0 && (
              <div style={{ fontSize: 11, color: 'var(--red)', background: 'rgba(239,68,68,.12)', borderRadius: 99, padding: '2px 10px', fontWeight: 600 }}>
                {result.lossCount} recorded loss{result.lossCount > 1 ? 'es' : ''}
              </div>
            )}
            {result.lossCount === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--bg-elev-2)', borderRadius: 99, padding: '2px 10px' }}>
                No recorded losses yet
              </div>
            )}
          </div>

          <BattleSection
            color="#ef4444"
            icon="⚠"
            label="Their Strengths"
            items={result.card.theirStrengths}
            note="Know what you're up against"
          />

          <BattleSection
            color="#00d97e"
            icon="✦"
            label="Your Advantages"
            items={result.card.ourAdvantages}
            note="Lead with these on the call"
          />

          <BattleSection
            color="#4d8af5"
            icon="💬"
            label="Talk Track"
            items={result.card.talkTrack}
            note="Say these on the sales call"
          />

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
            <button
              className="btn"
              style={{ fontSize: 11 }}
              onClick={() => { setResult(null); setCompetitor(''); }}
            >
              New Competitor
            </button>
            <button className="btn" style={{ fontSize: 11 }} onClick={generate}>
              Regenerate
            </button>
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
