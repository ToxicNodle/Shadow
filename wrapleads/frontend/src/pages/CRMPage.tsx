import { useEffect, useState, lazy, Suspense } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api/client';
import Topbar from '../components/layout/Topbar';
import NavRail from '../components/layout/NavRail';
import Sidebar from '../components/layout/Sidebar';
import TrialBanner from '../components/layout/TrialBanner';
import LivePulse from '../components/layout/LivePulse';
import PipelineStats from '../components/layout/PipelineStats';
import LeadList from '../components/leads/LeadList';
import KanbanBoard from '../components/leads/KanbanBoard';
import LeadDetail from '../components/leads/detail/LeadDetail';
import AddLeadModal from '../components/modals/AddLeadModal';
import SettingsModal from '../components/modals/SettingsModal';
import ApolloModal from '../components/modals/ApolloModal';
import PaywallModal from '../components/modals/PaywallModal';
import PasteImportModal from '../components/modals/PasteImportModal';
import Toast from '../components/ui/Toast';
import { useGlobalDraggableModals } from '../hooks/useGlobalDraggableModals';
import { useLeads } from '../hooks/useLeads';

// ── Lazy-loaded views — only bundle-split from the initial chunk ──────────────
// Each view is 400–3000 lines; lazy-loading them saves ~900 KB on first load.
const MissionView         = lazy(() => import('../components/mission/MissionView'));
const DiscoverPage        = lazy(() => import('../components/discover/DiscoverPage'));
const PipelineView        = lazy(() => import('../components/pipeline/PipelineView'));
const BidsView            = lazy(() => import('../components/bids/BidsView'));
const JobsView            = lazy(() => import('../components/jobs/JobsView'));
const ContentView         = lazy(() => import('../components/content/ContentView'));
const AnalyticsView       = lazy(() => import('../components/analytics/AnalyticsView'));
const GovOpportunitiesView = lazy(() => import('../components/gov/GovOpportunitiesView'));

// ── Lazy-loaded modals & overlays ────────────────────────────────────────────
const OnboardingModal  = lazy(() => import('../components/modals/OnboardingModal'));
const BlueprintScanner = lazy(() => import('../components/modals/BlueprintScanner'));
const BulkOutreachModal = lazy(() => import('../components/modals/BulkOutreachModal'));
const CSVImportModal   = lazy(() => import('../components/modals/CSVImportModal'));
const ShopVoxImportModal = lazy(() => import('../components/modals/ShopVoxImportModal'));
const ProposalModal    = lazy(() => import('../components/modals/ProposalModal'));
const VisionQuoteModal = lazy(() => import('../components/modals/VisionQuoteModal'));
const ARPreviewModal   = lazy(() => import('../components/modals/ARPreviewModal'));
const PitchModeModal   = lazy(() => import('../components/modals/PitchModeModal'));
const CardScanModal    = lazy(() => import('../components/modals/CardScanModal'));
const TruckScanModal   = lazy(() => import('../components/modals/TruckScanModal'));
const QuickQuoteModal  = lazy(() => import('../components/modals/QuickQuoteModal'));
const NotificationPanel = lazy(() => import('../components/layout/NotificationPanel'));
const ChangelogPanel   = lazy(() => import('../components/layout/ChangelogPanel'));
const AICoachDrawer    = lazy(() => import('../components/layout/AICoachDrawer'));
const AICoachFABLazy   = lazy(() => import('../components/layout/AICoachDrawer').then((m) => ({ default: m.AICoachFAB })));
const CommandPalette   = lazy(() => import('../components/ui/CommandPalette'));
const ShortcutsModal   = lazy(() => import('../components/ui/ShortcutsModal'));

// Minimal spinner shown while a lazy chunk loads — keeps layout stable.
function ViewSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200, color: 'var(--text-faint)', fontSize: 13, gap: 10 }}>
      <span className="spinner" />
    </div>
  );
}

