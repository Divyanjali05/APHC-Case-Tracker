import React from 'react';
import { AxiosResponse } from 'axios';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '../services/api/client';
import {
  pushNotificationService,
  APHC_NOTIFICATION_CHANNEL_ID,
} from '../services/notifications/pushService';
import { NotificationCard } from '../components/notifications/NotificationCard';
import { NotificationCenterModal } from '../components/notifications/NotificationCenterModal';
import { NotificationItem } from '../types';
import * as notificationHooks from '../features/notifications/hooks';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultVal?: string) => defaultVal || key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[Test_Client_Device_Token]' }),
  addNotificationReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  AndroidImportance: {
    MAX: 5,
    HIGH: 4,
    DEFAULT: 3,
  },
}));

const mockNotifications: NotificationItem[] = [
  {
    id: 101,
    title: 'Upcoming Hearing: WP 1234/2024',
    body: 'Listed appearance in Court Hall 4 tomorrow.',
    category: 'HEARING_REMINDER',
    is_read: false,
    sent_at: '2026-11-07T10:00:00Z',
    data_payload: { case_id: 42, category: 'HEARING_REMINDER' },
  },
  {
    id: 102,
    title: 'Token 45 CALLED in Court Hall 7',
    body: 'Item #12 has been called.',
    category: 'TOKEN_CALLED',
    is_read: false,
    sent_at: '2026-11-07T10:15:00Z',
    data_payload: { category: 'TOKEN_CALLED' },
  },
  {
    id: 103,
    title: 'Voice Note Transcribed',
    body: 'Audio transcription complete for WP 5678/2024.',
    category: 'VOICE_TRANSCRIPTION_COMPLETED',
    is_read: true,
    sent_at: '2026-11-07T09:30:00Z',
    data_payload: { case_id: 99, category: 'VOICE_TRANSCRIPTION_COMPLETED' },
  },
  {
    id: 104,
    title: 'Compliance Deadline',
    body: 'Counter affidavit filing due on Friday.',
    category: 'COMPLIANCE_DEADLINE',
    is_read: true,
    sent_at: '2026-11-07T08:00:00Z',
    data_payload: { category: 'COMPLIANCE_DEADLINE' },
  },
];

