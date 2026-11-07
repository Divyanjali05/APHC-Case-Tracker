import React from 'react';
import { render, fireEvent, screen, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CasesScreen from '../app/(tabs)/cases';
import DashboardScreen from '../app/(tabs)/index';
import { useCases } from '../features/cases/hooks';
import {
  speechRecognitionService,
  MockSpeechAdapter,
} from '../services/speech/speechRecognitionService';
import { CaseItem } from '../types';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('../features/cases/hooks', () => ({
  useCases: jest.fn(),
  useDashboard: jest.fn().mockReturnValue({
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
  }),
}));

jest.mock('../services/api/client', () => ({
  fetchHealthCheck: jest.fn().mockResolvedValue({
    service: 'APHC Backend',
    version: '1.0.0',
    engine: 'sqlite3',
    database: 'db.sqlite3',
  }),
}));

jest.mock('../services/speech/ttsService', () => ({
  speechService: {
    speak: jest.fn(),
    stop: jest.fn(),
  },
}));

const mockCases: CaseItem[] = [
  {
    id: 1,
    case_type: 'WP',
    case_number: '1001',
    filing_year: 2024,
    petitioner: 'Citizen Welfare Trust',
    respondent: 'State of Andhra Pradesh',
    current_stage: 'UPCOMING',
    status: 'Upcoming',
    next_hearing_date: '2024-11-20',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    case_type: 'CRLP',
    case_number: '2002',
    filing_year: 2023,
    petitioner: 'Suresh Kumar',
    respondent: 'Inspector of Police',
    current_stage: 'ADJOURNED',
    status: 'Adjourned',
    next_hearing_date: '2024-12-01',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

describe('Voice Case Search Integration', () => {
  let mockAdapter: MockSpeechAdapter;
  let queryClient: QueryClient;

  beforeEach(() => {
    mockAdapter = new MockSpeechAdapter();
    speechRecognitionService.setAdapter(mockAdapter);
    (useCases as jest.Mock).mockReturnValue({
      data: mockCases,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockPush.mockClear();
  });

  afterEach(() => {
    mockAdapter.abort();
    speechRecognitionService.resetToDefaultAdapter();
    if (queryClient) {
      queryClient.clear();
    }
  });

  it('renders microphone button on CasesScreen and opens voice input modal on click', () => {
    render(<CasesScreen />);

    const micButton = screen.getByTestId('cases-voice-mic-button');
    expect(micButton).toBeTruthy();

    fireEvent.press(micButton);
    expect(screen.getByTestId('voice-input-modal')).toBeTruthy();
  });

  it('filters cases list when voice query is recognized and applied', async () => {
    mockAdapter.setScenario('success', 'WP 1001');

    render(<CasesScreen />);

    // 1. Open voice modal
    fireEvent.press(screen.getByTestId('cases-voice-mic-button'));

    // 2. Click mic to recognize
    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-mic-trigger'));
    });

    // Wait for transcript input to display recognized speech
    await waitFor(() => {
      expect(screen.getByTestId('voice-transcript-input').props.value).toBe('WP 1001');
    });

    // 3. Apply recognized search
    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-apply-button'));
    });

    // 4. Modal is closed and search input contains recognized text
    expect(screen.queryByTestId('voice-input-modal')).toBeNull();
    const searchInput = screen.getByTestId('cases-search-input');
    expect(searchInput.props.value).toBe('WP 1001');

    // 5. Results are filtered: only WP 1001 shown
    expect(screen.getByText(/Citizen Welfare Trust/)).toBeTruthy();
    expect(screen.queryByText(/Suresh Kumar/)).toBeNull();
  });

  it('matches case with ASCII number when search query contains Telugu numerals', () => {
    render(<CasesScreen />);

    const searchInput = screen.getByTestId('cases-search-input');

    // Enter Telugu numerals: ౧౦౦౧ (1001)
    act(() => {
      fireEvent.changeText(searchInput, '౧౦౦౧');
    });

    // Citizen Welfare Trust (WP 1001) is displayed, CRLP 2002 is filtered out
    expect(screen.getByText(/Citizen Welfare Trust/)).toBeTruthy();
    expect(screen.queryByText(/Suresh Kumar/)).toBeNull();
  });

  it('renders Voice Case Search button on DashboardScreen and opens voice modal', async () => {
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <DashboardScreen />
      </QueryClientProvider>
    );

    const dashboardVoiceBtn = screen.getByTestId('dashboard-voice-search-button');
    expect(dashboardVoiceBtn).toBeTruthy();

    await act(async () => {
      fireEvent.press(dashboardVoiceBtn);
    });
    expect(screen.getByTestId('voice-input-modal')).toBeTruthy();
    unmount();
  });
});
