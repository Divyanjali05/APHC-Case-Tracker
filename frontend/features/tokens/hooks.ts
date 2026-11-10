import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import {
  CourtHallItem,
  CreateTokenAlertPayload,
  TokenAlertRuleItem,
  UpdateTokenAlertPayload,
} from '../../types';

export const useCourtHalls = () => {
  return useQuery({
    queryKey: ['court-halls'],
    queryFn: async (): Promise<CourtHallItem[]> => {
      const response = await apiClient.get<
        CourtHallItem[] | { results?: CourtHallItem[] }
      >(ENDPOINTS.TOKENS.HALLS);
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return response.data?.results || [];
    },
    refetchInterval: 15000, // Poll every 15 seconds for live token movement
  });
};

export interface TokenAlertFilters {
  case_id?: number;
  court_hall_id?: number;
  is_active?: boolean;
  status?: string;
}

export const useTokenAlerts = (filters?: TokenAlertFilters) => {
  return useQuery({
    queryKey: ['token-alerts', filters],
    queryFn: async (): Promise<TokenAlertRuleItem[]> => {
      const params: Record<string, string> = {};
      if (filters?.case_id) params.case_id = String(filters.case_id);
      if (filters?.court_hall_id) params.court_hall_id = String(filters.court_hall_id);
      if (filters?.is_active !== undefined) params.is_active = String(filters.is_active);
      if (filters?.status) params.status = filters.status;

      const response = await apiClient.get<
        TokenAlertRuleItem[] | { results?: TokenAlertRuleItem[] }
      >(ENDPOINTS.TOKENS.ALERTS, { params });
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return response.data?.results || [];
    },
    refetchInterval: 10000, // Poll active alerts every 10 seconds for real-time tracking
  });
};

export const useCreateTokenAlert = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateTokenAlertPayload): Promise<TokenAlertRuleItem> => {
      const response = await apiClient.post<TokenAlertRuleItem>(
        ENDPOINTS.TOKENS.ALERTS,
        payload
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['token-alerts'] });
    },
  });
};

export const useUpdateTokenAlert = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: number;
      payload: UpdateTokenAlertPayload;
    }): Promise<TokenAlertRuleItem> => {
      const response = await apiClient.patch<TokenAlertRuleItem>(
        ENDPOINTS.TOKENS.ALERT_DETAIL(id),
        payload
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['token-alerts'] });
    },
  });
};

export const useCancelTokenAlert = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number): Promise<TokenAlertRuleItem> => {
      const response = await apiClient.post<TokenAlertRuleItem>(
        ENDPOINTS.TOKENS.ALERT_CANCEL(id)
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['token-alerts'] });
    },
  });
};

export const useSyncTokenAlert = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number): Promise<TokenAlertRuleItem> => {
      const response = await apiClient.post<TokenAlertRuleItem>(
        ENDPOINTS.TOKENS.ALERT_SYNC(id)
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['token-alerts'] });
    },
  });
};
