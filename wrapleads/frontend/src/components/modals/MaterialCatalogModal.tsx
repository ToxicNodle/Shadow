import { useState } from 'react';

interface Material {
  id: string;
  name: string;
  brand: '3M' | 'Avery' | 'Arlon' | '3M DI-NOC' | 'Rea Tec';
  type: 'cast' | 'calendered' | 'specialty' | 'architectural';
  finish: string[];
  lifeYears: number;
  sqftLow: number;
  sqftHigh: number;
  thickness: string;
  bestFor: string;
  notes: string;
}

const MATERIALS: Material[] = [
  { id: '3m-1080', name: '3M 1080', brand: '3M', type: 'cast', finish: ['Gloss', 'Matte', 'Satin', 'Carbon Fiber', 'Brushed Metal', 'Gloss Flip'], lifeYears: 7, sqftLow: 10, sqftHigh: 16, thickness: '3.5 mil', bestFor: 'Full color-change wraps, high-end personal vehicles, racing', notes: 'Industry standard for color change. Clean removability up to 3 years.' },
  { id: '3m-1080-sp', name: '3M 1080-SP', brand: '3M', type: 'cast', finish: ['Satin Pearl'], lifeYears: 7, sqftLow: 12, sqftHigh: 18, thickness: '3.5 mil', bestFor: 'Premium color change, luxury vehicles', notes: 'Special satin pearl finish. Premium pricing justified by unique appearance.' },
  { id: '3m-ij180', name: '3M IJ180Cv3', brand: '3M', type: 'cast', finish: ['Gloss', 'Matte'], lifeYears: 9, sqftLow: 9, sqftHigh: 14, thickness: '2.5 mil', bestFor: 'Fleet graphics, commercial signage, high-conformability wraps', notes: 'Thinner than 1080, excellent for complex curves. Workhorse for fleet.' },
  { id: '3m-ij40', name: '3M IJ40C', brand: '3M', type: 'calendered', finish: ['Gloss'], lifeYears: 5, sqftLow: 6, sqftHigh: 10, thickness: '3.5 mil', bestFor: 'Budget fleet graphics, flat panels, signage', notes: 'Economical calendered option. Not recommended for curved surfaces or full wraps.' },
  { id: 'avery-sw900', name: 'Avery SW900', brand: 'Avery', type: 'cast', finish: ['Gloss', 'Matte', 'Satin', 'Chrome', 'Carbon Fiber', 'Brushed'], lifeYears: 7, sqftLow: 10, sqftHigh: 16, thickness: '3.2 mil', bestFor: 'Color change, fleet, full wraps', notes: 'Direct competitor to 3M 1080. Slightly softer material — forgiving during install.' },
  { id: 'avery-sw900-chrome', name: 'Avery SW900 Chrome', brand: 'Avery', type: 'specialty', finish: ['Chrome Silver', 'Chrome Gold', 'Chrome Red'], lifeYears: 5, sqftLow: 18, sqftHigh: 28, thickness: '3.2 mil', bestFor: 'Accent chrome, show vehicles, extreme builds', notes: 'Most difficult material to install. Not for flat surfaces. High WOW factor.' },
  { id: 'arlon-3000', name: 'Arlon 3000XL', brand: 'Arlon', type: 'cast', finish: ['Gloss', 'Matte', 'Gloss Metallic'], lifeYears: 7, sqftLow: 9, sqftHigh: 14, thickness: '2.0 mil', bestFor: 'Fleet graphics, overlaminates, large-format', notes: 'Excellent for fleet. Very thin cast film — lower profile, cleaner edges.' },
  { id: 'arlon-slx', name: 'Arlon SLX', brand: 'Arlon', type: 'cast', finish: ['Gloss', 'Satin', 'Matte'], lifeYears: 9, sqftLow: 11, sqftHigh: 17, thickness: '3.0 mil', bestFor: 'Premium fleet, color change, long-term wraps', notes: 'Arlon\'s flagship. Air egress channels for bubble-free install on large panels.' },
  { id: '3m-dinoc', name: '3M DI-NOC', brand: '3M DI-NOC', type: 'architectural', finish: ['Wood', 'Metal', 'Stone', 'Abstract', 'Solid Color'], lifeYears: 10, sqftLow: 20, sqftHigh: 35, thickness: '5.0–7.0 mil', bestFor: 'Interior surfaces: cabinets, walls, elevator panels, countertops', notes: 'NOT for vehicle exteriors. Textured surface film for renovation. 500+ patterns.' },
  { id: 'rea-tec', name: 'Rea Tec', brand: 'Rea Tec', type: 'architectural', finish: ['Wood', 'Metal', 'Concrete', 'Fabric'], lifeYears: 10, sqftLow: 18, sqftHigh: 32, thickness: '5.0–6.5 mil', bestFor: 'Architectural surfaces, millwork, doors, furniture', notes: 'European manufacturer. Premium tactile finish. More realistic wood grain than DI-NOC.' },
  { id: '3m-ij200', name: '3M IJ200', brand: '3M', type: 'specialty', finish: ['Reflective', 'Fluorescent Yellow', 'Fluorescent Orange'], lifeYears: 10, sqftLow: 16, sqftHigh: 26, thickness: '4.0 mil', bestFor: 'Emergency vehicles, construction equipment, DOT compliance', notes: 'High-visibility applications. FHWA compliant for road safety markings.' },
];

