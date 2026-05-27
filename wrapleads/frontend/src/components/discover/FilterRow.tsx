import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCarrierSearch } from '../../hooks/useCarriers';
import { useSavedSearches } from '../../hooks/useSavedSearches';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import type { CarrierSearchParams, SavedSearch } from '../../api/types';

// State adjacency map — used for "Near My Shop" preset
const STATE_NEIGHBORS: Record<string, string[]> = {
  AL:['FL','GA','MS','TN'],  AK:[], AZ:['CA','CO','NM','NV','UT'],
  AR:['LA','MO','MS','OK','TN','TX'], CA:['AZ','NV','OR'],
  CO:['AZ','KS','NE','NM','OK','UT','WY'], CT:['MA','NY','RI'],
  DE:['MD','NJ','PA'], FL:['AL','GA'], GA:['AL','FL','NC','SC','TN'],
  HI:[], ID:['MT','NV','OR','UT','WA','WY'], IL:['IN','IA','KY','MO','WI'],
  IN:['IL','KY','MI','OH'], IA:['IL','MN','MO','NE','SD','WI'],
  KS:['CO','MO','NE','OK'], KY:['IL','IN','MO','OH','TN','VA','WV'],
  LA:['AR','MS','TX'], ME:['NH'], MD:['DE','PA','VA','WV'],
  MA:['CT','NH','NY','RI','VT'], MI:['IN','OH','WI'],
  MN:['IA','ND','SD','WI'], MS:['AL','AR','LA','TN'],
  MO:['AR','IL','IA','KS','KY','NE','OK','TN'], MT:['ID','ND','SD','WY'],
  NE:['CO','IA','KS','MO','SD','WY'], NV:['AZ','CA','ID','OR','UT'],
  NH:['MA','ME','VT'], NJ:['DE','NY','PA'], NM:['AZ','CO','OK','TX'],
  NY:['CT','MA','NJ','PA','VT'], NC:['GA','SC','TN','VA'],
  ND:['MN','MT','SD'], OH:['IN','KY','MI','PA','WV'],
  OK:['AR','CO','KS','MO','NM','TX'], OR:['CA','ID','NV','WA'],
  PA:['DE','MD','NJ','NY','OH','WV'], RI:['CT','MA'],
  SC:['GA','NC'], SD:['IA','MN','MT','ND','NE','WY'],
  TN:['AL','AR','GA','KY','MS','MO','NC','VA'], TX:['AR','LA','NM','OK'],
  UT:['AZ','CO','ID','NV','NM','WY'], VT:['MA','NH','NY'],
  VA:['KY','MD','NC','TN','WV'], WA:['ID','OR'],
  WV:['KY','MD','OH','PA','VA'], WI:['IL','IA','MI','MN'],
  WY:['CO','ID','MT','NE','SD','UT'],
};

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

const SOURCE_OPTIONS = [
  { value: 'fmcsa',        label: '🚛 FMCSA Carriers', badge: null },
  { value: 'sos',          label: '📋 State SOS (Registered Businesses)', badge: null },
  { value: 'google_places', label: '📍 Google Places', badge: null },
  { value: 'news_signal',  label: '📡 News Signal (Live Events)', badge: 'Signal' },
  { value: 'sam_gov',      label: '🏛️ SAM.gov (Federal Contractors)', badge: 'GOV' },
  { value: 'ingest_aia',   label: '🏗️ AIA / Architects Directory', badge: null },
];

export default function FilterRow() {
  const searchMutation = useCarrierSearch();
  const { createSearch } = useSavedSearches();
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    staleTime: 5 * 60_000,
  });
  const { setCarrierOffset } = useAppStore((s) => ({
    setCarrierOffset: s.setCarrierOffset,
  }));

  const shopState = settingsData?.settings?.state || '';
  const nearMyShopStates: string[] = shopState
    ? [shopState, ...(STATE_NEIGHBORS[shopState] ?? [])].slice(0, 5)
    : [];

  const [states, setStates] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
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
      sources:      sources.length ? sources : null,
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

  function toggleSource(v: string) {
    setSources((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
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

  function applyNearMyShop() {
    if (!nearMyShopStates.length) return;
    setStates(nearMyShopStates);
    setMinFleet('25');
    setMaxFleet('500');
    setQuery('');
    setSort('wrap_score');
    setOnlyWithPhone(false);
    setCarrierOffset(0);
    searchMutation.mutate({
      states: nearMyShopStates,
      minFleet: 25,
      maxFleet: 500,
      sort: 'wrap_score',
      limit: 25,
      offset: 0,
    });
  }

  return (
    <div>
      <div className="discover-presets">
        {nearMyShopStates.length > 0 && (
          <button
            className="discover-preset-btn"
            onClick={applyNearMyShop}
            disabled={searchMutation.isPending}
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-dim, rgba(244,85,28,0.08))' }}
            title={`Search ${nearMyShopStates.join(', ')} — your state + neighbors`}
          >
            📍 Near My Shop
          </button>
        )}
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
          <label className="field-label">Source</label>
          <select
            className="select"
            value=""
            onChange={(e) => { if (e.target.value) toggleSource(e.target.value); }}
          >
            <option value="">Filter by source…</option>
            {SOURCE_OPTIONS.filter((o) => !sources.includes(o.value)).map((o) => (
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

      {(states.length > 0 || industries.length > 0 || sources.length > 0) && (
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
          {sources.map((v) => {
            const opt = SOURCE_OPTIONS.find((o) => o.value === v);
            return (
              <span key={v} className="saved-chip" style={{ background: 'rgba(77,138,245,0.12)', borderColor: 'rgba(77,138,245,0.3)', color: '#4d8af5' }}>
                {opt?.label ?? v}
                <button className="chip-del" onClick={() => toggleSource(v)}>×</button>
              </span>
            );
          })}
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
