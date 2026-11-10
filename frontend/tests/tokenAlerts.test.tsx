import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import TokensScreen from '../app/(tabs)/tokens';
import {
  useCourtHalls,
  useTokenAlerts,
  useCreateTokenAlert,
  useCancelTokenAlert,
  useSyncTokenAlert,
} from '../features/tokens/hooks';
import { useCases } from '../features/cases/hooks';
import { CourtHallItem, TokenAlertRuleItem } from '../types';

jest.mock('../features/tokens/hooks');
jest.mock('../features/cases/hooks');

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

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

const mockHalls: CourtHallItem[] = [
  {
    id: 1,
    hall_number: 1,
    bench_name: "Hon'ble Chief Justice Bench",
    presiding_judges: 'Chief Justice Dhiraj Singh Thakur',
    is_active: true,
    status: {
      current_item_number: 12,
      current_stage: 'REGULAR_MOTION',
      last_polled_at: new Date().toISOString(),
    },
  },
  {
    id: 2,
    hall_number: 2,
    bench_name: 'Court Hall 2 Division Bench',
    is_active: true,
    status: {
      current_item_number: 5,
      current_stage: 'ADMISSION',
      last_polled_at: new Date().toISOString(),
    },
  },
];

const mockAlerts: TokenAlertRuleItem[] = [
  {
    id: 101,
    case: 1,
    case_details: {
      id: 1,
      case_type: 'WP',
      case_number: '1234',
      filing_year: 2026,
      petitioner: 'Suresh Kumar',
      respondent: 'State of AP',
      formatted_case_number: 'WP 1234/2026',
    },
    court_hall: 1,
    court_hall_details: {
      id: 1,
      hall_number: 1,
      bench_name: "Hon'ble Chief Justice Bench",
    },
    court_name: 'High Court of Andhra Pradesh',
    hearing_date: '2026-11-07',
    token_number: 'CH1-15',
    listed_item_number: 15,
    bench_name: "Hon'ble Chief Justice Bench",
    alert_threshold: 5,
    alert_on_approach: true,
    alert_on_called: true,
    status: 'APPROACHING',
    current_called_token: '12',
    items_remaining: 3,
    distance: 3,
    is_active: true,
    is_stale: false,
    last_synced_at: new Date().toISOString(),
    sync_source: 'APHC_DEMO_PROVIDER',
    is_mock: true,
    approaching_alert_sent: true,
    called_alert_sent: false,
    is_notified: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 102,
    case: 2,
    case_details: {
      id: 2,
      case_type: 'WA',
      case_number: '5678',
      filing_year: 2026,
      petitioner: 'Ramesh Naidu',
      respondent: 'APSRTC',
      formatted_case_number: 'WA 5678/2026',
    },
    court_hall: 2,
    court_hall_details: {
      id: 2,
      hall_number: 2,
      bench_name: 'Court Hall 2 Division Bench',
    },
    court_name: 'High Court of Andhra Pradesh',
    hearing_date: '2026-11-07',
    token_number: 'CH2-25',
    listed_item_number: 25,
    bench_name: 'Court Hall 2 Division Bench',
    alert_threshold: 5,
    alert_on_approach: true,
    alert_on_called: true,
    status: 'WAITING',
    current_called_token: '5',
    items_remaining: 20,
    distance: 20,
    is_active: true,
    is_stale: true, // Test stale banner
    last_synced_at: new Date().toISOString(),
    sync_source: 'APHC_DEMO_PROVIDER',
    is_mock: true,
    approaching_alert_sent: false,
    called_alert_sent: false,
    is_notified: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockCases = [
  {
    id: 1,
    case_type: 'WP',
    case_number: '1234',
    filing_year: 2026,
    petitioner: 'Suresh Kumar',
    respondent: 'State of AP',
  },
];

describe('TokensScreen & Token Alerts Integration', () => {
  const mockMutateCreate = jest.fn();
  const mockMutateCancel = jest.fn();
  const mockMutateSync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useCourtHalls as jest.Mock).mockReturnValue({
      data: mockHalls,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });

    (useTokenAlerts as jest.Mock).mockReturnValue({
      data: mockAlerts,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });

    (useCases as jest.Mock).mockReturnValue({
      data: mockCases,
    });

    (useCreateTokenAlert as jest.Mock).mockReturnValue({
      mutateAsync: mockMutateCreate,
      isPending: false,
    });

    (useCancelTokenAlert as jest.Mock).mockReturnValue({
      mutateAsync: mockMutateCancel,
    });

    (useSyncTokenAlert as jest.Mock).mockReturnValue({
      mutateAsync: mockMutateSync,
    });
  });

  it('renders My Token Alerts tab by default with demo notice and alert cards', () => {
    render(<TokensScreen />);

    expect(screen.getByTestId('tokens-screen')).toBeTruthy();
    expect(screen.getByTestId('my-alerts-tab')).toBeTruthy();
    expect(screen.getByTestId('court-halls-tab')).toBeTruthy();
    expect(screen.getByText('DEMO / MOCK DATA SOURCE')).toBeTruthy();
    expect(screen.getByTestId('register-token-button')).toBeTruthy();

    // Verify card 101 rendered with token number, status badge, case number
    expect(screen.getByTestId('token-alert-card-101')).toBeTruthy();
    expect(screen.getByText('Token #CH1-15')).toBeTruthy();
    expect(screen.getByText('WP 1234/2026')).toBeTruthy();
    expect(screen.getByText('APPROACHING')).toBeTruthy();

    // Verify card 102 rendered with stale warning
    expect(screen.getByTestId('token-alert-card-102')).toBeTruthy();
    expect(screen.getByText('Token #CH2-25')).toBeTruthy();
    expect(screen.getByTestId('stale-banner-102')).toBeTruthy();
  });

  it('switches between My Token Alerts and Live Court Halls tabs', () => {
    render(<TokensScreen />);

    // Click on Live Court Halls tab
    fireEvent.press(screen.getByTestId('court-halls-tab'));

    expect(screen.getByTestId('tokens-list')).toBeTruthy();
    expect(screen.getByText('Court Hall 1')).toBeTruthy();
    expect(screen.getByText('Court Hall 2')).toBeTruthy();

    // Switch back to My Token Alerts tab
    fireEvent.press(screen.getByTestId('my-alerts-tab'));
    expect(screen.getByTestId('token-alert-card-101')).toBeTruthy();
  });

  it('renders empty state when no token alerts are registered', () => {
    (useTokenAlerts as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });

    render(<TokensScreen />);
    expect(screen.getByTestId('empty-alerts-state')).toBeTruthy();
    expect(screen.getByText('No Active Token Alerts')).toBeTruthy();
  });

  it('triggers cancel alert mutation when clicking Cancel Alert', () => {
    render(<TokensScreen />);

    const cancelBtn = screen.getByTestId('cancel-button-101');
    fireEvent.press(cancelBtn);

    expect(mockMutateCancel).toHaveBeenCalledWith(101);
  });

  it('triggers manual sync mutation when clicking Sync Now', () => {
    render(<TokensScreen />);

    const syncBtn = screen.getByTestId('sync-button-101');
    fireEvent.press(syncBtn);

    expect(mockMutateSync).toHaveBeenCalledWith(101);
  });

  it('opens registration modal and submits a valid token alert', async () => {
    mockMutateCreate.mockResolvedValueOnce({ id: 103 });

    render(<TokensScreen />);

    // Open modal
    fireEvent.press(screen.getByTestId('register-token-button'));
    expect(screen.getByTestId('register-token-modal')).toBeTruthy();

    // Fill in token number and item number
    fireEvent.changeText(screen.getByTestId('token-number-input'), 'CH1-30');
    fireEvent.changeText(screen.getByTestId('item-number-input'), '30');

    // Submit form
    fireEvent.press(screen.getByTestId('submit-alert-button'));

    expect(mockMutateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        case: 1,
        court_hall: 1,
        token_number: 'CH1-30',
        listed_item_number: 30,
        alert_threshold: 5,
        alert_on_approach: true,
        alert_on_called: true,
      })
    );
  });

  it('displays client-side validation error if token number is missing', () => {
    render(<TokensScreen />);

    fireEvent.press(screen.getByTestId('register-token-button'));

    // Submit with blank token number
    fireEvent.press(screen.getByTestId('submit-alert-button'));

    expect(screen.getByTestId('validation-error')).toBeTruthy();
    expect(screen.getByText(/Token number is required/i)).toBeTruthy();
    expect(mockMutateCreate).not.toHaveBeenCalled();
  });
});
