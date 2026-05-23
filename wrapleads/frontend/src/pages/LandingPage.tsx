import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken, getToken } from '../api/client';

interface Tier {
  name: string;
  price: number;
  tagline: string;
  highlight?: boolean;
  features: readonly string[];
}

const TIERS: readonly Tier[] = [
  {
    name: 'WrapLeads',
    price: 79,
    tagline: 'Find them, track them, close them.',
    features: [
      'Full CRM with kanban + list pipeline',
      'FMCSA carrier discovery (600K+ fleets)',
      'Apollo contact enrichment',
      'Bid tracker + job lifecycle',
      'Win/loss analytics + competitor tracking',
      'Client portal & inbound quote widget',
    ],
  },
  {
    name: 'ShopFlow',
    price: 149,
    tagline: 'The business that runs while you wrap.',
    highlight: true,
    features: [
      'Everything in WrapLeads',
      'AI email sequences that auto-send',
      'Vapi AI phone calls (calls leads for you)',
      'Cold-nurture + re-order background workers',
      'Broadcast email to any lead segment',
      'AI Coach — next-step recommendations',
    ],
  },
  {
    name: 'WrapOS',
    price: 249,
    tagline: 'The full operating system for your shop.',
    features: [
      'Everything in ShopFlow',
      'AI Design Studio + DALL-E mockups',
      'AR wrap preview on real vehicle photos',
      'Vision Quote from any vehicle photo',
      'AI Proposal Generator with open tracking',
      'E Ink device management & scheduling',
    ],
  },
];

const FEATURE_HIGHLIGHTS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    title: 'Find every fleet in your zip code',
    body: '600K+ FMCSA carriers searchable by state, fleet size, and wrap-score. Filter to the sweet spot (25–500 trucks), bulk import, and start pitching the same day.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    title: 'AI that does the outreach for you',
    body: 'Claude writes the first email, schedules the follow-up sequence, and (if you want) Vapi calls the prospect on day 3. You step in when a real human responds.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
    title: 'Quote from a photo',
    body: 'Snap a picture of the truck. The vision model returns square footage, material recommendations, and a price range your customer can react to in seconds.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    title: 'Pipeline that actually closes',
    body: 'Bid tracker, proposal generator with open-tracking, win/loss capture, anniversary re-engagement, and AI-narrated forecasts. Nothing falls through.',
  },
];

const STEPS = [
  { num: 1, title: 'Sign up — 14 days free',  body: 'No credit card. We seed 500+ curated leads in your CRM the second you finish registration.' },
  { num: 2, title: 'Discover, enrich, send',  body: 'Filter FMCSA carriers, enrich contacts via Apollo, fire AI email sequences. The platform handles the cadence.' },
  { num: 3, title: 'Close more bids',         body: 'Track every bid, every quote, every install. Re-engage aging wraps automatically. Watch your win rate climb.' },
] as const;

