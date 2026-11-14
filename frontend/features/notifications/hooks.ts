import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { NotificationCategory, NotificationItem } from '../../types';

export interface NotificationFilterParams {
  category?: NotificationCategory | string;
  is_read?: boolean;
  case_id?: number | string;
}

export const useNotifications = (filters?: NotificationFilterParams) => {
  return useQuery({
    queryKey: ['notifications', filters],
    queryFn: async (): Promise<NotificationItem[]> => {
      const params = new URLSearchParams();
      if (filters?.category) params.append('category', filters.category);
      if (filters?.is_read !== undefined)
        params.append('is_read', String(filters.is_read));
      if (filters?.case_id) params.append('case_id', String(filters.case_id));

      const queryStr = params.toString();
      const url = queryStr
        ? `${ENDPOINTS.NOTIFICATIONS.HISTORY}?${queryStr}`
        : ENDPOINTS.NOTIFICATIONS.HISTORY;

      const response = await apiClient.get<
        NotificationItem[] | { results: NotificationItem[] }
      >(url);
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return response.data.results || [];
    },
  });
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number | string): Promise<NotificationItem> => {
      const response = await apiClient.post<NotificationItem>(
        ENDPOINTS.NOTIFICATIONS.MARK_READ(id)
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (category?: string): Promise<{ marked_read_count: number }> => {
      const payload = category ? { category } : {};
      const response = await apiClient.post<{ marked_read_count: number }>(
        ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ,
        payload
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

export const useUnreadNotificationsCount = () => {
  const { data: notifications = [] } = useNotifications({ is_read: false });
  return notifications.length;
};
