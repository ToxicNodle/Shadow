import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';
import type { Lead } from '../../../api/types';

function UnsubscribedBadge({ leadId }: { leadId: number }) {
  const { data } = useQuery({
    queryKey: ['unsub-status', leadId],
    queryFn: () => api.getUnsubscribeStatus(leadId),
  });
  if (data?.unsubscribed) return <span style={{ fontSize: 10, background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: 3 }}>Unsubscribed</span>;
  return null;
}

export default function InfoTab({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const { showToast } = useAppStore((s) => ({ showToast: s.showToast }));

  // ── State ──
  const [customNote, setCustomNote] = useState('');
  const [snoozeLead, setSnoozeLead] = useState(false);
  const [snoozeUntil, setSnoozeUntil] = useState<string | null>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateSaved, setTemplateSaved] = useState(false);
  const [msg, setMsg] = useState('');

  // ── All mutations declared unconditionally at top level ──
  const createProposalMut = useMutation({
    mutationFn: () => api.createProposal(lead.serverId!, customNote),
    onSuccess: (data) => { setProposal(data); setCustomNote(''); },
  });

  const createProposalFromTemplateMut = useMutation({
    mutationFn: (templateId: number) => api.createProposalFromTemplate(lead.serverId!, templateId),
    onSuccess: (data) => setProposal(data),
  });

  const saveProposalTemplateMut = useMutation({
    mutationFn: () => api.saveProposalAsTemplate(proposal!.id, templateName.trim(), lead.category || undefined),
    onSuccess: () => { setTemplateSaved(true); setShowSaveTemplate(false); setTemplateName(''); setTimeout(() => setTemplateSaved(false), 3000); },
  });

  const updateProposalStatusMut = useMutation({
    mutationFn: (status: string) => api.updateProposal(proposal!.id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proposals'] }); showToast('Proposal updated'); },
  });

  const updateProposalExpiresMut = useMutation({
    mutationFn: (expires_at: string | null) => api.updateProposal(proposal!.id, { expires_at }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proposals'] }); showToast('Expiry updated'); },
  });

  const createJobFromProposalMut = useMutation({
    mutationFn: () => api.createJobFromProposal(proposal!.id),
    onSuccess: () => { showToast('Job created!'); qc.invalidateQueries({ queryKey: ['jobs'] }); },
  });

  const sendSmsMut = useMutation({
    mutationFn: (smsMsg: string) => api.sendSms(lead.serverId!, smsMsg),
    onSuccess: () => { showToast('SMS sent!'); setMsg(''); },
  });

  const snoozeLeadMut = useMutation({
    mutationFn: (until: string | null) => api.snoozeLead(lead.serverId!, until),
    onSuccess: () => { setSnoozeLead(false); setSnoozeUntil(null); showToast('Lead snoozed!'); },
  });

  // ── Queries ──
  const { data: proposalTemplates } = useQuery({
    queryKey: ['proposal-templates'],
    queryFn: () => api.getProposalTemplates(),
  });

  const { data: proposalViewCount } = useQuery({
    queryKey: ['proposal-views', proposal?.id],
    queryFn: () => api.getProposalViewCount(proposal!.id),
    enabled: !!proposal?.id,
  });

  const { data: proposalVersions } = useQuery({
    queryKey: ['proposal-versions', proposal?.id],
    queryFn: () => api.getProposalVersions(proposal!.id),
    enabled: !!proposal?.id,
  });

  const { data: leadTags } = useQuery({
    queryKey: ['lead-tags'],
    queryFn: () => api.getLeadTags(),
  });

  const { data: heatScore } = useQuery({
    queryKey: ['heat-score', lead.id],
    queryFn: () => api.getHeatScore(lead.id),
  });

  return (
    <div style={{ padding: '20px', fontSize: 13 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Lead Info</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Company</label>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{lead.company}</div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Category</label>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{lead.category}</div>
          </div>
        </div>
      </div>

      <UnsubscribedBadge leadId={lead.id} />

      {heatScore && (
        <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-input)', borderRadius: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600 }}>Heat Score: {heatScore.score}/100</div>
        </div>
      )}

      <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => createProposalMut.mutate()} disabled={createProposalMut.isPending}>
          {createProposalMut.isPending ? 'Creating...' : 'New Proposal'}
        </button>
        <button className="btn" onClick={() => setSnoozeLead(!snoozeLead)}>
          Snooze
        </button>
      </div>

      {snoozeLead && (
        <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-input)', borderRadius: 6 }}>
          <input 
            type="datetime-local" 
            value={snoozeUntil || ''} 
            onChange={(e) => setSnoozeUntil(e.target.value)} 
            style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid var(--border)' }} 
          />
          <button 
            className="btn btn-primary" 
            style={{ marginTop: 8, width: '100%' }} 
            onClick={() => snoozeLeadMut.mutate(snoozeUntil)}
            disabled={snoozeLeadMut.isPending}
          >
            {snoozeLeadMut.isPending ? 'Snoozing...' : 'Confirm'}
          </button>
        </div>
      )}

      {proposal && (
        <div style={{ marginTop: 20, padding: 12, background: 'var(--bg-input)', borderRadius: 6 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>Proposal</h4>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID: {proposal.id}</div>
          {proposalViewCount && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Views: {proposalViewCount.views}</div>}
          <button className="btn btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={() => createJobFromProposalMut.mutate()} disabled={createJobFromProposalMut.isPending}>
            {createJobFromProposalMut.isPending ? 'Creating Job...' : 'Create Job'}
          </button>
        </div>
      )}
    </div>
  );
}
