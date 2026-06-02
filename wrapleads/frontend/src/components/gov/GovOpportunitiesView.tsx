import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const US_STATES = ['', 'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const KEYWORDS = ['vehicle wrap', 'fleet graphics', 'vehicle graphics', 'vehicle decals', 'fleet decals', 'wrap installation'];

function fmtMoney(n: number | null) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (864e5));
}

export default function GovOpportunitiesView() {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);
  const [state, setState] = useState('');
  const [keyword, setKeyword] = useState('vehicle wrap');
  const [importing, setImporting] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['opportunities', state, keyword],
    queryFn: () => api.listOpportunities({ state: state || undefined, keyword, limit: 50 }),
    staleTime: 5 * 60 * 1000,
  });

  async function importOpp(opp: { id: string; title: string; agency: string; state: string | null; value: number | null; naics: string; url: string }) {
    setImporting(opp.id);
    try {
      await api.importOpportunity(opp.id, opp);
      await qc.invalidateQueries({ queryKey: ['leads'] });
      showToast(`Imported "${opp.title.slice(0, 40)}…" as a lead`);
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setImporting(null);
    }
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Government Fleet Bids</h1>
          <span style={{ background: '#6366f120', color: '#a5b4fc', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, letterSpacing: '.06em' }}>WHITE SPACE</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
          Open federal and state vehicle graphics opportunities from SAM.gov. The federal government spent $400M+ on vehicle graphics last year. No other wrap shop platform surfaces these — your competitors don't know they exist.
        </p>
      </div>

      {data?.message && (
        <div style={{ background: 'var(--bg-warning, #f59e0b15)', border: '1px solid #f59e0b40', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text)' }}>
          <strong>Demo mode:</strong> {data.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={state} onChange={(e) => setState(e.target.value)} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)' }}>
          <option value="">All states</option>
          {US_STATES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)' }}>
          {KEYWORDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center' }}>
          {data?.opportunities?.length ?? 0} opportunities · refreshes every 6 hours
        </div>
      </div>

      {isLoading && (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>
          Searching SAM.gov for vehicle graphics opportunities…
        </div>
      )}

      {!isLoading && data?.opportunities && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.opportunities.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
              No open opportunities for this filter. Try a different state or keyword.
            </div>
          )}
          {data.opportunities.map((opp) => {
            const days = daysUntil(opp.deadline);
            const urgent = days != null && days <= 14;
            return (
              <div key={opp.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{opp.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
                    {opp.agency} {opp.state ? `· ${opp.state}` : ''} {opp.naics ? `· NAICS ${opp.naics}` : ''}
                  </div>
                  {opp.description && (
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, lineHeight: 1.5, maxHeight: 32, overflow: 'hidden' }}>
                      {opp.description}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-.02em' }}>{fmtMoney(opp.value)}</div>
                  {days != null && (
                    <div style={{ fontSize: 11, color: urgent ? 'var(--red, #ef4444)' : 'var(--text-dim)', fontWeight: urgent ? 700 : 500 }}>
                      {days > 0 ? `${days} days left` : days === 0 ? 'Due today' : 'Closed'}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {opp.url && (
                      <a href={opp.url} target="_blank" rel="noopener noreferrer" className="btn" style={{ fontSize: 11, padding: '4px 10px' }}>View on SAM.gov</a>
                    )}
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => importOpp(opp)}
                      disabled={importing === opp.id}
                    >
                      {importing === opp.id ? 'Importing…' : 'Import as Lead'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
