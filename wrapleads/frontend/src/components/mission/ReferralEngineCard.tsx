import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const ACCENT = '#4d8af5';

const CAT_LABELS: Record<string, string> = {
  fleet: 'Fleet', dinoc: 'DI-NOC', gc_referral: 'GC Ref', construction: 'Construction',
  colorchange: 'Color Change', racing: 'Racing', reatec: 'Rea-Tec',
  design: 'Design', wallgraphics: 'Wall',
};

function fmt(n: number) {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function daysAgoLabel(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return '1d ago';
  return `${diff}d ago`;
}

// ── Email Preview Modal ───────────────────────────────────────────────────────

interface EmailPreviewModalProps {
  leadId: number;
  company: string;
  email: string | null;
  onClose: () => void;
}

function EmailPreviewModal({ leadId, company, email, onClose }: EmailPreviewModalProps) {
  const showToast = useAppStore((s) => s.showToast);
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['referral-ask', leadId],
    queryFn: () => api.generateReferralAsk(leadId),
    staleTime: Infinity,
    retry: false,
  });

  const sendMut = useMutation({
    mutationFn: () => {
      if (!email || !data) throw new Error('No email');
      return api.sendEmail(leadId, {
        subject: data.subject,
        body: data.body,
        toEmail: email,
        toName: data.contactName ?? undefined,
      });
    },
    onSuccess: () => {
      setSent(true);
      showToast('Referral ask email sent!', 'success');
      qc.invalidateQueries({ queryKey: ['referral-opportunities'] });
    },
    onError: (e: Error) => {
      showToast(e.message || 'Send failed', 'error');
    },
  });

  function copyToClipboard() {
    if (!data) return;
    const text = `Subject: ${data.subject}\n\n${data.body}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      showToast('Email copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--surface)', borderRadius: 14,
          width: '100%', maxWidth: 540, padding: 24,
          border: `1px solid ${ACCENT}30`,
          boxShadow: `0 4px 32px rgba(0,0,0,0.4), 0 0 0 1px ${ACCENT}20`,
          display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: `${ACCENT}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              AI Referral Ask — {company}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Personalized by Claude Haiku
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 18, lineHeight: 1, padding: 4 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <span className="spinner" style={{ width: 14, height: 14 }} />
            Generating referral email…
          </div>
        )}

        {isError && (
          <div style={{ fontSize: 13, color: '#ef4444' }}>
            {(error as Error).message || 'Failed to generate email. Check ANTHROPIC_API_KEY.'}
          </div>
        )}

        {data && !sent && (
          <>
            {/* Subject */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                Subject
              </div>
              <div style={{
                fontSize: 13, fontWeight: 600, color: 'var(--text)',
                background: 'var(--surface-2)', borderRadius: 7, padding: '8px 12px',
                border: '1px solid var(--border)',
              }}>
                {data.subject}
              </div>
            </div>

            {/* Body */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                Email Body
              </div>
              <div style={{
                fontSize: 13, color: 'var(--text)', lineHeight: 1.65,
                background: 'var(--surface-2)', borderRadius: 7, padding: '10px 12px',
                border: '1px solid var(--border)', whiteSpace: 'pre-wrap',
              }}>
                {data.body}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={copyToClipboard}
                style={{
                  flex: 1, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: copied ? '#10b98118' : 'var(--surface-2)',
                  color: copied ? '#10b981' : 'var(--text)',
                  border: `1px solid ${copied ? '#10b98140' : 'var(--border)'}`,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {copied ? '✓ Copied!' : 'Copy to Clipboard'}
              </button>
              {email && (
                <button
                  onClick={() => sendMut.mutate()}
                  disabled={sendMut.isPending}
                  style={{
                    flex: 1, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: ACCENT, color: '#fff',
                    border: 'none', cursor: sendMut.isPending ? 'not-allowed' : 'pointer',
                    opacity: sendMut.isPending ? 0.7 : 1, transition: 'opacity 0.15s',
                  }}
                >
                  {sendMut.isPending ? 'Sending…' : 'Send via Email'}
                </button>
              )}
            </div>

            {!email && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center' }}>
                No email on file — copy and send manually.
              </div>
            )}
          </>
        )}

        {sent && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            padding: '20px 0', textAlign: 'center',
          }}>
            <div style={{ fontSize: 28 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>Referral ask sent!</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {company} has been marked as referral-asked and logged to their activity timeline.
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 6 }}
              onClick={onClose}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ReferralEngineCard ────────────────────────────────────────────────────────

export default function ReferralEngineCard() {
  const qc = useQueryClient();
  const [previewLead, setPreviewLead] = useState<{
    leadId: number;
    company: string;
    email: string | null;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['referral-opportunities'],
    queryFn: () => api.getReferralOpportunities(),
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  });

  const leads = data?.leads ?? [];

  if (isLoading) {
    return (
      <div className="mission-card" style={{ borderLeftColor: ACCENT }}>
        <div className="skeleton" style={{ height: 80, borderRadius: 8 }} />
      </div>
    );
  }

  if (leads.length === 0) return null;

  function handleClose() {
    setPreviewLead(null);
    // Refetch so already-asked rows disappear
    qc.invalidateQueries({ queryKey: ['referral-opportunities'] });
  }

  return (
    <>
      <div
        className="mission-card"
        style={{
          borderLeft: `3px solid ${ACCENT}`,
          background: `${ACCENT}05`,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 26, height: 26, borderRadius: 7,
              background: `${ACCENT}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: ACCENT }}>
              Referral Engine
            </span>
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 99,
              background: `${ACCENT}18`, color: ACCENT, fontWeight: 700,
            }}>
              {leads.length} ready
            </span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Won clients · not asked yet</span>
        </div>

        {/* Lead list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {leads.map((lead) => (
            <div
              key={lead.leadId}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8, padding: '8px 12px',
              }}
            >
              {/* Company + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lead.company}
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: `${ACCENT}18`, color: ACCENT, fontWeight: 700,
                  }}>
                    {CAT_LABELS[lead.category] ?? lead.category}
                  </span>
                  {lead.vehicleCount > 1 && (
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                      {lead.vehicleCount} vehicles
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    won {daysAgoLabel(lead.wonAt)}
                  </span>
                  <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>
                    {fmt(lead.estValue)}
                  </span>
                </div>
              </div>

              {/* Request Referral button */}
              <button
                onClick={() => setPreviewLead({ leadId: lead.leadId, company: lead.company, email: lead.email })}
                style={{
                  fontSize: 11, fontWeight: 700, color: '#fff',
                  background: ACCENT, border: 'none',
                  borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                  whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Request Referral
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.5 }}>
          AI writes a warm, personalized email — review it before sending.
        </div>
      </div>

      {previewLead && (
        <EmailPreviewModal
          leadId={previewLead.leadId}
          company={previewLead.company}
          email={previewLead.email}
          onClose={handleClose}
        />
      )}
    </>
  );
}
