import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import Modal from '../ui/Modal';
import type { Settings } from '../../api/types';

export default function SettingsModal() {
  const { settingsOpen, setSettingsOpen, settings, updateSettings, showToast } = useAppStore((s) => ({
    settingsOpen: s.settingsOpen,
    setSettingsOpen: s.setSettingsOpen,
    settings: s.settings,
    updateSettings: s.updateSettings,
    showToast: s.showToast,
  }));
  const [local, setLocal] = useState<Settings>(settings);
  const [apolloStatus, setApolloStatus] = useState<'idle' | 'ok' | 'fail'>('idle');

  if (!settingsOpen) return null;

  function handleClose() {
    setSettingsOpen(false);
    setApolloStatus('idle');
  }

  function handleSave() {
    updateSettings(local);
    api.saveSettings(local).catch(() => {});
    showToast('Settings saved');
    handleClose();
  }

  async function testApollo() {
    try {
      await api.apolloTest();
      setApolloStatus('ok');
    } catch {
      setApolloStatus('fail');
    }
  }

  function f(field: keyof Settings) {
    return {
      value: local[field],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setLocal((s) => ({ ...s, [field]: e.target.value })),
    };
  }

  return (
    <Modal title="Settings" onClose={handleClose}>
      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Sender Info
        </div>
        <p className="settings-help">Used in AI email generation.</p>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Your Name</label>
            <input className="input" {...f('senderName')} placeholder="Alex Smith" />
          </div>
          <div className="field-group">
            <label className="field-label">Title</label>
            <input className="input" {...f('senderTitle')} placeholder="Installer / Sales" />
          </div>
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Email</label>
            <input className="input" type="email" {...f('senderEmail')} placeholder="alex@wrapshop.com" />
          </div>
          <div className="field-group">
            <label className="field-label">Phone</label>
            <input className="input" {...f('senderPhone')} placeholder="(555) 123-4567" />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Company</div>
        <div className="field-group">
          <label className="field-label">Company Name</label>
          <input className="input" {...f('companyName')} placeholder="Shadow Graphix" />
        </div>
        <div className="field-group">
          <label className="field-label">Tagline (for emails)</label>
          <input className="input" {...f('companyTagline')} placeholder="vehicle wraps, fleet graphics…" />
        </div>
        <div className="field-group">
          <label className="field-label">Services (for emails)</label>
          <input className="input" {...f('companyServices')} placeholder="fleet wraps, color-change, DI-NOC…" />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Apollo Integration</div>
        <p className="settings-help">Optional. Get an API key at apollo.io to enable contact finding.</p>
        <div className="field-group">
          <label className="field-label">Apollo API Key</label>
          <input className="input" type="password" {...f('apolloApiKey')} placeholder="sk-…" />
        </div>
        {local.apolloApiKey && (
          <>
            <button className="btn" onClick={testApollo} style={{ marginBottom: 10 }}>Test Connection</button>
            {apolloStatus === 'ok' && <div className="apollo-test-ok">✓ Connected</div>}
            {apolloStatus === 'fail' && <div className="apollo-test-fail">✗ Invalid key or connection failed</div>}
          </>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Vapi.ai — AI Phone Calls</div>
        <p className="settings-help">
          Power outbound AI calls from the Mission view. Get a free API key at{' '}
          <a href="https://vapi.ai" target="_blank" rel="noreferrer">vapi.ai</a>{' '}
          → Dashboard → API Keys. Then create a phone number in Vapi and paste its ID below.
        </p>
        <div className="field-group">
          <label className="field-label">Vapi API Key</label>
          <input className="input" type="password" {...f('vapiApiKey')} placeholder="vapi_…" />
        </div>
        <div className="field-group">
          <label className="field-label">Vapi Phone Number ID</label>
          <input className="input" {...f('vapiPhoneNumberId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </div>
        <div className="field-group">
          <label className="field-label">Caller Name (shown on caller ID)</label>
          <input className="input" {...f('vapiCallerName')} placeholder="Shadow Graphix" />
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn" onClick={handleClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Settings</button>
      </div>
    </Modal>
  );
}
