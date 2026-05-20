import { useState } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import type { Lead } from '../../../api/types';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';

interface Props {
  lead: Lead;
}

const EMAIL_TYPES = ['Introduction', 'Follow-up', 'Fleet Proposal', 'Re-engage'];
const TONES = ['Professional', 'Friendly', 'Direct', 'Consultative'];

type TabMode = 'single' | 'sequence' | 'templates';

interface EmailTemplate {
  label: string;
  tag: string;
  subject: string;
  body: string;
}

const BUILT_IN_TEMPLATES: EmailTemplate[] = [
  {
    label: 'Price Objection',
    tag: 'Objection',
    subject: `Re: Wrap Quote`,
    body: `Hi {{contactName}},\n\nThanks for the feedback on pricing. I want to make sure you have the full picture — a fleet wrap on {{vehicleType}} typically generates 30,000–70,000 impressions per day. Over 5 years, that's often the most cost-effective advertising our clients run.\n\nI'd be happy to put together a phased option — start with one or two vehicles and scale up. Would that work for your budget?\n\nLet me know and I'll get you a revised quote.\n\nBest,\n{{senderName}}\n{{companyName}}`,
  },
  {
    label: 'Follow-Up After Meeting',
    tag: 'Follow-up',
    subject: `Great talking with you — next steps for {{company}}`,
    body: `Hi {{contactName}},\n\nReally enjoyed our conversation. Based on what we discussed, I'm putting together a custom quote for your fleet and will have it over to you by end of week.\n\nIn the meantime, feel free to browse our recent work: {{portfolioUrl}}\n\nLooking forward to earning your business.\n\nBest,\n{{senderName}}\n{{companyName}}`,
  },
  {
    label: 'Re-Engage Cold Lead',
    tag: 'Re-Engage',
    subject: `Quick check-in — {{company}}`,
    body: `Hi {{contactName}},\n\nHoping this finds you well. I know we connected a while back about wrapping your fleet — just wanted to check if that's still something on your radar.\n\nWe recently completed a similar project for a fleet in your area and the client loved the results. Happy to share photos if useful.\n\nNo pressure — just wanted to stay on your radar.\n\nBest,\n{{senderName}}\n{{companyName}}`,
  },
  {
    label: 'Proposal Reminder',
    tag: 'Proposal',
    subject: `Your wrap proposal — any questions?`,
    body: `Hi {{contactName}},\n\nI sent over a proposal last week and wanted to follow up. Do you have any questions on the pricing, materials, or timeline?\n\nI'm happy to hop on a quick call or adjust anything to better fit your needs.\n\nWaiting on your end — just let me know.\n\nBest,\n{{senderName}}\n{{companyName}}`,
  },
  {
    label: 'Warm Introduction',
    tag: 'Intro',
    subject: `Fleet graphics for {{company}} — quick intro`,
    body: `Hi {{contactName}},\n\nMy name is {{senderName}} with {{companyName}}. We specialize in fleet wraps, vehicle graphics, and commercial signage — certified 3M and Avery installers.\n\nI came across {{company}} and thought there might be a fit. We've wrapped fleets from 1 vehicle to 100+, and most jobs turn around within 48 hours of print.\n\nWould you be open to a quick call to see if it makes sense?\n\nBest,\n{{senderName}}\n{{companyName}}`,
  },
  {
    label: 'Wrap Refresh / Re-Order',
    tag: 'Re-Order',
    subject: `Time to refresh your wrap? — {{company}}`,
    body: `Hi {{contactName}},\n\nHoping you're still loving the wrap we put on your fleet. Based on our install records, your vehicles are approaching the typical refresh window.\n\nWraps that are starting to fade or peel actually hurt your brand more than no wrap at all. We can re-wrap your fleet quickly — and with updated branding if you've evolved since the last install.\n\nWant me to put together a refresh quote?\n\nBest,\n{{senderName}}\n{{companyName}}`,
  },
  {
    label: 'Racing / Event Livery',
    tag: 'Racing',
    subject: `Race livery for your upcoming season — {{company}}`,
    body: `Hi {{contactName}},\n\nWe're based in {{location}} and specialize in race liveries, hauler wraps, pit equipment graphics, and garage branding for professional and amateur race teams.\n\nWith your season coming up, I wanted to reach out about your livery needs. We handle contingency requirements, sponsor placement specs, and tight race-weekend timelines.\n\nWould love to put together a concept for your team.\n\nBest,\n{{senderName}}\n{{companyName}}`,
  },
  {
    label: 'GC Referral Partner',
    tag: 'Referral',
    subject: `Partnership opportunity — graphics for your subs`,
    body: `Hi {{contactName}},\n\nWe work with several GCs across {{state}} as their preferred graphics vendor — fleet trucks for their subcontractors, branded signage, site graphics, and more.\n\nI'd love to offer your subs preferred pricing in exchange for referrals. It's a simple program — when a sub needs wraps, you send them to us, they get a discount, and we handle everything.\n\nWould you be open to a quick chat about how this works?\n\nBest,\n{{senderName}}\n{{companyName}}`,
  },
  {
    label: 'DI-NOC Surface Refresh',
    tag: 'DI-NOC',
    subject: `Surface refresh without demo — {{company}}`,
    body: `Hi {{contactName}},\n\nWe're certified 3M DI-NOC and Rea Tec installers — we resurface cabinets, walls, elevator panels, and millwork without demolition or replacement.\n\nFor a fraction of the cost and time of traditional renovation, we can make surfaces look brand new. Lead times are typically 1–3 days depending on scope.\n\nI'd love to send over some before/after examples if you have an upcoming project.\n\nBest,\n{{senderName}}\n{{companyName}}`,
  },
  {
    label: 'Competition Lost — Stay in Touch',
    tag: 'Lost',
    subject: `Thanks for the opportunity — {{company}}`,
    body: `Hi {{contactName}},\n\nThanks for considering us — I know you went a different direction this time, and I completely understand.\n\nIf anything comes up down the road — a second vehicle, a second shop location, or if you're ever looking for a backup vendor — we'd love to earn a shot.\n\nI'll stay in touch and hope we can work together in the future.\n\nBest,\n{{senderName}}\n{{companyName}}`,
  },
  {
    label: 'Quick ROI Summary',
    tag: 'ROI',
    subject: `The math on wrapping your fleet — {{company}}`,
    body: `Hi {{contactName}},\n\nI ran some quick numbers for your fleet:\n\n• A wrapped vehicle generates 30,000–70,000 impressions per day\n• Over 5 years, that's tens of millions of brand exposures\n• Cost per 1,000 impressions: $0.77 vs. $5.50 for a billboard\n\nYou're already paying for those trucks to drive around — a wrap turns them into a rolling billboard that pays for itself in year one.\n\nWant me to run the numbers specific to your fleet size?\n\nBest,\n{{senderName}}\n{{companyName}}`,
  },
  {
    label: 'Post-Install Check-In',
    tag: 'Check-In',
    subject: `How's the wrap holding up? — {{company}}`,
    body: `Hi {{contactName}},\n\nJust checking in — it's been a while since we wrapped your vehicles and wanted to make sure everything is holding up well and you're happy with the results.\n\nIf there's ever anything that needs attention, just let us know — we stand behind our work.\n\nAlso, if you know anyone else who might need wraps, referrals are always appreciated!\n\nBest,\n{{senderName}}\n{{companyName}}`,
  },
];

