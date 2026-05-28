import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLeads } from '../../hooks/useLeads';
import { useAppStore } from '../../store/useAppStore';
import { scoreLead, scoreLabel } from '../../utils/scoring';
import { api } from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';

interface CmdItem {
  id: string;
  group: 'lead' | 'recent' | 'overdue' | 'status' | 'action' | 'nav' | 'filter';
  label: string;
  sub?: string;
  icon: ReactNode;
  badge?: { text: string; cls: string };
  shortcut?: string;
  action: () => void;
}

// ─── Recent leads localStorage helpers ───────────────────────────────────────
function getRecentIds(): string[] {
  try { return JSON.parse(localStorage.getItem('wl_recent_leads') || '[]'); } catch { return []; }
}
function pushRecentId(id: string) {
  const next = [id, ...getRecentIds().filter((x) => x !== id)].slice(0, 6);
  localStorage.setItem('wl_recent_leads', JSON.stringify(next));
}

// ─── Status-change command parser ("won Acme", "replied Jones Trucking") ─────
const STATUS_CMDS: Record<string, string> = {
  won: 'won', lost: 'lost', replied: 'replied',
  contacted: 'contacted', proposal: 'proposal', meeting: 'meeting', new: 'new',
};
const STATUS_LABEL: Record<string, string> = {
  won: 'Won', lost: 'Lost', replied: 'Replied',
  contacted: 'Contacted', proposal: 'Proposal Sent', meeting: 'Meeting Set', new: 'New',
};
function parseStatusCmd(q: string): { status: string; search: string } | null {
  const parts = q.split(' ');
  const cmd = STATUS_CMDS[parts[0]];
  if (!cmd || parts.length < 2) return null;
  return { status: cmd, search: parts.slice(1).join(' ').toLowerCase() };
}

