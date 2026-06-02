import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

const STAGE_LABELS: Record<string, string> = {
  new_to_contacted:     'New → Contacted',
  contacted_to_replied: 'Contacted → Replied',
  replied_to_meeting:   'Replied → Meeting',
  meeting_to_proposal:  'Meeting → Proposal',
  proposal_to_won:      'Proposal → Won',
};

const GRADE_COLORS: Record<string, string> = {
  A: '#00d97e', B: '#4d8af5', C: '#f4551c', D: '#fbbf24', F: '#ef4444', 'N/A': 'var(--text-faint)',
};

function RateFunnel({ rates }: { rates: Record<string, number> }) {
  const keys = ['new_to_contacted', 'contacted_to_replied', 'replied_to_meeting', 'meeting_to_proposal', 'proposal_to_won'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
      {keys.map((key) => {
        const rate = rates[key] ?? 0;
        const color = rate >= 60 ? '#00d97e' : rate >= 30 ? '#f4551c' : '#ef4444';
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 140, flexShrink: 0 }}>
              {STAGE_LABELS[key]}
            </span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border-subtle)', overflow: 'hidden' }}>
              <div style={{ width: `${rate}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.8s ease' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color, width: 32, textAlign: 'right', flexShrink: 0 }}>
              {rate}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function PipelineDoctorCard() {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-doctor'],
    queryFn: () => api.getPipelineDoctor(),
    staleTime: 30 * 60_000,
  });

  const gradeColor = data ? GRADE_COLORS[data.healthGrade] || GRADE_COLORS['N/A'] : 'var(--text-faint)';

  return (
    <section className="an-card" style={{ borderTop: `3px solid ${gradeColor}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', marginBottom: 2 }}>
            Pipeline Doctor
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {isLoading ? 'Diagnosing your pipeline…' : (data?.diagnosis ?? 'No diagnosis yet.')}
            </span>
          </div>
        </div>
        {data && (
          <div style={{
            flexShrink: 0, width: 48, height: 48, borderRadius: 10,
            background: `${gradeColor}20`, border: `2px solid ${gradeColor}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 900, color: gradeColor, letterSpacing: '-1px',
          }}>
            {data.healthGrade}
          </div>
        )}
      </div>

      {data && (
        <>
          {data.worstBottleneck && (
            <div style={{
              padding: '6px 10px', borderRadius: 6, marginBottom: 8,
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 13 }}>⚠</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24' }}>
                  Biggest chokepoint:
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 5 }}>
                  {data.worstBottleneck.stage} at only {data.worstBottleneck.rate}%
                </span>
              </div>
            </div>
          )}

          <RateFunnel rates={data.rates} />

          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              marginTop: 10, background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--accent)', padding: '4px 0',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {expanded ? '▲ Hide recommendations' : '▼ Show AI recommendations'}
          </button>

          {expanded && data.recommendations.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.recommendations.map((rec, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, padding: '7px 10px', borderRadius: 6,
                  background: 'rgba(77,138,245,0.06)', border: '1px solid rgba(77,138,245,0.15)',
                }}>
                  <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>
                    {i === 0 ? '①' : i === 1 ? '②' : '③'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{rec}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 10, display: 'flex', gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px' }}>{data.totalLeads}</div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.08em' }}>Total</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#00d97e', letterSpacing: '-0.5px' }}>{data.wonTotal}</div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.08em' }}>Won</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '-0.5px' }}>{data.lostTotal}</div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.08em' }}>Lost</div>
            </div>
            {data.avgDaysToClose > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#4d8af5', letterSpacing: '-0.5px' }}>{data.avgDaysToClose}</div>
                <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.08em' }}>Avg Days</div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
