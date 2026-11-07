import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { offlineCalendarStorage } from '../../services/offline/offlineCalendarStorage';
import {
  AgendaResponse,
  CalendarSyncConnectPayload,
  CalendarSyncSettingItem,
  CalendarViewType,
  CreatePersonalReminderPayload,
  UpdatePersonalReminderPayload,
} from '../../types';

export interface UseDailyAgendaParams {
  date?: string;
  startDate?: string;
  endDate?: string;
  view?: CalendarViewType;
  userKey?: string;
}

export function useDailyAgenda(params: UseDailyAgendaParams = {}) {
  const { date, startDate, endDate, view = 'day', userKey = 'advocate' } = params;
  const dateKey = date || startDate || new Date().toISOString().split('T')[0];

  return useQuery({
    queryKey: ['agenda', date, startDate, endDate, view],
    queryFn: async (): Promise<AgendaResponse> => {
      try {
        const queryParams = new URLSearchParams();
        if (date) queryParams.append('date', date);
        if (startDate) queryParams.append('start_date', startDate);
        if (endDate) queryParams.append('end_date', endDate);
        if (view) queryParams.append('view', view);

        const url = `${ENDPOINTS.CALENDAR.AGENDA}?${queryParams.toString()}`;
        const response = await apiClient.get<AgendaResponse>(url);
        if (response.data) {
          await offlineCalendarStorage.cacheAgenda(userKey, dateKey, response.data);
          return response.data;
        }
        throw new Error('Empty agenda response');
      } catch (err) {
        // Fallback to offline cached agenda
        const cached = await offlineCalendarStorage.getCachedAgenda(userKey, dateKey);
        if (cached) {
          return cached;
        }
        throw err;
      }
    },
  });
}

export function useCreatePersonalReminder(userKey: string = 'advocate') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreatePersonalReminderPayload) => {
      try {
        const response = await apiClient.post(ENDPOINTS.CALENDAR.REMINDERS, payload);
        return response.data;
      } catch (err) {
        // If offline, save in queue
        await offlineCalendarStorage.enqueueOfflineReminder(userKey, payload);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
      queryClient.invalidateQueries({ queryKey: ['personal-reminders'] });
    },
  });
}

export function useUpdatePersonalReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdatePersonalReminderPayload }) => {
      const response = await apiClient.patch(ENDPOINTS.CALENDAR.REMINDER_DETAIL(id), data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
      queryClient.invalidateQueries({ queryKey: ['personal-reminders'] });
    },
  });
}

export function useDeletePersonalReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(ENDPOINTS.CALENDAR.REMINDER_DETAIL(id));
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
      queryClient.invalidateQueries({ queryKey: ['personal-reminders'] });
    },
  });
}

export function useCalendarSyncStatus() {
  return useQuery({
    queryKey: ['calendar-sync-status'],
    queryFn: async (): Promise<CalendarSyncSettingItem> => {
      const response = await apiClient.get<CalendarSyncSettingItem>(
        ENDPOINTS.CALENDAR.SYNC_STATUS
      );
      return response.data;
    },
  });
}

export function useConnectCalendarSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CalendarSyncConnectPayload) => {
      const response = await apiClient.post<CalendarSyncSettingItem>(
        ENDPOINTS.CALENDAR.SYNC_CONNECT,
        payload
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
    },
  });
}

export function useTriggerCalendarSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<{ status: string; message: string; synced_count: number }>(
        ENDPOINTS.CALENDAR.SYNC_TRIGGER
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
    },
  });
}

export function useDisconnectCalendarSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<{ status: string; message: string }>(
        ENDPOINTS.CALENDAR.SYNC_DISCONNECT
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
    },
  });
}

