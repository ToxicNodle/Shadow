import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Lead, LeadCategory, LeadStatus, VehicleType } from '../../../api/types';
import { CATEGORIES, STATUSES } from '../../../api/types';
import { useLeads } from '../../../hooks/useLeads';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../api/client';
import { winProbability, winProbabilityColor } from '../../../utils/scoring';
import FindEmailPanel from './FindEmailPanel';
import SimilarWinsPanel from './SimilarWinsPanel';
import LossReasonModal from '../../modals/LossReasonModal';
import DealCoachPanel from './DealCoachPanel';
import WinDebriefPanel from './WinDebriefPanel';
import AccountHealthCard from './AccountHealthCard';
import MeetingPrepPanel from './MeetingPrepPanel';
import CallOpenerPanel from './CallOpenerPanel';

// ── Unsubscribed Badge ────────────────────────────────────────────────────────
function UnsubscribedBadge({ leadId }: { leadId: number }) {
  const { data } = useQuery({
    queryKey: ['unsub-status', leadId],
    queryFn: () => api.getUnsubscribeStatus(leadId),
    staleTime: 5 * 60_000,
  });
  if (!data?.unsubscribed) return null;
  return (
    <div style={{
      marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4,
      background: '#7f1d1d22', border: '1px solid #ef444450', borderRadius: 4,
      padding: '2px 7px', fontSize: 10, color: '#ef4444',
    }}>
      <span>⊘</span>
      <span>Unsubscribed — do not email</span>
      {data.unsubscribed_at && (
        <span style={{ color: '#ef444480', marginLeft: 2 }}>
          · {new Date(data.unsubscribed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      )}
    </div>
  );
}

// ── AI Call Script Panel ──────────────────────────────────────────────────────
// ── Wrap ROI Calculator ───────────────────────────────────────────────────────
const MEDIA_BENCHMARKS: { name: string; cpm: number; isWrap?: boolean }[] = [
  { name: 'Billboards',     cpm: 5.21 },
  { name: 'Radio',          cpm: 8.40 },
  { name: 'Direct Mail',    cpm: 30.00 },
  { name: 'TV (local)',     cpm: 22.00 },
  { name: 'Digital Display',cpm: 3.55 },
];

// ── Multi-Location Expansion ──────────────────────────────────────────────────
function MultiLocationExpansion({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ company: string; city: string; state: string; fleet_size: number | null; reasoning: string }> | null>(null);
  const [creating, setCreating] = useState<number | null>(null);
  const [created, setCreated] = useState<Set<number>>(new Set());
  const showToast = useAppStore((s) => s.showToast);
  const setCurrentLeadId = useAppStore((s) => s.setCurrentLeadId);
  const qc = useQueryClient();

  const fleetNum = parseInt(String(lead.fleetSize ?? '0'), 10);
  if (lead.status !== 'won' || fleetNum < 10) return null;

  async function fetchSuggestions() {
    if (!lead.serverId) return;
    setLoading(true);
    try {
      const result = await api.suggestLocations(lead.serverId);
      setSuggestions(result.suggestions);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function createLead(idx: number, s: { company: string; city: string; state: string; fleet_size: number | null }) {
    if (!lead.serverId) return;
    setCreating(idx);
    try {
      const result = await api.createLocationLead(lead.serverId, { ...s, category: lead.category });
      setCreated((c) => new Set([...c, idx]));
      qc.invalidateQueries({ queryKey: ['leads'] });
      showToast(`Added ${s.company} to pipeline`);
      if (result.clientId) setCurrentLeadId(result.clientId);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setCreating(null);
    }
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <button
        className="btn"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}
        onClick={() => { if (!suggestions && !open) fetchSuggestions(); setOpen((v) => !v); }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ghost-green)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          Expand to Other Locations
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 400 }}>
          {fleetNum}+ vehicle fleet — likely has other terminals
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {loading && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="spinner" style={{ width: 12, height: 12 }} />
              AI analyzing likely locations for {lead.company}…
            </div>
          )}
          {suggestions && suggestions.map((s, i) => (
            <div key={i} style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6,
              padding: '8px 10px', marginBottom: 6, display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{s.company}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{[s.city, s.state].filter(Boolean).join(', ')}{s.fleet_size ? ` · ~${s.fleet_size} vehicles` : ''}</div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2, fontStyle: 'italic' }}>{s.reasoning}</div>
              </div>
              <button
                className="btn"
                disabled={created.has(i) || creating === i}
                onClick={() => createLead(i, s)}
                style={{
                  fontSize: 10, padding: '3px 9px', flexShrink: 0,
                  background: created.has(i) ? '#22c55e22' : undefined,
                  borderColor: created.has(i) ? '#22c55e' : undefined,
                  color: created.has(i) ? '#22c55e' : undefined,
                }}
              >
                {created.has(i) ? '✓ Added' : creating === i ? '…' : 'Add →'}
              </button>
            </div>
          ))}
          {suggestions && suggestions.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0' }}>No additional locations suggested for this company.</p>
          )}
          {suggestions && (
            <button
              className="btn"
              style={{ fontSize: 10, marginTop: 4 }}
              onClick={() => { setSuggestions(null); setCreated(new Set()); fetchSuggestions(); }}
            >
              Regenerate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Win-Back Email Panel (for lost leads) ─────────────────────────────────────
function WinBackPanel({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const showToast = useAppStore((s) => s.showToast);

  if (lead.status !== 'lost') return null;

  async function generate() {
    if (!lead.serverId) return;
    setLoading(true);
    setOpen(true);
    try {
      const r = await api.generateWinBackEmail(lead.serverId);
      setEmail({ subject: r.subject, body: r.body });
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    if (!email) return;
    navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div style={{ margin: '12px 0', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, overflow: 'hidden' }}>
      <button
        onClick={() => open ? setOpen(false) : (email ? setOpen(true) : generate())}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'rgba(239,68,68,.06)', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f87171' }}>Generate Win-Back Email</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '12px 14px' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              <span className="spinner" style={{ width: 12, height: 12 }} /> Crafting re-engagement email…
            </div>
          )}
          {email && !loading && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4d8af5', marginBottom: 4 }}>
                Subject: {email.subject}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.6, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
                {email.body}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={copy}>
                  {copied ? '✓ Copied!' : 'Copy Email'}
                </button>
                <button className="btn" style={{ fontSize: 11 }} onClick={generate}>
                  Regenerate
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Referral Ask Panel ─────────────────────────────────────────────────────────
function ReferralAskPanel({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const showToast = useAppStore((s) => s.showToast);

  if (lead.status !== 'won') return null;

  async function generate() {
    if (!lead.serverId) return;
    setLoading(true);
    try {
      const result = await api.generateReferralAsk(lead.serverId);
      setEmail({ subject: result.subject, body: result.body });
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    if (!email) return;
    navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('Referral ask email copied to clipboard');
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <button
        className="btn"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}
        onClick={() => { if (!email && !open) generate(); setOpen((v) => !v); }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ghost-green)" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Ask for Referrals
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 400 }}>AI writes the email</span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {loading && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="spinner" style={{ width: 12, height: 12 }} />Writing referral ask…
            </div>
          )}
          {email && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-faint)', marginBottom: 4 }}>
                Subject
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, fontStyle: 'italic' }}>
                {email.subject}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-faint)', marginBottom: 4 }}>
                Body
              </div>
              <div style={{
                fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6,
                background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6,
                padding: '8px 10px', marginBottom: 8, whiteSpace: 'pre-wrap',
              }}>
                {email.body}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn"
                  style={{ flex: 1, fontSize: 11, fontWeight: 600, background: copied ? '#22c55e22' : undefined, borderColor: copied ? '#22c55e' : undefined, color: copied ? '#22c55e' : undefined }}
                  onClick={copy}
                >
                  {copied ? '✓ Copied' : 'Copy Email'}
                </button>
                <button className="btn" style={{ fontSize: 11 }} onClick={() => { setEmail(null); generate(); }}>
                  Regenerate
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WrapROICalculator({ lead }: { lead: Lead }) {
  const fleet = parseInt(String(lead.fleetSize ?? '10'), 10) || 10;
  const [open, setOpen] = useState(false);
  const [costPerVehicle, setCostPerVehicle] = useState(3500);
  const [milesPerYear, setMilesPerYear] = useState(36500);
  const [lifespanYears, setLifespanYears] = useState(5);
  const [copied, setCopied] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [roiLink, setRoiLink] = useState<{ token: string } | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const showToast = useAppStore((s) => s.showToast);

  async function generateShareLink() {
    if (!lead.serverId) return;
    setLinkLoading(true);
    try {
      const result = await api.getOrCreateRoiLink(lead.serverId);
      setRoiLink(result.link);
      showToast('ROI calculator link ready to share');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLinkLoading(false);
    }
  }

  function copyShareLink() {
    if (!roiLink) return;
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/roi/${roiLink.token}`;
    navigator.clipboard.writeText(url).catch(() => {});
    showToast('ROI calculator link copied to clipboard');
  }

  const totalCost           = fleet * costPerVehicle;
  const annualImpressions   = fleet * milesPerYear * 600; // 600 impressions/mile — industry avg
  const lifetimeImpressions = annualImpressions * lifespanYears;
  const effectiveCPM        = lifetimeImpressions > 0 ? (totalCost / lifetimeImpressions) * 1000 : 0;
  const monthlyImpressions  = Math.round(annualImpressions / 12);

  const allBenchmarks = [
    { name: 'Your Fleet Wraps', cpm: effectiveCPM, isWrap: true },
    ...MEDIA_BENCHMARKS,
  ].sort((a, b) => a.cpm - b.cpm);
  const maxCPM = Math.max(...allBenchmarks.map((b) => b.cpm), 1);

  function fmtN(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
  }

  function copyROI() {
    const text = [
      `WRAP ROI ANALYSIS — ${lead.company}`,
      `Fleet: ${fleet} vehicles · ${milesPerYear.toLocaleString()} mi/yr each`,
      '',
      `Total Investment: $${totalCost.toLocaleString()}`,
      `Over ${lifespanYears} years:`,
      `  • ${fmtN(lifetimeImpressions)} total impressions`,
      `  • ${fmtN(monthlyImpressions)}/month average reach`,
      `  • $${effectiveCPM.toFixed(2)} CPM — vs. $5.21 billboards, $8.40 radio`,
      '',
      `Vehicle wraps deliver ${(5.21 / Math.max(effectiveCPM, 0.01)).toFixed(1)}× better CPM than billboards.`,
      'Source: Outdoor Advertising Association / OAAA industry benchmarks.',
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('ROI summary copied to clipboard');
    });
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
      <button
        className="btn"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Wrap ROI — Ad Value vs. Traditional Media
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {/* Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div className="field-group">
              <label className="field-label">Cost / Vehicle ($)</label>
              <input className="input" type="number" min={500} step={100} value={costPerVehicle}
                onChange={(e) => setCostPerVehicle(Number(e.target.value))} />
            </div>
            <div className="field-group">
              <label className="field-label">Miles / Year / Vehicle</label>
              <input className="input" type="number" min={5000} step={1000} value={milesPerYear}
                onChange={(e) => setMilesPerYear(Number(e.target.value))} />
            </div>
            <div className="field-group">
              <label className="field-label">Wrap Lifespan</label>
              <select className="input" value={lifespanYears} onChange={(e) => setLifespanYears(Number(e.target.value))}>
                {[3, 4, 5, 7].map((y) => <option key={y} value={y}>{y} years</option>)}
              </select>
            </div>
          </div>

          {/* Key metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { val: `$${Math.round(totalCost / 1000)}K`, label: `${fleet} vehicle investment`, color: 'var(--text)' },
              { val: fmtN(monthlyImpressions), label: 'impressions/month', color: '#10b981' },
              { val: `$${effectiveCPM.toFixed(2)}`, label: `CPM over ${lifespanYears}yrs`, color: effectiveCPM < 2.5 ? '#10b981' : effectiveCPM < 5 ? '#f59e0b' : '#ef4444' },
            ].map(({ val, label, color }) => (
              <div key={label} style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1, marginBottom: 3 }}>{val}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* CPM comparison bars */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>
              CPM vs. Traditional Media — lower is better
            </div>
            {allBenchmarks.map((b) => (
              <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 11, minWidth: 120, color: b.isWrap ? 'var(--accent)' : 'var(--text-muted)', fontWeight: b.isWrap ? 700 : 400 }}>
                  {b.name}
                </span>
                <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 99 }}>
                  <div style={{
                    height: '100%', borderRadius: 99, transition: 'width 0.4s ease',
                    width: `${(b.cpm / maxCPM) * 100}%`,
                    background: b.isWrap ? 'var(--accent)' : 'rgba(107,114,128,0.4)',
                  }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: b.isWrap ? 700 : 400, color: b.isWrap ? 'var(--accent)' : 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}>
                  ${b.cpm.toFixed(2)}
                </span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6 }}>
              Based on 600 impressions/mile · OAAA benchmarks
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1, fontSize: 11, fontWeight: 600 }} onClick={copyROI}>
              {copied ? '✓ Copied!' : 'Copy Summary'}
            </button>
            {lead.serverId && (
              <button
                className="btn"
                style={{ flex: 1, fontSize: 11, fontWeight: 600, background: 'var(--signal-blue)', color: '#fff', border: 'none' }}
                onClick={() => { generateShareLink(); setShareModalOpen(true); }}
                disabled={linkLoading}
              >
                {linkLoading ? '…' : 'Share Calculator'}
              </button>
            )}
          </div>

          {shareModalOpen && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)',
            }} onClick={() => setShareModalOpen(false)}>
              <div
                style={{
                  background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
                  maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Share ROI Calculator</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Share this interactive calculator with {lead.contactName || lead.company}. They can adjust vehicle count, cost, and mileage to see their own ROI.
                </p>
                {roiLink ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/roi/${roiLink.token}`}
                      style={{
                        flex: 1, padding: '8px 10px', fontSize: 11, background: 'var(--bg-input)',
                        border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontFamily: 'monospace',
                      }}
                    />
                    <button
                      className="btn"
                      onClick={copyShareLink}
                      style={{ fontSize: 11, fontWeight: 600, padding: '8px 14px' }}
                    >
                      Copy Link
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                    Loading…
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CallScriptPanel({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [script, setScript] = useState<{ opening: string; pitch: string; objections: { q: string; a: string }[]; close: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useAppStore((s) => s.showToast);

  async function generate() {
    if (!lead.serverId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.generateCallScript(lead.serverId);
      setScript(res.script);
    } catch (e: unknown) {
      setError((e as Error).message || 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  function copyAll() {
    if (!script) return;
    const text = [
      `CALL SCRIPT — ${lead.company}`,
      '',
      '📞 OPENING:',
      script.opening,
      '',
      '💡 PITCH:',
      script.pitch,
      '',
      '🛡 OBJECTIONS:',
      ...script.objections.map((o) => `  Q: ${o.q}\n  A: ${o.a}`),
      '',
      '🎯 CLOSE:',
      script.close,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => showToast('Call script copied'));
  }

  if (!lead.serverId) return null;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <button
        className="btn"
        style={{ width: '100%', justifyContent: 'space-between', fontSize: 12 }}
        onClick={() => { setOpen((v) => !v); if (!script && !open) generate(); }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/>
          </svg>
          AI Call Script
          {script && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>· ready</span>}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {loading ? <span className="spinner" style={{ width: 11, height: 11 }} /> : open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div className="error-box">{error}</div>}

          {loading && !script && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="spinner" style={{ width: 12, height: 12 }} />
              Claude is writing your script…
            </div>
          )}

          {script && (
            <>
              {[
                { label: 'Opening', icon: '📞', text: script.opening, color: '#3b82f6' },
                { label: 'Value Pitch', icon: '💡', text: script.pitch, color: '#f59e0b' },
              ].map(({ label, icon, text, color }) => (
                <div key={label} style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                    {icon} {label}
                  </div>
                  <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>{text}</p>
                </div>
              ))}

              {script.objections.length > 0 && (
                <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    🛡 Objection Handlers
                  </div>
                  {script.objections.map((o, i) => (
                    <div key={i} style={{ marginBottom: i < script.objections.length - 1 ? 10 : 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 3 }}>"{o.q}"</div>
                      <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text)', paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
                        {o.a}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                  🎯 Close
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>{script.close}</p>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary" style={{ fontSize: 11, flex: 1, justifyContent: 'center' }} onClick={copyAll}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
                    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Copy Full Script
                </button>
                <button className="btn" style={{ fontSize: 11 }} onClick={generate} disabled={loading}>
                  ↻ Regenerate
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Warm Reference Engine ─────────────────────────────────────────────────────
// Surface WON customers you can name-drop when pitching a new lead.
function WarmReferencesPanel({ lead }: { lead: Lead }) {
  const { data, isLoading } = useQuery({
    queryKey: ['warm-references', lead.serverId],
    queryFn: () => api.getWarmReferences(lead.serverId!),
    enabled: !!lead.serverId,
    staleTime: 5 * 60_000,
  });

  if (!lead.serverId || isLoading || !data?.references?.length) return null;

  const CAT_SHORT: Record<string, string> = {
    fleet: 'Fleet', design: 'Interior', construction: 'Construction',
    dinoc: 'DI-NOC', reatec: 'Rea Tec', colorchange: 'Color Change',
    wallgraphics: 'Wall Graphics', gc_referral: 'GC Referral', racing: 'Motorsport',
  };

  return (
    <section style={{
      margin: '12px 0', padding: '10px 14px', borderRadius: 8,
      background: 'rgba(0,217,126,0.05)', border: '1px solid rgba(0,217,126,0.18)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>🤝</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Social Proof — Drop These References
        </span>
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        You've won similar accounts. Name-drop these in your pitch — fleet managers ask "have you done this before?"
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.references.map((ref) => (
          <div key={ref.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', borderRadius: 6,
            background: 'rgba(0,217,126,0.04)', border: '1px solid rgba(0,217,126,0.1)',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, flexShrink: 0,
              background: 'rgba(0,217,126,0.15)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontWeight: 800, fontSize: 12, color: 'var(--green)',
            }}>
              {ref.company[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ref.company}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {[ref.city, ref.state].filter(Boolean).join(', ')}
                {ref.category ? ` · ${CAT_SHORT[ref.category] || ref.category}` : ''}
                {ref.days_ago <= 365 ? ` · ${Math.round(ref.days_ago / 30)}mo ago` : ''}
              </div>
            </div>
            {ref.job_revenue != null && ref.job_revenue > 0 && (
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>
                ${ref.job_revenue.toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--text-faint)', fontStyle: 'italic' }}>
        "We wrapped {data.references[0]?.company} right here in {data.references[0]?.state} — happy to connect you."
      </p>
    </section>
  );
}

// ── Prospect News Intelligence ────────────────────────────────────────────────
function ProspectNewsPanel({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [articles, setArticles] = useState<Array<{ title: string; link: string; pubDate: string; source: string }> | null>(null);
  const [checked, setChecked] = useState(false);
  const showToast = useAppStore((s) => s.showToast);

  async function fetchNews() {
    if (!lead.serverId) return;
    setLoading(true);
    try {
      const res = await api.checkLeadNews(lead.serverId);
      setArticles(res.articles);
      setChecked(true);
    } catch (e: unknown) {
      showToast((e as Error).message || 'News check failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(d: string) {
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; }
  }

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <button
        className="btn"
        style={{ width: '100%', justifyContent: 'space-between', fontSize: 12 }}
        onClick={() => { setOpen((v) => !v); if (!checked && !open) fetchNews(); }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"/><path d="M9 9h6M9 13h6M9 17h4"/>
          </svg>
          Company News Intel
          {articles !== null && articles.length > 0 && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: 'rgba(77,138,245,0.15)', color: '#4d8af5' }}>
              {articles.length} recent
            </span>
          )}
          {checked && articles?.length === 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>no recent news</span>
          )}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {loading ? <span className="spinner" style={{ width: 11, height: 11 }} /> : open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="spinner" style={{ width: 11, height: 11 }} />
              Searching Google News for {lead.company}…
            </div>
          )}

          {!loading && articles !== null && articles.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No news articles found for "{lead.company}" in the last 30 days.
              {' '}<button className="btn" style={{ fontSize: 10, padding: '1px 6px' }} onClick={fetchNews}>Refresh</button>
            </div>
          )}

          {!loading && articles !== null && articles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: '#4d8af5', marginBottom: 2 }}>
                Use these as icebreakers in your next email or call
              </div>
              {articles.map((a, i) => (
                <div key={i} style={{ padding: '7px 10px', background: 'rgba(77,138,245,0.06)', borderRadius: 7, borderLeft: '2px solid rgba(77,138,245,0.3)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: 3 }}>
                    {a.title.replace(/\s*[-—–]\s*[A-Z][A-Za-z0-9\s&.]+$/, '')}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {a.source && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{a.source}</span>}
                    {a.pubDate && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>· {formatDate(a.pubDate)}</span>}
                    <a href={a.link} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 10, color: '#4d8af5', marginLeft: 'auto', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                      Read →
                    </a>
                  </div>
                </div>
              ))}
              <button className="btn" style={{ fontSize: 10, alignSelf: 'flex-start' }} onClick={fetchNews} disabled={loading}>
                ↺ Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Competitive Intel — analyze a competitor wrap photo, get counter-pitch ────
function CompetitiveIntelPanel({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{
    visualObservations: string[];
    competitorStrengths: string[];
    competitorWeaknesses: string[];
    counterPitch: string;
    keySellingPoints: string[];
    estimatedQuality: 'budget' | 'mid-range' | 'premium';
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const showToast = useAppStore((s) => s.showToast);

  const QUALITY_COLOR = { budget: '#ef4444', 'mid-range': '#f59e0b', premium: '#22c55e' } as const;

  async function analyze(file: File) {
    setLoading(true);
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const res = await api.analyzeCompetitorPhoto(file);
      setAnalysis(res.analysis);
    } catch (e: unknown) {
      setError((e as Error).message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) analyze(file);
    e.target.value = '';
  }

  function reset() {
    setAnalysis(null);
    setPreviewUrl(null);
    setError(null);
  }

  function copyPitch() {
    if (!analysis) return;
    const text = [
      `COMPETITIVE COUNTER-PITCH — ${lead.company}`,
      '',
      `Competitor Wrap Quality: ${analysis.estimatedQuality.toUpperCase()}`,
      '',
      'COUNTER-PITCH:',
      analysis.counterPitch,
      '',
      'KEY SELLING POINTS:',
      ...analysis.keySellingPoints.map((p) => `• ${p}`),
      '',
      'COMPETITOR WEAKNESSES OBSERVED:',
      ...analysis.competitorWeaknesses.map((w) => `• ${w}`),
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => showToast('Competitive pitch copied!'));
  }

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <button
        className="btn"
        style={{ width: '100%', justifyContent: 'space-between', fontSize: 12 }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
          </svg>
          Competitive Intel
          {analysis && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
              {analysis.estimatedQuality}
            </span>
          )}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!analysis && !loading && (
            <>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Upload a competitor's wrap photo. AI will analyze design quality, identify weaknesses, and generate a counter-pitch for {lead.company}.
              </p>
              <div
                style={{
                  border: '2px dashed var(--border)', borderRadius: 8, padding: '20px 16px',
                  textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) analyze(f); }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>📸</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Drop competitor photo here</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>or click to browse · JPG, PNG, WEBP</div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
            </>
          )}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              {previewUrl && <img src={previewUrl} alt="" style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 4 }} />}
              <span className="spinner" style={{ width: 12, height: 12 }} />
              Analyzing competitor wrap…
            </div>
          )}

          {error && <div className="error-box">{error}</div>}

          {analysis && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {previewUrl && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <img src={previewUrl} alt="Competitor wrap" style={{ width: 90, height: 66, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)', marginBottom: 4 }}>Estimated Quality</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: QUALITY_COLOR[analysis.estimatedQuality] }}>
                      {analysis.estimatedQuality.charAt(0).toUpperCase() + analysis.estimatedQuality.slice(1)}
                    </div>
                  </div>
                </div>
              )}

              {/* Counter-pitch — most important */}
              <div style={{ padding: '10px 12px', background: 'rgba(77,138,245,0.08)', borderRadius: 8, borderLeft: '3px solid #4d8af5' }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: '#4d8af5', marginBottom: 6 }}>Counter-Pitch</div>
                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{analysis.counterPitch}</div>
              </div>

              {/* Key selling points */}
              {analysis.keySellingPoints.length > 0 && (
                <div style={{ padding: '8px 12px', background: 'rgba(0,217,126,0.07)', borderRadius: 8, borderLeft: '3px solid #00d97e' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: '#00d97e', marginBottom: 6 }}>Your Advantages</div>
                  {analysis.keySellingPoints.map((p, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text)', marginBottom: 3, display: 'flex', gap: 6 }}>
                      <span style={{ color: '#00d97e', flexShrink: 0 }}>✓</span>{p}
                    </div>
                  ))}
                </div>
              )}

              {/* Weaknesses */}
              {analysis.competitorWeaknesses.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', marginBottom: 6 }}>Competitor Weaknesses</div>
                  {analysis.competitorWeaknesses.map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, display: 'flex', gap: 6 }}>
                      <span style={{ color: '#ef4444', flexShrink: 0 }}>✗</span>{w}
                    </div>
                  ))}
                </div>
              )}

              {/* Strengths */}
              {analysis.competitorStrengths.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', marginBottom: 6 }}>What They Did Right</div>
                  {analysis.competitorStrengths.map((s, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, display: 'flex', gap: 6 }}>
                      <span style={{ color: '#f59e0b', flexShrink: 0 }}>△</span>{s}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={copyPitch}>
                  Copy Pitch
                </button>
                <button className="btn" style={{ fontSize: 12 }} onClick={reset}>
                  ↺ New Photo
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Lead Intelligence Brief ───────────────────────────────────────────────────
function LeadIntelBriefPanel({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const showToast = useAppStore((s) => s.showToast);

  async function generate() {
    if (!lead.serverId) return;
    setLoading(true);
    try {
      const res = await api.generateLeadBrief(lead.serverId);
      if (res.brief) setBrief(res.brief);
    } catch {
      showToast('Failed to generate brief');
    } finally {
      setLoading(false);
    }
  }

  if (!lead.serverId) return null;

  // Parse the structured brief into sections for styled display
  const sections: { header: string; body: string; color: string }[] = [];
  if (brief) {
    const SECTION_MAP: [string, string][] = [
      ['COMPANY FIT', '#4d8af5'],
      ['PITCH ANGLE', 'var(--accent)'],
      ['ICEBREAKER', '#10b981'],
      ['OBJECTIONS', '#f59e0b'],
      ['NEXT ACTION', '#22c55e'],
    ];
    for (const [header, color] of SECTION_MAP) {
      const re = new RegExp(`\\*\\*${header}\\*\\*\\s*[—–-]?\\s*([\\s\\S]*?)(?=\\*\\*[A-Z ]+\\*\\*|$)`);
      const match = brief.match(re);
      if (match) sections.push({ header, body: match[1].trim(), color });
    }
  }

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <button
        className="btn"
        style={{ width: '100%', justifyContent: 'space-between', fontSize: 12 }}
        onClick={() => { setOpen((v) => !v); if (!brief && !open) generate(); }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4d8af5" strokeWidth="2">
            <path d="M12 2l1.9 4.6 4.6 1.9-4.6 1.9-1.9 4.6-1.9-4.6-4.6-1.9 4.6-1.9z"/>
            <path d="M20 3v4M18 5h4"/>
          </svg>
          <span style={{ color: 'var(--text)' }}>AI Lead Brief</span>
          {brief && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>· ready</span>}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {loading ? <span className="spinner" style={{ width: 11, height: 11 }} /> : open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && !brief && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>
              <span className="spinner" style={{ width: 12, height: 12 }} />
              Analyzing {lead.company}…
            </div>
          )}

          {sections.length > 0 ? sections.map((sec) => (
            <div key={sec.header} style={{
              background: `${sec.color}08`,
              border: `1px solid ${sec.color}22`,
              borderLeft: `3px solid ${sec.color}`,
              borderRadius: '0 7px 7px 0',
              padding: '8px 12px',
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: sec.color, marginBottom: 5 }}>
                {sec.header}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {sec.body}
              </div>
            </div>
          )) : brief ? (
            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{brief}</div>
          ) : null}

          {brief && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: 11, flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  navigator.clipboard.writeText(brief);
                  showToast('Brief copied');
                }}
              >
                Copy Brief
              </button>
              <button className="btn" style={{ fontSize: 11 }} onClick={generate} disabled={loading}>
                ↻ Regenerate
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

// ── Follow-Up Recommender ─────────────────────────────────────────────────────
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function FollowUpRecommender({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ['followup-rec', lead.serverId],
    queryFn: () => api.getFollowUpRecommendation(lead.serverId!),
    enabled: open && !!lead.serverId,
    staleTime: 30 * 60_000,
  });
  const showToast = useAppStore((s) => s.showToast);

  async function schedule(dow: number, hour: number) {
    if (!lead.serverId) return;
    const today = new Date();
    const diff = (dow - today.getDay() + 7) % 7 || 7;
    const target = new Date(today);
    target.setDate(today.getDate() + diff);
    const iso = target.toISOString().slice(0, 10);
    try {
      await api.updateLead(lead.serverId, { followupDueAt: iso } as Partial<Lead>);
      showToast(`Follow-up scheduled for ${DOW_SHORT[dow]} ${hour % 12 || 12}${hour >= 12 ? 'pm' : 'am'}`);
    } catch {
      showToast('Could not schedule — try again');
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Best Time to Reach Out
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 11, fontWeight: 400 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
          {isFetching && <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10 }}>Analyzing activity patterns…</p>}
          {data && (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '10px 0 12px' }}>{data.summary}</p>
              {data.dataSource === 'historical' && (
                <div style={{ fontSize: 11, color: '#8b5cf6', marginBottom: 8 }}>
                  ✦ Based on your win history ({data.slots[0]?.hits ?? 0}+ successful contacts)
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.slots.map((slot, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: i === 0 ? '#8b5cf6' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? '#fff' : 'var(--text-muted)' }}>{DOW_SHORT[slot.dow]}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{slot.label}</div>
                      {slot.hits > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{slot.hits} positive responses</div>}
                    </div>
                    <button
                      onClick={() => schedule(slot.dow, slot.hour)}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #8b5cf6', background: 'none', color: '#8b5cf6', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Schedule
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

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

// ── Lead Tag Editor ───────────────────────────────────────────────────────────
const TAG_PALETTE = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#f97316'];
function tagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = ((h << 5) - h + tag.charCodeAt(i)) | 0;
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

function computeSmartTags(lead: Lead): string[] {
  const suggestions: string[] = [];
  const fleet = parseInt(lead.fleetSize || '0', 10) || 0;

  // Fleet size signals
  if (fleet >= 100) suggestions.push('large fleet', '100+ units');
  else if (fleet >= 50) suggestions.push('mid-size fleet');
  else if (fleet >= 25) suggestions.push('small fleet');

  // Category signals
  if (lead.category === 'fleet') suggestions.push('fleet ops', 'recurring potential');
  if (lead.category === 'construction') suggestions.push('contractor', 'project-based');
  if (lead.category === 'gc_referral') suggestions.push('referral source', 'gc partner');
  if (lead.category === 'racing') suggestions.push('sponsorship', 'race team');
  if (lead.category === 'colorchange') suggestions.push('enthusiast', 'premium buyer');
  if (lead.category === 'dinoc') suggestions.push('architectural', 'commercial interior');
  if (lead.category === 'wallgraphics') suggestions.push('interior branding');

  // High-value fleet
  if (fleet >= 50 && (lead.category === 'fleet' || lead.category === 'construction')) {
    suggestions.push('high-value fleet');
  }

  // Status signals
  if (lead.status === 'replied') suggestions.push('engaged', 'warm');
  if (lead.status === 'won') suggestions.push('closed customer', 'repeat potential');
  if (lead.status === 'proposal') suggestions.push('decision pending');
  if (lead.status === 'meeting') suggestions.push('in conversation');
  if (lead.status === 'cold') suggestions.push('needs re-engage');

  // Contact quality signals
  if (lead.email && lead.phone) suggestions.push('fully contactable');
  if (!lead.email && !lead.phone) suggestions.push('needs contact info');
  if (lead.referred_by) suggestions.push('referral');

  return [...new Set(suggestions)];
}

function SmartTagSuggestions({ lead, onApply }: { lead: Lead; onApply: (tag: string) => void }) {
  const existing = new Set(lead.tags ?? []);
  const smart = computeSmartTags(lead).filter((t) => !existing.has(t));
  if (smart.length === 0) return null;
  return (
    <div style={{ marginTop: 6, marginBottom: 4 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)', marginBottom: 5 }}>
        Smart Suggestions
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {smart.map((tag) => (
          <button
            key={tag}
            onClick={() => onApply(tag)}
            style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
              border: '1px dashed var(--border)', background: 'transparent',
              color: 'var(--text-faint)',
            }}
            title={`Add tag: ${tag}`}
          >
            + {tag}
          </button>
        ))}
      </div>
    </div>
  );
}

function TagEditor({ lead, onSave }: { lead: Lead; onSave: (tags: string[]) => void }) {
  const [tags, setTags] = useState<string[]>(lead.tags ?? []);
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: tagData } = useQuery({
    queryKey: ['lead-tags'],
    queryFn: () => api.getLeadTags(),
    staleTime: 5 * 60_000,
  });
  const suggestions = (tagData?.tags ?? []).filter(
    (t) => t.toLowerCase().includes(input.toLowerCase()) && !tags.includes(t)
  ).slice(0, 6);

  function addTag(raw: string) {
    const tag = raw.trim().replace(/,/g, '').slice(0, 40);
    if (!tag || tags.includes(tag)) { setInput(''); return; }
    const next = [...tags, tag];
    setTags(next);
    onSave(next);
    setInput('');
  }

  function removeTag(tag: string) {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    onSave(next);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input); }
    else if (e.key === 'Backspace' && !input && tags.length) removeTag(tags[tags.length - 1]);
    else if (e.key === 'Escape') setShowSuggestions(false);
  }

  return (
    <div className="field-group">
      <label className="field-label">Tags</label>
      <div className="tag-editor-wrap" onClick={() => inputRef.current?.focus()}>
        {tags.map((t) => {
          const c = tagColor(t);
          return (
            <span key={t} className="tag-chip" style={{ background: `${c}18`, color: c, border: `1px solid ${c}44` }}>
              {t}
              <button className="tag-chip-remove" onClick={(e) => { e.stopPropagation(); removeTag(t); }}>×</button>
            </span>
          );
        })}
        <div style={{ position: 'relative', flexGrow: 1, minWidth: 80 }}>
          <input
            ref={inputRef}
            className="tag-input"
            value={input}
            placeholder={tags.length === 0 ? 'Add tags…' : ''}
            onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
            onKeyDown={handleKey}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="tag-suggestions">
              {suggestions.map((s) => (
                <div key={s} className="tag-suggestion-item" onMouseDown={() => addTag(s)}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: tagColor(s), display: 'inline-block', marginRight: 6 }} />
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="field-help">Press Enter or comma to add · Backspace to remove</div>
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
        {!local.email && (
          <FindEmailPanel
            lead={lead}
            onSelectEmail={(email) => { setLocal({ ...local, email }); patch('email', email); }}
          />
        )}
        {local.email && lead.serverId && <UnsubscribedBadge leadId={lead.serverId} />}
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

      <TagEditor
        lead={local}
        onSave={(tags) => {
          setLocal({ ...local, tags });
          if (lead.serverId) updateLead({ serverId: lead.serverId, patch: { tags } as Partial<Lead> });
        }}
      />
      <SmartTagSuggestions
        lead={local}
        onApply={(tag) => {
          const next = [...(local.tags ?? []), tag];
          setLocal({ ...local, tags: next });
          if (lead.serverId) updateLead({ serverId: lead.serverId, patch: { tags: next } as Partial<Lead> });
        }}
      />

      {/* ── Follow-up + Last Contacted ── */}
      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Follow-up Date</label>
          <div style={{ display: 'flex', gap: 5 }}>
            <input
              className="input"
              type="date"
              value={local.followupDueAt?.slice(0, 10) ?? ''}
              onChange={(e) => {
                const val = e.target.value || null;
                setLocal({ ...local, followupDueAt: val });
                if (lead.serverId) updateLead({ serverId: lead.serverId, patch: { followupDueAt: val } });
              }}
              style={{ flex: 1, fontSize: 12 }}
            />
            {/* Snooze quick-buttons */}
            {[3, 7, 14].map((days) => (
              <button
                key={days}
                className="btn"
                style={{ fontSize: 10, padding: '4px 7px', flexShrink: 0 }}
                title={`Snooze ${days} days`}
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + days);
                  const val = d.toISOString().slice(0, 10);
                  setLocal({ ...local, followupDueAt: val });
                  if (lead.serverId) updateLead({ serverId: lead.serverId, patch: { followupDueAt: val } });
                }}
              >
                +{days}d
              </button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Last Contacted</label>
          <div style={{ display: 'flex', gap: 5 }}>
            <input
              className="input"
              type="date"
              value={local.lastContacted?.slice(0, 10) ?? ''}
              onChange={(e) => {
                const val = e.target.value || '';
                setLocal({ ...local, lastContacted: val });
                if (lead.serverId) updateLead({ serverId: lead.serverId, patch: { lastContacted: val } });
              }}
              style={{ flex: 1, fontSize: 12 }}
            />
            <button
              className="btn btn-primary"
              style={{ fontSize: 10, padding: '4px 9px', flexShrink: 0 }}
              title="Mark as contacted today"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                setLocal({ ...local, lastContacted: today });
                if (lead.serverId) updateLead({ serverId: lead.serverId, patch: { lastContacted: today } });
              }}
            >
              Today
            </button>
          </div>
        </div>
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

      {lead.serverId && <SimilarWinsPanel lead={local} />}
      {lead.serverId && !['won','lost'].includes(local.status) && <CallOpenerPanel lead={local} />}
      {lead.serverId && <MeetingPrepPanel lead={local} />}
      {lead.serverId && <DealCoachPanel lead={local} />}
      {lead.serverId && <AICoach lead={local} />}
      {lead.serverId && <FollowUpRecommender lead={local} />}
      {lead.serverId && <WarmReferencesPanel lead={local} />}
      {lead.serverId && <ProspectNewsPanel lead={local} />}
      {lead.serverId && <LeadIntelBriefPanel lead={local} />}
      {lead.serverId && <CompetitiveIntelPanel lead={local} />}
      {lead.serverId && <CallScriptPanel lead={local} />}
      {(local.fleetSize || local.category === 'fleet') && <WrapROICalculator lead={local} />}
      {lead.serverId && local.status === 'won' && <AccountHealthCard lead={local} />}
      {lead.serverId && local.status === 'won' && <WinDebriefPanel lead={local} />}
      {lead.serverId && local.status === 'won' && <ReferralAskPanel lead={local} />}
      {lead.serverId && local.status === 'won' && <MultiLocationExpansion lead={local} />}
      {lead.serverId && local.status === 'lost' && <WinBackPanel lead={local} />}
      {lead.serverId && <ProposalSection lead={local} />}

      {showWinLoss && lead.serverId && local.status === 'won' && (
        <WinLossModal lead={local} onClose={() => setShowWinLoss(false)} />
      )}
      {showWinLoss && lead.serverId && local.status === 'lost' && (
        <LossReasonModal
          leadId={lead.serverId}
          company={local.company}
          onClose={() => setShowWinLoss(false)}
          onDone={() => setShowWinLoss(false)}
        />
      )}
      {showSms && lead.serverId && (
        <SmsModal lead={local} onClose={() => setShowSms(false)} />
      )}
    </div>
  );
}
