import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useLeads } from '../../hooks/useLeads';
import { scoreLead, scoreLabel } from '../../utils/scoring';
import { useAppStore } from '../../store/useAppStore';

export default function PipelineStats() {
  const { leads } = useLeads();
  const setFilter = useAppStore((s) => s.setFilter);

  const { data: analytics } = useQuery({
    queryKey: ['leads-analytics'],
    queryFn: () => api.analytics(),
    staleTime: 30_000,
  });

  const hotCount = leads.filter((l) => scoreLabel(scoreLead(l)) === 'hot').length;
  const pipelineCount = leads.filter((l) => !['won', 'lost', 'cold'].includes(l.status)).length;
  const wonCount = analytics?.byStatus?.won ?? leads.filter((l) => l.status === 'won').length;
  const overdue = analytics?.overdue ?? 0;
  const total = analytics?.total ?? leads.length;

  return (
    <div className="pipeline-stats">
      <div className="pipeline-stat">
        <span className="ps-num">{total}</span>
        <span className="ps-label">leads</span>
      </div>

      <div className="pipeline-stat-sep" />

      <button
        className="pipeline-stat pipeline-stat-btn"
        onClick={() => setFilter({ status: 'all' })}
        title="Show hot leads (score 65+)"
      >
        <span className="ps-num hot">{hotCount}</span>
        <span className="ps-label">hot</span>
      </button>

      <div className="pipeline-stat-sep" />

      <button
        className="pipeline-stat pipeline-stat-btn"
        onClick={() => setFilter({ status: 'contacted' })}
        title="Leads in active pipeline stages"
      >
        <span className="ps-num">{pipelineCount}</span>
        <span className="ps-label">in pipeline</span>
      </button>

      <div className="pipeline-stat-sep" />

      <button
        className="pipeline-stat pipeline-stat-btn"
        onClick={() => setFilter({ status: 'won' })}
        title="Won deals"
      >
        <span className="ps-num green">{wonCount}</span>
        <span className="ps-label">won</span>
      </button>

      {overdue > 0 && (
        <>
          <div className="pipeline-stat-sep" />
          <button
            className="pipeline-stat pipeline-stat-btn overdue"
            onClick={() => setFilter({ status: 'contacted' })}
            title={`${overdue} leads contacted or replied but no follow-up in 14+ days`}
          >
            <span className="ps-num red">{overdue}</span>
            <span className="ps-label">overdue</span>
          </button>
        </>
      )}
    </div>
  );
}
