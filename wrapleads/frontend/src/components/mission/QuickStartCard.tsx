import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

interface Props {
  leadCount: number;
}

export default function QuickStartCard({ leadCount }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const setMode = useAppStore((s) => s.setMode);
  const qc = useQueryClient();
  const [state, setState] = useState('');
  const [minFleet, setMinFleet] = useState('20');
  const [maxFleet, setMaxFleet] = useState('200');
  const [withSequences, setWithSequences] = useState(true);
  const [step, setStep] = useState<'setup' | 'running' | 'done'>('setup');
  const [result, setResult] = useState<{ imported: number; sequenced: number; opportunityValue: number } | null>(null);

  const launchMut = useMutation({
    mutationFn: async () => {
      setStep('running');
      // 1. Search top 10 carriers
      const searchResult = await api.searchCarriers({
        states: state ? [state] : undefined,
        minFleet: parseInt(minFleet) || 20,
        maxFleet: parseInt(maxFleet) || 200,
        limit: 10,
        sort: 'score',
      });
      const carriers = searchResult.results.filter((c) => !c.already_imported);
      if (!carriers.length) throw new Error('No new carriers found for those filters — try a different state or fleet range');

      // 2. Import them
      const leadIds: number[] = [];
      for (const c of carriers.slice(0, 10)) {
        try {
          const r = await api.importCarrier(c.id);
          if (r.leadId) leadIds.push(r.leadId);
        } catch { /* skip duplicates */ }
      }

      // 3. Optionally activate sequences
      let sequenced = 0;
      if (withSequences && leadIds.length) {
        try {
          const r = await api.bulkActivateSequences(leadIds);
          sequenced = r.queued ?? 0;
        } catch { /* sequences optional */ }
      }

      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['mission'] });

      const opportunityValue = carriers.slice(0, leadIds.length).reduce(
        (sum, c) => sum + (c.fleet_size ?? 30) * 3200, 0
      );

      return { imported: leadIds.length, sequenced, opportunityValue };
    },
    onSuccess: (data) => {
      setResult(data);
      setStep('done');
    },
    onError: (e: Error) => {
      showToast(e.message, 'error');
      setStep('setup');
    },
  });

  if (leadCount >= 5) return null;

  if (step === 'done' && result) {
    return (
      <section className="mission-card" style={{ border: '1px solid #10b98140', background: 'linear-gradient(135deg, #10b98108, #10b98103)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>🎉</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981' }}>You're off to a great start!</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {result.imported} fleet leads imported · {result.sequenced} email sequences queued
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, background: 'var(--bg-elev)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#10b981' }}>{result.imported}</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>leads added</div>
          </div>
          <div style={{ flex: 1, background: 'var(--bg-elev)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#4d8af5' }}>{result.sequenced}</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>emails queued</div>
          </div>
          <div style={{ flex: 1, background: 'var(--bg-elev)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent)' }}>
              ${Math.round(result.opportunityValue / 1000)}K
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>est. opportunity</div>
          </div>
        </div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setMode('leads')}>
          View My Leads →
        </button>
      </section>
    );
  }

  if (step === 'running') {
    return (
      <section className="mission-card" style={{ border: '1px solid rgba(77,138,245,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="spinner" style={{ width: 18, height: 18, borderColor: 'rgba(77,138,245,.3)', borderTopColor: '#4d8af5' }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Finding your first prospects…</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Searching FMCSA database, importing leads, generating sequences</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mission-card" style={{ border: '1px solid rgba(77,138,245,.25)', background: 'linear-gradient(135deg, rgba(77,138,245,.05), transparent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>🚀</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Find Your First 10 Prospects</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>WrapOS will search the FMCSA fleet database and launch personalized outreach — in about 30 seconds.</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: '1 1 120px', minWidth: 0 }}>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>State</label>
          <select
            className="input"
            style={{ fontSize: 12, padding: '5px 8px', width: '100%' }}
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">Any state</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 80px', minWidth: 0 }}>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>Min Fleet</label>
          <input
            className="input"
            type="number"
            min={5}
            style={{ fontSize: 12, padding: '5px 8px', width: '100%' }}
            value={minFleet}
            onChange={(e) => setMinFleet(e.target.value)}
          />
        </div>
        <div style={{ flex: '1 1 80px', minWidth: 0 }}>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>Max Fleet</label>
          <input
            className="input"
            type="number"
            min={5}
            style={{ fontSize: 12, padding: '5px 8px', width: '100%' }}
            value={maxFleet}
            onChange={(e) => setMaxFleet(e.target.value)}
          />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={withSequences}
          onChange={(e) => setWithSequences(e.target.checked)}
        />
        Auto-launch personalized email sequences for each lead
      </label>
      <button
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #4d8af5, #6366f1)', border: 'none' }}
        onClick={() => launchMut.mutate()}
        disabled={launchMut.isPending}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Find 10 Prospects & Launch Campaign
      </button>
    </section>
  );
}
