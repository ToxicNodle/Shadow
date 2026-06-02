import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { api } from '../../api/client';

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

function agingColor(d: { fresh: number; aging: number; due: number; overdue: number }): string {
  if (d.overdue > 0) return '#ef4444';       // red: past due
  if (d.due > 0) return '#f59e0b';            // amber: due within 90 days
  if (d.aging > 0) return '#f97316';          // orange: 3+ years old
  if (d.fresh > 0) return '#22c55e';          // green: fresh
  return '#111827';
}

export default function FleetAgingMap() {
  const [tooltip, setTooltip] = useState<{ state: string; x: number; y: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['jobs-aging-map'],
    queryFn: () => api.getJobsAgingMap(),
    staleTime: 5 * 60_000,
  });

  const byState = data?.byState ?? {};
  const ttData = tooltip ? byState[tooltip.state] : null;

  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Fleet Aging Map</div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
            {data?.totalJobs ?? 0} total installs
            {(data?.dueCount ?? 0) > 0 && <span style={{ color: '#f59e0b', marginLeft: 8 }}> · {data?.dueCount} due in 90d</span>}
            {(data?.overdueCount ?? 0) > 0 && <span style={{ color: '#ef4444', marginLeft: 8 }}> · {data?.overdueCount} overdue</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { color: '#22c55e', label: 'Fresh (<3yr)' },
            { color: '#f97316', label: '3yr+ aging' },
            { color: '#f59e0b', label: 'Due in 90d' },
            { color: '#ef4444', label: 'Overdue' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-faint)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="skeleton" style={{ height: 260, borderRadius: 8 }} />
      ) : Object.keys(byState).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)', fontSize: 13 }}>
          No installed jobs with linked leads yet. Add jobs with a client linked to see the map.
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <ComposableMap projection="geoAlbersUsa" style={{ width: '100%', height: 260 }}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const st = FIPS_TO_STATE[geo.id] ?? '';
                  const d = byState[st];
                  const fill = d ? agingColor(d) : '#111827';

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke="#2a3040"
                      strokeWidth={0.5}
                      style={{
                        default: { outline: 'none', cursor: d ? 'pointer' : 'default', transition: 'fill 0.15s' },
                        hover: { outline: 'none', fill: d ? '#f4551c' : '#1e2330' },
                        pressed: { outline: 'none' },
                      }}
                      onMouseEnter={(e) => {
                        if (!d) return;
                        const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
                        setTooltip({ state: st, x: e.clientX - rect.left, y: e.clientY - rect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10 }}>
                <span style={{ color: 'var(--text-muted)' }}>{ttData.vehicles} vehicle{ttData.vehicles !== 1 ? 's' : ''} installed</span>
                {ttData.fresh > 0 && <span style={{ color: '#22c55e' }}>{ttData.fresh} fresh (&lt;3yr)</span>}
                {ttData.aging > 0 && <span style={{ color: '#f97316' }}>{ttData.aging} aging (3yr+)</span>}
                {ttData.due > 0 && <span style={{ color: '#f59e0b' }}>{ttData.due} due in 90d</span>}
                {ttData.overdue > 0 && <span style={{ color: '#ef4444' }}>{ttData.overdue} overdue</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
