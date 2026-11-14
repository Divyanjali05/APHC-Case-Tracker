import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import {
  CourtStatusCard,
  getStatusBadgeVariant,
} from '../components/cases/CourtStatusCard';
import { CourtStatusTimeline } from '../components/cases/CourtStatusTimeline';
import CaseDetailScreen from '../app/cases/[id]';
import { useCaseDetail, useCaseHistory } from '../features/cases/hooks';
import {
  useCourtStatus,
  useCourtStatusHistory,
  useSyncCourtStatus,
} from '../features/courtStatus/hooks';
import {
  CaseCourtStatusSummary,
  CourtListingItem,
  CourtStatusObservationItem,
} from '../types';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '42' }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../features/cases/hooks', () => ({
  useCaseDetail: jest.fn(),
  useCaseHistory: jest.fn(),
  useRescheduleHearing: jest.fn(() => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
    error: null,
  })),
}));

jest.mock('../features/courtStatus/hooks', () => ({
  useCourtStatus: jest.fn(),
  useCourtStatusHistory: jest.fn(),
  useSyncCourtStatus: jest.fn(),
}));

jest.mock('../services/speech/ttsService', () => ({
  speechService: {
    speak: jest.fn(),
  },
}));

const mockListing: CourtListingItem = {
  id: 1,
  case: 42,
  court_name: 'High Court of Andhra Pradesh',
  bench: 'Court Hall 4 - Hon Justice Raman',
  court_hall: 4,
  listing_date: '2026-11-03',
  session: 'Morning Session (10:30 AM)',
  item_number: 14,
  token_number: 'CH4-014',
  source_status: 'ITEM_CALLED',
  normalized_status: 'CALLED',
  normalized_status_display: 'Matter Called',
  provider_name: 'APHC Registry Adapter (Mock)',
  last_synced_at: '2026-11-01T10:00:00Z',
  is_mock: true,
  created_at: '2026-11-01T09:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
};

const mockSummary: CaseCourtStatusSummary = {
  case_id: 42,
  case_reference: 'WP 1234/2024',
  normalized_status: 'CALLED',
  normalized_status_display: 'Matter Called',
  listing: mockListing,
  has_active_listing: true,
};

const mockObservations: CourtStatusObservationItem[] = [
  {
    id: 1,
    case: 42,
    court_listing: 1,
    source_status: 'CAUSE_LIST_PUBLISHED',
    normalized_status: 'LISTED',
    normalized_status_display: 'Listed',
    provider_name: 'APHC Registry Adapter (Mock)',
    observed_at: '2026-11-01T08:00:00Z',
    source_reference: 'CAUSE_LIST_DAILY_20261103',
    court_hall: 4,
    item_number: 14,
    token_number: undefined,
    safe_metadata: { previous_status: 'NOT_LISTED' },
    is_meaningful_change: true,
    is_alert_dispatched: true,
    created_at: '2026-11-01T08:00:00Z',
  },
  {
    id: 2,
    case: 42,
    court_listing: 1,
    source_status: 'TOKEN_ASSIGNED',
    normalized_status: 'TOKEN_ALLOCATED',
    normalized_status_display: 'Token Allocated',
    provider_name: 'APHC Registry Adapter (Mock)',
    observed_at: '2026-11-01T09:00:00Z',
    source_reference: 'BOARD_TOKEN_UPDATE',
    court_hall: 4,
    item_number: 14,
    token_number: 'CH4-014',
    safe_metadata: { previous_status: 'LISTED' },
    is_meaningful_change: true,
    is_alert_dispatched: true,
    created_at: '2026-11-01T09:00:00Z',
  },
  {
    id: 3,
    case: 42,
    court_listing: 1,
    source_status: 'TOKEN_ASSIGNED',
    normalized_status: 'TOKEN_ALLOCATED',
    normalized_status_display: 'Token Allocated',
    provider_name: 'APHC Registry Adapter (Mock)',
    observed_at: '2026-11-01T09:30:00Z',
    source_reference: 'BOARD_TOKEN_UPDATE_REPEAT',
    court_hall: 4,
    item_number: 14,
    token_number: 'CH4-014',
    safe_metadata: { previous_status: 'TOKEN_ALLOCATED' },
    is_meaningful_change: false,
    is_alert_dispatched: false,
    created_at: '2026-11-01T09:30:00Z',
  },
  {
    id: 4,
    case: 42,
    court_listing: 1,
    source_status: 'ITEM_CALLED',
    normalized_status: 'CALLED',
    normalized_status_display: 'Matter Called',
    provider_name: 'APHC Registry Adapter (Mock)',
    observed_at: '2026-11-01T10:00:00Z',
    source_reference: 'LIVE_BOARD_CALL',
    court_hall: 4,
    item_number: 14,
    token_number: 'CH4-014',
    safe_metadata: { previous_status: 'TOKEN_ALLOCATED' },
    is_meaningful_change: true,
    is_alert_dispatched: true,
    created_at: '2026-11-01T10:00:00Z',
  },
];

