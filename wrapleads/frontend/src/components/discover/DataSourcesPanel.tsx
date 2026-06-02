import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

const SOURCE_DEFS: Array<{
  key: string;
  label: string;
  icon: string;
  tier: 'free' | 'api_key' | 'manual';
  tierLabel: string;
  description: string;
  howTo: string;
  docUrl?: string;
  envVar?: string;
}> = [
  {
    key: 'fmcsa',
    label: 'FMCSA Motor Carriers',
    icon: '🚛',
    tier: 'manual',
    tierLabel: 'One-time CSV import',
    description: '600K+ US interstate motor carriers. Best source for fleet wraps — includes DOT number, fleet size, carrier type, and last inspection data. The FMCSA wrap-score algorithm ranks carriers by wrap opportunity.',
    howTo: 'Download the Motor Carrier Census from FMCSA.dot.gov, then run: npm run ingest:fmcsa -- /path/to/census.csv',
    docUrl: 'https://www.fmcsa.dot.gov/registration/mc-registration/download-active-carrier-data',
  },
  {
    key: 'yelp',
    label: 'Yelp Fusion',
    icon: '🍽️',
    tier: 'api_key',
    tierLabel: 'Free (500 searches/day)',
    description: 'Local service businesses — HVAC, plumbing, electrical, landscaping, pest control, moving, food trucks. These businesses FMCSA misses entirely because they don\'t cross state lines. Best source for small-fleet local wraps.',
    howTo: 'Get a free API key at yelp.com/developers. Set YELP_API_KEY in Railway environment variables, then run: npm run ingest:yelp',
    envVar: 'YELP_API_KEY',
    docUrl: 'https://www.yelp.com/developers/v3/manage_app',
  },
  {
    key: 'google_places',
    label: 'Google Places',
    icon: '📍',
    tier: 'api_key',
    tierLabel: '$200/mo free credit',
    description: 'Local businesses with ratings, addresses, phone numbers, and websites. Great complement to Yelp — different data, different coverage. Use the national sweep script to automatically cover 30 metros.',
    howTo: 'Enable Places API in Google Cloud Console. Set GOOGLE_PLACES_API_KEY in Railway variables, then run: npm run ingest:sweep',
    envVar: 'GOOGLE_PLACES_API_KEY',
    docUrl: 'https://console.cloud.google.com/apis/library/places.googleapis.com',
  },
  {
    key: 'sam_gov',
    label: 'SAM.gov Federal Contractors',
    icon: '🏛️',
    tier: 'api_key',
    tierLabel: 'Free API key required',
    description: 'Active federal government contractors — trucking, construction, facility services, equipment rental. These companies have government contracts = financially stable, often have branded fleets. Weekly auto-refresh when configured.',
    howTo: 'Get a free API key at open.gsa.gov/api/entity-api. Set SAM_API_KEY in Railway variables — the server auto-refreshes every Sunday at 4AM.',
    envVar: 'SAM_API_KEY',
    docUrl: 'https://open.gsa.gov/api/entity-api/',
  },
  {
    key: 'news_signal',
    label: 'News Signal (Auto)',
    icon: '📡',
    tier: 'free',
    tierLabel: 'Automatic (runs every 6h)',
    description: 'Leads auto-created from press releases and news about fleet expansions, new contracts, new facilities. Runs in the background every 6 hours. No setup required — leads appear in My Leads with source "news_signal" and an AI-generated pitch angle.',
    howTo: 'Already running. Check Mission view → Signal Alerts card for recent leads.',
  },
  {
    key: 'sos_in',
    label: 'Secretary of State Registries',
    icon: '📋',
    tier: 'manual',
    tierLabel: '18 states supported',
    description: 'Business entity registrations from state SOS portals. 18 states supported: IN, OH, IL, MI, KY, TN, TX, CA, FL, GA, NC, PA, WA, CO, AZ, NY, VA, MO. Each state\'s CSV portal has different column names — handled automatically.',
    howTo: 'Download bulk CSV from your target state\'s SOS portal. Run: npm run ingest:sos <state> <file.csv>. Example: npm run ingest:sos texas tx-businesses.csv',
  },
];

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

const TIER_COLORS: Record<string, string> = {
  free: '#00d97e',
  api_key: '#4d8af5',
  manual: '#f4b942',
};

