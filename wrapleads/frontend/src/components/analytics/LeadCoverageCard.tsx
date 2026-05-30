import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

const SOURCE_LABELS: Record<string, string> = {
  fmcsa:         'FMCSA Motor Carriers',
  google_places: 'Google Places',
  sam_gov:       'SAM.gov Federal',
  news_signal:   'News Signal',
  sos_in:  'Indiana SOS',    sos_oh:  'Ohio SOS',
  sos_il:  'Illinois SOS',   sos_mi:  'Michigan SOS',
  sos_ky:  'Kentucky SOS',   sos_tn:  'Tennessee SOS',
  sos_tx:  'Texas SOS',      sos_ca:  'California SOS',
  sos_fl:  'Florida SOS',    sos_ga:  'Georgia SOS',
  sos_nc:  'North Carolina SOS', sos_pa: 'Pennsylvania SOS',
  sos_wa:  'Washington SOS', sos_co:  'Colorado SOS',
  sos_az:  'Arizona SOS',    sos_ny:  'New York SOS',
  sos_va:  'Virginia SOS',   sos_mo:  'Missouri SOS',
  seed:    'Curated Seed',
};

const SOURCE_COLORS: Record<string, string> = {
  fmcsa:         '#4d8af5',
  google_places: '#00d97e',
  sam_gov:       '#f4b942',
  news_signal:   '#e060d0',
  seed:          '#888',
};
const SOS_COLOR = '#f4551c';

