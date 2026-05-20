import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { showToast } from '../../../utils/toast';
import QuoteBuilderModal from '../../modals/QuoteBuilderModal';
import { useLeads } from '../../../hooks/useLeads';
import type { Lead } from '../../../api/types';
import type { ShopQuote, QuoteStatus } from '../../../api/types';

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', invoiced: 'Invoiced',
};
const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: 'var(--text-muted)',
  sent: '#3b82f6',
  accepted: '#10b981',
  declined: '#ef4444',
  invoiced: '#8b5cf6',
};

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props { lead: Lead; }

export default function QuotesTab({ lead }: Props) {
  const qc = useQueryClient();
  const { updateLead } = useLeads();
  const leadId = lead.serverId!;
  const [showBuilder, setShowBuilder] = useState(false);
  const [editQuote, setEditQuote] = useState<ShopQuote | undefined>(undefined);
  const [suggestWon, setSuggestWon] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', leadId],
    queryFn: () => api.getLeadQuotes(leadId),
    enabled: !!leadId,
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteQuote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes', leadId] });
      showToast('Quote deleted');
    },
  });

  const quotes = data?.quotes ?? [];

  function openNew() {
    setEditQuote(undefined);
    setShowBuilder(true);
  }

  function openEdit(q: ShopQuote) {
    setEditQuote(q);
    setShowBuilder(true);
  }

  function handleAccepted() {
    if (lead.status !== 'won') setSuggestWon(true);
  }

  function markWon() {
    if (!lead.serverId) return;
    updateLead({ serverId: lead.serverId, patch: { status: 'won' } });
    setSuggestWon(false);
    showToast('Lead marked as Won!');
  }

  if (!leadId) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>Save this lead first to create quotes.</p>;
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Won suggestion banner */}
      {suggestWon && (
        <div className="won-suggest-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <span style={{ fontSize: 20 }}>🏆</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Quote accepted!</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ready to mark <strong>{lead.company}</strong> as Won?</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, background: '#10b981', border: '1px solid #10b981' }}
              onClick={markWon}
            >
              Yes, Mark Won →
            </button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => setSuggestWon(false)}>
              Later
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {quotes.length} quote{quotes.length !== 1 ? 's' : ''}
        </span>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={openNew}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 5 }}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Quote
        </button>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
          <span className="spinner" /> Loading…
        </div>
      )}

      {!isLoading && quotes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: 'var(--border)', display: 'block', margin: '0 auto 10px' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No quotes yet</p>
          <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 4 }}>Create a line-item quote and send it to the client</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {quotes.map((q) => (
          <div
            key={q.id}
            className="quote-card"
            onClick={() => openEdit(q)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {q.quote_number} · {timeAgo(q.created_at)}
                  {q.line_items?.length ? ` · ${q.line_items.length} line${q.line_items.length !== 1 ? 's' : ''}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>${fmt(q.total)}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: STATUS_COLORS[q.status], textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {STATUS_LABELS[q.status]}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                className="btn"
                style={{ fontSize: 11, color: 'var(--red)', padding: '3px 8px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete ${q.quote_number}?`)) deleteMut.mutate(q.id);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {showBuilder && (
        <QuoteBuilderModal
          leadId={leadId}
          leadCompany={lead.company}
          quote={editQuote}
          onClose={() => setShowBuilder(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['quotes', leadId] })}
          onAccepted={handleAccepted}
        />
      )}
    </div>
  );
}
