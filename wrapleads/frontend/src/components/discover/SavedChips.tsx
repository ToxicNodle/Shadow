import { useSavedSearches } from '../../hooks/useSavedSearches';
import { useCarrierSearch } from '../../hooks/useCarriers';
import { useAppStore } from '../../store/useAppStore';
import type { CarrierSearchParams } from '../../api/types';

export default function SavedChips() {
  const { savedSearches, deleteSearch } = useSavedSearches();
  const searchMutation = useCarrierSearch();
  const { setCarrierOffset } = useAppStore((s) => ({
    setCarrierOffset: s.setCarrierOffset,
  }));

  if (savedSearches.length === 0) return null;

  function loadSearch(filters: CarrierSearchParams) {
    setCarrierOffset(0);
    searchMutation.mutate({ ...filters, limit: 25, offset: 0 });
  }

  return (
    <div className="saved-chips-row">
      <span className="saved-chips-label">Saved:</span>
      {savedSearches.map((s) => (
        <span key={s.id} className="saved-chip">
          <span onClick={() => loadSearch(s.filters)}>{s.name}</span>
          {s.new_count > 0 && <span className="chip-new">+{s.new_count}</span>}
          <button
            className="chip-del"
            title="Delete"
            onClick={(e) => { e.stopPropagation(); deleteSearch(s.id); }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
