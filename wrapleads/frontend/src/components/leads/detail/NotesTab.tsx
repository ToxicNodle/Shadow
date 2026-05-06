import { useState } from 'react';
import type { Lead } from '../../../api/types';
import { useLeads } from '../../../hooks/useLeads';
import { useAppStore } from '../../../store/useAppStore';

interface Props {
  lead: Lead;
}

export default function NotesTab({ lead }: Props) {
  const { updateLead, deleteLead } = useLeads();
  const { setCurrentLeadId, showToast } = useAppStore((s) => ({
    setCurrentLeadId: s.setCurrentLeadId,
    showToast: s.showToast,
  }));
  const [notes, setNotes] = useState(lead.notes);
  const [lastContacted, setLastContacted] = useState(lead.lastContacted?.split('T')[0] ?? '');
  const [confirming, setConfirming] = useState(false);

  function saveNotes() {
    if (lead.serverId) {
      updateLead({ serverId: lead.serverId, patch: { notes } });
    }
  }

  function saveLastContacted(val: string) {
    setLastContacted(val);
    if (lead.serverId) {
      updateLead({ serverId: lead.serverId, patch: { lastContacted: val } });
    }
  }

  function handleDelete() {
    if (!confirming) { setConfirming(true); return; }
    if (lead.serverId) {
      deleteLead(lead.serverId);
      setCurrentLeadId(null);
    } else {
      showToast('Cannot delete unsaved lead', 'error');
    }
    setConfirming(false);
  }

  return (
    <div>
      <div className="field-group">
        <label className="field-label">Last Contacted</label>
        <input
          className="input"
          type="date"
          value={lastContacted}
          onChange={(e) => saveLastContacted(e.target.value)}
        />
      </div>

      <div className="field-group">
        <label className="field-label">Notes</label>
        <textarea
          className="textarea"
          rows={8}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Conversation history, next steps, objections…"
        />
      </div>

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <button
          className="btn"
          style={{ color: confirming ? 'var(--red)' : undefined, borderColor: confirming ? 'rgba(248,113,113,0.4)' : undefined }}
          onClick={handleDelete}
        >
          {confirming ? 'Confirm delete?' : 'Delete Lead'}
        </button>
        {confirming && (
          <button
            className="btn"
            style={{ marginLeft: 8 }}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
