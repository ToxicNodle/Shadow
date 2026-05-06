import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api/client';
import Topbar from '../components/layout/Topbar';
import Sidebar from '../components/layout/Sidebar';
import TrialBanner from '../components/layout/TrialBanner';
import PipelineStats from '../components/layout/PipelineStats';
import LeadList from '../components/leads/LeadList';
import KanbanBoard from '../components/leads/KanbanBoard';
import LeadDetail from '../components/leads/detail/LeadDetail';
import DiscoverPage from '../components/discover/DiscoverPage';
import CommandPalette from '../components/ui/CommandPalette';
import PasteImportModal from '../components/modals/PasteImportModal';
import AddLeadModal from '../components/modals/AddLeadModal';
import SettingsModal from '../components/modals/SettingsModal';
import ApolloModal from '../components/modals/ApolloModal';
import PaywallModal from '../components/modals/PaywallModal';
import OnboardingModal from '../components/modals/OnboardingModal';
import BlueprintScanner from '../components/modals/BlueprintScanner';
import BulkOutreachModal from '../components/modals/BulkOutreachModal';
import CSVImportModal from '../components/modals/CSVImportModal';
import ProposalModal from '../components/modals/ProposalModal';
import Toast from '../components/ui/Toast';

export default function CRMPage() {
  const { user, isLoading } = useAuth();
  const {
    mode, setPaywallOpen,
    blueprintOpen, setBlueprintOpen,
    bulkOutreachOpen, csvImportOpen, proposalOpen,
    leadView,
    commandPaletteOpen, setCommandPaletteOpen,
  } = useAppStore((s) => ({
    mode: s.mode,
    setPaywallOpen: s.setPaywallOpen,
    blueprintOpen: s.blueprintOpen,
    setBlueprintOpen: s.setBlueprintOpen,
    bulkOutreachOpen: s.bulkOutreachOpen,
    csvImportOpen: s.csvImportOpen,
    proposalOpen: s.proposalOpen,
    leadView: s.leadView,
    commandPaletteOpen: s.commandPaletteOpen,
    setCommandPaletteOpen: s.setCommandPaletteOpen,
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

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setCommandPaletteOpen]);

  // Load server-persisted settings on first mount
  const updateSettings = useAppStore((s) => s.updateSettings);
  useEffect(() => {
    api.getSettings().then(({ settings }) => {
      if (Object.keys(settings).length > 0) updateSettings(settings);
    }).catch(() => {});
  }, [updateSettings]);

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
      {mode === 'leads' && <PipelineStats />}
      <div className="crm-body">
        {mode === 'leads' && leadView === 'list' && <Sidebar />}
        <main className={`crm-main${mode === 'leads' && leadView === 'kanban' ? ' kanban-main' : ''}`}>
          {mode === 'leads'
            ? (leadView === 'kanban' ? <KanbanBoard /> : <LeadList />)
            : <DiscoverPage />}
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
      {bulkOutreachOpen && <BulkOutreachModal />}
      {csvImportOpen && <CSVImportModal />}
      {proposalOpen && <ProposalModal />}
      {commandPaletteOpen && <CommandPalette onClose={() => setCommandPaletteOpen(false)} />}
      <PasteImportModal />
      <Toast />
    </div>
  );
}