interface SequenceEmail {
  day: number;
  label: string;
  subject: string;
  body: string;
}

export default function EmailTab({ lead }: Props) {
  const qc = useQueryClient();
  const { settings, showToast, setApolloOpen, setApolloLeadId, setSettingsOpen } = useAppStore((s) => ({
    settings: s.settings,
    showToast: s.showToast,
    setApolloOpen: s.setApolloOpen,
    setApolloLeadId: s.setApolloLeadId,
    setSettingsOpen: s.setSettingsOpen,
  }));

  const [tabMode, setTabMode] = useState<TabMode>('single');
  const [emailType, setEmailType] = useState(EMAIL_TYPES[0]);
  const [tone, setTone] = useState(TONES[0]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);
  const [sequence, setSequence] = useState<SequenceEmail[] | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [activating, setActivating] = useState(false);
  const [copiedTpl, setCopiedTpl] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  function fillTemplate(tpl: EmailTemplate) {
    const location = settings.city && settings.state
      ? `${settings.city}, ${settings.state}`
      : settings.city || settings.state || 'our area';
    const fill = (s: string) => s
      .replace(/\{\{contactName\}\}/g, lead.contactName || lead.company)
      .replace(/\{\{company\}\}/g, lead.company)
      .replace(/\{\{senderName\}\}/g, settings.senderName || 'Your Name')
      .replace(/\{\{companyName\}\}/g, settings.companyName || 'our shop')
      .replace(/\{\{portfolioUrl\}\}/g, settings.portfolioUrl || 'our website')
      .replace(/\{\{vehicleType\}\}/g, lead.fleetSize ? `a ${lead.fleetSize}-unit fleet` : 'your vehicles')
      .replace(/\{\{location\}\}/g, location)
      .replace(/\{\{state\}\}/g, settings.state || 'our area');
    return { subject: fill(tpl.subject), body: fill(tpl.body) };
  }

  function loadTemplate(tpl: EmailTemplate) {
    const filled = fillTemplate(tpl);
    setResult(filled);
    setTabMode('single');
  }

  function copyTemplate(tpl: EmailTemplate, idx: number) {
    const filled = fillTemplate(tpl);
    navigator.clipboard.writeText(`Subject: ${filled.subject}\n\n${filled.body}`);
    setCopiedTpl(idx);
    setTimeout(() => setCopiedTpl(null), 1800);
  }

  const settingsIncomplete = !settings.senderName.trim() || !settings.companyName.trim();

  const { data: queueData, refetch: refetchQueue } = useQuery({
    queryKey: ['email-queue', lead.serverId],
    queryFn: () => api.getQueue(lead.serverId!),
    enabled: !!lead.serverId,
    staleTime: 15_000,
  });
  const queue = queueData?.queue ?? [];
  const pendingQueue = queue.filter((q) => q.status === 'pending');
  const hasActiveSequence = pendingQueue.length > 0;

  const cancelMutation = useMutation({
    mutationFn: (queueId: number) => api.cancelQueueItem(queueId),
    onSuccess: () => { refetchQueue(); showToast('Email cancelled'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  async function generate() {
    if (settingsIncomplete) return;
    setLoading(true);
    setResult(null);
    setSequence(null);
    try {
      if (tabMode === 'single') {
        const data = await api.generateEmail({ lead, emailType, tone, settings });
        setResult(data);
      } else {
        const data = await api.generateSequence({ lead, tone, settings });
        setSequence(data.emails);
      }
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string, idx?: number) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard');
      if (idx !== undefined) { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 1800); }
    });
  }

  function openMailTo() {
    if (!result || !lead.email) return;
    const url = `mailto:${lead.email}?subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(result.body)}`;
    window.open(url, '_blank');
  }

  async function sendEmail() {
    if (!result || !lead.email || !lead.serverId) return;
    setSending(true);
    try {
      await api.sendEmail(lead.serverId, {
        subject: result.subject,
        body: result.body,
        toEmail: lead.email,
        toName: lead.contactName || undefined,
      });
      qc.invalidateQueries({ queryKey: ['activities', lead.serverId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      showToast('Email sent!');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      if (msg.includes('RESEND_API_KEY')) {
        // Fall back to copying — log it anyway
        copy(`Subject: ${result.subject}\n\n${result.body}`);
        showToast('Resend not configured — copied to clipboard instead');
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setSending(false);
    }
  }

  function openApollo() {
    setApolloLeadId(lead.id);
    setApolloOpen(true);
  }

  async function activateSequence() {
    if (!lead.serverId || !lead.email) return;
    setActivating(true);
    try {
      const res = await api.activateSequence(lead.serverId, tone);
      qc.invalidateQueries({ queryKey: ['email-queue', lead.serverId] });
      qc.invalidateQueries({ queryKey: ['activities', lead.serverId] });
      showToast(`Drip activated — ${res.queued} emails queued`);
      refetchQueue();
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setActivating(false);
    }
  }

  return (
    <div>
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: 'var(--bg-input)', borderRadius: 8, padding: 4 }}>
        {(['single', 'sequence', 'templates'] as TabMode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setTabMode(m); setResult(null); setSequence(null); }}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: tabMode === m ? 'var(--accent)' : 'transparent',
              color: tabMode === m ? '#fff' : 'var(--text-dim)',
              transition: 'all 0.15s',
            }}
          >
            {m === 'single' ? 'Single' : m === 'sequence' ? 'Sequence' : 'Templates'}
          </button>
        ))}
      </div>

      {tabMode === 'templates' && (
        <div className="tpl-grid">
          {BUILT_IN_TEMPLATES.map((tpl, i) => (
            <div key={i} className="tpl-card">
              <div className="tpl-card-header">
                <span className="tpl-tag">{tpl.tag}</span>
                <span className="tpl-name">{tpl.label}</span>
              </div>
              <div className="tpl-preview">{fillTemplate(tpl).body.split('\n').slice(0, 3).join(' ').slice(0, 120)}…</div>
              <div className="tpl-actions">
                <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => loadTemplate(tpl)}>
                  Use Template
                </button>
                <button className="btn" style={{ fontSize: 11 }} onClick={() => copyTemplate(tpl, i)}>
                  {copiedTpl === i ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tabMode === 'single' && (
        <div className="field-group">
          <label className="field-label">Email Type</label>
          <div className="chip-group">
            {EMAIL_TYPES.map((t) => (
              <button key={t} className={`chip ${emailType === t ? 'active' : ''}`} onClick={() => setEmailType(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {tabMode === 'sequence' && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.5, padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 6 }}>
          Generates a 3-email drip: Day 1 intro, Day 4 value follow-up, Day 9 closing nudge — tailored to {lead.company}.
        </div>
      )}

      <div className="field-group">
        <label className="field-label">Tone</label>
        <div className="chip-group">
          {TONES.map((t) => (
            <button key={t} className={`chip ${tone === t ? 'active' : ''}`} onClick={() => setTone(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {!lead.email && (
        <button className="apollo-find-btn" onClick={openApollo}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Find contact email with Apollo
        </button>
      )}

      {settingsIncomplete && (
        <div style={{
          background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.3)',
          borderRadius: 8, padding: '12px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <span style={{ fontSize: 13, color: 'var(--yellow)', lineHeight: 1.4 }}>
            Add your name &amp; company in Settings for better emails.
          </span>
          <button className="btn" style={{ fontSize: 12, padding: '5px 10px', flexShrink: 0 }} onClick={() => setSettingsOpen(true)}>
            Open Settings
          </button>
        </div>
      )}

      <button className="generate-btn" onClick={generate} disabled={loading}>
        {loading
          ? <><span className="spinner" /> {tabMode === 'sequence' ? 'Building sequence…' : 'Generating…'}</>
          : tabMode === 'sequence' ? 'Generate 3-Email Sequence' : 'Generate Email'}
      </button>

      {tabMode === 'sequence' && lead.email && (
        <button
          className="generate-btn"
          style={{
            marginTop: 8, background: hasActiveSequence
              ? 'linear-gradient(135deg,rgba(74,222,128,0.15),rgba(74,222,128,0.08))'
              : 'linear-gradient(135deg,rgba(255,107,53,0.2),rgba(192,132,252,0.15))',
            border: hasActiveSequence ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,107,53,0.4)',
            color: hasActiveSequence ? 'var(--green)' : 'var(--accent)',
          }}
          onClick={activateSequence}
          disabled={activating || settingsIncomplete}
        >
          {activating
            ? <><span className="spinner" /> Queueing sequence…</>
            : hasActiveSequence
              ? `✓ Sequence active — ${pendingQueue.length} emails queued`
              : 'Activate Auto-Send Sequence'}
        </button>
      )}

      {queue.length > 0 && (
        <div style={{ marginTop: 12, background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 8 }}>
            Drip Queue
          </div>
          {queue.map((item) => {
            const sendDate = new Date(item.send_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const statusColor = item.status === 'sent' ? 'var(--green)' : item.status === 'failed' ? 'var(--red)' : item.status === 'cancelled' ? 'var(--text-faint)' : 'var(--accent)';
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border-soft)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, minWidth: 48 }}>Day {item.sequence_day}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</span>
                <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{item.status === 'sent' ? '✓ sent' : item.status === 'cancelled' ? 'cancelled' : sendDate}</span>
                {item.status === 'pending' && (
                  <button
                    className="btn"
                    style={{ fontSize: 10, padding: '2px 7px', color: 'var(--red)', borderColor: 'rgba(248,113,113,0.3)' }}
                    onClick={() => cancelMutation.mutate(item.id)}
                  >✕</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Single email result */}
      {result && (
        <div className="email-preview">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div className="email-subject-row" style={{ flex: 1, margin: 0, border: 'none', padding: 0, background: 'none' }}>
              <span className="label">Sub</span>
              <span className="subject">{result.subject}</span>
            </div>
            <button
              className="btn"
              style={{ fontSize: 11, flexShrink: 0, padding: '4px 10px' }}
              onClick={() => setPreviewMode((p) => !p)}
              title={previewMode ? 'Switch to edit mode' : 'Preview as email'}
            >
              {previewMode ? '✎ Edit' : '⊞ Preview'}
            </button>
          </div>
          {previewMode ? (
            <div className="email-client-preview">
              <div className="email-client-preview-meta">
                <div><span className="ecp-lbl">From:</span> <strong>{settings.senderName || 'You'}</strong>{settings.companyName ? ` · ${settings.companyName}` : ''}</div>
                <div><span className="ecp-lbl">To:</span> <strong>{lead.contactName || lead.company}</strong>{lead.email ? ` <${lead.email}>` : <span style={{ color: 'var(--text-faint)' }}> (no email on file)</span>}</div>
                <div><span className="ecp-lbl">Sub:</span> <strong>{result.subject}</strong></div>
              </div>
              <div className="email-client-preview-body">
                {result.body.split('\n').map((line, i) => (
                  <p key={i} className="ecp-line">{line || ' '}</p>
                ))}
              </div>
            </div>
          ) : (
            <div className="email-body">{result.body}</div>
          )}
          <div className="email-actions">
            <button className="btn" onClick={() => copy(`Subject: ${result.subject}\n\n${result.body}`)}>Copy</button>
            {lead.email && (
              <>
                <button className="btn btn-primary" onClick={sendEmail} disabled={sending}>
                  {sending ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 5 }} />Sending…</> : 'Send Email'}
                </button>
                <button className="btn" onClick={openMailTo} title="Open in your email client">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Open in Mail
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sequence results */}
      {sequence && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sequence.map((email, i) => (
            <div key={i} style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    background: 'var(--accent)', color: '#fff', borderRadius: 4,
                    fontSize: 11, fontWeight: 700, padding: '2px 7px',
                  }}>
                    Day {email.day}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>{email.label}</span>
                </div>
                <button
                  className="btn"
                  style={{ fontSize: 11, padding: '3px 9px' }}
                  onClick={() => copy(`Subject: ${email.subject}\n\n${email.body}`, i)}
                >
                  {copiedIdx === i ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                <strong style={{ color: 'var(--text)' }}>Subject:</strong> {email.subject}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                {email.body}
              </div>
            </div>
          ))}

          <button
            className="btn"
            style={{ fontSize: 12 }}
            onClick={() => {
              const text = sequence.map((e) =>
                `--- Day ${e.day}: ${e.label} ---\nSubject: ${e.subject}\n\n${e.body}`
              ).join('\n\n');
              copy(text);
            }}
          >
            Copy All 3 Emails
          </button>
        </div>
      )}
    </div>
  );
}
