import React from 'react';
import {
  render,
  fireEvent,
  screen,
  waitFor,
  renderHook,
  act,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationCard } from '../components/notifications/NotificationCard';
import RemindersScreen from '../app/(tabs)/reminders';
import { apiClient } from '../services/api/client';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../features/notifications/hooks';
import {
  useReminderPreferences,
  useUpdateReminderPreferences,
  useReminders,
} from '../features/reminders/hooks';
import { useUpcomingHearings } from '../features/cases/hooks';
import { NotificationItem, ReminderPreferenceItem } from '../types';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('../services/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

jest.mock('../features/cases/hooks', () => ({
  useUpcomingHearings: jest.fn(),
  useRescheduleHearing: jest.fn(() => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
    error: null,
  })),
}));

jest.mock('../features/reminders/hooks', () => ({
  useReminders: jest.fn(),
  useReminderPreferences: jest.fn(),
  useUpdateReminderPreferences: jest.fn(),
  useDismissReminder: jest.fn(() => ({
    mutate: jest.fn(),
  })),
}));

const mockJudgmentNotification: NotificationItem = {
  id: 101,
  title: 'Judgment Pronounced: WP 9100/2024',
  body: 'Final judgment pronounced on 2026-11-01 by Hon CJ Bench.',
  category: 'JUDGMENT',
  data_payload: {
    case_id: 42,
    judgment_id: 1,
    order_number: 'OR-2024-9100',
    event: 'PRONOUNCED',
  },
  is_read: false,
  sent_at: '2026-11-01T10:00:00Z',
};

const mockHearingChangeNotification: NotificationItem = {
  id: 102,
  title: 'Hearing Rescheduled: WP 9100/2024',
  body: 'Hearing appearance rescheduled from 2026-11-03 to 2026-11-08.',
  category: 'HEARING_CHANGE',
  data_payload: {
    case_id: 42,
    hearing_id: 5,
    change_type: 'RESCHEDULED',
    new_date: '2026-11-08',
  },
  is_read: true,
  sent_at: '2026-11-01T11:00:00Z',
};

const mockPreferences: ReminderPreferenceItem = {
  id: 1,
  remind_24h_before: true,
  remind_1h_before: true,
  email_notifications: false,
  push_notifications: true,
  judgment_push_notifications: true,
  hearing_change_push_notifications: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('Phase 6: Judgment and Hearing Change Push Notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('NotificationCard Component', () => {
    it('renders JUDGMENT notification with Judgment & Orders badge, title, body, and unread indicator', () => {
      const onMarkRead = jest.fn();
      render(
        <NotificationCard
          notification={mockJudgmentNotification}
          onMarkRead={onMarkRead}
        />
      );

      expect(screen.getByText('Judgment & Orders')).toBeTruthy();
      expect(screen.getByText('Judgment Pronounced: WP 9100/2024')).toBeTruthy();
      expect(
        screen.getByText('Final judgment pronounced on 2026-11-01 by Hon CJ Bench.')
      ).toBeTruthy();
      expect(screen.getByTestId('unread-dot-101')).toBeTruthy();
      expect(screen.getByTestId('mark-read-button-101')).toBeTruthy();

      fireEvent.press(screen.getByTestId('mark-read-button-101'));
      expect(onMarkRead).toHaveBeenCalledWith(101);
    });

    it('renders HEARING_CHANGE notification with Hearing Change badge and hides mark-as-read when already read', () => {
      render(<NotificationCard notification={mockHearingChangeNotification} />);

      expect(screen.getByText('Hearing Change')).toBeTruthy();
      expect(screen.getByText('Hearing Rescheduled: WP 9100/2024')).toBeTruthy();
      expect(screen.queryByTestId('unread-dot-102')).toBeNull();
      expect(screen.queryByTestId('mark-read-button-102')).toBeNull();
    });

    it('renders REMINDER and TOKEN_ALERT category badges accurately', () => {
      const reminderNotif: NotificationItem = {
        id: 103,
        title: 'Upcoming Hearing Tomorrow',
        body: 'Matter listed tomorrow',
        category: 'REMINDER',
        is_read: false,
        sent_at: '2026-11-01T12:00:00Z',
      };
      const tokenNotif: NotificationItem = {
        id: 104,
        title: 'Court Hall Token Alert',
        body: 'Token 14 called in Hall 2',
        category: 'TOKEN_ALERT',
        is_read: true,
        sent_at: '2026-11-01T12:30:00Z',
      };

      const { rerender } = render(<NotificationCard notification={reminderNotif} />);
      expect(screen.getByText('Hearing Reminder')).toBeTruthy();

      rerender(<NotificationCard notification={tokenNotif} />);
      expect(screen.getByText('Court Token Alert')).toBeTruthy();
    });
  });

  describe('RemindersScreen Preference Toggles', () => {
    it('renders and toggles judgment and hearing change push notification preferences', () => {
      const mockMutate = jest.fn();
      (useUpcomingHearings as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
      (useReminders as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
      (useReminderPreferences as jest.Mock).mockReturnValue({
        data: mockPreferences,
        isLoading: false,
      });
      (useUpdateReminderPreferences as jest.Mock).mockReturnValue({
        mutate: mockMutate,
      });

      render(<RemindersScreen />);

      // Switch to Preferences tab
      const prefTab = screen.getByTestId('tab-reminder-preferences');
      fireEvent.press(prefTab);

      // Verify toggles are rendered
      const judgmentToggle = screen.getByTestId('pref-toggle-judgment');
      const hearingChangeToggle = screen.getByTestId('pref-toggle-hearing-change');
      expect(judgmentToggle).toBeTruthy();
      expect(hearingChangeToggle).toBeTruthy();

      // Toggle judgment alerts
      fireEvent(judgmentToggle, 'valueChange', false);
      expect(mockMutate).toHaveBeenCalledWith({
        judgment_push_notifications: false,
      });

      // Toggle hearing change alerts
      fireEvent(hearingChangeToggle, 'valueChange', false);
      expect(mockMutate).toHaveBeenCalledWith({
        hearing_change_push_notifications: false,
      });
    });
  });

  describe('Notification Hooks', () => {
    it('useNotifications queries endpoints with filters', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [mockJudgmentNotification],
      });

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(
        () => useNotifications({ category: 'JUDGMENT', is_read: false }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/notifications/history/?category=JUDGMENT&is_read=false')
      );
      expect(result.current.data).toEqual([mockJudgmentNotification]);
    });

    it('useMarkNotificationRead posts to mark-read endpoint', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { ...mockJudgmentNotification, is_read: true },
      });

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(101);
      });

      expect(apiClient.post).toHaveBeenCalledWith('/notifications/101/read/');
    });

    it('useMarkAllNotificationsRead posts to mark-all-read endpoint', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { marked_read_count: 3 },
      });

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('JUDGMENT');
      });

      expect(apiClient.post).toHaveBeenCalledWith('/notifications/mark-all-read/', {
        category: 'JUDGMENT',
      });
    });
  });
});
