import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { SavedSearch } from '../api/types';
import { useAppStore } from '../store/useAppStore';

export function useSavedSearches() {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);

  const query = useQuery({
    queryKey: ['savedSearches'],
    queryFn: () => api.getSavedSearches().then((r) => r.searches),
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: ({ name, filters }: { name: string; filters: SavedSearch['filters'] }) =>
      api.createSavedSearch(name, filters),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['savedSearches'] });
      showToast('Search saved');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteSavedSearch(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['savedSearches'] });
      showToast('Search deleted');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const runMutation = useMutation({
    mutationFn: (id: number) => api.runSavedSearch(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['savedSearches'] });
      showToast(`Found ${data.new_count} new carriers`);
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  return {
    savedSearches: query.data ?? [],
    isLoading: query.isLoading,
    createSearch: createMutation.mutate,
    deleteSearch: deleteMutation.mutate,
    runSearch: runMutation.mutate,
    isRunning: runMutation.isPending,
  };
}
