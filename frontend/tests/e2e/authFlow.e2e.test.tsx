import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AxiosResponse } from 'axios';
import { MainHomePage } from '../../components/home/MainHomePage';
import LoginScreen from '../../app/(auth)/login';
import RegisterScreen from '../../app/(auth)/register';
import TabLayout from '../../app/(tabs)/_layout';
import SettingsScreen from '../../app/(tabs)/settings';
import { AuthProvider } from '../../features/auth/AuthContext';
import { apiClient } from '../../services/api/client';
import { tokenStorage } from '../../services/auth/tokenStorage';
import { ENDPOINTS } from '../../services/api/endpoints';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const { View } = require('react-native');
  const TabsComp = ({ children }: { children: React.ReactNode }) => (
    <View testID="authenticated-tabs-dashboard">{children}</View>
  );
  (TabsComp as unknown as { Screen: React.FC }).Screen = () => null;
  return {
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
    }),
    Tabs: TabsComp,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

jest.mock('../../services/speech/ttsService', () => ({
  speechService: { speak: jest.fn() },
}));

jest.mock('../../services/notifications/pushService', () => ({
  pushNotificationService: {
    deactivatePushNotifications: jest.fn().mockResolvedValue(undefined),
  },
}));

// Stateful in-memory token store simulating secure storage persistence across reloads
const memoryStore: { access: string | null; refresh: string | null } = {
  access: null,
  refresh: null,
};

jest.mock('../../services/auth/tokenStorage', () => ({
  tokenStorage: {
    saveTokens: jest.fn(async (access: string, refresh: string) => {
      memoryStore.access = access;
      memoryStore.refresh = refresh;
    }),
    getAccessToken: jest.fn(async () => memoryStore.access),
    getRefreshToken: jest.fn(async () => memoryStore.refresh),
    clearTokens: jest.fn(async () => {
      memoryStore.access = null;
      memoryStore.refresh = null;
    }),
  },
}));