export default function LandingPage() {
  const navigate = useNavigate();
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');

  // If already signed in, jump straight to the CRM.
  useEffect(() => {
    if (getToken()) navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => {
    api.demoAvailable()
      .then((r) => setDemoAvailable(r.available))
      .catch(() => setDemoAvailable(false));
  }, []);

  async function startDemo() {
    setDemoLoading(true);
    setDemoError('');
    try {
      const { token, user } = await api.demoLogin();
      setToken(token);
      navigate('/', { replace: true });
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : 'Demo unavailable');
      setDemoLoading(false);
    }
  }

  return (
    <div className="landing-root">
      <header className="landing-nav">
        <div className="landing-brand">
          <span className="landing-logo">W</span>
          <span className="landing-brand-name">WrapLeads<span className="landing-brand-io">.io</span></span>
        </div>
        <nav className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#how">How it works</a>
          <button className="landing-signin" onClick={() => navigate('/login')}>Sign in</button>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-eyebrow">For vehicle wrap & graphics shops</div>
          <h1 className="landing-headline">
            The operating system <br />
            for shops that <span className="landing-headline-accent">wrap.</span>
          </h1>
          <p className="landing-sub">
            Find every fleet in your market. Let AI handle the outreach.
            Quote from a photo. Track every bid until it closes.
            <strong> One platform — three tiers — starts at $79/mo.</strong>
          </p>

          <div className="landing-hero-ctas">
            <button className="btn-landing btn-landing-primary" onClick={() => navigate('/login?signup=1')}>
              Start 14-day free trial →
            </button>
            {demoAvailable && (
              <button
                className="btn-landing btn-landing-ghost"
                onClick={startDemo}
                disabled={demoLoading}
              >
                {demoLoading ? 'Loading demo…' : 'Try the live demo'}
              </button>
            )}
          </div>
          {demoError && <div className="landing-demo-error">{demoError}</div>}

          <div className="landing-hero-trust">
            <span>✓ No credit card</span>
            <span>✓ 500+ leads seeded on day one</span>
            <span>✓ Cancel anytime</span>
          </div>
        </div>

        <div className="landing-hero-art" aria-hidden="true">
          <div className="landing-art-card landing-art-card-1">
            <div className="landing-art-row"><span className="landing-art-dot landing-art-dot-green" /> 12 leads ready to call</div>
            <div className="landing-art-row"><span className="landing-art-dot landing-art-dot-accent" /> 47 AI emails sent today</div>
            <div className="landing-art-row"><span className="landing-art-dot landing-art-dot-yellow" /> 3 bids in shortlisted</div>
          </div>
          <div className="landing-art-card landing-art-card-2">
            <div className="landing-art-amount">$184,500</div>
            <div className="landing-art-label">Forecast (next 30 days)</div>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section landing-features">
        <h2 className="landing-h2">Everything a shop needs to print money</h2>
        <p className="landing-section-sub">From first lead to fifth re-wrap, the platform handles the busywork.</p>
        <div className="landing-feature-grid">
          {FEATURE_HIGHLIGHTS.map((f) => (
            <div key={f.title} className="landing-feature">
              <div className="landing-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="landing-section landing-how">
        <h2 className="landing-h2">From registration to first won bid</h2>
        <div className="landing-steps">
          {STEPS.map((s) => (
            <div key={s.num} className="landing-step">
              <div className="landing-step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="landing-section landing-pricing">
        <h2 className="landing-h2">Three tiers. Built to grow with your shop.</h2>
        <p className="landing-section-sub">Start on the tier you need. Upgrade the day you outgrow it.</p>
        <div className="landing-tiers">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`landing-tier${t.highlight ? ' landing-tier-highlight' : ''}`}
            >
              {t.highlight && <div className="landing-tier-badge">Most Popular</div>}
              <div className="landing-tier-name">{t.name}</div>
              <div className="landing-tier-price">
                <span className="landing-tier-dollar">$</span>
                <span className="landing-tier-amount">{t.price}</span>
                <span className="landing-tier-per">/mo</span>
              </div>
              <p className="landing-tier-tagline">{t.tagline}</p>
              <ul className="landing-tier-features">
                {t.features.map((f) => (<li key={f}>{f}</li>))}
              </ul>
              <button
                className={`btn-landing ${t.highlight ? 'btn-landing-primary' : 'btn-landing-outline'}`}
                onClick={() => navigate('/login?signup=1')}
              >
                Start free trial
              </button>
            </div>
          ))}
        </div>
        <p className="landing-trial-note">
          Every trial starts with full WrapOS access for 14 days. Pick the tier you want to keep before it ends.
        </p>
      </section>

      <section className="landing-section landing-cta-final">
        <h2 className="landing-h2">Stop chasing leads. Start closing wraps.</h2>
        <p className="landing-section-sub">
          The leads are already in the database. The AI is already written.
          The only thing missing is your shop.
        </p>
        <div className="landing-hero-ctas">
          <button className="btn-landing btn-landing-primary" onClick={() => navigate('/login?signup=1')}>
            Start 14-day free trial →
          </button>
          {demoAvailable && (
            <button className="btn-landing btn-landing-ghost" onClick={startDemo} disabled={demoLoading}>
              {demoLoading ? 'Loading demo…' : 'Try the live demo'}
            </button>
          )}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <span className="landing-logo">W</span>
          <span className="landing-brand-name">WrapLeads<span className="landing-brand-io">.io</span></span>
        </div>
        <div className="landing-footer-links">
          <button onClick={() => navigate('/login')}>Sign in</button>
          <button onClick={() => navigate('/login?signup=1')}>Start free trial</button>
        </div>
        <div className="landing-footer-copy">
          © {new Date().getFullYear()} WrapLeads. Built for shops that wrap.
        </div>
      </footer>
    </div>
  );
}
