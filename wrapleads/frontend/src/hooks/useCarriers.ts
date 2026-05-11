import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { CarrierSearchParams } from '../api/types';
import { useAppStore } from '../store/useAppStore';

export function useCarrierStats() {
  return useQuery({
    queryKey: ['carrierStats'],
    queryFn: () => api.carrierStats(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCarrierSearch() {
  const { setCarrierResults, setCarrierLoading, setCarrierLastQuery, showToast } = useAppStore((s) => ({
    setCarrierResults: s.setCarrierResults,
    setCarrierLoading: s.setCarrierLoading,
    setCarrierLastQuery: s.setCarrierLastQuery,
    showToast: s.showToast,
  }));

  return useMutation({
    mutationFn: (params: CarrierSearchParams) => {
      setCarrierLoading(true);
      setCarrierLastQuery(params);
      return api.searchCarriers(params);
    },
    onSuccess: (data) => {
      setCarrierResults(data.results, data.total);
    },
    onError: (e: Error) => {
      setCarrierLoading(false);
      showToast(e.message, 'error');
    },
  });
}

export function useImportCarrier() {
  const { showToast, markCarrierImported } = useAppStore((s) => ({
    showToast: s.showToast,
    markCarrierImported: s.markCarrierImported,
  }));
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (companyId: number) => api.importCarrier(companyId),
    onSuccess: (_data, companyId) => {
      markCarrierImported(companyId);
      qc.invalidateQueries({ queryKey: ['leads'] });
      showToast('Lead added to My Leads');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
}
