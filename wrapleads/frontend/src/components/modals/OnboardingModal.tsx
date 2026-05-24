import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useAuth } from '../../hooks/useAuth';

interface Props {
  onClose: () => void;
}

type Step = 1 | 2 | 3;

const TOUR: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    title: 'Mission Dashboard',
    body: 'Your daily action queue. Who to call, who to email, which bids are overdue. The AI Coach tells you the one move that matters most today.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
    title: 'Discover — 600K fleet database',
    body: 'Filter the FMCSA carrier registry by state, fleet size, and wrap-score. Bulk import the sweet spot (25–500 trucks) into your CRM.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    title: 'AI Email Sequences',
    body: 'Open a lead, click Activate Sequence — Claude writes a 3-step drip campaign, schedules sends, and tracks opens. You step in when they reply.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
    title: 'Bid Tracker + Jobs',
    body: 'Kanban for every active bid. After you win, jobs flow into the lifecycle tracker — photos, social posts, anniversary re-engagement. Nothing falls through.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
    title: 'AR Preview + Vision Quote',
    body: 'Upload a photo of any vehicle — the AI overlays your wrap design in augmented reality. Vision Quote reads the truck and returns a price range in seconds. Close on-site, every time.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    title: 'Analytics & AI Pipeline Forecast',
    body: 'Win rate by category and state, revenue forecast, pipeline health score, and a plain-English AI narrative that tells you exactly where the money is this week.',
  },
];

export default function OnboardingModal({ onClose }: Props) {
  const { user } = useAuth();
  const { setSettingsOpen, setMode } = useAppStore((s) => ({
    setSettingsOpen: s.setSettingsOpen,
    setMode: s.setMode,
  }));
  const [step, setStep] = useState<Step>(1);

  function finishToSettings() {
    onClose();
    setSettingsOpen(true);
  }

  function finishToMission() {
    onClose();
    setMode('mission');
  }

  return (
    <div className="modal-backdrop">
      <div className="modal onboarding-modal">
        <div className="onboarding-progress">
          <div className={`onboarding-dot${step >= 1 ? ' active' : ''}`} />
          <div className={`onboarding-dot${step >= 2 ? ' active' : ''}`} />
          <div className={`onboarding-dot${step >= 3 ? ' active' : ''}`} />
        </div>

        {step === 1 && (
          <>
            <div className="onboarding-hero-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </div>
            <h2 className="onboarding-h2">
              Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.
            </h2>
            <p className="onboarding-sub">
              You have full access to <strong>every feature</strong> — no credit card, no limits.
              We&apos;ve pre-loaded <strong>500+ curated leads</strong> across fleets, design firms,
              construction, and racing so you start with a real pipeline, not an empty screen.
            </p>

            <div className="onboarding-tiers">
              <div className="onboarding-tier">
                <div className="onboarding-tier-name">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  Discover
                </div>
                <div className="onboarding-tier-desc">600K FMCSA carriers, searchable by state + fleet size</div>
              </div>
              <div className="onboarding-tier onboarding-tier-highlight">
                <div className="onboarding-tier-name">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  AI Outreach
                </div>
                <div className="onboarding-tier-desc">3-step email sequences written and sent by Claude</div>
              </div>
              <div className="onboarding-tier">
                <div className="onboarding-tier-name">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  Full CRM
                </div>
                <div className="onboarding-tier-desc">Pipeline, bids, jobs, analytics, and AR preview</div>
              </div>
            </div>

            <div className="onboarding-actions">
              <button className="btn btn-primary onboarding-cta" onClick={() => setStep(2)}>
                Show me how it works →
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="onboarding-hero-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </div>
            <h2 className="onboarding-h2">Six tools that close deals</h2>
            <p className="onboarding-sub">
              Every shop runs a different play. Here&apos;s where the platform pulls weight for you.
            </p>

            <div className="onboarding-tour">
              {TOUR.map((t) => (
                <div key={t.title} className="onboarding-tour-row">
                  <div className="onboarding-tour-icon">{t.icon}</div>
                  <div>
                    <div className="onboarding-tour-title">{t.title}</div>
                    <div className="onboarding-tour-body">{t.body}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="onboarding-actions">
              <button className="btn" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-primary onboarding-cta" onClick={() => setStep(3)}>
                Next: set up your sender →
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="onboarding-hero-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
            </div>
            <h2 className="onboarding-h2">One quick setup before AI emails</h2>
            <p className="onboarding-sub">
              Add your sender name and email so AI-generated outreach goes out as you,
              not as the platform. One minute of setup, then you&apos;re running.
            </p>

            <div className="onboarding-setup-grid">
              <div className="onboarding-setup-item">
                <div className="onboarding-setup-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </div>
                <div className="onboarding-setup-text">
                  <strong>Sender details</strong>
                  <span>Your name, company, signature line</span>
                </div>
              </div>
              <div className="onboarding-setup-item">
                <div className="onboarding-setup-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <div className="onboarding-setup-text">
                  <strong>Apollo API key</strong>
                  <span>Optional — unlock contact enrichment</span>
                </div>
              </div>
              <div className="onboarding-setup-item">
                <div className="onboarding-setup-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </div>
                <div className="onboarding-setup-text">
                  <strong>Company name</strong>
                  <span>Shows in analytics + email headers</span>
                </div>
              </div>
            </div>

            <div className="onboarding-actions">
              <button className="btn" onClick={finishToMission}>
                Skip for now
              </button>
              <button className="btn btn-primary onboarding-cta" onClick={finishToSettings}>
                Open Settings →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
