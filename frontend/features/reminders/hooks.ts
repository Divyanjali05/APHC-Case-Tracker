import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { ReminderItem } from '../../types';

export const useReminders = () => {
  return useQuery({
    queryKey: ['reminders'],
    queryFn: async (): Promise<ReminderItem[]> => {
      const response = await apiClient.get<ReminderItem[]>(ENDPOINTS.REMINDERS.LIST);
      return response.data;
    },
  });
};
