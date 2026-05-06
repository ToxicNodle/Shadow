import { useAppStore } from '../../store/useAppStore';
import { useCarrierSearch } from '../../hooks/useCarriers';
import CarrierRow from './CarrierRow';

export default function CarrierTable() {
  const { carrierState, selectedCarrierIds, selectAllCarrierIds, clearSelectedCarrierIds, setCarrierOffset } = useAppStore((s) => ({
    carrierState: s.carrierState,
    selectedCarrierIds: s.selectedCarrierIds,
    selectAllCarrierIds: s.selectAllCarrierIds,
    clearSelectedCarrierIds: s.clearSelectedCarrierIds,
    setCarrierOffset: s.setCarrierOffset,
  }));
  const searchMutation = useCarrierSearch();

  const { results, total, offset, limit, loading, lastQuery } = carrierState;

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const allChecked = results.length > 0 && results.every((c) => selectedCarrierIds.has(c.id));

  function toggleAll() {
    if (allChecked) clearSelectedCarrierIds();
    else selectAllCarrierIds(results.map((c) => c.id));
  }

  function goPage(page: number) {
    const newOffset = (page - 1) * limit;
    setCarrierOffset(newOffset);
    if (lastQuery) {
      searchMutation.mutate({ ...lastQuery, offset: newOffset, limit });
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <span className="spinner spinner-lg" />
        <span>Searching carriers…</span>
      </div>
    );
  }

  if (results.length === 0 && !loading) {
    return (
      <div className="discover-empty">
        <div className="big">Run a search to find carriers</div>
        <p>Filter by state, fleet size, or company name above.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="carrier-row header">
        <input type="checkbox" className="carrier-cb" checked={allChecked} onChange={toggleAll} />
        <span>Carrier</span>
        <span>Fleet</span>
        <span>Location</span>
        <span>Phone</span>
        <span>Action</span>
      </div>

      {results.map((carrier) => (
        <CarrierRow
          key={carrier.id}
          carrier={carrier}
          checked={selectedCarrierIds.has(carrier.id)}
        />
      ))}

      {totalPages > 1 && (
        <div className="carrier-pagination">
          <button
            className="btn btn-icon"
            onClick={() => goPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="page-info">
            {currentPage} / {totalPages} ({total.toLocaleString()} total)
          </span>
          <button
            className="btn btn-icon"
            onClick={() => goPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
