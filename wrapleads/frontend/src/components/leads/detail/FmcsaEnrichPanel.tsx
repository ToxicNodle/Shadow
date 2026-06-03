import { useState } from 'react';
import type { Lead } from '../../../api/types';
import { api } from '../../../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../../store/useAppStore';

interface Props {
  lead: Lead;
  onPhoneFound: (phone: string) => void;
}

export default function FmcsaEnrichPanel({ lead, onPhoneFound }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    phone: string | null;
    safetyRating: string | null;
    operatingStatus: string | null;
    legalName: string | null;
  } | null>(null);
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);

  async function fetch() {
    if (!lead.serverId) return;
    setLoading(true);
    try {
      const data = await api.enrichFmcsa(lead.serverId);
      setResult({
        phone: data.phone,
        safetyRating: data.safetyRating,
        operatingStatus: data.operatingStatus,
        legalName: data.legalName,
      });
      if (data.phone) {
        onPhoneFound(data.phone);
        showToast(`Phone found via FMCSA: ${data.phone}`, 'success');
      } else {
        showToast('No phone number on file with FMCSA for this carrier', 'info');
      }
      qc.invalidateQueries({ queryKey: ['lead-activities', lead.serverId] });
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  if (result && !result.phone) {
    return (
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        FMCSA: no phone on record
        {result.safetyRating && ` · Safety: ${result.safetyRating}`}
        {result.operatingStatus && ` · ${result.operatingStatus}`}
      </div>
    );
  }

  if (result?.phone) return null;

  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={fetch}
        disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
          padding: '3px 10px', borderRadius: 5, border: '1px solid #4d8af540',
          background: '#4d8af508', color: '#4d8af5', cursor: 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
        title="Look up phone number from FMCSA SAFER carrier registry (free)"
      >
        {loading ? (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Fetching FMCSA data…
          </>
        ) : (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            Fetch phone from FMCSA registry
          </>
        )}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