export default function CRMPage() {
  useGlobalDraggableModals();
  const { user, isLoading } = useAuth();
  const {
    mode, setMode, setPaywallOpen,
    blueprintOpen, setBlueprintOpen,
    bulkOutreachOpen, csvImportOpen, shopvoxImportOpen, proposalOpen,
    leadView,
    commandPaletteOpen, setCommandPaletteOpen,
    visionOpen, setVisionOpen,
    arOpen, setArOpen,
    pitchOpen, setPitchOpen,
    cardScanOpen, setCardScanOpen,
    truckScanOpen, setTruckScanOpen,
    quickQuoteOpen, setQuickQuoteOpen,
    notifOpen, setNotifOpen,
    changelogOpen, setChangelogOpen,
    aiCoachOpen, setAiCoachOpen,
    currentLeadId,
  } = useAppStore((s) => ({
    mode: s.mode,
    setMode: s.setMode,
    setPaywallOpen: s.setPaywallOpen,
    blueprintOpen: s.blueprintOpen,
    setBlueprintOpen: s.setBlueprintOpen,
    bulkOutreachOpen: s.bulkOutreachOpen,
    csvImportOpen: s.csvImportOpen,
    shopvoxImportOpen: s.shopvoxImportOpen,
    proposalOpen: s.proposalOpen,
    leadView: s.leadView,
    commandPaletteOpen: s.commandPaletteOpen,
    setCommandPaletteOpen: s.setCommandPaletteOpen,
    visionOpen: s.visionOpen,
    setVisionOpen: s.setVisionOpen,
    arOpen: s.arOpen,
    setArOpen: s.setArOpen,
    pitchOpen: s.pitchOpen,
    setPitchOpen: s.setPitchOpen,
    cardScanOpen: s.cardScanOpen,
    setCardScanOpen: s.setCardScanOpen,
    truckScanOpen: s.truckScanOpen,
    setTruckScanOpen: s.setTruckScanOpen,
    quickQuoteOpen: s.quickQuoteOpen,
    setQuickQuoteOpen: s.setQuickQuoteOpen,
    notifOpen: s.notifOpen,
    setNotifOpen: s.setNotifOpen,
    changelogOpen: s.changelogOpen,
    setChangelogOpen: s.setChangelogOpen,
    aiCoachOpen: s.aiCoachOpen,
    setAiCoachOpen: s.setAiCoachOpen,
    currentLeadId: s.currentLeadId,
  }));

  const { leads } = useLeads();
  const arLead = currentLeadId
    ? leads.find((l) => String(l.id) === String(currentLeadId) || String(l.serverId) === String(currentLeadId))
    : undefined;
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

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
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const MODE_KEYS: Record<string, typeof mode> = {
    '1': 'mission', '2': 'leads', '3': 'discover',
    '4': 'pipeline', '5': 'bids', '6': 'jobs',
    '7': 'content', '8': 'analytics',
  };

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      // digit + ? shortcuts (no modifier, not in an input/textarea/select)
      const tag = (e.target as HTMLElement).tagName;
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey &&
          tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        if (e.key === '?') { e.preventDefault(); setShowShortcuts((v) => !v); return; }
        const dest = MODE_KEYS[e.key];
        if (dest) { e.preventDefault(); setMode(dest); }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load server-persisted settings on first mount
  const updateSettings = useAppStore((s) => s.updateSettings);
  useEffect(() => {
    api.getSettings().then(({ settings }) => {
      if (Object.keys(settings).length > 0) updateSettings(settings);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply user's brand accent color to the app CSS variables
  const accentColor = useAppStore((s) => s.settings.accentColor);
  useEffect(() => {
    if (!accentColor || !/^#[0-9a-f]{6}$/i.test(accentColor)) return;
    const r = parseInt(accentColor.slice(1, 3), 16);
    const g = parseInt(accentColor.slice(3, 5), 16);
    const b = parseInt(accentColor.slice(5, 7), 16);
    const dim = `#${Math.round(r * 0.8).toString(16).padStart(2, '0')}${Math.round(g * 0.8).toString(16).padStart(2, '0')}${Math.round(b * 0.8).toString(16).padStart(2, '0')}`;
    const root = document.documentElement;
    root.style.setProperty('--accent', accentColor);
    root.style.setProperty('--accent-dim', dim);
    root.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.22)`);
    root.style.setProperty('--accent-subtle', `rgba(${r},${g},${b},0.08)`);
  }, [accentColor]);

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
    user?.subStatus === 'past_due';

  return (
    <div className="crm-layout">
      {isTrial && user && <TrialBanner user={user} />}
      <Topbar />
      {mode === 'leads' && <PipelineStats />}
      <div className="crm-body">
        <NavRail />
        {mode === 'leads' && leadView === 'list' && <Sidebar />}
        <main key={`${mode}-${leadView}`} className={`crm-main${mode === 'leads' && leadView === 'kanban' ? ' kanban-main' : ''}${mode === 'pipeline' ? ' pipeline-main' : ''}${mode === 'bids' ? ' bids-main' : ''}${mode === 'mission' ? ' mission-main' : ''}${mode === 'jobs' ? ' jobs-main' : ''}${mode === 'content' ? ' content-main' : ''}${mode === 'analytics' ? ' analytics-main' : ''}`}>
          <Suspense fallback={<ViewSpinner />}>
            {mode === 'leads'
              ? (leadView === 'kanban' ? <KanbanBoard /> : <LeadList />)
              : mode === 'pipeline'
              ? <PipelineView />
              : mode === 'bids'
              ? <BidsView />
              : mode === 'mission'
              ? <MissionView />
              : mode === 'jobs'
              ? <JobsView />
              : mode === 'content'
              ? <ContentView />
              : mode === 'analytics'
              ? <AnalyticsView />
              : mode === 'gov'
              ? <GovOpportunitiesView />
              : <DiscoverPage />}
          </Suspense>
        </main>
        {mode === 'leads' && <LeadDetail />}
      </div>

      {/* Always-eager modals (auth flow / global) */}
      <AddLeadModal />
      <SettingsModal />
      <ApolloModal />
      <PaywallModal />
      <PasteImportModal />
      <Toast />
      <LivePulse />

      {/* Lazy modals — each wrapped in its own Suspense so they don't block each other */}
      <Suspense fallback={null}>
        {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}
        {blueprintOpen && <BlueprintScanner onClose={() => setBlueprintOpen(false)} />}
        {bulkOutreachOpen && <BulkOutreachModal />}
        {csvImportOpen && <CSVImportModal />}
        {shopvoxImportOpen && <ShopVoxImportModal />}
        {proposalOpen && <ProposalModal />}
        {visionOpen && <VisionQuoteModal onClose={() => setVisionOpen(false)} />}
        {arOpen && <ARPreviewModal onClose={() => setArOpen(false)} lead={arLead} />}
        {pitchOpen && <PitchModeModal onClose={() => setPitchOpen(false)} />}
        {cardScanOpen && <CardScanModal onClose={() => setCardScanOpen(false)} />}
        {truckScanOpen && <TruckScanModal onClose={() => setTruckScanOpen(false)} />}
        {quickQuoteOpen && <QuickQuoteModal onClose={() => setQuickQuoteOpen(false)} />}
        {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
        {changelogOpen && <ChangelogPanel onClose={() => setChangelogOpen(false)} />}
        {aiCoachOpen && <AICoachDrawer onClose={() => setAiCoachOpen(false)} />}
        {commandPaletteOpen && <CommandPalette onClose={() => setCommandPaletteOpen(false)} />}
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
        <AICoachFABLazy />
      </Suspense>
    </div>
  );
}
