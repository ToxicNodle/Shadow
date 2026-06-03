/**
 * Tiny tile-based US heatmap. No mapping library required — uses a fixed
 * grid layout where each state has known (row, col) coordinates that
 * approximate its geographic position. Colors scale by lead count.
 *
 * This is the same approach used by NYT election grids and FiveThirtyEight.
 * Far lighter than Leaflet / Mapbox and prints clean in PDFs.
 */

const GRID: Record<string, [number, number]> = {
  AK: [0, 0],
  ME: [0, 11],
  VT: [1, 10], NH: [1, 11],
  WA: [1, 1], ID: [1, 2], MT: [1, 3], ND: [1, 4], MN: [1, 5], WI: [1, 6], MI: [1, 7], NY: [1, 9], MA: [1, 10], RI: [1, 11],
  OR: [2, 1], NV: [2, 2], WY: [2, 3], SD: [2, 4], IA: [2, 5], IL: [2, 6], IN: [2, 7], OH: [2, 8], PA: [2, 9], NJ: [2, 10], CT: [2, 11],
  CA: [3, 1], UT: [3, 2], CO: [3, 3], NE: [3, 4], MO: [3, 5], KY: [3, 6], WV: [3, 7], VA: [3, 8], MD: [3, 9], DE: [3, 10],
  AZ: [4, 2], NM: [4, 3], KS: [4, 4], AR: [4, 5], TN: [4, 6], NC: [4, 7], SC: [4, 8], DC: [4, 9],
  HI: [5, 0],          OK: [5, 4], LA: [5, 5], MS: [5, 6], AL: [5, 7], GA: [5, 8],
              TX: [6, 4],                            FL: [6, 8],
};

export default function UsHeatmap({ data }: { data: Record<string, number> }) {
  const values = Object.values(data);
  const max = values.length ? Math.max(...values) : 1;
  const min = values.length ? Math.min(...values) : 0;

  const ROWS = 7;
  const COLS = 12;
  const SIZE = 38;
  const GAP = 4;
  const W = COLS * (SIZE + GAP);
  const H = ROWS * (SIZE + GAP);

  function colorFor(n: number | undefined): string {
    if (!n) return 'rgba(255,255,255,0.04)';
    // log-scale so a few outliers don't wash out the rest of the map
    const t = Math.log(n - min + 1) / Math.log(max - min + 1 || 1);
    const stops = [
      [40, 60, 90],     // very low
      [80, 80, 120],
      [160, 100, 60],
      [220, 130, 30],
      [245, 158, 11],   // peak orange
    ];
    const idx = Math.min(stops.length - 1, Math.max(0, t * (stops.length - 1)));
    const lo = stops[Math.floor(idx)];
    const hi = stops[Math.ceil(idx)];
    const f = idx - Math.floor(idx);
    const r = Math.round(lo[0] + (hi[0] - lo[0]) * f);
    const g = Math.round(lo[1] + (hi[1] - lo[1]) * f);
    const b = Math.round(lo[2] + (hi[2] - lo[2]) * f);
    return `rgb(${r},${g},${b})`;
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} xmlns="http://www.w3.org/2000/svg">
        {Object.entries(GRID).map(([state, [row, col]]) => {
          const n = data[state];
          const x = col * (SIZE + GAP);
          const y = row * (SIZE + GAP);
          return (
            <g key={state} transform={`translate(${x},${y})`}>
              <rect width={SIZE} height={SIZE} fill={colorFor(n)} rx={4} ry={4} />
              <text x={SIZE/2} y={SIZE/2 - 2} textAnchor="middle" fontSize="11" fontWeight="800" fill={n && n > max * 0.3 ? '#fff' : '#cbd5e1'} dominantBaseline="middle">
                {state}
              </text>
              {n !== undefined && n > 0 && (
                <text x={SIZE/2} y={SIZE/2 + 11} textAnchor="middle" fontSize="8" fill={n > max * 0.3 ? 'rgba(255,255,255,0.85)' : 'rgba(203,213,225,0.7)'}>
                  {n >= 1000 ? `${(n/1000).toFixed(1)}k` : n}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>Lead count:</span>
        {[0.05, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: 3, background: colorFor(min + (max - min) * t) }} />
        ))}
        <span>low → high</span>
        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>peak: {max.toLocaleString()}</span>
      </div>
    </div>
  );
}
