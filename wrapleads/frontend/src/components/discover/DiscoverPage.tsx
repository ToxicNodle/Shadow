import { useQuery } from '@tanstack/react-query';
import { useCarrierStats, useCarrierSearch } from '../../hooks/useCarriers';
import { useAppStore } from '../../store/useAppStore';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import FilterRow from './FilterRow';
import CarrierTable from './CarrierTable';
import SavedChips from './SavedChips';

const CAT_LABEL: Record<string, string> = {
  fleet: 'Fleet Wraps', dinoc: 'DI-NOC', gc_referral: 'GC Referrals',
  construction: 'Construction', colorchange: 'Color Change', racing: 'Racing',
  reatec: 'Reatec', design: 'Design', wallgraphics: 'Wall Graphics',
};

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
  const { selectedCarrierIds, clearSelectedCarrierIds, showToast, setMode } = useAppStore((s) => ({
    selectedCarrierIds: s.selectedCarrierIds,
    clearSelectedCarrierIds: s.clearSelectedCarrierIds,
    showToast: s.showToast,
    setMode: s.setMode,
  }));

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

      <SavedChips />
      <FilterRow />

      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <CarrierTable />
      </div>

      {selectedCarrierIds.size > 0 && (
        <div className="bulk-action-bar">
          <span><span className="bulk-count">{selectedCarrierIds.size}</span> selected</span>
          <button className="btn btn-primary" onClick={bulkImport}>
            Import Selected
          </button>
          <button className="btn" onClick={clearSelectedCarrierIds}>Clear</button>
        </div>
      )}
    </div>
  );
}
