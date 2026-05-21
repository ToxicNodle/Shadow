import { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';

const CHANGELOG: Array<{
  date: string;
  tag: 'new' | 'improved' | 'fix';
  title: string;
  body: string;
}> = [
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Won Deal Drill-Down',
    body: 'Click any revenue bar in Analytics to see the exact deals that made up that month — company, category, value, and a direct link to the lead.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Import & Launch Sequences in One Click',
    body: 'Select carriers in Discover → "Import & Launch Sequences" → AI email campaigns start automatically. You land on Mission to watch them run.',
  },
  {
    date: 'May 2025',
    tag: 'improved',
    title: 'Revenue Trend Chart',
    body: 'The Analytics "Won" chart now shows estimated revenue per month (not just deal count), scaled by category — fleet $4.5K, GC referral $18K, motorsport $40K.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Wrap ROI Calculator',
    body: 'Fleet leads now show a CPM comparison tool: enter cost/vehicle and annual miles to see cost-per-thousand-impressions vs billboards, radio, and TV.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'GC Directory in Bid Tracker',
    body: 'New "GC Directory" tab aggregates all general contractors you\'ve bid with — win rate, total bid value, and last won date per GC.',
  },
  {
    date: 'May 2025',
    tag: 'improved',
    title: 'Upgrade Flow — ROI Context',
    body: 'Pricing page now shows per-plan ROI multipliers (WrapLeads 4.7×, ShopFlow 10×, WrapOS 13×) and an industry deal-size benchmark strip.',
  },
  {
    date: 'May 2025',
    tag: 'improved',
    title: 'Discover Sort & Phone Filter',
    body: 'Sort carrier results by fleet size, wrap score, name, or recency. Toggle "Has Phone" to show only contactable carriers.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Wrap Portfolio Value Strip',
    body: 'Jobs view now shows total estimated portfolio value, revenue by category, and re-order pipeline count at a glance.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Search Intelligence Strip',
    body: 'Discover search results now show a smart summary: avg fleet size, hot lead count, contactable %, and estimated territory opportunity.',
  },
  {
    date: 'Apr 2025',
    tag: 'new',
    title: 'Win Probability on Bids',
    body: 'Bid cards now show win probability badges (15% → 65%) with color-coded confidence, plus quick-advance buttons to move bids through stages.',
  },
];

const TAG_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  new:      { bg: 'rgba(99,102,241,0.15)',  color: '#818cf8', label: 'New'      },
  improved: { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', label: 'Improved' },
  fix:      { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', label: 'Fix'      },
};

const CHANGELOG_SEEN_KEY = 'wl_changelog_seen';
const LATEST_DATE = CHANGELOG[0].date;

export function getChangelogBadge(): boolean {
  try {
    return localStorage.getItem(CHANGELOG_SEEN_KEY) !== LATEST_DATE;
  } catch {
    return false;
  }
}

export default function ChangelogPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    try { localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_DATE); } catch { /* noop */ }
  }, []);

  return (
    <>
      <div className="notif-backdrop" onClick={onClose} />
      <div className="notif-panel" style={{ width: 340 }}>
        <div className="notif-header">
          <span className="notif-title">What's New</span>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>WrapLeads changelog</span>
        </div>

        <div className="notif-list" style={{ maxHeight: 480 }}>
          {CHANGELOG.map((entry, i) => {
            const ts = TAG_STYLES[entry.tag];
            return (
              <div
                key={i}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                    padding: '2px 6px', borderRadius: 4,
                    background: ts.bg, color: ts.color,
                    flexShrink: 0,
                  }}>
                    {ts.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
                    {entry.title}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>
                    {entry.date}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  {entry.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
