import { useState } from 'react';
import { useCarrierSearch } from '../../hooks/useCarriers';
import { useSavedSearches } from '../../hooks/useSavedSearches';
import { useAppStore } from '../../store/useAppStore';
import type { CarrierSearchParams, SavedSearch } from '../../api/types';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

export default function FilterRow() {
  const searchMutation = useCarrierSearch();
  const { createSearch } = useSavedSearches();
  const { setCarrierOffset } = useAppStore((s) => ({
    setCarrierOffset: s.setCarrierOffset,
  }));

  const [states, setStates] = useState<string[]>([]);
  const [minFleet, setMinFleet] = useState('');
  const [maxFleet, setMaxFleet] = useState('');
  const [query, setQuery] = useState('');
  const [savePrompt, setSavePrompt] = useState(false);
  const [saveName, setSaveName] = useState('');

  function buildSearchParams(): CarrierSearchParams {
    return {
      states: states.length ? states : null,
      minFleet: minFleet ? Number(minFleet) : null,
      maxFleet: maxFleet ? Number(maxFleet) : null,
      query: query || undefined,
      limit: 25,
      offset: 0,
    };
  }

  function buildSaveFilters(): SavedSearch['filters'] {
    return {
      states: states.length ? states : undefined,
      minFleet: minFleet ? Number(minFleet) : null,
      maxFleet: maxFleet ? Number(maxFleet) : null,
      query: query || undefined,
    };
  }

  function runSearch() {
    setCarrierOffset(0);
    searchMutation.mutate(buildSearchParams());
  }

  function handleSave() {
    if (!saveName.trim()) return;
    createSearch({ name: saveName.trim(), filters: buildSaveFilters() });
    setSavePrompt(false);
    setSaveName('');
  }

  function toggleState(s: string) {
    setStates((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  return (
    <div>
      <div className="filter-row">
        <div className="field-group">
          <label className="field-label">State(s)</label>
          <select
            className="select"
            value=""
            onChange={(e) => { if (e.target.value) toggleState(e.target.value); }}
          >
            <option value="">Add state…</option>
            {US_STATES.filter((s) => !states.includes(s)).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Min Fleet</label>
          <input
            className="input"
            type="number"
            value={minFleet}
            onChange={(e) => setMinFleet(e.target.value)}
            placeholder="5"
          />
        </div>
        <div className="field-group">
          <label className="field-label">Max Fleet</label>
          <input
            className="input"
            type="number"
            value={maxFleet}
            onChange={(e) => setMaxFleet(e.target.value)}
            placeholder="50"
          />
        </div>
        <div className="field-group">
          <label className="field-label">Search</label>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="Company name, city…"
          />
        </div>
        <div className="field-group" style={{ gridColumn: 'span 1' }}>
          <label className="field-label">&nbsp;</label>
          <button className="btn btn-primary" onClick={runSearch} disabled={searchMutation.isPending}>
            {searchMutation.isPending ? <><span className="spinner" /> Searching…</> : 'Search'}
          </button>
        </div>
        <div className="field-group">
          <label className="field-label">&nbsp;</label>
          <button className="btn" onClick={() => setSavePrompt((v) => !v)} title="Save this search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save
          </button>
        </div>
      </div>

      {states.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {states.map((s) => (
            <span key={s} className="saved-chip">
              {s}
              <button className="chip-del" onClick={() => toggleState(s)}>×</button>
            </span>
          ))}
        </div>
      )}

      {savePrompt && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Search name…"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
            style={{ maxWidth: 240 }}
          />
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
          <button className="btn" onClick={() => setSavePrompt(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
