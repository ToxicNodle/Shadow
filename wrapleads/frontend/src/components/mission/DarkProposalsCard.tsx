import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

export default function DarkProposalsCard() {
  const { setCurrentLeadId, setMode, showToast } = useAppStore((s) => ({
    setCurrentLeadId: s.setCurrentLeadId,
    setMode: s.setMode,
    showToast: s.showToast,
  }));

  const { data, isLoading } = useQuery({
    queryKey: ['proposals-needs-followup'],
    queryFn: () => api.getProposalsNeedingFollowup(),
    staleTime: 5 * 60_000,
  });

  const [expanded, setExpanded] = useState<number | null>(null);
  const [emails, setEmails] = useState<Record<number, { subject: string; body: string }>>({});
  const [copied, setCopied] = useState<number | null>(null);

  const genMut = useMutation({
    mutationFn: (id: number) => api.generateProposalFollowup(id),
    onSuccess: (d, id) => {
      setEmails((prev) => ({ ...prev, [id]: { subject: d.subject, body: d.body } }));
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const proposals = data?.proposals ?? [];
  if (isLoading || proposals.length === 0) return null;

  function copyEmail(id: number, subject: string, body: string) {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 18px', marginBottom: 12,
      borderLeftColor: '#f59e0b', borderLeftWidth: 3,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
            👻 Proposals Gone Dark
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {proposals.length} proposal{proposals.length !== 1 ? 's' : ''} sent 3+ days ago with no response — generate a follow-up
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99,
          background: '#f59e0b18', color: '#f59e0b', border: '1px solid #f59e0b30',
        }}>
          {proposals.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {proposals.map((p) => {
          const isOpen = expanded === p.id;
          const email = emails[p.id];
          const isGenerating = genMut.isPending && genMut.variables === p.id;

          return (
            <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {/* Proposal row */}
              <div
                style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: isOpen ? 'var(--bg-elev)' : 'transparent' }}
                onClick={() => setExpanded(isOpen ? null : p.id)}
              >
                {/* Status icon */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: p.viewCount > 0 ? '#f59e0b' : 'var(--text-faint)' }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.lead?.company ?? p.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {p.viewCount === 0 ? 'Never opened' : `Viewed ${p.viewCount}× · went quiet ${p.daysSinceView}d ago`}
                    {' · '}sent {p.daysSinceSent}d ago
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {p.lead && (
                    <button
                      className="btn"
                      style={{ fontSize: 10, padding: '2px 8px', color: '#4d8af5', borderColor: 'rgba(77,138,245,0.3)' }}
                      onClick={(e) => { e.stopPropagation(); setCurrentLeadId(String(p.lead!.id)); setMode('leads'); }}
                    >
                      Open Lead →
                    </button>
                  )}
                  <span style={{ fontSize: 10, color: isOpen ? 'var(--accent)' : 'var(--text-faint)', padding: '2px 6px' }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {/* Email panel */}
              {isOpen && (
                <div style={{ padding: '0 12px 14px', borderTop: '1px solid var(--border)' }}>
                  {!email && (
                    <div style={{ paddingTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: 11 }}
                        disabled={isGenerating}
                        onClick={() => genMut.mutate(p.id)}
                      >
                        {isGenerating ? <><span className="spinner" /> Generating…</> : '✨ Generate Follow-Up Email'}
                      </button>
                      <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                        AI drafts a context-aware nudge based on the proposal
                      </span>
                    </div>
                  )}
                  {email && (
                    <div style={{ paddingTop: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#4d8af5', marginBottom: 4 }}>
                        Subject: {email.subject}
                      </div>
                      <div style={{
                        fontSize: 12, color: 'var(--text)', lineHeight: 1.6, marginBottom: 10,
                        whiteSpace: 'pre-wrap', background: 'var(--bg-elev)', borderRadius: 8,
                        padding: '10px 12px', border: '1px solid var(--border)',
                      }}>
                        {email.body}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 11 }}
                          onClick={() => copyEmail(p.id, email.subject, email.body)}
                        >
                          {copied === p.id ? '✓ Copied!' : '📋 Copy Email'}
                        </button>
                        <button
                          className="btn"
                          style={{ fontSize: 11 }}
                          onClick={() => genMut.mutate(p.id)}
                          disabled={isGenerating}
                        >
                          ↺ Regenerate
                        </button>
                        <a
                          href={api.getProposalUrl(p.token)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}
                        >
                          View Proposal ↗
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-faint)' }}>
        Shows proposals sent 3+ days ago with no approval or decline — never opened, or viewed then went quiet.
      </div>
    </div>
  );
}
