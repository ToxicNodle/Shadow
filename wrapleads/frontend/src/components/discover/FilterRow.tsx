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

const INDUSTRY_OPTIONS = [
  { value: 'freight',            label: 'Freight / For-Hire' },
  { value: 'trucking',           label: 'Trucking (general)' },
  { value: 'refrigerated',       label: 'Refrigerated' },
  { value: 'moving',             label: 'Moving / Household' },
  { value: 'construction_fleet', label: 'Construction Fleet' },
  { value: 'auto_transport',     label: 'Auto Transport' },
  { value: 'agricultural',       label: 'Agricultural' },
  { value: 'passenger',          label: 'Passenger / Bus' },
  { value: 'construction_general', label: 'GC / Contractors (SOS)' },
  { value: 'design_general',     label: 'Design / Architects (SOS)' },
  { value: 'trucking_general',   label: 'Logistics (SOS)' },
  { value: 'general',            label: 'General Business (SOS)' },
];

export default function FilterRow() {
  const searchMutation = useCarrierSearch();
  const { createSearch } = useSavedSearches();
  const { setCarrierOffset } = useAppStore((s) => ({
    setCarrierOffset: s.setCarrierOffset,
  }));

  const [states, setStates] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [minFleet, setMinFleet] = useState('');
  const [maxFleet, setMaxFleet] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('wrap_score');
  const [onlyWithPhone, setOnlyWithPhone] = useState(false);
  const [savePrompt, setSavePrompt] = useState(false);
  const [saveName, setSaveName] = useState('');

  function buildSearchParams(): CarrierSearchParams {
    return {
      states:       states.length ? states : null,
      industries:   industries.length ? industries : null,
      minFleet:     minFleet ? Number(minFleet) : null,
      maxFleet:     maxFleet ? Number(maxFleet) : null,
      query:        query || undefined,
      sort,
      onlyWithPhone: onlyWithPhone || undefined,
      limit:        25,
      offset:       0,
    };
  }

  function buildSaveFilters(): SavedSearch['filters'] {
    return {
      states:     states.length ? states : undefined,
      industries: industries.length ? industries : undefined,
      minFleet:   minFleet ? Number(minFleet) : null,
      maxFleet:   maxFleet ? Number(maxFleet) : null,
      query:      query || undefined,
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

  function toggleIndustry(v: string) {
    setIndustries((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  }

  const PRESETS = [
    { label: 'Sweet Spot', minFleet: '25', maxFleet: '500', states: [], industries: [], query: '' },
    { label: 'Small Fleets', minFleet: '5', maxFleet: '25', states: [], industries: [], query: '' },
    { label: 'Large Fleets', minFleet: '500', maxFleet: '', states: [], industries: [], query: '' },
    { label: 'TX Fleets', minFleet: '25', maxFleet: '500', states: ['TX'], industries: [], query: '' },
    { label: 'CA Fleets', minFleet: '25', maxFleet: '500', states: ['CA'], industries: [], query: '' },
    { label: 'FL Fleets', minFleet: '25', maxFleet: '500', states: ['FL'], industries: [], query: '' },
    { label: 'Construction', minFleet: '', maxFleet: '', states: [], industries: ['construction_fleet'], query: '' },
    { label: 'GC / Contractors', minFleet: '', maxFleet: '', states: [], industries: ['construction_general'], query: '' },
  ] as const;

  function applyPreset(p: typeof PRESETS[number]) {
    setStates([...p.states]);
    setIndustries([...p.industries]);
    setMinFleet(p.minFleet);
    setMaxFleet(p.maxFleet);
    setQuery(p.query);
    setSort('wrap_score');
    setOnlyWithPhone(false);
    setCarrierOffset(0);
    searchMutation.mutate({
      states: p.states.length ? [...p.states] : null,
      industries: p.industries.length ? [...p.industries] : null,
      minFleet: p.minFleet ? Number(p.minFleet) : null,
      maxFleet: p.maxFleet ? Number(p.maxFleet) : null,
      query: p.query || undefined,
      sort: 'wrap_score',
      limit: 25,
      offset: 0,
    });
  }

  return (
    <div>
      <div className="discover-presets">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className="discover-preset-btn"
            onClick={() => applyPreset(p)}
            disabled={searchMutation.isPending}
          >
            {p.label}
          </button>
        ))}
      </div>

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
          <label className="field-label">Industry</label>
          <select
            className="select"
            value=""
            onChange={(e) => { if (e.target.value) toggleIndustry(e.target.value); }}
          >
            <option value="">Add industry…</option>
            {INDUSTRY_OPTIONS.filter((o) => !industries.includes(o.value)).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
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
          <label className="field-label">Sort By</label>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="wrap_score">Wrap Score ↓</option>
            <option value="fleet_desc">Fleet Size ↓ (biggest first)</option>
            <option value="fleet_asc">Fleet Size ↑ (smallest first)</option>
            <option value="recent">Most Recently Reported</option>
            <option value="name">Name A–Z</option>
          </select>
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
        <div className="field-group" style={{ alignSelf: 'end', display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={onlyWithPhone}
              onChange={(e) => setOnlyWithPhone(e.target.checked)}
              style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
            />
            Has phone
          </label>
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

      {(states.length > 0 || industries.length > 0) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {states.map((s) => (
            <span key={s} className="saved-chip">
              {s}
              <button className="chip-del" onClick={() => toggleState(s)}>×</button>
            </span>
          ))}
          {industries.map((v) => (
            <span key={v} className="saved-chip" style={{ background: 'var(--accent-dim, #1e3a5f)' }}>
              {INDUSTRY_OPTIONS.find((o) => o.value === v)?.label ?? v}
              <button className="chip-del" onClick={() => toggleIndustry(v)}>×</button>
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
