import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { apiClient } from '../services/api/client';
import { RealtimeManager } from '../features/realtime/realtimeService';
import { RealtimeEvent } from '../features/realtime/types';
import { RealtimeIndicator } from '../components/common/RealtimeIndicator';

jest.mock('../services/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('Phase 7: Real-Time Application Updates (Frontend)', () => {
  let manager: RealtimeManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new RealtimeManager();
    manager.resetDeduplication();
  });

  afterEach(() => {
    manager.stop();
  });

  describe('Deduplication and Monotonic Cursor', () => {
    it('dispatches a new event and advances latestEventId', () => {
      const mockEvent: RealtimeEvent = {
        id: 101,
        event_uuid: 'uuid-101',
        event_type: 'COURT_TOKEN_UPDATED',
        payload: { token_number: 14, case_id: 1 },
        created_at: new Date().toISOString(),
      };

      const listener = jest.fn();
      manager.subscribe('COURT_TOKEN_UPDATED', listener);

      const dispatched = manager.dispatchEvent(mockEvent);
      expect(dispatched).toBe(true);
      expect(listener).toHaveBeenCalledWith(mockEvent);
      expect(manager.getLatestEventId()).toBe(101);
    });

    it('deduplicates events with identical IDs', () => {
      const mockEvent: RealtimeEvent = {
        id: 102,
        event_uuid: 'uuid-102-a',
        event_type: 'HEARING_CHANGED',
        payload: { hearing_id: 5 },
        created_at: new Date().toISOString(),
      };

      const listener = jest.fn();
      manager.subscribe('HEARING_CHANGED', listener);

      expect(manager.dispatchEvent(mockEvent)).toBe(true);
      expect(manager.dispatchEvent(mockEvent)).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('deduplicates events with identical UUIDs even if IDs differ', () => {
      const mockEvent1: RealtimeEvent = {
        id: 103,
        event_uuid: 'uuid-duplicate-check',
        event_type: 'NOTIFICATION_CREATED',
        payload: { notification_id: 99 },
        created_at: new Date().toISOString(),
      };

      const mockEvent2: RealtimeEvent = {
        id: 104,
        event_uuid: 'uuid-duplicate-check',
        event_type: 'NOTIFICATION_CREATED',
        payload: { notification_id: 99 },
        created_at: new Date().toISOString(),
      };

      const listener = jest.fn();
      manager.subscribe('NOTIFICATION_CREATED', listener);

      expect(manager.dispatchEvent(mockEvent1)).toBe(true);
      expect(manager.dispatchEvent(mockEvent2)).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not regress monotonic cursor if an older event arrives out of order', () => {
      manager.setLatestEventId(200);
      const olderEvent: RealtimeEvent = {
        id: 150,
        event_uuid: 'uuid-older',
        event_type: 'JUDGMENT_PRONOUNCED',
        payload: { judgment_id: 1 },
        created_at: new Date().toISOString(),
      };

      manager.dispatchEvent(olderEvent);
      expect(manager.getLatestEventId()).toBe(200);
    });
  });

  describe('Event Subscriptions and Wildcards', () => {
    it('notifies specific listener and wildcard listener', () => {
      const specificListener = jest.fn();
      const wildcardListener = jest.fn();

      const unsubSpecific = manager.subscribe('COURT_TOKEN_UPDATED', specificListener);
      const unsubWildcard = manager.subscribe('*', wildcardListener);

      const event: RealtimeEvent = {
        id: 201,
        event_uuid: 'uuid-201',
        event_type: 'COURT_TOKEN_UPDATED',
        payload: { token_number: 22 },
        created_at: new Date().toISOString(),
      };

      manager.dispatchEvent(event);

      expect(specificListener).toHaveBeenCalledWith(event);
      expect(wildcardListener).toHaveBeenCalledWith(event);

      // Unsubscribe specific
      unsubSpecific();
      const event2: RealtimeEvent = {
        id: 202,
        event_uuid: 'uuid-202',
        event_type: 'COURT_TOKEN_UPDATED',
        payload: { token_number: 23 },
        created_at: new Date().toISOString(),
      };
      manager.dispatchEvent(event2);

      expect(specificListener).toHaveBeenCalledTimes(1);
      expect(wildcardListener).toHaveBeenCalledTimes(2);

      unsubWildcard();
    });

    it('does not deliver unrelated event types to specialized listeners', () => {
      const judgmentListener = jest.fn();
      manager.subscribe('JUDGMENT_PRONOUNCED', judgmentListener);

      const tokenEvent: RealtimeEvent = {
        id: 301,
        event_uuid: 'uuid-301',
        event_type: 'COURT_TOKEN_UPDATED',
        payload: { token_number: 10 },
        created_at: new Date().toISOString(),
      };

      manager.dispatchEvent(tokenEvent);
      expect(judgmentListener).not.toHaveBeenCalled();
    });
  });

  describe('Delta Sync Catch-Up', () => {
    it('fetches missed events using cursor and dispatches them', async () => {
      const mockEvents: RealtimeEvent[] = [
        {
          id: 51,
          event_uuid: 'uuid-51',
          event_type: 'HEARING_RESCHEDULED',
          payload: { hearing_id: 12 },
          created_at: new Date().toISOString(),
        },
        {
          id: 52,
          event_uuid: 'uuid-52',
          event_type: 'NOTIFICATION_READ',
          payload: { unread_count: 0 },
          created_at: new Date().toISOString(),
        },
      ];

      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: {
          events: mockEvents,
          latest_event_id: 52,
          count: 2,
          since_id: 50,
          has_more: false,
        },
      });

      manager.setLatestEventId(50);
      const listener = jest.fn();
      manager.subscribe('*', listener);

      const count = await manager.syncMissedEvents();

      expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('since_id=50'));
      expect(count).toBe(2);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(manager.getLatestEventId()).toBe(52);
    });

    it('paginates when has_more is true', async () => {
      const batch1: RealtimeEvent[] = [
        {
          id: 1,
          event_uuid: 'u-1',
          event_type: 'REMINDER_DUE',
          payload: {},
          created_at: new Date().toISOString(),
        },
      ];
      const batch2: RealtimeEvent[] = [
        {
          id: 2,
          event_uuid: 'u-2',
          event_type: 'REMINDER_DUE',
          payload: {},
          created_at: new Date().toISOString(),
        },
      ];

      (apiClient.get as jest.Mock)
        .mockResolvedValueOnce({
          data: {
            events: batch1,
            latest_event_id: 10,
            count: 1,
            since_id: 0,
            has_more: true,
          },
        })
        .mockResolvedValueOnce({
          data: {
            events: batch2,
            latest_event_id: 10,
            count: 1,
            since_id: 1,
            has_more: false,
          },
        });

      const total = await manager.syncMissedEvents();
      expect(total).toBe(2);
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });

    it('fetches single-use stream ticket from backend', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { ticket: 'secure_random_stream_ticket_12345', expires_in: 60 },
      });

      const ticket = await manager.fetchStreamTicket();
      expect(ticket).toBe('secure_random_stream_ticket_12345');
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/notifications/realtime/ticket/')
      );
    });

    it('handles expired cursor and dispatches full sync signal', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: {
          events: [],
          latest_event_id: 100,
          count: 0,
          since_id: 5,
          has_more: false,
          cursor_expired: true,
          requires_full_sync: true,
        },
      });

      manager.setLatestEventId(5);
      const listener = jest.fn();
      manager.subscribe('*', listener);

      await manager.syncMissedEvents();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: { requires_full_sync: true },
        })
      );
    });
  });

  describe('RealtimeIndicator Component', () => {
    it('renders Live Sync indicator when connected', () => {
      render(React.createElement(RealtimeIndicator, { status: 'CONNECTED' }));
      expect(screen.getByText('Live Sync')).toBeTruthy();
      expect(screen.getByTestId('realtime-indicator-dot')).toBeTruthy();
    });

    it('renders Reconnecting indicator when reconnecting', () => {
      render(React.createElement(RealtimeIndicator, { status: 'RECONNECTING' }));
      expect(screen.getByText('Reconnecting...')).toBeTruthy();
    });

    it('renders Offline indicator when offline', () => {
      render(React.createElement(RealtimeIndicator, { status: 'OFFLINE' }));
      expect(screen.getByText('Offline')).toBeTruthy();
    });
  });
});
