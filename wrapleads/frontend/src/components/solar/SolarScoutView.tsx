import { useEffect, useState } from 'react';
import { useSolarLeads, useQualifiedSolarLeads, useSolarCompany, useImportSolarLead, useQualifyLead, useOpenSolarAuction, useSolarAuctions, useAwardSolarAuction, usePilotInstallers, useCreatePilotInstaller, useSolarSla, useCreateSolarProposal } from '../../hooks/useSolar';
import { useAppStore } from '../../store/useAppStore';
import type { SolarLead, SolarSearchParams, SolarAuction } from '../../api/types';

const ROOF_TYPES = ['flat', 'membrane', 'metal', 'shingle', 'unknown'];
const STATES_QUICK = ['AZ', 'TX', 'CA', 'FL', 'NJ', 'NY', 'IL', 'OH', 'GA', 'NC'];

type Tab = 'discover' | 'qualified' | 'qualify' | 'pilot' | 'auctions' | 'sla';

export default function SolarScoutView() {
  const [tab, setTab] = useState<Tab>('discover');
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' }}>
      <Header />
      <TabBar tab={tab} onChange={setTab} />
      {tab === 'discover'  && <DiscoverTab />}
      {tab === 'qualified' && <QualifiedTab />}
      {tab === 'qualify'   && <QualifyTab />}
      {tab === 'pilot'     && <PilotTab />}
      {tab === 'auctions'  && <AuctionsTab />}
      {tab === 'sla'       && <SlaTab />}
    </div>
  );
}

function Header() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', color: 'var(--text)' }}>
          Commercial Solar Scout
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 720 }}>
          Hyper-qualified commercial solar leads. NAICS-aware fit scoring, ITC + state-stack incentive math,
          tariff-driven urgency hooks, and exclusive installer auctions.
        </p>
      </div>
    </div>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string; hint?: string }[] = [
    { key: 'discover',  label: 'Discover',       hint: 'Browse all commercial properties' },
    { key: 'qualified', label: 'Hyper-Qualified', hint: 'Only leads passing all 3 gates' },
    { key: 'qualify',   label: 'Qualify a Lead',  hint: 'Run the full intelligence pipeline' },
    { key: 'auctions',  label: 'Auctions',       hint: 'Live installer bidding' },
    { key: 'pilot',     label: 'Pilot Installers', hint: 'Manage your installer network' },
    { key: 'sla',       label: 'Speed-to-Lead',  hint: 'Time-to-first-touch dashboard' },
  ];
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          title={t.hint}
          style={{
            padding: '10px 14px',
            background: tab === t.key ? 'var(--surface)' : 'transparent',
            border: 'none',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t.key ? 'var(--text)' : 'var(--text-muted)',
            fontSize: 13,
            fontWeight: tab === t.key ? 700 : 500,
            cursor: 'pointer',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Discover ───────────────────────────────────────────────────────────────
function DiscoverTab() {
  const [filters, setFilters] = useState<SolarSearchParams>({ minSqft: 20000, roofTypes: ['flat', 'membrane', 'metal'], withContact: false, limit: 50, sort: 'solar_score' });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data, isLoading, error } = useSolarLeads(filters);

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 600 }}>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <FilterBar filters={filters} onChange={setFilters} total={data?.total ?? 0} />
        {error && <ErrorBanner error={String(error)} />}
        {isLoading && <SkeletonList />}
        {data && (
          <LeadList leads={data.results} selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </div>
      {selectedId && (
        <div style={{ flex: '0 0 360px', maxWidth: 360 }}>
          <CompanyDetail id={selectedId} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  );
}

function FilterBar({ filters, onChange, total }: { filters: SolarSearchParams; onChange: (f: SolarSearchParams) => void; total: number }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      padding: '10px 14px', background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 10,
      marginBottom: 12,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginRight: 4 }}>
        Filters
      </span>
      <select
        value={(filters.states || [])[0] || ''}
        onChange={(e) => onChange({ ...filters, states: e.target.value ? [e.target.value] : undefined })}
        className="select"
        style={selectStyle()}
      >
        <option value="">All states</option>
        {STATES_QUICK.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input
        type="number"
        placeholder="Min sqft"
        value={filters.minSqft ?? ''}
        onChange={(e) => onChange({ ...filters, minSqft: e.target.value ? parseInt(e.target.value, 10) : null })}
        style={inputStyle(110)}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        {ROOF_TYPES.map(r => {
          const active = (filters.roofTypes || []).includes(r);
          return (
            <button
              key={r}
              onClick={() => onChange({ ...filters, roofTypes: active ? filters.roofTypes!.filter(x => x !== r) : [...(filters.roofTypes || []), r] })}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: active ? 'var(--accent)' : 'rgba(255,255,255,0.04)',
                color: active ? '#000' : 'var(--text-muted)',
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                cursor: 'pointer',
              }}
            >{r}</button>
          );
        })}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
        <input
          type="checkbox"
          checked={!!filters.withContact}
          onChange={(e) => onChange({ ...filters, withContact: e.target.checked })}
        />
        Contactable only
      </label>
      <input
        type="search"
        placeholder="Search company / city"
        value={filters.query || ''}
        onChange={(e) => onChange({ ...filters, query: e.target.value })}
        style={inputStyle(200)}
      />
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
        {total.toLocaleString()} matches
      </span>
    </div>
  );
}