function sourceColor(source: string) {
  if (SOURCE_COLORS[source]) return SOURCE_COLORS[source];
  if (source.startsWith('sos_')) return SOS_COLOR;
  return '#666';
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function relativeDate(iso: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ── US state grid (50 states) in a rough geographic arrangement ──────────────
// Row 0: WA OR ID MT ND MN ...  (Northwest to Midwest top row)
const STATE_GRID: { abbr: string; col: number; row: number }[] = [
  { abbr: 'WA', col: 1, row: 0 },  { abbr: 'OR', col: 1, row: 1 },
  { abbr: 'ID', col: 2, row: 0 },  { abbr: 'MT', col: 3, row: 0 },
  { abbr: 'WY', col: 3, row: 1 },  { abbr: 'NV', col: 2, row: 1 },
  { abbr: 'CA', col: 1, row: 2 },  { abbr: 'UT', col: 2, row: 2 },
  { abbr: 'CO', col: 3, row: 2 },  { abbr: 'AZ', col: 2, row: 3 },
  { abbr: 'NM', col: 3, row: 3 },  { abbr: 'ND', col: 4, row: 0 },
  { abbr: 'SD', col: 4, row: 1 },  { abbr: 'NE', col: 4, row: 2 },
  { abbr: 'KS', col: 4, row: 3 },  { abbr: 'TX', col: 4, row: 4 },
  { abbr: 'OK', col: 4, row: 4 },  { abbr: 'MN', col: 5, row: 0 },
  { abbr: 'IA', col: 5, row: 1 },  { abbr: 'MO', col: 5, row: 2 },
  { abbr: 'AR', col: 5, row: 3 },  { abbr: 'LA', col: 5, row: 4 },
  { abbr: 'WI', col: 6, row: 0 },  { abbr: 'IL', col: 6, row: 1 },
  { abbr: 'TN', col: 6, row: 2 },  { abbr: 'MS', col: 6, row: 3 },
  { abbr: 'MI', col: 7, row: 0 },  { abbr: 'IN', col: 7, row: 1 },
  { abbr: 'KY', col: 7, row: 2 },  { abbr: 'AL', col: 7, row: 3 },
  { abbr: 'OH', col: 8, row: 0 },  { abbr: 'WV', col: 8, row: 1 },
  { abbr: 'VA', col: 8, row: 2 },  { abbr: 'NC', col: 8, row: 3 },
  { abbr: 'SC', col: 8, row: 4 },  { abbr: 'GA', col: 8, row: 5 },
  { abbr: 'FL', col: 8, row: 6 },  { abbr: 'PA', col: 9, row: 0 },
  { abbr: 'MD', col: 9, row: 1 },  { abbr: 'DC', col: 9, row: 2 },
  { abbr: 'NY', col: 10, row: 0 }, { abbr: 'NJ', col: 10, row: 1 },
  { abbr: 'DE', col: 10, row: 2 }, { abbr: 'CT', col: 11, row: 1 },
  { abbr: 'RI', col: 11, row: 2 }, { abbr: 'MA', col: 11, row: 0 },
  { abbr: 'VT', col: 12, row: 0 }, { abbr: 'NH', col: 12, row: 1 },
  { abbr: 'ME', col: 12, row: 2 }, { abbr: 'AK', col: 0, row: 5 },
  { abbr: 'HI', col: 0, row: 6 },
];

export default function LeadCoverageCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['lead-coverage'],
    queryFn:  () => api.getLeadCoverage(),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="an-card" style={{ gridColumn: '1 / -1' }}>
        <div className="an-card-title">Lead Database Coverage</div>
        <div className="an-loading-line" style={{ width: '60%', marginTop: 16 }} />
      </div>
    );
  }

  if (!data?.ok) return null;

  const { grandTotal, sources, states, recentRuns } = data;

  // Build a lookup: state abbr → total
  const stateMap = new Map(states.map(s => [s.state, s.total]));
  const maxState = Math.max(...states.map(s => s.total), 1);

  // Bucket intensity 0-4
  function intensity(abbr: string): number {
    const t = stateMap.get(abbr) ?? 0;
    if (t === 0) return 0;
    if (t < 5_000) return 1;
    if (t < 25_000) return 2;
    if (t < 100_000) return 3;
    return 4;
  }

  const INTENSITY_COLORS = ['#1a1a2a', '#2a2048', '#3d3570', '#5545a0', '#f4551c'];
  const INTENSITY_LABELS = ['No data', '< 5K', '5K–25K', '25K–100K', '100K+'];

  // Grid dimensions
  const CELL = 28;
  const cols = 13;
  const rows = 7;

  return (
    <div className="an-card" style={{ gridColumn: '1 / -1' }}>
      <div className="an-card-title">Lead Database Coverage</div>

      {/* Hero strip */}
      <div style={{ display: 'flex', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-1.5px', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
            {fmt(grandTotal)}
          </div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-faint)' }}>
            total businesses in database
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {sources.slice(0, 6).map(s => (
            <div key={s.source}>
              <div style={{ fontSize: 24, fontWeight: 700, color: sourceColor(s.source), fontFamily: 'JetBrains Mono, monospace' }}>
                {fmt(s.total)}
              </div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)' }}>
                {SOURCE_LABELS[s.source] ?? s.source}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'start' }}>
        {/* ── State heatmap ── */}
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-faint)', marginBottom: 8 }}>
            Coverage by State
          </div>
          <svg
            width={cols * CELL}
            height={rows * CELL}
            style={{ display: 'block' }}
          >
            {STATE_GRID.map(({ abbr, col, row }) => {
              const x   = col * CELL;
              const y   = row * CELL;
              const lvl = intensity(abbr);
              const bg  = INTENSITY_COLORS[lvl];
              const cnt = stateMap.get(abbr) ?? 0;
              return (
                <g key={abbr}>
                  <rect
                    x={x + 1} y={y + 1}
                    width={CELL - 2} height={CELL - 2}
                    rx={3}
                    fill={bg}
                    stroke={lvl > 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'}
                    strokeWidth={1}
                  />
                  <text
                    x={x + CELL / 2} y={y + CELL / 2 - 1}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={8}
                    fontWeight={lvl > 0 ? 700 : 400}
                    fill={lvl > 1 ? '#fff' : 'rgba(255,255,255,0.4)'}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {abbr}
                  </text>
                  {cnt > 0 && (
                    <text
                      x={x + CELL / 2} y={y + CELL / 2 + 8}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={6}
                      fill={lvl > 1 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)'}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {fmt(cnt)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
            {INTENSITY_COLORS.map((color, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color, border: '1px solid rgba(255,255,255,0.1)' }} />
                <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{INTENSITY_LABELS[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Source breakdown + recent runs ── */}
        <div style={{ minWidth: 280 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-faint)', marginBottom: 8 }}>
            Sources
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {sources.map(s => {
              const pct = Math.round((s.total / grandTotal) * 100);
              return (
                <div key={s.source}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {SOURCE_LABELS[s.source] ?? s.source}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-faint)' }}>
                      {fmt(s.total)} · {s.stateCount} states · {relativeDate(s.lastUpdated)}
                    </span>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: sourceColor(s.source), borderRadius: 2, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent ingest runs */}
          {recentRuns.length > 0 && (
            <>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-faint)', marginBottom: 8 }}>
                Recent Ingest Runs
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recentRuns.slice(0, 8).map((run, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {SOURCE_LABELS[run.source] ?? run.source}
                      </span>
                      {run.fileName && run.fileName.includes('@') && (
                        <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 6 }}>
                          {run.fileName.split('@')[1]}
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {run.inserted != null && (
                        <span style={{ fontSize: 9, color: '#00d97e', fontFamily: 'JetBrains Mono, monospace' }}>
                          +{fmt(run.inserted)}
                        </span>
                      )}
                      <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 8 }}>
                        {relativeDate(run.startedAt)}
                      </span>
                      {!run.finishedAt && (
                        <span style={{ fontSize: 9, color: '#f4b942', marginLeft: 6 }}>running</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top states table */}
      {states.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-faint)', marginBottom: 8 }}>
            Top States by Coverage
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
            {states.slice(0, 20).map(s => (
              <div key={s.state} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'rgba(255,255,255,0.025)', borderRadius: 4 }}>
                <div style={{ width: 28, height: 18, background: 'rgba(255,255,255,0.06)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{s.state}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>{fmt(s.total)}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>
                      {[s.fmcsa > 0 && 'FMCSA', s.sos > 0 && 'SOS', s.places > 0 && 'Places', s.sam > 0 && 'SAM'].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, marginTop: 2 }}>
                    <div style={{ height: '100%', width: `${Math.round((s.total / maxState) * 100)}%`, background: 'var(--accent)', borderRadius: 1 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
