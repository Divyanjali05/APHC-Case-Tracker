import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import TabLayout from '../app/(tabs)/_layout';
import DashboardScreen from '../app/(tabs)/index';
import { useDashboard } from '../features/cases/hooks';
import { fetchHealthCheck } from '../services/api/client';

const mockPush = jest.fn();

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
      push: mockPush,
      replace: jest.fn(),
    }),
  };
});

jest.mock('@tanstack/react-query', () => {
  const original = jest.requireActual('@tanstack/react-query');
  return {
    ...original,
    useQuery: jest.fn().mockReturnValue({
      data: {
        status: 'ok',
        service: 'APHC API',
        version: '1.0.0',
        engine: 'postgresql',
        database: 'neondb',
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    }),
  };
});

jest.mock('../features/cases/hooks', () => ({
  useDashboard: jest.fn(),
}));

jest.mock('../services/api/client', () => ({
  fetchHealthCheck: jest.fn(),
}));

jest.mock('../services/speech/ttsService', () => ({
  speechService: {
    speak: jest.fn(),
  },
}));

describe('Four-Section Bottom Navigation Bar & Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('configures strictly 4 visible primary tabs: Home, Cases, Calendar, More', () => {
    const { toJSON } = render(<TabLayout />);
    const tree = toJSON() as unknown as {
      children: Array<{
        props?: { name?: string; tabBarTestID?: string; href?: unknown };
      }>;
    };
    expect(tree).toBeTruthy();

    const screens = Array.isArray(tree.children) ? tree.children : [tree.children];
    const visibleTabs = screens.filter(s => s?.props?.href !== null);
    const visibleNames = visibleTabs.map(s => s?.props?.name);

    expect(visibleTabs).toHaveLength(4);
    expect(visibleNames).toEqual(['index', 'cases', 'calendar', 'more']);

    const tabHome = screens.find(s => s?.props?.name === 'index');
    expect(tabHome?.props?.tabBarTestID).toBe('tab-dashboard');

    const tabCases = screens.find(s => s?.props?.name === 'cases');
    expect(tabCases?.props?.tabBarTestID).toBe('tab-cases');

    const tabCalendar = screens.find(s => s?.props?.name === 'calendar');
    expect(tabCalendar?.props?.tabBarTestID).toBe('tab-calendar');

    const tabMore = screens.find(s => s?.props?.name === 'more');
    expect(tabMore?.props?.tabBarTestID).toBe('tab-more');
  });

  it('hides Reminders, Tokens, and Settings from bottom bar with href: null while keeping routes', () => {
    const { toJSON } = render(<TabLayout />);
    const tree = toJSON() as unknown as {
      children: Array<{
        props?: { name?: string; tabBarTestID?: string; href?: unknown };
      }>;
    };
    const screens = Array.isArray(tree.children) ? tree.children : [tree.children];

    for (const secondaryName of ['reminders', 'tokens', 'settings']) {
      const hiddenScreen = screens.find(s => s?.props?.name === secondaryName);
      expect(hiddenScreen).toBeTruthy();
      expect(hiddenScreen?.props?.href).toBeNull();
      expect(hiddenScreen?.props?.tabBarTestID).toBeUndefined();
    }
  });

  it('renders Tokens navigation card on Dashboard and navigates to tokens route', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: {
        summary: {
          total_cases: 5,
          pending_cases: 2,
          disposed_cases: 2,
          adjourned_cases: 1,
        },
        today_hearings: [],
        upcoming_hearings: [],
        upcoming_reminders: [],
        recent_notifications: [],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });
    (fetchHealthCheck as jest.Mock).mockResolvedValue({
      status: 'ok',
      service: 'APHC API',
      version: '1.0.0',
      engine: 'postgresql',
      database: 'neondb',
    });

    render(<DashboardScreen />);

    expect(screen.getByTestId('dashboard-tokens-card')).toBeTruthy();
    const tokensAction = screen.getByTestId('dashboard-tokens-action');
    expect(tokensAction).toBeTruthy();

    fireEvent.press(tokensAction);
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/tokens');
  });
});
