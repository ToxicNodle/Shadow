import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useAuth } from '../../hooks/useAuth';

interface Props {
  onClose: () => void;
}

type Step = 1 | 2 | 3;

const TOUR = [
  {
    icon: '🎯',
    title: 'Mission Dashboard',
    body: 'Your daily action queue. Who to call, who to email, which bids are overdue. The AI Coach tells you the one move that matters most today.',
  },
  {
    icon: '🚛',
    title: 'Discover — 600K fleet database',
    body: 'Filter the FMCSA carrier registry by state, fleet size, and wrap-score. Bulk import the sweet spot (25–500 trucks) into your CRM.',
  },
  {
    icon: '✨',
    title: 'AI Email Sequences',
    body: 'Open a lead, click Activate Sequence — Claude writes a 3-step drip campaign, schedules sends, and tracks opens. You step in when they reply.',
  },
  {
    icon: '🏆',
    title: 'Bid Tracker + Jobs',
    body: 'Kanban for every active bid. After you win, jobs flow into the lifecycle tracker — photos, social posts, anniversary re-engagement. Nothing falls through.',
  },
] as const;

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
            <div className="onboarding-emoji">👋</div>
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
                <div className="onboarding-tier-name">🚛 Discover</div>
                <div className="onboarding-tier-desc">600K FMCSA carriers, searchable by state + fleet size</div>
              </div>
              <div className="onboarding-tier onboarding-tier-highlight">
                <div className="onboarding-tier-name">✨ AI Outreach</div>
                <div className="onboarding-tier-desc">3-step email sequences written and sent by Claude</div>
              </div>
              <div className="onboarding-tier">
                <div className="onboarding-tier-name">🏆 Full CRM</div>
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
            <div className="onboarding-emoji">🗺️</div>
            <h2 className="onboarding-h2">Four things that make money</h2>
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
            <div className="onboarding-emoji">⚙️</div>
            <h2 className="onboarding-h2">One quick setup before AI emails</h2>
            <p className="onboarding-sub">
              Add your sender name and email so AI-generated outreach goes out as you,
              not as the platform. One minute of setup, then you&apos;re running.
            </p>

            <div className="onboarding-setup-grid">
              <div className="onboarding-setup-item">
                <div className="onboarding-setup-icon">📧</div>
                <div className="onboarding-setup-text">
                  <strong>Sender details</strong>
                  <span>Your name, company, signature line</span>
                </div>
              </div>
              <div className="onboarding-setup-item">
                <div className="onboarding-setup-icon">🔑</div>
                <div className="onboarding-setup-text">
                  <strong>Apollo API key</strong>
                  <span>Optional — unlock contact enrichment</span>
                </div>
              </div>
              <div className="onboarding-setup-item">
                <div className="onboarding-setup-icon">🏢</div>
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
