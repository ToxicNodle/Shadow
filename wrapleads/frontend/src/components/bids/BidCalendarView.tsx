import { useState } from 'react';
import type { Bid } from '../../api/types';

// ── Status colour map ──────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  tracking:    '#6366f1',
  submitted:   '#4d8af5',
  shortlisted: '#f59e0b',
  won:         '#00d97e',
  lost:        '#ef4444',
  no_bid:      '#6b7280',
  pending:     '#f4551c',
};

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? '#6b7280';
}

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  bids: Bid[];
  onBidClick?: (bid: Bid) => void;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function BidCalendarView({ bids, onBidClick }: Props) {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [popoverDay, setPopoverDay] = useState<number | null>(null);

  const year  = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Map day-of-month → bids due that day
  const bidsByDay = new Map<number, Bid[]>();
  for (const bid of bids) {
    if (!bid.bid_due) continue;
    const d = new Date(bid.bid_due);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!bidsByDay.has(day)) bidsByDay.set(day, []);
      bidsByDay.get(day)!.push(bid);
    }
  }

  const today = new Date();
  const todayDay =
    today.getFullYear() === year && today.getMonth() === month
      ? today.getDate()
      : null;

  // Build 5-6 week grid
  const firstDow   = new Date(year, month, 1).getDay();  // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    setCurrentMonth(new Date(year, month - 1, 1));
    setPopoverDay(null);
  }
  function nextMonth() {
    setCurrentMonth(new Date(year, month + 1, 1));
    setPopoverDay(null);
  }

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          className="btn"
          style={{ padding: '5px 10px', fontSize: 13 }}
          onClick={prevMonth}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span style={{ fontWeight: 700, fontSize: 15, flex: 1, textAlign: 'center' }}>
          {monthLabel}
        </span>
        <button
          className="btn"
          style={{ padding: '5px 10px', fontSize: 13 }}
          onClick={nextMonth}
          aria-label="Next month"
        >
          ›
        </button>
        <button
          className="btn"
          style={{ fontSize: 11 }}
          onClick={() => {
            const d = new Date();
            setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            setPopoverDay(null);
          }}
        >
          Today
        </button>
      </div>

      {/* Day-of-week header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 2,
        marginBottom: 4,
      }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              padding: '4px 0',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 2,
        position: 'relative',
      }}>
        {cells.map((day, i) => {
          if (day === null) {
            return (
              <div
                key={`e${i}`}
                style={{ minHeight: 72, background: 'transparent' }}
              />
            );
          }

          const dayBids    = bidsByDay.get(day) ?? [];
          const isToday    = day === todayDay;
          const isPast     = !isToday && new Date(year, month, day) < today;
          const hasPopover = popoverDay === day && dayBids.length > 0;

          return (
            <div
              key={day}
              style={{
                minHeight: 72,
                padding: '4px 5px',
                borderRadius: 6,
                background: isToday
                  ? 'rgba(244,85,28,.08)'
                  : isPast
                  ? 'var(--surface)'
                  : 'var(--bg-elev)',
                border: isToday
                  ? '1px solid rgba(244,85,28,.4)'
                  : '1px solid var(--border)',
                position: 'relative',
                cursor: dayBids.length > 0 ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (dayBids.length === 0) return;
                setPopoverDay(hasPopover ? null : day);
              }}
            >
              {/* Day number */}
              <div style={{
                fontSize: 11,
                fontWeight: isToday ? 800 : 500,
                color: isToday
                  ? 'var(--accent)'
                  : isPast
                  ? 'var(--text-faint)'
                  : 'var(--text)',
                marginBottom: 3,
              }}>
                {day}
              </div>

              {/* Bid chips (up to 3) */}
              {dayBids.slice(0, 3).map((bid) => {
                const color = statusColor(bid.status);
                return (
                  <div
                    key={bid.id}
                    title={bid.project_name}
                    style={{
                      marginBottom: 2,
                      padding: '2px 4px',
                      borderRadius: 3,
                      fontSize: 9,
                      fontWeight: 600,
                      lineHeight: 1.3,
                      background: `${color}28`,
                      color,
                      borderLeft: `2px solid ${color}`,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {bid.project_name}
                  </div>
                );
              })}

              {dayBids.length > 3 && (
                <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 1 }}>
                  +{dayBids.length - 3} more
                </div>
              )}

              {/* Popover */}
              {hasPopover && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    zIndex: 40,
                    background: 'var(--bg-elev)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,.3)',
                    padding: '10px 12px',
                    minWidth: 200,
                    maxWidth: 280,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '.07em',
                    color: 'var(--text-muted)',
                    marginBottom: 8,
                  }}>
                    {new Date(year, month, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  {dayBids.map((bid) => {
                    const color = statusColor(bid.status);
                    return (
                      <div
                        key={bid.id}
                        style={{
                          marginBottom: 8,
                          paddingBottom: 8,
                          borderBottom: '1px solid var(--border)',
                          cursor: onBidClick ? 'pointer' : 'default',
                        }}
                        onClick={() => {
                          if (onBidClick) onBidClick(bid);
                          setPopoverDay(null);
                        }}
                      >
                        <div style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--text)',
                          marginBottom: 2,
                        }}>
                          {bid.project_name}
                        </div>
                        {bid.gc_name && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {bid.gc_name}
                          </div>
                        )}
                        <div style={{
                          marginTop: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          color,
                          background: `${color}18`,
                          padding: '1px 6px',
                          borderRadius: 99,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                          {bid.estimated_value ? ` · $${(bid.estimated_value / 1000).toFixed(0)}K` : ''}
                        </div>
                      </div>
                    );
                  })}
                  <button
                    style={{
                      fontSize: 10,
                      color: 'var(--text-faint)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    onClick={() => setPopoverDay(null)}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginTop: 14,
        flexWrap: 'wrap',
      }}>
        {Object.entries(STATUS_COLORS)
          .filter(([k]) => k !== 'no_bid')
          .map(([status, color]) => (
            <div
              key={status}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 10,
                color: 'var(--text-muted)',
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: color,
                display: 'inline-block',
              }} />
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </div>
          ))}
      </div>
    </div>
  );
}
