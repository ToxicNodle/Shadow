import { useEffect } from 'react';

const CHANGELOG: Array<{
  date: string;
  tag: 'new' | 'improved' | 'fix';
  title: string;
  body: string;
}> = [
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Intent Signals Dashboard',
    body: 'Mission now shows a real-time "buying intent" leaderboard across ALL signal types: email opens (3pts), proposal views (4pts), recent replies (10pts), and aging wrap lifecycle signals (6pts). Leads are scored and ranked so you always know exactly who to call first. Refreshes every 5 minutes.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Referral Mining — Automated 30-Day Win Follow-Up',
    body: 'A background worker runs daily and fires a notification exactly 30 days after you win a deal — while the client relationship is warmest. One click generates a personalized referral ask email and copies it to your clipboard. No manual tracking required.',
  },
  {
    date: 'May 2026',
    tag: 'improved',
    title: 'AI Call Intelligence — Objection + Key Info Extraction',
    body: 'After every AI outbound call, Claude now analyzes the full transcript to extract: objections raised, key information (fleet count, rebrand timeline, budget hints), prospect sentiment, and the single best next action. All extracted intel appears in the lead\'s activity timeline and auto-populates competitor/notes fields.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Pipeline Doctor — AI Bottleneck Diagnosis',
    body: 'Analytics now includes a Pipeline Doctor card that calculates your stage-by-stage conversion rates, pinpoints your single biggest chokepoint, grades your overall pipeline health A–F, and generates 3 specific AI recommendations to fix the leak. Powered by Claude Haiku, refreshed on demand.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Territory Intel — Untouched Opportunity by State',
    body: 'A new Analytics card ranks every U.S. state by untouched wrap opportunity — sweet-spot carriers (25–500 vehicles) you haven\'t contacted yet, weighted by avg fleet size. Click any state row to launch a pre-filtered Discover search. States where you\'ve already won deals are highlighted in green.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Warm Reference Engine',
    body: 'Every lead detail now shows a "Social Proof" panel listing up to 3 won customers in the same state or service category. Name-drop these during cold outreach — fleet managers always ask "have you done this before?" Now you have a ready answer with dollar amounts and cities.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Prospect News Intelligence',
    body: 'A background worker now monitors your active pipeline leads for recent company news. When a lead makes headlines — fleet expansion, rebrand, contract win — you get an instant notification and the article is logged to the lead\'s activity timeline. Each lead detail also has a "Company News Intel" panel to check on-demand. Uses Google News RSS, zero cost.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Truck Scan to Lead',
    body: 'Photograph any commercial truck in the wild. Claude Vision extracts the company name and DOT number, cross-references 600K FMCSA carriers, and imports the match to your CRM in one tap. Works from Discover (🚛 Scan Truck button), the Command Palette, or a direct camera shot on mobile.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Competitive Intel — Counter-Pitch from Wrap Photo',
    body: 'Upload a photo of a competitor\'s wrap to any lead record. AI analyzes design quality, identifies weaknesses, and generates a specific counter-pitch tailored to the fleet manager seeing that competitor\'s work. Rates competitor quality as budget/mid-range/premium and lists your winning selling points.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Re-Order Lead from Job Tracker',
    body: 'Any logged install in the Wrap Lifecycle Tracker now has a "Create Re-Order Lead" button — both in the job detail modal and inline on aging/expiring jobs. Creates a pre-filled CRM lead with expiry context, logs an activity, and navigates directly to the leads view.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '3-Month Revenue Projection',
    body: 'Analytics now shows a confidence-range revenue forecast for the next three months, combining your current pipeline stages with actual historical win rates. Shows low/expected/high ranges, tracks progress against your monthly goal, and lists the specific deals driving each month\'s projection.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Email Send-Time Intelligence',
    body: 'Analytics now shows exactly when your prospects open emails — hour-of-day bars and day-of-week breakdown for the last 90 days. Surfaces the optimal outreach windows and lists leads who have opened emails recently so you can strike while they\'re engaged.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Seasonal Win Intelligence',
    body: 'A new Analytics card shows your month-by-month win history as a sparkline, identifies which service category is historically strongest in the current season, and surfaces the active pipeline leads you should push right now to ride that seasonal wave.',
  },
  {
    date: 'May 2026',
    tag: 'improved',
    title: 'Discover — Near My Shop + Signal Badges',
    body: 'A new "Near My Shop" quick preset searches your home state plus adjacent states with one click. Carrier rows now show Signal and GOV badges for leads sourced from live news events or SAM.gov federal contracts, and expand to show the original article headline and link.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Quote Expiry Alerts',
    body: 'A new background worker fires daily and notifies you when a sent quote is within 3 days of its validity window expiring — prompting a follow-up call before the client has to ask for a reprice.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Loss Intelligence + AI Win-Back Emails',
    body: 'When marking a deal lost, a structured modal now captures the loss reason (price, competitor, timing, etc.) and competitor name. Analytics view shows a "Loss Intelligence" card with why-we-lose breakdown, competitor rankings, and one-click AI win-back email generation for recoverable losses.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Client Portal Design Sign-Off',
    body: 'The client portal now shows ALL design concepts you\'ve shared (not just the latest), with a proper "Approve Design" button that creates a formal sign-off record. Clients can also request revisions with notes. Both actions notify you instantly.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'AI URL Import',
    body: 'Paste any company website, LinkedIn page, or directory listing — AI extracts company name, contact info, fleet size, city/state, category, and generates a pitch angle. Review and edit before adding to your pipeline.',
  },
  {
    date: 'May 2026',
    tag: 'improved',
    title: 'Email Signature Auto-Enrichment',
    body: 'When a prospect replies to your outreach email, WrapOS automatically scans the email signature and backfills missing contact name, phone number, and title on the lead record — no manual copy-paste.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'AR Preview: variations, brand colors & fleet batch',
    body: 'Generate 3 wrap variations at once, match the client\'s exact brand colors, preview an entire fleet in one pass, push concepts straight to a client approval link, and save concepts to the job gallery — all from the AR Wrap Preview.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Pipeline Health Score',
    body: 'Analytics now shows a 0-100 composite score benchmarking your shop against wrap industry standards — win rate, days to close, email open rate, and monthly outreach volume.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Lead Tags + Tag Filter',
    body: 'Tag any lead with custom labels ("Hot Q4", "Budget confirmed", "Decision maker"). Tags appear as color-coded pills on lead cards and a chip bar lets you filter instantly.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Market Penetration Analysis',
    body: 'Analytics cross-references your pipeline with the FMCSA carrier database — see exactly how many untapped fleets exist in each state you\'re already working and launch a Discover search in one click.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Action Calendar in Pipeline',
    body: 'A 5-week Mo–Su calendar in Pipeline view shows follow-up due dates and bid deadlines as colored dots. Click any day to see the event detail and jump to the lead.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Quote Builder Templates',
    body: 'Six pre-loaded quote templates (Box Truck, Passenger Van, Semi Trailer, Fleet Package, Color Change, DI-NOC/Rea-Tec) auto-populate line items with industry-accurate pricing.',
  },
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
