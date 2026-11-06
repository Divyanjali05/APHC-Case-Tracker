import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { offlineStorage } from '../../services/offline/offlineStorage';
import { syncQueue } from '../../services/offline/syncQueue';
import { networkStatus } from '../../services/offline/networkStatus';
import { tokenStorage } from '../../services/auth/tokenStorage';
import { ReminderItem, ReminderPreferenceItem } from '../../types';

export interface ReminderFilterParams {
  reminder_type?: string;
  is_completed?: boolean;
  status?: string;
}

export const useReminders = (filters?: ReminderFilterParams) => {
  return useQuery({
    queryKey: ['reminders', filters],
    queryFn: async (): Promise<ReminderItem[]> => {
      const enrollment = await tokenStorage.getUserEnrollment();
      try {
        const params = new URLSearchParams();
        if (filters?.reminder_type) params.append('reminder_type', filters.reminder_type);
        if (filters?.status) params.append('status', filters.status);
        if (filters?.is_completed !== undefined) {
          params.append('is_completed', String(filters.is_completed));
        }
        const queryStr = params.toString();
        const url = queryStr
          ? `${ENDPOINTS.REMINDERS.LIST}?${queryStr}`
          : ENDPOINTS.REMINDERS.LIST;
        const response = await apiClient.get<
          ReminderItem[] | { results: ReminderItem[] }
        >(url);
        const data = Array.isArray(response.data)
          ? response.data
          : response.data.results || [];
        if (!filters || Object.keys(filters).length === 0) {
          await offlineStorage.saveCachedReminders(enrollment, data);
        }
        return data;
      } catch (err) {
        const cached = await offlineStorage.getCachedReminders(enrollment);
        if (cached && cached.data) {
          return cached.data;
        }
        throw err;
      }
    },
  });
};

export const useReminderPreferences = () => {
  return useQuery({
    queryKey: ['reminder-preferences'],
    queryFn: async (): Promise<ReminderPreferenceItem> => {
      const response = await apiClient.get<ReminderPreferenceItem>(
        ENDPOINTS.REMINDERS.PREFERENCES
      );
      return response.data;
    },
  });
};

export const useUpdateReminderPreferences = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Partial<ReminderPreferenceItem>
    ): Promise<ReminderPreferenceItem> => {
      const response = await apiClient.patch<ReminderPreferenceItem>(
        ENDPOINTS.REMINDERS.PREFERENCES,
        payload
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder-preferences'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
};

export const useDismissReminder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number | string): Promise<ReminderItem> => {
      const enrollment = await tokenStorage.getUserEnrollment();
      if (!networkStatus.isOnline()) {
        await syncQueue.enqueueAction(enrollment, {
          action_type: 'DISMISS_REMINDER',
          payload: { id: Number(id) },
        });
        const cached = await offlineStorage.getCachedReminders(enrollment);
        if (cached && cached.data) {
          const updated = cached.data.map(item =>
            item.id === Number(id)
              ? { ...item, is_completed: true, status: 'DISMISSED' as const }
              : item
          );
          await offlineStorage.saveCachedReminders(enrollment, updated);
        }
        return {
          id: Number(id),
          title: 'Offline Dismissed Reminder',
          due_date: new Date().toISOString(),
          reminder_type: 'GENERAL',
          status: 'DISMISSED',
          is_completed: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      try {
        const response = await apiClient.post<{ detail: string; reminder: ReminderItem }>(
          ENDPOINTS.REMINDERS.DISMISS(id)
        );
        return response.data.reminder;
      } catch (err: unknown) {
        const networkErr = err as { response?: unknown; message?: string; code?: string };
        if (
          !networkErr.response ||
          networkErr.message?.includes('Network') ||
          networkErr.code === 'ECONNABORTED'
        ) {
          await syncQueue.enqueueAction(enrollment, {
            action_type: 'DISMISS_REMINDER',
            payload: { id: Number(id) },
          });
          const cached = await offlineStorage.getCachedReminders(enrollment);
          if (cached && cached.data) {
            const updated = cached.data.map(item =>
              item.id === Number(id)
                ? { ...item, is_completed: true, status: 'DISMISSED' as const }
                : item
            );
            await offlineStorage.saveCachedReminders(enrollment, updated);
          }
          return {
            id: Number(id),
            title: 'Offline Dismissed Reminder',
            due_date: new Date().toISOString(),
            reminder_type: 'GENERAL',
            status: 'DISMISSED',
            is_completed: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
};

export interface CreateReminderPayload {
  title: string;
  description?: string;
  due_date: string;
  reminder_type?: string;
  reminder_interval_hours?: number;
  case?: number | null;
  hearing?: number | null;
}

export const useCreateReminder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateReminderPayload): Promise<ReminderItem> => {
      const enrollment = await tokenStorage.getUserEnrollment();
      if (!networkStatus.isOnline()) {
        await syncQueue.enqueueAction(enrollment, {
          action_type: 'CREATE_REMINDER',
          payload,
        });
        const fakeReminder: ReminderItem = {
          id: -Date.now(),
          title: payload.title,
          description: payload.description,
          due_date: payload.due_date,
          reminder_type:
            (payload.reminder_type as ReminderItem['reminder_type']) || 'GENERAL',
          reminder_interval_hours: payload.reminder_interval_hours,
          status: 'PENDING',
          is_completed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const cached = await offlineStorage.getCachedReminders(enrollment);
        const currentList = cached?.data || [];
        await offlineStorage.saveCachedReminders(enrollment, [
          fakeReminder,
          ...currentList,
        ]);
        return fakeReminder;
      }

      try {
        const response = await apiClient.post<ReminderItem>(
          ENDPOINTS.REMINDERS.LIST,
          payload
        );
        return response.data;
      } catch (err: unknown) {
        const networkErr = err as { response?: unknown; message?: string; code?: string };
        if (
          !networkErr.response ||
          networkErr.message?.includes('Network') ||
          networkErr.code === 'ECONNABORTED'
        ) {
          await syncQueue.enqueueAction(enrollment, {
            action_type: 'CREATE_REMINDER',
            payload,
          });
          const fakeReminder: ReminderItem = {
            id: -Date.now(),
            title: payload.title,
            description: payload.description,
            due_date: payload.due_date,
            reminder_type:
              (payload.reminder_type as ReminderItem['reminder_type']) || 'GENERAL',
            reminder_interval_hours: payload.reminder_interval_hours,
            status: 'PENDING',
            is_completed: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const cached = await offlineStorage.getCachedReminders(enrollment);
          const currentList = cached?.data || [];
          await offlineStorage.saveCachedReminders(enrollment, [
            fakeReminder,
            ...currentList,
          ]);
          return fakeReminder;
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
};