function LeadList({ leads, selectedId, onSelect }: { leads: SolarLead[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const importMut = useImportSolarLead();
  if (!leads.length) {
    return <Empty message="No commercial-solar leads found. Try widening the filters or running the ingest scripts (npm run ingest:commercial -- --source=places --region=…)." />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {leads.map(l => {
        const econ = l.economics;
        const isSelected = selectedId === l.id;
        return (
          <div
            key={l.id}
            onClick={() => onSelect(l.id)}
            style={{
              padding: 12, borderRadius: 10,
              background: 'var(--surface)',
              border: '1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)'),
              cursor: 'pointer',
              display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 16, alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                {l.name}
                {l.permit_signal && <Badge color="#f59e0b" label={`🔥 ${l.permit_signal.replace('_', ' ')}`} />}
                {l.already_imported && <Badge color="#10b981" label="In CRM" />}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {l.city || ''}{l.state ? `, ${l.state}` : ''} · {l.industry || 'commercial'}
                {l.building_sqft ? ` · ${l.building_sqft.toLocaleString()} sqft` : ''} · {l.roof_type || 'unknown'} roof
              </div>
            </div>
            <Metric label="System" value={`${econ.system_kw} kW`} />
            <Metric label="Annual savings" value={`$${Math.round(econ.annual_savings_usd / 1000)}K`} />
            <Metric label="Score" value={`${l.solar_score}`} accent={l.solar_score >= 70 ? '#22c55e' : undefined} />
            {!l.already_imported && (
              <button
                onClick={(e) => { e.stopPropagation(); importMut.mutate(l.id); }}
                disabled={importMut.isPending}
                style={primaryButtonStyle()}
              >Import</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompanyDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading } = useSolarCompany(id);
  const openAuction = useOpenSolarAuction();
  const importMut = useImportSolarLead();
  const toast = useAppStore(s => s.showToast);

  if (isLoading) return <DetailPanel onClose={onClose}><div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading…</div></DetailPanel>;
  if (!data) return null;

  const econ = data.economics;
  const stack = data.incentive_stack;
  const fit = data.naics_fit;

  return (
    <DetailPanel onClose={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{String(data.company.name)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{String(data.company.city || '')}, {String(data.company.state || '')}</div>
        </div>
        {data.satellite_url && (
          <a href={data.satellite_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>
            🛰 Open satellite view ↗
          </a>
        )}
        <Section title="Economics">
          <Row k="System size"      v={`${econ.system_kw} kW DC`} />
          <Row k="Annual production" v={`${econ.annual_kwh.toLocaleString()} kWh`} />
          <Row k="Annual savings"   v={`$${econ.annual_savings_usd.toLocaleString()}`} accent="#22c55e" />
          <Row k="Gross install cost" v={`$${econ.gross_cost_usd.toLocaleString()}`} />
          {stack && (
            <>
              <Row k="Net cost after stack" v={`$${stack.net_cost.toLocaleString()}`} accent="#f59e0b" />
              <Row k="Effective subsidy" v={`${stack.effective_subsidy_pct}%`} />
              <Row k="Net payback" v={data.net_payback_years ? `${data.net_payback_years} years` : 'TBD'} />
            </>
          )}
        </Section>
        {stack && (
          <Section title="Incentive stack">
            {stack.line_items.map((li, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <Row k={li.label} v={`$${li.amount.toLocaleString()}`} />
                {li.notes && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 8, marginTop: -2 }}>{li.notes}</div>}
              </div>
            ))}
          </Section>
        )}
        {fit && (
          <Section title={`NAICS fit (${fit.code})`}>
            <Row k="Score"           v={`${fit.fit}/100`} accent={fit.fit >= 80 ? '#22c55e' : undefined} />
            <Row k="Energy intensity" v={fit.energy_intensity} />
            <Row k="Load profile"    v={fit.load_profile_details?.label || fit.load_profile} />
            <Row k="Tax appetite"    v={fit.tax_appetite} />
            <Row k="Ownership model" v={fit.ownership_model} />
            <Row k="ESG pressure"    v={fit.esg_pressure} />
            <div style={{ marginTop: 8, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 12, color: 'var(--text)' }}>
              💡 {fit.pitchHook}
            </div>
            {fit.sales_script && (
              <div style={{ marginTop: 6, padding: 8, background: 'rgba(34,197,94,0.06)', borderRadius: 6, fontSize: 12, color: 'var(--text)' }}>
                🎯 {fit.sales_script}
              </div>
            )}
          </Section>
        )}
        <Section title="Decision-maker titles to enrich">
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {data.suggested_titles.join(' · ')}
          </div>
        </Section>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => importMut.mutate(id)} style={primaryButtonStyle()}>Import to CRM</button>
          <button
            onClick={async () => {
              if (!data.company.id) return;
              const lead = await importMut.mutateAsync(id);
              if (lead.leadId) {
                openAuction.mutate({ lead_id: lead.leadId, hours: 4 }, {
                  onSuccess: () => toast('Auction opened — installers invited', 'success'),
                  onError: (e) => toast(String((e as Error).message || 'Auction failed'), 'error'),
                });
              }
            }}
            style={secondaryButtonStyle()}
          >Open auction</button>
          <ProposalButton companyId={id} importMut={importMut} />
        </div>
      </div>
    </DetailPanel>
  );
}

// ── Hyper-Qualified ────────────────────────────────────────────────────────
function QualifiedTab() {
  const [state, setState] = useState<string>('');
  const { data, isLoading } = useQualifiedSolarLeads(state || undefined);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Filter by state:</span>
        <select value={state} onChange={(e) => setState(e.target.value)} className="select" style={selectStyle()}>
          <option value="">All</option>
          {STATES_QUICK.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          Gates: NAICS fit ≥ 70 · System ≥ 25 kW · Incentive coverage ≥ 35%
        </span>
      </div>
      {isLoading && <SkeletonList />}
      {data && (
        <>
          <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, marginBottom: 12, fontSize: 13, color: 'var(--text)' }}>
            ✅ <strong>{data.total}</strong> ultra-qualified commercial solar leads passing all three intelligence gates.
          </div>
          <LeadList leads={data.qualified} selectedId={null} onSelect={() => {}} />
        </>
      )}
    </div>
  );
}

// ── Single-lead qualifier ──────────────────────────────────────────────────
function QualifyTab() {
  const [domain, setDomain] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setState] = useState('');
  const [zip, setZip] = useState('');
  const [buildingSqft, setBuildingSqft] = useState('');
  const [roofType, setRoofType] = useState('');
  const qualify = useQualifyLead();

  function run() {
    qualify.mutate({
      domain: domain || undefined,
      city: city || undefined,
      state: stateCode || undefined,
      zip: zip || undefined,
      building_sqft: buildingSqft ? parseInt(buildingSqft, 10) : undefined,
      roof_type: roofType || undefined,
    });
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: '0 0 360px', display: 'flex', flexDirection: 'column', gap: 8, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Run the full intelligence stack</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Firmographic → Google Solar API → NREL utility → ITC + state stack → NAICS fit → Lead alert.
        </p>
        <input placeholder="Domain (e.g. acme.com)" value={domain} onChange={e => setDomain(e.target.value)} style={inputStyle('100%')} />
        <input placeholder="City" value={city} onChange={e => setCity(e.target.value)} style={inputStyle('100%')} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="State" value={stateCode} onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))} style={inputStyle(80)} />
          <input placeholder="ZIP" value={zip} onChange={e => setZip(e.target.value)} style={inputStyle(120)} />
        </div>
        <input type="number" placeholder="Building sqft" value={buildingSqft} onChange={e => setBuildingSqft(e.target.value)} style={inputStyle('100%')} />
        <select value={roofType} onChange={e => setRoofType(e.target.value)} className="select" style={selectStyle('100%')}>
          <option value="">Roof type…</option>
          {ROOF_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={run} disabled={qualify.isPending} style={primaryButtonStyle()}>
          {qualify.isPending ? 'Qualifying…' : 'Qualify lead'}
        </button>
      </div>
      <div style={{ flex: '1 1 auto' }}>
        {qualify.data && (
          <div style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <StatusBadge status={qualify.data.status} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Score: {qualify.data.score}/5 gates passed</span>
            </div>
            <pre style={{ background: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {qualify.data.lead_alert}
            </pre>
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(qualify.data.gates).map(([k, v]) => (
                <Badge key={k} color={v ? '#22c55e' : '#ef4444'} label={`${v ? '✓' : '✗'} ${k.replace(/_/g, ' ')}`} />
              ))}
            </div>
            {qualify.data.dsire_programs && qualify.data.dsire_programs.length > 0 && (
              <Section title="Live DSIRE programs">
                {qualify.data.dsire_programs.map((p, i) => (
                  <Row key={i} k={p.name} v={p.end_date ? `expires ${p.end_date}` : 'ongoing'} />
                ))}
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 8 }}>Source: dsireusa.org · NC State University</div>
              </Section>
            )}
          </div>
        )}
        {qualify.error && <ErrorBanner error={String((qualify.error as Error).message)} />}
      </div>
    </div>
  );
}

// ── Pilot Installers ───────────────────────────────────────────────────────
function PilotTab() {
  const { data, isLoading } = usePilotInstallers();
  const create = useCreatePilotInstaller();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [territory, setTerritory] = useState('');
  const [price, setPrice] = useState('200');

  function add() {
    if (!name || !email) return;
    create.mutate({
      installer_name: name,
      installer_email: email,
      territory_states: territory.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
      price_per_lead: parseFloat(price) || 0,
    }, { onSuccess: () => { setName(''); setEmail(''); setTerritory(''); } });
  }

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ flex: '0 0 340px', padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, height: 'fit-content' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Onboard an installer</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>
          Pilot installers receive lead packets + can bid in auctions.
        </p>
        <input placeholder="Installer name" value={name} onChange={e => setName(e.target.value)} style={inputStyle('100%')} />
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle('100%')} />
        <input placeholder="Territory states (CSV)" value={territory} onChange={e => setTerritory(e.target.value)} style={inputStyle('100%')} />
        <input type="number" placeholder="Price per lead $" value={price} onChange={e => setPrice(e.target.value)} style={inputStyle('100%')} />
        <button onClick={add} disabled={create.isPending} style={primaryButtonStyle()}>Add installer</button>
      </div>
      <div style={{ flex: '1 1 auto' }}>
        {isLoading && <SkeletonList />}
        {data && !data.installers.length && <Empty message="No installers yet. Onboard your first pilot above to start routing leads." />}
        {data && data.installers.map(i => (
          <div key={i.id} style={{ padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{i.installer_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i.installer_email} · {(i.territory_states || []).join(', ') || 'all territories'}</div>
              </div>
              <Metric label="Price/lead" value={`$${i.price_per_lead}`} />
              <Metric label="Assignments" value={String(i.total_assignments ?? 0)} />
              <Metric label="Won" value={String(i.won_count ?? 0)} accent={i.won_count ? '#22c55e' : undefined} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Auctions ───────────────────────────────────────────────────────────────
function AuctionsTab() {
  const { data, isLoading } = useSolarAuctions();
  const award = useAwardSolarAuction();
  const toast = useAppStore(s => s.showToast);

  return (
    <div>
      {isLoading && <SkeletonList />}
      {data && !data.auctions.length && <Empty message="No auctions yet. Open one from a discovered lead." />}
      {data && data.auctions.map(a => <AuctionCard key={a.id} auction={a} onAward={(bidId) => award.mutate({ auctionId: a.id, bidId }, { onSuccess: (r) => toast(`Awarded to ${(r.winner as { installer_name?: string })?.installer_name || 'winner'}`, 'success') })} />)}
    </div>
  );
}

function AuctionCard({ auction, onAward }: { auction: SolarAuction; onAward: (bidId: number) => void }) {
  const econ = auction.snapshot?.economics;
  const [closesSoon, setClosesSoon] = useState(false);
  // Tick the "closing soon" badge every 30s so we don't render an impure
  // Date.now() during the render phase.
  useEffect(() => {
    const tick = () => {
      const closesIn = new Date(auction.closes_at).getTime() - Date.now();
      setClosesSoon(closesIn > 0 && closesIn < 3600 * 1000);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [auction.closes_at]);
  return (
    <div style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{auction.company || auction.snapshot?.company}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {auction.city || ''}{auction.state ? `, ${auction.state}` : ''}
            {econ ? ` · ${econ.system_kw} kW · $${econ.annual_savings_usd.toLocaleString()}/yr savings` : ''}
          </div>
        </div>
        <StatusBadge status={auction.status === 'open' ? (closesSoon ? '⏰ Closing soon' : 'Open') : auction.status} />
      </div>
      {auction.bids && auction.bids.length > 0 ? (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {auction.bids.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              <div style={{ flex: 1, fontSize: 13 }}>
                <strong>{b.installer_name}</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{b.bid_mode}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                ${Number(b.amount).toLocaleString()}
                {Number(b.commission_pct) > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> + {b.commission_pct}%</span>}
              </div>
              {auction.status === 'open' && (
                <button onClick={() => onAward(b.id)} style={primaryButtonStyle()}>Award</button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-faint)' }}>No bids yet — installers were invited via email.</div>
      )}
    </div>
  );
}

// ── SLA / Speed-to-Lead ────────────────────────────────────────────────────
function SlaTab() {
  const { data, isLoading } = useSolarSla();
  if (isLoading) return <SkeletonList />;
  if (!data || !data.total_leads) return <Empty message="No solar leads with contact activity yet. Once you trigger the speed-to-lead webhook on /webhooks/solar-intake, time-to-first-touch will appear here." />;

  const fmtSec = (s: number | null) => s === null ? '—' : s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${(s/60).toFixed(1)}m` : `${(s/3600).toFixed(1)}h`;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      <Card label="Total commercial-solar leads" value={data.total_leads.toLocaleString()} />
      <Card label="Median time to first email" value={fmtSec(data.median_seconds_to_first_touch)} accent="#22c55e" />
      <Card label="Under 1 minute" value={data.under_one_minute.toLocaleString()} accent="#10b981" />
      <Card label="Under 5 minutes" value={data.under_five_minutes.toLocaleString()} accent="#3b82f6" />
    </div>
  );
}

// ── Tiny presentational primitives ─────────────────────────────────────────
function selectStyle(width: number | string = 110): React.CSSProperties {
  return { padding: '6px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, width };
}
function inputStyle(width: number | string = 120): React.CSSProperties {
  return { padding: '6px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, width, marginBottom: 6 };
}
function primaryButtonStyle(): React.CSSProperties {
  return { padding: '6px 12px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
}
function secondaryButtonStyle(): React.CSSProperties {
  return { padding: '6px 12px', background: 'rgba(255,255,255,0.05)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
}
function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: accent ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{label}</div>
    </div>
  );
}
function Badge({ color, label }: { color: string; label: string }) {
  return <span style={{ display: 'inline-block', marginLeft: 8, padding: '2px 8px', background: color + '20', color, borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{label}</span>;
}
function Empty({ message }: { message: string }) {
  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--surface)', borderRadius: 10, border: '1px dashed var(--border)' }}>{message}</div>;
}
function ErrorBanner({ error }: { error: string }) {
  return <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#fca5a5', fontSize: 12, marginBottom: 10 }}>{error}</div>;
}
function SkeletonList() {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ height: 48, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, opacity: 0.5 }} />)}</div>;
}
function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
function DetailPanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, position: 'sticky', top: 20, maxHeight: 'calc(100vh - 60px)', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>
      {children}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, padding: '2px 0' }}>
      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ fontWeight: 700, color: accent || 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    'Ultra-Qualified': '#22c55e', 'Qualified': '#3b82f6', 'Marginal': '#f59e0b', 'Disqualified': '#ef4444',
    'open': '#22c55e', 'awarded': '#10b981', 'cancelled': '#94a3b8', 'closed_no_bids': '#ef4444',
    '⏰ Closing soon': '#f59e0b', 'Open': '#22c55e',
  };
  const c = colors[status] || '#94a3b8';
  return <span style={{ display: 'inline-block', padding: '4px 10px', background: c + '22', color: c, borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{status}</span>;
}

// One-click: import the company to CRM (if not already), then generate a
// shareable proposal HTML page. Opens the page in a new tab.
function ProposalButton({ companyId, importMut }: { companyId: number; importMut: ReturnType<typeof useImportSolarLead> }) {
  const proposal = useCreateSolarProposal();
  const toast = useAppStore(s => s.showToast);
  async function onClick() {
    try {
      const r = await importMut.mutateAsync(companyId);
      if (!r.leadId) { toast('Could not import lead', 'error'); return; }
      const p = await proposal.mutateAsync(r.leadId);
      window.open(p.url, '_blank', 'noopener');
      toast('Proposal generated — opening in a new tab', 'success');
    } catch (e) {
      toast(String((e as Error).message || 'Failed to generate proposal'), 'error');
    }
  }
  return (
    <button onClick={onClick} disabled={proposal.isPending || importMut.isPending} style={secondaryButtonStyle()}>
      {proposal.isPending ? 'Generating…' : '📄 Generate proposal'}
    </button>
  );
}
