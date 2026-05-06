import { useAuth } from '../../hooks/useAuth';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import type { AppMode } from '../../store/useAppStore';
import { api } from '../../api/client';

export default function Topbar() {
  const { user, logout } = useAuth();
  const { leads } = useLeads();
  const { mode, setMode, setAddLeadOpen, setSettingsOpen, showToast } = useAppStore((s) => ({
    mode: s.mode,
    setMode: s.setMode,
    setAddLeadOpen: s.setAddLeadOpen,
    setSettingsOpen: s.setSettingsOpen,
    showToast: s.showToast,
  }));

  const wonCount = leads.filter((l) => l.status === 'won').length;
  const activeCount = leads.filter((l) => l.status !== 'won' && l.status !== 'lost').length;

  async function handlePortal() {
    try {
      const { url } = await api.portal();
      window.location.href = url;
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    }
  }

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
        {(['leads', 'discover'] as AppMode[]).map((m) => (
          <button
            key={m}
            className={`mode-btn ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'leads' ? 'My Leads' : 'Discover'}
          </button>
        ))}
      </div>

      <div className="topbar-spacer" />

      {mode === 'leads' && (
        <>
          <div className="topbar-stat">
            <strong>{leads.length}</strong> leads
          </div>
          <div className="topbar-stat">
            <strong>{activeCount}</strong> active
          </div>
          <div className="topbar-stat">
            <strong>{wonCount}</strong> won
          </div>
        </>
      )}

      <div className="topbar-actions">
        {mode === 'leads' && (
          <button className="btn btn-primary" onClick={() => setAddLeadOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Lead
          </button>
        )}
        <button className="btn btn-icon" title="Settings" onClick={() => setSettingsOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        <div className="user-pill">
          <div className="user-pill-avatar">{initials}</div>
          <span>{user?.companyName ?? user?.name ?? user?.email?.split('@')[0]}</span>
          {user?.subStatus === 'active' && (
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 2 }}
              title="Billing"
              onClick={handlePortal}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </button>
          )}
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
