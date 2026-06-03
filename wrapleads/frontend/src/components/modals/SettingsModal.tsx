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
  const [embedCopied, setEmbedCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [calendarCopied, setCalendarCopied] = useState(false);
  const [portfolioLink, setPortfolioLink] = useState<string | null>(null);
  const [portfolioLinkCopied, setPortfolioLinkCopied] = useState(false);
  const [apolloStatus, setApolloStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [samsaraStatus, setSamsaraStatus] = useState<FleetStatus>('idle');
  const [samsaraCount, setSamsaraCount] = useState<number | null>(null);
  const [samsaraImported, setSamsaraImported] = useState<{ imported: number; skipped: number } | null>(null);
  const [motiveStatus, setMotiveStatus] = useState<FleetStatus>('idle');
  const [motiveCount, setMotiveCount] = useState<number | null>(null);
  const [motiveImported, setMotiveImported] = useState<{ imported: number; skipped: number } | null>(null);

  const [newUnsub, setNewUnsub] = useState('');
  const [showUnsubs, setShowUnsubs] = useState(false);

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

  const { data: unsubData, refetch: refetchUnsubs } = useQuery({
    queryKey: ['unsubscribes'],
    queryFn: () => api.getUnsubscribes(),
    enabled: showUnsubs,
    staleTime: 30_000,
  });
  const addUnsubMut = useMutation({
    mutationFn: (email: string) => api.addUnsubscribe(email),
    onSuccess: () => { refetchUnsubs(); setNewUnsub(''); showToast('Email suppressed'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const removeUnsubMut = useMutation({
    mutationFn: (id: number) => api.removeUnsubscribe(id),
    onSuccess: () => { refetchUnsubs(); showToast('Removed from suppression list'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  // Use useEffect to update local settings when modal opens
  useEffect(() => {
    if (settingsOpen) {
      setLocal(settings);
    }
  }, [settingsOpen, settings]);

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
        <div className="modal-actions">
          <button className="btn" onClick={handleClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Settings</button>
        </div>
      </div>
    </Modal>
  );
}
