import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../api/client';
import Modal from '../ui/Modal';
import type { Settings } from '../../api/types';

type FleetStatus = 'idle' | 'testing' | 'ok' | 'fail' | 'importing' | 'imported';

export default function SettingsModal() {
  const { user } = useAuth();
  const { settingsOpen, setSettingsOpen, settings, updateSettings, showToast } = useAppStore((s) => ({
    settingsOpen: s.settingsOpen,
    setSettingsOpen: s.setSettingsOpen,
    settings: s.settings,
    updateSettings: s.updateSettings,
    showToast: s.showToast,
  }));
  const [local, setLocal] = useState<Settings>(settings);
  const [portalLoading, setPortalLoading] = useState(false);
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

  // Subcontractors
  const qc = useQueryClient();
  const [newSubName, setNewSubName] = useState('');
  const [newSubSpecialty, setNewSubSpecialty] = useState('');
  const [newSubRate, setNewSubRate] = useState('');

  // Webhooks
  const [newHookEvent, setNewHookEvent] = useState('lead.won');
  const [newHookUrl, setNewHookUrl] = useState('');
  const [newHookLabel, setNewHookLabel] = useState('');
  const [newHookSecret, setNewHookSecret] = useState('');
  const [testingHook, setTestingHook] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; code: number }>>({});
  const { data: hooksData } = useQuery({
    queryKey: ['user-webhooks'],
    queryFn: () => api.getWebhooks(),
    staleTime: 60_000,
    enabled: settingsOpen,
  });
  const createHookMut = useMutation({
    mutationFn: () => api.createWebhook({ event_type: newHookEvent, url: newHookUrl.trim(), label: newHookLabel.trim() || undefined, secret: newHookSecret.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['user-webhooks'] }); setNewHookUrl(''); setNewHookLabel(''); setNewHookSecret(''); showToast('Webhook saved'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const deleteHookMut = useMutation({
    mutationFn: (id: number) => api.deleteWebhook(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-webhooks'] }),
  });
  async function testHook(id: number) {
    setTestingHook(id);
    try {
      const r = await api.testWebhook(id);
      setTestResult((prev) => ({ ...prev, [id]: { ok: r.ok, code: r.statusCode } }));
      if (r.ok) showToast(`Webhook delivered — HTTP ${r.statusCode}`);
      else showToast(`Webhook failed — HTTP ${r.statusCode}`, 'error');
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setTestingHook(null);
    }
  }

  const { data: subsData } = useQuery({
    queryKey: ['subcontractors'],
    queryFn: () => api.getSubcontractors(),
    staleTime: 5 * 60_000,
    enabled: settingsOpen,
  });
  const createSubMut = useMutation({
    mutationFn: () => api.createSubcontractor({ name: newSubName.trim(), specialty: newSubSpecialty.trim() || undefined, labor_rate: newSubRate ? Number(newSubRate) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subcontractors'] }); setNewSubName(''); setNewSubSpecialty(''); setNewSubRate(''); showToast('Subcontractor saved', 'success'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const deleteSubMut = useMutation({
    mutationFn: (id: number) => api.deleteSubcontractor(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subcontractors'] }),
  });

  // Sync local form state whenever the modal opens — settings may have loaded from
  // the server after initial mount, so re-initialize when the user actually opens it.
  useEffect(() => {
    if (settingsOpen) setLocal(settings);
  }, [settingsOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settingsOpen) return null;

  function handleClose() {
    setSettingsOpen(false);
    setApolloStatus('idle');
    setSamsaraStatus('idle');
    setMotiveStatus('idle');
  }

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const { url } = await api.portal();
      window.location.href = url;
    } catch {
      showToast('Could not open billing portal — try again.');
    } finally {
      setPortalLoading(false);
    }
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
      value: local[field] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
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
          <input className="input" {...f('companyName')} placeholder="Apex Wraps" />
        </div>
        <div className="field-group">
          <label className="field-label">Tagline (for emails)</label>
          <input className="input" {...f('companyTagline')} placeholder="vehicle wraps, fleet graphics…" />
        </div>
        <div className="field-group">
          <label className="field-label">Services (for emails)</label>
          <input className="input" {...f('companyServices')} placeholder="fleet wraps, color-change, DI-NOC…" />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field-group" style={{ flex: 1 }}>
            <label className="field-label">City</label>
            <input className="input" {...f('city')} placeholder="Indianapolis" />
          </div>
          <div className="field-group" style={{ width: 80 }}>
            <label className="field-label">State</label>
            <input className="input" {...f('state')} placeholder="IN" maxLength={2} style={{ textTransform: 'uppercase' }} />
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Brand Accent Color</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="color"
              value={local.accentColor || '#ff6b35'}
              onChange={(e) => setLocal((s) => ({ ...s, accentColor: e.target.value }))}
              style={{ width: 44, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-input)', cursor: 'pointer' }}
            />
            <input
              className="input"
              value={local.accentColor || ''}
              onChange={(e) => setLocal((s) => ({ ...s, accentColor: e.target.value }))}
              placeholder="#ff6b35"
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
          </div>
          <p className="settings-help" style={{ marginTop: 4 }}>Themes the entire app — navigation highlights, buttons, and your public portfolio page.</p>
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
          <input className="input" {...f('vapiCallerName')} placeholder="Apex Wraps" />
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
            <input className="input" {...f('portfolioUrl')} placeholder="https://yourshop.com/portfolio" />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Revenue Goal</div>
        <p className="settings-help">Set your monthly closed revenue target. Displayed as a progress bar on your Mission Dashboard.</p>
        <div className="field-group">
          <label className="field-label">Monthly Revenue Goal ($)</label>
          <input className="input" type="number" min={0} {...f('monthlyRevenueGoal')} placeholder="10000" />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Speed-to-Lead Auto-Responder</div>
        <p className="settings-help">When a prospect submits your public quote request form, WrapOS instantly sends them a confirmation email — so no lead goes unanswered. Enabled by default when Resend is configured.</p>
        <div className="field-group">
          <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 16, height: 16 }}
              checked={local.autoReplyEnabled !== false}
              onChange={e => setLocal(s => ({ ...s, autoReplyEnabled: e.target.checked }))}
            />
            Auto-reply to inbound quote requests
          </label>
        </div>
        <div className="field-group">
          <label className="field-label">Expected Response Time</label>
          <select className="select" {...f('autoReplyResponseTime')}>
            <option value="">1 business day (default)</option>
            <option value="a few hours">A few hours</option>
            <option value="24 hours">24 hours</option>
            <option value="1 business day">1 business day</option>
            <option value="2 business days">2 business days</option>
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Custom Auto-Reply Message (optional)</label>
          <textarea
            className="input"
            {...f('autoReplyMessage')}
            placeholder="Thanks for reaching out! We'll review your fleet wrap request and get back to you shortly."
            rows={3}
            style={{ resize: 'vertical', minHeight: 72 }}
          />
          <p className="settings-help" style={{ marginTop: 4 }}>Leave blank to use the default AI-personalized message.</p>
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
        <div className="settings-section-title">Inbound Quote Form</div>
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
              {quoteLinkCopied ? '✓ Copied!' : 'Copy'}
            </button>
            <a href={quoteLink} target="_blank" rel="noreferrer" className="btn" style={{ fontSize: 11, whiteSpace: 'nowrap', textDecoration: 'none' }}>
              Preview
            </a>
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
        <div className="settings-section-title">Public Portfolio</div>
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
              {portfolioLinkCopied ? '✓ Copied!' : 'Copy'}
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

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <path d="M1 10h22" />
            <circle cx="7" cy="15" r="1" />
          </svg>
          Deposit Collection
        </div>
        <p className="settings-help">
          When a client approves a quote in their client portal, show a "Pay Deposit" button that links to your Stripe Payment Link (or any payment URL). Paste your Stripe Payment Link URL below.
        </p>
        <div className="field-group">
          <label className="field-label">Stripe Payment Link URL</label>
          <input className="input" {...f('depositPaymentLink')} placeholder="https://buy.stripe.com/…" />
        </div>
        {local.depositPaymentLink && (
          <p className="settings-help" style={{ color: 'var(--green)', marginTop: 4 }}>
            ✓ Deposit button will appear after quote approval in the client portal.
          </p>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Hunter.io Integration
        </div>
        <p className="settings-help">
          Hunter.io finds professional email addresses for any company domain. When configured, WrapOS tries Hunter first (25 free searches/month) before falling back to Apollo — saving credits.
        </p>
        <div className="field-group">
          <label className="field-label">Hunter API Key</label>
          <input className="input" type="password" {...f('hunterApiKey')} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">👷 Subcontractors</div>
        <p className="settings-help">
          Add subcontractors you use for installs. Assign them to jobs to track their labor cost and see your true margin.
        </p>
        {/* List existing */}
        {(subsData?.subs ?? []).map((sub) => (
          <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, background: 'var(--bg-input)', borderRadius: 6, padding: '6px 10px' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{sub.name}</span>
              {sub.specialty && <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 6 }}>{sub.specialty}</span>}
              {sub.labor_rate && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>${Number(sub.labor_rate)}/hr</span>}
              {(sub.job_count ?? 0) > 0 && <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 6 }}>{sub.job_count} jobs · ${Number(sub.total_paid).toLocaleString()} paid</span>}
            </div>
            <button className="btn" style={{ fontSize: 10, color: 'var(--red)', padding: '2px 8px' }} onClick={() => deleteSubMut.mutate(sub.id)} disabled={deleteSubMut.isPending}>Remove</button>
          </div>
        ))}
        {/* Add new */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field-group" style={{ flex: 2 }}>
            <label className="field-label">Name</label>
            <input className="input" value={newSubName} onChange={(e) => setNewSubName(e.target.value)} placeholder="Jake's Install Crew" style={{ fontSize: 12 }} />
          </div>
          <div className="field-group" style={{ flex: 1 }}>
            <label className="field-label">Specialty</label>
            <input className="input" value={newSubSpecialty} onChange={(e) => setNewSubSpecialty(e.target.value)} placeholder="fleet wraps" style={{ fontSize: 12 }} />
          </div>
          <div className="field-group" style={{ width: 80 }}>
            <label className="field-label">$/hr</label>
            <input className="input" type="number" min={0} value={newSubRate} onChange={(e) => setNewSubRate(e.target.value)} placeholder="65" style={{ fontSize: 12 }} />
          </div>
          <button className="btn btn-primary" style={{ fontSize: 12, marginBottom: 1 }} disabled={!newSubName.trim() || createSubMut.isPending} onClick={() => createSubMut.mutate()}>
            {createSubMut.isPending ? 'Adding…' : '+ Add'}
          </button>
        </div>
      </div>

      {/* ── Webhook Integrations ── */}
      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
          </svg>
          Webhooks &amp; Integrations
        </div>
        <p className="settings-help">
          Fire HTTP POST events to any URL when key things happen — lead won, proposal approved, inbound lead. Connect WrapOS to Zapier, Make, Slack, or your own systems. All payloads include a <code style={{ fontSize: 10, background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>X-WrapOS-Signature</code> HMAC header for verification.
        </p>

        {/* Existing webhooks */}
        {(hooksData?.webhooks ?? []).map((hook) => {
          const eventLabel = hooksData?.events?.find(e => e.value === hook.event_type)?.label ?? hook.event_type;
          const lastResult = testResult[hook.id];
          return (
            <div key={hook.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, background: 'var(--bg-input)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#4d8af5', background: 'rgba(77,138,245,0.12)', padding: '1px 6px', borderRadius: 3 }}>
                    {eventLabel}
                  </span>
                  {hook.label && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hook.label}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', wordBreak: 'break-all' }}>{hook.url}</div>
                {hook.last_triggered_at && (
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                    Last fired: {new Date(hook.last_triggered_at).toLocaleString()}
                    {hook.last_status_code != null && (
                      <span style={{ marginLeft: 6, color: hook.last_status_code >= 200 && hook.last_status_code < 300 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                        HTTP {hook.last_status_code}
                      </span>
                    )}
                  </div>
                )}
                {lastResult && (
                  <div style={{ fontSize: 10, marginTop: 2, color: lastResult.ok ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                    {lastResult.ok ? `✓ Test delivered — HTTP ${lastResult.code}` : `✗ Test failed — HTTP ${lastResult.code}`}
                  </div>
                )}
              </div>
              <button
                className="btn"
                style={{ fontSize: 10, padding: '3px 9px', flexShrink: 0 }}
                onClick={() => testHook(hook.id)}
                disabled={testingHook === hook.id}
              >
                {testingHook === hook.id ? '…' : 'Test'}
              </button>
              <button
                className="btn"
                style={{ fontSize: 10, color: 'var(--red)', padding: '3px 8px', flexShrink: 0 }}
                onClick={() => deleteHookMut.mutate(hook.id)}
                disabled={deleteHookMut.isPending}
              >
                Remove
              </button>
            </div>
          );
        })}

        {/* Add new webhook form */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: 8 }}>
            Add Webhook
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field-group" style={{ flex: '0 0 auto', minWidth: 160 }}>
              <label className="field-label">Event</label>
              <select className="input" value={newHookEvent} onChange={(e) => setNewHookEvent(e.target.value)} style={{ fontSize: 12 }}>
                {(hooksData?.events ?? [{ value: 'lead.won', label: 'Lead Won' }, { value: 'lead.lost', label: 'Lead Lost' }, { value: 'lead.advanced', label: 'Lead Stage Changed' }, { value: 'proposal.approved', label: 'Proposal Approved' }, { value: 'inbound.lead', label: 'New Inbound Lead' }]).map((ev) => (
                  <option key={ev.value} value={ev.value}>{ev.label}</option>
                ))}
              </select>
            </div>
            <div className="field-group" style={{ flex: 3, minWidth: 200 }}>
              <label className="field-label">Destination URL (HTTPS)</label>
              <input className="input" value={newHookUrl} onChange={(e) => setNewHookUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/..." style={{ fontSize: 12 }} />
            </div>
            <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
              <label className="field-label">Label (optional)</label>
              <input className="input" value={newHookLabel} onChange={(e) => setNewHookLabel(e.target.value)} placeholder="Slack notify" style={{ fontSize: 12 }} />
            </div>
            <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
              <label className="field-label">Secret (optional)</label>
              <input className="input" type="password" value={newHookSecret} onChange={(e) => setNewHookSecret(e.target.value)} placeholder="used to sign payload" style={{ fontSize: 12 }} />
            </div>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, marginBottom: 1, flexShrink: 0 }}
              disabled={!newHookUrl.trim() || createHookMut.isPending}
              onClick={() => createHookMut.mutate()}
            >
              {createHookMut.isPending ? 'Saving…' : '+ Add'}
            </button>
          </div>
          {(hooksData?.webhooks ?? []).length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '8px 0 0', lineHeight: 1.5 }}>
              No webhooks yet — add one above. Example: paste your Zapier catch hook URL to auto-create a row in Google Sheets every time you win a deal.
            </p>
          )}
        </div>
      </div>

      {(user?.subStatus === 'active' || user?.subStatus === 'past_due' || user?.subStatus === 'trialing') && (
        <div className="settings-section">
          <div className="settings-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            Billing
          </div>
          <p className="settings-help">
            Manage your subscription, update payment method, or view invoices via the Stripe customer portal.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn" onClick={openBillingPortal} disabled={portalLoading}>
              {portalLoading ? 'Opening…' : 'Manage Billing →'}
            </button>
            {user?.subStatus === 'past_due' && (
              <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>
                ⚠ Payment past due — update card to restore access
              </span>
            )}
          </div>
        </div>
      )}

      <div className="modal-actions">
        <button className="btn" onClick={handleClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Settings</button>
      </div>
    </Modal>
  );
}
