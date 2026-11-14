import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import DashboardScreen from '../app/(tabs)/index';
import { useDashboard } from '../features/cases/hooks';
import { speechService } from '../services/speech/ttsService';
import { DashboardData } from '../types';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@tanstack/react-query', () => {
  const original = jest.requireActual('@tanstack/react-query');
  return {
    ...original,
    useQuery: jest.fn(),
  };
});

jest.mock('react-i18next', () => {
  const enTranslations = require('../i18n/locales/en.json');
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string) => {
        const parts = key.split('.');
        let current: unknown = enTranslations;
        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) {
            current = (current as Record<string, unknown>)[part];
          } else {
            return fallback || key;
          }
        }
        return typeof current === 'string' ? current : fallback || key;
      },
      i18n: {
        language: 'en',
        changeLanguage: jest.fn(),
      },
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

const mockDashboardData: DashboardData & { isOfflineCached?: boolean; cachedAt?: string } = {
  summary: {
    total_cases: 12,
    pending_cases: 7,
    disposed_cases: 3,
    adjourned_cases: 2,
  },
  today_hearings: [
    {
      id: 101,
      case_id: 1,
      case_number: 'WP 1234/2024',
      petitioner: 'Srinivasa Rao',
      respondent: 'State of AP',
      court_hall: 4,
      item_number: 12,
      judge: "Court Hall 4 - Hon'ble Justice Reddy",
      hearing_date: '2026-11-07',
      hearing_time: '10:30:00',
      status: 'SCHEDULED',
    },
  ],
  upcoming_hearings: [
    {
      id: 102,
      case_id: 2,
      case_number: 'WA 5678/2024',
      petitioner: 'Venkata Ramana',
      respondent: 'AP Transco',
      court_hall: 2,
      item_number: 5,
      judge: 'Court Hall 2 - Division Bench',
      hearing_date: '2026-11-10',
      hearing_time: '11:00:00',
      status: 'SCHEDULED',
    },
  ],
  upcoming_reminders: [
    {
      id: 201,
      case_id: 1,
      case_number: 'WP 1234/2024',
      title: 'Submit Counter Affidavit',
      reminder_type: 'FILING',
      due_date: '2026-11-09T10:00:00Z',
      status: 'PENDING',
    },
  ],
  recent_notifications: [
    {
      id: 301,
      title: 'Item 12 Called',
      body: 'Item 12 is now called in Court Hall 4',
      category: 'TOKEN_ALERT',
      is_read: false,
      sent_at: '2026-11-07T10:15:00Z',
      case_id: 1,
    },
  ],
  sync_status: {
    last_synced_at: '2026-11-07T09:00:00Z',
    is_fresh: true,
    status: 'FRESH',
  },
  isOfflineCached: false,
};

describe('DashboardScreen Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const { useQuery } = require('@tanstack/react-query');
    useQuery.mockReturnValue({
      data: {
        status: 'ok',
        service: 'APHC Case Tracker API',
        version: '1.0.0',
        engine: 'django',
        database: 'sqlite',
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    (useDashboard as jest.Mock).mockReturnValue({
      data: mockDashboardData,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });
  });

  it('renders dashboard screen with court heading and app branding', () => {
    render(<DashboardScreen />);

    expect(screen.getByTestId('dashboard-screen')).toBeTruthy();
    expect(screen.getByText('APHC AMARAVATI')).toBeTruthy();
    expect(screen.getByText('APHC Case Tracker')).toBeTruthy();
    expect(screen.getByText('High Court of Andhra Pradesh')).toBeTruthy();
  });

  it('renders aggregated summary statistics cards correctly', () => {
    render(<DashboardScreen />);

    expect(screen.getByTestId('stat-total-cases')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();

    expect(screen.getByTestId('stat-pending-cases')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();

    expect(screen.getByTestId('stat-disposed-cases')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();

    expect(screen.getByTestId('stat-adjourned-cases')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it("renders today's scheduled hearings section and items", () => {
    render(<DashboardScreen />);

    expect(screen.getByTestId('today-hearings-section')).toBeTruthy();
    expect(screen.getByTestId('today-hearing-item-101')).toBeTruthy();
    expect(screen.getAllByText('WP 1234/2024').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Srinivasa Rao vs State of AP')).toBeTruthy();
    expect(screen.getByText('Hall 4')).toBeTruthy();
    expect(screen.getByText('Item #12')).toBeTruthy();
  });

  it('renders upcoming hearings section with schedule info', () => {
    render(<DashboardScreen />);

    expect(screen.getByTestId('upcoming-hearings-section')).toBeTruthy();
    expect(screen.getByTestId('upcoming-hearing-item-102')).toBeTruthy();
    expect(screen.getByText('WA 5678/2024')).toBeTruthy();
    expect(screen.getByText('Venkata Ramana vs AP Transco')).toBeTruthy();
    expect(screen.getByText('2026-11-10')).toBeTruthy();
  });

  it('renders compliance reminders and recent alerts', () => {
    render(<DashboardScreen />);

    expect(screen.getByTestId('upcoming-reminders-section')).toBeTruthy();
    expect(screen.getByTestId('reminder-item-201')).toBeTruthy();
    expect(screen.getByText('Submit Counter Affidavit')).toBeTruthy();

    expect(screen.getByTestId('recent-notifications-section')).toBeTruthy();
    expect(screen.getByTestId('notification-item-301')).toBeTruthy();
    expect(screen.getByText(/Item 12 Called/)).toBeTruthy();
  });

  it('renders clean empty states when no court hearings or reminders exist', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: {
        summary: { total_cases: 0, pending_cases: 0, disposed_cases: 0, adjourned_cases: 0 },
        today_hearings: [],
        upcoming_hearings: [],
        upcoming_reminders: [],
        recent_notifications: [],
        sync_status: { last_synced_at: null, is_fresh: false, status: 'NEVER_SYNCED' },
        isOfflineCached: false,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });

    render(<DashboardScreen />);

    expect(screen.getByText('No hearings listed for today.')).toBeTruthy();
    expect(screen.getByText('No upcoming hearings found.')).toBeTruthy();
    expect(screen.getByText('No pending reminders.')).toBeTruthy();
    expect(screen.getByText('No recent notifications.')).toBeTruthy();
  });

  it('displays encrypted offline snapshot banner when running from offline cache', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: {
        ...mockDashboardData,
        isOfflineCached: true,
        cachedAt: '2026-11-07T08:30:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });

    render(<DashboardScreen />);

    expect(screen.getByTestId('dashboard-offline-banner')).toBeTruthy();
    expect(screen.getByText(/Displaying encrypted offline snapshot/)).toBeTruthy();
  });

  it('triggers text-to-speech with docket summary on voice read press', () => {
    render(<DashboardScreen />);

    const voiceBtn = screen.getByTestId('voice-read-button');
    fireEvent.press(voiceBtn);

    expect(speechService.speak).toHaveBeenCalledTimes(1);
    const spokenText = (speechService.speak as jest.Mock).mock.calls[0][0];
    expect(spokenText).toContain('High Court of Andhra Pradesh');
    expect(spokenText).toContain('Total Cases: 12');
  });

  it('renders error card with retry button when query fails', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
      isRefetching: false,
    });

    render(<DashboardScreen />);

    expect(screen.getByText('Failed to load dashboard data')).toBeTruthy();
    expect(screen.getByTestId('dashboard-retry-button')).toBeTruthy();
  });
});