type DotResult = { name: string; city: string | null; state: string | null; fleetSize: number | null; wrapScore: number; alreadyInCrm: boolean; id: number } | null;

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { leads } = useLeads();
  const store = useAppStore();
  const qc = useQueryClient();
  const [dotLoading, setDotLoading] = useState(false);
  const [dotResult, setDotResult] = useState<DotResult>(null);
  const [dotError, setDotError] = useState<string | null>(null);
  const dotQueryRef = useRef<string>('');

  // NL lead search state
  type NlResult = { id: number; name: string; city: string | null; state: string | null; fleet_size: number | null; wrap_score: number; already_imported: boolean };
  const [nlLoading, setNlLoading] = useState(false);
  const [nlResults, setNlResults] = useState<NlResult[] | null>(null);
  const [nlTotal, setNlTotal] = useState(0);
  const [nlExplanation, setNlExplanation] = useState('');
  const nlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nlQueryRef = useRef('');

  useEffect(() => { inputRef.current?.focus(); }, []);

  // ── DOT number lookup ─────────────────────────────────────────────────────
  const rawQuery = query.trim();
  // Detect: "dot 1234567", "DOT: 1234567", or bare 7-9 digit number
  const dotMatch = rawQuery.match(/^(?:dot[:\s]+)?(\d{7,9})$/i);
  const isDotQuery = Boolean(dotMatch);
  const dotNumber = dotMatch ? dotMatch[1] : null;

  // ── Natural language lead search detection ────────────────────────────────
  // Triggers when query starts with "find ", "search ", "show me " + has 3+ words
  const nlMatch = rawQuery.match(/^(?:find|search|show\s+me|look\s+for)\s+(.{8,})/i);
  const isNlSearch = Boolean(nlMatch) && !isDotQuery;
  const nlSearchQuery = nlMatch ? rawQuery : null;

  useEffect(() => {
    if (!dotNumber) {
      setDotResult(null);
      setDotError(null);
      dotQueryRef.current = '';
      return;
    }
    if (dotQueryRef.current === dotNumber) return;
    dotQueryRef.current = dotNumber;
    setDotLoading(true);
    setDotResult(null);
    setDotError(null);
    api.lookupByDot(dotNumber)
      .then((res) => {
        if (dotQueryRef.current === dotNumber) setDotResult(res.carrier);
      })
      .catch((err: Error) => {
        if (dotQueryRef.current === dotNumber) setDotError(err.message ?? 'Not found');
      })
      .finally(() => {
        if (dotQueryRef.current === dotNumber) setDotLoading(false);
      });
  }, [dotNumber]);

  // NL search: debounced trigger on query change
  useEffect(() => {
    if (!nlSearchQuery) {
      setNlResults(null);
      setNlExplanation('');
      nlQueryRef.current = '';
      return;
    }
    if (nlTimerRef.current) clearTimeout(nlTimerRef.current);
    nlTimerRef.current = setTimeout(() => {
      if (nlQueryRef.current === nlSearchQuery) return;
      nlQueryRef.current = nlSearchQuery;
      setNlLoading(true);
      setNlResults(null);
      api.nlLeadSearch(nlSearchQuery)
        .then((res) => {
          if (nlQueryRef.current === nlSearchQuery) {
            setNlResults(res.results);
            setNlTotal(res.total);
            setNlExplanation(res.parsedIntent.explanation || '');
          }
        })
        .catch(() => { if (nlQueryRef.current === nlSearchQuery) setNlResults([]); })
        .finally(() => { if (nlQueryRef.current === nlSearchQuery) setNlLoading(false); });
    }, 600);
    return () => { if (nlTimerRef.current) clearTimeout(nlTimerRef.current); };
  }, [nlSearchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();

  // ── Recent leads (shown when query is empty) ──────────────────────────────
  const recentIds = getRecentIds();
  const recentItems: CmdItem[] = !q
    ? recentIds
        .map((rid) => leads.find((l) => String(l.id) === rid))
        .filter(Boolean)
        .slice(0, 5)
        .map((l) => {
          const s = scoreLead(l!);
          const lbl = scoreLabel(s);
          return {
            id: `recent:${l!.id}`,
            group: 'recent' as const,
            label: l!.company,
            sub: [l!.contactName, [l!.city, l!.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
            icon: '◴',
            badge: { text: String(s), cls: `score-badge score-${lbl}` },
            action: () => {
              pushRecentId(String(l!.id));
              store.setCurrentLeadId(l!.id);
              store.setMode('leads');
              onClose();
            },
          };
        })
    : [];

  // ── Overdue leads (shown when query is empty) ─────────────────────────────
  const now = Date.now();
  const overdueItems: CmdItem[] = !q
    ? leads
        .filter((l) => l.followupDueAt && new Date(l.followupDueAt).getTime() < now && !['won', 'lost'].includes(l.status))
        .sort((a, b) => new Date(a.followupDueAt!).getTime() - new Date(b.followupDueAt!).getTime())
        .slice(0, 4)
        .map((l) => {
          const daysAgo = Math.floor((now - new Date(l.followupDueAt!).getTime()) / 86_400_000);
          return {
            id: `overdue:${l.id}`,
            group: 'overdue' as const,
            label: l.company,
            sub: `Follow-up ${daysAgo === 0 ? 'due today' : `${daysAgo}d overdue`} · ${l.status}`,
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" width="14" height="14">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            ),
            action: () => {
              pushRecentId(String(l.id));
              store.setCurrentLeadId(l.id);
              store.setMode('leads');
              onClose();
            },
          };
        })
    : [];

  // ── Status-change commands ─────────────────────────────────────────────────
  const statusCmd = q ? parseStatusCmd(q) : null;
  const statusItems: CmdItem[] = statusCmd
    ? leads
        .filter((l) => l.company.toLowerCase().includes(statusCmd.search) && l.status !== statusCmd.status)
        .slice(0, 5)
        .map((l) => ({
          id: `status:${l.id}:${statusCmd.status}`,
          group: 'status' as const,
          label: `Mark "${l.company}" as ${STATUS_LABEL[statusCmd.status] ?? statusCmd.status}`,
          sub: `Currently: ${l.status} · ${[l.city, l.state].filter(Boolean).join(', ')}`,
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ),
          action: async () => {
            if (l.serverId == null) return;
            await api.updateLead(l.serverId, { status: statusCmd.status as never });
            qc.invalidateQueries({ queryKey: ['leads'] });
            store.showToast(`${l.company} → ${STATUS_LABEL[statusCmd.status]}`);
            onClose();
          },
        }))
    : [];

  // ── Regular lead search ────────────────────────────────────────────────────
  const leadItems: CmdItem[] = !statusCmd
    ? leads
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
            action: () => {
              pushRecentId(String(l.id));
              store.setCurrentLeadId(l.id);
              store.setMode('leads');
              onClose();
            },
          };
        })
    : [];

  const ACTIONS: CmdItem[] = [
    { id: 'a:add',       group: 'action', label: 'Add Lead',          sub: 'Create a new lead manually',              icon: '+',  action: () => { store.setAddLeadOpen(true); onClose(); } },
    { id: 'a:import',    group: 'action', label: 'Import CSV',        sub: 'Bulk import leads from a spreadsheet',     icon: '↑',  action: () => { store.setCsvImportOpen(true); onClose(); } },
    { id: 'a:ai-import', group: 'action', label: 'AI Import',         sub: 'Paste any contact list — AI parses it',    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>, action: () => { store.setPasteImportOpen(true); onClose(); } },
    { id: 'a:blueprint', group: 'action', label: 'Scan Blueprint',    sub: 'Extract wrap opportunities from a PDF',    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, action: () => { store.setBlueprintOpen(true); onClose(); } },
    { id: 'a:bulk',      group: 'action', label: 'Bulk AI Email',     sub: 'AI-draft outreach for selected leads',     icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>, action: () => { store.setBulkOutreachOpen(true); onClose(); } },
    { id: 'a:settings',  group: 'action', label: 'Settings',          sub: 'Company profile & API integrations',       icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, action: () => { store.setSettingsOpen(true); onClose(); } },
    { id: 'a:discover',  group: 'action', label: 'Discover Carriers', sub: 'Search the FMCSA carrier database',        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>, action: () => { store.setMode('discover'); onClose(); } },
    { id: 'a:kanban',    group: 'action', label: 'Kanban Pipeline',   sub: 'Switch to drag-and-drop board view',       icon: '▦',  action: () => { store.setLeadView('kanban'); store.setMode('leads'); onClose(); } },
    { id: 'a:list',      group: 'action', label: 'List View',         sub: 'Switch to table list view',                icon: '≡',  action: () => { store.setLeadView('list'); store.setMode('leads'); onClose(); } },
    { id: 'a:card-scan', group: 'action', label: 'Scan Business Card', sub: 'AI reads contact info from a card photo',  icon: '📇', action: () => { store.setCardScanOpen(true); onClose(); } },
    { id: 'a:truck-scan', group: 'action', label: 'Scan Truck to Lead', sub: 'Photograph a truck — AI extracts company + DOT, imports to CRM', icon: '🚛', action: () => { store.setTruckScanOpen(true); onClose(); } },
    { id: 'a:url-import', group: 'action', label: 'Import Lead from URL', sub: 'AI extracts company data from any website or LinkedIn page', icon: '🔗', action: () => { store.setUrlImportOpen(true); onClose(); } },
    { id: 'a:quick-quote', group: 'action', label: 'Quick Quote', sub: 'Ballpark price estimate for an on-the-call prospect', icon: '⚡', action: () => { store.setQuickQuoteOpen(true); onClose(); } },
  ];

  const NAV_ITEMS: CmdItem[] = [
    { id: 'n:mission',   group: 'nav', label: 'Mission Dashboard',  sub: 'Call queue, follow-ups, AI coach',    shortcut: '1', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, action: () => { store.setMode('mission');   onClose(); } },
    { id: 'n:leads',     group: 'nav', label: 'My Leads',           sub: 'CRM list and kanban pipeline',        shortcut: '2', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, action: () => { store.setMode('leads');     onClose(); } },
    { id: 'n:discover',  group: 'nav', label: 'Discover Carriers',  sub: 'Search 600K FMCSA carriers',          shortcut: '3', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>, action: () => { store.setMode('discover');   onClose(); } },
    { id: 'n:pipeline',  group: 'nav', label: 'Pipeline',           sub: 'Revenue forecast and funnel view',    shortcut: '4', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,                                                    action: () => { store.setMode('pipeline');   onClose(); } },
    { id: 'n:bids',      group: 'nav', label: 'Bid Tracker',        sub: 'Track bids from tracking to won',     shortcut: '5', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>, action: () => { store.setMode('bids');      onClose(); } },
    { id: 'n:jobs',      group: 'nav', label: 'Wrap Lifecycle',     sub: 'Installed jobs, photos, re-orders',   shortcut: '6', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>, action: () => { store.setMode('jobs');      onClose(); } },
    { id: 'n:content',   group: 'nav', label: 'Content & E Ink',    sub: 'Manage wrap content, schedule sends', shortcut: '7', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>, action: () => { store.setMode('content');   onClose(); } },
    { id: 'n:analytics', group: 'nav', label: 'Analytics',          sub: 'Win rate, CLV, AI narrative',         shortcut: '8', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, action: () => { store.setMode('analytics');  onClose(); } },
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

  const visNav = filt(NAV_ITEMS);
  const visActions = filt(ACTIONS);
  const visFilters = filt(FILTERS);

  // When status command is active, only show status items + suppress lead search
  // DOT queries and NL searches show no regular items (dedicated panels handle them)
  const allItems = isDotQuery || isNlSearch
    ? []
    : statusCmd
      ? [...statusItems, ...visNav, ...visActions, ...visFilters]
      : [...recentItems, ...overdueItems, ...leadItems, ...visNav, ...visActions, ...visFilters];

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

  function renderGroup(items: CmdItem[], startIdx: number, title: string, titleColor?: string) {
    if (items.length === 0) return null;
    return (
      <>
        <div className="cmd-group-label" style={titleColor ? { color: titleColor } : undefined}>{title}</div>
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
              {item.shortcut && !item.badge && <kbd className="cmd-kbd">{item.shortcut}</kbd>}
            </button>
          );
        })}
      </>
    );
  }

  const overdueCount = leads.filter((l) =>
    l.followupDueAt && new Date(l.followupDueAt).getTime() < now && !['won', 'lost'].includes(l.status)
  ).length;

  let offset = 0;
  const recentOffset = offset; offset += recentItems.length;
  const overdueOffset = offset; offset += overdueItems.length;
  const leadOffset = offset; offset += leadItems.length;
  const statusOffset = offset; offset += statusItems.length;
  const navOffset = offset; offset += visNav.length;
  const actionOffset = offset; offset += visActions.length;
  const filterOffset = offset;

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
            placeholder={overdueCount > 0 ? `${overdueCount} overdue · Search, try "won Acme", DOT #, or "find fleets in Ohio"…` : 'Search leads · "find 20-truck fleets TX" · DOT # to import…'}
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
          {/* ── DOT Number Quick-Import Panel ─────────────────────────────── */}
          {isDotQuery && (
            <div style={{ padding: '12px 14px' }}>
              <div className="cmd-group-label" style={{ color: '#4d8af5' }}>FMCSA DOT Lookup</div>
              {dotLoading && (
                <div style={{ padding: '10px 4px', color: 'var(--text-faint)', fontSize: 13 }}>
                  Searching DOT #{dotNumber}…
                </div>
              )}
              {dotError && !dotLoading && (
                <div style={{ padding: '10px 4px', color: '#ef4444', fontSize: 13 }}>
                  {dotError.includes('404') || dotError.includes('not found') || dotError.toLowerCase().includes('not found')
                    ? `DOT #${dotNumber} not found in FMCSA database.`
                    : `Error: ${dotError}`}
                </div>
              )}
              {dotResult && !dotLoading && (
                <div style={{
                  background: 'var(--bg-surface, rgba(255,255,255,0.04))',
                  border: '1px solid rgba(77,138,245,0.3)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {dotResult.name}
                    </span>
                    {dotResult.alreadyInCrm && (
                      <span style={{ fontSize: 10, background: 'rgba(0,217,126,0.15)', color: '#00d97e', padding: '2px 7px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.05em' }}>
                        IN CRM
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', display: 'flex', gap: 12 }}>
                    {dotResult.city && dotResult.state && <span>📍 {dotResult.city}, {dotResult.state}</span>}
                    {dotResult.fleetSize != null && <span>🚛 {dotResult.fleetSize} units</span>}
                    <span style={{ color: '#f4551c' }}>Score {dotResult.wrapScore}</span>
                  </div>
                  {dotResult.alreadyInCrm ? (
                    <button
                      className="cmd-item"
                      style={{ marginTop: 4, background: 'rgba(0,217,126,0.1)', borderRadius: 6, justifyContent: 'center', gap: 6, color: '#00d97e', fontWeight: 600 }}
                      onClick={() => {
                        store.setMode('leads');
                        onClose();
                      }}
                    >
                      <span>✓</span> Already in CRM — view leads
                    </button>
                  ) : (
                    <button
                      className="cmd-item"
                      style={{ marginTop: 4, background: 'rgba(77,138,245,0.12)', borderRadius: 6, justifyContent: 'center', gap: 6, color: '#4d8af5', fontWeight: 600 }}
                      onClick={async () => {
                        try {
                          await api.importCarrier(dotResult.id);
                          qc.invalidateQueries({ queryKey: ['leads'] });
                          store.showToast(`${dotResult.name} imported to CRM`);
                          store.setMode('leads');
                        } catch (err) {
                          store.showToast('Import failed — try again');
                        }
                        onClose();
                      }}
                    >
                      <span>+</span> Import to CRM
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {/* ── Natural Language Lead Search Panel ──────────────────────── */}
          {isNlSearch && (
            <div style={{ padding: '12px 14px' }}>
              <div className="cmd-group-label" style={{ color: '#4d8af5' }}>
                🔍 FMCSA Lead Search
                {nlExplanation && <span style={{ fontWeight: 400, color: 'var(--text-faint)', marginLeft: 6, textTransform: 'none', fontSize: 11 }}>{nlExplanation}</span>}
              </div>
              {nlLoading && (
                <div style={{ padding: '10px 4px', color: 'var(--text-faint)', fontSize: 13 }}>
                  Searching 600K carriers…
                </div>
              )}
              {!nlLoading && nlResults !== null && nlResults.length === 0 && (
                <div style={{ padding: '10px 4px', color: 'var(--text-faint)', fontSize: 13 }}>
                  No carriers found matching that description.
                </div>
              )}
              {!nlLoading && nlResults && nlResults.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>
                    {nlTotal.toLocaleString()} matching carriers — showing top {nlResults.length}
                  </div>
                  {nlResults.map((r) => (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      borderRadius: 7, marginBottom: 4,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', gap: 8, marginTop: 2 }}>
                          {r.city && r.state && <span>📍 {r.city}, {r.state}</span>}
                          {r.fleet_size != null && <span>🚛 {r.fleet_size} units</span>}
                          <span style={{ color: 'var(--accent)' }}>Score {r.wrap_score}</span>
                        </div>
                      </div>
                      {r.already_imported ? (
                        <span style={{ fontSize: 10, background: 'rgba(0,217,126,0.15)', color: '#00d97e', padding: '2px 7px', borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>IN CRM</span>
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              await api.importCarrier(r.id);
                              qc.invalidateQueries({ queryKey: ['leads'] });
                              store.showToast(`${r.name} imported`);
                              setNlResults((prev) => prev ? prev.map((x) => x.id === r.id ? { ...x, already_imported: true } : x) : prev);
                            } catch { store.showToast('Import failed', 'error'); }
                          }}
                          style={{
                            padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            border: '1px solid rgba(77,138,245,0.4)', background: 'rgba(77,138,245,0.1)', color: '#4d8af5', flexShrink: 0,
                          }}
                        >
                          + Import
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => { store.setMode('discover'); onClose(); }}
                    style={{ width: '100%', marginTop: 4, padding: '7px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}
                  >
                    Open full search in Discover →
                  </button>
                </>
              )}
            </div>
          )}
          {!isDotQuery && !isNlSearch && allItems.length === 0 && (
            <div className="cmd-no-results">No results for "{query}"</div>
          )}
          {!isDotQuery && !isNlSearch && (statusCmd ? (
            <>
              {renderGroup(statusItems, statusOffset, `Mark as ${STATUS_LABEL[statusCmd.status] ?? statusCmd.status}`)}
              {renderGroup(visNav, navOffset, 'Navigate')}
              {renderGroup(visActions, actionOffset, 'Actions')}
              {renderGroup(visFilters, filterOffset, 'Filters')}
            </>
          ) : (
            <>
              {renderGroup(recentItems, recentOffset, 'Recent')}
              {renderGroup(overdueItems, overdueOffset, 'Overdue Follow-ups', '#ef4444')}
              {renderGroup(leadItems, leadOffset, q ? 'Leads' : 'Top Leads')}
              {renderGroup(visNav, navOffset, 'Navigate')}
              {renderGroup(visActions, actionOffset, 'Actions')}
              {renderGroup(visFilters, filterOffset, 'Filters')}
            </>
          ))}
        </div>

        <div className="cmd-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>1</kbd>–<kbd>8</kbd> switch view</span>
          {overdueCount > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>{overdueCount} overdue</span>}
          <span><kbd>esc</kbd> dismiss</span>
        </div>
      </div>
    </div>
  );
}
