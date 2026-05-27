import { useState } from 'react';
import type { Carrier } from '../../api/types';
import { useImportCarrier } from '../../hooks/useCarriers';
import { useAppStore } from '../../store/useAppStore';

interface Props {
  carrier: Carrier;
  checked: boolean;
}

function ScoreMeter({ score }: { score: number }) {
  const label = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cool';
  const color = score >= 70 ? 'var(--accent)' : score >= 40 ? '#f59e0b' : 'var(--text-faint)';
  return (
    <div className="carrier-score-meter" title={`Wrap-score: ${score}/100`}>
      <div className="carrier-score-bar-track">
        <div className="carrier-score-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="carrier-score-label" style={{ color }}>{label}</span>
    </div>
  );
}

function StaleTag({ years }: { years?: number }) {
  if (years == null) return null;
  const color = years <= 1 ? 'var(--green)' : years <= 3 ? '#f59e0b' : 'var(--text-faint)';
  const label = years === 0 ? 'Active' : `${years}y ago`;
  return <span className="carrier-stale" style={{ color }}>{label}</span>;
}

function AuthorityAge({ years }: { years?: number | null }) {
  if (years == null) return <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>—</span>;
  const color = years >= 10 ? '#22c55e' : years >= 5 ? '#f59e0b' : 'var(--text-faint)';
  return (
    <span title={`MC authority registered ~${years} years ago`} style={{ fontSize: 10, color }}>
      {years}yr
    </span>
  );
}

// Reverse-engineer wrap score into human-readable factors
function scoreFactors(carrier: Carrier): { label: string; pts: number; max: number }[] {
  const fleet = carrier.fleet_size ?? 0;
  const fleetPts = fleet >= 25 && fleet <= 500 ? 40 : fleet > 500 ? 20 : 0;
  const fleetLabel = fleet >= 25 && fleet <= 500
    ? `Fleet size ${fleet} — sweet spot`
    : fleet > 500
    ? `Fleet size ${fleet} — larger fleet`
    : fleet > 0 ? `Fleet size ${fleet} — under threshold` : 'Fleet size unknown';

  const yr = carrier.years_since_report;
  const stalePts = yr == null ? 0 : yr > 5 ? 30 : yr > 3 ? 20 : yr > 1 ? 10 : 5;
  const staleLabel = yr == null ? 'No report date'
    : yr === 0 ? 'Reported this year'
    : yr <= 1 ? `Reported ~${yr}yr ago — active`
    : yr <= 3 ? `Reported ~${yr}yr ago — recent`
    : `Reported ${yr}yr ago — staleness penalty`;

  return [
    { label: fleetLabel, pts: fleetPts, max: 40 },
    { label: staleLabel, pts: stalePts, max: 30 },
  ];
}

// Pitch angle suggestions keyed by fleet size
function pitchAngle(carrier: Carrier): string {
  const fleet = carrier.fleet_size ?? 0;
  const state = carrier.state ?? '';
  const stateStr = state ? ` in ${state}` : '';

  if (fleet >= 100) return `Large fleet of ${fleet} units${stateStr} — lead with fleet-wide rebranding ROI. Offer a phased wrap program to minimize downtime. Show CPM vs. billboard data for their region.`;
  if (fleet >= 50)  return `Mid-size fleet (${fleet} units${stateStr}) — strong candidate for phased wrap campaign. Pitch spring season timing and bundle pricing for 5+ vehicles.`;
  if (fleet >= 25)  return `Sweet-spot fleet of ${fleet} trucks${stateStr}. Pitch brand consistency across the fleet. Offer a pilot program on 5 units with before/after photography for their marketing team.`;
  if (fleet >= 10)  return `Smaller fleet (${fleet} units${stateStr}) — pitch the owner-operator angle. Wraps turn every vehicle into a rolling billboard. Use a local case study for credibility.`;
  return `Small operation${stateStr} — pitch visibility and professionalism. Show them a before/after of a similar local client. Keep the ask simple: one vehicle to start.`;
}

