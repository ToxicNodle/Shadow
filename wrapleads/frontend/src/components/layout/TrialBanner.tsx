import type { User } from '../../api/types';
import { useAppStore } from '../../store/useAppStore';

interface Props {
  user: User;
}

export default function TrialBanner({ user }: Props) {
  function handleUpgrade() {
    // Open paywall modal so user can choose their tier
    useAppStore.getState().setPaywallOpen(true);
  }

  if (user.subStatus === 'past_due') {
    return (
      <div className="trial-banner" style={{ background: 'rgba(248,113,113,0.1)', borderBottomColor: 'rgba(248,113,113,0.3)' }}>
        <span>Payment failed — please update your billing to keep access.</span>
        <button onClick={handleUpgrade}>Update Billing</button>
      </div>
    );
  }

  const daysLeft = user.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div className="trial-banner">
      <span>
        Free trial — <strong>{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</strong>.
        Upgrade to unlock full access.
      </span>
      <button onClick={handleUpgrade}>Choose a plan — from $79/mo</button>
    </div>
  );
}
