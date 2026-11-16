import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import CasesScreen from '../app/(tabs)/cases';
import { useCases } from '../features/cases/hooks';
import { CaseItem } from '../types';

const mockPush = jest.fn();
const mockShowToast = jest.fn();

jest.mock('../components/common/Toast', () => ({
  ...jest.requireActual('../components/common/Toast'),
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useLocalSearchParams: () => ({}),
}));

const mockMutateAsync = jest.fn();

jest.mock('../features/cases/hooks', () => ({
  useCases: jest.fn(),
  useDeleteCase: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useUpdateCase: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

// Generate 15 distinct cases for testing pagination, sorting, and multi-filter features
const mockCases: CaseItem[] = Array.from({ length: 15 }, (_, i) => {
  const id = i + 1;
  const statuses = ['Pending', 'Adjourned', 'Disposed'];
  const types = ['WP', 'WA', 'CRLP', 'CC'];
  const status = statuses[i % statuses.length];
  const caseType = types[i % types.length];
  const year = 2026 - i;
  const hall = (i % 5) + 1;

  return {
    id,
    case_type: caseType,
    case_number: String(1000 + id),
    filing_year: year,
    petitioner: `Petitioner Person ${id}`,
    respondent: `Respondent Org ${id}`,
    petitioner_advocate: `Advocate P ${id}`,
    respondent_advocate: `Advocate R ${id}`,
    current_stage: status === 'Disposed' ? 'DISPOSED' : 'Regular List',
    status,
    bench: `Court Hall ${hall} Bench`,
    court_hall_number: hall,
    next_hearing_date: status !== 'Disposed' ? `2026-11-${10 + (i % 15)}` : undefined,
    effective_next_hearing_date:
      status !== 'Disposed' ? `2026-11-${10 + (i % 15)}` : undefined,
    judgment_date: status === 'Disposed' ? `2026-10-${10 + (i % 10)}` : undefined,
    latest_judgment:
      status === 'Disposed'
        ? {
            id: 200 + id,
            case: id,
            judgment_date: `2026-10-${10 + (i % 10)}`,
            summary: `Final Judgment pronounced for matter ${id}.`,
            created_at: `2026-10-${10 + (i % 10)}T10:00:00Z`,
            updated_at: `2026-10-${10 + (i % 10)}T10:00:00Z`,
          }
        : undefined,
    created_at: `${year}-02-15T09:00:00Z`,
    updated_at: `2026-11-01T12:00:00Z`,
  };
});

describe('CasesScreen Full Functionality Test Suite', () => {
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

  // 1. SEARCH FUNCTIONALITY
  describe('1. Search Functionality', () => {
    it('searches and filters cases by case number', () => {
      render(<CasesScreen />);
      const searchInput = screen.getByTestId('cases-search-input');
      fireEvent.changeText(searchInput, '1005');

      expect(screen.getByTestId('case-card-5')).toBeTruthy();
      expect(screen.queryByTestId('case-card-1')).toBeNull();
    });

    it('searches and filters cases by petitioner name', () => {
      render(<CasesScreen />);
      const searchInput = screen.getByTestId('cases-search-input');
      fireEvent.changeText(searchInput, 'Petitioner Person 3');

      expect(screen.getByTestId('case-card-3')).toBeTruthy();
      expect(screen.queryByTestId('case-card-1')).toBeNull();
    });

    it('clears search when clear button is clicked', () => {
      render(<CasesScreen />);
      const searchInput = screen.getByTestId('cases-search-input');
      fireEvent.changeText(searchInput, '1005');

      const clearBtn = screen.getByTestId('cases-search-clear-button');
      expect(clearBtn).toBeTruthy();
      fireEvent.press(clearBtn);

      expect(searchInput.props.value).toBe('');
      expect(screen.getByTestId('case-card-1')).toBeTruthy();
    });

    it('displays empty state when search finds no matches', () => {
      render(<CasesScreen />);
      const searchInput = screen.getByTestId('cases-search-input');
      fireEvent.changeText(searchInput, 'NONEXISTENT_QUERY_12345');

      expect(screen.getByTestId('cases-empty-state')).toBeTruthy();
      expect(screen.getByText('No Cases Found')).toBeTruthy();
    });
  });

  // 2. ADVANCED FILTER MODAL & ACTIVE CHIPS
  describe('2. Filter Modal & Active Chips', () => {
    it('opens advanced filter modal when filter dropdown advanced option is pressed', () => {
      render(<CasesScreen />);
      // Open Filter dropdown
      fireEvent.press(screen.getByTestId('cases-filter-dropdown-btn'));
      expect(screen.getByTestId('cases-filter-dropdown-menu')).toBeTruthy();

      // Tap Custom / Date Filters
      fireEvent.press(screen.getByTestId('filter-option-advanced'));
      expect(screen.getByTestId('case-filter-modal')).toBeTruthy();
      expect(screen.getByText('Filter Cases')).toBeTruthy();
    });

    it('applies advanced status filter and displays active chip', () => {
      render(<CasesScreen />);
      // Open Filter dropdown & then advanced modal
      fireEvent.press(screen.getByTestId('cases-filter-dropdown-btn'));
      fireEvent.press(screen.getByTestId('filter-option-advanced'));

      // Select Disposed status
      const disposedPill = screen.getByTestId('filter-status-disposed');
      fireEvent.press(disposedPill);

      // Apply
      fireEvent.press(screen.getByTestId('filter-apply-btn'));

      // Modal closed
      expect(screen.queryByTestId('case-filter-modal')).toBeNull();

      // Active chip is displayed
      expect(screen.getByTestId('active-chip-status')).toBeTruthy();
      expect(screen.getByText('Status: DISPOSED')).toBeTruthy();

      // Only disposed cases are rendered
      expect(screen.getByTestId('case-card-3')).toBeTruthy(); // id 3 is disposed
      expect(screen.queryByTestId('case-card-1')).toBeNull(); // id 1 is pending
    });

    it('removes active chip and resets filter when dismiss icon is tapped', () => {
      render(<CasesScreen />);
      // Open modal and apply filter
      fireEvent.press(screen.getByTestId('cases-filter-dropdown-btn'));
      fireEvent.press(screen.getByTestId('filter-option-advanced'));
      fireEvent.press(screen.getByTestId('filter-status-disposed'));
      fireEvent.press(screen.getByTestId('filter-apply-btn'));

      expect(screen.getByTestId('active-chip-status')).toBeTruthy();

      // Remove chip
      fireEvent.press(screen.getByTestId('active-chip-status'));

      // Filter cleared and all cases back
      expect(screen.queryByTestId('active-chip-status')).toBeNull();
      expect(screen.getByTestId('case-card-1')).toBeTruthy();
    });

    it('clears all active filters when Clear All is clicked', () => {
      render(<CasesScreen />);
      // Open modal and apply filter
      fireEvent.press(screen.getByTestId('cases-filter-dropdown-btn'));
      fireEvent.press(screen.getByTestId('filter-option-advanced'));
      fireEvent.press(screen.getByTestId('filter-status-pending'));
      fireEvent.press(screen.getByTestId('filter-apply-btn'));

      expect(screen.getByTestId('clear-active-filters-btn')).toBeTruthy();
      fireEvent.press(screen.getByTestId('clear-active-filters-btn'));

      expect(screen.queryByTestId('active-chip-status')).toBeNull();
    });

    it('filters cases directly using Filter Dropdown options', () => {
      render(<CasesScreen />);
      // Open Filter dropdown
      fireEvent.press(screen.getByTestId('cases-filter-dropdown-btn'));
      // Select Disposed
      fireEvent.press(screen.getByTestId('filter-option-disposed'));

      // Dropdown closes and filter is applied
      expect(screen.queryByTestId('cases-filter-dropdown-menu')).toBeNull();
      expect(screen.getByTestId('case-card-3')).toBeTruthy();
      expect(screen.queryByTestId('case-card-1')).toBeNull();
    });
  });

  // 3. ADVANCED SORTING
  describe('3. Advanced Sorting', () => {
    it('opens Sort dropdown menu and selects sort field', () => {
      render(<CasesScreen />);
      // Open Sort dropdown
      fireEvent.press(screen.getByTestId('cases-sort-dropdown-btn'));
      expect(screen.getByTestId('cases-sort-dropdown-menu')).toBeTruthy();

      // Select Case Date
      const sortCaseDate = screen.getByTestId('sort-option-case_date');
      fireEvent.press(sortCaseDate);

      expect(screen.queryByTestId('cases-sort-dropdown-menu')).toBeNull();
      expect(screen.getByTestId('cases-list')).toBeTruthy();
    });

    it('toggles sort direction via sort dropdown menu', () => {
      render(<CasesScreen />);
      fireEvent.press(screen.getByTestId('cases-sort-dropdown-btn'));
      expect(screen.getByTestId('sort-direction-asc')).toBeTruthy();
      fireEvent.press(screen.getByTestId('sort-direction-asc'));

      expect(screen.getByTestId('cases-list')).toBeTruthy();
    });
  });

  // 4. CASE CARD ACTIONS
  describe('4. Case Card Actions', () => {
    it('navigates to case details when row or view button is pressed', () => {
      render(<CasesScreen />);
      const viewBtn = screen.getByTestId('case-card-view-btn-1');
      fireEvent.press(viewBtn);

      expect(mockPush).toHaveBeenCalledWith('/cases/1');
    });

    it('expands quick details drawer when Quick Details is tapped', () => {
      render(<CasesScreen />);
      const expandBtn = screen.getByTestId('case-card-expand-btn-1');
      fireEvent.press(expandBtn);

      expect(screen.getByTestId('case-expanded-1')).toBeTruthy();
      expect(screen.getByText('Petitioner Person 1')).toBeTruthy();

      // Tap again to collapse
      fireEvent.press(expandBtn);
      expect(screen.queryByTestId('case-expanded-1')).toBeNull();
    });

    it('opens EditCaseModal when Edit button is pressed', () => {
      render(<CasesScreen />);
      const editBtn = screen.getByTestId('case-card-edit-btn-1');
      fireEvent.press(editBtn);

      expect(screen.getByTestId('edit-case-modal')).toBeTruthy();
      expect(screen.getByText('Edit Case Details')).toBeTruthy();
    });

    it('opens ConfirmDialog when Delete button is pressed', () => {
      render(<CasesScreen />);
      const deleteBtn = screen.getByTestId('case-card-delete-btn-1');
      fireEvent.press(deleteBtn);

      expect(screen.getByTestId('delete-case-dialog')).toBeTruthy();
      expect(screen.getByText('Remove Case from Active Docket?')).toBeTruthy();
    });

    it('filters list by status when status badge is tapped', () => {
      render(<CasesScreen />);
      const statusBadge = screen.getByTestId('case-status-badge-1');
      fireEvent.press(statusBadge);

      // Status filter is activated
      expect(screen.getByTestId('active-chip-status')).toBeTruthy();
    });
  });

  // 5. PAGINATION
  describe('5. Pagination', () => {
    it('displays 10 cases per page with 15 total items and advances to next page', () => {
      render(<CasesScreen />);
      expect(screen.getByTestId('cases-pagination-summary')).toBeTruthy();
      expect(screen.getByText(/Showing 1.*10 of 15/)).toBeTruthy();

      // Case 1 is visible, Case 11 is on Page 2
      expect(screen.getByTestId('case-card-1')).toBeTruthy();
      expect(screen.queryByTestId('case-card-11')).toBeNull();

      // Press Next
      const nextBtn = screen.getByTestId('cases-pagination-next');
      fireEvent.press(nextBtn);

      // Now on Page 2
      expect(screen.getByText(/Showing 11.*15 of 15/)).toBeTruthy();
      expect(screen.getByTestId('case-card-11')).toBeTruthy();
      expect(screen.queryByTestId('case-card-1')).toBeNull();

      // Press Prev
      const prevBtn = screen.getByTestId('cases-pagination-prev');
      fireEvent.press(prevBtn);

      // Back to Page 1
      expect(screen.getByText(/Showing 1.*10 of 15/)).toBeTruthy();
      expect(screen.getByTestId('case-card-1')).toBeTruthy();
    });

    it('navigates directly to page number via page pills', () => {
      render(<CasesScreen />);
      const page2Pill = screen.getByTestId('cases-pagination-page-2');
      fireEvent.press(page2Pill);

      expect(screen.getByText(/Showing 11.*15 of 15/)).toBeTruthy();
    });
  });

  // 6. MODAL & IMPORT INTEGRATIONS
  describe('6. Modal Integrations', () => {
    it('opens DocumentImportModal when Import button is tapped', () => {
      render(<CasesScreen />);
      const importBtn = screen.getByTestId('import-cases-button');
      fireEvent.press(importBtn);

      expect(screen.getByTestId('document-import-modal')).toBeTruthy();
    });

    it('opens VoiceInputModal when Voice Search button is tapped', () => {
      render(<CasesScreen />);
      const voiceBtn = screen.getByTestId('cases-voice-mic-button');
      fireEvent.press(voiceBtn);

      expect(screen.getByTestId('voice-input-modal')).toBeTruthy();
    });
  });

  // 7. CSV EXPORT
  describe('7. CSV Export', () => {
    it('triggers CSV export when Export button is clicked', () => {
      render(<CasesScreen />);
      const exportBtn = screen.getByTestId('export-cases-csv-button');
      expect(exportBtn).toBeTruthy();
      fireEvent.press(exportBtn);

      // Toast feedback or file export called
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringMatching(/Exported \d+ case record/i),
        'success'
      );
    });
  });
});