export default function DataSourcesPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['lead-coverage'],
    queryFn: () => api.getLeadCoverage(),
    staleTime: 5 * 60_000,
  });

  // Build source → total map (SOS sources roll up into one)
  const sourceTotals = new Map<string, number>();
  if (data?.sources) {
    for (const s of data.sources) {
      if (s.source.startsWith('sos_')) {
        sourceTotals.set('sos_in', (sourceTotals.get('sos_in') ?? 0) + s.total);
      } else {
        sourceTotals.set(s.source, s.total);
      }
    }
  }

  const grandTotal = data?.grandTotal ?? 0;

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Grand total strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20,
        padding: '14px 16px', background: 'rgba(244,85,28,0.06)',
        border: '1px solid rgba(244,85,28,0.15)', borderRadius: 10,
      }}>
        <div>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-1.5px', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
            {isLoading ? '…' : fmt(grandTotal)}
          </div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-faint)' }}>
            total businesses in database
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 520 }}>
          This is your lead pool — every business you can discover and import. Add more sources below to expand your coverage.
        </div>
      </div>

      {/* Source cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SOURCE_DEFS.map(src => {
          const count = sourceTotals.get(src.key) ?? 0;
          const hasData = count > 0;
          const isSos = src.key === 'sos_in';
          const isAutomatic = src.tier === 'free';

          return (
            <div
              key={src.key}
              style={{
                padding: '14px 16px',
                background: 'var(--bg-elev)',
                border: `1px solid ${hasData ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
                borderLeft: `3px solid ${hasData ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 8,
                opacity: hasData ? 1 : 0.75,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                {/* Left: title + description */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>{src.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{src.label}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      background: TIER_COLORS[src.tier] + '20',
                      color: TIER_COLORS[src.tier],
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                    }}>
                      {src.tierLabel}
                    </span>
                    {isAutomatic && hasData && (
                      <span style={{ fontSize: 9, color: '#00d97e', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00d97e', display: 'inline-block' }} />
                        Live
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10, maxWidth: 580 }}>
                    {src.description}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--text-faint)',
                    background: 'rgba(0,0,0,0.2)', borderRadius: 5,
                    padding: '6px 10px', fontFamily: 'JetBrains Mono, monospace',
                    borderLeft: '2px solid rgba(255,255,255,0.08)',
                  }}>
                    {src.howTo}
                  </div>
                  {src.docUrl && (
                    <div style={{ marginTop: 6 }}>
                      <a
                        href={src.docUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 11, color: '#4d8af5', textDecoration: 'none' }}
                      >
                        → Documentation / Get API key
                      </a>
                    </div>
                  )}
                  {src.envVar && (
                    <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-faint)' }}>
                      Required env var:{' '}
                      <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 3 }}>
                        {src.envVar}
                      </code>
                    </div>
                  )}
                </div>

                {/* Right: count */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {isLoading ? (
                    <div className="skeleton" style={{ width: 60, height: 28, borderRadius: 4 }} />
                  ) : hasData ? (
                    <>
                      <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-1px' }}>
                        {fmt(count)}
                      </div>
                      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)' }}>
                        {isSos ? 'sos registrations' : 'businesses'}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>No data yet</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent ingest runs */}
      {data?.recentRuns && data.recentRuns.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-faint)', marginBottom: 8 }}>
            Recent Ingest Activity
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {data.recentRuns.slice(0, 10).map((run, i) => {
              const elapsed = run.finishedAt
                ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
                : null;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {run.source}
                    </span>
                    {run.fileName && run.fileName.includes('@') && (
                      <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                        {run.fileName.split('@')[1]}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {run.inserted != null && run.inserted > 0 && (
                      <span style={{ fontSize: 10, color: '#00d97e', fontFamily: 'JetBrains Mono, monospace' }}>
                        +{fmt(run.inserted)}
                      </span>
                    )}
                    {elapsed != null && (
                      <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                        {elapsed < 60 ? `${elapsed}s` : `${Math.round(elapsed / 60)}m`}
                      </span>
                    )}
                    {!run.finishedAt && (
                      <span style={{ fontSize: 10, color: '#f4b942' }}>running…</span>
                    )}
                    {run.notes && (
                      <span style={{ fontSize: 10, color: '#f87171' }} title={run.notes}>⚠ error</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
