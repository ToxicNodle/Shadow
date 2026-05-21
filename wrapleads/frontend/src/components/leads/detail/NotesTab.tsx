import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Lead } from '../../../api/types';
import { useLeads } from '../../../hooks/useLeads';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../api/client';

// ── AI Notes Brief ────────────────────────────────────────────────────────────
function AINotesBrief({ lead }: { lead: Lead }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const showToast = useAppStore((s) => s.showToast);

  async function generate() {
    if (!lead.serverId) return;
    setLoading(true);
    try {
      const res = await api.getNotesSummary(lead.serverId);
      setSummary(res.summary);
    } catch (e: unknown) {
      showToast((e as Error).message || 'No notes to summarize', 'error');
    } finally {
      setLoading(false);
    }
  }

  if (!lead.serverId) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      {!summary ? (
        <button
          onClick={generate}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 7, border: '1px solid #8b5cf633', background: '#8b5cf608', color: '#8b5cf6', cursor: loading ? 'default' : 'pointer', fontWeight: 600 }}
        >
          {loading ? (
            <><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #8b5cf6', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />Summarizing…</>
          ) : (
            <><span>✨</span> AI Brief — summarize all notes</>
          )}
        </button>
      ) : (
        <div style={{ padding: '12px 14px', background: '#8b5cf611', border: '1px solid #8b5cf633', borderRadius: 9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: 0.5 }}>✨ AI Brief</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => navigator.clipboard.writeText(summary).then(() => showToast('Brief copied'))} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: '1px solid #8b5cf6', background: 'none', color: '#8b5cf6', cursor: 'pointer' }}>Copy</button>
              <button onClick={() => setSummary(null)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{summary}</p>
        </div>
      )}
    </div>
  );
}

interface Props {
  lead: Lead;
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function NotesTab({ lead }: Props) {
  const qc = useQueryClient();
  const { updateLead, deleteLead } = useLeads();
  const { setCurrentLeadId, showToast } = useAppStore((s) => ({
    setCurrentLeadId: s.setCurrentLeadId,
    showToast: s.showToast,
  }));

  const [notes, setNotes] = useState(lead.notes);
  const [lastContacted, setLastContacted] = useState(lead.lastContacted?.split('T')[0] ?? '');
  const [confirming, setConfirming] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const quickRef = useRef<HTMLTextAreaElement>(null);

  const { data: actData } = useQuery({
    queryKey: ['activities', lead.serverId],
    queryFn: () => api.getActivities(lead.serverId!),
    enabled: !!lead.serverId,
    staleTime: 30_000,
  });

  const journalEntries = (actData?.activities ?? []).filter((a) => a.type === 'note_added');

  const addNoteMut = useMutation({
    mutationFn: (body: string) =>
      api.logActivity(lead.serverId!, { type: 'note_added', subject: 'Note', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', lead.serverId] });
      setQuickNote('');
      quickRef.current?.focus();
    },
    onError: () => showToast('Could not save note', 'error'),
  });

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

  function handleQuickNoteKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && quickNote.trim()) {
      addNoteMut.mutate(quickNote.trim());
    }
  }

  return (
    <div>
      {/* Quick-add note */}
      <div className="note-journal-add">
        <textarea
          ref={quickRef}
          className="input"
          rows={2}
          placeholder="Add a timestamped note… (⌘↵ to save)"
          value={quickNote}
          onChange={(e) => setQuickNote(e.target.value)}
          onKeyDown={handleQuickNoteKey}
          style={{ resize: 'vertical', fontSize: 13 }}
        />
        <button
          className="btn btn-primary"
          style={{ fontSize: 12, alignSelf: 'flex-end', marginTop: 6 }}
          disabled={!quickNote.trim() || addNoteMut.isPending || !lead.serverId}
          onClick={() => addNoteMut.mutate(quickNote.trim())}
        >
          {addNoteMut.isPending ? 'Saving…' : 'Add Note'}
        </button>
      </div>

      {/* Timestamped journal feed */}
      {journalEntries.length > 0 && (
        <div className="note-journal-feed">
          {journalEntries.map((entry) => (
            <div key={entry.id} className="note-journal-entry">
              <div className="note-journal-meta">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: 'var(--accent)' }}>
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <span title={formatDate(entry.created_at)}>{timeAgo(entry.created_at)}</span>
              </div>
              <div className="note-journal-body">{entry.body}</div>
            </div>
          ))}
        </div>
      )}

      {journalEntries.length === 0 && lead.serverId && (
        <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '8px 0 16px', textAlign: 'center' }}>
          No journal notes yet — add one above
        </p>
      )}

      <AINotesBrief lead={lead} />

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 8 }}>
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
          <label className="field-label">Pinned Notes</label>
          <textarea
            className="textarea"
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Persistent notes — contact history, objections, key details…"
          />
        </div>
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
