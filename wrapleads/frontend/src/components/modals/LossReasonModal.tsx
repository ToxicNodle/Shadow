import { useState } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const LOSS_REASONS = [
  { value: 'price',       label: 'Too Expensive',         icon: '💰', sub: 'Price was higher than expected or competitor' },
  { value: 'competitor',  label: 'Went with Competitor',   icon: '⚔️', sub: 'They chose a different wrap shop' },
  { value: 'timing',      label: 'Bad Timing',             icon: '⏳', sub: 'Not ready right now — budget cycle, season, etc.' },
  { value: 'not_ready',   label: 'Not Ready Yet',          icon: '🔄', sub: 'Still evaluating or no decision made' },
  { value: 'no_budget',   label: 'No Budget',              icon: '🚫', sub: 'Budget cuts or project cancelled' },
  { value: 'no_response', label: 'Went Dark',              icon: '👻', sub: 'Stopped responding — unknown reason' },
  { value: 'wrong_fit',   label: 'Wrong Fit',              icon: '❌', sub: 'Our service wasn\'t right for their needs' },
  { value: 'other',       label: 'Other',                  icon: '…',  sub: 'Something else' },
];

interface Props {
  leadId: number;
  company: string;
  onClose: () => void;
  onDone: () => void;
}

export default function LossReasonModal({ leadId, company, onClose, onDone }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const [selected, setSelected] = useState<string | null>(null);
  const [competitor, setCompetitor] = useState('');
  const [competitorPrice, setCompetitorPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const showCompetitorField = selected === 'competitor';
  const showPriceField = selected === 'competitor' || selected === 'price';

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.captureWinLoss(leadId, selected, notes.trim(), competitor.trim() || undefined, competitorPrice ? parseFloat(competitorPrice) : undefined);
      showToast(`Loss reason saved — we'll help you win ${company} back`);
      onDone();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function skip() {
    onDone();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(3px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 500, width: '100%', margin: '0 16px', boxShadow: '0 24px 72px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <div style={{ background: 'rgba(239,68,68,.12)', borderRadius: 10, padding: 10, fontSize: 20 }}>📉</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 3px', color: 'var(--text)' }}>
              Why did we lose {company}?
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Takes 5 seconds · helps us win them back and sharpen our pitch
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Reason grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {LOSS_REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setSelected(r.value)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                background: selected === r.value ? 'rgba(239,68,68,.12)' : 'var(--surface)',
                border: `1px solid ${selected === r.value ? 'rgba(239,68,68,.4)' : 'var(--border)'}`,
                borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: selected === r.value ? '#f87171' : 'var(--text)', marginBottom: 1 }}>{r.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.4 }}>{r.sub}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Competitor name + price inputs */}
        {showCompetitorField && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Which competitor? (optional)
            </label>
            <input
              className="input"
              placeholder="e.g. FastWraps, SignPro, Local guy…"
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
              style={{ fontSize: 12 }}
              autoFocus
            />
          </div>
        )}
        {showPriceField && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              What price did they quote? (optional — builds competitive intel over time)
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)' }}>$</span>
              <input
                className="input"
                type="number"
                min={0}
                step={100}
                placeholder="e.g. 3500"
                value={competitorPrice}
                onChange={(e) => setCompetitorPrice(e.target.value)}
                style={{ fontSize: 12, paddingLeft: 20 }}
              />
            </div>
          </div>
        )}

        {/* Optional notes */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Notes (optional)
          </label>
          <textarea
            className="input"
            placeholder="Anything else to remember about why this fell through…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ fontSize: 12, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={!selected || saving}
            style={{ flex: 1, fontWeight: 700 }}
          >
            {saving ? 'Saving…' : 'Save & Track Loss'}
          </button>
          <button className="btn" onClick={skip} style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            Skip
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-faint)', textAlign: 'center' }}>
          If this was price or timing, we'll remind you to reach back out in 90 days
        </div>
      </div>
    </div>
  );
}
