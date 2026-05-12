import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../store/useAppStore';
import type { AppMode } from '../../store/useAppStore';
import VisionQuoteModal from '../modals/VisionQuoteModal';
import ARPreviewModal from '../modals/ARPreviewModal';
import CardScanModal from '../modals/CardScanModal';
import NotificationPanel from './NotificationPanel';

export default function Topbar() {
  const { user, logout } = useAuth();
  const [visionOpen, setVisionOpen] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const [cardScanOpen, setCardScanOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => import('../../api/client').then((m) => m.api.getNotifications()),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const unreadCount = notifData?.unread ?? 0;
  const {
    mode, setMode,
    leadView, setLeadView,
    setCommandPaletteOpen,
    setAddLeadOpen, setSettingsOpen, setBlueprintOpen,
  } = useAppStore((s) => ({
    mode: s.mode,
    setMode: s.setMode,
    leadView: s.leadView,
    setLeadView: s.setLeadView,
    setCommandPaletteOpen: s.setCommandPaletteOpen,
    setAddLeadOpen: s.setAddLeadOpen,
    setSettingsOpen: s.setSettingsOpen,
    setBlueprintOpen: s.setBlueprintOpen,
  }));

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">W</div>
        <span className="topbar-name">WrapLeads<span>.io</span></span>
      </div>

      <div className="topbar-mode-switch">
        {(['mission', 'leads', 'discover', 'pipeline', 'bids', 'jobs', 'content', 'analytics'] as AppMode[]).map((m) => (
          <button
            key={m}
            className={`mode-btn ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'mission' ? "Today's Mission"
              : m === 'leads' ? 'My Leads'
              : m === 'discover' ? 'Discover'
              : m === 'pipeline' ? 'Pipeline'
              : m === 'bids' ? 'Bid Tracker'
              : m === 'jobs' ? 'Wrap Lifecycle'
              : m === 'content' ? 'Content'
              : '📊 Analytics'}
          </button>
        ))}
      </div>

      <div className="topbar-spacer" />

      {mode === 'leads' && (
        <div className="view-toggle" title="Switch between list and kanban view">
          <button
            className={`view-btn${leadView === 'list' ? ' active' : ''}`}
            onClick={() => setLeadView('list')}
            title="List view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
          <button
            className={`view-btn${leadView === 'kanban' ? ' active' : ''}`}
            onClick={() => setLeadView('kanban')}
            title="Pipeline kanban"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="5" height="18" rx="1" />
              <rect x="10" y="3" width="5" height="13" rx="1" />
              <rect x="17" y="3" width="5" height="8" rx="1" />
            </svg>
          </button>
        </div>
      )}

      <button
        className="cmd-k-btn"
        onClick={() => setCommandPaletteOpen(true)}
        title="Command palette (⌘K)"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="topbar-actions">
        <button className="btn" onClick={() => setArOpen(true)} title="AR Wrap Preview — apply a wrap design to any vehicle photo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          AR Preview
        </button>
        <button className="btn" onClick={() => setCardScanOpen(true)} title="Scan a business card to create a lead instantly">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          Card Scan
        </button>
        <button className="btn" onClick={() => setVisionOpen(true)} title="Vision quote — photograph a vehicle for instant estimate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <circle cx="12" cy="12" r="3" />
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
          </svg>
          Vision Quote
        </button>
        <button className="btn" onClick={() => setBlueprintOpen(true)} title="Scan blueprint PDF for wrap opportunities">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="11" y2="17" />
          </svg>
          Scan Blueprint
        </button>
        {mode === 'leads' && (
          <button className="btn btn-primary" onClick={() => setAddLeadOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Lead
          </button>
        )}
        <button className="btn btn-icon notif-bell-btn" title="Notifications" onClick={() => setNotifOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>
        <button className="btn btn-icon" title="Settings" onClick={() => setSettingsOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {visionOpen && <VisionQuoteModal onClose={() => setVisionOpen(false)} />}
        {arOpen && <ARPreviewModal onClose={() => setArOpen(false)} />}
        {cardScanOpen && <CardScanModal onClose={() => setCardScanOpen(false)} />}
        {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
      <div className="user-pill">
          <div className="user-pill-avatar">{initials}</div>
          <span>{user?.companyName ?? user?.name ?? user?.email?.split('@')[0]}</span>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 2 }}
            title="Sign out"
            onClick={logout}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
