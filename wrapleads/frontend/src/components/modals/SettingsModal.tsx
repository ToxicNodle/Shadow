import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../api/client';
import Modal from '../ui/Modal';
import type { Settings, MaterialItem } from '../../api/types';

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
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [editSubForm, setEditSubForm] = useState<{name:string;specialty:string;labor_rate:string;tax_id:string;business_type:string;email:string;address:string}>({name:'',specialty:'',labor_rate:'',tax_id:'',business_type:'individual',email:'',address:''});

  // Web Push notifications
  const [pushLoading, setPushLoading] = useState(false);
  const { data: pushStatus, refetch: refetchPush } = useQuery({
    queryKey: ['push-status'],
    queryFn: () => api.getPushStatus(),
    staleTime: 30_000,
    enabled: settingsOpen,
  });
  async function togglePush() {
    setPushLoading(true);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        showToast('Push notifications not supported in this browser', 'error');
        return;
      }
      if (pushStatus?.subscribed) {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = await reg?.pushManager?.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await api.unsubscribePush(sub.endpoint);
        }
        showToast('Push notifications disabled');
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { showToast('Permission denied', 'error'); return; }
        const vapidRes = await api.getPushVapidKey();
        if (!vapidRes.publicKey) { showToast('Push not configured on server — add VAPID_PUBLIC_KEY to env', 'error'); return; }
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidRes.publicKey,
        });
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        await api.subscribePush({ endpoint: json.endpoint, keys: json.keys });
        showToast('Push notifications enabled — you\'ll be notified even when WrapOS is closed');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setPushLoading(false);
      refetchPush();
    }
  }

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
  const updateSubMut = useMutation({
    mutationFn: (id: number) => api.updateSubcontractor(id, {
      name: editSubForm.name.trim() || undefined,
      specialty: editSubForm.specialty.trim() || undefined,
      labor_rate: editSubForm.labor_rate ? Number(editSubForm.labor_rate) : undefined,
      tax_id: editSubForm.tax_id.trim() || undefined,
      business_type: (editSubForm.business_type as 'individual' | 'business') || undefined,
      email: editSubForm.email.trim() || undefined,
      address: editSubForm.address.trim() || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subcontractors'] }); setEditSubId(null); showToast('Subcontractor updated', 'success'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  // Material inventory
  const [matForm, setMatForm] = useState<Partial<MaterialItem>>({ brand: '', product_name: '', finish: '', roll_width_in: 60, roll_length_ft: 25, rolls_in_stock: 0, reorder_at: 2, unit_cost: 0 });
  const [matEditId, setMatEditId] = useState<number | null>(null);
  const [matAdjustId, setMatAdjustId] = useState<number | null>(null);
  const [matAdjustDelta, setMatAdjustDelta] = useState('');
  const [matShowAdd, setMatShowAdd] = useState(false);
  const { data: matsData } = useQuery({
    queryKey: ['materials'],
    queryFn: () => api.getMaterials(),
    staleTime: 5 * 60_000,
    enabled: settingsOpen,
  });
  const createMatMut = useMutation({
    mutationFn: () => api.createMaterial(matForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] });
      qc.invalidateQueries({ queryKey: ['materials-low-stock'] });
      setMatForm({ brand: '', product_name: '', finish: '', roll_width_in: 60, roll_length_ft: 25, rolls_in_stock: 0, reorder_at: 2, unit_cost: 0 });
      setMatShowAdd(false);
      showToast('Material added', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const updateMatMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MaterialItem> }) => api.updateMaterial(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] });
      qc.invalidateQueries({ queryKey: ['materials-low-stock'] });
      setMatEditId(null);
      showToast('Material updated', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const deleteMatMut = useMutation({
    mutationFn: (id: number) => api.deleteMaterial(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] });
      qc.invalidateQueries({ queryKey: ['materials-low-stock'] });
    },
  });
  const adjustMatMut = useMutation({
    mutationFn: ({ id, delta }: { id: number; delta: number }) => api.adjustMaterialStock(id, delta),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] });
      qc.invalidateQueries({ queryKey: ['materials-low-stock'] });
      setMatAdjustId(null);
      setMatAdjustDelta('');
      showToast('Stock updated', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
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
          <div key={sub.id} style={{ marginBottom: 6, background: 'var(--bg-input)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{sub.name}</span>
                {sub.specialty && <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 6 }}>{sub.specialty}</span>}
                {sub.labor_rate && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>${Number(sub.labor_rate)}/hr</span>}
                {sub.tax_id && <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 6, fontFamily: 'monospace' }}>TIN: {sub.tax_id}</span>}
                {(sub.job_count ?? 0) > 0 && <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 6 }}>{sub.job_count} jobs</span>}
              </div>
              <button
                className="btn"
                style={{ fontSize: 10, padding: '2px 8px' }}
                onClick={() => {
                  if (editSubId === sub.id) { setEditSubId(null); return; }
                  setEditSubId(sub.id);
                  setEditSubForm({ name: sub.name, specialty: sub.specialty || '', labor_rate: sub.labor_rate ? String(sub.labor_rate) : '', tax_id: sub.tax_id || '', business_type: sub.business_type || 'individual', email: sub.email || '', address: sub.address || '' });
                }}
              >{editSubId === sub.id ? 'Cancel' : 'Edit'}</button>
              <button className="btn" style={{ fontSize: 10, color: 'var(--red)', padding: '2px 8px' }} onClick={() => deleteSubMut.mutate(sub.id)} disabled={deleteSubMut.isPending}>Remove</button>
            </div>
            {editSubId === sub.id && (
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                  <div><label className="field-label">Name</label><input className="input" value={editSubForm.name} onChange={(e) => setEditSubForm((f) => ({ ...f, name: e.target.value }))} style={{ fontSize: 12 }} /></div>
                  <div><label className="field-label">Specialty</label><input className="input" value={editSubForm.specialty} onChange={(e) => setEditSubForm((f) => ({ ...f, specialty: e.target.value }))} style={{ fontSize: 12 }} /></div>
                  <div><label className="field-label">$/hr</label><input className="input" type="number" min={0} value={editSubForm.labor_rate} onChange={(e) => setEditSubForm((f) => ({ ...f, labor_rate: e.target.value }))} style={{ fontSize: 12 }} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label className="field-label">Tax ID (EIN/SSN)</label>
                    <input className="input" value={editSubForm.tax_id} onChange={(e) => setEditSubForm((f) => ({ ...f, tax_id: e.target.value }))} placeholder="XX-XXXXXXX" style={{ fontSize: 12 }} />
                  </div>
                  <div>
                    <label className="field-label">Business Type</label>
                    <select className="input" value={editSubForm.business_type} onChange={(e) => setEditSubForm((f) => ({ ...f, business_type: e.target.value }))} style={{ fontSize: 12 }}>
                      <option value="individual">Individual / Sole Prop</option>
                      <option value="business">Business / LLC / Corp</option>
                    </select>
                  </div>
                  <div><label className="field-label">Email</label><input className="input" type="email" value={editSubForm.email} onChange={(e) => setEditSubForm((f) => ({ ...f, email: e.target.value }))} placeholder="installer@email.com" style={{ fontSize: 12 }} /></div>
                </div>
                <div><label className="field-label">Address (for 1099)</label><input className="input" value={editSubForm.address} onChange={(e) => setEditSubForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Main St, City, State ZIP" style={{ fontSize: 12 }} /></div>
                <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: 'flex-start' }} disabled={!editSubForm.name.trim() || updateSubMut.isPending} onClick={() => updateSubMut.mutate(sub.id)}>
                  {updateSubMut.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            )}
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

      {/* ── Material Inventory ── */}
      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          Material Inventory
        </div>
        <p className="settings-help">
          Track your vinyl and film stock by brand, color, and finish. Set a reorder threshold — WrapOS will alert you on the Mission view when you're running low.
        </p>

        {/* Inventory list */}
        {(matsData?.materials ?? []).length === 0 && (
          <p className="settings-help" style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>
            No materials tracked yet. Add your first vinyl roll below.
          </p>
        )}
        {(matsData?.materials ?? []).map((mat) => {
          const isLow = Number(mat.rolls_in_stock) <= Number(mat.reorder_at);
          const isEditing = matEditId === mat.id;
          const isAdjusting = matAdjustId === mat.id;

          if (isEditing) {
            return (
              <div key={mat.id} style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px', marginBottom: 6, border: '1px solid var(--accent)30' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                  <div>
                    <label className="field-label">Brand</label>
                    <input className="input" style={{ fontSize: 12 }} defaultValue={mat.brand} id={`mat-edit-brand-${mat.id}`} />
                  </div>
                  <div>
                    <label className="field-label">Product Name</label>
                    <input className="input" style={{ fontSize: 12 }} defaultValue={mat.product_name} id={`mat-edit-name-${mat.id}`} />
                  </div>
                  <div>
                    <label className="field-label">Finish / Color</label>
                    <input className="input" style={{ fontSize: 12 }} defaultValue={mat.finish ?? ''} id={`mat-edit-finish-${mat.id}`} placeholder="Gloss Black" />
                  </div>
                  <div>
                    <label className="field-label">SKU</label>
                    <input className="input" style={{ fontSize: 12 }} defaultValue={mat.sku ?? ''} id={`mat-edit-sku-${mat.id}`} placeholder="3M-1080-G12" />
                  </div>
                  <div>
                    <label className="field-label">Rolls in Stock</label>
                    <input className="input" type="number" min={0} step={0.5} style={{ fontSize: 12 }} defaultValue={mat.rolls_in_stock} id={`mat-edit-stock-${mat.id}`} />
                  </div>
                  <div>
                    <label className="field-label">Reorder When Below</label>
                    <input className="input" type="number" min={0} step={0.5} style={{ fontSize: 12 }} defaultValue={mat.reorder_at} id={`mat-edit-reorder-${mat.id}`} />
                  </div>
                  <div>
                    <label className="field-label">Cost / Roll ($)</label>
                    <input className="input" type="number" min={0} step={1} style={{ fontSize: 12 }} defaultValue={mat.unit_cost} id={`mat-edit-cost-${mat.id}`} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={updateMatMut.isPending}
                    onClick={() => {
                      const brand = (document.getElementById(`mat-edit-brand-${mat.id}`) as HTMLInputElement).value.trim();
                      const product_name = (document.getElementById(`mat-edit-name-${mat.id}`) as HTMLInputElement).value.trim();
                      const finish = (document.getElementById(`mat-edit-finish-${mat.id}`) as HTMLInputElement).value.trim();
                      const sku = (document.getElementById(`mat-edit-sku-${mat.id}`) as HTMLInputElement).value.trim();
                      const rolls_in_stock = parseFloat((document.getElementById(`mat-edit-stock-${mat.id}`) as HTMLInputElement).value) || 0;
                      const reorder_at = parseFloat((document.getElementById(`mat-edit-reorder-${mat.id}`) as HTMLInputElement).value) || 2;
                      const unit_cost = parseFloat((document.getElementById(`mat-edit-cost-${mat.id}`) as HTMLInputElement).value) || 0;
                      if (!brand || !product_name) return;
                      updateMatMut.mutate({ id: mat.id, data: { brand, product_name, finish: finish || null, sku: sku || null, rolls_in_stock, reorder_at, unit_cost } });
                    }}>
                    {updateMatMut.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => setMatEditId(null)}>Cancel</button>
                </div>
              </div>
            );
          }

          return (
            <div key={mat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, background: 'var(--bg-input)', borderRadius: 8, padding: '8px 12px', border: `1px solid ${isLow ? '#f59e0b30' : 'transparent'}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{mat.product_name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 3 }}>{mat.brand}</span>
                  {mat.finish && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{mat.finish}</span>}
                  {isLow && <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700, background: '#f59e0b18', padding: '1px 5px', borderRadius: 3 }}>LOW</span>}
                </div>
                {isAdjusting ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+/− rolls:</span>
                    <input
                      type="number"
                      step={0.5}
                      value={matAdjustDelta}
                      onChange={(e) => setMatAdjustDelta(e.target.value)}
                      style={{ width: 60, fontSize: 12, padding: '2px 6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', textAlign: 'center' }}
                      autoFocus
                      placeholder="e.g. 3"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const d = parseFloat(matAdjustDelta);
                          if (!isNaN(d)) adjustMatMut.mutate({ id: mat.id, delta: d });
                        }
                        if (e.key === 'Escape') { setMatAdjustId(null); setMatAdjustDelta(''); }
                      }}
                    />
                    <button className="btn btn-primary" style={{ fontSize: 11 }}
                      onClick={() => { const d = parseFloat(matAdjustDelta); if (!isNaN(d)) adjustMatMut.mutate({ id: mat.id, delta: d }); }}>
                      Apply
                    </button>
                    <button className="btn" style={{ fontSize: 11 }} onClick={() => { setMatAdjustId(null); setMatAdjustDelta(''); }}>✕</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: isLow ? '#f59e0b' : 'var(--text-muted)', marginTop: 2 }}>
                    {Number(mat.rolls_in_stock).toFixed(1)} rolls in stock
                    {mat.rolls_on_order > 0 && <span style={{ color: '#4d8af5', marginLeft: 6 }}>· {Number(mat.rolls_on_order).toFixed(1)} on order</span>}
                    · reorder at {Number(mat.reorder_at).toFixed(1)}
                    {mat.unit_cost > 0 && <span style={{ marginLeft: 6 }}>· ${Number(mat.unit_cost).toFixed(0)}/roll</span>}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className="btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => { setMatAdjustId(mat.id); setMatAdjustDelta(''); }}>±</button>
                <button className="btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setMatEditId(mat.id)}>Edit</button>
                <button className="btn" style={{ fontSize: 10, padding: '2px 8px', color: 'var(--red)' }} onClick={() => deleteMatMut.mutate(mat.id)} disabled={deleteMatMut.isPending}>Remove</button>
              </div>
            </div>
          );
        })}

        {/* Add new material form */}
        {matShowAdd ? (
          <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px', marginTop: 8, border: '1px solid var(--accent)30' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
              <div>
                <label className="field-label">Brand *</label>
                <input className="input" style={{ fontSize: 12 }} value={matForm.brand ?? ''} onChange={(e) => setMatForm((p) => ({ ...p, brand: e.target.value }))} placeholder="3M" />
              </div>
              <div>
                <label className="field-label">Product Name *</label>
                <input className="input" style={{ fontSize: 12 }} value={matForm.product_name ?? ''} onChange={(e) => setMatForm((p) => ({ ...p, product_name: e.target.value }))} placeholder="1080-G12 Gloss Black" />
              </div>
              <div>
                <label className="field-label">Finish / Color</label>
                <input className="input" style={{ fontSize: 12 }} value={matForm.finish ?? ''} onChange={(e) => setMatForm((p) => ({ ...p, finish: e.target.value }))} placeholder="Gloss Black" />
              </div>
              <div>
                <label className="field-label">SKU</label>
                <input className="input" style={{ fontSize: 12 }} value={matForm.sku ?? ''} onChange={(e) => setMatForm((p) => ({ ...p, sku: e.target.value }))} placeholder="3M-1080-G12" />
              </div>
              <div>
                <label className="field-label">Rolls in Stock</label>
                <input className="input" type="number" min={0} step={0.5} style={{ fontSize: 12 }} value={matForm.rolls_in_stock ?? 0} onChange={(e) => setMatForm((p) => ({ ...p, rolls_in_stock: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="field-label">Reorder When Below</label>
                <input className="input" type="number" min={0} step={0.5} style={{ fontSize: 12 }} value={matForm.reorder_at ?? 2} onChange={(e) => setMatForm((p) => ({ ...p, reorder_at: parseFloat(e.target.value) || 2 }))} />
              </div>
              <div>
                <label className="field-label">Cost / Roll ($)</label>
                <input className="input" type="number" min={0} step={1} style={{ fontSize: 12 }} value={matForm.unit_cost ?? 0} onChange={(e) => setMatForm((p) => ({ ...p, unit_cost: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary" style={{ fontSize: 12 }}
                disabled={!matForm.brand?.trim() || !matForm.product_name?.trim() || createMatMut.isPending}
                onClick={() => createMatMut.mutate()}>
                {createMatMut.isPending ? 'Adding…' : '+ Add Material'}
              </button>
              <button className="btn" style={{ fontSize: 12 }} onClick={() => setMatShowAdd(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn" style={{ fontSize: 12, marginTop: 8 }} onClick={() => setMatShowAdd(true)}>
            + Add Material
          </button>
        )}
      </div>

      {/* ── Mobile Push Notifications ── */}
      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          Mobile Push Notifications
        </div>
        <p className="settings-help">
          Get real-time notifications on your phone or desktop — new inbound leads, proposal approvals, email replies — even when WrapOS isn't open. Requires VAPID keys configured on the server.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className={`btn ${pushStatus?.subscribed ? '' : 'btn-primary'}`}
            onClick={togglePush}
            disabled={pushLoading}
            style={{ fontSize: 12 }}
          >
            {pushLoading ? 'Working…' : pushStatus?.subscribed ? 'Disable Push Notifications' : 'Enable Push Notifications'}
          </button>
          {pushStatus?.subscribed && (
            <span style={{ fontSize: 12, color: '#10b981', fontWeight: 700 }}>
              ✓ Active — this device will receive push alerts
            </span>
          )}
          {pushStatus && !pushStatus.vapidConfigured && (
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              Server not configured — add VAPID keys to enable
            </span>
          )}
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