export default function CarrierRow({ carrier, checked }: Props) {
  const { toggleCarrierId } = useAppStore((s) => ({ toggleCarrierId: s.toggleCarrierId }));
  const importMutation = useImportCarrier();
  const [expanded, setExpanded] = useState(false);

  const factors = scoreFactors(carrier);
  const pitch = pitchAngle(carrier);
  const totalFactorPts = factors.reduce((s, f) => s + f.pts, 0);

  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent((carrier.name || '') + ' ' + (carrier.state || '') + ' trucking')}`;

  return (
    <>
      <div
        className="carrier-row"
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <input
          type="checkbox"
          className="carrier-cb"
          checked={checked}
          onChange={(e) => { e.stopPropagation(); toggleCarrierId(carrier.id); }}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="carrier-cell-name">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="carrier-name">{carrier.name}</div>
            {carrier.source === 'news_signal' && (
              <span title="Signal lead — sourced from a live news event" style={{
                fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                padding: '1px 5px', borderRadius: 3,
                background: 'rgba(77,138,245,0.15)', color: '#4d8af5', flexShrink: 0,
              }}>
                📡 Signal
              </span>
            )}
            {carrier.source === 'sam_gov' && (
              <span title="Federal contractor from SAM.gov" style={{
                fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                padding: '1px 5px', borderRadius: 3,
                background: 'rgba(16,185,129,0.12)', color: '#10b981', flexShrink: 0,
              }}>
                GOV
              </span>
            )}
          </div>
          {carrier.dba_name && <div className="carrier-dba">DBA: {carrier.dba_name}</div>}
          {carrier.dot_number && <div className="carrier-dot">DOT #{carrier.dot_number}</div>}
        </div>
        <div className="carrier-fleet">
          <strong>{carrier.fleet_size ?? '—'}</strong>
          {carrier.fleet_size && <small> units</small>}
        </div>
        <div className="carrier-authority" title="Years on FMCSA registry — longer = more established">
          <AuthorityAge years={carrier.authority_age_years} />
        </div>
        <div className="carrier-score-cell">
          <ScoreMeter score={carrier.wrap_score} />
          <StaleTag years={carrier.years_since_report} />
        </div>
        <div className="carrier-loc">
          {carrier.city && carrier.state ? `${carrier.city}, ${carrier.state}` : carrier.state ?? '—'}
        </div>
        <div className="carrier-contact">
          {carrier.phone ? (
            <a href={`tel:${carrier.phone}`} className="carrier-phone-link" onClick={(e) => e.stopPropagation()}>
              {carrier.phone}
            </a>
          ) : '—'}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          {carrier.already_imported ? (
            <span className="add-lead-btn imported">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 11, height: 11 }}><polyline points="20 6 9 17 4 12"/></svg>
              In CRM
            </span>
          ) : (
            <button
              className="add-lead-btn"
              onClick={() => importMutation.mutate(carrier.id)}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending ? '…' : '+ Add'}
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded profile panel ── */}
      {expanded && (
        <div style={{
          background: 'rgba(99,102,241,0.04)',
          borderBottom: '1px solid var(--border)',
          padding: '12px 16px 14px 44px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}>
          {/* Score breakdown */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
              Wrap Score Breakdown — {totalFactorPts}/70
            </div>
            {factors.map((f) => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text)', marginBottom: 2 }}>{f.label}</div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${(f.pts / f.max) * 100}%`, height: '100%', background: f.pts >= f.max * 0.7 ? '#10b981' : f.pts >= f.max * 0.4 ? '#f59e0b' : '#6b7280', borderRadius: 2 }} />
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0, minWidth: 36, textAlign: 'right' }}>
                  {f.pts}/{f.max}
                </span>
              </div>
            ))}
          </div>

          {/* Pitch angle + actions */}
          <div>
            {carrier.source === 'news_signal' && carrier.notes && (() => {
              const lines = carrier.notes.split('\n').filter(Boolean);
              const headline = lines[0]?.replace(/^📰\s*/, '') || '';
              const link = lines[1] || '';
              return (
                <div style={{
                  background: 'rgba(77,138,245,0.08)', border: '1px solid rgba(77,138,245,0.2)',
                  borderRadius: 7, padding: '8px 10px', marginBottom: 10,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4d8af5', marginBottom: 4 }}>
                    📡 Signal Event
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.5, marginBottom: link ? 4 : 0 }}>
                    {headline}
                  </div>
                  {link && (
                    <a href={link} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 10, color: '#4d8af5', textDecoration: 'none' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Read article →
                    </a>
                  )}
                </div>
              );
            })()}
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
              Suggested Pitch
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 10px' }}>{pitch}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a
                href={googleSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  padding: '4px 10px', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Research →
              </a>
              {!carrier.already_imported && (
                <button
                  onClick={(e) => { e.stopPropagation(); importMutation.mutate(carrier.id); }}
                  disabled={importMutation.isPending}
                  style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--accent)',
                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
                  }}
                >
                  {importMutation.isPending ? 'Adding…' : '+ Import to CRM →'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
