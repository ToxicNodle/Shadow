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
  roi: { multiplier: string; scenario: string };
  accent: string;
  highlight?: boolean;
  features: string[];
}> = [
  {
    tier: 'wrapleads',
    name: 'WrapLeads',
    price: 79,
    tagline: 'Find them, track them, close them.',
    roi: { multiplier: '4.7×', scenario: '1 extra fleet wrap/yr' },
    accent: '#6366f1',
    features: [
      'Full CRM pipeline — kanban + list view',
      'FMCSA carrier discovery — 600K+ fleets',
      'Apollo contact enrichment',
      'Bid tracker & job lifecycle tracker',
      'Analytics, win/loss & competitor reporting',
      'Client portal & inbound quote widget',
    ],
  },
  {
    tier: 'shopflow',
    name: 'ShopFlow',
    price: 149,
    tagline: 'The business that runs while you wrap.',
    roi: { multiplier: '10×', scenario: '1 extra GC referral/yr' },
    accent: '#10b981',
    highlight: true,
    features: [
      'Everything in WrapLeads, plus:',
      'AI email sequences — auto-sends on schedule',
      'Vapi AI phone calls — calls leads for you',
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
    roi: { multiplier: '13×', scenario: '1 extra motorsport project/yr' },
    accent: '#f59e0b',
    features: [
      'Everything in ShopFlow, plus:',
      'AI Design Studio + DALL-E mockups',
      'AR wrap preview on real vehicle photos',
      'Vision Quote from any vehicle photo',
      'AI Proposal Generator with open tracking',
      'E Ink device management & scheduling',
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
  const [hovered, setHovered] = useState<PlanTier | null>(null);

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
      <div className="paywall-card paywall-card--wide" style={{ maxWidth: 920 }}>

        {/* ── Header ── */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800 }}>
            Choose your plan
          </h2>
          <p className="pw-sub" style={{ margin: 0 }}>
            Your trial has ended. Pick the tier that fits your shop.
          </p>
          <div style={{
            display: 'flex', gap: 20, justifyContent: 'center', marginTop: 12,
            fontSize: 11, color: 'var(--text-muted)',
          }}>
            {['14-day free trial on all plans', 'No contracts', 'Cancel anytime', 'SSL-secured checkout'].map((t) => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* ── Plan Cards ── */}
        <div className="paywall-tiers">
          {PLANS.map((plan) => {
            const annualCost = plan.price * 12;
            const isActive = hovered === plan.tier || plan.highlight;
            const borderColor = plan.highlight ? plan.accent : (hovered === plan.tier ? `${plan.accent}60` : 'var(--border)');
            return (
              <div
                key={plan.tier}
                className={`paywall-tier${plan.highlight ? ' paywall-tier--highlight' : ''}`}
                onMouseEnter={() => setHovered(plan.tier)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  border: `1.5px solid ${borderColor}`,
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxShadow: plan.highlight
                    ? `0 0 0 1px ${plan.accent}40, 0 8px 32px ${plan.accent}20`
                    : isActive ? `0 4px 16px ${plan.accent}18` : undefined,
                  position: 'relative',
                }}
              >
                {plan.highlight && (
                  <div className="paywall-badge" style={{ background: plan.accent, color: '#fff' }}>
                    Most Popular
                  </div>
                )}

                {/* Plan name + tagline */}
                <div className="paywall-tier-name" style={{ color: plan.accent }}>{plan.name}</div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 14px', lineHeight: 1.4 }}>
                  {plan.tagline}
                </p>

                {/* Price */}
                <div className="paywall-tier-price" style={{ marginBottom: 6 }}>
                  <span className="pw-dollar">$</span>
                  <span className="pw-amount">{plan.price}</span>
                  <span className="pw-per">/mo</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 10 }}>
                  ${annualCost.toLocaleString()}/yr billed monthly
                </div>

                {/* ROI callout */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: `${plan.accent}12`, border: `1px solid ${plan.accent}30`,
                  borderRadius: 6, padding: '5px 10px', marginBottom: 14,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: plan.accent, fontVariantNumeric: 'tabular-nums' }}>
                    {plan.roi.multiplier}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                    ROI with {plan.roi.scenario}
                  </span>
                </div>

                {/* Feature list */}
                <ul className="paywall-tier-features" style={{ marginBottom: 18 }}>
                  {plan.features.map((f, i) => (
                    <li key={f} style={i === 0 && f.startsWith('Everything') ? { fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, listStyle: 'none', marginLeft: -4, marginBottom: 4 } : {}}>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  className={`paywall-btn${plan.highlight ? '' : ' paywall-btn--secondary'}`}
                  onClick={() => handleUpgrade(plan.tier)}
                  disabled={loading !== null}
                  style={plan.highlight
                    ? { background: plan.accent, borderColor: plan.accent }
                    : { borderColor: `${plan.accent}60`, color: plan.accent }}
                >
                  {loading === plan.tier ? (
                    <>
                      <span style={{
                        display: 'inline-block', width: 11, height: 11, borderRadius: '50%',
                        border: '2px solid currentColor', borderTopColor: 'transparent',
                        animation: 'spin 0.7s linear infinite', marginRight: 6,
                      }} />
                      Redirecting…
                    </>
                  ) : (
                    `Get ${plan.name} →`
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Value context strip ── */}
        <div style={{
          marginTop: 20, padding: '12px 16px',
          background: 'rgba(99,102,241,0.06)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.15)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="3" />
          </svg>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
            <strong style={{ color: 'var(--text)' }}>Industry context:</strong>{' '}
            Average fleet wrap: $4,500 · GC referral: $18,000 · Motorsport project: $40,000.
            Most shops close 1–2 extra deals per month after adopting WrapLeads — that's a{' '}
            <strong style={{ color: '#22c55e' }}>positive ROI from month one.</strong>
          </span>
        </div>

        <button className="paywall-logout" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
