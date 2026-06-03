import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as QRCode from 'qrcode';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { InstalledJob, VehicleType, LeadCategory, JobPhoto } from '../../api/types';
import { VEHICLE_TYPE_LABELS, CATEGORIES } from '../../api/types';
import MaterialCatalogModal from '../modals/MaterialCatalogModal';
import FleetAgingMap from './FleetAgingMap';
import FleetSurveyModal from './FleetSurveyModal';

// ── Fleet QR Code Modal ───────────────────────────────────────────────────────
// Generates a QR code pointing to the shop's public quote-request page.
// When someone scans the truck's QR sticker, they land on a branded form
// that creates an inbound lead automatically.
function FleetQRModal({ job, onClose }: { job: InstalledJob; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: quoteLink } = useQuery({
    queryKey: ['quote-link'],
    queryFn: () => api.getMyQuoteLink(),
    staleTime: 60 * 60_000,
  });

  const qrUrl = quoteLink
    ? `${window.location.origin}/quote-request/${quoteLink.token}?ref=fleet&company=${encodeURIComponent(job.company)}`
    : null;

  useEffect(() => {
    if (!qrUrl) return;
    QRCode.toDataURL(qrUrl, {
      width: 280, margin: 2,
      color: { dark: '#0e1018', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).then(setDataUrl).catch(() => {});
  }, [qrUrl]);

  function download() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `wrapos-fleet-qr-${job.company.toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
  }

  function copyUrl() {
    if (!qrUrl) return;
    navigator.clipboard.writeText(qrUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Fleet QR Code</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6, textAlign: 'center', alignSelf: 'stretch' }}>
            Print this QR code and stick it on the wrapped vehicle. When someone scans it, they land on your quote request form — and the lead goes directly into WrapOS.
          </p>

          {dataUrl ? (
            <div style={{ background: '#fff', padding: 12, borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
              <img src={dataUrl} alt="Fleet QR code" style={{ width: 200, height: 200, display: 'block' }} />
            </div>
          ) : (
            <div style={{ width: 224, height: 224, background: 'var(--bg-elev-2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="spinner" />
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', wordBreak: 'break-all' }}>
            {qrUrl || 'Loading…'}
          </div>

          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button className="btn" style={{ flex: 1 }} onClick={copyUrl} disabled={!qrUrl}>
              {copied ? '✓ Copied' : '📋 Copy Link'}
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={download} disabled={!dataUrl}>
              ⬇ Download PNG
            </button>
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.5 }}>
            Tip: Print at 1.5"×1.5" minimum for easy scanning. Add a sticker to the driver's door or rear panel.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Google Review Request Panel ───────────────────────────────────────────────
function ReviewRequestPanel({ job }: { job: InstalledJob }) {
  const showToast = useAppStore((s) => s.showToast);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState(job.company);
  const [googleUrl, setGoogleUrl] = useState('');
  const [sent, setSent] = useState<{ url: string; via: string[] } | null>(null);

  const { data: existing } = useQuery({
    queryKey: ['review-requests', job.id],
    queryFn: () => api.getReviewRequests(job.id),
    staleTime: 60_000,
  });

  const sendMut = useMutation({
    mutationFn: () => api.requestReview(job.id, { clientEmail: email || undefined, clientPhone: phone || undefined, clientName: name || undefined, googleUrl: googleUrl || undefined }),
    onSuccess: (data) => {
      setSent({ url: data.reviewUrl, via: data.sentVia });
      showToast(data.sentVia.length > 0 ? `Review request sent via ${data.sentVia.join(' + ')}!` : 'Review link generated!', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        Send your client a personalized review request via email or SMS. When they click the link, they land on a branded "thank you" page that links directly to your Google review form.
      </p>

      {existing?.requests && existing.requests.length > 0 && (
        <div style={{ background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
            Previous Requests
          </div>
          {existing.requests.map((r) => (
            <div key={r.id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-faint)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
              <span style={{ color: 'var(--text-dim)' }}>{r.client_name || r.company}</span>
              <div style={{ display: 'flex', gap: 8, color: 'var(--text-faint)', fontSize: 11 }}>
                {r.sent_at && <span style={{ color: 'var(--blue)' }}>Sent {fmtDate(r.sent_at)}</span>}
                {r.opened_at && <span style={{ color: 'var(--yellow)' }}>Opened</span>}
                {r.clicked_at && <span style={{ color: 'var(--ghost-green, #00d97e)' }}>Reviewed ✓</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {sent ? (
        <div style={{ background: 'rgba(0,217,126,0.08)', border: '1px solid rgba(0,217,126,0.3)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>🎉</div>
          <div style={{ fontWeight: 700, color: 'var(--ghost-green, #00d97e)', marginBottom: 4 }}>
            {sent.via.length > 0 ? `Sent via ${sent.via.join(' + ')}` : 'Review link created'}
          </div>
          <a href={sent.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--text-faint)', textDecoration: 'underline' }}>{sent.url}</a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Client Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Email (optional)</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@company.com" />
            </div>
            <div className="field-group">
              <label className="field-label">Phone / SMS (optional)</label>
              <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 317 555 0100" />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">Google Review URL (optional)</label>
            <input className="input" value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} placeholder="https://g.page/r/YOUR_PLACE_ID/review" />
            <span style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>Find in Google Business Profile → "Get more reviews"</span>
          </div>
          <button
            className="btn btn-primary"
            disabled={(!email && !phone) || sendMut.isPending}
            onClick={() => sendMut.mutate()}
            style={{ alignSelf: 'flex-start' }}
          >
            {sendMut.isPending ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '⭐ Send Review Request'}
          </button>
          {!email && !phone && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>Enter at least an email or phone number to send the request.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Case Study Generator ──────────────────────────────────────────────────────
function CaseStudyPanel({ job }: { job: InstalledJob }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const showToast = useAppStore((s) => s.showToast);

  const { data, isLoading } = useQuery({
    queryKey: ['case-study', job.id],
    queryFn: () => api.getCaseStudy(job.id),
    staleTime: 5 * 60_000,
  });

  const genMut = useMutation({
    mutationFn: () => api.generateCaseStudy(job.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['case-study', job.id] }); showToast('Case study generated!'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const cs = data?.caseStudy;

  function copyText() {
    if (!cs) return;
    const stats = cs.stats_json;
    const text = [
      cs.headline.toUpperCase(),
      '',
      cs.narrative,
      '',
      `── STATS ──`,
      `Vehicles wrapped: ${stats?.vehicles ?? job.vehicle_count}`,
      `Installed: ${stats?.installMonth ?? job.install_date}`,
      `Wrap lifespan: ${stats?.lifespanYears ?? job.life_years} years`,
      `Est. annual impressions: ${(stats?.impressionsPerYear ?? 0).toLocaleString()}`,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Case study copied!');
    });
  }

  if (isLoading) {
    return <div className="loading"><span className="spinner" /></div>;
  }

  if (!cs) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No case study yet</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Claude will write a professional 3-paragraph case study from this job's data.
        </div>
        <button
          className="btn btn-primary"
          onClick={() => genMut.mutate()}
          disabled={genMut.isPending}
        >
          {genMut.isPending ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Generating…</> : '✦ Generate Case Study'}
        </button>
        {genMut.isError && <div className="error-box" style={{ marginTop: 10 }}>{(genMut.error as Error).message}</div>}
      </div>
    );
  }

  const stats = cs.stats_json;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        padding: '14px 16px', background: 'var(--surface)', borderRadius: 10,
        border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 10, lineHeight: 1.3 }}>{cs.headline}</div>
        <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{cs.narrative}</div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { val: stats?.vehicles ?? job.vehicle_count, label: 'Vehicles' },
          { val: `${stats?.lifespanYears ?? job.life_years}yr`, label: 'Lifespan' },
          { val: stats?.installMonth?.split(' ')?.[0] ?? '—', label: 'Month' },
          { val: `${Math.round((stats?.impressionsPerYear ?? 0) / 1_000_000 * 10) / 10}M`, label: 'Impr/yr' },
        ].map(({ val, label }) => (
          <div key={label} style={{ textAlign: 'center', padding: '8px', background: 'var(--bg-elev)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>{val}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Photos */}
      {cs.photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {cs.photos.slice(0, 4).map((p) => (
            <img key={p.id} src={p.url} alt={p.caption ?? ''} style={{ height: 80, width: 120, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={copyText}>
          {copied ? '✓ Copied!' : 'Copy Case Study'}
        </button>
        {cs.token && (
          <a
            href={`/case-studies/${cs.token}`}
            target="_blank"
            rel="noopener"
            className="btn"
            style={{ fontSize: 12 }}
            title="View public case study page"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Public Page
          </a>
        )}
        <button className="btn" style={{ fontSize: 12 }} onClick={() => genMut.mutate()} disabled={genMut.isPending}>
          {genMut.isPending ? <span className="spinner" style={{ width: 11, height: 11 }} /> : '↻ Regenerate'}
        </button>
      </div>
    </div>
  );
}

// ── Social Post Generator ─────────────────────────────────────────────────────

function SocialPostPanel({ job }: { job: InstalledJob }) {
  const [posts, setPosts] = useState<{ instagram: string; linkedin: string; facebook?: string } | null>(null);
  const [copiedIG, setCopiedIG] = useState(false);
  const [copiedLI, setCopiedLI] = useState(false);
  const [copiedFB, setCopiedFB] = useState(false);

  const genMut = useMutation({
    mutationFn: async () => {
      try {
        return await api.generateJobSocialPost(job.id);
      } catch {
        return await api.generateSocialPost({
          company: job.company, vehicle_type: job.vehicle_type, vehicle_count: job.vehicle_count,
          wrap_category: job.wrap_category, material: job.material ?? undefined, notes: job.notes ?? undefined,
        }) as { posts: { instagram: string; linkedin: string; facebook?: string } };
      }
    },
    onSuccess: (data) => setPosts(data.posts),
  });

  function copy(text: string, which: 'ig' | 'li') {
    navigator.clipboard.writeText(text);
    if (which === 'ig') { setCopiedIG(true); setTimeout(() => setCopiedIG(false), 2000); }
    else { setCopiedLI(true); setTimeout(() => setCopiedLI(false), 2000); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
        Generate ready-to-post Instagram and LinkedIn captions for this completed job.
      </p>
      {!posts && (
        <button
          className="btn btn-primary"
          style={{ alignSelf: 'flex-start' }}
          disabled={genMut.isPending}
          onClick={() => genMut.mutate()}
        >
          {genMut.isPending ? 'Generating…' : 'Generate Social Posts'}
        </button>
      )}
      {posts && (
        <>
          <div className="social-post-card">
            <div className="social-post-platform">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
              Instagram
            </div>
            <div className="social-post-text">{posts.instagram}</div>
            <div className="social-post-actions">
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => copy(posts.instagram, 'ig')}>
                {copiedIG ? '✓ Copied!' : 'Copy'}
              </button>
              <button className="btn" style={{ fontSize: 11 }} onClick={() => genMut.mutate()}>↺ Regenerate</button>
            </div>
          </div>
          <div className="social-post-card">
            <div className="social-post-platform">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              LinkedIn
            </div>
            <div className="social-post-text">{posts.linkedin}</div>
            <div className="social-post-actions">
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => copy(posts.linkedin, 'li')}>
                {copiedLI ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          {posts.facebook && (
            <div className="social-post-card">
              <div className="social-post-platform">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Facebook
              </div>
              <div className="social-post-text">{posts.facebook}</div>
              <div className="social-post-actions">
                <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => { navigator.clipboard.writeText(posts.facebook!); setCopiedFB(true); setTimeout(() => setCopiedFB(false), 2000); }}>
                  {copiedFB ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Payment Status Row ────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, { label: string; color: string }> = {
  unpaid:       { label: 'Unpaid',        color: '#ef4444' },
  deposit_paid: { label: 'Deposit Paid',  color: '#f59e0b' },
  invoice_sent: { label: 'Invoice Sent',  color: '#4d8af5' },
  paid:         { label: 'Paid in Full',  color: '#00d97e' },
  overdue:      { label: 'Overdue',       color: '#dc2626' },
};

function PaymentStatusRow({ job }: { job: InstalledJob }) {
  const qc = useQueryClient();
  const [amountInput, setAmountInput] = useState(String(job.amount_paid ?? ''));
  const status = job.payment_status ?? 'unpaid';
  const meta = PAYMENT_LABELS[status] ?? PAYMENT_LABELS.unpaid;

  const updateMut = useMutation({
    mutationFn: (opts: { payment_status?: string; amount_paid?: number }) =>
      api.updateJobPayment(job.id, { payment_status: opts.payment_status ?? status, amount_paid: opts.amount_paid }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['installed-jobs'] }),
  });

  const actions: { label: string; next: string }[] = [];
  if (status === 'unpaid' || status === 'overdue') actions.push({ label: 'Mark Deposit Paid', next: 'deposit_paid' });
  if (status !== 'invoice_sent' && status !== 'paid') actions.push({ label: 'Mark Invoice Sent', next: 'invoice_sent' });
  if (status !== 'paid') actions.push({ label: 'Mark Paid in Full', next: 'paid' });
  if (status !== 'overdue' && status !== 'paid') actions.push({ label: 'Mark Overdue', next: 'overdue' });

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)', marginBottom: 10 }}>
        Payment Status
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, background: `${meta.color}22`, padding: '3px 8px', borderRadius: 4 }}>
          {meta.label}
        </span>
        {job.deposit_paid_at && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Deposit: {new Date(job.deposit_paid_at).toLocaleDateString()}</span>
        )}
        {job.invoice_sent_at && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Invoice: {new Date(job.invoice_sent_at).toLocaleDateString()}</span>
        )}
        {job.paid_at && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Paid: {new Date(job.paid_at).toLocaleDateString()}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <input
          className="input"
          type="number"
          min={0}
          step={100}
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          onBlur={() => {
            const v = Number(amountInput);
            if (!isNaN(v) && v !== (job.amount_paid ?? 0)) {
              updateMut.mutate({ amount_paid: v });
            }
          }}
          placeholder="Amount received"
          style={{ width: 130, fontSize: 12 }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {job.amount_paid && job.job_revenue
            ? `$${Number(job.job_revenue - job.amount_paid).toLocaleString()} remaining`
            : ''}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {actions.map((a) => (
          <button
            key={a.next}
            className="btn"
            style={{ fontSize: 11 }}
            disabled={updateMut.isPending}
            onClick={() => updateMut.mutate({ payment_status: a.next })}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Photo Gallery (inside job modal) ─────────────────────────────────────────

function PhotoGallery({ jobId }: { jobId: number }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [photoType, setPhotoType] = useState<string>('before');
  const [uploadQueue, setUploadQueue] = useState<{ file: File; id: string; done: boolean }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['job-photos', jobId],
    queryFn: () => api.getJobPhotos(jobId),
    staleTime: 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: (photoId: number) => api.deleteJobPhoto(photoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-photos', jobId] }),
  });

  const uploadFiles = useCallback(async (files: File[]) => {
    const entries = files.map((f) => ({ file: f, id: Math.random().toString(36).slice(2), done: false }));
    setUploadQueue((q) => [...q, ...entries]);
    for (const entry of entries) {
      try {
        await api.uploadJobPhoto(jobId, entry.file, '', photoType);
        setUploadQueue((q) => q.map((e) => e.id === entry.id ? { ...e, done: true } : e));
      } catch { /* individual upload failure — non-fatal */ }
    }
    qc.invalidateQueries({ queryKey: ['job-photos', jobId] });
    setTimeout(() => setUploadQueue([]), 1200);
  }, [jobId, photoType, qc]);

  async function handleUpload(file: File) {
    await api.uploadJobPhoto(jobId, file, caption, photoType);
    qc.invalidateQueries({ queryKey: ['job-photos', jobId] });
    setCaption('');
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length) uploadFiles(files);
  }

  const photos: JobPhoto[] = data?.photos ?? [];
  const TYPE_COLORS: Record<string, string> = { before: '#f59e0b', after: '#22c55e', detail: '#6366f1', other: '#6b7280' };
  const uploading = uploadQueue.some((e) => !e.done);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
          <label className="field-label">Type</label>
          <select className="input" value={photoType} onChange={(e) => setPhotoType(e.target.value)}>
            <option value="before">Before</option>
            <option value="after">After</option>
            <option value="detail">Detail</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field-group" style={{ flex: 2, minWidth: 160 }}>
          <label className="field-label">Caption (single upload only)</label>
          <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Driver side — finished" />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length === 1) handleUpload(files[0]);
              else if (files.length > 1) uploadFiles(files);
            }} />
          <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? `Uploading ${uploadQueue.filter((e) => !e.done).length}…` : '+ Add Photo(s)'}
          </button>
        </div>
      </div>

      {/* Drag-drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${isDragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 10, padding: '16px', textAlign: 'center', fontSize: 12,
          color: isDragOver ? 'var(--accent)' : 'var(--text-faint)',
          background: isDragOver ? 'rgba(244,85,28,.04)' : 'transparent',
          transition: 'all 0.15s ease', cursor: 'pointer',
        }}
        onClick={() => fileRef.current?.click()}
      >
        {uploadQueue.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {uploadQueue.map((e) => (
              <span key={e.id} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: e.done ? 'rgba(34,197,94,.15)' : 'rgba(244,85,28,.12)', color: e.done ? '#22c55e' : 'var(--accent)' }}>
                {e.done ? '✓' : '⋯'} {e.file.name.slice(0, 16)}
              </span>
            ))}
          </div>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 4, display: 'block', margin: '0 auto 6px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Drop images here or click to bulk upload
          </>
        )}
      </div>

      {isLoading && <div className="pv-loading"><span className="spinner" /></div>}
      {!isLoading && photos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          No photos yet. Add before and after shots to document the job.
        </div>
      )}

      <div className="photo-grid">
        {photos.map((p) => (
          <div key={p.id} className="photo-card">
            <img src={p.image_data} alt={p.caption || p.photo_type} className="photo-card-img" />
            <div className="photo-card-overlay">
              <span className="photo-type-badge" style={{ background: TYPE_COLORS[p.photo_type] ?? '#6b7280' }}>
                {p.photo_type}
              </span>
              {p.caption && <span className="photo-caption">{p.caption}</span>}
              <button className="photo-delete" onClick={() => deleteMut.mutate(p.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Job Form Modal ────────────────────────────────────────────────────────────

interface JobModalProps {
  job: InstalledJob | 'new';
  onClose: () => void;
}

// ── Job Expenses Tab ──────────────────────────────────────────────────────────

import type { JobVehicle, JobExpense } from '../../api/types';

const EXPENSE_CATS: Array<{ value: JobExpense['category']; label: string; icon: string }> = [
  { value: 'fuel',      label: 'Fuel',       icon: '⛽' },
  { value: 'parking',   label: 'Parking',    icon: '🅿' },
  { value: 'shipping',  label: 'Shipping',   icon: '📦' },
  { value: 'design',    label: 'Design',     icon: '🎨' },
  { value: 'equipment', label: 'Equipment',  icon: '🔧' },
  { value: 'travel',    label: 'Travel',     icon: '✈' },
  { value: 'misc',      label: 'Misc',       icon: '💰' },
];

function JobExpensesTab({ job }: { job: InstalledJob }) {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);

  const { data, isLoading } = useQuery({
    queryKey: ['job-expenses', job.id],
    queryFn: () => api.getJobExpenses(job.id),
    staleTime: 30_000,
  });

  const expenses = data?.expenses ?? [];
  const total = data?.total ?? 0;

  const [showAdd, setShowAdd] = useState(false);
  const [cat, setCat] = useState<JobExpense['category']>('misc');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');

  const addMut = useMutation({
    mutationFn: () => api.addJobExpense(job.id, {
      category: cat, description: desc, amount: Number(amount),
      expense_date: date || undefined, receipt_note: note || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-expenses', job.id] });
      setShowAdd(false); setCat('misc'); setDesc(''); setAmount(''); setDate(''); setNote('');
      showToast('Expense added', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (eid: number) => api.deleteJobExpense(job.id, eid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-expenses', job.id] }),
  });

  const revenue = Number(job.job_revenue) || 0;
  const materialCost = Number(job.material_cost) || 0;
  const trueMargin = revenue > 0 ? Math.round(((revenue - materialCost - total) / revenue) * 100) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Summary strip */}
      {expenses.length > 0 && (
        <div style={{ display: 'flex', gap: 12, background: 'var(--bg-elev-2)', borderRadius: 8, padding: '10px 14px' }}>
          <div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', marginBottom: 2 }}>Total Expenses</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          {trueMargin !== null && revenue > 0 && (
            <div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', marginBottom: 2 }}>True Margin</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: trueMargin >= 40 ? '#22c55e' : trueMargin >= 20 ? '#f59e0b' : '#ef4444' }}>{trueMargin}%</div>
            </div>
          )}
        </div>
      )}

      {/* Expense list */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><span className="spinner" /></div>
      ) : expenses.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          No expenses logged yet. Track fuel, parking, shipping, and other costs that reduce actual margin.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {expenses.map((e) => {
            const catInfo = EXPENSE_CATS.find((c) => c.value === e.category) ?? EXPENSE_CATS[6];
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elev)', borderRadius: 6, padding: '7px 10px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{catInfo.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{e.description}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    {catInfo.label}
                    {e.expense_date ? ` · ${new Date(e.expense_date).toLocaleDateString()}` : ''}
                    {e.receipt_note ? ` · ${e.receipt_note}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b', flexShrink: 0 }}>
                  ${Number(e.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <button
                  className="btn"
                  style={{ fontSize: 10, padding: '2px 7px', color: 'var(--red)', flexShrink: 0 }}
                  onClick={() => deleteMut.mutate(e.id)}
                  disabled={deleteMut.isPending}
                >✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add expense form */}
      {showAdd ? (
        <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {EXPENSE_CATS.map((c) => (
              <button
                key={c.value}
                className={`btn${cat === c.value ? ' btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={() => setCat(c.value)}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
          <div className="field-row">
            <div className="field-group" style={{ flex: 2 }}>
              <label className="field-label">Description</label>
              <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Fuel for 200mi delivery drive" style={{ fontSize: 12 }} />
            </div>
            <div className="field-group" style={{ flex: '0 0 100px' }}>
              <label className="field-label">Amount ($)</label>
              <input className="input" type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="47.50" style={{ fontSize: 12 }} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Date (optional)</label>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ fontSize: 12 }} />
            </div>
            <div className="field-group">
              <label className="field-label">Receipt / Note (optional)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Receipt #4521" style={{ fontSize: 12 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12 }}
              disabled={!desc.trim() || !amount || addMut.isPending}
              onClick={() => addMut.mutate()}
            >
              {addMut.isPending ? 'Adding…' : 'Add Expense'}
            </button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={() => setShowAdd(true)}>
          + Add Expense
        </button>
      )}
    </div>
  );
}

// ── Vehicle Intake Tab ────────────────────────────────────────────────────────

function VehicleIntakeTab({ job }: { job: InstalledJob }) {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);

  const { data, isLoading } = useQuery({
    queryKey: ['job-vehicles', job.id],
    queryFn: () => api.getJobVehicles(job.id),
    staleTime: 30_000,
  });

  const vehicles = data?.vehicles ?? [];
  const wrappedCount = vehicles.filter((v) => v.wrapped).length;

  const EMPTY_FORM = (): Partial<JobVehicle> => ({
    vehicle_num: vehicles.length + 1,
    year: '', make: '', model: '', color: '', vin: '', plate: '',
    mileage: undefined, condition_notes: '',
  });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Partial<JobVehicle>>(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState('');

  const addMut = useMutation({
    mutationFn: () => api.addJobVehicle(job.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-vehicles', job.id] });
      setForm(EMPTY_FORM());
      setShowAdd(false);
      showToast('Vehicle added', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const toggleWrapped = useMutation({
    mutationFn: ({ vehicleId, wrapped }: { vehicleId: number; wrapped: boolean }) =>
      api.updateJobVehicle(job.id, vehicleId, { wrapped }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-vehicles', job.id] }),
  });

  const saveNotesMut = useMutation({
    mutationFn: (vehicleId: number) => api.updateJobVehicle(job.id, vehicleId, { condition_notes: editNotes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-vehicles', job.id] });
      setEditId(null);
      showToast('Notes saved', 'success');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (vehicleId: number) => api.deleteJobVehicle(job.id, vehicleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-vehicles', job.id] }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Progress header */}
      {vehicles.length > 0 && (
        <div style={{ display: 'flex', gap: 12, background: 'var(--bg-elev-2)', borderRadius: 8, padding: '10px 14px', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', marginBottom: 2 }}>Wrap Progress</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: wrappedCount === vehicles.length ? '#10b981' : 'var(--accent)' }}>
              {wrappedCount} / {vehicles.length} wrapped
            </div>
          </div>
          <div style={{ width: 80, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${vehicles.length > 0 ? (wrappedCount / vehicles.length) * 100 : 0}%`, background: wrappedCount === vehicles.length ? '#10b981' : 'var(--accent)', borderRadius: 4, transition: 'width .3s' }} />
          </div>
        </div>
      )}

      {/* Vehicle list */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><span className="spinner" /></div>
      ) : vehicles.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          No vehicles logged yet. Add each vehicle in the fleet to track intake condition and wrap progress. This creates a legal record of pre-existing damage.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {vehicles.map((v) => (
            <div key={v.id} style={{ background: 'var(--bg-elev)', borderRadius: 6, border: `1px solid ${v.wrapped ? '#10b98130' : 'var(--border)'}`, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                {/* Wrap checkbox */}
                <button
                  title={v.wrapped ? 'Mark as not wrapped' : 'Mark as wrapped'}
                  style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${v.wrapped ? '#10b981' : 'var(--text-faint)'}`, background: v.wrapped ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: '#fff', fontSize: 12, fontWeight: 900 }}
                  onClick={() => toggleWrapped.mutate({ vehicleId: v.id, wrapped: !v.wrapped })}
                  disabled={toggleWrapped.isPending}
                >
                  {v.wrapped ? '✓' : ''}
                </button>

                {/* Vehicle info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    {v.vehicle_num ? `#${v.vehicle_num} ` : ''}
                    {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                    {v.color ? <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>{v.color}</span> : null}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 1 }}>
                    {v.plate && <span>🏷 {v.plate}</span>}
                    {v.vin && <span title={v.vin}>VIN: {v.vin.slice(-6)}</span>}
                    {v.mileage && <span>{v.mileage.toLocaleString()} mi</span>}
                    {v.wrapped_at && <span style={{ color: '#10b981' }}>Wrapped {new Date(v.wrapped_at).toLocaleDateString()}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="btn"
                    style={{ fontSize: 10, padding: '2px 8px' }}
                    onClick={() => { setEditId(editId === v.id ? null : v.id); setEditNotes(v.condition_notes || ''); }}
                  >Notes</button>
                  <button
                    className="btn"
                    style={{ fontSize: 10, padding: '2px 8px', color: 'var(--red)' }}
                    onClick={() => deleteMut.mutate(v.id)}
                    disabled={deleteMut.isPending}
                  >✕</button>
                </div>
              </div>

              {/* Condition notes */}
              {(v.condition_notes || editId === v.id) && (
                <div style={{ padding: '0 12px 10px', borderTop: '1px solid var(--border)' }}>
                  {editId === v.id ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <input
                        className="input"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Pre-existing damage, scratches, dents…"
                        style={{ flex: 1, fontSize: 12 }}
                      />
                      <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => saveNotesMut.mutate(v.id)} disabled={saveNotesMut.isPending}>Save</button>
                      <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setEditId(null)}>✕</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 6, fontStyle: 'italic' }}>
                      ⚠ {v.condition_notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add vehicle form */}
      {showAdd ? (
        <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)' }}>Add Vehicle</div>
          <div className="field-row">
            <div className="field-group" style={{ flex: '0 0 60px' }}>
              <label className="field-label">#</label>
              <input className="input" type="number" min={1} value={form.vehicle_num ?? ''} onChange={(e) => setForm((f) => ({ ...f, vehicle_num: e.target.value ? Number(e.target.value) : undefined }))} style={{ fontSize: 12 }} />
            </div>
            <div className="field-group" style={{ flex: '0 0 70px' }}>
              <label className="field-label">Year</label>
              <input className="input" value={form.year ?? ''} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} placeholder="2022" style={{ fontSize: 12 }} />
            </div>
            <div className="field-group">
              <label className="field-label">Make</label>
              <input className="input" value={form.make ?? ''} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} placeholder="Ford" style={{ fontSize: 12 }} />
            </div>
            <div className="field-group">
              <label className="field-label">Model</label>
              <input className="input" value={form.model ?? ''} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="Transit" style={{ fontSize: 12 }} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Color</label>
              <input className="input" value={form.color ?? ''} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} placeholder="White" style={{ fontSize: 12 }} />
            </div>
            <div className="field-group">
              <label className="field-label">Plate</label>
              <input className="input" value={form.plate ?? ''} onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))} placeholder="ABC1234" style={{ fontSize: 12 }} />
            </div>
            <div className="field-group">
              <label className="field-label">Mileage</label>
              <input className="input" type="number" min={0} value={form.mileage ?? ''} onChange={(e) => setForm((f) => ({ ...f, mileage: e.target.value ? Number(e.target.value) : undefined }))} placeholder="47000" style={{ fontSize: 12 }} />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">VIN (optional)</label>
            <input className="input" value={form.vin ?? ''} onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value }))} placeholder="1FTMF1CB0AKA12345" style={{ fontSize: 12 }} />
          </div>
          <div className="field-group">
            <label className="field-label">Pre-Existing Damage / Condition Notes</label>
            <input className="input" value={form.condition_notes ?? ''} onChange={(e) => setForm((f) => ({ ...f, condition_notes: e.target.value }))} placeholder="Small dent rear bumper, scratch driver door…" style={{ fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => addMut.mutate()} disabled={addMut.isPending}>
              {addMut.isPending ? 'Adding…' : 'Add Vehicle'}
            </button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={() => setShowAdd(true)}>
          + Log Vehicle
        </button>
      )}

      {vehicles.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.6 }}>
          Check the box when each vehicle is wrapped. Condition notes are printed on the Completion Receipt as pre-existing damage disclosure.
        </div>
      )}
    </div>
  );
}

