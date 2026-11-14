import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { CaseHistoryTimeline } from '../components/cases/CaseHistoryTimeline';
import CaseDetailScreen from '../app/cases/[id]';
import { useCaseDetail, useCaseHistory } from '../features/cases/hooks';
import { CaseHistoryItem, CaseItem } from '../types';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '1' }),
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
  useCourtStatus: jest.fn(() => ({
    data: null,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })),
  useCourtStatusHistory: jest.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })),
  useSyncCourtStatus: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
}));

jest.mock('../services/speech/ttsService', () => ({
  speechService: {
    speak: jest.fn(),
  },
}));

const mockHistoryItems: CaseHistoryItem[] = [
  {
    id: 101,
    case: 1,
    event_type: 'CASE_CREATED',
    field_name: undefined,
    old_value: undefined,
    new_value: undefined,
    description: 'Case WP 1001/2024 created by Advocate Krishna.',
    source: 'MANUAL',
    changed_by: {
      id: 5,
      username: 'krishna_adv',
      full_name: 'Krishna Rao',
    },
    created_at: '2024-01-10T10:30:00Z',
  },
  {
    id: 102,
    case: 1,
    event_type: 'HEARING_RESCHEDULED',
    field_name: 'next_hearing_date',
    old_value: '2024-11-10',
    new_value: '2024-11-17',
    description: 'Hearing rescheduled from 2024-11-10 to 2024-11-17.',
    source: 'MANUAL',
    changed_by: {
      id: 5,
      username: 'krishna_adv',
      full_name: 'Krishna Rao',
    },
    created_at: '2024-10-15T14:45:00Z',
  },
  {
    id: 103,
    case: 1,
    event_type: 'STAGE_CHANGED',
    field_name: 'current_stage',
    old_value: 'PENDING',
    new_value: 'HEARING',
    description: 'Case stage advanced to HEARING.',
    source: 'SYSTEM',
    changed_by: null,
    created_at: '2024-10-16T09:00:00Z',
  },
  {
    id: 104,
    case: 1,
    event_type: 'JUDGMENT_ENTERED',
    field_name: 'judgment',
    old_value: undefined,
    new_value: 'Final Order Passed',
    description: 'Final judgment delivered by Chief Justice Bench.',
    source: 'MANUAL',
    changed_by: {
      id: 5,
      username: 'krishna_adv',
      full_name: 'Krishna Rao',
    },
    created_at: '2024-10-20T11:00:00Z',
  },
  {
    id: 105,
    case: 1,
    event_type: 'SYNC_UPDATED',
    field_name: 'registry_docket',
    old_value: 'v1.0',
    new_value: 'v1.1',
    description: 'Synchronized with APHC daily cause list.',
    source: 'SYNC',
    changed_by: null,
    created_at: '2024-10-21T06:00:00Z',
  },
];

const mockCaseDetail: CaseItem = {
  id: 1,
  case_type: 'WP',
  case_number: '1001',
  filing_year: 2024,
  petitioner: 'Alpha Corp',
  respondent: 'State of AP',
  current_stage: 'HEARING',
  status: 'Hearing Listed',
  bench: 'Bench 1',
  petitioner_advocate: 'Krishna Rao',
  respondent_advocate: 'Govt Pleader',
  next_hearing_date: '2024-11-17',
  effective_next_hearing_date: '2024-11-17',
  created_at: '2024-01-10T10:30:00Z',
  updated_at: '2024-10-21T06:00:00Z',
  hearings: [],
};

