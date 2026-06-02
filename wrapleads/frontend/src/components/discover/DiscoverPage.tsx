import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useCarrierStats, useCarrierSearch } from '../../hooks/useCarriers';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import FilterRow from './FilterRow';
import CarrierTable from './CarrierTable';
import SavedChips from './SavedChips';
import DiscoverMapView from './DiscoverMapView';
import DataSourcesPanel from './DataSourcesPanel';

const CAT_LABEL: Record<string, string> = {
  fleet: 'Fleet Wraps', dinoc: 'DI-NOC', gc_referral: 'GC Referrals',
  construction: 'Construction', colorchange: 'Color Change', racing: 'Racing',
  reatec: 'Reatec', design: 'Design', wallgraphics: 'Wall Graphics',
};

// ── Search Intelligence Strip ─────────────────────────────────────────────────

function SearchIntelStrip() {
  const results = useAppStore((s) => s.carrierState.results);
  const total   = useAppStore((s) => s.carrierState.total);

  if (results.length === 0) return null;

  const withFleet   = results.filter((c) => c.fleet_size);
  const avgFleet    = withFleet.length
    ? Math.round(withFleet.reduce((s, c) => s + (c.fleet_size ?? 0), 0) / withFleet.length)
    : null;
  const avgScore    = Math.round(results.reduce((s, c) => s + c.wrap_score, 0) / results.length);
  const hotCount    = results.filter((c) => c.wrap_score >= 70).length;
  const contactable = results.filter((c) => c.phone).length;
  const contactPct  = Math.round((contactable / results.length) * 100);
  const newLeads    = results.filter((c) => !c.already_imported);
  const estOpportunity = newLeads.reduce((s, c) => s + (c.fleet_size ?? 30) * 150, 0);

  const fmtK = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1_000)}K`;

  const chips: { label: string; value: string; accent?: string }[] = [
    { label: 'in region', value: total.toLocaleString() },
    ...(avgFleet !== null ? [{ label: 'avg fleet', value: `${avgFleet} units` }] : []),
    { label: 'avg score', value: `${avgScore}/100` },
    { label: 'hot leads', value: String(hotCount), accent: hotCount > 0 ? '#22c55e' : undefined },
    { label: 'contactable', value: `${contactPct}%`, accent: contactPct >= 50 ? '#10b981' : undefined },
    { label: 'est. opportunity', value: fmtK(estOpportunity), accent: 'var(--accent)' },
  ];

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      padding: '10px 14px', background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 10,
      margin: '0 0 12px',
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginRight: 4 }}>
        Results
      </span>
      {chips.map((chip) => (
        <div key={chip.label} style={{
          display: 'flex', alignItems: 'baseline', gap: 4,
          background: 'rgba(255,255,255,0.04)', borderRadius: 6,
          padding: '3px 9px', border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: chip.accent ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {chip.value}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{chip.label}</span>
        </div>
      ))}
      {newLeads.length < results.length && (
        <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 2 }}>
          · {results.length - newLeads.length} already in CRM
        </span>
      )}
    </div>
  );
}

function ICPBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ['icp'],
    queryFn: () => api.getICP(),
    staleTime: 10 * 60_000,
  });
  const searchMutation = useCarrierSearch();

  if (isLoading || !data?.hasData) return null;

  const { wonCount, topCategory, topState, fleetRange, categoryBreakdown } = data;

  function loadICP() {
    searchMutation.mutate({
      states: topState ? [topState] : null,
      minFleet: fleetRange?.min ?? 25,
      maxFleet: fleetRange?.max ?? 500,
      limit: 50,
    });
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #10b98108, #22c55e08)',
      border: '1px solid #10b98130',
      borderRadius: 12,
      padding: '14px 18px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 auto', minWidth: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: '#10b98118',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Your Ideal Customer Profile — based on {wonCount} won deal{wonCount !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {topCategory && (
              <span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Top vertical:</span> {CAT_LABEL[topCategory] ?? topCategory}
              </span>
            )}
            {topState && (
              <span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Best state:</span> {topState}
              </span>
            )}
            {fleetRange && (
              <span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Fleet sweet spot:</span> {fleetRange.min}–{fleetRange.max} units
              </span>
            )}
            {categoryBreakdown.length > 1 && (
              <span style={{ color: 'var(--text-faint)' }}>
                · {categoryBreakdown.map((c) => `${CAT_LABEL[c.cat] ?? c.cat} ${c.pct}%`).join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={loadICP}
        disabled={searchMutation.isPending}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 700,
          padding: '8px 16px', borderRadius: 8,
          border: '1px solid #10b98140',
          background: '#10b98110', color: '#10b981',
          cursor: searchMutation.isPending ? 'default' : 'pointer',
          flexShrink: 0, whiteSpace: 'nowrap',
        }}
      >
        {searchMutation.isPending ? (
          <>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #10b981', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
            Searching…
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Find More Like These →
          </>
        )}
      </button>
    </div>
  );
}

export default function DiscoverPage() {
  const { data: stats, isLoading: statsLoading } = useCarrierStats();
  const qc = useQueryClient();
  const { selectedCarrierIds, clearSelectedCarrierIds, showToast, setMode, pendingDiscoverSearch, setPendingDiscoverSearch, setTruckScanOpen } = useAppStore((s) => ({
    selectedCarrierIds: s.selectedCarrierIds,
    clearSelectedCarrierIds: s.clearSelectedCarrierIds,
    showToast: s.showToast,
    setMode: s.setMode,
    pendingDiscoverSearch: s.pendingDiscoverSearch,
    setPendingDiscoverSearch: s.setPendingDiscoverSearch,
    setTruckScanOpen: s.setTruckScanOpen,
  }));
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'map' | 'sources'>('table');
  const pendingSearch = useCarrierSearch();

  useEffect(() => {
    if (pendingDiscoverSearch) {
      pendingSearch.mutate(pendingDiscoverSearch);
      setPendingDiscoverSearch(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bulkImport() {
    const ids = Array.from(selectedCarrierIds);
    let success = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await api.importCarrier(id);
        success++;
      } catch {
        failed++;
      }
    }
    clearSelectedCarrierIds();
    qc.invalidateQueries({ queryKey: ['leads'] });
    const msg = failed > 0
      ? `${success} added · ${failed} already in your CRM`
      : `${success} carrier${success !== 1 ? 's' : ''} added to My Leads`;
    showToast(msg);
    if (success > 0) setMode('leads');
  }

  async function importAndLaunchCampaign() {
    const ids = Array.from(selectedCarrierIds);
    setCampaignLoading(true);
    const leadIds: number[] = [];
    for (const id of ids) {
      try {
        const result = await api.importCarrier(id);
        if (result.leadId) leadIds.push(result.leadId);
      } catch { /* skip duplicates */ }
    }
    if (leadIds.length > 0) {
      try {
        await api.bulkActivateSequences(leadIds);
      } catch { /* sequences are optional */ }
    }
    clearSelectedCarrierIds();
    qc.invalidateQueries({ queryKey: ['leads'] });
    setCampaignLoading(false);
    showToast(`${leadIds.length} carrier${leadIds.length !== 1 ? 's' : ''} imported · AI sequences launched`);
    if (leadIds.length > 0) setMode('mission');
  }

  return (
    <div style={{ padding: '20px 24px', flex: 1, overflow: 'auto' }}>
      <div className="discover-stats">
        <div className="discover-stat-card">
          {statsLoading
            ? <div className="skeleton" style={{ height: 28, width: 80, marginBottom: 6 }} />
            : <div className="discover-stat-value">{stats?.total?.toLocaleString() ?? '—'}</div>}
          <div className="discover-stat-label">Total Carriers</div>
        </div>
        <div className="discover-stat-card">
          {statsLoading
            ? <div className="skeleton" style={{ height: 28, width: 64, marginBottom: 6 }} />
            : <div className="discover-stat-value">{stats?.sweet_spot?.toLocaleString() ?? '—'}</div>}
          <div className="discover-stat-label">Sweet Spot (25–500 units)</div>
        </div>
        <div className="discover-stat-card">
          {statsLoading
            ? <div className="skeleton" style={{ height: 28, width: 36, marginBottom: 6 }} />
            : <div className="discover-stat-value">{stats?.states ?? '—'}</div>}
          <div className="discover-stat-label">States</div>
        </div>
        <div className="discover-stat-card">
          {statsLoading
            ? <div className="skeleton" style={{ height: 28, width: 72, marginBottom: 6 }} />
            : <div className="discover-stat-value">{stats?.total_units?.toLocaleString() ?? '—'}</div>}
          <div className="discover-stat-label">Total Units</div>
        </div>
      </div>

      {/* ICP Banner — shows when user has won deals */}
      <ICPBanner />

      <SearchIntelStrip />

      <SavedChips />
      <FilterRow />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
        <button
          onClick={() => setTruckScanOpen(true)}
          style={{
            fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid rgba(77,138,245,0.35)',
            background: 'rgba(77,138,245,0.08)',
            color: '#4d8af5',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          title="Photograph any truck — AI extracts company name + DOT and imports to CRM"
        >
          🚛 Scan Truck
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['table', '≡ Table'], ['map', '⊞ Map'], ['sources', '⬡ Sources']] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${viewMode === mode ? 'var(--accent)' : 'var(--border)'}`,
                background: viewMode === mode ? 'var(--accent)18' : 'transparent',
                color: viewMode === mode ? 'var(--accent)' : 'var(--text-faint)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'table' ? (
        <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <CarrierTable />
        </div>
      ) : viewMode === 'map' ? (
        <DiscoverMapView />
      ) : (
        <DataSourcesPanel />
      )}

      {selectedCarrierIds.size > 0 && (
        <div className="bulk-action-bar">
          <span><span className="bulk-count">{selectedCarrierIds.size}</span> selected</span>
          <button
            className="btn btn-primary"
            onClick={importAndLaunchCampaign}
            disabled={campaignLoading}
            title="Import carriers and immediately start AI email sequences — lands on Mission so you can watch them run"
            style={{ background: 'linear-gradient(135deg, #10b981, #6366f1)', border: 'none', position: 'relative' }}
          >
            {campaignLoading ? (
              <><span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> Launching…</>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}>
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Import & Launch Sequences
              </>
            )}
          </button>
          <button className="btn btn-primary" onClick={bulkImport} disabled={campaignLoading} style={{ opacity: campaignLoading ? 0.5 : 1 }}>
            Import Only
          </button>
          <button className="btn" onClick={clearSelectedCarrierIds} disabled={campaignLoading}>Clear</button>
        </div>
      )}

    </div>
  );
}