const BRAND_COLORS: Record<string, string> = {
  '3M': '#e63012', 'Avery': '#1a56db', 'Arlon': '#059669', '3M DI-NOC': '#7c3aed', 'Rea Tec': '#b45309',
};

interface Props { onClose: () => void; onSelect?: (material: string) => void; }

export default function MaterialCatalogModal({ onClose, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Material | null>(null);

  const filtered = MATERIALS.filter((m) => {
    const q = search.toLowerCase();
    if (typeFilter !== 'all' && m.type !== typeFilter) return false;
    if (!q) return true;
    return `${m.name} ${m.brand} ${m.bestFor} ${m.finish.join(' ')}`.toLowerCase().includes(q);
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 className="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{ marginRight: 8, verticalAlign: 'middle' }}>
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
              <line x1="7" y1="15" x2="11" y2="15"/><line x1="7" y1="18" x2="9" y2="18"/>
            </svg>
            Material Catalog
          </h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '0 24px 12px', display: 'flex', gap: 8, flexShrink: 0 }}>
          <input className="input" style={{ flex: 1 }} placeholder="Search materials, brands, finishes…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          <select className="input" style={{ width: 160 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="cast">Cast Film</option>
            <option value="calendered">Calendered</option>
            <option value="specialty">Specialty</option>
            <option value="architectural">Architectural</option>
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 12, padding: '0 24px 24px', flex: 1, overflow: 'hidden' }}>
          <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map((m) => (
              <button
                key={m.id}
                className={`mat-card ${selected?.id === m.id ? 'mat-card-selected' : ''}`}
                onClick={() => setSelected(selected?.id === m.id ? null : m)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <span className="mat-name">{m.name}</span>
                  <span className="mat-brand" style={{ background: BRAND_COLORS[m.brand] }}>{m.brand}</span>
                </div>
                <div className="mat-meta">
                  <span>{m.type}</span>
                  <span>·</span>
                  <span>{m.lifeYears}yr lifespan</span>
                  <span>·</span>
                  <span>${m.sqftLow}–${m.sqftHigh}/sqft</span>
                </div>
                <div className="mat-finishes">{m.finish.slice(0, 4).map((f) => <span key={f} className="mat-finish-chip">{f}</span>)}{m.finish.length > 4 && <span className="mat-finish-chip">+{m.finish.length - 4}</span>}</div>
              </button>
            ))}
            {filtered.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>No materials match.</p>}
          </div>

          {selected && (
            <div className="mat-detail" style={{ overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{selected.name}</h3>
                  <span className="mat-brand" style={{ background: BRAND_COLORS[selected.brand], marginTop: 4, display: 'inline-block' }}>{selected.brand}</span>
                </div>
                <button className="btn" style={{ fontSize: 11 }} onClick={() => setSelected(null)}>✕</button>
              </div>
              <div className="mat-detail-grid">
                <div className="mat-detail-item"><span className="mat-detail-label">Type</span><span>{selected.type}</span></div>
                <div className="mat-detail-item"><span className="mat-detail-label">Thickness</span><span>{selected.thickness}</span></div>
                <div className="mat-detail-item"><span className="mat-detail-label">Lifespan</span><span>{selected.lifeYears} years</span></div>
                <div className="mat-detail-item"><span className="mat-detail-label">Installed Cost</span><span>${selected.sqftLow}–${selected.sqftHigh} / sqft</span></div>
              </div>
              <div className="mat-detail-section">
                <div className="mat-detail-label">Finishes Available</div>
                <div className="mat-finishes" style={{ marginTop: 6 }}>{selected.finish.map((f) => <span key={f} className="mat-finish-chip">{f}</span>)}</div>
              </div>
              <div className="mat-detail-section">
                <div className="mat-detail-label">Best For</div>
                <p style={{ margin: '4px 0 0', fontSize: 13 }}>{selected.bestFor}</p>
              </div>
              <div className="mat-detail-section">
                <div className="mat-detail-label">Notes</div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{selected.notes}</p>
              </div>
              {onSelect && (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: 16 }}
                  onClick={() => { onSelect(selected.name); onClose(); }}
                >
                  Use {selected.name}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
