import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { SolarSearchParams, PilotInstaller } from '../api/types';

export function useSolarLeads(params: SolarSearchParams, enabled = true) {
  return useQuery({
    queryKey: ['solar', 'leads', params],
    queryFn: () => api.searchSolarLeads(params),
    enabled,
  });
}

export function useQualifiedSolarLeads(state?: string) {
  return useQuery({
    queryKey: ['solar', 'qualified', state],
    queryFn: () => api.getQualifiedSolarLeads(state ? { state, limit: 50 } : undefined),
  });
}

export function useSolarCompany(id: number | null) {
  return useQuery({
    queryKey: ['solar', 'company', id],
    queryFn: () => api.getSolarCompany(id!),
    enabled: !!id,
  });
}

export function useImportSolarLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyId: number) => api.importSolarLead(companyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solar'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useQualifyLead() {
  return useMutation({
    mutationFn: (input: Parameters<typeof api.qualifyLead>[0]) => api.qualifyLead(input),
  });
}

export function usePilotInstallers() {
  return useQuery({ queryKey: ['solar', 'installers'], queryFn: () => api.getPilotInstallers() });
}

export function useCreatePilotInstaller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PilotInstaller>) => api.createPilotInstaller(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solar', 'installers'] }),
  });
}

export function useDeletePilotInstaller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deletePilotInstaller(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solar', 'installers'] }),
  });
}

export function useSolarAuctions() {
  return useQuery({ queryKey: ['solar', 'auctions'], queryFn: () => api.getSolarAuctions() });
}

export function useOpenSolarAuction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { lead_id: number; hours?: number; floor_price?: number }) => api.openSolarAuction(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solar', 'auctions'] }),
  });
}

export function useAwardSolarAuction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ auctionId, bidId }: { auctionId: number; bidId: number }) => api.awardSolarAuction(auctionId, bidId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solar', 'auctions'] }),
  });
}

export function useSolarSla() {
  return useQuery({ queryKey: ['solar', 'sla'], queryFn: () => api.getSolarSla() });
}

export function useSolarIntakeSecret() {
  return useQuery({ queryKey: ['solar', 'intake-secret'], queryFn: () => api.getSolarIntakeSecret() });
}

export function useRotateSolarIntakeSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.rotateSolarIntakeSecret(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solar', 'intake-secret'] }),
  });
}

export function useCreateSolarProposal() {
  return useMutation({ mutationFn: (leadId: number) => api.createSolarProposal(leadId) });
}

export function useSolarOverview() {
  return useQuery({ queryKey: ['solar', 'overview'], queryFn: () => api.getSolarOverview(), staleTime: 60_000 });
}

export function useImportSolarCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (csvText: string) => api.importSolarCsv(csvText),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solar'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
