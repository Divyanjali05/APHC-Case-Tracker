import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { CourtHallItem } from '../../types';

export const useCourtHalls = () => {
  return useQuery({
    queryKey: ['court-halls'],
    queryFn: async (): Promise<CourtHallItem[]> => {
      const response = await apiClient.get<CourtHallItem[]>(ENDPOINTS.TOKENS.HALLS);
      return response.data;
    },
    refetchInterval: 15000, // Poll every 15 seconds for live token movement
  });
};