describe('CaseHistoryTimeline Component and CaseDetail Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CaseHistoryTimeline component unit tests', () => {
    it('1. renders all history entries when history is provided', () => {
      render(<CaseHistoryTimeline history={mockHistoryItems} />);

      expect(screen.getByTestId('case-history-timeline')).toBeTruthy();
      expect(screen.getByTestId('history-item-101')).toBeTruthy();
      expect(screen.getByTestId('history-item-102')).toBeTruthy();
      expect(screen.getByTestId('history-item-103')).toBeTruthy();
      expect(screen.getByTestId('history-item-104')).toBeTruthy();
      expect(screen.getByTestId('history-item-105')).toBeTruthy();
    });

    it('2. displays event titles and human-readable descriptions', () => {
      render(<CaseHistoryTimeline history={mockHistoryItems} />);

      expect(screen.getByText('Case Created')).toBeTruthy();
      expect(screen.getByText('Hearing Rescheduled')).toBeTruthy();
      expect(
        screen.getByText('Hearing rescheduled from 2024-11-10 to 2024-11-17.')
      ).toBeTruthy();
      expect(
        screen.getByText('Case WP 1001/2024 created by Advocate Krishna.')
      ).toBeTruthy();
    });

    it('3. displays value change diff box with previous and new values', () => {
      render(<CaseHistoryTimeline history={mockHistoryItems} />);

      expect(screen.getByTestId('history-item-diff-102')).toBeTruthy();
      expect(screen.getByText('2024-11-10')).toBeTruthy();
      expect(screen.getByText('2024-11-17')).toBeTruthy();
      expect(screen.getByText('PENDING')).toBeTruthy();
      expect(screen.getByText('HEARING')).toBeTruthy();
    });

    it('4. displays source badges for MANUAL, SYSTEM, and SYNC modifications', () => {
      render(<CaseHistoryTimeline history={mockHistoryItems} />);

      expect(screen.getByTestId('history-item-source-101')).toBeTruthy();
      expect(screen.getByTestId('history-item-source-103')).toBeTruthy();
      expect(screen.getByTestId('history-item-source-105')).toBeTruthy();
    });

    it('5. displays responsible user name or automated attribution', () => {
      render(<CaseHistoryTimeline history={mockHistoryItems} />);

      expect(screen.getByTestId('history-item-user-101')).toBeTruthy();
      expect(screen.getAllByText('Krishna Rao').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Automated System')).toBeTruthy();
      expect(screen.getByText('APHC Registry Sync')).toBeTruthy();
    });

    it('6. formats date and time for each history entry', () => {
      render(<CaseHistoryTimeline history={mockHistoryItems} />);

      expect(screen.getByTestId('history-item-date-101')).toBeTruthy();
      expect(screen.getByTestId('history-item-date-102')).toBeTruthy();
    });

    it('7. displays empty state when no history records exist', () => {
      render(<CaseHistoryTimeline history={[]} />);

      expect(screen.getByTestId('case-history-empty')).toBeTruthy();
      expect(
        screen.getByText('No audit history records found for this case.')
      ).toBeTruthy();
    });

    it('8. displays loading state when isLoading is true', () => {
      render(<CaseHistoryTimeline history={[]} isLoading={true} />);

      expect(screen.getByTestId('case-history-loading')).toBeTruthy();
    });

    it('9. displays error state and handles retry action', () => {
      const onRetryMock = jest.fn();
      render(<CaseHistoryTimeline history={[]} isError={true} onRetry={onRetryMock} />);

      expect(screen.getByTestId('case-history-error')).toBeTruthy();
      expect(screen.getByText('Unable to load case audit history.')).toBeTruthy();

      const retryBtn = screen.getByTestId('case-history-retry-btn');
      fireEvent.press(retryBtn);
      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });

    it('10. filters timeline items by category tabs', () => {
      render(<CaseHistoryTimeline history={mockHistoryItems} />);

      // Filter by Hearings
      const hearingFilter = screen.getByTestId('history-filter-hearing');
      fireEvent.press(hearingFilter);

      expect(screen.getByTestId('history-item-102')).toBeTruthy();
      expect(screen.queryByTestId('history-item-101')).toBeNull();
      expect(screen.queryByTestId('history-item-105')).toBeNull();

      // Filter by Judgments
      const judgmentFilter = screen.getByTestId('history-filter-judgment');
      fireEvent.press(judgmentFilter);
      expect(screen.getByTestId('history-item-104')).toBeTruthy();
      expect(screen.queryByTestId('history-item-102')).toBeNull();

      // Filter by Sync
      const syncFilter = screen.getByTestId('history-filter-sync');
      fireEvent.press(syncFilter);
      expect(screen.getByTestId('history-item-105')).toBeTruthy();
      expect(screen.queryByTestId('history-item-102')).toBeNull();

      // Reset to All
      const allFilter = screen.getByTestId('history-filter-all');
      fireEvent.press(allFilter);
      expect(screen.getByTestId('history-item-101')).toBeTruthy();
      expect(screen.getByTestId('history-item-102')).toBeTruthy();
      expect(screen.getByTestId('history-item-105')).toBeTruthy();
    });
  });

  describe('CaseDetailScreen integration with CaseHistoryTimeline', () => {
    it('11. renders Case Audit Timeline inside CaseDetailScreen', () => {
      (useCaseDetail as jest.Mock).mockReturnValue({
        data: mockCaseDetail,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
      (useCaseHistory as jest.Mock).mockReturnValue({
        data: mockHistoryItems,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<CaseDetailScreen />);

      expect(screen.getByTestId('case-detail-history-card')).toBeTruthy();
      expect(screen.getByText('Case Audit Timeline')).toBeTruthy();
      expect(screen.getByTestId('case-history-timeline')).toBeTruthy();
      expect(screen.getByTestId('history-item-102')).toBeTruthy();
    });

    it('12. renders empty timeline state within CaseDetailScreen when no history exists', () => {
      (useCaseDetail as jest.Mock).mockReturnValue({
        data: mockCaseDetail,
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

      render(<CaseDetailScreen />);

      expect(screen.getByTestId('case-detail-history-card')).toBeTruthy();
      expect(screen.getByTestId('case-history-empty')).toBeTruthy();
    });
  });
});
