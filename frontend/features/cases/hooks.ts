import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { CaseItem } from '../../types';

export const useCases = () => {
  return useQuery({
    queryKey: ['cases'],
    queryFn: async (): Promise<CaseItem[]> => {
      const response = await apiClient.get<CaseItem[]>(ENDPOINTS.CASES.LIST);
      return response.data;
    },
  });
};

export const useCaseDetail = (id: number | string) => {
  return useQuery({
    queryKey: ['case', id],
    queryFn: async (): Promise<CaseItem> => {
      const response = await apiClient.get<CaseItem>(ENDPOINTS.CASES.DETAIL(id));
      return response.data;
    },
    enabled: !!id,
  });
};