describe('Court Status & Token Alerts – Frontend Architecture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatusBadgeVariant', () => {
    it('returns appropriate theme variants for each normalized status', () => {
      expect(getStatusBadgeVariant('CALLED')).toBe('danger');
      expect(getStatusBadgeVariant('IN_PROGRESS')).toBe('gold');
      expect(getStatusBadgeVariant('TOKEN_ALLOCATED')).toBe('primary');
      expect(getStatusBadgeVariant('WAITING')).toBe('info');
      expect(getStatusBadgeVariant('LISTED')).toBe('info');
      expect(getStatusBadgeVariant('COMPLETED')).toBe('success');
      expect(getStatusBadgeVariant('ADJOURNED')).toBe('warning');
      expect(getStatusBadgeVariant('NOT_LISTED')).toBe('secondary');
      expect(getStatusBadgeVariant('CANCELLED')).toBe('secondary');
      expect(getStatusBadgeVariant('UNKNOWN')).toBe('secondary');
    });
  });

  describe('CourtStatusCard Component', () => {
    it('renders court listing details, token highlight, and mock banner', () => {
      render(
        <CourtStatusCard
          caseId={42}
          statusData={mockSummary}
          isLoading={false}
          isError={false}
        />
      );

      expect(screen.getByTestId('court-status-card')).toBeTruthy();
      expect(screen.getByTestId('court-status-badge')).toBeTruthy();
      expect(screen.getByTestId('mock-adapter-banner')).toBeTruthy();
      expect(screen.getByTestId('token-highlight-box')).toBeTruthy();
      expect(screen.getByText('CH4-014')).toBeTruthy();
      expect(screen.getByText('Court Hall 4')).toBeTruthy();
      expect(screen.getByText('Court Hall 4 - Hon Justice Raman')).toBeTruthy();
      expect(screen.getByText('Morning Session (10:30 AM)')).toBeTruthy();
    });

    it('renders empty state when there is no active court listing', () => {
      const emptySummary: CaseCourtStatusSummary = {
        case_id: 42,
        case_reference: 'WP 1234/2024',
        normalized_status: 'NOT_LISTED',
        normalized_status_display: 'Not Listed',
        listing: null,
        has_active_listing: false,
      };

      render(
        <CourtStatusCard
          caseId={42}
          statusData={emptySummary}
          isLoading={false}
          isError={false}
        />
      );

      expect(screen.getByTestId('court-status-empty')).toBeTruthy();
      expect(screen.queryByTestId('token-highlight-box')).toBeNull();
    });

    it('renders loading state when isLoading is true', () => {
      render(<CourtStatusCard caseId={42} isLoading={true} isError={false} />);

      expect(screen.getByTestId('court-status-loading')).toBeTruthy();
    });

    it('renders provider unavailable error when isError is true', () => {
      render(<CourtStatusCard caseId={42} isLoading={false} isError={true} />);

      expect(screen.getByTestId('court-status-error')).toBeTruthy();
    });

    it('triggers manual refresh onSync button click', () => {
      const onSyncMock = jest.fn();
      render(
        <CourtStatusCard
          caseId={42}
          statusData={mockSummary}
          onSync={onSyncMock}
          isSyncing={false}
        />
      );

      const syncBtn = screen.getByTestId('court-status-sync-button');
      fireEvent.press(syncBtn);
      expect(onSyncMock).toHaveBeenCalledTimes(1);
    });

    it('disables sync button and displays syncing indicator when isSyncing is true', () => {
      const onSyncMock = jest.fn();
      render(
        <CourtStatusCard
          caseId={42}
          statusData={mockSummary}
          onSync={onSyncMock}
          isSyncing={true}
        />
      );

      const syncBtn = screen.getByTestId('court-status-sync-button');
      fireEvent.press(syncBtn);
      expect(onSyncMock).not.toHaveBeenCalled();
    });

    it('displays success and error feedback messages from manual sync', () => {
      const { rerender } = render(
        <CourtStatusCard
          caseId={42}
          statusData={mockSummary}
          syncMessage="Court status synchronized successfully."
        />
      );

      expect(screen.getByTestId('court-status-sync-success')).toBeTruthy();
      expect(screen.getByText('Court status synchronized successfully.')).toBeTruthy();

      rerender(
        <CourtStatusCard
          caseId={42}
          statusData={mockSummary}
          syncError="Rate limit active. Please wait 5 seconds before refreshing again."
        />
      );

      expect(screen.getByTestId('court-status-sync-error')).toBeTruthy();
      expect(
        screen.getByText(
          'Rate limit active. Please wait 5 seconds before refreshing again.'
        )
      ).toBeTruthy();
    });
  });

  describe('CourtStatusTimeline Component', () => {
    it('renders historical observations and status transitions', () => {
      render(
        <CourtStatusTimeline
          observations={mockObservations}
          isLoading={false}
          isError={false}
        />
      );

      expect(screen.getByTestId('court-status-timeline')).toBeTruthy();
      // By default filterMeaningfulOnly is true, so item 1, 2, 4 are rendered (3 items)
      expect(screen.getByTestId('court-timeline-item-1')).toBeTruthy();
      expect(screen.getByTestId('court-timeline-item-2')).toBeTruthy();
      expect(screen.getByTestId('court-timeline-item-4')).toBeTruthy();
      expect(screen.queryByTestId('court-timeline-item-3')).toBeNull();
    });

    it('toggles filter to show all observations including repeated unchanged ones', () => {
      render(
        <CourtStatusTimeline
          observations={mockObservations}
          isLoading={false}
          isError={false}
        />
      );

      const filterToggle = screen.getByTestId('court-timeline-filter-toggle');
      fireEvent.press(filterToggle);

      // Now all 4 observations should be displayed
      expect(screen.getByTestId('court-timeline-item-3')).toBeTruthy();
    });

    it('displays alert sent indicators on observations with dispatched alerts', () => {
      render(
        <CourtStatusTimeline
          observations={mockObservations}
          isLoading={false}
          isError={false}
        />
      );

      const alertPills = screen.getAllByTestId('alert-dispatched-pill');
      expect(alertPills.length).toBeGreaterThan(0);
    });

    it('renders empty state when observation list is empty', () => {
      render(<CourtStatusTimeline observations={[]} isLoading={false} isError={false} />);

      expect(screen.getByTestId('court-timeline-empty')).toBeTruthy();
    });

    it('renders loading and error states with retry support', () => {
      const onRetryMock = jest.fn();
      const { rerender } = render(
        <CourtStatusTimeline observations={[]} isLoading={true} isError={false} />
      );

      expect(screen.getByTestId('court-timeline-loading')).toBeTruthy();

      rerender(
        <CourtStatusTimeline
          observations={[]}
          isLoading={false}
          isError={true}
          onRetry={onRetryMock}
        />
      );

      expect(screen.getByTestId('court-timeline-error')).toBeTruthy();
      const retryBtn = screen.getByText('Retry');
      fireEvent.press(retryBtn);
      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Case Detail Screen Integration', () => {
    it('integrates CourtStatusCard and CourtStatusTimeline in CaseDetailScreen', () => {
      (useCaseDetail as jest.Mock).mockReturnValue({
        data: {
          id: 42,
          case_type: 'WP',
          case_number: '1234',
          filing_year: 2024,
          petitioner: 'Narayana Murthy',
          respondent: 'State of Andhra Pradesh',
          current_stage: 'HEARING',
          status: 'HEARING',
          bench: 'Court Hall 4',
          court_hall_number: 4,
          next_hearing_date: '2026-11-03',
          hearings: [],
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      (useCaseHistory as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      (useCourtStatus as jest.Mock).mockReturnValue({
        data: mockSummary,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      (useCourtStatusHistory as jest.Mock).mockReturnValue({
        data: mockObservations,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      (useSyncCourtStatus as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      });

      render(<CaseDetailScreen />);

      expect(screen.getByTestId('case-detail-screen')).toBeTruthy();
      expect(screen.getByTestId('court-status-card')).toBeTruthy();
      expect(screen.getByTestId('case-detail-court-status-history-card')).toBeTruthy();
      expect(screen.getByText('CH4-014')).toBeTruthy();
    });
  });
});