function makeDeterministicJwt(expEpochSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url'
  );
  const payload = Buffer.from(
    JSON.stringify({ user_id: 9191, exp: expEpochSeconds })
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

describe('E2E Flow 1: Complete Landing, Direct Registration, Login, Persistence & Logout Journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    memoryStore.access = null;
    memoryStore.refresh = null;
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1.1 Renders Landing Page when unauthenticated and navigates to Login & Register', async () => {
    render(
      <AuthProvider>
        <TabLayout />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('main-home-page')).toBeTruthy();
    });
    expect(screen.queryByTestId('authenticated-tabs-dashboard')).toBeNull();

    // Step 3-4: Click Login -> Login route
    fireEvent.press(screen.getByTestId('landing-login-button'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');

    // Step 5-7: Click Register -> Register route
    fireEvent.press(screen.getByTestId('landing-register-button'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/register');
  });

  it('1.2 Login screen validates empty credentials, invalid credentials, and navigates to forgot-password', async () => {
    render(
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>
    );

    expect(screen.getByTestId('login-screen')).toBeTruthy();
    expect(screen.getByTestId('forgot-password-link')).toBeTruthy();

    // Empty submission rejected client-side
    fireEvent.press(screen.getByTestId('login-submit-button'));
    expect(await screen.findByText('Enrollment number is required')).toBeTruthy();
    expect(await screen.findByText('Password must be at least 6 characters')).toBeTruthy();
    expect(tokenStorage.saveTokens).not.toHaveBeenCalled();

    // Forgot-password link navigation
    fireEvent.press(screen.getByTestId('forgot-password-link'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/forgot-password');

    // Invalid credentials handled gracefully
    jest.spyOn(apiClient, 'post').mockRejectedValueOnce({
      response: { status: 401, data: { detail: 'No active account found' } },
    });
    fireEvent.changeText(screen.getByTestId('enrollment-input'), 'AP/0000/2020');
    fireEvent.changeText(screen.getByTestId('password-input'), 'WrongPass123!');
    fireEvent.press(screen.getByTestId('login-submit-button'));
    expect(await screen.findByText('auth.invalidCredentials')).toBeTruthy();
    expect(tokenStorage.saveTokens).not.toHaveBeenCalled();
  });

  it('1.3 Completes full journey: Register -> Login -> Dashboard -> Reload Persistence -> Logout -> Landing Page', async () => {
    const validJwt = makeDeterministicJwt(1700003600);
    const postSpy = jest.spyOn(apiClient, 'post').mockImplementation(async url => {
      if (url === ENDPOINTS.AUTH.REGISTER) {
        return {
          status: 201,
          data: {
            detail:
              'Advocate account registered successfully. You can now log in with your Bar Council enrollment number.',
            enrollment_number: 'AP/9191/2025',
            user: {
              id: 9191,
              username: 'AP/9191/2025',
              email: 'e2e.advocate@example.com',
              profile: {
                bar_council_enrollment_number: 'AP/9191/2025',
                role: 'ASSOCIATE',
              },
            },
          },
        } as AxiosResponse;
      }
      if (url === ENDPOINTS.AUTH.TOKEN) {
        return {
          status: 200,
          data: {
            access: validJwt,
            refresh: 'e2e_refresh_token_9191',
          },
        } as AxiosResponse;
      }
      if (url === ENDPOINTS.AUTH.LOGOUT) {
        return {
          status: 200,
          data: { detail: 'Logged out and refresh token revoked successfully.' },
        } as AxiosResponse;
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    // 1. Direct advocate registration (no OTP)
    const regRender = render(
      <AuthProvider>
        <RegisterScreen />
      </AuthProvider>
    );

    fireEvent.changeText(screen.getByTestId('register-enrollment-input'), 'ap/9191/2025');
    fireEvent.changeText(
      screen.getByTestId('register-email-input'),
      'e2e.advocate@example.com'
    );
    fireEvent.changeText(screen.getByTestId('register-firstname-input'), 'Anil');
    fireEvent.changeText(screen.getByTestId('register-lastname-input'), 'Kumar');
    fireEvent.changeText(
      screen.getByTestId('register-password-input'),
      'Advocate#E2E2026!'
    );
    fireEvent.changeText(
      screen.getByTestId('register-confirm-password-input'),
      'Advocate#E2E2026!'
    );
    fireEvent.press(screen.getByTestId('register-submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('register-success-banner')).toBeTruthy();
    });
    expect(postSpy).toHaveBeenCalledWith(ENDPOINTS.AUTH.REGISTER, {
      enrollment_number: 'AP/9191/2025',
      email: 'e2e.advocate@example.com',
      first_name: 'Anil',
      last_name: 'Kumar',
      password: 'Advocate#E2E2026!',
      confirm_password: 'Advocate#E2E2026!',
    });

    fireEvent.press(screen.getByTestId('register-proceed-login-button'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    regRender.unmount();

    // 2. Log in with newly registered advocate account -> Dashboard
    const loginRender = render(
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>
    );

    fireEvent.changeText(screen.getByTestId('enrollment-input'), 'ap/9191/2025');
    fireEvent.changeText(screen.getByTestId('password-input'), 'Advocate#E2E2026!');
    fireEvent.press(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(tokenStorage.saveTokens).toHaveBeenCalledWith(
        validJwt,
        'e2e_refresh_token_9191'
      );
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
    loginRender.unmount();

    // 3. Reload application -> persisted session renders Dashboard (NOT Landing Page)
    const reloadRender = render(
      <AuthProvider>
        <TabLayout />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated-tabs-dashboard')).toBeTruthy();
    });
    expect(screen.queryByTestId('main-home-page')).toBeNull();
    reloadRender.unmount();

    // 4. Logout from Settings -> revokes refresh token, clears tokens, redirects to Landing Page
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const destructive = buttons?.find(btn => btn.style === 'destructive');
      destructive?.onPress?.();
    });

    const logoutRender = render(
      <AuthProvider>
        <SettingsScreen />
        <TabLayout />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated-tabs-dashboard')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('settings.logout'));

    await waitFor(() => {
      expect(screen.getByTestId('main-home-page')).toBeTruthy();
    });
    expect(postSpy).toHaveBeenCalledWith(ENDPOINTS.AUTH.LOGOUT, {
      refresh: 'e2e_refresh_token_9191',
    });
    expect(memoryStore.access).toBeNull();
    expect(memoryStore.refresh).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/');

    logoutRender.unmount();

    // MainHomePage renders directly when unauthenticated after reload
    render(<MainHomePage />);
    expect(screen.getByTestId('main-home-page')).toBeTruthy();
  }, 15000);
});
