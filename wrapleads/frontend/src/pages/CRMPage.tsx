import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api/client';
import Topbar from '../components/layout/Topbar';
import NavRail from '../components/layout/NavRail';
import Sidebar from '../components/layout/Sidebar';
import TrialBanner from '../components/layout/TrialBanner';
import PipelineStats from '../components/layout/PipelineStats';
import LeadList from '../components/leads/LeadList';
import KanbanBoard from '../components/leads/KanbanBoard';
import LeadDetail from '../components/leads/detail/LeadDetail';
import DiscoverPage from '../components/discover/DiscoverPage';
import CommandPalette from '../components/ui/CommandPalette';
import ShortcutsModal from '../components/ui/ShortcutsModal';
import PasteImportModal from '../components/modals/PasteImportModal';
import AddLeadModal from '../components/modals/AddLeadModal';
import SettingsModal from '../components/modals/SettingsModal';
import ApolloModal from '../components/modals/ApolloModal';
import PaywallModal from '../components/modals/PaywallModal';
import OnboardingModal from '../components/modals/OnboardingModal';
import BlueprintScanner from '../components/modals/BlueprintScanner';
import BulkOutreachModal from '../components/modals/BulkOutreachModal';
import PipelineView from '../components/pipeline/PipelineView';
import BidsView from '../components/bids/BidsView';
import MissionView from '../components/mission/MissionView';
import JobsView from '../components/jobs/JobsView';
import ContentView from '../components/content/ContentView';
import AnalyticsView from '../components/analytics/AnalyticsView';
import ErrorBoundary from '../components/ui/ErrorBoundary';
// HelioScout view is large (charts, maps, monte carlo viz). Lazy-load it so
// it doesn't bloat the initial CRMPage bundle for users who never open the
// solar tab.
const SolarScoutView = lazy(() => import('../components/solar/SolarScoutView'));
import CSVImportModal from '../components/modals/CSVImportModal';
import ProposalModal from '../components/modals/ProposalModal';
import Toast from '../components/ui/Toast';

export default function CRMPage() {
  const { user, isLoading } = useAuth();
  const {
    mode, setMode, setPaywallOpen,
    blueprintOpen, setBlueprintOpen,
    bulkOutreachOpen, csvImportOpen, proposalOpen,
    leadView,
    commandPaletteOpen, setCommandPaletteOpen,
  } = useAppStore((s) => ({
    mode: s.mode,
    setMode: s.setMode,
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
    '7': 'content', '8': 'analytics', '9': 'solar_scout',
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
        <main key={`${mode}-${leadView}`} className={`crm-main${mode === 'leads' && leadView === 'kanban' ? ' kanban-main' : ''}${mode === 'pipeline' ? ' pipeline-main' : ''}${mode === 'bids' ? ' bids-main' : ''}${mode === 'mission' ? ' mission-main' : ''}${mode === 'jobs' ? ' jobs-main' : ''}${mode === 'content' ? ' content-main' : ''}${mode === 'analytics' ? ' analytics-main' : ''}${mode === 'solar_scout' ? ' solar-scout-main' : ''}`}>
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
            : mode === 'solar_scout'
            ? (
              <ErrorBoundary>
                <Suspense fallback={
                  <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    Loading HelioScout intelligence layer…
                  </div>
                }>
                  <SolarScoutView />
                </Suspense>
              </ErrorBoundary>
            )
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
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      <PasteImportModal />
      <Toast />
    </div>
  );
}
