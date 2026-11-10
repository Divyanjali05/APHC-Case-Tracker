import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import MoreScreen from '../app/(tabs)/more';
import { useAuth } from '../features/auth/AuthContext';
import { pushNotificationService } from '../services/notifications/pushService';
import i18n from '../i18n';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('../features/auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../services/notifications/pushService', () => ({
  pushNotificationService: {
    deactivatePushNotifications: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../components/notifications/NotificationCenterModal', () => ({
  NotificationCenterModal: ({ visible }: { visible: boolean }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const React = require('react');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { View } = require('react-native');
    return visible ? React.createElement(View, { testID: 'mock-notif-modal' }) : null;
  },
}));

describe('More Hub Screen & Role-Based Controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    i18n.changeLanguage('en');
  });

  it('renders practice tools, settings, language switcher, and hides Admin card for ADVOCATE role', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        id: 2,
        username: 'AP/8888/2021',
        email: 'adv@aphc.in',
        full_name: 'Lakshmi Rao',
        role: 'ADVOCATE',
        is_admin: false,
        profile: {
          bar_council_enrollment_number: 'AP/8888/2021',
          is_verified: true,
        },
      },
      role: 'ADVOCATE',
      isAdmin: false,
      isAuthenticated: true,
      isDemo: false,
      signOut: mockSignOut,
    });

    render(<MoreScreen />);

    expect(screen.getByTestId('more-screen')).toBeTruthy();
    expect(screen.getByTestId('more-role-badge')).toBeTruthy();
    expect(screen.queryByTestId('more-admin-card')).toBeNull();

    fireEvent.press(screen.getByTestId('more-nav-reminders'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/reminders');

    fireEvent.press(screen.getByTestId('more-nav-tokens'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/tokens');

    fireEvent.press(screen.getByTestId('more-nav-settings'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/settings');

    fireEvent.press(screen.getByTestId('more-lang-te'));
    expect(i18n.language).toBe('te');
  });

  it('renders Admin Console card and navigates to /admin for authenticated ADMIN', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        id: 1,
        username: 'admin',
        email: 'admin@aphc.in',
        full_name: 'Practice Admin',
        role: 'ADMIN',
        is_admin: true,
        profile: null,
      },
      role: 'ADMIN',
      isAdmin: true,
      isAuthenticated: true,
      isDemo: false,
      signOut: mockSignOut,
    });

    render(<MoreScreen />);

    expect(screen.getByTestId('more-admin-card')).toBeTruthy();
    fireEvent.press(screen.getByTestId('more-admin-workspace-button'));
    expect(mockPush).toHaveBeenCalledWith('/admin');
  });

  it('confirms logout via ConfirmDialog and routes back to Welcome page', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        id: 2,
        username: 'AP/8888/2021',
        full_name: 'Lakshmi Rao',
        role: 'ADVOCATE',
        is_admin: false,
        profile: null,
      },
      role: 'ADVOCATE',
      isAdmin: false,
      isAuthenticated: true,
      isDemo: false,
      signOut: mockSignOut,
    });

    render(<MoreScreen />);

    fireEvent.press(screen.getByTestId('more-logout-button'));
    expect(screen.getByTestId('more-logout-confirm')).toBeTruthy();

    fireEvent.press(screen.getByTestId('more-logout-confirm-confirm'));

    await waitFor(() => {
      expect(pushNotificationService.deactivatePushNotifications).toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });
});
