import { useMemo, useState } from 'react';
import {
  VEHICLE_SPECS, BENCHMARK_CPM, computeRoi, fmtMoney, fmtImpressions,
  type RoiResult,
} from '../../utils/wrapRoi';

interface Props {
  priceLow: number;
  priceHigh: number;
  brandColor: string;
  defaultVehicle?: string;
  onRoiChange?: (roi: RoiResult) => void;
}

export default function WrapRoiPanel({ priceLow, priceHigh, brandColor, defaultVehicle, onRoiChange }: Props) {
  const [vehicle, setVehicle] = useState(
    VEHICLE_SPECS.find((v) => v.value === defaultVehicle)?.value ?? 'cargo_van',
  );

  const roi = useMemo(() => {
    const spec = VEHICLE_SPECS.find((v) => v.value === vehicle) ?? VEHICLE_SPECS[2];
    const r = computeRoi(spec, priceLow, priceHigh);
    onRoiChange?.(r);
    return r;
  }, [vehicle, priceLow, priceHigh, onRoiChange]);

  // Max CPM for bar scaling (benchmarks dwarf the wrap, so cap the scale).
  const maxCpm = Math.max(...BENCHMARK_CPM.map((b) => b.cpm));

  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          💰 Mobile billboard ROI
        </div>
        <select
          className="input"
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }}
        >
          {VEHICLE_SPECS.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Headline stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        <Stat label="Views / day" value={fmtImpressions(roi.spec.dailyImpressions)} color={brandColor} />
        <Stat label={`${roi.lifeYears}-yr impressions`} value={fmtImpressions(roi.totalImpressions)} color={brandColor} />
        <Stat label="Effective cost" value={`${fmtMoney(roi.centsPerDay)}/day`} color={brandColor} />
      </div>

      {/* CPM comparison */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
        Cost per 1,000 views vs other media
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <CpmBar label={`This wrap (${roi.spec.label})`} cpm={roi.wrapCpm} maxCpm={maxCpm} color={brandColor} highlight />
        {BENCHMARK_CPM.map((b) => (
          <CpmBar key={b.label} label={b.label} cpm={b.cpm} maxCpm={maxCpm} color="#9ca3af" />
        ))}
      </div>

      <div style={{ fontSize: 13, marginTop: 12, lineHeight: 1.5, color: 'var(--text)' }}>
        At <strong>{fmtMoney(roi.costLow)}–{fmtMoney(roi.costHigh)}</strong> one-time, that's about{' '}
        <strong style={{ color: brandColor }}>${roi.wrapCpm.toFixed(2)}</strong> per 1,000 views —{' '}
        {(BENCHMARK_CPM[0].cpm / roi.wrapCpm).toFixed(0)}× cheaper than a billboard.
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function CpmBar({ label, cpm, maxCpm, color, highlight }: { label: string; cpm: number; maxCpm: number; color: string; highlight?: boolean }) {
  // Wrap CPM is tiny; give it a visible floor so the bar still renders.
  const pct = Math.max((cpm / maxCpm) * 100, highlight ? 2 : 4);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 130, fontSize: 11, fontWeight: highlight ? 700 : 500, color: highlight ? color : 'var(--text)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ flex: 1, height: 16, background: 'var(--bg-card)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .3s' }} />
      </div>
      <div style={{ width: 52, textAlign: 'right', fontSize: 11, fontWeight: 700, color: highlight ? color : 'var(--text-muted)', flexShrink: 0 }}>
        ${cpm.toFixed(2)}
      </div>
    </div>
  );
}
