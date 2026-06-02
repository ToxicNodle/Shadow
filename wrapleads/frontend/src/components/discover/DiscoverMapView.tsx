import { useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { useAppStore } from '../../store/useAppStore';
import { useCarrierSearch } from '../../hooks/useCarriers';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

const FIPS_TO_STATE: Record<string, string> = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE',
  '11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA',
  '20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN',
  '28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM',
  '36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI',
  '45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA',
  '54':'WV','55':'WI','56':'WY',
};

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',DC:'Washington DC',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',
  KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
  MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
  NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',
  NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
  WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
};

function stateColor(count: number, maxCount: number, avgScore: number): string {
  if (count === 0) return '#111827';
  const intensity = Math.log1p(count) / Math.log1p(Math.max(maxCount, 1));
  if (avgScore >= 70) {
    // Hot territory — green
    const r = Math.round(22 + intensity * 12);
    const g = Math.round(100 + intensity * 97);
    const b = Math.round(75 + intensity * 20);
    return `rgb(${r},${g},${b})`;
  }
  if (avgScore >= 50) {
    // Warm — orange
    const v = Math.round(60 + intensity * 160);
    return `rgb(${v}, ${Math.round(v * 0.55)}, ${Math.round(v * 0.1)})`;
  }
  // Cool — Signal Blue
  const v = Math.round(30 + intensity * 100);
  return `rgb(${Math.round(v * 0.6)}, ${Math.round(v * 0.7)}, ${v})`;
}

export default function DiscoverMapView() {
  const results = useAppStore((s) => s.carrierState.results);
  const lastQuery = useAppStore((s) => s.carrierState.lastQuery);
  const [tooltip, setTooltip] = useState<{ state: string; x: number; y: number } | null>(null);
  const searchMut = useCarrierSearch();

  // Build per-state data from current results
  type StateEntry = { count: number; hotCount: number; totalScore: number; avgFleet: number; totalFleet: number };
  const byState: Record<string, StateEntry> = {};
  for (const c of results) {
    const st = c.state ?? '';
    if (!st) continue;
    if (!byState[st]) byState[st] = { count: 0, hotCount: 0, totalScore: 0, avgFleet: 0, totalFleet: 0 };
    byState[st].count++;
    byState[st].totalScore += c.wrap_score;
    byState[st].totalFleet += c.fleet_size ?? 0;
    if (c.wrap_score >= 70) byState[st].hotCount++;
  }
  for (const st of Object.keys(byState)) {
    byState[st].avgFleet = Math.round(byState[st].totalFleet / byState[st].count);
  }

  const maxCount = Math.max(...Object.values(byState).map((d) => d.count), 1);

  function searchState(state: string) {
    searchMut.mutate({
      ...(lastQuery ?? {}),
      states: [state],
      limit: 50,
    });
  }

  const ttData = tooltip ? byState[tooltip.state] : null;
  const ttAvgScore = ttData ? Math.round(ttData.totalScore / ttData.count) : 0;

  const sortedStates = Object.entries(byState)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', padding: '16px' }}>
      {results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)', fontSize: 13 }}>
          Run a search to see results plotted on the map.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {results.length.toLocaleString()} results across {Object.keys(byState).length} states
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                Click a state to search that state only
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { color: '#22c55e', label: 'Hot (70+)' },
                { color: '#f97316', label: 'Warm (50–69)' },
                { color: '#4d8af5', label: 'Cool (<50)' },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-faint)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <ComposableMap projection="geoAlbersUsa" style={{ width: '100%', height: 300 }}>
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const st = FIPS_TO_STATE[geo.id] ?? '';
                    const d = byState[st];
                    const avgScore = d ? Math.round(d.totalScore / d.count) : 0;
                    const fill = d ? stateColor(d.count, maxCount, avgScore) : '#111827';

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke="#2a3040"
                        strokeWidth={0.5}
                        style={{
                          default: { outline: 'none', cursor: d ? 'pointer' : 'default', transition: 'fill 0.15s' },
                          hover: { outline: 'none', fill: d ? '#f4551c' : '#1e2330', opacity: 0.85 },
                          pressed: { outline: 'none' },
                        }}
                        onMouseEnter={(e) => {
                          if (!d) return;
                          const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
                          setTooltip({ state: st, x: e.clientX - rect.left, y: e.clientY - rect.top });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                        onClick={() => { if (d) searchState(st); }}
                      />
                    );
                  })
                }
              </Geographies>
            </ComposableMap>

            {tooltip && ttData && (
              <div style={{
                position: 'absolute', left: tooltip.x + 12, top: tooltip.y - 10,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '8px 12px', fontSize: 11, zIndex: 10,
                pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                minWidth: 140,
              }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                  {STATE_NAMES[tooltip.state] ?? tooltip.state}
                </div>
                <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span>{ttData.count} carrier{ttData.count !== 1 ? 's' : ''} in results</span>
                  <span>Avg score: {ttAvgScore}/100</span>
                  {ttData.hotCount > 0 && (
                    <span style={{ color: '#22c55e' }}>{ttData.hotCount} hot lead{ttData.hotCount !== 1 ? 's' : ''}</span>
                  )}
                  {ttData.avgFleet > 0 && <span>Avg fleet: {ttData.avgFleet} units</span>}
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: '#4d8af5', fontWeight: 600 }}>
                  Click to search this state →
                </div>
              </div>
            )}
          </div>

          {sortedStates.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sortedStates.map(([st, d]) => {
                const avg = Math.round(d.totalScore / d.count);
                const color = avg >= 70 ? '#22c55e' : avg >= 50 ? '#f97316' : '#4d8af5';
                return (
                  <button
                    key={st}
                    onClick={() => searchState(st)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: color + '10', border: `1px solid ${color}30`,
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, color }}>{st}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{d.count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
