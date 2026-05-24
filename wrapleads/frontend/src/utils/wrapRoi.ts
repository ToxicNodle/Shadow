// Mobile-billboard ROI math for the wrap sales pitch.
// Impression + CPM figures are industry-standard estimates (OAAA / 3M / ATA
// vehicle-wrap studies), used to frame a wrap as the cheapest cost-per-view
// advertising medium. These are sales estimates, not guarantees.

export interface VehicleSpec {
  value: string;
  label: string;
  sqft: number;            // approx wrappable surface area
  dailyImpressions: number; // approx daily views in normal use
}

export const VEHICLE_SPECS: VehicleSpec[] = [
  { value: 'sedan',     label: 'Car / Sedan',     sqft: 150,  dailyImpressions: 25000 },
  { value: 'pickup',    label: 'Pickup Truck',    sqft: 220,  dailyImpressions: 30000 },
  { value: 'cargo_van', label: 'Cargo / Sprinter Van', sqft: 280, dailyImpressions: 35000 },
  { value: 'box_truck', label: 'Box Truck',       sqft: 600,  dailyImpressions: 55000 },
  { value: 'trailer',   label: '53′ Trailer', sqft: 1000, dailyImpressions: 70000 },
];

// Commonly cited CPM (cost per 1,000 impressions) for other media, USD.
export const BENCHMARK_CPM: { label: string; cpm: number }[] = [
  { label: 'Outdoor billboard', cpm: 3.56 },
  { label: 'Radio (30s spot)',  cpm: 5.92 },
  { label: 'Magazine',          cpm: 21.42 },
];

export interface RoiResult {
  spec: VehicleSpec;
  lifeYears: number;
  costLow: number;
  costHigh: number;
  costAvg: number;
  totalImpressions: number;
  wrapCpm: number;
  centsPerDay: number;
}

export function computeRoi(
  spec: VehicleSpec,
  priceLow: number,
  priceHigh: number,
  lifeYears = 5,
): RoiResult {
  const costLow = Math.round(spec.sqft * priceLow);
  const costHigh = Math.round(spec.sqft * priceHigh);
  const costAvg = Math.round((costLow + costHigh) / 2);
  const totalImpressions = spec.dailyImpressions * 365 * lifeYears;
  const wrapCpm = costAvg / (totalImpressions / 1000);
  const centsPerDay = costAvg / (lifeYears * 365);
  return { spec, lifeYears, costLow, costHigh, costAvg, totalImpressions, wrapCpm, centsPerDay };
}

export function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function fmtImpressions(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
  if (n >= 1_000) return Math.round(n / 1000) + 'K';
  return String(n);
}

// Compact HTML block embedded into the public proposal page.
export function roiHtml(roi: RoiResult, brandColor: string): string {
  const rows = [
    { label: `Vehicle wrap (${roi.spec.label})`, cpm: roi.wrapCpm, highlight: true },
    ...BENCHMARK_CPM,
  ]
    .map((r) => {
      const isWrap = 'highlight' in r && r.highlight;
      return `<tr${isWrap ? ` style="font-weight:700;color:${brandColor}"` : ''}>
        <td>${r.label}</td>
        <td style="text-align:right">$${r.cpm.toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  return `
  <p style="margin-bottom:14px">A wrap on a ${roi.spec.label.toLowerCase()} generates an estimated
    <strong>${fmtImpressions(roi.spec.dailyImpressions)} views per day</strong> —
    roughly <strong>${fmtImpressions(roi.totalImpressions)} impressions</strong> over its
    ${roi.lifeYears}-year life. At a one-time investment of
    <strong>${fmtMoney(roi.costLow)}–${fmtMoney(roi.costHigh)}</strong>, that works out to about
    <strong>${fmtMoney(roi.centsPerDay)}/day</strong> for a rolling billboard.</p>
  <table>
    <thead><tr><th>Medium</th><th style="text-align:right">Cost per 1,000 views</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-size:11px;color:#888;margin-top:8px">Estimates based on industry vehicle-wrap impression studies. Actual results vary with routes and mileage.</p>`;
}
