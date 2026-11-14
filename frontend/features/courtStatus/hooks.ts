import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import {
  CaseCourtStatusSummary,
  CourtListingItem,
  CourtStatusObservationItem,
  CourtStatusSyncResponse,
  SyncHealthStatus,
} from '../../types';

export const useCourtStatus = (caseId: number | string) => {
  return useQuery({
    queryKey: ['court-status', String(caseId)],
    queryFn: async (): Promise<CaseCourtStatusSummary> => {
      const response = await apiClient.get<CaseCourtStatusSummary>(
        ENDPOINTS.CASES.COURT_STATUS(caseId)
      );
      return response.data;
    },
    enabled: !!caseId,
  });
};

export const useCourtStatusHistory = (caseId: number | string) => {
  return useQuery({
    queryKey: ['court-status-history', String(caseId)],
    queryFn: async (): Promise<CourtStatusObservationItem[]> => {
      const response = await apiClient.get<
        CourtStatusObservationItem[] | { results: CourtStatusObservationItem[] }
      >(ENDPOINTS.CASES.COURT_STATUS_HISTORY(caseId));
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return response.data.results || [];
    },
    enabled: !!caseId,
  });
};

export const useCourtListings = (caseId: number | string) => {
  return useQuery({
    queryKey: ['court-listings', String(caseId)],
    queryFn: async (): Promise<CourtListingItem[]> => {
      const response = await apiClient.get<CourtListingItem[]>(
        ENDPOINTS.CASES.COURT_LISTINGS(caseId)
      );
      return response.data;
    },
    enabled: !!caseId,
  });
};

export const useSyncHealthStatus = () => {
  return useQuery({
    queryKey: ['court-sync-health'],
    queryFn: async (): Promise<SyncHealthStatus> => {
      const response = await apiClient.get<SyncHealthStatus>(
        ENDPOINTS.COURT_STATUS.SYNC_STATUS
      );
      return response.data;
    },
  });
};

export interface SyncCourtStatusArgs {
  caseId: number | string;
}

export const useSyncCourtStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      caseId,
    }: SyncCourtStatusArgs): Promise<CourtStatusSyncResponse> => {
      const response = await apiClient.post<CourtStatusSyncResponse>(
        ENDPOINTS.CASES.COURT_STATUS_SYNC(caseId)
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      const caseIdStr = String(variables.caseId);
      queryClient.invalidateQueries({ queryKey: ['court-status', caseIdStr] });
      queryClient.invalidateQueries({ queryKey: ['court-status-history', caseIdStr] });
      queryClient.invalidateQueries({ queryKey: ['court-listings', caseIdStr] });
      queryClient.invalidateQueries({ queryKey: ['case-history', caseIdStr] });
      queryClient.invalidateQueries({ queryKey: ['case', caseIdStr] });
      queryClient.invalidateQueries({ queryKey: ['court-sync-health'] });
    },
  });
};
