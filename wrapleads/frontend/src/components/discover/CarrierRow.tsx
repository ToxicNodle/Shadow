import type { Carrier } from '../../api/types';
import { useImportCarrier } from '../../hooks/useCarriers';
import { useAppStore } from '../../store/useAppStore';

interface Props {
  carrier: Carrier;
  checked: boolean;
}

function WrapBadge({ score }: { score: number }) {
  if (score >= 70) return <span className="wrap-badge hot">Hot</span>;
  if (score >= 40) return <span className="wrap-badge warm">Warm</span>;
  return <span className="wrap-badge cool">Cool</span>;
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
      <div>
        <div className="carrier-name">{carrier.name}</div>
        {carrier.dba_name && <div className="carrier-dba">DBA: {carrier.dba_name}</div>}
        <WrapBadge score={carrier.wrap_score} />
      </div>
      <div className="carrier-fleet">
        {carrier.fleet_size ?? '—'}
        <small> units</small>
      </div>
      <div className="carrier-loc">
        {carrier.city && carrier.state ? `${carrier.city}, ${carrier.state}` : carrier.state ?? '—'}
      </div>
      <div className="carrier-contact">
        {carrier.phone ? (
          <a href={`tel:${carrier.phone}`} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>
            {carrier.phone}
          </a>
        ) : '—'}
      </div>
      <div>
        {carrier.already_imported ? (
          <span className="add-lead-btn imported">✓ Imported</span>
        ) : (
          <button
            className="add-lead-btn"
            onClick={() => importMutation.mutate(carrier.id)}
            disabled={importMutation.isPending}
          >
            + Add Lead
          </button>
        )}
      </div>
    </div>
  );
}
