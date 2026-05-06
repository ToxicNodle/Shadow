import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Lead } from '../api/types';
import { useAppStore } from '../store/useAppStore';

export function useLeads() {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);

  const query = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.getLeads().then((r) => r.leads),
    staleTime: 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (lead: Partial<Lead>) => api.createLead(lead),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      showToast('Lead added');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ serverId, patch }: { serverId: number; patch: Partial<Lead> }) =>
      api.updateLead(serverId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (serverId: number) => api.deleteLead(serverId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      showToast('Lead deleted');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const syncMutation = useMutation({
    mutationFn: (leads: Partial<Lead>[]) => api.syncLeads(leads),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      showToast(`Synced ${data.inserted} leads`);
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  return {
    leads: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    createLead: createMutation.mutate,
    updateLead: updateMutation.mutate,
    deleteLead: deleteMutation.mutate,
    syncLeads: syncMutation.mutate,
    isSyncing: syncMutation.isPending,
  };
}
