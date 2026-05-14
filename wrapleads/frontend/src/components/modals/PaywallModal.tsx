import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import type { PlanTier } from '../../api/types';

const PLANS: Array<{
  tier: PlanTier;
  name: string;
  price: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
}> = [
  {
    tier: 'wrapleads',
    name: 'WrapLeads',
    price: 79,
    tagline: 'Find them, track them, close them.',
    features: [
      'Full CRM pipeline (kanban + list)',
      'FMCSA carrier discovery (600K+ fleets)',
      'Apollo contact enrichment',
      'Bid tracker & job lifecycle tracker',
      'Analytics & win/loss reporting',
      'Client portal & inbound quote widget',
    ],
  },
  {
    tier: 'shopflow',
    name: 'ShopFlow',
    price: 149,
    tagline: 'The business that runs while you wrap.',
    highlight: true,
    features: [
      'Everything in WrapLeads',
      'AI email sequences (auto-sends on schedule)',
      'Vapi AI phone calls (calls leads for you)',
      'Cold nurture & re-order background workers',
      'Broadcast email to any lead segment',
      'AI Coach — next-step recommendations',
    ],
  },
  {
    tier: 'wrapos',
    name: 'WrapOS',
    price: 249,
    tagline: 'The full operating system for your shop.',
    features: [
      'Everything in ShopFlow',
      'AI Design Studio + DALL-E mockups',
      'AR wrap preview on real vehicle photos',
      'Vision Quote from any vehicle photo',
      'AI Proposal Generator with open tracking',
      'E Ink device management & content scheduling',
    ],
  },
];

export default function PaywallModal() {
  const { paywallOpen, showToast } = useAppStore((s) => ({
    paywallOpen: s.paywallOpen,
    showToast: s.showToast,
  }));
  const { logout } = useAuth();
  const [loading, setLoading] = useState<PlanTier | null>(null);

  if (!paywallOpen) return null;

  async function handleUpgrade(tier: PlanTier) {
    setLoading(tier);
    try {
      const { url } = await api.checkout(tier);
      window.location.href = url;
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
      setLoading(null);
    }
  }

  return (
    <div className="paywall-overlay">
      <div className="paywall-card paywall-card--wide">
        <h2>Choose your plan</h2>
        <p className="pw-sub">Your trial has ended. Pick the tier that fits your shop.</p>

        <div className="paywall-tiers">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`paywall-tier${plan.highlight ? ' paywall-tier--highlight' : ''}`}
            >
              {plan.highlight && <div className="paywall-badge">Most Popular</div>}
              <div className="paywall-tier-name">{plan.name}</div>
              <div className="paywall-tier-price">
                <span className="pw-dollar">$</span>
                <span className="pw-amount">{plan.price}</span>
                <span className="pw-per">/mo</span>
              </div>
              <p className="paywall-tier-tagline">{plan.tagline}</p>
              <ul className="paywall-tier-features">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button
                className={`paywall-btn${plan.highlight ? '' : ' paywall-btn--secondary'}`}
                onClick={() => handleUpgrade(plan.tier)}
                disabled={loading !== null}
              >
                {loading === plan.tier ? 'Redirecting…' : `Get ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        <button className="paywall-logout" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
