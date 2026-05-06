import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAppStore } from '../store/useAppStore';
import Topbar from '../components/layout/Topbar';
import Sidebar from '../components/layout/Sidebar';
import TrialBanner from '../components/layout/TrialBanner';
import LeadList from '../components/leads/LeadList';
import LeadDetail from '../components/leads/detail/LeadDetail';
import DiscoverPage from '../components/discover/DiscoverPage';
import AddLeadModal from '../components/modals/AddLeadModal';
import SettingsModal from '../components/modals/SettingsModal';
import ApolloModal from '../components/modals/ApolloModal';
import PaywallModal from '../components/modals/PaywallModal';
import OnboardingModal from '../components/modals/OnboardingModal';
import BlueprintScanner from '../components/modals/BlueprintScanner';
import Toast from '../components/ui/Toast';

export default function CRMPage() {
  const { user, isLoading } = useAuth();
  const { mode, setPaywallOpen, blueprintOpen, setBlueprintOpen } = useAppStore((s) => ({
    mode: s.mode,
    setPaywallOpen: s.setPaywallOpen,
    blueprintOpen: s.blueprintOpen,
    setBlueprintOpen: s.setBlueprintOpen,
  }));
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!user) return;
    const blocked = user.subStatus === 'inactive' || user.subStatus === 'canceled';
    if (blocked) {
      setPaywallOpen(true);
      return;
    }
    if (user.isFirstLogin) {
      setShowOnboarding(true);
    }
  }, [user, setPaywallOpen]);

  if (isLoading) {
    return (
      <div className="loading" style={{ height: '100vh' }}>
        <span className="spinner spinner-lg" />
        <span>Loading...</span>
      </div>
    );
  }

  const isTrial =
    user?.subStatus === 'trialing' ||
    user?.subStatus === 'inactive' ||
    user?.subStatus === 'past_due';

  return (
    <div className="crm-layout">
      {isTrial && user && <TrialBanner user={user} />}
      <Topbar />
      <div className="crm-body">
        {mode === 'leads' && <Sidebar />}
        <main className="crm-main">
          {mode === 'leads' ? <LeadList /> : <DiscoverPage />}
        </main>
        {mode === 'leads' && <LeadDetail />}
      </div>

      {/* Modals */}
      <AddLeadModal />
      <SettingsModal />
      <ApolloModal />
      <PaywallModal />
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}
      {blueprintOpen && <BlueprintScanner onClose={() => setBlueprintOpen(false)} />}
      <Toast />
    </div>
  );
}