// ── Subcontractor Tab ─────────────────────────────────────────────────────────

function SubcontractorTab({ job }: { job: InstalledJob }) {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);
  const [addingSubId, setAddingSubId] = useState<number | null>(null);
  const [hours, setHours] = useState('');
  const [laborCost, setLaborCost] = useState('');
  const [notes, setNotes] = useState('');

  const { data: subsData } = useQuery({
    queryKey: ['subcontractors'],
    queryFn: () => api.getSubcontractors(),
    staleTime: 5 * 60_000,
  });
  const { data: assignData, isLoading } = useQuery({
    queryKey: ['job-subs', job.id],
    queryFn: () => api.getJobSubcontractors(job.id),
    staleTime: 30_000,
  });

  const assignMut = useMutation({
    mutationFn: () => api.assignSubcontractor(job.id, {
      sub_id: addingSubId!,
      hours: hours ? Number(hours) : undefined,
      labor_cost: laborCost ? Number(laborCost) : undefined,
      notes: notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-subs', job.id] });
      qc.invalidateQueries({ queryKey: ['installed-jobs'] });
      setAddingSubId(null);
      setHours('');
      setLaborCost('');
      setNotes('');
      showToast('Subcontractor assigned', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => api.removeSubAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-subs', job.id] });
      qc.invalidateQueries({ queryKey: ['installed-jobs'] });
    },
  });

  const [markPaidId, setMarkPaidId] = useState<number | null>(null);
  const [markPaidAmount, setMarkPaidAmount] = useState('');

  const markPaidMut = useMutation({
    mutationFn: ({ id, amount, undo }: { id: number; amount?: number; undo?: boolean }) =>
      api.markSubAssignmentPaid(id, amount, undo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-subs', job.id] });
      qc.invalidateQueries({ queryKey: ['sub-payables'] });
      setMarkPaidId(null);
      setMarkPaidAmount('');
      showToast('Payment recorded', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const assignments = assignData?.assignments ?? [];
  const subs = subsData?.subs ?? [];
  const totalSubCost = assignments.reduce((s, a) => s + Number(a.labor_cost), 0);
  const revenue = Number(job.job_revenue) || 0;
  const materialCost = Number(job.material_cost) || 0;
  const trueCost = materialCost + totalSubCost;
  const trueMargin = revenue > 0 ? Math.round(((revenue - trueCost) / revenue) * 100) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Margin impact */}
      {revenue > 0 && totalSubCost > 0 && (
        <div style={{ background: 'var(--bg-elev-2)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 16 }}>
          <div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', marginBottom: 2 }}>Sub Labor</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b' }}>${totalSubCost.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', marginBottom: 2 }}>True Cost</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>${trueCost.toLocaleString()}</div>
          </div>
          {trueMargin !== null && (
            <div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', marginBottom: 2 }}>True Margin</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: trueMargin >= 40 ? '#22c55e' : trueMargin >= 20 ? '#f59e0b' : '#ef4444' }}>
                {trueMargin}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assigned subs */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><span className="spinner" /></div>
      ) : assignments.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {assignments.map((a) => (
            <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-elev)', borderRadius: 6, padding: '8px 12px', border: `1px solid ${a.paid_at ? '#10b98130' : 'var(--border)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {a.sub_name}
                    {a.paid_at && (
                      <span style={{ fontSize: 9, fontWeight: 700, background: '#10b98120', color: '#10b981', padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>PAID</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {a.hours ? `${a.hours}h` : ''}
                    {a.hours && a.labor_cost ? ' · ' : ''}
                    {a.labor_cost ? `$${Number(a.labor_cost).toLocaleString()} owed` : ''}
                    {a.paid_amount ? ` · $${Number(a.paid_amount).toLocaleString()} paid` : ''}
                    {a.notes ? ` · ${a.notes}` : ''}
                    {a.specialty ? <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>{a.specialty}</span> : null}
                    {a.paid_at ? <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>on {new Date(a.paid_at).toLocaleDateString()}</span> : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {!a.paid_at ? (
                    <button
                      className="btn"
                      style={{ fontSize: 10, color: '#10b981', padding: '2px 8px', background: '#10b98112', border: '1px solid #10b98130' }}
                      onClick={() => { setMarkPaidId(a.id); setMarkPaidAmount(String(a.labor_cost || '')); }}
                    >Mark Paid</button>
                  ) : (
                    <button
                      className="btn"
                      style={{ fontSize: 10, color: 'var(--text-faint)', padding: '2px 8px' }}
                      onClick={() => markPaidMut.mutate({ id: a.id, undo: true })}
                      disabled={markPaidMut.isPending}
                    >Undo</button>
                  )}
                  <button
                    className="btn"
                    style={{ fontSize: 10, color: 'var(--red)', padding: '2px 8px' }}
                    onClick={() => removeMut.mutate(a.id)}
                    disabled={removeMut.isPending}
                  >Remove</button>
                </div>
              </div>
              {markPaidId === a.id && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Amount paid:</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={50}
                    value={markPaidAmount}
                    onChange={(e) => setMarkPaidAmount(e.target.value)}
                    style={{ fontSize: 12, width: 100, padding: '3px 8px' }}
                  />
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 11, padding: '3px 10px' }}
                    disabled={markPaidMut.isPending}
                    onClick={() => markPaidMut.mutate({ id: a.id, amount: markPaidAmount ? Number(markPaidAmount) : undefined })}
                  >Confirm</button>
                  <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setMarkPaidId(null)}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No subcontractors assigned to this job yet.</p>
      )}

      {/* Add sub form */}
      {subs.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>
          No subcontractors saved yet. Add them in Settings → Subcontractors, then assign them here.
        </p>
      ) : addingSubId === null ? (
        <button className="btn" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={() => setAddingSubId(subs[0].id)}>
          + Assign Subcontractor
        </button>
      ) : (
        <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="field-group">
            <label className="field-label">Subcontractor</label>
            <select className="input" value={addingSubId} onChange={(e) => setAddingSubId(Number(e.target.value))}>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}{s.specialty ? ` (${s.specialty})` : ''}</option>)}
            </select>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Hours</label>
              <input className="input" type="number" min={0} step={0.5} value={hours} onChange={(e) => { setHours(e.target.value); const sub = subs.find((s) => s.id === addingSubId); if (sub?.labor_rate && e.target.value) setLaborCost(String(Math.round(Number(e.target.value) * Number(sub.labor_rate)))); }} placeholder="0" />
            </div>
            <div className="field-group">
              <label className="field-label">Labor Cost ($)</label>
              <input className="input" type="number" min={0} step={50} value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">Notes (optional)</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="install only, primer included…" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={!addingSubId || assignMut.isPending} onClick={() => assignMut.mutate()}>
              {assignMut.isPending ? 'Assigning…' : 'Assign'}
            </button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => setAddingSubId(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Material PO Panel ─────────────────────────────────────────────────────────

// Sq ft per vehicle type (full wrap, industry standard)
const VEHICLE_SQFT: Record<string, number> = {
  cargo_van: 340, box_truck: 570, sprinter: 320, pickup: 280,
  semi_tractor: 620, semi_trailer: 1040, '53ft_trailer': 1180,
  flatbed: 480, bus: 980, rv: 1200, suv: 230, passenger_car: 195,
  food_truck: 440, boat: 260, trailer: 360, other: 350,
};

// Standard roll: 25" × 50' → ~1.25m² per linear ft
// 25" = 2.083 ft wide; 50' long = 2.083 × 50 = 104.17 sq ft per roll
const SQFT_PER_ROLL = 25 / 12 * 50; // ~104.2 sq ft

// ── Material Cost Estimator ───────────────────────────────────────────────────
// Shown in the job creation form when material_cost is empty.
// Calls /materials/estimate with the selected vehicle_type + vehicle_count,
// then lets the user click a suggestion to auto-fill material_cost.
function MaterialCostEstimator({ vehicleType, vehicleCount, onApply }: {
  vehicleType: string;
  vehicleCount: number;
  onApply: (cost: number) => void;
}) {
  const [coverage, setCoverage] = useState<'full' | 'partial' | 'spot'>('full');
  const { data, isLoading } = useQuery({
    queryKey: ['mat-estimate', vehicleType, vehicleCount, coverage],
    queryFn: () => api.estimateMaterialCost({ vehicle_type: vehicleType, vehicle_count: vehicleCount, coverage }),
    staleTime: 60_000,
    enabled: vehicleCount >= 1,
  });

  if (isLoading) return (
    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Estimating material cost…</div>
  );
  if (!data?.suggestions?.length) return (
    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
      Add materials to inventory (Settings → Materials) to get cost estimates here.
    </div>
  );

  return (
    <div style={{ marginTop: 6, padding: '10px 12px', background: 'var(--bg-base)', border: '1px solid var(--border-soft)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)' }}>
          Material Estimate · {data.totalSqftLow}–{data.totalSqftHigh} sq ft
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['full', 'partial', 'spot'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCoverage(c)}
              style={{
                fontSize: 10, padding: '2px 7px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
                background: coverage === c ? 'var(--accent)' : 'transparent',
                color: coverage === c ? '#fff' : 'var(--text-faint)',
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {data.suggestions.slice(0, 4).map((s) => (
          <div
            key={s.id}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-soft)' }}
          >
            <div>
              <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{s.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                {s.rollsNeededLow}–{s.rollsNeededHigh} rolls · {s.rollsInStock} in stock
                {!s.canCoverWithStock && (
                  <span style={{ color: '#f59e0b', marginLeft: 4 }}>⚠ need {s.shortfall} more</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onApply(s.costLow)}
              style={{
                fontSize: 11, padding: '3px 10px', border: '1px solid var(--accent)', borderRadius: 5,
                background: 'transparent', color: 'var(--accent)', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ${s.costLow.toLocaleString()}–{s.costHigh.toLocaleString()} ↗
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MaterialPOPanel({ job }: { job: InstalledJob }) {
  const showToast = useAppStore((s) => s.showToast);
  const [coverage, setCoverage] = useState<'full' | 'partial' | 'spot'>('full');
  const [wastePct, setWastePct] = useState(15);
  const [material, setMaterial] = useState(job.material ?? '3M IJ180Cv3');
  const [costPerRoll, setCostPerRoll] = useState('');

  const COVERAGE_FACTOR = { full: 1.0, partial: 0.6, spot: 0.25 };
  const baseSqFt = (VEHICLE_SQFT[job.vehicle_type] ?? 350) * job.vehicle_count * COVERAGE_FACTOR[coverage];
  const withWaste = baseSqFt * (1 + wastePct / 100);
  const rollsNeeded = Math.ceil(withWaste / SQFT_PER_ROLL);
  const totalCost = costPerRoll ? rollsNeeded * Number(costPerRoll) : null;

  const vehicleLabel = VEHICLE_TYPE_LABELS[job.vehicle_type as VehicleType] ?? job.vehicle_type;

  function generatePO() {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const lines = [
      `PURCHASE ORDER`,
      `Date: ${today}`,
      `Job: ${job.company} — ${job.vehicle_count}× ${vehicleLabel}`,
      ``,
      `Material: ${material}`,
      `Roll Size: 25" × 50' (~104 sq ft/roll)`,
      ``,
      `Vehicle sq ft (${coverage} wrap): ${Math.round(baseSqFt).toLocaleString()} sq ft`,
      `Waste factor (+${wastePct}%): ${Math.round(withWaste).toLocaleString()} sq ft`,
      ``,
      `ROLLS TO ORDER: ${rollsNeeded} rolls`,
      totalCost ? `Estimated Cost: $${totalCost.toLocaleString()}` : '',
      ``,
      `Notes: ${job.notes ?? ''}`,
    ].filter((l) => l !== undefined).join('\n');
    navigator.clipboard.writeText(lines).then(() => showToast('PO copied to clipboard!', 'success'));
  }

  function printPO() {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const html = `<!DOCTYPE html><html><head><title>PO - ${job.company}</title>
    <style>body{font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto;}h1{font-size:18px;}table{width:100%;border-collapse:collapse;margin:20px 0;}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e5e7eb;}th{background:#f9fafb;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;}.total{font-size:18px;font-weight:800;color:#f4551c;}</style>
    </head><body>
    <h1>Purchase Order</h1>
    <p><strong>Date:</strong> ${today}<br><strong>Job:</strong> ${job.company} — ${job.vehicle_count}× ${vehicleLabel}</p>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Notes</th></tr></thead><tbody>
    <tr><td>${material}</td><td class="total">${rollsNeeded} rolls</td><td>25"×50' rolls · ${coverage} wrap · +${wastePct}% waste</td></tr>
    </tbody></table>
    <p><strong>Base sq ft:</strong> ${Math.round(baseSqFt).toLocaleString()}<br>
    <strong>With waste:</strong> ${Math.round(withWaste).toLocaleString()} sq ft<br>
    ${totalCost ? `<strong>Estimated cost:</strong> $${totalCost.toLocaleString()}<br>` : ''}
    </p>
    ${job.notes ? `<p><strong>Notes:</strong> ${job.notes}</p>` : ''}
    <p style="font-size:11px;color:#999;margin-top:32px">Generated by WrapOS</p>
    </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { label: 'Base Sq Ft', value: Math.round(baseSqFt).toLocaleString() },
          { label: `With ${wastePct}% Waste`, value: Math.round(withWaste).toLocaleString() },
          { label: 'Rolls to Order', value: String(rollsNeeded), accent: true },
        ].map((m) => (
          <div key={m.label} style={{ background: 'var(--bg-elev-2)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-1px', color: m.accent ? 'var(--accent)' : 'var(--text)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Config */}
      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Coverage Level</label>
          <select className="input" value={coverage} onChange={(e) => setCoverage(e.target.value as typeof coverage)} style={{ fontSize: 12 }}>
            <option value="full">Full Wrap (100%)</option>
            <option value="partial">Partial Wrap (~60%)</option>
            <option value="spot">Spot Graphics (~25%)</option>
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Waste Factor</label>
          <select className="input" value={wastePct} onChange={(e) => setWastePct(Number(e.target.value))} style={{ fontSize: 12 }}>
            <option value="10">10% (experienced)</option>
            <option value="15">15% (standard)</option>
            <option value="20">20% (complex)</option>
            <option value="25">25% (inexperienced)</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field-group" style={{ flex: 2 }}>
          <label className="field-label">Material / SKU</label>
          <input className="input" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="3M IJ180Cv3" style={{ fontSize: 12 }} />
        </div>
        <div className="field-group">
          <label className="field-label">Cost/Roll ($)</label>
          <input className="input" type="number" min={0} value={costPerRoll} onChange={(e) => setCostPerRoll(e.target.value)} placeholder="85" style={{ fontSize: 12 }} />
        </div>
      </div>
      {totalCost !== null && (
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          Est. material cost: <span style={{ color: 'var(--accent)' }}>${totalCost.toLocaleString()}</span>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Based on {job.vehicle_count}× {vehicleLabel} · {(VEHICLE_SQFT[job.vehicle_type] ?? 350)} sq ft per vehicle (full wrap) · rolls are 25" × 50' (~{Math.round(SQFT_PER_ROLL)} sq ft each)
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={generatePO}>Copy PO to Clipboard</button>
        <button className="btn" style={{ fontSize: 12 }} onClick={printPO}>Print PO</button>
      </div>
    </div>
  );
}

// ── Invoice Panel ─────────────────────────────────────────────────────────────

function TrackerPanel({ job }: { job: InstalledJob }) {
  const showToast = useAppStore((s) => s.showToast);
  const qc = useQueryClient();
  const [trackerUrl, setTrackerUrl] = useState<string | null>(job.tracker_token ? `${window.location.origin}/job-tracker/${job.tracker_token}` : null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const STATUS_STAGES: Array<{ value: 'scheduled' | 'in_progress' | 'complete'; label: string; color: string }> = [
    { value: 'scheduled', label: 'Scheduled', color: '#f59e0b' },
    { value: 'in_progress', label: 'In Progress', color: '#4d8af5' },
    { value: 'complete', label: 'Complete', color: '#22c55e' },
  ];

  const statusMut = useMutation({
    mutationFn: (s: 'scheduled' | 'in_progress' | 'complete') => api.updateJobStatus(job.id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  async function generate() {
    setGenerating(true);
    try {
      const r = await api.createJobTrackerLink(job.id);
      setTrackerUrl(r.url);
      qc.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function copyUrl() {
    if (!trackerUrl) return;
    await navigator.clipboard.writeText(trackerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const currentStatus = job.job_status ?? 'scheduled';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Job Status Selector */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)', marginBottom: 10 }}>
          📊 Job Production Status
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS_STAGES.map((s) => (
            <button
              key={s.value}
              className="btn"
              style={{
                flex: 1, fontSize: 12, fontWeight: 700, justifyContent: 'center',
                background: currentStatus === s.value ? `${s.color}22` : undefined,
                color: currentStatus === s.value ? s.color : 'var(--text-muted)',
                borderColor: currentStatus === s.value ? `${s.color}60` : undefined,
                borderWidth: currentStatus === s.value ? 2 : 1,
              }}
              disabled={statusMut.isPending}
              onClick={() => statusMut.mutate(s.value)}
            >
              {currentStatus === s.value ? '● ' : '○ '}{s.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.5 }}>
          The client status page reflects this stage in real time.
        </div>
      </div>

      {/* Tracker Link Generator */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)', marginBottom: 10 }}>
          🔗 Client Status Page
        </div>
        {!trackerUrl ? (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
              Generate a public link your client can bookmark to see live job progress, photos, and contact info — no login required.
            </div>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12 }}
              disabled={generating}
              onClick={generate}
            >
              {generating ? 'Generating…' : '🔗 Create Status Page'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-elev-2)', borderRadius: 8, padding: '10px 12px',
              border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {trackerUrl}
              </span>
              <button
                className="btn"
                style={{ fontSize: 11, flexShrink: 0, color: copied ? '#22c55e' : '#4d8af5', borderColor: copied ? '#22c55e50' : 'rgba(77,138,245,0.4)' }}
                onClick={copyUrl}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <a
                href={trackerUrl}
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ fontSize: 11, flexShrink: 0, textDecoration: 'none' }}
              >
                Preview →
              </a>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
              Share this link via text or email. It shows shop branding, progress stages, job photos, and your contact info.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InvoicePanel({ job }: { job: InstalledJob }) {
  const showToast = useAppStore((s) => s.showToast);
  const [sendEmail, setSendEmail] = useState('');
  const [sendName, setSendName] = useState('');
  const [sending, setSending] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifyPhone, setNotifyPhone] = useState('');
  const [notifyName, setNotifyName] = useState('');
  const [notifyVia, setNotifyVia] = useState<'email' | 'sms' | 'both'>('email');
  const [notifyMsg, setNotifyMsg] = useState('');
  const [notifying, setNotifying] = useState(false);

  const token = localStorage.getItem('wl_token') ?? '';
  const invoiceUrl = `/jobs/${job.id}/invoice?token=${encodeURIComponent(token)}`;
  const workOrderUrl = api.getWorkOrderUrl(job.id);
  const completionReceiptUrl = api.getCompletionReceiptUrl(job.id);

  async function doSend() {
    if (!sendEmail.trim()) return;
    setSending(true);
    try {
      await api.sendInvoice(job.id, { toEmail: sendEmail.trim(), toName: sendName.trim() || undefined });
      showToast('Invoice sent!', 'success');
      setSendEmail('');
      setSendName('');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to send', 'error');
    } finally {
      setSending(false);
    }
  }

  async function doNotifyReady() {
    const hasEmail = notifyEmail.trim();
    const hasPhone = notifyPhone.trim();
    if (!hasEmail && !hasPhone) { showToast('Add email or phone to send notification', 'error'); return; }
    setNotifying(true);
    try {
      const r = await api.notifyJobReady(job.id, {
        via: notifyVia,
        toEmail: hasEmail || undefined,
        toPhone: hasPhone || undefined,
        toName: notifyName.trim() || undefined,
        customMessage: notifyMsg.trim() || undefined,
      });
      showToast(`Pickup notification sent via ${r.sentVia.join(' + ') || notifyVia}!`, 'success');
      setNotifyEmail(''); setNotifyPhone(''); setNotifyName(''); setNotifyMsg('');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to send', 'error');
    } finally {
      setNotifying(false);
    }
  }

  const revenue = Number(job.job_revenue) || 0;
  const amountPaid = Number(job.amount_paid) || 0;
  const balance = revenue - amountPaid;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elev-2)', borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Invoice WOS-{String(job.id).padStart(5, '0')}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {revenue > 0 ? `$${revenue.toLocaleString()} total · $${Math.max(0, balance).toLocaleString()} balance due` : 'No revenue logged'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a
            href={workOrderUrl}
            target="_blank"
            rel="noreferrer"
            className="btn"
            style={{ fontSize: 12, textDecoration: 'none' }}
          >
            🗂 Work Order
          </a>
          <a
            href={completionReceiptUrl}
            target="_blank"
            rel="noreferrer"
            className="btn"
            style={{ fontSize: 12, textDecoration: 'none', color: '#10b981', border: '1px solid #10b98130', background: '#10b98112' }}
          >
            ✅ Completion Receipt
          </a>
          <a
            href={invoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
            style={{ fontSize: 12, textDecoration: 'none' }}
          >
            View Invoice →
          </a>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)', marginBottom: 10 }}>
          Email Invoice to Client
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="input"
            type="email"
            placeholder="client@company.com"
            value={sendEmail}
            onChange={(e) => setSendEmail(e.target.value)}
            style={{ fontSize: 13 }}
          />
          <input
            className="input"
            type="text"
            placeholder="Contact name (optional)"
            value={sendName}
            onChange={(e) => setSendName(e.target.value)}
            style={{ fontSize: 13 }}
          />
          <button
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start', fontSize: 12 }}
            disabled={!sendEmail.trim() || sending}
            onClick={doSend}
          >
            {sending ? 'Sending…' : 'Send Invoice'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.5 }}>
          Client receives a branded email with job summary, balance due, and a payment link (if configured in Settings → Deposit Collection).
        </div>
      </div>

      {/* ── Notify Client — vehicle ready for pickup ── */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)', marginBottom: 10 }}>
          📲 Notify Client — Vehicle Ready for Pickup
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['email', 'sms', 'both'] as const).map((v) => (
              <button
                key={v}
                className={`btn${notifyVia === v ? ' btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '3px 10px', fontWeight: 700 }}
                onClick={() => setNotifyVia(v)}
              >
                {v === 'email' ? '✉ Email' : v === 'sms' ? '📱 SMS' : '⚡ Both'}
              </button>
            ))}
          </div>
          {(notifyVia === 'email' || notifyVia === 'both') && (
            <input
              className="input"
              type="email"
              placeholder="Client email"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              style={{ fontSize: 13 }}
            />
          )}
          {(notifyVia === 'sms' || notifyVia === 'both') && (
            <input
              className="input"
              type="tel"
              placeholder="Client phone (+1XXXXXXXXXX)"
              value={notifyPhone}
              onChange={(e) => setNotifyPhone(e.target.value)}
              style={{ fontSize: 13 }}
            />
          )}
          <input
            className="input"
            type="text"
            placeholder="Contact name (optional)"
            value={notifyName}
            onChange={(e) => setNotifyName(e.target.value)}
            style={{ fontSize: 13 }}
          />
          <textarea
            className="input"
            placeholder="Custom message (optional — default includes shop address + phone)"
            value={notifyMsg}
            onChange={(e) => setNotifyMsg(e.target.value)}
            rows={2}
            style={{ fontSize: 12, resize: 'vertical' }}
          />
          <button
            className="btn"
            style={{ alignSelf: 'flex-start', fontSize: 12, background: '#10b98118', color: '#10b981', border: '1px solid #10b98130', fontWeight: 700 }}
            disabled={notifying || (!notifyEmail.trim() && !notifyPhone.trim())}
            onClick={doNotifyReady}
          >
            {notifying ? 'Sending…' : '📲 Send Pickup Notification'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
            Sends a branded "your vehicle is ready" message with shop address, balance due, and your custom note. Logged to job notes automatically.
          </div>
        </div>
      </div>
    </div>
  );
}

function JobModal({ job, onClose }: JobModalProps) {
  const isNew = job === 'new';
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);
  const setMode = useAppStore((s) => s.setMode);
  const [activeTab, setActiveTab] = useState<'details' | 'photos' | 'social' | 'case-study' | 'review' | 'invoice' | 'subs' | 'po' | 'vehicles' | 'expenses' | 'tracker'>('details');
  const [matCatalogOpen, setMatCatalogOpen] = useState(false);
  const [form, setForm] = useState({
    company: isNew ? '' : (job as InstalledJob).company,
    vehicle_type: (isNew ? 'cargo_van_standard' : (job as InstalledJob).vehicle_type) as VehicleType,
    vehicle_count: isNew ? 1 : (job as InstalledJob).vehicle_count,
    wrap_category: (isNew ? 'fleet' : (job as InstalledJob).wrap_category) as LeadCategory,
    material: isNew ? '' : ((job as InstalledJob).material ?? ''),
    install_date: isNew ? new Date().toISOString().split('T')[0] : (job as InstalledJob).install_date.split('T')[0],
    life_years: isNew ? 5 : (job as InstalledJob).life_years,
    notes: isNew ? '' : ((job as InstalledJob).notes ?? ''),
    job_revenue: isNew ? '' : String((job as InstalledJob).job_revenue ?? ''),
    material_cost: isNew ? '' : String((job as InstalledJob).material_cost ?? ''),
    labor_hours: isNew ? '' : String((job as InstalledJob).labor_hours ?? ''),
  });

  function formPayload() {
    return {
      ...form,
      job_revenue: form.job_revenue ? Number(form.job_revenue) : 0,
      material_cost: form.material_cost ? Number(form.material_cost) : 0,
      labor_hours: form.labor_hours ? Number(form.labor_hours) : 0,
    };
  }

  const createMut = useMutation({
    mutationFn: () => api.createJob(formPayload()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); onClose(); },
  });
  const updateMut = useMutation({
    mutationFn: () => api.updateJob((job as InstalledJob).id, formPayload()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); onClose(); },
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteJob((job as InstalledJob).id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); onClose(); },
  });

  const reorderMut = useMutation({
    mutationFn: () => api.createReorderLead((job as InstalledJob).id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      showToast(data.existing ? 'Re-order lead already exists — opening leads view' : 'Re-order lead created!', 'success');
      setMode('leads');
      onClose();
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const f = (k: keyof typeof form) => ({
    value: String(form[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((s) => ({ ...s, [k]: e.target.value })),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isNew ? 'Log Completed Job' : 'Edit Job'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {!isNew && (
          <div className="jobs-tabs" style={{ margin: '0 24px', borderBottom: '1px solid var(--border)' }}>
            <button className={`jobs-tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>Details</button>
            <button className={`jobs-tab ${activeTab === 'photos' ? 'active' : ''}`} onClick={() => setActiveTab('photos')}>Photos</button>
            <button className={`jobs-tab ${activeTab === 'social' ? 'active' : ''}`} onClick={() => setActiveTab('social')}>Social Posts</button>
            <button className={`jobs-tab ${activeTab === 'case-study' ? 'active' : ''}`} onClick={() => setActiveTab('case-study')}>Case Study</button>
            <button className={`jobs-tab ${activeTab === 'review' ? 'active' : ''}`} onClick={() => setActiveTab('review')}>⭐ Reviews</button>
            <button className={`jobs-tab ${activeTab === 'invoice' ? 'active' : ''}`} onClick={() => setActiveTab('invoice')}>💳 Invoice</button>
            <button className={`jobs-tab ${activeTab === 'subs' ? 'active' : ''}`} onClick={() => setActiveTab('subs')}>👷 Subs</button>
            <button className={`jobs-tab ${activeTab === 'po' ? 'active' : ''}`} onClick={() => setActiveTab('po')}>📋 Material PO</button>
            <button className={`jobs-tab ${activeTab === 'vehicles' ? 'active' : ''}`} onClick={() => setActiveTab('vehicles')}>🚛 Vehicles</button>
            <button className={`jobs-tab ${activeTab === 'expenses' ? 'active' : ''}`} onClick={() => setActiveTab('expenses')}>💰 Expenses</button>
            <button className={`jobs-tab ${activeTab === 'tracker' ? 'active' : ''}`} onClick={() => setActiveTab('tracker')}>🔗 Tracker</button>
          </div>
        )}
        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(!isNew && activeTab === 'photos') ? (
          <PhotoGallery jobId={(job as InstalledJob).id} />
        ) : (!isNew && activeTab === 'social') ? (
          <SocialPostPanel job={job as InstalledJob} />
        ) : (!isNew && activeTab === 'case-study') ? (
          <CaseStudyPanel job={job as InstalledJob} />
        ) : (!isNew && activeTab === 'review') ? (
          <ReviewRequestPanel job={job as InstalledJob} />
        ) : (!isNew && activeTab === 'invoice') ? (
          <InvoicePanel job={job as InstalledJob} />
        ) : (!isNew && activeTab === 'subs') ? (
          <SubcontractorTab job={job as InstalledJob} />
        ) : (!isNew && activeTab === 'po') ? (
          <MaterialPOPanel job={job as InstalledJob} />
        ) : (!isNew && activeTab === 'vehicles') ? (
          <VehicleIntakeTab job={job as InstalledJob} />
        ) : (!isNew && activeTab === 'expenses') ? (
          <JobExpensesTab job={job as InstalledJob} />
        ) : (!isNew && activeTab === 'tracker') ? (
          <TrackerPanel job={job as InstalledJob} />
        ) : (
          <>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Company</label>
              <input className="input" {...f('company')} placeholder="John's Logistics" />
            </div>
            <div className="field-group">
              <label className="field-label">Vehicle Count</label>
              <input className="input" type="number" min={1} {...f('vehicle_count')} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Vehicle Type</label>
              <select className="input" value={form.vehicle_type} onChange={(e) => setForm((s) => ({ ...s, vehicle_type: e.target.value as VehicleType }))}>
                {Object.entries(VEHICLE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Category</label>
              <select className="input" value={form.wrap_category} onChange={(e) => setForm((s) => ({ ...s, wrap_category: e.target.value as LeadCategory }))}>
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Install Date (Completed)</label>
              <input className="input" type="date" {...f('install_date')} />
            </div>
            <div className="field-group">
              <label className="field-label">Expected Lifespan</label>
              <select className="input" value={form.life_years} onChange={(e) => setForm((s) => ({ ...s, life_years: Number(e.target.value) }))}>
                <option value={3}>3 years</option>
                <option value={4}>4 years</option>
                <option value={5}>5 years (default)</option>
                <option value={7}>7 years</option>
              </select>
            </div>
          </div>
          {!isNew && (
            <div className="field-row">
              <div className="field-group">
                <label className="field-label">📅 Scheduled Install Date</label>
                <input
                  className="input"
                  type="date"
                  value={(job as InstalledJob).scheduled_install_date?.split('T')[0] ?? ''}
                  onChange={async (e) => {
                    try {
                      await api.scheduleJob((job as InstalledJob).id, { scheduled_install_date: e.target.value || null });
                      qc.invalidateQueries({ queryKey: ['installed-jobs'] });
                      qc.invalidateQueries({ queryKey: ['job-schedule'] });
                    } catch { /* silent */ }
                  }}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Crew Count</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={20}
                  value={(job as InstalledJob).scheduled_crew_count ?? 2}
                  onChange={async (e) => {
                    try {
                      await api.scheduleJob((job as InstalledJob).id, {
                        scheduled_install_date: (job as InstalledJob).scheduled_install_date || null,
                        scheduled_crew_count: Number(e.target.value),
                      });
                      qc.invalidateQueries({ queryKey: ['job-schedule'] });
                    } catch { /* silent */ }
                  }}
                />
              </div>
            </div>
          )}
          <div className="field-group">
            <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Material
              <button type="button" className="btn" style={{ fontSize: 10, padding: '2px 8px', marginLeft: 8 }} onClick={() => setMatCatalogOpen(true)}>Browse Catalog</button>
            </label>
            <input className="input" {...f('material')} placeholder="3M 1080, Avery 900, Arlon 3000…" />
          </div>
          {matCatalogOpen && (
            <MaterialCatalogModal
              onClose={() => setMatCatalogOpen(false)}
              onSelect={(name) => setForm((s) => ({ ...s, material: name }))}
            />
          )}
          <div className="field-group">
            <label className="field-label">Notes</label>
            <textarea className="input" rows={2} {...f('notes')} placeholder="Any notes about the job…" />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)', marginBottom: 10 }}>
              Margin Tracking (optional)
            </div>
            <div className="field-row">
              <div className="field-group">
                <label className="field-label">Job Revenue ($)</label>
                <input className="input" type="number" min={0} step={100} {...f('job_revenue')} placeholder="0" />
              </div>
              <div className="field-group">
                <label className="field-label">Material Cost ($)</label>
                <input className="input" type="number" min={0} step={50} {...f('material_cost')} placeholder="0" />
              </div>
            </div>
            {/* ── Material Cost Estimator ── */}
            {form.vehicle_type && form.vehicle_count && !form.material_cost && (
              <MaterialCostEstimator
                vehicleType={form.vehicle_type}
                vehicleCount={Number(form.vehicle_count)}
                onApply={(cost) => setForm((s) => ({ ...s, material_cost: String(cost) }))}
              />
            )}
            {form.job_revenue && form.material_cost && Number(form.job_revenue) > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4 }}>
                Gross margin: <strong style={{ color: ((Number(form.job_revenue) - Number(form.material_cost)) / Number(form.job_revenue)) >= 0.4 ? '#22c55e' : '#f59e0b' }}>
                  {Math.round(((Number(form.job_revenue) - Number(form.material_cost)) / Number(form.job_revenue)) * 100)}%
                </strong> · ${(Number(form.job_revenue) - Number(form.material_cost)).toLocaleString()} gross profit
              </div>
            )}
            <div className="field-group" style={{ marginTop: 10 }}>
              <label className="field-label">Labor Hours (optional)</label>
              <input className="input" type="number" min={0} step={0.5} {...f('labor_hours')} placeholder="0" />
            </div>
          </div>

          {/* Payment Status — only show for saved jobs with revenue */}
          {!isNew && Number(form.job_revenue) > 0 && (
            <PaymentStatusRow job={job as InstalledJob} />
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            {!isNew && (
              <button className="btn" style={{ color: 'var(--red)', marginRight: 'auto' }}
                onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
                Delete
              </button>
            )}
            {!isNew && (
              <button
                className="btn"
                style={{ color: 'var(--signal-blue, #4d8af5)', borderColor: 'rgba(77,138,245,0.35)', fontSize: 12 }}
                onClick={() => reorderMut.mutate()}
                disabled={reorderMut.isPending}
                title="Create a re-order CRM lead for this client"
              >
                {reorderMut.isPending ? <span className="spinner" style={{ width: 11, height: 11 }} /> : '🔄 Create Re-Order Lead'}
              </button>
            )}
            <button className="btn" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={!form.company || createMut.isPending || updateMut.isPending}
              onClick={() => isNew ? createMut.mutate() : updateMut.mutate()}
            >
              {isNew ? 'Log Job' : 'Save Changes'}
            </button>
          </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

// ── Install Schedule Calendar ─────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  fleet: '#4d8af5', construction: '#f59e0b', dinoc: '#8b5cf6', reatec: '#06b6d4',
  colorchange: '#ec4899', gc_referral: '#10b981', wallgraphics: '#6366f1',
  racing: '#f4551c', design: '#84cc16',
};

function InstallCalendar({ onEditJob }: { onEditJob: (job: InstalledJob) => void }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['job-schedule', viewYear, viewMonth],
    queryFn: () => api.getJobSchedule(viewYear, viewMonth),
    staleTime: 30_000,
  });

  const jobs = data?.jobs ?? [];

  // Build day → jobs map
  const dayMap = new Map<number, InstalledJob[]>();
  for (const job of jobs) {
    const dateStr = job.scheduled_install_date ?? job.install_date;
    if (!dateStr) continue;
    const d = new Date(dateStr + 'T12:00:00');
    if (d.getFullYear() === viewYear && d.getMonth() + 1 === viewMonth) {
      const day = d.getDate();
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(job);
    }
  }

  // Calendar grid
  const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const monthName = new Date(viewYear, viewMonth - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const selectedJobs = selectedDay ? (dayMap.get(selectedDay) ?? []) : [];

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  }

  const totalVehiclesThisMonth = jobs.reduce((s, j) => s + j.vehicle_count, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn" style={{ fontSize: 13 }} onClick={prevMonth}>‹</button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{monthName}</div>
        <button className="btn" style={{ fontSize: 13 }} onClick={nextMonth}>›</button>
      </div>

      {/* Stats strip */}
      {jobs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          <span>{jobs.length} install{jobs.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{totalVehiclesThisMonth} vehicles</span>
          <span>·</span>
          <span>{dayMap.size} day{dayMap.size !== 1 ? 's' : ''} booked</span>
        </div>
      )}

      {/* Calendar grid */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--bg-elev-2)' }}>
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-faint)', padding: '6px 0' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {/* Empty cells before month start */}
          {Array.from({ length: firstDay }, (_, i) => (
            <div key={`empty-${i}`} style={{ minHeight: 70, borderTop: '1px solid var(--border-soft)', borderRight: '1px solid var(--border-soft)', padding: 4 }} />
          ))}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dayJobs = dayMap.get(day) ?? [];
            const isToday = today.getFullYear() === viewYear && today.getMonth() + 1 === viewMonth && today.getDate() === day;
            const isSelected = selectedDay === day;
            return (
              <div
                key={day}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                style={{
                  minHeight: 70, padding: 4, cursor: 'pointer',
                  borderTop: '1px solid var(--border-soft)',
                  borderRight: '1px solid var(--border-soft)',
                  background: isSelected ? 'rgba(244,85,28,0.06)' : 'transparent',
                  transition: 'background 0.12s ease',
                }}
              >
                <div style={{
                  fontSize: 11, fontWeight: isToday ? 800 : 500,
                  color: isToday ? 'var(--accent)' : 'var(--text-dim)',
                  width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%',
                  background: isToday ? 'rgba(244,85,28,0.12)' : 'transparent',
                  marginBottom: 2,
                }}>
                  {day}
                </div>
                {dayJobs.slice(0, 3).map((j) => (
                  <div key={j.id} style={{
                    fontSize: 9, lineHeight: 1.3, color: '#fff',
                    background: CAT_COLORS[j.wrap_category] ?? 'var(--accent)',
                    borderRadius: 3, padding: '1px 4px', marginBottom: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {j.company}
                  </div>
                ))}
                {dayJobs.length > 3 && (
                  <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>+{dayJobs.length - 3} more</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail panel */}
      {selectedDay !== null && (
        <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', marginBottom: 10 }}>
            {new Date(viewYear, viewMonth - 1, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          {selectedJobs.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No jobs on this day. Click a job from the list and set its scheduled install date to this day.</p>
          ) : (
            selectedJobs.map((j) => (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border-soft)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: CAT_COLORS[j.wrap_category] ?? 'var(--accent)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{j.company}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {j.vehicle_count}× {j.vehicle_type.replace(/_/g, ' ')} · {j.wrap_category}
                    {j.scheduled_crew_count ? ` · ${j.scheduled_crew_count} crew` : ''}
                  </div>
                </div>
                <button className="btn" style={{ fontSize: 10 }} onClick={() => onEditJob(j)}>Edit →</button>
              </div>
            ))
          )}
        </div>
      )}

      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><span className="spinner" /></div>
      )}
    </div>
  );
}

// ── Wrap Portfolio Strip ──────────────────────────────────────────────────────

const REV_EST: Record<string, number> = {
  fleet: 4500, dinoc: 6000, gc_referral: 18000, construction: 5000,
  colorchange: 3500, racing: 40000, reatec: 5500, design: 3000, wallgraphics: 2500,
};

function WrapPortfolioStrip({ jobs }: { jobs: InstalledJob[] }) {
  if (jobs.length === 0) return null;

  const totalVehicles = jobs.reduce((s, j) => s + j.vehicle_count, 0);
  const totalValue    = jobs.reduce((s, j) => s + j.vehicle_count * (REV_EST[j.wrap_category] ?? 3500), 0);
  const avgJobValue   = Math.round(totalValue / jobs.length);

  const byCat: Record<string, number> = {};
  jobs.forEach((j) => {
    byCat[j.wrap_category] = (byCat[j.wrap_category] ?? 0) + j.vehicle_count * (REV_EST[j.wrap_category] ?? 3500);
  });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxCat = catEntries[0]?.[1] ?? 1;

  const fmtVal = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1_000)}K`;

  const recentJob = [...jobs].sort((a, b) =>
    new Date(b.install_date).getTime() - new Date(a.install_date).getTime()
  )[0];
  const daysSinceLast = recentJob
    ? Math.floor((Date.now() - new Date(recentJob.install_date).getTime()) / 86_400_000)
    : null;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14,
      padding: '14px 16px', background: 'var(--surface)', borderRadius: 10,
      border: '1px solid var(--border)', margin: '0 0 16px',
    }}>
      {/* Portfolio value */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
          Portfolio Value Installed
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)', lineHeight: 1, marginBottom: 4 }}>
          {fmtVal(totalValue)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {totalVehicles} vehicles · avg {avgJobValue >= 1000 ? fmtVal(avgJobValue) : `$${avgJobValue}`}/job
        </div>
        {daysSinceLast !== null && (
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
            Last install: {daysSinceLast === 0 ? 'today' : `${daysSinceLast}d ago`}
          </div>
        )}
      </div>

      {/* Revenue by category */}
      {catEntries.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>
            Revenue by Category
          </div>
          {catEntries.map(([cat, val]) => (
            <div key={cat} style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: 'var(--text)' }}>{CATEGORIES[cat as keyof typeof CATEGORIES] ?? cat}</span>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtVal(val)}</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 99 }}>
                <div style={{ height: '100%', width: `${(val / maxCat) * 100}%`, background: 'var(--accent)', borderRadius: 99, opacity: 0.75, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Re-order pipeline */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>
          Re-order Pipeline
        </div>
        {(() => {
          const expiring90 = jobs.filter((j) => (j.days_until_expiry ?? Infinity) <= 90 && (j.days_until_expiry ?? -1) >= 0);
          const expiring180 = jobs.filter((j) => (j.days_until_expiry ?? Infinity) > 90 && (j.days_until_expiry ?? Infinity) <= 180);
          const expiredVal = jobs
            .filter((j) => (j.days_until_expiry ?? 0) < 0)
            .reduce((s, j) => s + j.vehicle_count * (REV_EST[j.wrap_category] ?? 3500), 0);
          const soon90Val = expiring90.reduce((s, j) => s + j.vehicle_count * (REV_EST[j.wrap_category] ?? 3500), 0);
          const soon180Val = expiring180.reduce((s, j) => s + j.vehicle_count * (REV_EST[j.wrap_category] ?? 3500), 0);
          const rows = [
            { label: 'Overdue / expired', val: expiredVal, color: '#ef4444' },
            { label: 'Due within 90d',    val: soon90Val,  color: '#f97316' },
            { label: 'Due 90–180d',       val: soon180Val, color: '#f59e0b' },
          ].filter((r) => r.val > 0);
          if (rows.length === 0) return (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No expiring wraps in 180 days</div>
          );
          return rows.map((r) => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{fmtVal(r.val)}</span>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}

// ── Aging Job Card ────────────────────────────────────────────────────────────

function urgencyClass(days: number | undefined) {
  if (days === undefined || days < 0) return 'jobs-expiry-red';
  if (days < 30) return 'jobs-expiry-orange';
  if (days < 90) return 'jobs-expiry-yellow';
  return 'jobs-expiry-green';
}

function expiryLabel(days: number | undefined) {
  if (days === undefined) return '';
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  return `${days}d until refresh`;
}

// ── Main JobsView ─────────────────────────────────────────────────────────────

export default function JobsView() {
  const [tab, setTab] = useState<'all' | 'aging' | 'map' | 'calendar' | 'receivables'>('all');
  const [modal, setModal] = useState<InstalledJob | 'new' | null>(null);
  const [qrJob, setQrJob] = useState<InstalledJob | null>(null);
  const [creatingLeadFor, setCreatingLeadFor] = useState<number | null>(null);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);
  const setMode = useAppStore((s) => s.setMode);

  const { data: allData, isLoading: loadingAll } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.getJobs(),
    staleTime: 60_000,
  });
  const { data: agingData, isLoading: loadingAging } = useQuery({
    queryKey: ['jobs', 'aging'],
    queryFn: () => api.getAgingJobs(),
    staleTime: 60_000,
  });

  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set());
  const [batchResult, setBatchResult] = useState<{ sent: number; skipped: number; failed: number } | null>(null);

  const { data: outstandingData, isLoading: loadingOutstanding, refetch: refetchOutstanding } = useQuery({
    queryKey: ['jobs', 'outstanding'],
    queryFn: () => api.getOutstandingJobs(),
    staleTime: 60_000,
    enabled: tab === 'receivables',
  });

  const batchInvoiceMut = useMutation({
    mutationFn: (ids: number[]) => api.batchSendInvoices(ids),
    onSuccess: (data) => {
      setBatchResult({ sent: data.sent, skipped: data.skipped, failed: data.failed });
      setSelectedInvoiceIds(new Set());
      refetchOutstanding();
      qc.invalidateQueries({ queryKey: ['jobs'] });
      showToast(`${data.sent} invoice${data.sent !== 1 ? 's' : ''} sent`, data.sent > 0 ? 'success' : 'info');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const jobs = tab === 'all' ? (allData?.jobs ?? []) : (agingData?.jobs ?? []);
  const isLoading = tab === 'all' ? loadingAll : loadingAging;

  const totalVehicles = allData?.jobs.reduce((s, j) => s + j.vehicle_count, 0) ?? 0;
  const agingCount = agingData?.jobs.length ?? 0;

  async function reEngage(job: InstalledJob) {
    if (!job.lead_id) return;
    try {
      await api.logActivity(job.lead_id, {
        type: 'note_added',
        subject: 'Wrap Refresh Reminder',
        body: `Wrap installed ${job.install_date.split('T')[0]} on ${job.vehicle_count} ${VEHICLE_TYPE_LABELS[job.vehicle_type as VehicleType] ?? job.vehicle_type}(s) is approaching refresh window (${job.life_years} year lifespan). Follow up about renewal.`,
      });
      await api.updateLead(job.lead_id, { followupDueAt: new Date().toISOString().split('T')[0] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      showToast(`${job.company} queued for follow-up`, 'success');
    } catch {
      showToast('Failed to queue re-engagement', 'error');
    }
  }

  async function quickCreateReorderLead(e: React.MouseEvent, job: InstalledJob) {
    e.stopPropagation();
    setCreatingLeadFor(job.id);
    try {
      const data = await api.createReorderLead(job.id);
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      showToast(data.existing ? 'Re-order lead already exists — going to leads' : `Re-order lead created for ${job.company}!`, 'success');
      setMode('leads');
    } catch {
      showToast('Failed to create re-order lead', 'error');
    } finally {
      setCreatingLeadFor(null);
    }
  }

  return (
    <div className="jobs-root">
      <div className="jobs-header">
        <div>
          <h1 className="jobs-title">Wrap Lifecycle Tracker</h1>
          <p className="jobs-sub">Track every install. Surface re-order opportunities automatically.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn"
            style={{ fontSize: 12, borderColor: 'rgba(77,138,245,0.35)', color: 'var(--signal-blue, #4d8af5)' }}
            onClick={() => setSurveyOpen(true)}
            title="Walk a fleet and log vehicles on-site"
          >
            🚛 Fleet Survey
          </button>
          <button className="btn btn-primary" onClick={() => setModal('new')}>
            + Log Completed Job
          </button>
        </div>
      </div>

      <div className="jobs-stats">
        <div className="jobs-stat">
          <span className="jobs-stat-val">{allData?.jobs.length ?? 0}</span>
          <span className="jobs-stat-label">Jobs Logged</span>
        </div>
        <div className="jobs-stat">
          <span className="jobs-stat-val">{totalVehicles}</span>
          <span className="jobs-stat-label">Vehicles Wrapped</span>
        </div>
        <div className={`jobs-stat ${agingCount > 0 ? 'jobs-stat-alert' : ''}`}>
          <span className="jobs-stat-val">{agingCount}</span>
          <span className="jobs-stat-label">Aging / Expiring</span>
        </div>
      </div>

      <WrapPortfolioStrip jobs={allData?.jobs ?? []} />

      <div className="jobs-tabs">
        <button className={`jobs-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          All Jobs
        </button>
        <button className={`jobs-tab ${tab === 'aging' ? 'active' : ''}`} onClick={() => setTab('aging')}>
          Aging Alerts {agingCount > 0 && <span className="jobs-tab-badge">{agingCount}</span>}
        </button>
        <button className={`jobs-tab ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>
          Fleet Map
        </button>
        <button className={`jobs-tab ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>
          📅 Schedule
        </button>
        <button className={`jobs-tab ${tab === 'receivables' ? 'active' : ''}`} onClick={() => { setTab('receivables'); setBatchResult(null); }}>
          💳 Receivables
        </button>
      </div>

      {tab === 'map' && <FleetAgingMap />}
      {tab === 'calendar' && (
        <div style={{ padding: '16px 0' }}>
          <InstallCalendar onEditJob={(job) => setModal(job)} />
        </div>
      )}
      {tab === 'receivables' && (
        <div style={{ padding: '16px 0' }}>
          {loadingOutstanding ? (
            <div className="pv-loading"><span className="spinner" /><span>Loading outstanding jobs…</span></div>
          ) : (outstandingData?.jobs ?? []).length === 0 ? (
            <div className="empty-state empty-state-sm">
              <div className="empty-state-icon" style={{ color: 'var(--green)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="40" height="40"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <h3 className="empty-state-title">All invoices settled</h3>
              <p className="empty-state-sub">No outstanding balances. Every job with revenue logged is marked paid.</p>
            </div>
          ) : (() => {
            const outstanding = outstandingData!.jobs;
            const totalBalance = outstanding.reduce((s, j) => s + j.balance, 0);
            const allIds = outstanding.map(j => j.id);
            const allSelected = allIds.every(id => selectedInvoiceIds.has(id));
            const someSelected = allIds.some(id => selectedInvoiceIds.has(id));

            function toggleAll() {
              if (allSelected) setSelectedInvoiceIds(new Set());
              else setSelectedInvoiceIds(new Set(allIds));
            }
            function toggleOne(id: number) {
              const next = new Set(selectedInvoiceIds);
              if (next.has(id)) next.delete(id); else next.add(id);
              setSelectedInvoiceIds(next);
            }

            function agingColor(days: number) {
              if (days >= 30) return '#ef4444';
              if (days >= 15) return '#f59e0b';
              return '#22c55e';
            }

            return (
              <div>
                {/* Header bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ fontSize: 22, fontWeight: 900, color: '#ef4444', fontFamily: 'var(--mono)', letterSpacing: '-1px' }}>
                        ${totalBalance.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>outstanding · {outstanding.length} jobs</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {selectedInvoiceIds.size > 0 && (
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: 12 }}
                        disabled={batchInvoiceMut.isPending}
                        onClick={() => batchInvoiceMut.mutate(Array.from(selectedInvoiceIds))}
                      >
                        {batchInvoiceMut.isPending ? <><span className="spinner" /> Sending…</> : `✉ Send ${selectedInvoiceIds.size} Invoice${selectedInvoiceIds.size !== 1 ? 's' : ''}`}
                      </button>
                    )}
                    {selectedInvoiceIds.size === 0 && (
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: 12 }}
                        onClick={() => {
                          const withEmail = outstanding.filter(j => j.leadEmail);
                          if (withEmail.length === 0) { showToast('No jobs have a client email. Link jobs to leads with email addresses first.', 'info'); return; }
                          setSelectedInvoiceIds(new Set(withEmail.map(j => j.id)));
                        }}
                      >
                        Select All with Email
                      </button>
                    )}
                  </div>
                </div>

                {batchResult && (
                  <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: batchResult.sent > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${batchResult.sent > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`, fontSize: 12, color: 'var(--text)' }}>
                    ✓ {batchResult.sent} sent · {batchResult.skipped} skipped (no email / already paid) · {batchResult.failed} errors
                  </div>
                )}

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 32, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                          <input type="checkbox" checked={someSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                        </th>
                        {['Company', 'Category', 'Install', 'Age', 'Revenue', 'Balance', 'Status', 'Email', ''].map(h => (
                          <th key={h} style={{ textAlign: ['Revenue', 'Balance'].includes(h) ? 'right' : 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', paddingBottom: 8, borderBottom: '1px solid var(--border)', paddingRight: h === '' ? 0 : 8 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {outstanding.map(j => {
                        const ac = agingColor(j.daysSinceInstall);
                        const checked = selectedInvoiceIds.has(j.id);
                        return (
                          <tr key={j.id} style={{ borderBottom: '1px solid var(--border-soft)', background: checked ? 'rgba(77,138,245,0.04)' : 'transparent', cursor: 'pointer' }} onClick={() => toggleOne(j.id)}>
                            <td style={{ padding: '9px 8px 9px 0' }} onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={checked} onChange={() => toggleOne(j.id)} style={{ cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
                            </td>
                            <td style={{ padding: '9px 8px 9px 0', fontWeight: 600 }}>{j.company}</td>
                            <td style={{ padding: '9px 8px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{j.category ?? '—'}</td>
                            <td style={{ padding: '9px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {j.installDate ? new Date(j.installDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                            </td>
                            <td style={{ padding: '9px 8px', fontWeight: 700, color: ac }}>{j.daysSinceInstall}d</td>
                            <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>${j.revenue.toLocaleString()}</td>
                            <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: ac }}>${j.balance.toLocaleString()}</td>
                            <td style={{ padding: '9px 8px' }}>
                              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em', background: j.paymentStatus === 'overdue' ? '#ef444418' : j.paymentStatus === 'invoice_sent' ? '#4d8af518' : 'var(--bg-elev-2)', color: j.paymentStatus === 'overdue' ? '#ef4444' : j.paymentStatus === 'invoice_sent' ? '#4d8af5' : 'var(--text-faint)' }}>
                                {j.paymentStatus === 'invoice_sent' ? 'inv. sent' : j.paymentStatus === 'deposit_paid' ? 'dep. paid' : j.paymentStatus}
                              </span>
                            </td>
                            <td style={{ padding: '9px 8px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {j.leadEmail ? (
                                <span style={{ fontSize: 11, color: '#4d8af5' }}>{j.leadEmail}</span>
                              ) : (
                                <span style={{ fontSize: 10, color: 'var(--text-faint)', fontStyle: 'italic' }}>no email</span>
                              )}
                            </td>
                            <td style={{ padding: '9px 0', textAlign: 'right' }}>
                              <button
                                className="btn"
                                style={{ fontSize: 10, padding: '2px 8px' }}
                                onClick={e => { e.stopPropagation(); setModal(allData?.jobs.find(j2 => j2.id === j.id) ?? null); }}
                              >
                                Open →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-faint)' }}>
                  Green = 0–14 days · Amber = 15–29 days · Red = 30+ days · Invoices are emailed to the lead's email address — link each job to a lead via the Details tab.
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {tab !== 'map' && tab !== 'calendar' && tab !== 'receivables' && isLoading && (
        <div className="pv-loading"><span className="spinner" /><span>Loading jobs…</span></div>
      )}

      {tab !== 'map' && tab !== 'calendar' && tab !== 'receivables' && !isLoading && jobs.length === 0 && (
        tab === 'aging' ? (
          <div className="empty-state empty-state-sm">
            <div className="empty-state-icon" style={{ color: 'var(--green)' }}>
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="32" cy="32" r="24" stroke="currentColor" strokeWidth="2" opacity="0.3"/>
                <path d="M20 32l8 8 16-16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="empty-state-title">All clear — no aging wraps</h3>
            <p className="empty-state-sub">No vehicles are expiring in the next 90 days. Check back when installs approach their end-of-life.</p>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="28" width="52" height="22" rx="6" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
                <rect x="10" y="22" width="44" height="10" rx="4" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="16" cy="50" r="5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.2"/>
                <circle cx="48" cy="50" r="5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.2"/>
                <path d="M10 32h44" stroke="currentColor" strokeWidth="1" opacity="0.3" strokeDasharray="3 3"/>
                <path d="M28 16 L32 10 L36 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
                <line x1="32" y1="10" x2="32" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
              </svg>
            </div>
            <h3 className="empty-state-title">Start tracking your installs</h3>
            <p className="empty-state-sub">
              Log completed vehicle wraps to track their lifecycle — get aging alerts before wraps expire,
              auto-generate social posts, and trigger re-engagement campaigns at exactly the right time.
            </p>
            <div className="empty-state-actions">
              <button className="btn btn-primary" onClick={() => setModal('new')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>
                Log First Install
              </button>
            </div>
          </div>
        )
      )}

      {tab !== 'map' && tab !== 'calendar' && tab !== 'receivables' && !isLoading && jobs.length > 0 && (
        <div className="jobs-list">
          {jobs.map((job) => (
            <div key={job.id} className="jobs-row" onClick={() => setModal(job)}>
              <div className="jobs-row-main">
                <span className="jobs-row-company">{job.company}</span>
                <span className="jobs-row-meta">
                  {job.vehicle_count} × {VEHICLE_TYPE_LABELS[job.vehicle_type as VehicleType] ?? job.vehicle_type}
                  {' · '}{CATEGORIES[job.wrap_category as keyof typeof CATEGORIES] ?? job.wrap_category}
                  {job.material && ` · ${job.material}`}
                </span>
                <span className="jobs-row-date">Installed {job.install_date.split('T')[0]} · {job.life_years}yr lifespan</span>
              </div>
              <div className="jobs-row-right">
                <span className={`jobs-expiry-badge ${urgencyClass(job.days_until_expiry)}`}>
                  {expiryLabel(job.days_until_expiry)}
                </span>
                {job.lead_id && (job.days_until_expiry === undefined || job.days_until_expiry <= 90) && (
                  <button
                    className="btn"
                    style={{ fontSize: 11 }}
                    onClick={(e) => { e.stopPropagation(); reEngage(job); }}
                  >
                    Re-engage
                  </button>
                )}
                {(job.days_until_expiry === undefined || job.days_until_expiry <= 180) && (
                  <button
                    className="btn"
                    style={{ fontSize: 11, color: 'var(--signal-blue, #4d8af5)', borderColor: 'rgba(77,138,245,0.35)' }}
                    onClick={(e) => quickCreateReorderLead(e, job)}
                    disabled={creatingLeadFor === job.id}
                    title="Create a re-order CRM lead"
                  >
                    {creatingLeadFor === job.id ? <span className="spinner" style={{ width: 10, height: 10 }} /> : '→ Lead'}
                  </button>
                )}
                <button
                  className="btn"
                  style={{ fontSize: 11 }}
                  title="Generate QR code for this vehicle"
                  onClick={(e) => { e.stopPropagation(); setQrJob(job); }}
                >
                  QR
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <JobModal job={modal} onClose={() => setModal(null)} />}
      {qrJob && <FleetQRModal job={qrJob} onClose={() => setQrJob(null)} />}
      {surveyOpen && (
        <FleetSurveyModal
          onClose={() => setSurveyOpen(false)}
          onExport={(company, vehicles) => {
            setSurveyOpen(false);
            const lines = vehicles.map((v) =>
              `${v.count}× ${v.type.replace(/_/g, ' ')} — ${v.condition}${v.hasExistingWrap ? ' (removal needed)' : ''}${v.notes ? ` — ${v.notes}` : ''}`
            );
            const totalVeh = vehicles.reduce((s, v) => s + v.count, 0);
            const totalSqFt = vehicles.reduce((s, v) => {
              const SQ_FT: Record<string, number> = { cargo_van: 340, box_truck: 570, sprinter: 320, pickup: 280, semi_tractor: 620, semi_trailer: 1040, '53ft_trailer': 1180, flatbed: 480, bus: 980, rv: 1200, suv: 230, passenger_car: 195, food_truck: 440, boat: 260, trailer: 360, other: 350 };
              return s + (SQ_FT[v.type] ?? 350) * v.count;
            }, 0);
            const estLow = Math.round(totalSqFt * 4.5 / 100) * 100;
            const estHigh = Math.round(totalSqFt * 7.0 / 100) * 100;
            const summary = `Fleet Survey — ${company}\n${lines.join('\n')}\nTotal: ${totalVeh} vehicles · ~${totalSqFt.toLocaleString()} sq ft · Est $${estLow.toLocaleString()}–$${estHigh.toLocaleString()}`;
            navigator.clipboard.writeText(summary).catch(() => {});
            showToast(`Survey copied! Open a lead's Notes or Quotes tab to paste it.`, 'success');
            // Navigate to leads so user can pick the right lead
            setMode('leads');
          }}
        />
      )}
    </div>
  );
}
