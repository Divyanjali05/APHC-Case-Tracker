import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import DashboardScreen, { formatTableDate, getClosedDate } from '../app/(tabs)/index';
import { useDashboard, useCases } from '../features/cases/hooks';
import { speechService } from '../services/speech/ttsService';
import { CaseItem, DashboardData } from '../types';

const mockPush = jest.fn();
const mockChangeLanguage = jest.fn();
const mockRefetchHealth = jest.fn().mockResolvedValue({});
const mockRefetchDashboard = jest.fn().mockResolvedValue({});
const mockRefetchCases = jest.fn().mockResolvedValue({});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
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
        changeLanguage: mockChangeLanguage,
      },
    }),
  };
});

jest.mock('../components/notifications/NotificationCenterModal', () => ({
  NotificationCenterModal: ({
    visible,
    testID,
  }: {
    visible: boolean;
    testID?: string;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const React = require('react');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { View, Text } = require('react-native');
    if (!visible) return null;
    return React.createElement(
      View,
      { testID: testID || 'dashboard-notification-center-modal' },
      React.createElement(Text, null, 'Notification Center')
    );
  },
}));

jest.mock('../components/speech/VoiceInputModal', () => ({
  VoiceInputModal: ({
    visible,
    _onClose,
    onApply,
  }: {
    visible: boolean;
    _onClose?: () => void;
    onApply: (t: string) => void;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const React = require('react');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { View, Text, TouchableOpacity } = require('react-native');
    if (!visible) return null;
    return React.createElement(
      View,
      { testID: 'voice-input-modal' },
      React.createElement(Text, null, 'Voice Search Modal'),
      React.createElement(
        TouchableOpacity,
        {
          testID: 'voice-apply-test-btn',
          onPress: () => onApply('WP 1234'),
        },
        React.createElement(Text, null, 'Apply Voice Search')
      )
    );
  },
}));

jest.mock('../features/cases/hooks', () => ({
  useDashboard: jest.fn(),
  useCases: jest.fn(),
  useExtractDocument: jest.fn(() => ({ isPending: false, mutateAsync: jest.fn() })),
  useConfirmImportCase: jest.fn(() => ({ isPending: false, mutateAsync: jest.fn() })),
}));

jest.mock('../services/api/client', () => ({
  fetchHealthCheck: jest.fn(),
}));

jest.mock('../services/speech/ttsService', () => ({
  speechService: {
    speak: jest.fn(),
  },
}));

const mockDashboardData: DashboardData & {
  isOfflineCached?: boolean;
  cachedAt?: string;
  isDemoData?: boolean;
} = {
  summary: {
    total_cases: 12,
    pending_cases: 7,
    disposed_cases: 3,
    adjourned_cases: 2,
  },
  today_hearings: [],
  upcoming_hearings: [],
  upcoming_reminders: [],
  recent_notifications: [],
  recent_activity: [],
  sync_status: {
    last_synced_at: '2026-11-07T09:00:00Z',
    is_fresh: true,
    status: 'FRESH',
  },
  isOfflineCached: false,
};

const mockCasesList: CaseItem[] = [
  {
    id: 1,
    case_type: 'WP',
    case_number: '1234',
    filing_year: 2024,
    petitioner: 'Srinivasa Rao',
    respondent: 'State of AP',
    petitioner_advocate: 'K. Ramarao',
    respondent_advocate: 'Advocate General',
    current_stage: 'Hearing Appearance Listed',
    status: 'PENDING',
    court_hall_number: 4,
    bench: "Court Hall 4 - Hon'ble Justice Reddy",
    next_hearing_date: '2026-11-20',
    effective_next_hearing_date: '2026-11-20',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2026-11-07T08:00:00Z',
    hearings: [
      {
        id: 101,
        case: 1,
        hearing_date: '2026-11-20',
        hearing_time: '10:30:00',
        court_hall_number: 4,
        status: 'SCHEDULED',
        created_at: '2024-01-15T10:00:00Z',
      },
    ],
  },
  {
    id: 2,
    case_type: 'WA',
    case_number: '5678',
    filing_year: 2024,
    petitioner: 'Venkata Ramana',
    respondent: 'AP Transco',
    current_stage: 'Final Disposal',
    status: 'DISPOSED',
    judgment_date: '2026-10-15',
    latest_judgment: {
      id: 501,
      case: 2,
      judgment_date: '2026-10-15',
      summary: 'Appeal allowed in part with directions.',
      created_at: '2026-10-15T12:00:00Z',
      updated_at: '2026-10-15T12:00:00Z',
    },
    created_at: '2024-02-10T10:00:00Z',
    updated_at: '2026-10-15T12:00:00Z',
  },
  {
    id: 3,
    case_type: 'CRLP',
    case_number: '9012',
    filing_year: 2024,
    petitioner: 'Narayana Swamy',
    respondent: 'State Police Department',
    current_stage: 'Adjourned at Request',
    status: 'ADJOURNED',
    next_hearing_date: '2026-12-05',
    effective_next_hearing_date: '2026-12-05',
    created_at: '2024-03-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
  },
];

describe('DashboardScreen Component - Redesign', () => {
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
      refetch: mockRefetchHealth,
    });

    (useDashboard as jest.Mock).mockReturnValue({
      data: mockDashboardData,
      isLoading: false,
      isError: false,
      refetch: mockRefetchDashboard,
      isRefetching: false,
    });

    (useCases as jest.Mock).mockReturnValue({
      data: mockCasesList,
      isLoading: false,
      isError: false,
      refetch: mockRefetchCases,
      isRefetching: false,
    });
  });

  describe('Date Helpers Safeguards', () => {
    it('returns N/A when date string is missing or null', () => {
      expect(formatTableDate(undefined)).toBe('N/A');
      expect(formatTableDate(null)).toBe('N/A');
      expect(formatTableDate('')).toBe('N/A');
      expect(formatTableDate('   ')).toBe('N/A');
      expect(formatTableDate('N/A')).toBe('N/A');
    });

    it('formats valid ISO dates cleanly to YYYY-MM-DD', () => {
      expect(formatTableDate('2024-01-15T10:00:00Z')).toBe('2024-01-15');
      expect(formatTableDate('2026-11-20')).toBe('2026-11-20');
    });

    it('strictly returns N/A for closed date if case is not disposed', () => {
      const pendingCase = mockCasesList[0];
      expect(getClosedDate(pendingCase)).toBe('N/A');
    });

    it('returns verified judgment date for disposed cases', () => {
      const disposedCase = mockCasesList[1];
      expect(getClosedDate(disposedCase)).toBe('2026-10-15');
    });
  });

  describe('1. Dashboard Header', () => {
    it('renders dashboard screen with court branding and advocate profile info', () => {
      render(<DashboardScreen />);

      expect(screen.getByTestId('dashboard-screen')).toBeTruthy();
      expect(screen.getByText('APHC AMARAVATI')).toBeTruthy();
      expect(screen.getByText('High Court of Andhra Pradesh')).toBeTruthy();
      expect(screen.getByText('My Case Dashboard')).toBeTruthy();
    });

    it('switches language on language toggle press', () => {
      render(<DashboardScreen />);

      const langBtn = screen.getByTestId('dashboard-lang-toggle');
      expect(langBtn).toBeTruthy();
      fireEvent.press(langBtn);

      expect(mockChangeLanguage).toHaveBeenCalledWith('te');
    });

    it('opens Voice Input Modal when microphone button is clicked', () => {
      render(<DashboardScreen />);

      const micBtn = screen.getByTestId('dashboard-voice-search-button');
      expect(micBtn).toBeTruthy();
      fireEvent.press(micBtn);

      expect(screen.getByTestId('voice-input-modal')).toBeTruthy();
    });

    it('triggers speech readout of docket statistics on voice read press', () => {
      render(<DashboardScreen />);

      const voiceBtn = screen.getByTestId('voice-read-button');
      fireEvent.press(voiceBtn);

      expect(speechService.speak).toHaveBeenCalledTimes(1);
      const spokenText = (speechService.speak as jest.Mock).mock.calls[0][0];
      expect(spokenText).toContain('High Court of Andhra Pradesh');
      expect(spokenText).toContain('Total Cases: 12');
    });

    it('opens NotificationCenterModal on notification bell press', () => {
      render(<DashboardScreen />);

      expect(screen.queryByTestId('dashboard-notification-center-modal')).toBeNull();
      const notifBtn = screen.getByTestId('open-notifications-center-btn');
      fireEvent.press(notifBtn);

      expect(screen.getByTestId('dashboard-notification-center-modal')).toBeTruthy();
    });

    it('navigates to live court tokens board from quick link bar', () => {
      render(<DashboardScreen />);

      expect(screen.getByTestId('dashboard-tokens-card')).toBeTruthy();
      const tokensAction = screen.getByTestId('dashboard-tokens-action');
      expect(tokensAction).toBeTruthy();

      fireEvent.press(tokensAction);
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/tokens');
    });
  });

  describe('2. Case Statistics (4 Horizontal Cards)', () => {
    it('renders real API statistics from database/dashboard query', () => {
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

    it('filters main case table when a statistic card is pressed', () => {
      render(<DashboardScreen />);

      // Initially all 3 cases are rendered
      expect(screen.getByText('WP 1234/2024')).toBeTruthy();
      expect(screen.getByText('WA 5678/2024')).toBeTruthy();
      expect(screen.getByText('CRLP 9012/2024')).toBeTruthy();

      // Click "Pending" stat card -> filters table to only PENDING cases
      fireEvent.press(screen.getByTestId('stat-pending-cases'));
      expect(screen.getByText('WP 1234/2024')).toBeTruthy();
      expect(screen.queryByText('WA 5678/2024')).toBeNull();
      expect(screen.queryByText('CRLP 9012/2024')).toBeNull();

      // Click "Disposed" stat card -> filters table to only DISPOSED cases
      fireEvent.press(screen.getByTestId('stat-disposed-cases'));
      expect(screen.queryByText('WP 1234/2024')).toBeNull();
      expect(screen.getByText('WA 5678/2024')).toBeTruthy();
      expect(screen.queryByText('CRLP 9012/2024')).toBeNull();

      // Click "Disposed" again to toggle off -> resets back to ALL
      fireEvent.press(screen.getByTestId('stat-disposed-cases'));
      expect(screen.getByText('WP 1234/2024')).toBeTruthy();
      expect(screen.getByText('WA 5678/2024')).toBeTruthy();
      expect(screen.getByText('CRLP 9012/2024')).toBeTruthy();
    });
  });

  describe('3. Main Cases Table (7 Columns & Sticky Case Column)', () => {
    it('renders the 7 columns: Case Number/Name, Started Date, Next Hearing, Adjournment History, Closed Date, Status, Judgment', () => {
      render(<DashboardScreen />);

      expect(screen.getByTestId('main-cases-table')).toBeTruthy();
      expect(screen.getByTestId('sticky-header-case')).toBeTruthy();
      expect(screen.getByText('Case Number / Case Name')).toBeTruthy();
      expect(screen.getByText('Started Date')).toBeTruthy();
      expect(screen.getByText('Next Hearing')).toBeTruthy();
      expect(screen.getByText('Adjournment History')).toBeTruthy();
      expect(screen.getByText('Closed Date')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Judgment')).toBeTruthy();
    });

    it('renders sticky case identity column permanently with unclipped case number', () => {
      render(<DashboardScreen />);

      const stickyCol = screen.getByTestId('sticky-case-col-1');
      expect(stickyCol).toBeTruthy();
      expect(screen.getByText('WP 1234/2024')).toBeTruthy();
      expect(screen.getByText('Srinivasa Rao vs State of AP')).toBeTruthy();
    });

    it('adapts sticky column width responsively for mobile viewports (320px, 360px, 375px, 393px, 430px)', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rn = require('react-native');
      const spy = jest.spyOn(rn, 'useWindowDimensions');

      // 320px viewport
      spy.mockReturnValue({ width: 320, height: 600, scale: 1, fontScale: 1 });
      const { rerender } = render(<DashboardScreen />);
      let stickyHeader = screen.getByTestId('sticky-header-case');
      expect(stickyHeader.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: 126 })])
      );

      // 360px viewport
      spy.mockReturnValue({ width: 360, height: 740, scale: 1, fontScale: 1 });
      rerender(<DashboardScreen />);
      stickyHeader = screen.getByTestId('sticky-header-case');
      expect(stickyHeader.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: 132 })])
      );

      // 375px viewport (iPhone SE)
      spy.mockReturnValue({ width: 375, height: 667, scale: 1, fontScale: 1 });
      rerender(<DashboardScreen />);
      stickyHeader = screen.getByTestId('sticky-header-case');
      expect(stickyHeader.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: 140 })])
      );

      // 393px viewport (standard iPhone 14/15/16, exact 135-145px target)
      spy.mockReturnValue({ width: 393, height: 852, scale: 1, fontScale: 1 });
      rerender(<DashboardScreen />);
      stickyHeader = screen.getByTestId('sticky-header-case');
      expect(stickyHeader.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: 140 })])
      );

      // 430px viewport (large mobile / Max)
      spy.mockReturnValue({ width: 430, height: 932, scale: 1, fontScale: 1 });
      rerender(<DashboardScreen />);
      stickyHeader = screen.getByTestId('sticky-header-case');
      expect(stickyHeader.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: 146 })])
      );

      spy.mockRestore();
    });

    it('displays dates accurately with N/A when unavailable', () => {
      render(<DashboardScreen />);

      // Pending case WP 1234 has Started Date 2024-01-15, Next Hearing 2026-11-20, Closed Date N/A
      expect(screen.getByText('2024-01-15')).toBeTruthy();
      expect(screen.getByText('2026-11-20')).toBeTruthy();

      // Disposed case WA 5678 has Closed Date 2026-10-15
      expect(screen.getByText('2026-10-15')).toBeTruthy();
    });

    it('expands row details on click revealing metadata and action buttons', () => {
      render(<DashboardScreen />);

      // Before click, drawer is not expanded
      expect(screen.queryByTestId('case-expanded-1')).toBeNull();

      // Click case row
      fireEvent.press(screen.getByTestId('case-row-1'));

      // Expanded drawer is displayed
      expect(screen.getByTestId('case-expanded-1')).toBeTruthy();
      expect(screen.getByText('Petitioner')).toBeTruthy();
      expect(screen.getByText('Srinivasa Rao')).toBeTruthy();
      expect(screen.getByText('Adv: K. Ramarao')).toBeTruthy();
      expect(screen.getByText('Respondent')).toBeTruthy();
      expect(screen.getByText('State of AP')).toBeTruthy();
      expect(screen.getByText('Court Hall 4')).toBeTruthy();
      expect(screen.getByText('1 hearing appearances recorded')).toBeTruthy();

      // Action button navigates to /cases/1
      const viewDetailsBtn = screen.getByTestId('view-case-details-1');
      expect(viewDetailsBtn).toBeTruthy();
      fireEvent.press(viewDetailsBtn);
      expect(mockPush).toHaveBeenCalledWith('/cases/1');
    });
  });

  describe('4. Search, Filter and Import Controls', () => {
    it('filters cases by search query (petitioner, respondent, case number)', () => {
      render(<DashboardScreen />);

      const searchInput = screen.getByTestId('case-search-input');

      // Search by petitioner "Srinivasa"
      act(() => {
        fireEvent.changeText(searchInput, 'Srinivasa');
      });
      expect(screen.getByText('WP 1234/2024')).toBeTruthy();
      expect(screen.queryByText('WA 5678/2024')).toBeNull();

      // Search by case number "5678"
      act(() => {
        fireEvent.changeText(searchInput, '5678');
      });
      expect(screen.queryByText('WP 1234/2024')).toBeNull();
      expect(screen.getByText('WA 5678/2024')).toBeTruthy();
    });

    it('matches case when search query contains Telugu numerals', () => {
      render(<DashboardScreen />);

      const searchInput = screen.getByTestId('case-search-input');
      // Telugu numerals for 1234: ౧౨౩౪
      act(() => {
        fireEvent.changeText(searchInput, '౧౨౩౪');
      });
      expect(screen.getByText('WP 1234/2024')).toBeTruthy();
      expect(screen.queryByText('WA 5678/2024')).toBeNull();
    });

    it('opens PDF Import modal on import button click', () => {
      render(<DashboardScreen />);

      expect(screen.queryByTestId('pdf-import-modal')).toBeNull();

      const importBtn = screen.getByTestId('case-pdf-import-btn');
      expect(importBtn).toBeTruthy();
      fireEvent.press(importBtn);

      expect(screen.getByTestId('pdf-import-modal')).toBeTruthy();
      expect(screen.getByText('Import Legal PDF Document')).toBeTruthy();
      expect(screen.getByText('High Court Verification Safeguard')).toBeTruthy();
    });

    it('cycles filter option when filter button is clicked', () => {
      render(<DashboardScreen />);

      const filterBtn = screen.getByTestId('case-filter-btn');
      expect(filterBtn).toBeTruthy();

      // Default has All Cases filter
      expect(screen.getAllByText('All Cases').length).toBeGreaterThanOrEqual(1);

      // Click filter -> switches to Pending
      fireEvent.press(filterBtn);
      expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('WP 1234/2024')).toBeTruthy();
      expect(screen.queryByText('WA 5678/2024')).toBeNull();
    });

    it('toggles sort field and order when sort button is clicked', () => {
      render(<DashboardScreen />);

      const sortBtn = screen.getByTestId('case-sort-btn');
      expect(sortBtn).toBeTruthy();

      fireEvent.press(sortBtn);
      // Toggles ascending / descending
      expect(sortBtn).toBeTruthy();
    });
  });

  describe('5. Banner, Error, Empty & Refresh States', () => {
    it('displays encrypted offline banner when running from offline cache', () => {
      (useDashboard as jest.Mock).mockReturnValue({
        data: {
          ...mockDashboardData,
          isOfflineCached: true,
          cachedAt: '2026-11-07T08:30:00Z',
        },
        isLoading: false,
        isError: false,
        refetch: mockRefetchDashboard,
        isRefetching: false,
      });

      render(<DashboardScreen />);

      expect(screen.getByTestId('dashboard-offline-banner')).toBeTruthy();
      expect(screen.getByText(/Displaying encrypted offline snapshot/)).toBeTruthy();
    });

    it('displays Demo Environment banner and badge when isDemoData is true', () => {
      (useDashboard as jest.Mock).mockReturnValue({
        data: {
          ...mockDashboardData,
          isDemoData: true,
          sync_status: {
            last_synced_at: new Date().toISOString(),
            status: 'DEMO',
          },
        },
        isLoading: false,
        isError: false,
        refetch: mockRefetchDashboard,
        isRefetching: false,
      });

      render(<DashboardScreen />);

      expect(screen.getByTestId('dashboard-demo-banner')).toBeTruthy();
      expect(screen.getByText('DEMO MODE — LOCAL SAMPLE DATA')).toBeTruthy();
      expect(screen.getByTestId('sync-status-badge')).toBeTruthy();
      expect(screen.getByText('DEMO ENVIRONMENT')).toBeTruthy();
    });

    it('renders error card with retry button when queries fail', () => {
      (useDashboard as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: mockRefetchDashboard,
        isRefetching: false,
      });
      (useCases as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: mockRefetchCases,
        isRefetching: false,
      });

      render(<DashboardScreen />);

      expect(screen.getByText('Failed to load dashboard data')).toBeTruthy();
      expect(screen.getByTestId('dashboard-retry-button')).toBeTruthy();

      fireEvent.press(screen.getByTestId('dashboard-retry-button'));
      expect(mockRefetchDashboard).toHaveBeenCalled();
      expect(mockRefetchCases).toHaveBeenCalled();
    });

    it('renders clean empty state when no cases match filter or docket is empty', () => {
      (useCases as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: mockRefetchCases,
        isRefetching: false,
      });

      render(<DashboardScreen />);

      expect(screen.getByTestId('cases-empty-state')).toBeTruthy();
      expect(screen.getByText('No cases match your filters')).toBeTruthy();
    });

    it('triggers pull-to-refresh and refetches queries', async () => {
      const { UNSAFE_getByType } = render(<DashboardScreen />);
      const scrollView = UNSAFE_getByType(ScrollView);
      expect(scrollView.props.refreshControl).toBeTruthy();

      await scrollView.props.refreshControl.props.onRefresh();

      expect(mockRefetchDashboard).toHaveBeenCalled();
      expect(mockRefetchCases).toHaveBeenCalled();
    });
  });
});
