import { useSavedSearches } from '../../hooks/useSavedSearches';
import { useCarrierSearch } from '../../hooks/useCarriers';
import { useAppStore } from '../../store/useAppStore';
import type { CarrierSearchParams } from '../../api/types';

export default function SavedChips() {
  const { savedSearches, deleteSearch, toggleAlert } = useSavedSearches();
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
            title={s.alert_enabled ? 'Alert on — click to disable' : 'Get notified when new carriers match this search'}
            onClick={(e) => { e.stopPropagation(); toggleAlert(s.id); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
              fontSize: 11, color: s.alert_enabled ? '#f59e0b' : 'var(--text-faint)',
              lineHeight: 1, marginRight: -2,
            }}
          >
            🔔
          </button>
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
