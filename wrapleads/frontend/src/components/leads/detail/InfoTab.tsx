import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Lead, LeadCategory, LeadStatus, VehicleType } from '../../../api/types';
import { CATEGORIES, STATUSES } from '../../../api/types';
import { useLeads } from '../../../hooks/useLeads';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../api/client';
import { winProbability, winProbabilityColor } from '../../../utils/scoring';

// --------------- Confetti ---------------
function ConfettiCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899', '#fbbf24'];
    type P = { x: number; y: number; vx: number; vy: number; color: string; w: number; h: number; rot: number; rs: number };
    const particles: P[] = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * canvas.height * 0.25,
      vx: (Math.random() - 0.5) * 5,
      vy: 1.5 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      w: 7 + Math.random() * 9,
      h: 4 + Math.random() * 5,
      rot: Math.random() * 360,
      rs: (Math.random() - 0.5) * 9,
    }));

    let raf: number;
    let t = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      t++;
      let alive = 0;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.07;
        p.rot += p.rs;
        if (p.y > canvas!.height + 20) continue;
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, 1 - t / 210);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive > 0 && t < 220) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas!.width, canvas!.height);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }}
    />
  );
}

// --------------- Completeness ---------------
const COMPLETENESS_FIELDS: (keyof Lead)[] = ['email', 'phone', 'contactName', 'fleetSize', 'city', 'state', 'website', 'pitchAngle'];
const COMPLETENESS_LABELS: Partial<Record<keyof Lead, string>> = {
  email: 'Email', phone: 'Phone', contactName: 'Contact Name',
  fleetSize: 'Fleet Size', city: 'City', state: 'State', website: 'Website', pitchAngle: 'Pitch Angle',
};

function CompletenessBar({ lead }: { lead: Lead }) {
  const filled = COMPLETENESS_FIELDS.filter((f) => {
    const v = lead[f];
    return v !== undefined && v !== null && String(v).trim() !== '';
  }).length;
  const pct = Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
  const missing = COMPLETENESS_FIELDS.filter((f) => {
    const v = lead[f];
    return !v || String(v).trim() === '';
  }).map((f) => COMPLETENESS_LABELS[f]);
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="completeness-bar-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Profile completeness
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div className="completeness-track">
        <div className="completeness-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      {missing.length > 0 && pct < 100 && (
        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
          Missing: {missing.join(', ')}
        </div>
      )}
    </div>
  );
}

interface Props {
  lead: Lead;
}

const CATEGORY_OPTIONS = Object.entries(CATEGORIES) as [LeadCategory, string][];
const STATUS_OPTIONS = Object.entries(STATUSES) as [LeadStatus, string][];
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

const WIN_LOSS_FACTORS = [
  { value: 'price', label: 'Price' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'relationship', label: 'Relationship' },
  { value: 'quality', label: 'Quality / Portfolio' },
  { value: 'competition', label: 'Chose Competitor' },
  { value: 'no_budget', label: 'No Budget' },
  { value: 'not_ready', label: 'Not Ready Yet' },
  { value: 'other', label: 'Other' },
];

function WinLossModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const [factor, setFactor] = useState('');
  const [notes, setNotes] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [logJob, setLogJob] = useState(false);
  const [jobForm, setJobForm] = useState({
    vehicle_type: 'cargo_van_standard',
    vehicle_count: 1,
    material: '',
    install_date: new Date().toISOString().split('T')[0],
    life_years: 5,
  });

  const mut = useMutation({
    mutationFn: async () => {
      await api.captureWinLoss(lead.serverId!, factor || 'other', notes, competitor);
      if (logJob) {
        await api.createJob({
          company: lead.company,
          vehicle_type: jobForm.vehicle_type as VehicleType,
          vehicle_count: jobForm.vehicle_count,
          wrap_category: lead.category,
          material: jobForm.material || undefined,
          install_date: jobForm.install_date,
          life_years: jobForm.life_years,
          lead_id: lead.serverId,
        });
      }
    },
    onSuccess: onClose,
  });
  const outcome = lead.status === 'won' ? 'Won' : 'Lost';
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ width: 22, height: 22, display: 'flex', color: outcome === 'Won' ? 'var(--green)' : 'var(--text-muted)' }}>
            {outcome === 'Won'
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            }
          </span>
          <h2 className="modal-title" style={{ margin: 0 }}>Deal {outcome} — What was the factor?</h2>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
          {WIN_LOSS_FACTORS.map((f) => (
            <button
              key={f.value}
              className={`btn ${factor === f.value ? 'btn-primary' : ''}`}
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => setFactor(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {factor === 'competition' && (
          <input
            className="input"
            placeholder="Competitor name (optional)"
            style={{ width: '100%', marginBottom: 8 }}
            value={competitor}
            onChange={(e) => setCompetitor(e.target.value)}
            autoFocus
          />
        )}
        <textarea
          className="input"
          placeholder="Any notes? (optional)"
          rows={2}
          style={{ width: '100%', resize: 'vertical', marginBottom: 12 }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {outcome === 'Won' && (
          <div style={{ background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: logJob ? 10 : 0 }}>
              <input type="checkbox" checked={logJob} onChange={(e) => setLogJob(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Log this as a completed job (starts wrap lifecycle tracking)</span>
            </label>
            {logJob && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
                  <div className="field-group">
                    <label className="field-label">Vehicle Type</label>
                    <select className="input" value={jobForm.vehicle_type} onChange={(e) => setJobForm((s) => ({ ...s, vehicle_type: e.target.value }))}>
                      <option value="cargo_van_standard">Cargo Van</option>
                      <option value="cargo_van_high_roof">High-Roof Van</option>
                      <option value="box_truck_16">16ft Box Truck</option>
                      <option value="box_truck_24">24ft Box Truck</option>
                      <option value="semi_full">Semi + Trailer</option>
                      <option value="pickup_truck">Pickup Truck</option>
                      <option value="suv_large">Large SUV</option>
                      <option value="bus_school">Bus</option>
                      <option value="other">Mixed / Other</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Count</label>
                    <input className="input" type="number" min={1} value={jobForm.vehicle_count}
                      onChange={(e) => setJobForm((s) => ({ ...s, vehicle_count: parseInt(e.target.value) || 1 }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="field-group">
                    <label className="field-label">Install Date</label>
                    <input className="input" type="date" value={jobForm.install_date}
                      onChange={(e) => setJobForm((s) => ({ ...s, install_date: e.target.value }))} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Material (optional)</label>
                    <input className="input" value={jobForm.material} placeholder="3M 1080…"
                      onChange={(e) => setJobForm((s) => ({ ...s, material: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {mut.isError && (
          <div className="error-box" style={{ marginBottom: 8 }}>
            Could not save — check your connection and try again.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Skip</button>
          <button
            className="btn btn-primary"
            disabled={mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Saving…' : logJob ? 'Save + Log Job' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const URGENCY_COLORS: Record<string, string> = { hot: '#ef4444', warm: '#f59e0b', cold: '#6b7280' };
const CHANNEL_ICONS: Record<string, ReactNode> = {
  call:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.44 2 2 0 0 1 3.59 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.97-1.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  email: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  text:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  visit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  none:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
};

function AICoach({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['ai-suggest', lead.serverId],
    queryFn: () => api.suggestAction(lead.serverId!),
    enabled: open && !!lead.serverId,
    staleTime: 15 * 60_000,
  });

  const s = data?.suggestion;
  return (
    <div className="ai-coach-card">
      <button
        className="ai-coach-header"
        onClick={() => { setOpen((o) => !o); if (!open && !data) refetch(); }}
      >
        <span className="ai-coach-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M12 11V7"/><circle cx="12" cy="5" r="2"/><line x1="8" y1="15" x2="8" y2="15"/><line x1="16" y1="15" x2="16" y2="15"/></svg></span>
        <span className="ai-coach-title">AI Coach</span>
        {s && <span className="ai-coach-urgency-dot" style={{ background: URGENCY_COLORS[s.urgency] }} />}
        <span className="ai-coach-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="ai-coach-body">
          {isFetching ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', fontSize: 12, color: 'var(--text-muted)' }}>
              <span className="spinner" style={{ width: 12, height: 12 }} />Analysing lead history…
            </div>
          ) : s ? (
            <>
              <div className="ai-coach-action">
                <span style={{ width: 16, height: 16, display: 'flex', color: 'var(--accent)' }}>{CHANNEL_ICONS[s.channel] ?? CHANNEL_ICONS.none}</span>
                <span>{s.action}</span>
              </div>
              <div className="ai-coach-reason">{s.reasoning}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span className="ai-coach-badge" style={{ background: URGENCY_COLORS[s.urgency] }}>{s.urgency.toUpperCase()}</span>
                <button className="btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => refetch()}>↻ Refresh</button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>Could not generate suggestion — check API key.</div>
          )}
        </div>
      )}
    </div>
  );
}

function ProposalSection({ lead }: { lead: Lead }) {
  const [notes, setNotes] = useState('');
  const [proposal, setProposal] = useState<{ token: string; title: string; id: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const mut = useMutation({
    mutationFn: () => api.createProposal(lead.serverId!, notes),
    onSuccess: (data) => setProposal({ token: data.proposal.token, title: data.proposal.title, id: data.proposal.id }),
  });

  const { data: viewData } = useQuery({
    queryKey: ['proposal-views', proposal?.id],
    queryFn: () => api.getProposalViewCount(proposal!.id),
    enabled: !!proposal?.id,
    refetchInterval: 30_000,
  });

  const url = proposal ? api.getProposalUrl(proposal.token) : null;

  function copy() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="proposal-section">
      <div className="proposal-section-title">AI Proposal Writer</div>
      {!proposal ? (
        <>
          <textarea
            className="input"
            placeholder="Any extra context for the AI? (optional — vehicle types, specific asks, budget hints…)"
            rows={2}
            style={{ width: '100%', resize: 'vertical', marginBottom: 8 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {mut.isError && <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 6 }}>{(mut.error as Error).message}</div>}
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Writing proposal…</> : 'Generate Full Proposal'}
          </button>
        </>
      ) : (
        <div className="proposal-ready">
          <div className="proposal-ready-title">✓ Proposal ready</div>
          {viewData && viewData.view_count > 0 && (
            <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
              Viewed {viewData.view_count}× · Last seen {viewData.last_viewed_ago}
            </div>
          )}
          <div className="proposal-ready-url">{url}</div>
          <div className="proposal-ready-actions">
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={copy}>
              {copied ? '✓ Copied!' : 'Copy Link'}
            </button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => window.open(url!, '_blank')}>
              Preview
            </button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => setProposal(null)}>
              New
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SmsModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  const mut = useMutation({
    mutationFn: () => api.sendSms(lead.serverId!, msg),
    onSuccess: onClose,
  });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ width: 20, height: 20, display: 'flex', color: 'var(--text-muted)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
          <h2 className="modal-title" style={{ margin: 0 }}>Text {lead.contactName || lead.company}</h2>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{lead.phone}</div>
        <textarea
          className="input"
          placeholder="Your message…"
          rows={4}
          style={{ width: '100%', resize: 'vertical', marginBottom: 12 }}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          autoFocus
        />
        {mut.isError && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{(mut.error as Error).message}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!msg.trim() || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Sending…' : 'Send SMS'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InfoTab({ lead }: Props) {
  const { updateLead } = useLeads();
  const { setProposalOpen } = useAppStore((s) => ({ setProposalOpen: s.setProposalOpen }));
  const [local, setLocal] = useState<Lead>(lead);
  const [showWinLoss, setShowWinLoss] = useState(false);
  const [showSms, setShowSms] = useState(false);
  const [prevStatus, setPrevStatus] = useState<LeadStatus>(lead.status);
  const [confettiActive, setConfettiActive] = useState(false);

  function patch(field: keyof Lead, value: string) {
    const updated = { ...local, [field]: value };
    setLocal(updated);
    if (field === 'status' && (value === 'won' || value === 'lost') && value !== prevStatus) {
      setPrevStatus(value as LeadStatus);
      if (value === 'won') {
        setConfettiActive(true);
        setTimeout(() => setConfettiActive(false), 4500);
      }
      setTimeout(() => setShowWinLoss(true), 300);
    }
    if (lead.serverId) {
      updateLead({ serverId: lead.serverId, patch: { [field]: value } });
    }
  }

  const prob = winProbability(local);
  const probColor = winProbabilityColor(prob);

  return (
    <div>
      <ConfettiCanvas active={confettiActive} />

      {/* Win Probability + Completeness row */}
      {!['won', 'lost'].includes(local.status) && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', marginBottom: 12 }}>
          <div style={{
            flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '10px 16px',
            background: `${probColor}12`, border: `1px solid ${probColor}30`,
            borderRadius: 10, minWidth: 88,
          }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: probColor, lineHeight: 1 }}>{prob}%</div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: probColor, marginTop: 3, opacity: 0.8 }}>
              close prob
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CompletenessBar lead={local} />
          </div>
        </div>
      )}

      {['won', 'lost'].includes(local.status) && (
        <>
          <CompletenessBar lead={local} />
          <div style={{ height: 12 }} />
        </>
      )}
      <div style={{ height: 4 }} />
      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Category</label>
          <select
            className="select"
            value={local.category}
            onChange={(e) => patch('category', e.target.value)}
          >
            {CATEGORY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Status</label>
          <select
            className="select"
            value={local.status}
            onChange={(e) => patch('status', e.target.value)}
          >
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Company</label>
        <input
          className="input"
          value={local.company}
          onChange={(e) => setLocal({ ...local, company: e.target.value })}
          onBlur={(e) => patch('company', e.target.value)}
        />
      </div>

      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Contact Name</label>
          <input
            className="input"
            value={local.contactName}
            onChange={(e) => setLocal({ ...local, contactName: e.target.value })}
            onBlur={(e) => patch('contactName', e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Title</label>
          <input
            className="input"
            value={local.contactTitle}
            onChange={(e) => setLocal({ ...local, contactTitle: e.target.value })}
            onBlur={(e) => patch('contactTitle', e.target.value)}
          />
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Email</label>
        <input
          className="input"
          type="email"
          value={local.email}
          onChange={(e) => setLocal({ ...local, email: e.target.value })}
          onBlur={(e) => patch('email', e.target.value)}
        />
      </div>

      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Phone</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="input"
              value={local.phone}
              onChange={(e) => setLocal({ ...local, phone: e.target.value })}
              onBlur={(e) => patch('phone', e.target.value)}
              style={{ flex: 1 }}
            />
            {local.phone && (
              <button
                className="btn"
                style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
                onClick={() => setShowSms(true)}
                title="Send SMS"
              >
                SMS
              </button>
            )}
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Fleet Size</label>
          <input
            className="input"
            value={local.fleetSize}
            onChange={(e) => setLocal({ ...local, fleetSize: e.target.value })}
            onBlur={(e) => patch('fleetSize', e.target.value)}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field-group">
          <label className="field-label">City</label>
          <input
            className="input"
            value={local.city}
            onChange={(e) => setLocal({ ...local, city: e.target.value })}
            onBlur={(e) => patch('city', e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">State</label>
          <select
            className="select"
            value={local.state}
            onChange={(e) => patch('state', e.target.value)}
          >
            <option value="">—</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Website</label>
        <input
          className="input"
          value={local.website}
          onChange={(e) => setLocal({ ...local, website: e.target.value })}
          onBlur={(e) => patch('website', e.target.value)}
        />
      </div>

      <div className="field-group">
        <label className="field-label">Pitch Angle</label>
        <input
          className="input"
          value={local.pitchAngle}
          onChange={(e) => setLocal({ ...local, pitchAngle: e.target.value })}
          onBlur={(e) => patch('pitchAngle', e.target.value)}
          placeholder="e.g. fleet refresh, new branding"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Referred By</label>
        <input
          className="input"
          value={local.referred_by ?? ''}
          onChange={(e) => setLocal({ ...local, referred_by: e.target.value })}
          onBlur={(e) => { if (lead.serverId) updateLead({ serverId: lead.serverId, patch: { referred_by: e.target.value } }); }}
          placeholder="Who referred this lead? (name or company)"
        />
      </div>

      <button
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '10px', marginTop: 8 }}
        onClick={() => setProposalOpen(true, lead.id)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        Generate Quote / Proposal
      </button>

      {lead.serverId && <AICoach lead={local} />}
      {lead.serverId && <ProposalSection lead={local} />}

      {showWinLoss && lead.serverId && (
        <WinLossModal lead={local} onClose={() => setShowWinLoss(false)} />
      )}
      {showSms && lead.serverId && (
        <SmsModal lead={local} onClose={() => setShowSms(false)} />
      )}
    </div>
  );
}
