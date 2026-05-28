import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { Lead } from '../../../api/types';

interface Props {
  lead: Lead;
}

type PrepData = {
  ok: boolean; fallback: boolean;
  companySnapshot: string;
  openingLine: string;
  pricingNote: string;
  talkTrack: string[];
  objections: Array<{ objection: string; counter: string }>;
  questionsToAsk: string[];
  closingMove: string;
  similarWinsNote: string;
  estimatedValue: number;
};

function fmtVal(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function Section({ title, color = 'var(--accent)', children }: { title: string; color?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function MeetingPrepPanel({ lead }: Props) {
  const [prep, setPrep] = useState<PrepData | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const mut = useMutation({
    mutationFn: () => api.generateMeetingPrep(lead.serverId!),
    onSuccess: (data) => {
      setPrep(data);
      setOpen(true);
    },
  });

  if (!lead.serverId || lead.status !== 'meeting') return null;

  function copyAll() {
    if (!prep) return;
    const text = [
      `MEETING PREP: ${lead.company}`,
      `\n📋 COMPANY SNAPSHOT\n${prep.companySnapshot}`,
      `\n💬 OPENING LINE\n"${prep.openingLine}"`,
      `\n💲 PRICING NOTE\n${prep.pricingNote}`,
      `\n🗺 TALK TRACK\n${prep.talkTrack.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
      `\n🛡 OBJECTIONS\n${prep.objections.map((o) => `Q: ${o.objection}\nA: ${o.counter}`).join('\n\n')}`,
      `\n❓ QUESTIONS TO ASK\n${prep.questionsToAsk.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
      `\n🎯 CLOSING MOVE\n${prep.closingMove}`,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(77,138,245,0.06)',
          border: '1px solid rgba(77,138,245,0.18)',
          cursor: 'pointer',
        }}
        onClick={() => {
          if (!prep) {
            mut.mutate();
          } else {
            setOpen((v) => !v);
          }
        }}
      >
        <span style={{ fontSize: 16 }}>📋</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Meeting Prep Brief</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {prep ? (open ? 'Click to collapse' : 'Click to expand') : 'AI-generated call preparation guide'}
          </div>
        </div>
        {prep && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 4 }}>
            {fmtVal(prep.estimatedValue)} opp
          </span>
        )}
        {mut.isPending ? (
          <span style={{ fontSize: 12, color: '#4d8af5' }}>Generating…</span>
        ) : !prep ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#4d8af5' }}>
            Generate Brief →
          </span>
        ) : (
          <span style={{ fontSize: 14, color: 'var(--text-faint)' }}>{open ? '▲' : '▼'}</span>
        )}
      </div>

      {mut.isError && (
        <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6, padding: '0 14px' }}>
          Failed: {(mut.error as Error).message}
        </div>
      )}

      {prep && open && (
        <div style={{
          marginTop: 4, borderRadius: '0 0 10px 10px',
          background: 'rgba(77,138,245,0.03)',
          border: '1px solid rgba(77,138,245,0.15)',
          borderTop: 'none',
          padding: '16px 16px 14px',
        }}>
          {prep.fallback && (
            <div style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', marginBottom: 12 }}>
              Basic template — add ANTHROPIC_API_KEY to get AI-personalized prep
            </div>
          )}

          <Section title="Company Snapshot" color="#4d8af5">
            <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
              {prep.companySnapshot}
            </p>
          </Section>

          <Section title="Opening Line" color="#10b981">
            <div style={{
              background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)',
              borderRadius: 8, padding: '10px 12px',
              fontSize: 13, fontStyle: 'italic', color: 'var(--text)', lineHeight: 1.6,
            }}>
              "{prep.openingLine}"
            </div>
          </Section>

          <Section title="Talk Track" color="#f59e0b">
            <ol style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {prep.talkTrack.map((step, i) => (
                <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{step}</li>
              ))}
            </ol>
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Section title="Likely Objections">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {prep.objections.map((obj, i) => (
                  <div key={i} style={{
                    background: 'rgba(239,68,68,0.05)', borderRadius: 7, padding: '8px 10px',
                    border: '1px solid rgba(239,68,68,0.12)',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 3 }}>
                      "{obj.objection}"
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.5 }}>
                      {obj.counter}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Questions to Ask">
              <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {prep.questionsToAsk.map((q, i) => (
                  <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{q}</li>
                ))}
              </ul>
            </Section>
          </div>

          <Section title="Pricing Strategy" color="#f59e0b">
            <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
              {prep.pricingNote}
            </p>
          </Section>

          <Section title="Closing Move" color="#10b981">
            <div style={{
              background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)',
              borderRadius: 8, padding: '10px 12px',
              fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
            }}>
              {prep.closingMove}
            </div>
          </Section>

          {prep.similarWinsNote && (
            <Section title="Social Proof" color="#8b5cf6">
              <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
                {prep.similarWinsNote}
              </p>
            </Section>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12 }}
              onClick={copyAll}
            >
              {copied ? '✓ Copied' : 'Copy Full Brief'}
            </button>
            <button
              className="btn"
              style={{ fontSize: 12 }}
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
            >
              {mut.isPending ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
