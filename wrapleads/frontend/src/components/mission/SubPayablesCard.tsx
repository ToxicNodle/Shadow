import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

export default function SubPayablesCard() {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);
  const setMode = useAppStore((s) => s.setMode);

  const { data } = useQuery({
    queryKey: ['sub-payables'],
    queryFn: () => api.getSubPayables(),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const payables = data?.payables ?? [];
  const totalOwed = data?.totalOwed ?? 0;

  const markPaidMut = useMutation({
    mutationFn: (id: number) => api.markSubAssignmentPaid(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-payables'] });
      qc.invalidateQueries({ queryKey: ['installed-jobs'] });
      showToast('Sub payment recorded', 'success');
    },
  });

  if (!payables.length) return null;

  return (
    <div className="mission-card" style={{ borderLeft: '3px solid #f59e0b' }}>
      <div className="mission-card-header">
        <span className="mission-card-icon">💸</span>
        <div className="mission-card-title">Unpaid Subcontractors</div>
        <div className="mission-card-count">{payables.length}</div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 10, marginTop: -4 }}>
        ${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total outstanding across {payables.length} job assignment{payables.length !== 1 ? 's' : ''}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {payables.slice(0, 6).map((p) => (
          <div
            key={p.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elev)', borderRadius: 6, padding: '7px 10px' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.sub_name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.job_company} · {p.hours ? `${p.hours}h` : ''}
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b', flexShrink: 0 }}>
              ${Number(p.labor_cost).toLocaleString()}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className="btn"
                style={{ fontSize: 10, padding: '2px 8px', color: '#10b981', background: '#10b98112', border: '1px solid #10b98130' }}
                onClick={() => markPaidMut.mutate(p.id)}
                disabled={markPaidMut.isPending}
              >
                Pay
              </button>
              <button
                className="btn"
                style={{ fontSize: 10, padding: '2px 8px' }}
                onClick={() => setMode('jobs')}
              >
                View
              </button>
            </div>
          </div>
        ))}
      </div>

      {payables.length > 6 && (
        <button
          className="mission-link-btn"
          style={{ marginTop: 8, fontSize: 11 }}
          onClick={() => setMode('jobs')}
        >
          +{payables.length - 6} more unpaid — view all in Jobs →
        </button>
      )}
    </div>
  );
}
