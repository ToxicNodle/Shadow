import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import { scoreLead, scoreLabel } from '../../utils/scoring';

interface CmdItem {
  id: string;
  group: 'lead' | 'action' | 'filter';
  label: string;
  sub?: string;
  icon: ReactNode;
  badge?: { text: string; cls: string };
  action: () => void;
}

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { leads } = useLeads();
  const store = useAppStore();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = query.trim().toLowerCase();

  const leadItems: CmdItem[] = leads
    .filter((l) => {
      if (!q) return true;
      return [l.company, l.contactName, l.email, l.city, l.state].join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => scoreLead(b) - scoreLead(a))
    .slice(0, q ? 7 : 4)
    .map((l) => {
      const s = scoreLead(l);
      const lbl = scoreLabel(s);
      return {
        id: `lead:${l.id}`,
        group: 'lead' as const,
        label: l.company,
        sub: [l.contactName, [l.city, l.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
        icon: '◎',
        badge: { text: String(s), cls: `score-badge score-${lbl}` },
        action: () => { store.setCurrentLeadId(l.id); store.setMode('leads'); onClose(); },
      };
    });

  const ACTIONS: CmdItem[] = [
    { id: 'a:add',       group: 'action', label: 'Add Lead',          sub: 'Create a new lead manually',              icon: '+',  action: () => { store.setAddLeadOpen(true); onClose(); } },
    { id: 'a:import',    group: 'action', label: 'Import CSV',        sub: 'Bulk import leads from a spreadsheet',     icon: '↑',  action: () => { store.setCsvImportOpen(true); onClose(); } },
    { id: 'a:ai-import', group: 'action', label: 'AI Import',         sub: 'Paste any contact list — AI parses it',    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>, action: () => { store.setPasteImportOpen(true); onClose(); } },
    { id: 'a:blueprint', group: 'action', label: 'Scan Blueprint',    sub: 'Extract wrap opportunities from a PDF',    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, action: () => { store.setBlueprintOpen(true); onClose(); } },
    { id: 'a:bulk',      group: 'action', label: 'Bulk AI Email',     sub: 'AI-draft outreach for selected leads',     icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>, action: () => { store.setBulkOutreachOpen(true); onClose(); } },
    { id: 'a:settings',  group: 'action', label: 'Settings',          sub: 'Company profile & API integrations',       icon: '⚙', action: () => { store.setSettingsOpen(true); onClose(); } },
    { id: 'a:discover',  group: 'action', label: 'Discover Carriers', sub: 'Search the FMCSA carrier database',        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>, action: () => { store.setMode('discover'); onClose(); } },
    { id: 'a:kanban',    group: 'action', label: 'Kanban Pipeline',   sub: 'Switch to drag-and-drop board view',       icon: '▦',  action: () => { store.setLeadView('kanban'); store.setMode('leads'); onClose(); } },
    { id: 'a:list',      group: 'action', label: 'List View',         sub: 'Switch to table list view',                icon: '≡',  action: () => { store.setLeadView('list'); store.setMode('leads'); onClose(); } },
  ];

  const FILTERS: CmdItem[] = [
    { id: 'f:cold',     group: 'filter', label: 'Cold Leads',        sub: 'Status: cold — not yet contacted',         icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, action: () => { store.setFilter({ status: 'cold' }); store.setMode('leads'); onClose(); } },
    { id: 'f:replied',  group: 'filter', label: 'Replied',           sub: 'Status: replied — ready to follow up',     icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, action: () => { store.setFilter({ status: 'replied' }); store.setMode('leads'); onClose(); } },
    { id: 'f:proposal', group: 'filter', label: 'Proposals Sent',    sub: 'Status: proposal',                         icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, action: () => { store.setFilter({ status: 'proposal' }); store.setMode('leads'); onClose(); } },
    { id: 'f:won',      group: 'filter', label: 'Won Deals',         sub: 'Status: won',                              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, action: () => { store.setFilter({ status: 'won' }); store.setMode('leads'); onClose(); } },
    { id: 'f:fleet',    group: 'filter', label: 'Fleet / Logistics', sub: 'Category: fleet wraps',                    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>, action: () => { store.setFilter({ category: 'fleet' }); store.setMode('leads'); onClose(); } },
    { id: 'f:dinoc',    group: 'filter', label: 'DI-NOC Leads',      sub: 'Category: architectural film',             icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, action: () => { store.setFilter({ category: 'dinoc' }); store.setMode('leads'); onClose(); } },
    { id: 'f:clear',    group: 'filter', label: 'Clear All Filters', sub: 'Show every lead',                          icon: '✕',  action: () => { store.resetFilters(); onClose(); } },
  ];

  const filt = (items: CmdItem[]) =>
    q ? items.filter((i) => i.label.toLowerCase().includes(q) || (i.sub?.toLowerCase().includes(q) ?? false)) : items;

  const visActions = filt(ACTIONS);
  const visFilters = filt(FILTERS);
  const allItems = [...leadItems, ...visActions, ...visFilters];

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      allItems[cursor]?.action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  function renderGroup(items: CmdItem[], startIdx: number, title: string) {
    if (items.length === 0) return null;
    return (
      <>
        <div className="cmd-group-label">{title}</div>
        {items.map((item, i) => {
          const idx = startIdx + i;
          return (
            <button
              key={item.id}
              className={`cmd-item${idx === cursor ? ' active' : ''}`}
              onClick={item.action}
              onMouseMove={() => setCursor(idx)}
            >
              <span className="cmd-icon">{item.icon}</span>
              <span className="cmd-label">{item.label}</span>
              {item.sub && <span className="cmd-sub">{item.sub}</span>}
              {item.badge && <span className={item.badge.cls} style={{ fontSize: 10, marginLeft: 'auto', flexShrink: 0 }}>{item.badge.text}</span>}
            </button>
          );
        })}
      </>
    );
  }

  return (
    <div className="cmd-backdrop" onMouseDown={onClose}>
      <div className="cmd-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmd-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="cmd-input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search leads, run actions…"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              className="cmd-clear"
              onClick={() => { setQuery(''); setCursor(0); inputRef.current?.focus(); }}
            >
              ✕
            </button>
          )}
        </div>

        <div className="cmd-results">
          {allItems.length === 0 && (
            <div className="cmd-no-results">No results for "{query}"</div>
          )}
          {renderGroup(leadItems, 0, q ? 'Leads' : 'Top Leads')}
          {renderGroup(visActions, leadItems.length, 'Actions')}
          {renderGroup(visFilters, leadItems.length + visActions.length, 'Filters')}
        </div>

        <div className="cmd-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> dismiss</span>
        </div>
      </div>
    </div>
  );
}
