import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

interface Props {
  proposalCount: number;
  closeRate?: number;
}

function fmtK(n: number) {
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

export default function InstallCapacityCard({ proposalCount, closeRate = 0.24 }: Props) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();

  const { data: settingsData } = useQuery({
    queryKey: ['user-settings'],
    queryFn: () => api.getSettings(),
    staleTime: 60_000,
  });

  const settings = settingsData?.settings ?? {};
  const avgInstallDays = parseFloat(String(settings.avgInstallDays ?? '2')) || 2;
  const crewSize = parseInt(String(settings.crewSize ?? '2'), 10) || 2;
  const workingDaysMonth = parseInt(String(settings.workingDaysMonth ?? '20'), 10) || 20;
  const avgDealValue = parseFloat(String(settings.avgDealValue ?? '3500')) || 3500;

  const [draft, setDraft] = useState({ avgInstallDays, crewSize, workingDaysMonth, avgDealValue });

  const saveMut = useMutation({
    mutationFn: () => api.saveSettings({
      ...settings,
      avgInstallDays: String(draft.avgInstallDays),
      crewSize: String(draft.crewSize),
      workingDaysMonth: String(draft.workingDaysMonth),
      avgDealValue: String(draft.avgDealValue),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-settings'] });
      setEditing(false);
    },
  });

  // Capacity math
  const installSlotsPerMonth = Math.floor((crewSize * workingDaysMonth) / avgInstallDays);
  const expectedClose = Math.round(proposalCount * closeRate);
  const expectedRevenue = Math.round(expectedClose * avgDealValue);
  const utilizationPct = installSlotsPerMonth > 0 ? Math.round((expectedClose / installSlotsPerMonth) * 100) : 0;
  const isOverCapacity = expectedClose > installSlotsPerMonth;
  const capacityDelta = installSlotsPerMonth - expectedClose;

  const capacityColor = isOverCapacity
    ? '#ef4444'
    : utilizationPct >= 80
    ? '#f59e0b'
    : '#10b981';

  return (
    <section className="pv-card" style={{ borderTop: `3px solid ${capacityColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <h3 className="pv-card-title" style={{ marginBottom: 0 }}>Install Capacity</h3>
        <button
          className="btn"
          style={{ fontSize: 10, padding: '3px 8px' }}
          onClick={() => { setDraft({ avgInstallDays, crewSize, workingDaysMonth, avgDealValue }); setEditing((e) => !e); }}
        >
          {editing ? 'Cancel' : '⚙ Configure'}
        </button>
      </div>

      {editing && (
        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Avg Install Days / Vehicle
              </label>
              <input
                className="input"
                type="number"
                min={0.5}
                step={0.5}
                value={draft.avgInstallDays}
                onChange={(e) => setDraft((d) => ({ ...d, avgInstallDays: parseFloat(e.target.value) || 2 }))}
                style={{ fontSize: 12 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Crew Size (installers)
              </label>
              <input
                className="input"
                type="number"
                min={1}
                value={draft.crewSize}
                onChange={(e) => setDraft((d) => ({ ...d, crewSize: parseInt(e.target.value) || 1 }))}
                style={{ fontSize: 12 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Working Days / Month
              </label>
              <input
                className="input"
                type="number"
                min={1}
                max={31}
                value={draft.workingDaysMonth}
                onChange={(e) => setDraft((d) => ({ ...d, workingDaysMonth: parseInt(e.target.value) || 20 }))}
                style={{ fontSize: 12 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Avg Deal Value ($)
              </label>
              <input
                className="input"
                type="number"
                min={100}
                step={100}
                value={draft.avgDealValue}
                onChange={(e) => setDraft((d) => ({ ...d, avgDealValue: parseFloat(e.target.value) || 3500 }))}
                style={{ fontSize: 12 }}
              />
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', fontSize: 12, justifyContent: 'center' }}
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* Capacity gauge */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          {
            val: installSlotsPerMonth,
            label: 'install slots/mo',
            sub: `${crewSize} crew × ${workingDaysMonth}d ÷ ${avgInstallDays}d each`,
            color: 'var(--text)',
          },
          {
            val: expectedClose,
            label: 'expected closes',
            sub: `${proposalCount} proposals × ${Math.round(closeRate * 100)}% rate`,
            color: isOverCapacity ? '#ef4444' : '#f59e0b',
          },
          {
            val: Math.abs(capacityDelta),
            label: isOverCapacity ? 'over capacity' : 'buffer slots',
            sub: isOverCapacity ? 'consider subcontracting' : 'room for more',
            color: capacityColor,
          },
        ].map(({ val, label, sub, color }) => (
          <div
            key={label}
            style={{
              textAlign: 'center', padding: '10px 8px',
              background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1, marginBottom: 3 }}>{val}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
            <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Utilization bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Capacity utilization</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: capacityColor }}>{Math.min(utilizationPct, 999)}%</span>
        </div>
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99, transition: 'width 0.4s ease',
            width: `${Math.min(utilizationPct, 100)}%`,
            background: capacityColor,
          }} />
        </div>
        {isOverCapacity && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
            ⚠ Projected to need {expectedClose} installs — {capacityDelta * -1} over capacity. Consider subcontracting or extending timeline.
          </div>
        )}
      </div>

      {/* Revenue expectation */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', background: 'var(--surface)', borderRadius: 8,
        border: '1px solid var(--border)', fontSize: 12,
      }}>
        <span style={{ color: 'var(--text-muted)' }}>Expected close revenue</span>
        <span style={{ fontWeight: 800, color: '#10b981', fontSize: 14 }}>{fmtK(expectedRevenue)}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-faint)' }}>
        {proposalCount} proposals × {Math.round(closeRate * 100)}% close rate × {fmtK(avgDealValue)} avg
      </div>
    </section>
  );
}