describe('Phase 7: Push Notifications, Device Management & Notification Center', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[Test_Client_Device_Token]',
    });
  });

  // 1. Android Notification Channel Setup
  it('1. configures Android notification channel with high priority and vibration pattern', async () => {
    Platform.OS = 'android';

    await pushNotificationService.setupNotificationChannels();

    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      APHC_NOTIFICATION_CHANNEL_ID,
      expect.objectContaining({
        name: 'APHC High Court Alerts',
        importance: Notifications.AndroidImportance.MAX,
        enableVibrate: true,
        vibrationPattern: [0, 250, 250, 250],
      })
    );
  });

  // 2. Push Token Registration
  it('2. requests permissions, retrieves Expo push token, and registers device payload with backend', async () => {
    Platform.OS = 'android';
    jest.spyOn(SecureStore, 'getItemAsync').mockResolvedValue('device-hardware-uuid-123');
    const apiPostSpy = jest.spyOn(apiClient, 'post').mockResolvedValue({ data: { is_active: true } } as unknown as AxiosResponse);

    const token = await pushNotificationService.registerForPushNotifications();

    expect(token).toBe('ExponentPushToken[Test_Client_Device_Token]');
    expect(apiPostSpy).toHaveBeenCalledWith(
      '/notifications/devices/',
      expect.objectContaining({
        expo_push_token: 'ExponentPushToken[Test_Client_Device_Token]',
        platform: 'android',
        device_id: 'device-hardware-uuid-123',
      })
    );
  });

  // 3. Permission Denied Graceful Handling
  it('3. returns null without registering if notification permissions are denied', async () => {
    Platform.OS = 'android';
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const apiPostSpy = jest.spyOn(apiClient, 'post');

    const token = await pushNotificationService.registerForPushNotifications();

    expect(token).toBeNull();
    expect(apiPostSpy).not.toHaveBeenCalled();
  });

  // 4. Web Platform Returns Null
  it('4. returns null when operating on web platform', async () => {
    Platform.OS = 'web';
    const token = await pushNotificationService.registerForPushNotifications();
    expect(token).toBeNull();
  });

  // 5. Deactivation on Logout
  it('5. deactivates push token with backend on logout and removes local stored token', async () => {
    jest.spyOn(SecureStore, 'getItemAsync').mockImplementation(async key => {
      if (key === 'aphc_registered_push_token') return 'ExponentPushToken[LoggedOutToken]';
      if (key === 'aphc_device_identifier') return 'device-uuid-999';
      return null;
    });
    const deleteSpy = jest.spyOn(SecureStore, 'deleteItemAsync').mockResolvedValue();
    const apiPostSpy = jest.spyOn(apiClient, 'post').mockResolvedValue({ data: { deactivated_count: 1 } } as unknown as AxiosResponse);

    const success = await pushNotificationService.deactivatePushNotifications();

    expect(success).toBe(true);
    expect(apiPostSpy).toHaveBeenCalledWith('/notifications/devices/deactivate/', {
      all: false,
      expo_push_token: 'ExponentPushToken[LoggedOutToken]',
      device_id: 'device-uuid-999',
    });
    expect(deleteSpy).toHaveBeenCalledWith('aphc_registered_push_token');
  });

  // 6. Navigation Route Resolution: Case ID
  it('6. resolves deep link to /cases/:id when case_id is in notification data', () => {
    const route = pushNotificationService.resolveNavigationRoute({ case_id: 1234 });
    expect(route.pathname).toBe('/cases/1234');
  });

  // 7. Navigation Route Resolution: Token Alerts
  it('7. resolves deep link to /(tabs)/tokens for token alert notifications', () => {
    const route = pushNotificationService.resolveNavigationRoute({ category: 'TOKEN_CALLED' });
    expect(route.pathname).toBe('/(tabs)/tokens');
  });

  // 8. Navigation Route Resolution: Calendar Reminders
  it('8. resolves deep link to /(tabs)/calendar for calendar agenda and deadlines', () => {
    const route = pushNotificationService.resolveNavigationRoute({ category: 'COMPLIANCE_DEADLINE' });
    expect(route.pathname).toBe('/(tabs)/calendar');
  });

  // 9. Navigation Route Resolution: Hearing Reminders
  it('9. resolves deep link to /(tabs)/reminders for hearing reminder notifications', () => {
    const route = pushNotificationService.resolveNavigationRoute({ category: 'HEARING_REMINDER' });
    expect(route.pathname).toBe('/(tabs)/reminders');
  });

  // 10. Foreground Listener Registration
  it('10. registers foreground notification received listener correctly', () => {
    const cb = jest.fn();
    pushNotificationService.addForegroundNotificationListener(cb);
    expect(Notifications.addNotificationReceivedListener).toHaveBeenCalledWith(cb);
  });

  // 11. Notification Response / Tap Listener Registration
  it('11. registers background/tap notification response listener correctly', () => {
    const cb = jest.fn();
    pushNotificationService.addNotificationResponseListener(cb);
    expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalledWith(cb);
  });

  // 12. NotificationCard Category Badges
  it('12. renders appropriate category badges for diverse High Court alerts', () => {
    const notif = mockNotifications[1]; // TOKEN_CALLED
    render(<NotificationCard notification={notif} />);

    expect(screen.getByText('Token Called')).toBeTruthy();
    expect(screen.getByText('Token 45 CALLED in Court Hall 7')).toBeTruthy();
  });

  // 13. NotificationCard Mark as Read Button
  it('13. shows unread dot and triggers onMarkRead when button is tapped', () => {
    const notif = mockNotifications[0]; // unread
    const markReadFn = jest.fn();

    render(<NotificationCard notification={notif} onMarkRead={markReadFn} />);

    expect(screen.getByTestId(`unread-dot-${notif.id}`)).toBeTruthy();
    const markBtn = screen.getByTestId(`mark-read-button-${notif.id}`);
    fireEvent.press(markBtn);

    expect(markReadFn).toHaveBeenCalledWith(notif.id);
  });

  // 14. NotificationCard Card Tap Navigation
  it('14. triggers onPress callback with notification data when card is clicked', () => {
    const notif = mockNotifications[0];
    const pressFn = jest.fn();

    render(<NotificationCard notification={notif} onPress={pressFn} />);

    const card = screen.getByTestId(`notification-card-${notif.id}`);
    fireEvent.press(card);

    expect(pressFn).toHaveBeenCalledWith(notif);
  });

  // 15. NotificationCenterModal Header and Badges
  it('15. renders Notification Center modal with unread badge and close button', () => {
    jest.spyOn(notificationHooks, 'useNotifications').mockReturnValue({
      data: mockNotifications,
      refetch: jest.fn(),
      isRefetching: false,
    } as unknown as ReturnType<typeof notificationHooks.useNotifications>);

    const queryClient = new QueryClient();
    const closeFn = jest.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationCenterModal visible={true} onClose={closeFn} />
      </QueryClientProvider>
    );

    expect(screen.getByText('Court Notifications')).toBeTruthy();
    expect(screen.getByTestId('unread-count-badge')).toBeTruthy();
    const closeBtn = screen.getByTestId('close-notifications-btn');
    fireEvent.press(closeBtn);
    expect(closeFn).toHaveBeenCalled();
  });

  // 16. NotificationCenterModal Category Filtering
  it('16. filters notifications by category tabs (Tokens, Hearings, Cases, Voice)', () => {
    jest.spyOn(notificationHooks, 'useNotifications').mockReturnValue({
      data: mockNotifications,
      refetch: jest.fn(),
      isRefetching: false,
    } as unknown as ReturnType<typeof notificationHooks.useNotifications>);

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationCenterModal visible={true} onClose={jest.fn()} />
      </QueryClientProvider>
    );

    const tokensTab = screen.getByTestId('filter-tab-tokens');
    fireEvent.press(tokensTab);

    expect(screen.getByText('Token 45 CALLED in Court Hall 7')).toBeTruthy();
    expect(screen.queryByText('Upcoming Hearing: WP 1234/2024')).toBeNull();
  });

  // 17. NotificationCenterModal Mark All Read
  it('17. triggers mark all notifications as read mutation', () => {
    const markAllMutate = jest.fn();
    jest.spyOn(notificationHooks, 'useNotifications').mockReturnValue({
      data: mockNotifications,
      refetch: jest.fn(),
      isRefetching: false,
    } as unknown as ReturnType<typeof notificationHooks.useNotifications>);
    jest.spyOn(notificationHooks, 'useMarkAllNotificationsRead').mockReturnValue({
      mutate: markAllMutate,
      isPending: false,
    } as unknown as ReturnType<typeof notificationHooks.useMarkAllNotificationsRead>);

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationCenterModal visible={true} onClose={jest.fn()} />
      </QueryClientProvider>
    );

    const markAllBtn = screen.getByTestId('mark-all-read-button');
    fireEvent.press(markAllBtn);

    expect(markAllMutate).toHaveBeenCalled();
  });

  // 18. NotificationCenterModal Card Press Navigates and Marks Read
  it('18. marks notification read and closes modal upon clicking unread item card', () => {
    const markReadMutate = jest.fn();
    jest.spyOn(notificationHooks, 'useNotifications').mockReturnValue({
      data: mockNotifications,
      refetch: jest.fn(),
      isRefetching: false,
    } as unknown as ReturnType<typeof notificationHooks.useNotifications>);
    jest.spyOn(notificationHooks, 'useMarkNotificationRead').mockReturnValue({
      mutate: markReadMutate,
      isPending: false,
    } as unknown as ReturnType<typeof notificationHooks.useMarkNotificationRead>);
    const closeFn = jest.fn();
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationCenterModal visible={true} onClose={closeFn} />
      </QueryClientProvider>
    );

    const unreadCard = screen.getByTestId('notification-item-101');
    fireEvent.press(unreadCard);

    expect(markReadMutate).toHaveBeenCalledWith(101);
    expect(closeFn).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/cases/42');
  });
});
