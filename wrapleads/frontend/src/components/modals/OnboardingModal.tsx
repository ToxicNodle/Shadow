import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import { SEED_LEADS } from '../../data/seedLeads';

interface Props {
  onClose: () => void;
}

export default function OnboardingModal({ onClose }: Props) {
  const qc = useQueryClient();
  const { setSettingsOpen, showToast } = useAppStore((s) => ({
    setSettingsOpen: s.setSettingsOpen,
    showToast: s.showToast,
  }));
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);

  async function loadSampleLeads() {
    setLoading(true);
    try {
      const result = await api.syncLeads(SEED_LEADS);
      await qc.invalidateQueries({ queryKey: ['leads'] });
      showToast(`${result.inserted} sample leads loaded`);
      setStep(2);
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function openSettings() {
    onClose();
    setSettingsOpen(true);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 500, textAlign: 'center' }}>
        {step === 1 ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>👋</div>
            <div className="modal-title" style={{ textAlign: 'center' }}>
              Welcome to WrapLeads
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 24 }}>
              You're all set to start finding wrap clients. We've prepared <strong style={{ color: 'var(--text)' }}>{SEED_LEADS.length} sample leads</strong> — fleet
              companies, DI-NOC targets, color change prospects, wall graphics clients, and GC referral partners — to show you how the pipeline works.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn-primary"
                style={{ justifyContent: 'center', padding: '12px', fontSize: 15 }}
                onClick={loadSampleLeads}
                disabled={loading}
              >
                {loading ? <><span className="spinner" /> Loading…</> : `📋 Load ${SEED_LEADS.length} Sample Leads`}
              </button>
              <button className="btn" style={{ justifyContent: 'center' }} onClick={() => setStep(2)}>
                Skip — I'll add my own leads
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚙️</div>
            <div className="modal-title" style={{ textAlign: 'center' }}>
              One more thing
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 8 }}>
              To get the best AI-generated emails, add your sender details in Settings —
              your name, company, and email address.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.5, marginBottom: 24 }}>
              You can always do this later from the gear icon in the top right.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn-primary"
                style={{ justifyContent: 'center', padding: '12px', fontSize: 15 }}
                onClick={openSettings}
              >
                Open Settings
              </button>
              <button className="btn" style={{ justifyContent: 'center' }} onClick={onClose}>
                I'll do it later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
