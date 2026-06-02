import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

type DedupLead = {
  id: number; company: string; status: string;
  city: string | null; state: string | null;
  email: string | null; phone: string | null;
  fleetSize: number | null; category: string;
};

type Pair = { a: DedupLead; b: DedupLead; simPct: number };

const STATUS_COLOR: Record<string, string> = {
  new: '#6366f1', contacted: '#3b82f6', replied: '#0ea5e9',
  meeting: '#f59e0b', proposal: '#f97316', won: '#22c55e', cold: '#94a3b8',
};

function LeadCard({ lead, badge }: { lead: DedupLead; badge: 'A' | 'B' }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, background: 'var(--bg-elev)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', background: badge === 'A' ? '#4d8af5' : '#6366f1',
          color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{badge}</span>
        <span style={{ fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Row label="Status">
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px',
            borderRadius: 4, background: `${STATUS_COLOR[lead.status] || '#94a3b8'}18`,
            color: STATUS_COLOR[lead.status] || '#94a3b8', letterSpacing: '0.05em',
          }}>{lead.status}</span>
        </Row>
        {(lead.city || lead.state) && <Row label="Location">{[lead.city, lead.state].filter(Boolean).join(', ')}</Row>}
        {lead.email     && <Row label="Email">{lead.email}</Row>}
        {lead.phone     && <Row label="Phone">{lead.phone}</Row>}
        {lead.fleetSize && <Row label="Fleet">{lead.fleetSize} trucks</Row>}
        {lead.category  && <Row label="Category">{lead.category}</Row>}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
      <span style={{ color: 'var(--text-faint)', minWidth: 56, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </div>
  );
}

interface PairCardProps {
  pair: Pair;
  onSkip: () => void;
  onMerge: (keepId: number, deleteId: number) => void;
  merging: boolean;
}

function PairCard({ pair, onSkip, onMerge, merging }: PairCardProps) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px',
      background: 'var(--bg-card)', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
          color: pair.simPct >= 90 ? '#ef4444' : pair.simPct >= 75 ? '#f59e0b' : '#4d8af5',
        }}>
          {pair.simPct}% similar
        </span>
        <button
          className="btn"
          style={{ fontSize: 11, padding: '3px 10px', color: 'var(--text-muted)' }}
          onClick={onSkip}
        >
          Not a duplicate
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <LeadCard lead={pair.a} badge="A" />
        <LeadCard lead={pair.b} badge="B" />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn"
          style={{ flex: 1, fontSize: 12, justifyContent: 'center' }}
          disabled={merging}
          onClick={() => onMerge(pair.a.id, pair.b.id)}
          title={`Keep "${pair.a.company}", delete "${pair.b.company}"`}
        >
          {merging ? <span className="spinner" style={{ width: 11, height: 11 }} /> : 'Keep A'}
        </button>
        <button
          className="btn"
          style={{ flex: 1, fontSize: 12, justifyContent: 'center' }}
          disabled={merging}
          onClick={() => onMerge(pair.b.id, pair.a.id)}
          title={`Keep "${pair.b.company}", delete "${pair.a.company}"`}
        >
          {merging ? <span className="spinner" style={{ width: 11, height: 11 }} /> : 'Keep B'}
        </button>
      </div>
    </div>
  );
}

export default function DedupModal({ onClose }: { onClose: () => void }) {
  const showToast = useAppStore((s) => s.showToast);
  const qc = useQueryClient();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [mergingKey, setMergingKey] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dedup-leads'],
    queryFn: () => api.findDuplicateLeads(),
    staleTime: 30_000,
  });

  const mergeMut = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: number; targetId: number }) =>
      api.mergeLeads(sourceId, targetId),
    onSuccess: (result, vars) => {
      showToast(`Merged "${result.mergedCompany}" into lead — activities and data combined`, 'success');
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dedup-leads'] });
      setMergingKey(null);
      const key = `${Math.min(vars.sourceId, vars.targetId)}-${Math.max(vars.sourceId, vars.targetId)}`;
      setSkipped((s) => new Set([...s, key]));
    },
    onError: (e: Error) => {
      showToast(e.message, 'error');
      setMergingKey(null);
    },
  });

  const visiblePairs = (data?.pairs ?? []).filter((p) => {
    const key = `${Math.min(p.a.id, p.b.id)}-${Math.max(p.a.id, p.b.id)}`;
    return !skipped.has(key);
  });

  function handleSkip(pair: Pair) {
    const key = `${Math.min(pair.a.id, pair.b.id)}-${Math.max(pair.a.id, pair.b.id)}`;
    setSkipped((s) => new Set([...s, key]));
  }

  function handleMerge(keepId: number, deleteId: number) {
    const key = `${Math.min(keepId, deleteId)}-${Math.max(keepId, deleteId)}`;
    setMergingKey(key);
    mergeMut.mutate({ sourceId: deleteId, targetId: keepId });
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 600, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <div className="modal-title">Duplicate Lead Scanner</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Fuzzy-matches your active leads by company name. Merge to combine activities, emails, and proposals.
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: 'var(--text-muted)' }}>
              <span className="spinner" style={{ width: 16, height: 16 }} />
              Scanning for duplicate companies…
            </div>
          )}

          {isError && (
            <div style={{ color: '#ef4444', fontSize: 13 }}>Failed to scan for duplicates. Try again.</div>
          )}

          {!isLoading && !isError && visiblePairs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>No duplicates found</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {(data?.pairs.length ?? 0) > 0
                  ? `All ${data!.pairs.length} flagged pair${data!.pairs.length !== 1 ? 's' : ''} resolved.`
                  : 'All your active leads have unique company names.'}
              </div>
            </div>
          )}

          {visiblePairs.map((pair) => {
            const key = `${Math.min(pair.a.id, pair.b.id)}-${Math.max(pair.a.id, pair.b.id)}`;
            return (
              <PairCard
                key={key}
                pair={pair}
                onSkip={() => handleSkip(pair)}
                onMerge={handleMerge}
                merging={mergingKey === key}
              />
            );
          })}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ flexShrink: 0 }}>
          {!isLoading && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {visiblePairs.length} potential duplicate pair{visiblePairs.length !== 1 ? 's' : ''} remaining
            </span>
          )}
          <button className="btn" onClick={onClose} style={{ marginLeft: 'auto' }}>Close</button>
        </div>
      </div>
    </div>
  );
}
