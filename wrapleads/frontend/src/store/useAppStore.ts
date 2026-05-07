import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LeadCategory, LeadStatus, Settings, Carrier, CarrierSearchParams } from '../api/types';
import { DEFAULT_SETTINGS } from '../api/types';

export type AppMode = 'leads' | 'discover' | 'pipeline';

export interface ActiveFilter {
  category: LeadCategory | 'all';
  status: LeadStatus | 'all';
  state: string;
  search: string;
  followupDue?: boolean;
}

export interface CarrierState {
  results: Carrier[];
  total: number;
  offset: number;
  limit: number;
  loading: boolean;
  lastQuery: CarrierSearchParams | null;
}

export interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'info';
}

export type LeadSort = 'score' | 'company' | 'status' | 'lastContacted';
export type LeadView = 'list' | 'kanban';

interface AppStore {
  // Mode
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  // Lead view (list vs kanban pipeline)
  leadView: LeadView;
  setLeadView: (v: LeadView) => void;

  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // AI paste import
  pasteImportOpen: boolean;
  setPasteImportOpen: (open: boolean) => void;

  // Current lead detail panel
  currentLeadId: string | null;
  setCurrentLeadId: (id: string | null) => void;

  // Lead list filters
  activeFilter: ActiveFilter;
  setFilter: (patch: Partial<ActiveFilter>) => void;
  resetFilters: () => void;

  // Lead sort
  leadSort: LeadSort;
  setLeadSort: (sort: LeadSort) => void;

  // Lead selection (for bulk outreach)
  selectedLeadIds: Set<string>;
  toggleLeadSelection: (id: string) => void;
  selectAllLeads: (ids: string[]) => void;
  clearLeadSelection: () => void;

  // Carrier / discover state
  carrierState: CarrierState;
  setCarrierResults: (results: Carrier[], total: number) => void;
  setCarrierLoading: (loading: boolean) => void;
  setCarrierOffset: (offset: number) => void;
  setCarrierLastQuery: (query: CarrierSearchParams) => void;
  resetCarrierState: () => void;
  markCarrierImported: (id: number) => void;

  // Selected carriers (for bulk import)
  selectedCarrierIds: Set<number>;
  toggleCarrierId: (id: number) => void;
  selectAllCarrierIds: (ids: number[]) => void;
  clearSelectedCarrierIds: () => void;

  // Modal visibility
  addLeadOpen: boolean;
  settingsOpen: boolean;
  apolloOpen: boolean;
  paywallOpen: boolean;
  blueprintOpen: boolean;
  bulkOutreachOpen: boolean;
  csvImportOpen: boolean;
  proposalOpen: boolean;
  proposalLeadId: string | null;
  setAddLeadOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setApolloOpen: (open: boolean) => void;
  setPaywallOpen: (open: boolean) => void;
  setBlueprintOpen: (open: boolean) => void;
  setBulkOutreachOpen: (open: boolean) => void;
  setCsvImportOpen: (open: boolean) => void;
  setProposalOpen: (open: boolean, leadId?: string) => void;

  // Current lead for Apollo enrichment
  apolloLeadId: string | null;
  setApolloLeadId: (id: string | null) => void;

  // Settings (persisted to localStorage)
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;

  // Toast notifications
  toast: ToastMessage | null;
  showToast: (message: string, type?: ToastMessage['type']) => void;
  clearToast: () => void;
}

const DEFAULT_FILTER: ActiveFilter = {
  category: 'all',
  status: 'all',
  state: '',
  search: '',
};

const DEFAULT_CARRIER_STATE: CarrierState = {
  results: [],
  total: 0,
  offset: 0,
  limit: 25,
  loading: false,
  lastQuery: null,
};

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      // Mode
      mode: 'leads',
      setMode: (mode) => set({ mode }),

      // Lead view
      leadView: 'list',
      setLeadView: (v) => set({ leadView: v }),

      // Command palette
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      // AI paste import
      pasteImportOpen: false,
      setPasteImportOpen: (open) => set({ pasteImportOpen: open }),

      // Current lead
      currentLeadId: null,
      setCurrentLeadId: (id) => set({ currentLeadId: id }),

      // Filters
      activeFilter: DEFAULT_FILTER,
      setFilter: (patch) =>
        set((s) => ({ activeFilter: { ...s.activeFilter, ...patch } })),
      resetFilters: () => set({ activeFilter: DEFAULT_FILTER }),

      // Lead sort
      leadSort: 'score',
      setLeadSort: (sort) => set({ leadSort: sort }),

      // Lead selection
      selectedLeadIds: new Set<string>(),
      toggleLeadSelection: (id) =>
        set((s) => {
          const next = new Set(s.selectedLeadIds);
          if (next.has(id)) next.delete(id); else next.add(id);
          return { selectedLeadIds: next };
        }),
      selectAllLeads: (ids) => set({ selectedLeadIds: new Set(ids) }),
      clearLeadSelection: () => set({ selectedLeadIds: new Set<string>() }),

      // Carrier state
      carrierState: DEFAULT_CARRIER_STATE,
      setCarrierResults: (results, total) =>
        set((s) => ({ carrierState: { ...s.carrierState, results, total, loading: false } })),
      setCarrierLoading: (loading) =>
        set((s) => ({ carrierState: { ...s.carrierState, loading } })),
      setCarrierOffset: (offset) =>
        set((s) => ({ carrierState: { ...s.carrierState, offset } })),
      setCarrierLastQuery: (query) =>
        set((s) => ({ carrierState: { ...s.carrierState, lastQuery: query } })),
      resetCarrierState: () => set({ carrierState: DEFAULT_CARRIER_STATE }),
      markCarrierImported: (id) =>
        set((s) => ({
          carrierState: {
            ...s.carrierState,
            results: s.carrierState.results.map((c) =>
              c.id === id ? { ...c, already_imported: true } : c
            ),
          },
        })),

      // Selected carriers
      selectedCarrierIds: new Set<number>(),
      toggleCarrierId: (id) =>
        set((s) => {
          const next = new Set(s.selectedCarrierIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { selectedCarrierIds: next };
        }),
      selectAllCarrierIds: (ids) =>
        set({ selectedCarrierIds: new Set(ids) }),
      clearSelectedCarrierIds: () =>
        set({ selectedCarrierIds: new Set<number>() }),

      // Modals
      addLeadOpen: false,
      settingsOpen: false,
      apolloOpen: false,
      paywallOpen: false,
      blueprintOpen: false,
      bulkOutreachOpen: false,
      csvImportOpen: false,
      proposalOpen: false,
      proposalLeadId: null,
      setAddLeadOpen: (open) => set({ addLeadOpen: open }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setApolloOpen: (open) => set({ apolloOpen: open }),
      setPaywallOpen: (open) => set({ paywallOpen: open }),
      setBlueprintOpen: (open) => set({ blueprintOpen: open }),
      setBulkOutreachOpen: (open) => set({ bulkOutreachOpen: open }),
      setCsvImportOpen: (open) => set({ csvImportOpen: open }),
      setProposalOpen: (open, leadId) => set({ proposalOpen: open, proposalLeadId: leadId ?? null }),

      // Apollo lead context
      apolloLeadId: null,
      setApolloLeadId: (id) => set({ apolloLeadId: id }),

      // Settings
      settings: DEFAULT_SETTINGS,
      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      // Toast
      toast: null,
      showToast: (message, type = 'success') => set({ toast: { message, type } }),
      clearToast: () => set({ toast: null }),
    }),
    {
      name: 'wl-app-store',
      partialize: (s) => ({ settings: s.settings, leadView: s.leadView }),
    },
  ),
);
