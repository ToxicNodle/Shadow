import { useCarrierStats } from '../../hooks/useCarriers';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import FilterRow from './FilterRow';
import CarrierTable from './CarrierTable';
import SavedChips from './SavedChips';

export default function DiscoverPage() {
  const { data: stats } = useCarrierStats();
  const { selectedCarrierIds, clearSelectedCarrierIds, showToast } = useAppStore((s) => ({
    selectedCarrierIds: s.selectedCarrierIds,
    clearSelectedCarrierIds: s.clearSelectedCarrierIds,
    showToast: s.showToast,
  }));

  async function bulkImport() {
    const ids = Array.from(selectedCarrierIds);
    let success = 0;
    for (const id of ids) {
      try {
        await api.importCarrier(id);
        success++;
      } catch {
        // continue
      }
    }
    clearSelectedCarrierIds();
    showToast(`Imported ${success} of ${ids.length} carriers`);
  }

  return (
    <div style={{ padding: '20px 24px', flex: 1, overflow: 'auto' }}>
      <div className="discover-stats">
        <div className="discover-stat-card">
          <div className="discover-stat-value">{stats?.total?.toLocaleString() ?? '—'}</div>
          <div className="discover-stat-label">Total Carriers</div>
        </div>
        <div className="discover-stat-card">
          <div className="discover-stat-value">{stats?.sweet_spot?.toLocaleString() ?? '—'}</div>
          <div className="discover-stat-label">Sweet Spot (5–50 units)</div>
        </div>
        <div className="discover-stat-card">
          <div className="discover-stat-value">{stats?.states ?? '—'}</div>
          <div className="discover-stat-label">States</div>
        </div>
        <div className="discover-stat-card">
          <div className="discover-stat-value">{stats?.total_units?.toLocaleString() ?? '—'}</div>
          <div className="discover-stat-label">Total Units</div>
        </div>
      </div>

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
