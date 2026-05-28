import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

export default function DailyBriefingCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['daily-briefing'],
    queryFn: () => api.getDailyBriefing(),
    staleTime: 4 * 60 * 60_000, // 4 hours
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="mission-card" style={{ borderLeftColor: '#4d8af5' }}>
        <div className="skeleton" style={{ height: 48, borderRadius: 6 }} />
      </div>
    );
  }

  if (!data?.briefing) return null;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="mission-card" style={{
      borderLeftColor: '#4d8af5',
      background: 'linear-gradient(135deg, rgba(77,138,245,0.04) 0%, transparent 100%)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4d8af5' }}>
          Today's Briefing
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{today}</span>
        {!data.dataOnly && (
          <span style={{
            fontSize: 9, padding: '1px 5px', borderRadius: 3,
            background: 'rgba(77,138,245,0.12)', color: '#4d8af5', fontWeight: 700,
            marginLeft: 'auto',
          }}>
            AI
          </span>
        )}
      </div>
      <p style={{
        fontSize: 13, color: 'var(--text)', lineHeight: 1.6,
        margin: 0, fontStyle: data.dataOnly ? 'normal' : 'normal',
      }}>
        {data.briefing}
      </p>
    </div>
  );
}
