import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { useAppStore } from '../../../store/useAppStore';
import type { Lead } from '../../../api/types';

interface Contact {
  id: number;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
}

interface FormState {
  name: string;
  title: string;
  email: string;
  phone: string;
  is_primary: boolean;
  notes: string;
}

const EMPTY_FORM: FormState = { name: '', title: '', email: '', phone: '', is_primary: false, notes: '' };

function ContactRow({ c, leadId, onEdit }: { c: Contact; leadId: number; onEdit: (c: Contact) => void }) {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);

  const delMut = useMutation({
    mutationFn: () => api.deleteLeadContact(leadId, c.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-contacts', leadId] });
      showToast('Contact removed');
    },
  });

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      border: `1px solid ${c.is_primary ? 'var(--accent)' : 'var(--border)'}`,
      background: c.is_primary ? 'rgba(244,85,28,0.06)' : 'var(--surface)',
      marginBottom: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.name}</span>
            {c.is_primary && (
              <span style={{
                fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--accent)', padding: '1px 5px', border: '1px solid var(--accent)', borderRadius: 4,
              }}>Primary</span>
            )}
            {c.title && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.title}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {c.email && (
              <a href={`mailto:${c.email}`} style={{ fontSize: 11, color: '#4d8af5', textDecoration: 'none' }}>
                ✉ {c.email}
              </a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone}`} style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none' }}>
                📞 {c.phone}
              </a>
            )}
          </div>
          {c.notes && (
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, fontStyle: 'italic' }}>{c.notes}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
          <button
            onClick={() => onEdit(c)}
            style={{
              padding: '3px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--bg-elev)', color: 'var(--text-muted)',
            }}
          >
            Edit
          </button>
          <button
            onClick={() => { if (confirm(`Remove ${c.name}?`)) delMut.mutate(); }}
            disabled={delMut.isPending}
            style={{
              padding: '3px 6px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'transparent', color: '#ef4444',
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactForm({
  leadId,
  initial,
  onSave,
  onCancel,
}: {
  leadId: number;
  initial: FormState & { id?: number };
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    name: initial.name,
    title: initial.title,
    email: initial.email,
    phone: initial.phone,
    is_primary: initial.is_primary,
    notes: initial.notes,
  });
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);

  const addMut = useMutation({
    mutationFn: () => api.addLeadContact(leadId, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead-contacts', leadId] }); showToast('Contact added'); onSave(); },
  });

  const editMut = useMutation({
    mutationFn: () => api.updateLeadContact(leadId, initial.id!, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead-contacts', leadId] }); showToast('Contact updated'); onSave(); },
  });

  const isPending = addMut.isPending || editMut.isPending;

  function submit() {
    if (!form.name.trim()) return;
    if (initial.id) editMut.mutate(); else addMut.mutate();
  }

  const inp = (label: string, field: keyof Omit<FormState, 'is_primary'>, placeholder = '') => (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', display: 'block', marginBottom: 3 }}>
        {label}
      </label>
      <input
        className="input"
        value={form[field] as string}
        onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
        placeholder={placeholder}
        style={{ width: '100%', fontSize: 12 }}
      />
    </div>
  );

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
        {initial.id ? 'Edit Contact' : 'Add Contact'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
        {inp('Name *', 'name', 'Full name')}
        {inp('Title / Role', 'title', 'Fleet Manager, VP Ops…')}
        {inp('Email', 'email', 'work@company.com')}
        {inp('Phone', 'phone', '+1 (555) 000-0000')}
      </div>
      {inp('Notes', 'notes', 'Best time to reach, decision authority…')}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input
          type="checkbox"
          id="is-primary-cb"
          checked={form.is_primary}
          onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
          style={{ cursor: 'pointer' }}
        />
        <label htmlFor="is-primary-cb" style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
          Primary contact (used for email outreach)
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={submit}
          disabled={isPending || !form.name.trim()}
          style={{
            flex: 1, padding: '8px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: 'none', background: 'var(--accent)', color: '#fff',
          }}
        >
          {isPending ? 'Saving…' : initial.id ? 'Save Changes' : 'Add Contact'}
        </button>
        <button
          onClick={onCancel}
          style={{ padding: '8px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ContactsPanel({ lead }: { lead: Lead }) {
  const [showForm, setShowForm] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['lead-contacts', lead.serverId],
    queryFn: () => api.getLeadContacts(lead.serverId!),
    enabled: !!lead.serverId,
    staleTime: 60_000,
  });

  if (!lead.serverId) return null;

  const contacts = data?.contacts ?? [];

  function handleEdit(c: Contact) {
    setEditContact(c);
    setShowForm(false);
  }

  function handleSave() {
    setShowForm(false);
    setEditContact(null);
  }

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)' }}>
          Contacts
          {contacts.length > 0 && (
            <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontWeight: 600 }}>{contacts.length}</span>
          )}
        </div>
        {!showForm && !editContact && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)',
            }}
          >
            + Add
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <ContactForm
          leadId={lead.serverId!}
          initial={{ ...EMPTY_FORM }}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Edit form */}
      {editContact && (
        <ContactForm
          leadId={lead.serverId!}
          initial={{
            id: editContact.id,
            name: editContact.name,
            title: editContact.title ?? '',
            email: editContact.email ?? '',
            phone: editContact.phone ?? '',
            is_primary: editContact.is_primary,
            notes: editContact.notes ?? '',
          }}
          onSave={handleSave}
          onCancel={() => setEditContact(null)}
        />
      )}

      {/* Contact list */}
      {isLoading && (
        <div style={{ color: 'var(--text-faint)', fontSize: 12, padding: '8px 0' }}>Loading…</div>
      )}
      {!isLoading && contacts.length === 0 && !showForm && (
        <div style={{ color: 'var(--text-faint)', fontSize: 12, padding: '6px 0', fontStyle: 'italic' }}>
          No contacts added yet. Fleet deals often have 2-3 decision makers.
        </div>
      )}
      {contacts.map((c) => (
        <ContactRow key={c.id} c={c} leadId={lead.serverId!} onEdit={handleEdit} />
      ))}
    </div>
  );
}
