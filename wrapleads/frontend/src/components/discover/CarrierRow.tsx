import type { Carrier } from '../../api/types';
import { useImportCarrier } from '../../hooks/useCarriers';
import { useAppStore } from '../../store/useAppStore';

interface Props {
  carrier: Carrier;
  checked: boolean;
}

function ScoreMeter({ score }: { score: number }) {
  const label = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cool';
  const color = score >= 70 ? 'var(--accent)' : score >= 40 ? '#f59e0b' : 'var(--text-faint)';
  return (
    <div className="carrier-score-meter" title={`Wrap-score: ${score}/100`}>
      <div className="carrier-score-bar-track">
        <div className="carrier-score-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="carrier-score-label" style={{ color }}>{label}</span>
    </div>
  );
}

function StaleTag({ years }: { years?: number }) {
  if (years == null) return null;
  const color = years <= 1 ? 'var(--green)' : years <= 3 ? '#f59e0b' : 'var(--text-faint)';
  const label = years === 0 ? 'Active' : `${years}y ago`;
  return <span className="carrier-stale" style={{ color }}>{label}</span>;
}

export default function CarrierRow({ carrier, checked }: Props) {
  const { toggleCarrierId } = useAppStore((s) => ({ toggleCarrierId: s.toggleCarrierId }));
  const importMutation = useImportCarrier();

  return (
    <div className="carrier-row">
      <input
        type="checkbox"
        className="carrier-cb"
        checked={checked}
        onChange={() => toggleCarrierId(carrier.id)}
      />
      <div className="carrier-cell-name">
        <div className="carrier-name">{carrier.name}</div>
        {carrier.dba_name && <div className="carrier-dba">DBA: {carrier.dba_name}</div>}
        {carrier.dot_number && <div className="carrier-dot">DOT #{carrier.dot_number}</div>}
      </div>
      <div className="carrier-fleet">
        <strong>{carrier.fleet_size ?? '—'}</strong>
        {carrier.fleet_size && <small> units</small>}
      </div>
      <div className="carrier-score-cell">
        <ScoreMeter score={carrier.wrap_score} />
        <StaleTag years={carrier.years_since_report} />
      </div>
      <div className="carrier-loc">
        {carrier.city && carrier.state ? `${carrier.city}, ${carrier.state}` : carrier.state ?? '—'}
      </div>
      <div className="carrier-contact">
        {carrier.phone ? (
          <a href={`tel:${carrier.phone}`} className="carrier-phone-link">
            {carrier.phone}
          </a>
        ) : '—'}
      </div>
      <div>
        {carrier.already_imported ? (
          <span className="add-lead-btn imported">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 11, height: 11 }}><polyline points="20 6 9 17 4 12"/></svg>
            In CRM
          </span>
        ) : (
          <button
            className="add-lead-btn"
            onClick={() => importMutation.mutate(carrier.id)}
            disabled={importMutation.isPending}
          >
            {importMutation.isPending ? '…' : '+ Add'}
          </button>
        )}
      </div>
    </div>
  );
}
