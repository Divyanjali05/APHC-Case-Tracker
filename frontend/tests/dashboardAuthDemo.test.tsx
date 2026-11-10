import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDashboard, DEMO_DASHBOARD_DATA } from '../features/cases/hooks';
import { apiClient } from '../services/api/client';
import { tokenStorage } from '../services/auth/tokenStorage';
import { ENDPOINTS } from '../services/api/endpoints';
import TabLayout from '../app/(tabs)/_layout';
import { render } from '@testing-library/react-native';
import { Platform } from 'react-native';

jest.mock('../services/api/client', () => ({
  apiClient: {
    get: jest.fn(),
  },
  fetchHealthCheck: jest.fn(),
}));

jest.mock('../services/offline/offlineStorage', () => ({
  offlineStorage: {
    saveCachedDashboard: jest.fn().mockResolvedValue(undefined),
    getCachedDashboard: jest.fn().mockResolvedValue(null),
    saveSyncMetadata: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const MockTabs = ({
    children,
    screenOptions,
  }: {
    children: React.ReactNode;
    screenOptions: Record<string, unknown>;
  }) => {
    return React.createElement('Tabs', { screenOptions }, children);
  };
  MockTabs.Screen = ({
    name,
    options,
  }: {
    name: string;
    options: Record<string, unknown>;
  }) => {
    return React.createElement('Tabs.Screen', { name, ...options });
  };
  return {
    Tabs: MockTabs,
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
    }),
  };
});

describe('Dashboard Authentication & Mobile Demo Mode', () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    await tokenStorage.clearTokens();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('tokenStorage Demo Mode State', () => {
    it('defaults isDemoMode to false when no key is set', async () => {
      const isDemo = await tokenStorage.isDemoMode();
      expect(isDemo).toBe(false);
    });

    it('sets and persists demo mode true', async () => {
      await tokenStorage.setDemoMode(true);
      expect(await tokenStorage.isDemoMode()).toBe(true);
    });

    it('resets demo mode to false when saving authenticated tokens', async () => {
      await tokenStorage.setDemoMode(true);
      expect(await tokenStorage.isDemoMode()).toBe(true);

      await tokenStorage.saveTokens('mock_access', 'mock_refresh', 'AP/999/2024');
      expect(await tokenStorage.isDemoMode()).toBe(false);
    });

    it('resets demo mode to false when clearing tokens / logout', async () => {
      await tokenStorage.setDemoMode(true);
      expect(await tokenStorage.isDemoMode()).toBe(true);

      await tokenStorage.clearTokens();
      expect(await tokenStorage.isDemoMode()).toBe(false);
    });
  });

  describe('useDashboard Demo Mode Isolation', () => {
    it('returns DEMO_DASHBOARD_DATA without calling apiClient.get when in demo mode', async () => {
      await tokenStorage.setDemoMode(true);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useDashboard(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiClient.get).not.toHaveBeenCalled();
      expect(result.current.data?.isDemoData).toBe(true);
      expect(result.current.data?.summary.total_cases).toBe(
        DEMO_DASHBOARD_DATA.summary.total_cases
      );
      expect(result.current.data?.today_hearings.length).toBe(
        DEMO_DASHBOARD_DATA.today_hearings.length
      );
    });

    it('calls apiClient.get(ENDPOINTS.CASES.DASHBOARD) when NOT in demo mode', async () => {
      await tokenStorage.setDemoMode(false);
      await tokenStorage.saveTokens('valid_token', 'valid_refresh', 'AP/123/2024');

      const mockLiveDashboard = {
        summary: {
          total_cases: 5,
          pending_cases: 3,
          disposed_cases: 2,
          adjourned_cases: 0,
        },
        today_hearings: [],
        upcoming_hearings: [],
        upcoming_reminders: [],
        recent_notifications: [],
        sync_status: {
          last_synced_at: new Date().toISOString(),
          status: 'FRESH' as const,
        },
      };

      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: mockLiveDashboard,
        status: 200,
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useDashboard(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiClient.get).toHaveBeenCalledWith(ENDPOINTS.CASES.DASHBOARD);
      expect(result.current.data?.isDemoData).toBe(false);
      expect(result.current.data?.summary.total_cases).toBe(5);
    });

    it('rejects with 401 error when not in demo mode and unauthenticated', async () => {
      await tokenStorage.setDemoMode(false);
      const error401 = new Error('Request failed with status code 401');
      (apiClient.get as jest.Mock).mockRejectedValueOnce(error401);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useDashboard(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(apiClient.get).toHaveBeenCalledWith(ENDPOINTS.CASES.DASHBOARD);
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('Tab Bar Layout Responsive Dimensions', () => {
    it('sets tab bar height >= 68 and item minHeight >= 48 to avoid label collision', () => {
      const { toJSON } = render(<TabLayout />);
      const tree = toJSON() as unknown as {
        props?: {
          screenOptions?: {
            tabBarStyle?: { height?: number };
            tabBarItemStyle?: { minHeight?: number };
          };
        };
      };

      expect(tree).toBeTruthy();
      const screenOptions = tree.props?.screenOptions;
      expect(screenOptions).toBeTruthy();

      const expectedHeight = Platform.OS === 'ios' ? 88 : 68;
      expect(screenOptions?.tabBarStyle?.height).toBe(expectedHeight);
      expect(screenOptions?.tabBarItemStyle?.minHeight).toBe(48);
    });
  });
});
