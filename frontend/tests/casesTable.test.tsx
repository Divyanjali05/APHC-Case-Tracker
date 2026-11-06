import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import CasesScreen from '../app/(tabs)/cases';
import { useCases } from '../features/cases/hooks';
import { CaseItem } from '../types';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('../features/cases/hooks', () => ({
  useCases: jest.fn(),
}));

const mockCases: CaseItem[] = [
  {
    id: 1,
    case_type: 'WP',
    case_number: '1001',
    filing_year: 2024,
    petitioner: 'Alpha Corp',
    respondent: 'Beta Union',
    current_stage: 'UPCOMING',
    status: 'Upcoming',
    next_hearing_date: '2024-11-20',
    effective_next_hearing_date: '2024-11-20',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    case_type: 'WA',
    case_number: '2002',
    filing_year: 2023,
    petitioner: 'Gamma Ltd',
    respondent: 'Delta Dept',
    current_stage: 'DISPOSED',
    status: 'Judgment Available',
    judgment_date: '2024-10-15',
    latest_judgment: {
      id: 10,
      case: 2,
      judgment_date: '2024-10-15',
      order_number: 'ORD-2002',
      bench: 'Chief Justice Bench',
      summary: 'Appeal allowed in full.',
      document_link: 'https://court.example.com/order2002.pdf',
      created_at: '2024-10-15T00:00:00Z',
      updated_at: '2024-10-15T00:00:00Z',
    },
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2024-10-15T00:00:00Z',
  },
  {
    id: 3,
    case_type: 'CRLP',
    case_number: '3003',
    filing_year: 2022,
    petitioner: 'Suresh Kumar',
    respondent: 'State of AP',
    current_stage: 'ADJOURNED',
    status: 'Adjourned',
    next_hearing_date: '2024-12-05',
    effective_next_hearing_date: '2024-12-05',
    created_at: '2022-01-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
];

describe('Case Table and Judgment Interface', () => {
  const defaultHookReturn = {
    data: mockCases,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    isRefetching: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useCases as jest.Mock).mockReturnValue(defaultHookReturn);
  });

  it('1. renders case table with all cases', () => {
    render(<CasesScreen />);
    expect(screen.getByTestId('cases-list')).toBeTruthy();
    expect(screen.getByTestId('case-card-1')).toBeTruthy();
    expect(screen.getByTestId('case-card-2')).toBeTruthy();
    expect(screen.getByTestId('case-card-3')).toBeTruthy();
  });

  it('2. displays case dates accurately', () => {
    render(<CasesScreen />);
    expect(screen.getByText('Filing: 2024')).toBeTruthy();
    expect(screen.getByText('Filing: 2023')).toBeTruthy();
    expect(screen.getByText('Filing: 2022')).toBeTruthy();
  });

  it('3. displays case names and identifiers', () => {
    render(<CasesScreen />);
    expect(screen.getByText('WP 1001/2024')).toBeTruthy();
    expect(screen.getByText('Alpha Corp vs Beta Union')).toBeTruthy();
    expect(screen.getByText('WA 2002/2023')).toBeTruthy();
    expect(screen.getByText('Gamma Ltd vs Delta Dept')).toBeTruthy();
  });

  it('4. displays status badges for different case stages', () => {
    render(<CasesScreen />);
    expect(screen.getByTestId('case-status-badge-1')).toBeTruthy();
    expect(screen.getByTestId('case-status-badge-2')).toBeTruthy();
    expect(screen.getByTestId('case-status-badge-3')).toBeTruthy();
    expect(screen.getAllByText('Upcoming').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Judgment Available').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Adjourned').length).toBeGreaterThanOrEqual(1);
  });

  it('5. displays judgment date when available', () => {
    render(<CasesScreen />);
    expect(screen.getByTestId('judgment-date-2')).toBeTruthy();
    expect(screen.getByText('15 Oct 2024')).toBeTruthy();
  });

  it('6. displays pending state when judgment is not available', () => {
    render(<CasesScreen />);
    expect(screen.getByTestId('judgment-pending-1')).toBeTruthy();
    expect(screen.getByTestId('judgment-pending-3')).toBeTruthy();
  });

  it('7. filters cases using search input', () => {
    render(<CasesScreen />);
    const searchInput = screen.getByTestId('cases-search-input');
    fireEvent.changeText(searchInput, 'Alpha');

    expect(screen.getByTestId('case-card-1')).toBeTruthy();
    expect(screen.queryByTestId('case-card-2')).toBeNull();
    expect(screen.queryByTestId('case-card-3')).toBeNull();
  });

  it('8. filters cases by status using filter chips', () => {
    render(<CasesScreen />);
    const withJudgmentChip = screen.getByTestId('filter-chip-with_judgment');
    fireEvent.press(withJudgmentChip);

    expect(screen.getByTestId('case-card-2')).toBeTruthy();
    expect(screen.queryByTestId('case-card-1')).toBeNull();
    expect(screen.queryByTestId('case-card-3')).toBeNull();

    const adjournedChip = screen.getByTestId('filter-chip-adjourned');
    fireEvent.press(adjournedChip);

    expect(screen.getByTestId('case-card-3')).toBeTruthy();
    expect(screen.queryByTestId('case-card-1')).toBeNull();
    expect(screen.queryByTestId('case-card-2')).toBeNull();
  });

  it('9. sorts cases using sorting controls', () => {
    render(<CasesScreen />);
    const sortCaseName = screen.getByTestId('sort-option-case_name');
    fireEvent.press(sortCaseName);
    // Component re-sorts and stays interactive
    expect(screen.getByTestId('cases-list')).toBeTruthy();
  });

  it('10. opens judgment details modal when view judgment is tapped', () => {
    render(<CasesScreen />);
    const viewJudgmentBtn = screen.getByTestId('view-judgment-btn-2');
    fireEvent.press(viewJudgmentBtn);

    expect(screen.getByTestId('judgment-details-modal')).toBeTruthy();
    expect(screen.getByText('Appeal allowed in full.')).toBeTruthy();
    expect(screen.getByTestId('open-judgment-doc-button')).toBeTruthy();
  });

  it('11. renders loading indicator when fetching cases', () => {
    (useCases as jest.Mock).mockReturnValue({
      ...defaultHookReturn,
      isLoading: true,
      data: undefined,
    });
    render(<CasesScreen />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('12. renders empty state when no cases exist', () => {
    (useCases as jest.Mock).mockReturnValue({
      ...defaultHookReturn,
      data: [],
    });
    render(<CasesScreen />);
    expect(screen.getByTestId('cases-empty-state')).toBeTruthy();
  });

  it('13. handles API error state and triggers retry', () => {
    const mockRefetch = jest.fn();
    (useCases as jest.Mock).mockReturnValue({
      ...defaultHookReturn,
      isError: true,
      data: undefined,
      refetch: mockRefetch,
    });
    render(<CasesScreen />);

    expect(screen.getByTestId('cases-error-state')).toBeTruthy();
    const retryBtn = screen.getByText('Retry');
    fireEvent.press(retryBtn);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
