import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { showToast } from '../../utils/toast';
import type { ShopQuote, QuoteLineItem, QuoteStatus } from '../../api/types';

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  invoiced: 'Invoiced',
};

const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: 'var(--text-muted)',
  sent: '#3b82f6',
  accepted: '#10b981',
  declined: '#ef4444',
  invoiced: '#8b5cf6',
};

const UNIT_OPTIONS = ['vehicle', 'sqft', 'hour', 'flat', 'panel', 'set', 'item'];

const DEFAULT_LINE_ITEMS: QuoteLineItem[] = [
  { id: crypto.randomUUID(), description: 'Full vehicle wrap – labor & installation', qty: 1, unit: 'vehicle', unitPrice: 0, total: 0 },
  { id: crypto.randomUUID(), description: 'Material (vinyl film)', qty: 0, unit: 'sqft', unitPrice: 0, total: 0 },
  { id: crypto.randomUUID(), description: 'Design & artwork', qty: 1, unit: 'flat', unitPrice: 0, total: 0 },
];

interface Props {
  leadId: number;
  leadCompany: string;
  quote?: ShopQuote;
  onClose: () => void;
  onSaved: () => void;
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function QuoteBuilderModal({ leadId, leadCompany, quote, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const isEdit = !!quote;

  const [title, setTitle] = useState(quote?.title ?? 'Vehicle Wrap Quote');
  const [status, setStatus] = useState<QuoteStatus>(quote?.status ?? 'draft');
  const [validDays, setValidDays] = useState(quote?.valid_days ?? 30);
  const [taxRate, setTaxRate] = useState(quote?.tax_rate ?? 0);
  const [discount, setDiscount] = useState(quote?.discount ?? 0);
  const [notes, setNotes] = useState(quote?.notes ?? '50% deposit required. Balance due upon completion. Quote valid for the number of days stated above.');
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>(
    quote?.line_items?.length ? quote.line_items : DEFAULT_LINE_ITEMS
  );
  const [saving, setSaving] = useState(false);

  const subtotal = lineItems.reduce((s, i) => s + (i.total || 0), 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = subtotal + taxAmount - discount;

  const updateItem = useCallback((id: string, patch: Partial<QuoteLineItem>) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        next.total = Math.round(next.qty * next.unitPrice * 100) / 100;
        return next;
      })
    );
  }, []);

  function addLine() {
    setLineItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: '', qty: 1, unit: 'flat', unitPrice: 0, total: 0 },
    ]);
  }

  function removeLine(id: string) {
    setLineItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function save(nextStatus?: QuoteStatus) {
    const s = nextStatus ?? status;
    setSaving(true);
    try {
      const payload = {
        title, status: s, line_items: lineItems,
        tax_rate: taxRate, discount, notes, valid_days: validDays,
      };
      if (isEdit) {
        await api.updateQuote(quote!.id, payload);
      } else {
        await api.createQuote(leadId, payload);
      }
      qc.invalidateQueries({ queryKey: ['quotes', leadId] });
      showToast(isEdit ? 'Quote updated' : 'Quote created');
      onSaved();
      onClose();
    } catch (e: unknown) {
      showToast((e as Error).message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <>
      {/* Print stylesheet — only visible when printing */}
      <style>{`
        @media print {
          body > *:not(.qb-print-root) { display: none !important; }
          .qb-print-root { position: fixed; inset: 0; background: white; color: black; padding: 40px; font-family: Arial, sans-serif; }
          .modal-overlay, .modal-box { display: none !important; }
        }
      `}</style>

      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-box"
          style={{ maxWidth: 760, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="modal-header" style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
              <input
                className="qb-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Quote title…"
              />
              {isEdit && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {quote!.quote_number}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                className="input"
                style={{ fontSize: 12, padding: '4px 8px', width: 110, color: STATUS_COLORS[status] }}
                value={status}
                onChange={(e) => setStatus(e.target.value as QuoteStatus)}
              >
                {(Object.keys(STATUS_LABELS) as QuoteStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button className="modal-close" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Subheader */}
          <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 24, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            <span>Client: <strong style={{ color: 'var(--text)' }}>{leadCompany}</strong></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Valid for:
              <input
                type="number"
                className="input"
                min={1}
                max={365}
                value={validDays}
                onChange={(e) => setValidDays(parseInt(e.target.value) || 30)}
                style={{ width: 56, fontSize: 12, padding: '2px 6px', textAlign: 'center' }}
              />
              days
            </span>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>

            {/* Line items table */}
            <div className="qb-table">
              <div className="qb-thead">
                <span style={{ flex: 1 }}>Description</span>
                <span className="qb-col-sm" style={{ textAlign: 'center' }}>Qty</span>
                <span className="qb-col-md">Unit</span>
                <span className="qb-col-md" style={{ textAlign: 'right' }}>Unit Price</span>
                <span className="qb-col-md" style={{ textAlign: 'right' }}>Total</span>
                <span className="qb-col-xs" />
              </div>

              {lineItems.map((item, i) => (
                <div key={item.id} className="qb-row">
                  <input
                    className="input qb-desc"
                    placeholder={`Line item ${i + 1}…`}
                    value={item.description}
                    onChange={(e) => updateItem(item.id, { description: e.target.value })}
                  />
                  <input
                    type="number"
                    className="input qb-col-sm"
                    min={0}
                    value={item.qty}
                    onChange={(e) => updateItem(item.id, { qty: parseFloat(e.target.value) || 0 })}
                    style={{ textAlign: 'center' }}
                  />
                  <select
                    className="input qb-col-md"
                    value={item.unit}
                    onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                  >
                    {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <div className="qb-col-md" style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}>$</span>
                    <input
                      type="number"
                      className="input"
                      min={0}
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                      style={{ paddingLeft: 18, textAlign: 'right' }}
                    />
                  </div>
                  <div className="qb-col-md qb-total-cell">
                    ${fmt(item.total)}
                  </div>
                  <button
                    className="qb-col-xs qb-remove-btn"
                    onClick={() => removeLine(item.id)}
                    title="Remove line"
                    disabled={lineItems.length <= 1}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button className="qb-add-btn" onClick={addLine}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add line item
              </button>
            </div>

            {/* Totals */}
            <div className="qb-totals">
              <div className="qb-totals-row">
                <span>Subtotal</span>
                <span>${fmt(subtotal)}</span>
              </div>
              <div className="qb-totals-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Tax
                  <input
                    type="number"
                    className="input"
                    min={0}
                    max={30}
                    step={0.25}
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    style={{ width: 56, fontSize: 12, padding: '2px 6px', textAlign: 'center' }}
                  />
                  %
                </span>
                <span>${fmt(taxAmount)}</span>
              </div>
              <div className="qb-totals-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Discount ($)
                  <input
                    type="number"
                    className="input"
                    min={0}
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    style={{ width: 72, fontSize: 12, padding: '2px 6px', textAlign: 'center' }}
                  />
                </span>
                <span style={{ color: discount > 0 ? '#10b981' : undefined }}>
                  {discount > 0 ? `-$${fmt(discount)}` : '$0.00'}
                </span>
              </div>
              <div className="qb-totals-row qb-totals-final">
                <span>Total</span>
                <span>${fmt(total)}</span>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                Notes / Terms
              </label>
              <textarea
                className="input"
                rows={3}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms, deposit requirements, expiry conditions…"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn" onClick={handlePrint} style={{ fontSize: 12 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Print / PDF
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => save('draft')} disabled={saving}>
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
              {status !== 'accepted' && (
                <button className="btn btn-primary" onClick={() => save('sent')} disabled={saving}>
                  {saving ? 'Saving…' : 'Mark as Sent →'}
                </button>
              )}
              {status === 'sent' && (
                <button
                  className="btn"
                  style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b98140' }}
                  onClick={() => save('accepted')}
                  disabled={saving}
                >
                  Mark Accepted ✓
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
