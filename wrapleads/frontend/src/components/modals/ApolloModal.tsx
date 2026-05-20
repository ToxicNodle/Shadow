import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useLeads } from '../../hooks/useLeads';
import { api } from '../../api/client';
import Modal from '../ui/Modal';

interface Candidate {
  name: string;
  title?: string;
  email?: string;
  emailStatus?: string;
  linkedinUrl?: string;
}

export default function ApolloModal() {
  const { apolloOpen, setApolloOpen, apolloLeadId, settings, showToast } = useAppStore((s) => ({
    apolloOpen: s.apolloOpen,
    setApolloOpen: s.setApolloOpen,
    apolloLeadId: s.apolloLeadId,
    settings: s.settings,
    showToast: s.showToast,
  }));
  const { leads, updateLead } = useLeads();

  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searched, setSearched] = useState(false);

  const lead = leads.find((l) => l.id === apolloLeadId);

  if (!apolloOpen || !lead) return null;

  function handleClose() {
    setApolloOpen(false);
    setCandidates([]);
    setSearched(false);
  }

  async function search() {
    if (!settings.apolloApiKey) {
      showToast('Add your Apollo API key in Settings', 'error');
      return;
    }
    setLoading(true);
    try {
      const { people } = await api.apolloSearch({
        apiKey: settings.apolloApiKey,
        company: lead!.company,
        domain: lead!.website || undefined,
        titles: ['Owner', 'CEO', 'President', 'VP', 'Fleet Manager', 'Operations Manager'],
        limit: 10,
      });
      setCandidates(people as Candidate[]);
      setSearched(true);
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function enrich(candidate: Candidate) {
    if (!settings.apolloApiKey || !candidate.name) return;
    const [firstName, ...rest] = candidate.name.split(' ');
    const lastName = rest.join(' ');
    try {
      const { person } = await api.apolloEnrich({
        apiKey: settings.apolloApiKey,
        firstName,
        lastName,
        company: lead!.company,
        domain: lead!.website || undefined,
      });
      if (person.email && lead!.serverId) {
        updateLead({ serverId: lead!.serverId, patch: { email: person.email, contactName: candidate.name } });
        showToast(`Email found: ${person.email}`);
        handleClose();
      } else {
        showToast('Could not retrieve email', 'error');
      }
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    }
  }

  function selectCandidate(c: Candidate) {
    if (c.email && lead!.serverId) {
      updateLead({ serverId: lead!.serverId, patch: { email: c.email, contactName: c.name } });
      showToast(`Email set: ${c.email}`);
      handleClose();
    } else {
      enrich(c);
    }
  }

  return (
    <Modal title={`Find Contact — ${lead.company}`} onClose={handleClose}>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
        Search Apollo for decision-makers at this company.
      </p>

      <button className="apollo-find-btn" onClick={search} disabled={loading}>
        {loading ? <><span className="spinner" /> Searching…</> : 'Search Apollo'}
      </button>

      {searched && candidates.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
          No contacts found. Try adjusting the company name.
        </div>
      )}

      {candidates.map((c, i) => (
        <div key={i} className="apollo-candidate">
          <div className="apollo-candidate-info">
            <div className="apollo-candidate-name">{c.name}</div>
            {c.title && <div className="apollo-candidate-title">{c.title}</div>}
            <div className="apollo-candidate-meta">
              {c.email && <span>{c.email}</span>}
              {c.emailStatus && (
                <span className={`email-status ${c.emailStatus}`}>{c.emailStatus}</span>
              )}
              {c.linkedinUrl && (
                <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn</a>
              )}
            </div>
          </div>
          <button className="btn" onClick={() => selectCandidate(c)}>
            {c.email ? 'Use Email' : 'Find Email'}
          </button>
        </div>
      ))}

      <div className="modal-actions">
        <button className="btn" onClick={handleClose}>Close</button>
      </div>
    </Modal>
  );
}
