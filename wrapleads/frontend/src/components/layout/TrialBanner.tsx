import type { User } from '../../api/types';
import { useAppStore } from '../../store/useAppStore';

interface Props {
  user: User;
}

export default function TrialBanner({ user }: Props) {
  function handleUpgrade() {
    useAppStore.getState().setPaywallOpen(true);
  }

  if (user.subStatus === 'past_due') {
    return (
      <div className="trial-banner" style={{ background: 'rgba(248,113,113,0.1)', borderBottomColor: 'rgba(248,113,113,0.3)' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="3"/>
        </svg>
        <span>Payment failed — please update your billing to keep access.</span>
        <button onClick={handleUpgrade} style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' }}>
          Update Billing
        </button>
      </div>
    );
  }

  const daysLeft = user.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / 86400000))
    : 0;

  const isUrgent = daysLeft <= 3;
  const isCritical = daysLeft <= 1;

  const urgentStyle = isCritical
    ? { background: 'rgba(239,68,68,0.1)', borderBottomColor: 'rgba(239,68,68,0.3)' }
    : isUrgent
    ? { background: 'rgba(245,158,11,0.1)', borderBottomColor: 'rgba(245,158,11,0.3)' }
    : {};

  const dotColor = isCritical ? '#ef4444' : isUrgent ? '#f59e0b' : 'var(--accent)';

  const ctaText = isCritical
    ? `Last chance — upgrade now`
    : isUrgent
    ? `${daysLeft} days left — choose a plan`
    : `Choose a plan — from $79/mo`;

  return (
    <div className="trial-banner" style={urgentStyle}>
      {/* Pulsing dot for urgency */}
      <span style={{
        display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
        background: dotColor, flexShrink: 0,
        boxShadow: isUrgent ? `0 0 0 2px ${dotColor}40` : undefined,
        animation: isCritical ? 'pulse-dot 1.2s ease-in-out infinite' : undefined,
      }} />
      <span>
        Free trial —{' '}
        <strong style={{ color: dotColor }}>
          {daysLeft === 0 ? 'expires today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
        </strong>
        {!isUrgent && '. Full WrapOS access during trial.'}
        {isUrgent && !isCritical && '. Don\'t lose your data and pipeline.'}
        {isCritical && '. Your pipeline and AI tools will be paused.'}
      </span>
      <button onClick={handleUpgrade} style={isCritical ? { background: 'rgba(239,68,68,0.15)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' } : isUrgent ? { color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' } : {}}>
        {ctaText}
      </button>
    </div>
  );
}
