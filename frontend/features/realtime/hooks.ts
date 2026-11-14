import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState, AppStateStatus } from 'react-native';
import { realtimeService } from './realtimeService';
import { RealtimeConnectionStatus, RealtimeEvent, RealtimeEventType } from './types';

/**
 * Hook to manage the global real-time synchronization lifecycle and
 * invalidate relevant React Query caches when events arrive.
 */
export const useRealtimeSync = (autoStart: boolean = true) => {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>(
    realtimeService.getStatus()
  );
  const [latestEventId, setLatestEventId] = useState<number>(
    realtimeService.getLatestEventId()
  );

  const handleRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      setLatestEventId(event.id);
      const caseId = (event.payload as Record<string, unknown>)?.case_id;

      if ((event.payload as Record<string, unknown>)?.requires_full_sync) {
        queryClient.invalidateQueries({ queryKey: ['cases'] });
        queryClient.invalidateQueries({ queryKey: ['court-status'] });
        queryClient.invalidateQueries({ queryKey: ['hearings'] });
        queryClient.invalidateQueries({ queryKey: ['reminders'] });
        queryClient.invalidateQueries({ queryKey: ['judgments'] });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        return;
      }

      switch (event.event_type) {
        case 'COURT_TOKEN_UPDATED':
          if (caseId) {
            queryClient.invalidateQueries({ queryKey: ['cases', caseId] });
            queryClient.invalidateQueries({ queryKey: ['court-status', caseId] });
            queryClient.invalidateQueries({
              queryKey: ['court-status-timeline', caseId],
            });
          }
          queryClient.invalidateQueries({ queryKey: ['cases'] });
          queryClient.invalidateQueries({ queryKey: ['court-status'] });
          queryClient.invalidateQueries({ queryKey: ['court-status-timeline'] });
          break;

        case 'HEARING_RESCHEDULED':
        case 'HEARING_CHANGED':
          if (caseId) {
            queryClient.invalidateQueries({ queryKey: ['cases', caseId] });
            queryClient.invalidateQueries({ queryKey: ['hearings', caseId] });
          }
          queryClient.invalidateQueries({ queryKey: ['cases'] });
          queryClient.invalidateQueries({ queryKey: ['hearings'] });
          queryClient.invalidateQueries({ queryKey: ['reminders'] });
          queryClient.invalidateQueries({ queryKey: ['upcoming-hearings'] });
          break;

        case 'JUDGMENT_PRONOUNCED':
        case 'JUDGMENT_DOCUMENT_UPLOADED':
          if (caseId) {
            queryClient.invalidateQueries({ queryKey: ['cases', caseId] });
            queryClient.invalidateQueries({ queryKey: ['judgments', caseId] });
          }
          queryClient.invalidateQueries({ queryKey: ['cases'] });
          queryClient.invalidateQueries({ queryKey: ['judgments'] });
          break;

        case 'REMINDER_DUE':
          queryClient.invalidateQueries({ queryKey: ['reminders'] });
          break;

        case 'NOTIFICATION_CREATED':
        case 'NOTIFICATION_READ':
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          break;
      }
    },
    [queryClient]
  );

  useEffect(() => {
    // 1. Subscribe to status changes
    const unsubStatus = realtimeService.onStatusChange(status => {
      setConnectionStatus(status);
      setLatestEventId(realtimeService.getLatestEventId());
    });

    // 2. Subscribe to all events for query cache invalidation
    const unsubEvents = realtimeService.subscribe('*', handleRealtimeEvent);

    // 3. React Native AppState listener for foreground catch-up
    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          realtimeService.handleAppForeground();
        }
      }
    );

    // 4. Start synchronization service
    if (autoStart) {
      realtimeService.start();
    }

    return () => {
      unsubStatus();
      unsubEvents();
      appStateSubscription.remove();
    };
  }, [autoStart, handleRealtimeEvent]);

  const syncMissedEvents = useCallback(() => {
    return realtimeService.syncMissedEvents();
  }, []);

  return {
    connectionStatus,
    latestEventId,
    syncMissedEvents,
  };
};

/**
 * Hook to observe the connection status of the real-time sync service.
 */
export const useRealtimeStatus = () => {
  const [status, setStatus] = useState<RealtimeConnectionStatus>(
    realtimeService.getStatus()
  );

  useEffect(() => {
    return realtimeService.onStatusChange(setStatus);
  }, []);

  return status;
};

/**
 * Hook to subscribe a component to a specific real-time event type.
 */
export const useRealtimeSubscription = <T = Record<string, unknown>>(
  eventType: RealtimeEventType,
  callback: (event: RealtimeEvent<T>) => void
) => {
  useEffect(() => {
    return realtimeService.subscribe(
      eventType,
      callback as (event: RealtimeEvent) => void
    );
  }, [eventType, callback]);
};
