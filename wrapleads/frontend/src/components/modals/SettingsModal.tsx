import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import Modal from '../ui/Modal';
import type { Settings } from '../../api/types';

type FleetStatus = 'idle' | 'testing' | 'ok' | 'fail' | 'importing' | 'imported';

export default function SettingsModal() {
  const { settingsOpen, setSettingsOpen, settings, updateSettings, showToast } = useAppStore((s) => ({
    settingsOpen: s.settingsOpen,
    setSettingsOpen: s.setSettingsOpen,
    settings: s.settings,
    updateSettings: s.updateSettings,
    showToast: s.showToast,
  }));
  const [local, setLocal] = useState<Settings>(settings);
  const [quoteLink, setQuoteLink] = useState<string | null>(null);
  const [quoteLinkCopied, setQuoteLinkCopied] = useState(false);
  const [portfolioLink, setPortfolioLink] = useState<string | null>(null);
  const [portfolioLinkCopied, setPortfolioLinkCopied] = useState(false);
  const [apolloStatus, setApolloStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [samsaraStatus, setSamsaraStatus] = useState<FleetStatus>('idle');
  const [samsaraCount, setSamsaraCount] = useState<number | null>(null);
  const [samsaraImported, setSamsaraImported] = useState<{ imported: number; skipped: number } | null>(null);
  const [motiveStatus, setMotiveStatus] = useState<FleetStatus>('idle');
  const [motiveCount, setMotiveCount] = useState<number | null>(null);
  const [motiveImported, setMotiveImported] = useState<{ imported: number; skipped: number } | null>(null);

  if (!settingsOpen) return null;

  function handleClose() {
    setSettingsOpen(false);
    setApolloStatus('idle');
    setSamsaraStatus('idle');
    setMotiveStatus('idle');
  }

  async function testSamsara() {
    setSamsaraStatus('testing');
    setSamsaraCount(null);
    try {
      const r = await api.getSamsaraVehicles();
      setSamsaraCount(r.count);
      setSamsaraStatus('ok');
    } catch {
      setSamsaraStatus('fail');
    }
  }

  async function importSamsara() {
    setSamsaraStatus('importing');
    try {
      const r = await api.importSamsaraVehicles();
      setSamsaraImported({ imported: r.imported, skipped: r.skipped });
      setSamsaraStatus('imported');
    } catch {
      setSamsaraStatus('fail');
    }
  }

  async function testMotive() {
    setMotiveStatus('testing');
    setMotiveCount(null);
    try {
      const r = await api.getMotiveVehicles();
      setMotiveCount(r.count);
      setMotiveStatus('ok');
    } catch {
      setMotiveStatus('fail');
    }
  }

  async function importMotive() {
    setMotiveStatus('importing');
    try {
      const r = await api.importMotiveVehicles();
      setMotiveImported({ imported: r.imported, skipped: r.skipped });
      setMotiveStatus('imported');
    } catch {
      setMotiveStatus('fail');
    }
  }

  function handleSave() {
    updateSettings(local);
    api.saveSettings(local).catch(() => {});
    showToast('Settings saved');
    handleClose();
  }

  async function testApollo() {
    try {
      const result = await api.apolloTest();
      setApolloStatus(result.ok ? 'ok' : 'fail');
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
        <div className="field-group">
          <label className="field-label">Call Humor Level</label>
          <select
            className="input"
            value={local.callHumorLevel ?? 'light'}
            onChange={(e) => setLocal((s) => ({ ...s, callHumorLevel: e.target.value as Settings['callHumorLevel'] }))}
          >
            <option value="none">None — strictly professional</option>
            <option value="light">Light — friendly wit, occasional warmth</option>
            <option value="medium">Medium — casual, self-deprecating, disarming</option>
            <option value="high">High — full comedian, bold personality</option>
          </select>
          <p className="settings-help" style={{ marginTop: 4 }}>Controls how much personality and humor the AI injects during calls.</p>
        </div>
        <div className="field-group">
          <label className="field-label">Warm Handoff — Transfer Phone Number</label>
          <input className="input" {...f('transferPhoneNumber')} placeholder="+13175551234" />
          <p className="settings-help" style={{ marginTop: 4 }}>When the AI detects strong buying intent it will transfer the live call to this number.</p>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Twilio SMS — Post-Call Chain</div>
        <p className="settings-help">
          Optional. When a call ends positively, an SMS with your portfolio link fires automatically.
          Get credentials at <a href="https://twilio.com" target="_blank" rel="noreferrer">twilio.com</a>.
        </p>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Account SID</label>
            <input className="input" {...f('twilioAccountSid')} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
          </div>
          <div className="field-group">
            <label className="field-label">Auth Token</label>
            <input className="input" type="password" {...f('twilioAuthToken')} placeholder="your auth token" />
          </div>
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">From Phone Number</label>
            <input className="input" {...f('twilioFromNumber')} placeholder="+13175550100" />
          </div>
          <div className="field-group">
            <label className="field-label">Portfolio URL</label>
            <input className="input" {...f('portfolioUrl')} placeholder="https://shadowgraphix.com/portfolio" />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Vision Quote — Pricing</div>
        <p className="settings-help">Override the default sq footage pricing used in instant vehicle quotes.</p>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Price / sq ft (low)</label>
            <input className="input" {...f('pricePerSqftLow')} placeholder="8" />
          </div>
          <div className="field-group">
            <label className="field-label">Price / sq ft (high)</label>
            <input className="input" {...f('pricePerSqftHigh')} placeholder="14" />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Design Studio &amp; AR Preview</div>
        <p className="settings-help">
          Powers AI wrap concept generation and AR preview. Get an API key at{' '}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com</a>.
          DALL-E 3 costs ~$0.04 per image.
        </p>
        <div className="field-group">
          <label className="field-label">OpenAI API Key</label>
          <input className="input" type="password" {...f('openaiApiKey')} placeholder="sk-…" />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Fleet Integrations</div>
        <p className="settings-help">Connect Samsara or Motive to pull your fleet roster and import vehicles as leads. Save your API key first, then test and import.</p>

        <div className="field-group">
          <label className="field-label">Samsara API Key</label>
          <input className="input" type="password" {...f('samsaraApiKey')} placeholder="samsara_api_…" />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" disabled={samsaraStatus === 'testing'} onClick={testSamsara}>
            {samsaraStatus === 'testing' ? 'Testing…' : 'Test Samsara'}
          </button>
          {samsaraStatus === 'ok' && (
            <>
              <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>✓ {samsaraCount} vehicles found</span>
              <button className="btn btn-primary" disabled={(samsaraStatus as FleetStatus) === 'importing'} onClick={importSamsara}>
                Import as Leads
              </button>
            </>
          )}
          {samsaraStatus === 'importing' && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Importing…</span>}
          {samsaraStatus === 'imported' && samsaraImported && (
            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>
              ✓ {samsaraImported.imported} imported, {samsaraImported.skipped} already existed
            </span>
          )}
          {samsaraStatus === 'fail' && <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>✗ Connection failed — check key and save first</span>}
        </div>

        <div className="field-group" style={{ marginTop: 16 }}>
          <label className="field-label">Motive (KeepTruckin) API Key</label>
          <input className="input" type="password" {...f('motiveApiKey')} placeholder="Bearer token…" />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" disabled={motiveStatus === 'testing'} onClick={testMotive}>
            {motiveStatus === 'testing' ? 'Testing…' : 'Test Motive'}
          </button>
          {motiveStatus === 'ok' && (
            <>
              <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>✓ {motiveCount} vehicles found</span>
              <button className="btn btn-primary" disabled={(motiveStatus as FleetStatus) === 'importing'} onClick={importMotive}>
                Import as Leads
              </button>
            </>
          )}
          {motiveStatus === 'importing' && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Importing…</span>}
          {motiveStatus === 'imported' && motiveImported && (
            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>
              ✓ {motiveImported.imported} imported, {motiveImported.skipped} already existed
            </span>
          )}
          {motiveStatus === 'fail' && <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>✗ Connection failed — check key and save first</span>}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">📥 Inbound Quote Form</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          Share this link on your website, email signature, or social media. Prospects fill it out → a new lead appears in WrapLeads instantly.
        </p>
        {quoteLink ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: 11, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', wordBreak: 'break-all', color: 'var(--text-muted)' }}>
              {quoteLink}
            </code>
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, whiteSpace: 'nowrap' }}
              onClick={() => { navigator.clipboard.writeText(quoteLink); setQuoteLinkCopied(true); setTimeout(() => setQuoteLinkCopied(false), 2000); }}
            >
              {quoteLinkCopied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        ) : (
          <button
            className="btn"
            style={{ fontSize: 12 }}
            onClick={async () => {
              const r = await api.getMyQuoteLink();
              setQuoteLink(`${window.location.origin}${r.url}`);
            }}
          >
            Get My Quote Link
          </button>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">📸 Public Portfolio</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          A beautiful public page showcasing your completed installs with photos, stats, and a "Get a Quote" button. Share it anywhere — your website, Instagram bio, or after every install.
        </p>
        {portfolioLink ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: 11, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', wordBreak: 'break-all', color: 'var(--text-muted)' }}>
              {portfolioLink}
            </code>
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, whiteSpace: 'nowrap' }}
              onClick={() => { navigator.clipboard.writeText(portfolioLink); setPortfolioLinkCopied(true); setTimeout(() => setPortfolioLinkCopied(false), 2000); }}
            >
              {portfolioLinkCopied ? '✓ Copied!' : '📋 Copy'}
            </button>
            <a href={portfolioLink} target="_blank" rel="noreferrer" className="btn" style={{ fontSize: 11, whiteSpace: 'nowrap', textDecoration: 'none' }}>
              Preview
            </a>
          </div>
        ) : (
          <button
            className="btn"
            style={{ fontSize: 12 }}
            onClick={async () => {
              const r = await api.getMyPortfolioLink();
              setPortfolioLink(`${window.location.origin}/portfolio/${r.token}`);
            }}
          >
            Get My Portfolio Link
          </button>
        )}
      </div>

      <div className="modal-actions">
        <button className="btn" onClick={handleClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Settings</button>
      </div>
    </Modal>
  );
}
