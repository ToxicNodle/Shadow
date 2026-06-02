import { useState } from 'react';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';
import type { Lead } from '../../../api/types';

interface Package {
  tier: string;
  tagline: string;
  pricePerVehicle: number;
  totalPrice: number;
  vinyl: string;
  warranty: string;
  timeline: string;
  features: string[];
  bestFor: string;
}

const TIER_COLORS: Record<string, { border: string; badge: string; text: string }> = {
  Essential: { border: '#64748b', badge: 'rgba(100,116,139,0.15)', text: '#94a3b8' },
  Professional: { border: '#f4551c', badge: 'rgba(244,85,28,0.15)', text: '#f4551c' },
  Premium: { border: '#f59e0b', badge: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
};

const VEHICLE_TYPES = [
  'Box Truck', 'Semi-Tractor', 'Cargo Van', 'Pickup Truck', 'Work Van',
  'Sprinter Van', 'Trailer', 'Race Car', 'Passenger Car', 'SUV/Crossover',
  'Bus', 'Equipment', 'Other Vehicle',
];

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US');
}

function PackageCard({ pkg, isRecommended }: { pkg: Package; isRecommended: boolean }) {
  const colors = TIER_COLORS[pkg.tier] ?? { border: '#64748b', badge: 'rgba(100,116,139,0.15)', text: '#94a3b8' };

  return (
    <div
      style={{
        flex: 1, minWidth: 0,
        background: 'var(--surface-2)',
        border: `1px solid ${isRecommended ? colors.border : 'var(--border-subtle)'}`,
        borderTop: `3px solid ${colors.border}`,
        borderRadius: 10,
        padding: '14px 14px 16px',
        display: 'flex', flexDirection: 'column', gap: 8,
        position: 'relative',
      }}
    >
      {isRecommended && (
        <div style={{
          position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
          fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
          background: colors.border, color: '#000',
          textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap',
        }}>
          Most Popular
        </div>
      )}

      {/* Tier + tagline */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
            background: colors.badge, color: colors.text,
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            {pkg.tier}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic' }}>
          {pkg.tagline}
        </div>
      </div>

      {/* Price */}
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
          {fmt(pkg.totalPrice)}
        </div>
        {pkg.totalPrice !== pkg.pricePerVehicle && (
          <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
            {fmt(pkg.pricePerVehicle)} / vehicle
          </div>
        )}
      </div>

      {/* Vinyl + warranty + timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[
          { label: 'Film', val: pkg.vinyl },
          { label: 'Warranty', val: pkg.warranty },
          { label: 'Timeline', val: pkg.timeline },
        ].map(({ label, val }) => (
          <div key={label} style={{ display: 'flex', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-faint)', minWidth: 48, flexShrink: 0 }}>{label}:</span>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Features */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {pkg.features.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 10, color: colors.text, flexShrink: 0, marginTop: 1 }}>✓</span>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.3 }}>{f}</span>
          </div>
        ))}
      </div>

      {/* Best for */}
      {pkg.bestFor && (
        <div style={{
          marginTop: 4, fontSize: 10, color: 'var(--text-faint)',
          borderTop: '1px solid var(--border-subtle)', paddingTop: 8, lineHeight: 1.4,
          fontStyle: 'italic',
        }}>
          Best for: {pkg.bestFor}
        </div>
      )}
    </div>
  );
}

interface Props {
  lead: Lead;
}

export default function PackageQuotePanel({ lead }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const settings = useAppStore((s) => s.settings);

  const [open, setOpen] = useState(false);
  const [vehicleCount, setVehicleCount] = useState('1');
  const [vehicleType, setVehicleType] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [intro, setIntro] = useState('');
  const [closingLine, setClosingLine] = useState('');
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setPackages(null);
    try {
      const r = await api.generatePackageQuote({
        lead: {
          company: lead.company,
          category: lead.category,
          state: lead.state || null,
          fleetSize: lead.fleetSize || null,
        },
        vehicleCount: parseInt(vehicleCount, 10) || 1,
        vehicleType: vehicleType || 'Vehicle',
        extraNotes,
        settings: {
          companyName: settings.companyName,
          senderName: settings.senderName,
          senderTitle: settings.senderTitle,
          senderEmail: settings.senderEmail,
          senderPhone: settings.senderPhone,
        },
      });
      setPackages(r.packages);
      setIntro(r.intro ?? '');
      setClosingLine(r.closingLine ?? '');
    } catch (e: any) {
      showToast(e.message || 'Generation failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  function buildEmailText() {
    if (!packages) return '';
    const lines: string[] = [];
    if (intro) lines.push(intro, '');
    lines.push(`Here are 3 package options for your ${vehicleType || 'vehicle'} wrap project:`, '');

    for (const pkg of packages) {
      lines.push(`── ${pkg.tier} Package: ${fmt(pkg.totalPrice)} ──`);
      lines.push(`Film: ${pkg.vinyl} | Warranty: ${pkg.warranty} | Timeline: ${pkg.timeline}`);
      lines.push('Includes:');
      pkg.features.forEach((f) => lines.push(`  • ${f}`));
      lines.push('');
    }

    if (closingLine) lines.push(closingLine);
    return lines.join('\n');
  }

  function copyEmail() {
    const text = buildEmailText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      showToast('Package quote copied!', 'success');
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div
      className="pv-card"
      style={{ marginBottom: 12 }}
    >
      {/* Header */}
      <button
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '10px 14px',
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.12em', color: '#f59e0b',
          }}>
            Good / Better / Best
          </span>
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 99, fontWeight: 700,
            background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
          }}>
            AI Package Quote
          </span>
        </div>
        <span style={{ fontSize: 14, color: 'var(--text-faint)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>
          ▾
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          {/* Config form */}
          {!packages && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Vehicle Count</label>
                  <input
                    className="input"
                    type="number" min="1" max="500"
                    value={vehicleCount}
                    onChange={(e) => setVehicleCount(e.target.value)}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <label className="field-label">Vehicle Type</label>
                  <select className="input" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                    <option value="">Auto-detect from category</option>
                    {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="field-label">Extra Notes (optional)</label>
                <input
                  className="input"
                  value={extraNotes}
                  onChange={(e) => setExtraNotes(e.target.value)}
                  placeholder="e.g. full wrap, spot UV, rush timeline…"
                />
              </div>
              <button
                className="btn btn-primary"
                style={{ justifyContent: 'center', background: '#f59e0b', borderColor: '#f59e0b', color: '#000' }}
                onClick={generate}
                disabled={loading}
              >
                {loading ? (
                  <><span className="spinner" style={{ width: 14, height: 14 }} /> Generating packages…</>
                ) : (
                  '✦ Generate Good / Better / Best Packages'
                )}
              </button>
            </div>
          )}

          {/* Results */}
          {packages && (
            <>
              {intro && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5, fontStyle: 'italic' }}>
                  {intro}
                </p>
              )}

              {/* Package cards */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {packages.map((pkg, i) => (
                  <PackageCard key={pkg.tier} pkg={pkg} isRecommended={i === 1} />
                ))}
              </div>

              {closingLine && (
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12, textAlign: 'center', fontStyle: 'italic' }}>
                  {closingLine}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn"
                  style={{ fontSize: 12, padding: '5px 12px', flex: 1 }}
                  onClick={copyEmail}
                >
                  {copied ? '✓ Copied!' : '📋 Copy as Email Text'}
                </button>
                <button
                  className="btn"
                  style={{ fontSize: 12, padding: '5px 12px', flex: 1, color: 'var(--text-faint)' }}
                  onClick={() => { setPackages(null); }}
                >
                  ↺ Regenerate
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
