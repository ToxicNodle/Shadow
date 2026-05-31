import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { api } from '../../api/client';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// FIPS id → state abbreviation
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

function fmtK(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function opportunityColor(carriers: number, pipeline: number, won: number, maxCarriers: number): string {
  if (maxCarriers === 0) return '#1e2330';
  const coverage = pipeline + won * 2;
  // Normalize carrier density (0–1)
  const density = Math.log1p(carriers) / Math.log1p(maxCarriers);
  // High density + low coverage = bright opportunity
  const coverageDiscount = Math.min(coverage / Math.max(carriers * 0.01, 1), 1);
  const opportunity = density * (1 - coverageDiscount * 0.7);

  if (won > 0 && pipeline > 0) return '#22c55e';   // active + won = green
  if (won > 0) return '#16a34a';                    // won only = darker green
  if (pipeline > 0) return '#f97316';               // pipeline only = orange
  if (opportunity > 0.7) return '#f4551c';          // hot white space
  if (opportunity > 0.4) return '#9a3a0f';          // warm white space
  if (opportunity > 0.1) return '#4b2305';          // mild white space
  return '#1e2330';                                  // not enough carriers
}

export default function MarketWhiteSpaceMap() {
  const [tooltip, setTooltip] = useState<{ state: string; x: number; y: number } | null>(null);
  const [filter, setFilter] = useState<'all' | 'opportunity' | 'pipeline' | 'won'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['market-map'],
    queryFn: () => api.getMarketMap(),
    staleTime: 5 * 60_000,
  });

  const byState = data?.byState ?? {};
  const topOpp   = data?.topOpportunityStates ?? [];
  const total    = data?.totalCarriers ?? 0;

  const maxCarriers = Math.max(
    ...Object.values(byState).map((d) => d.carriers),
    1
  );

  const stateData = tooltip ? byState[tooltip.state] : null;

  return (
    <section className="pv-card pv-map-card">
      <div className="pv-map-header">
        <div>
          <h3 className="pv-card-title">Market White Space</h3>
          <p className="pv-map-sub">
            {total > 0 ? `${fmtK(total)} carriers in database` : 'Loading carrier data...'}
            {topOpp.length > 0 && ` · Top opportunity: ${topOpp.slice(0, 3).join(', ')}`}
          </p>
        </div>
        <div className="pv-map-filters">
          {(['all','opportunity','pipeline','won'] as const).map((f) => (
            <button
              key={f}
              className={`pv-map-filter-btn${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'opportunity' ? 'White Space' : f === 'pipeline' ? 'Pipeline' : 'Won'}
            </button>
          ))}
        </div>
      </div>

      <div className="pv-map-wrap" style={{ position: 'relative' }}>
        {isLoading && (
          <div className="pv-map-loading">
            <div className="skeleton" style={{ width: '100%', height: 320, borderRadius: 8 }} />
          </div>
        )}

        {!isLoading && (
          <ComposableMap
            projection="geoAlbersUsa"
            style={{ width: '100%', height: 320 }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const stateAbbr = FIPS_TO_STATE[geo.id] ?? '';
                  const d = byState[stateAbbr] ?? { won: 0, pipeline: 0, carriers: 0 };

                  const show = filter === 'all'
                    || (filter === 'opportunity' && d.carriers > 100 && d.pipeline === 0 && d.won === 0)
                    || (filter === 'pipeline' && d.pipeline > 0)
                    || (filter === 'won' && d.won > 0);

                  const fill = show
                    ? opportunityColor(d.carriers, d.pipeline, d.won, maxCarriers)
                    : '#111827';

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke="#2a3040"
                      strokeWidth={0.5}
                      style={{
                        default: { outline: 'none', cursor: 'pointer', transition: 'fill 0.15s' },
                        hover: { outline: 'none', fill: '#f4551c', opacity: 0.9 },
                        pressed: { outline: 'none' },
                      }}
                      onMouseEnter={(e) => {
                        const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
                        setTooltip({
                          state: stateAbbr,
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top,
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        )}

        {/* Tooltip */}
        {tooltip && stateData && (
          <div
            className="pv-map-tooltip"
            style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
          >
            <div className="pv-map-tt-state">
              {STATE_NAMES[tooltip.state] ?? tooltip.state}
            </div>
            <div className="pv-map-tt-row">
              <span className="pv-map-tt-dot" style={{ background: '#6b7280' }} />
              {fmtK(stateData.carriers)} carriers
            </div>
            {stateData.pipeline > 0 && (
              <div className="pv-map-tt-row">
                <span className="pv-map-tt-dot" style={{ background: '#f97316' }} />
                {stateData.pipeline} in pipeline
              </div>
            )}
            {stateData.won > 0 && (
              <div className="pv-map-tt-row">
                <span className="pv-map-tt-dot" style={{ background: '#22c55e' }} />
                {stateData.won} won
              </div>
            )}
            {stateData.pipeline === 0 && stateData.won === 0 && stateData.carriers > 50 && (
              <div className="pv-map-tt-opportunity">White space →</div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="pv-map-legend">
        <div className="pv-map-legend-item">
          <span className="pv-map-legend-swatch" style={{ background: '#22c55e' }} />
          Won deals
        </div>
        <div className="pv-map-legend-item">
          <span className="pv-map-legend-swatch" style={{ background: '#f97316' }} />
          Active pipeline
        </div>
        <div className="pv-map-legend-item">
          <span className="pv-map-legend-swatch" style={{ background: '#f4551c' }} />
          Hot white space
        </div>
        <div className="pv-map-legend-item">
          <span className="pv-map-legend-swatch" style={{ background: '#4b2305' }} />
          Mild opportunity
        </div>
      </div>

      {/* Top opportunity states */}
      {topOpp.length > 0 && (
        <div className="pv-map-top-opp">
          <div className="pv-map-top-opp-label">Top white space states</div>
          <div className="pv-map-top-opp-chips">
            {topOpp.map((s) => {
              const d = byState[s] ?? { won: 0, pipeline: 0, carriers: 0 };
              return (
                <div key={s} className="pv-map-opp-chip">
                  <span className="pv-map-opp-state">{s}</span>
                  <span className="pv-map-opp-count">{fmtK(d.carriers)} carriers</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
