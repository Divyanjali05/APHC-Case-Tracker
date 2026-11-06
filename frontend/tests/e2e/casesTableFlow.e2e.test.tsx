import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import CasesScreen from '../../app/(tabs)/cases';
import { useCases } from '../../features/cases/hooks';
import { CaseItem } from '../../types';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('../../features/cases/hooks', () => ({
  useCases: jest.fn(),
}));

const e2eMockCases: CaseItem[] = [
  {
    id: 101,
    case_type: 'WP',
    case_number: '5501',
    filing_year: 2026,
    petitioner: 'Visakhapatnam Stevedores Association',
    respondent: 'Union of India & Others',
    current_stage: 'UPCOMING',
    status: 'Upcoming',
    next_hearing_date: '2026-11-09',
    effective_next_hearing_date: '2026-11-09',
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
  },
  {
    id: 102,
    case_type: 'WA',
    case_number: '6602',
    filing_year: 2025,
    petitioner: 'Coastal Granite Mines Ltd',
    respondent: 'AP Pollution Control Board',
    current_stage: 'DISPOSED',
    status: 'Judgment Available',
    judgment_date: '2026-10-25',
    latest_judgment: {
      id: 50,
      case: 102,
      judgment_date: '2026-10-25',
      order_number: 'APHC-ORD-6602',
      bench: 'Hon’ble Division Bench II',
      summary: 'Writ Appeal allowed. Environmental clearance sustained.',
      document_link: 'https://aphc.gov.in/orders/6602_2025.pdf',
      created_at: '2026-10-25T11:00:00Z',
      updated_at: '2026-10-25T11:00:00Z',
    },
    created_at: '2025-05-15T09:00:00Z',
    updated_at: '2026-10-25T11:00:00Z',
  },
  {
    id: 103,
    case_type: 'CRLP',
    case_number: '7703',
    filing_year: 2026,
    petitioner: 'N. Rama Rao',
    respondent: 'State of Andhra Pradesh',
    current_stage: 'ADJOURNED',
    status: 'Adjourned',
    next_hearing_date: '2026-11-16',
    effective_next_hearing_date: '2026-11-16',
    created_at: '2026-02-01T08:00:00Z',
    updated_at: '2026-02-01T08:00:00Z',
  },
];

describe('E2E Flow 2: Cases Table Workflow', () => {
  const mockRefetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('2.1 Displays loading indicator when cases are being fetched', () => {
    (useCases as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: mockRefetch,
      isRefetching: false,
    });

    render(<CasesScreen />);

    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('2.2 Displays error state with retry action on API failure', () => {
    (useCases as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
      isRefetching: false,
    });

    const { getByTestId, getByText } = render(<CasesScreen />);

    expect(getByTestId('cases-error-state')).toBeTruthy();
    fireEvent.press(getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('2.3 Displays empty state when advocate has no tracked cases', () => {
    (useCases as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      isRefetching: false,
    });

    const { getByTestId } = render(<CasesScreen />);

    expect(getByTestId('cases-empty-state')).toBeTruthy();
  });

  it('2.4 Cases table renders complete case card fields: Hearing date, Case name, Case status, Judgment', () => {
    (useCases as jest.Mock).mockReturnValue({
      data: e2eMockCases,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      isRefetching: false,
    });

    render(<CasesScreen />);

    // Case 101: Hearing date, Case name, Status, Judgment (Pending)
    expect(screen.getByTestId('case-name-101')).toBeTruthy();
    expect(
      screen.getByText('Visakhapatnam Stevedores Association vs Union of India & Others')
    ).toBeTruthy();
    expect(screen.getByTestId('case-status-badge-101')).toBeTruthy();
    expect(screen.getByTestId('case-next-date-101')).toBeTruthy();
    expect(screen.getByText(/9 Nov 2026/i)).toBeTruthy();
    expect(screen.getByTestId('judgment-pending-101')).toBeTruthy();

    // Case 102: With Judgment Date
    expect(screen.getByTestId('case-name-102')).toBeTruthy();
    expect(
      screen.getByText('Coastal Granite Mines Ltd vs AP Pollution Control Board')
    ).toBeTruthy();
    expect(screen.getByTestId('case-status-badge-102')).toBeTruthy();
    expect(screen.getByText('Judgment Available')).toBeTruthy();
    expect(screen.getByTestId('judgment-date-102')).toBeTruthy();
    expect(screen.getByText(/25 Oct 2026/i)).toBeTruthy();
  });

  it('2.5 Filters cases using search query and filter chips', () => {
    (useCases as jest.Mock).mockReturnValue({
      data: e2eMockCases,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      isRefetching: false,
    });

    const { getByPlaceholderText, queryByText } = render(<CasesScreen />);

    // Search for Granite
    const searchInput = getByPlaceholderText('Search by Case Type, Number or Party...');
    fireEvent.changeText(searchInput, 'Granite');

    expect(
      screen.getByText('Coastal Granite Mines Ltd vs AP Pollution Control Board')
    ).toBeTruthy();
    expect(
      queryByText('Visakhapatnam Stevedores Association vs Union of India & Others')
    ).toBeNull();
  });

  it('2.6 Navigates to case details screen when tapping a case card', () => {
    (useCases as jest.Mock).mockReturnValue({
      data: e2eMockCases,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      isRefetching: false,
    });

    const { getByTestId } = render(<CasesScreen />);

    fireEvent.press(getByTestId('case-card-101'));

    expect(mockPush).toHaveBeenCalledWith('/cases/101');
  });

  it('2.7 Opens judgment details modal when tapping view judgment', () => {
    (useCases as jest.Mock).mockReturnValue({
      data: e2eMockCases,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      isRefetching: false,
    });

    const { getByTestId } = render(<CasesScreen />);

    fireEvent.press(getByTestId('view-judgment-btn-102'));

    expect(screen.getByTestId('judgment-details-modal')).toBeTruthy();
    expect(screen.getByText('APHC-ORD-6602')).toBeTruthy();
    expect(
      screen.getByText('Writ Appeal allowed. Environmental clearance sustained.')
    ).toBeTruthy();
  });

  it('2.8 Refreshing triggers refetch query', () => {
    (useCases as jest.Mock).mockReturnValue({
      data: e2eMockCases,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      isRefetching: false,
    });

    const { getByTestId } = render(<CasesScreen />);

    const list = getByTestId('cases-list');
    const { refreshControl } = list.props;
    refreshControl.props.onRefresh();

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
