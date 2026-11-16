import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Badge } from '../../components/common/Badge';
import { AppIcon } from '../../components/common/AppIcon';
import { SkeletonCard } from '../../components/common/SkeletonCard';
import { ErrorState } from '../../components/common/ErrorState';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { CaseCard } from '../../components/cases/CaseCard';
import { JudgmentDetailsModal } from '../../components/cases/JudgmentDetailsModal';
import { DocumentImportModal } from '../../components/cases/DocumentImportModal';
import {
  CaseFilterModal,
  CaseFilters,
  DEFAULT_FILTERS,
  countActiveFilters,
} from '../../components/cases/CaseFilterModal';
import { EditCaseModal } from '../../components/cases/EditCaseModal';
import { VoiceInputModal } from '../../components/speech/VoiceInputModal';
import { FilterDropdownMenu } from '../../components/cases/FilterDropdownMenu';
import { SortDropdownMenu } from '../../components/cases/SortDropdownMenu';
import { exportCasesToCsvFile } from '../../utils/csvExport';
import { OfflineBanner } from '../../components/offline/OfflineBanner';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { useCases, useDeleteCase } from '../../features/cases/hooks';
import { useAuth } from '../../features/auth/AuthContext';
import { normalizeVoiceQuery } from '../../services/speech/voiceQueryNormalizer';
import { CaseItem } from '../../types';
import { API_BASE_URL } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { tokenStorage } from '../../services/auth/tokenStorage';
import { formatCaseNumber } from '../../utils/formatters';

export type QuickFilterType =
  | 'ALL'
  | 'UPCOMING'
  | 'PENDING'
  | 'ADJOURNED'
  | 'DISPOSED'
  | 'WITH_JUDGMENT'
  | 'WITHOUT_JUDGMENT';

export type SortType =
  | 'CASE_DATE'
  | 'NEXT_HEARING'
  | 'JUDGMENT_DATE'
  | 'CLOSED_DATE'
  | 'CASE_NAME'
  | 'CASE_NUMBER'
  | 'RECENTLY_UPDATED';

const PAGE_SIZE = 10;

const VALID_QUICK_FILTERS: QuickFilterType[] = [
  'ALL',
  'UPCOMING',
  'PENDING',
  'ADJOURNED',
  'DISPOSED',
  'WITH_JUDGMENT',
  'WITHOUT_JUDGMENT',
];

/** Parse date string to timestamp in ms, returning null if invalid or N/A */
const parseDateToMs = (dateStr?: string | null): number | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (
    !trimmed ||
    trimmed.toUpperCase() === 'N/A' ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'undefined'
  ) {
    return null;
  }
  const t = new Date(trimmed).getTime();
  return isNaN(t) ? null : t;
};

export default function CasesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string; filter?: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const { showToast } = useToast();
  const { isAuthenticated, isDemo } = useAuth();

  const {
    data: cases,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useCases({ enabled: Boolean(isAuthenticated || isDemo) });

  const deleteCaseMutation = useDeleteCase();

  // Search state
  const [searchQuery, setSearchQuery] = useState(params.search || '');

  // Quick Filter Pill state
  const initialQuickFilter =
    params.filter && VALID_QUICK_FILTERS.includes(params.filter as QuickFilterType)
      ? (params.filter as QuickFilterType)
      : 'ALL';
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>(initialQuickFilter);

  // Advanced Filters state
  const [advancedFilters, setAdvancedFilters] = useState<CaseFilters>(DEFAULT_FILTERS);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);

  // Sorting state
  const [sortBy, setSortBy] = useState<SortType>('CASE_DATE');
  const [sortAsc, setSortAsc] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Action Modals State
  const [caseToEdit, setCaseToEdit] = useState<CaseItem | null>(null);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);

  const [caseToDelete, setCaseToDelete] = useState<CaseItem | null>(null);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);

  const [selectedCaseForJudgment, setSelectedCaseForJudgment] = useState<CaseItem | null>(
    null
  );
  const [isJudgmentModalVisible, setIsJudgmentModalVisible] = useState(false);

  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isImportModalVisible, setIsImportModalVisible] = useState(false);

  // Dropdown Menus State & Position
  const filterBtnRef = React.useRef<View>(null);
  const sortBtnRef = React.useRef<View>(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [filterMenuCoords, setFilterMenuCoords] = useState<
    { x: number; y: number } | undefined
  >(undefined);
  const [sortMenuCoords, setSortMenuCoords] = useState<
    { x: number; y: number } | undefined
  >(undefined);

  const handleOpenFilterDropdown = () => {
    setIsSortDropdownOpen(false);
    setIsFilterDropdownOpen(true);
    if (
      filterBtnRef.current &&
      typeof (filterBtnRef.current as any).measureInWindow === 'function'
    ) {
      try {
        (filterBtnRef.current as any).measureInWindow(
          (x: number, y: number, w: number, h: number) => {
            if (typeof y === 'number' && typeof h === 'number') {
              setFilterMenuCoords({ x, y: y + h + 4 });
            }
          }
        );
      } catch {
        // fallback in environments where measureInWindow is not implemented
      }
    }
  };

  const handleOpenSortDropdown = () => {
    setIsFilterDropdownOpen(false);
    setIsSortDropdownOpen(true);
    if (
      sortBtnRef.current &&
      typeof (sortBtnRef.current as any).measureInWindow === 'function'
    ) {
      try {
        (sortBtnRef.current as any).measureInWindow(
          (x: number, y: number, w: number, h: number) => {
            if (typeof y === 'number' && typeof h === 'number') {
              setSortMenuCoords({ x, y: y + h + 4 });
            }
          }
        );
      } catch {
        // fallback in environments where measureInWindow is not implemented
      }
    }
  };

  // Sync route param if search parameter changes
  useEffect(() => {
    if (params.search !== undefined && params.search !== searchQuery) {
      setSearchQuery(params.search);
      setCurrentPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.search]);

  // Sync route filter param when navigating from dashboard StatCards
  useEffect(() => {
    if (params.filter) {
      const pFilter = params.filter.toUpperCase();
      if (VALID_QUICK_FILTERS.includes(pFilter as QuickFilterType)) {
        setQuickFilter(pFilter as QuickFilterType);
        setCurrentPage(1);
      } else if (['PENDING', 'DISPOSED', 'ADJOURNED'].includes(pFilter)) {
        setAdvancedFilters(prev => ({
          ...prev,
          status: pFilter as CaseFilters['status'],
        }));
        setCurrentPage(1);
      }
    }
  }, [params.filter]);

  const handleExportCsv = async () => {
    if (isExportingCsv) return;
    try {
      setIsExportingCsv(true);

      if (!filteredAndSortedCases || filteredAndSortedCases.length === 0) {
        showToast(
          t('export.emptyRecords', 'No cases match your current filters to export.'),
          'warning'
        );
        return;
      }

      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = `APHC_My_Cases_${dateStamp}.csv`;

      const result = exportCasesToCsvFile(filteredAndSortedCases, filename);
      if (result.success) {
        showToast(
          t(
            'export.success',
            `Exported ${result.count} case record(s) to ${result.filename}`
          ),
          'success'
        );
      } else {
        showToast(
          result.error || t('export.failed', 'Failed to generate CSV export.'),
          'error'
        );
      }
    } catch {
      showToast(t('export.exportFailed', 'Failed to generate CSV export.'), 'error');
    } finally {
      setIsExportingCsv(false);
    }
  };

  const getFilterDropdownLabel = (): string => {
    if (quickFilter === 'UPCOMING') return 'Upcoming';
    if (quickFilter === 'PENDING') return 'Pending';
    if (quickFilter === 'ADJOURNED') return 'Adjourned';
    if (quickFilter === 'DISPOSED') return 'Disposed';
    if (quickFilter === 'WITH_JUDGMENT') return 'Judgment';
    if (quickFilter === 'WITHOUT_JUDGMENT') return 'Pending Jdg';
    if (activeAdvancedFilterCount > 0) return `Filters (${activeAdvancedFilterCount})`;
    return 'Filter';
  };

  const getSortDropdownLabel = (): string => {
    const dir = sortAsc ? '↑' : '↓';
    switch (sortBy) {
      case 'CASE_DATE':
        return `Date ${dir}`;
      case 'NEXT_HEARING':
        return `Hearing ${dir}`;
      case 'JUDGMENT_DATE':
        return `Jdg Date ${dir}`;
      case 'CLOSED_DATE':
        return `Closed ${dir}`;
      case 'CASE_NAME':
        return `Name ${dir}`;
      case 'CASE_NUMBER':
        return `No. ${dir}`;
      case 'RECENTLY_UPDATED':
        return `Updated ${dir}`;
      default:
        return `Sort ${dir}`;
    }
  };

  // Combined Search, Multi-Filter, and Multi-Sort Pipeline
  const filteredAndSortedCases = useMemo(() => {
    const rawList: CaseItem[] = Array.isArray(cases)
      ? cases
      : Array.isArray((cases as unknown as { results?: CaseItem[] })?.results)
        ? (cases as unknown as { results: CaseItem[] }).results
        : [];
    let result: CaseItem[] = rawList.slice();

    // 1. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const normResult = normalizeVoiceQuery(searchQuery);
      const normalizedQ = normResult.normalized.toLowerCase().trim();

      result = result.filter(item => {
        const fullCaseNumber = formatCaseNumber(
          item.case_type,
          item.case_number,
          item.filing_year
        ).toLowerCase();
        const rawCaseNumber = String(item.case_number || '').toLowerCase();
        const caseType = String(item.case_type || '').toLowerCase();
        const parties = `${item.petitioner || ''} ${item.respondent || ''}`.toLowerCase();
        const advocate = `${item.petitioner_advocate || ''} ${
          item.respondent_advocate || ''
        }`.toLowerCase();
        const court = `${item.bench || ''}`.toLowerCase();
        const hall = item.court_hall_number ? String(item.court_hall_number) : '';

        return (
          fullCaseNumber.includes(q) ||
          fullCaseNumber.includes(normalizedQ) ||
          rawCaseNumber.includes(q) ||
          rawCaseNumber.includes(normalizedQ) ||
          caseType.includes(q) ||
          parties.includes(q) ||
          parties.includes(normalizedQ) ||
          advocate.includes(q) ||
          advocate.includes(normalizedQ) ||
          court.includes(q) ||
          hall === q
        );
      });
    }

    // 2. Quick Filter Pills
    if (quickFilter === 'UPCOMING') {
      result = result.filter(item => {
        const status = (item.status || item.current_stage || '').toLowerCase();
        return (
          status.includes('upcoming') ||
          status.includes('listed') ||
          Boolean(item.effective_next_hearing_date || item.next_hearing_date)
        );
      });
    } else if (quickFilter === 'ADJOURNED') {
      result = result.filter(item => {
        const status = (item.status || item.current_stage || '').toLowerCase();
        return status.includes('adjourn');
      });
    } else if (quickFilter === 'DISPOSED') {
      result = result.filter(item => {
        const status = (item.status || item.current_stage || '').toLowerCase();
        return status.includes('disposed') || status.includes('closed');
      });
    } else if (quickFilter === 'WITH_JUDGMENT') {
      result = result.filter(item => Boolean(item.judgment_date || item.latest_judgment));
    } else if (quickFilter === 'WITHOUT_JUDGMENT') {
      result = result.filter(item => !item.judgment_date && !item.latest_judgment);
    }

    // 3. Advanced Multi-Filters

    // A. Status Filter
    if (advancedFilters.status !== 'ALL') {
      result = result.filter(item => {
        const s = (item.status || item.current_stage || '').toUpperCase();
        return s.includes(advancedFilters.status);
      });
    }

    // B. Hearing Timeframe Filter
    if (advancedFilters.hearing !== 'ALL') {
      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).getTime();
      const endOfToday = startOfToday + 86400000 - 1;
      const endOfWeek = startOfToday + 7 * 86400000;
      const endOfMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59
      ).getTime();

      result = result.filter(item => {
        const hDate = parseDateToMs(
          item.effective_next_hearing_date || item.next_hearing_date
        );

        if (advancedFilters.hearing === 'NOT_SCHEDULED') {
          return hDate === null;
        }
        if (hDate === null) return false;

        switch (advancedFilters.hearing) {
          case 'TODAY':
            return hDate >= startOfToday && hDate <= endOfToday;
          case 'THIS_WEEK':
            return hDate >= startOfToday && hDate <= endOfWeek;
          case 'THIS_MONTH':
            return hDate >= startOfToday && hDate <= endOfMonth;
          case 'UPCOMING':
            return hDate >= startOfToday;
          case 'PAST':
            return hDate < startOfToday;
          default:
            return true;
        }
      });
    }

    // C. Judgment Availability Filter
    if (advancedFilters.judgment !== 'ALL') {
      result = result.filter(item => {
        const hasJ = Boolean(item.judgment_date || item.latest_judgment);
        if (advancedFilters.judgment === 'AVAILABLE') return hasJ;
        if (advancedFilters.judgment === 'PENDING') {
          const s = (item.status || '').toUpperCase();
          return !hasJ && (s.includes('DISPOSED') || s.includes('CLOSED'));
        }
        if (advancedFilters.judgment === 'NOT_AVAILABLE') return !hasJ;
        return true;
      });
    }

    // D. Filing / Started Date Range Filter
    if (advancedFilters.filingDateFrom || advancedFilters.filingDateTo) {
      const fromMs = parseDateToMs(advancedFilters.filingDateFrom);
      const toMs = parseDateToMs(advancedFilters.filingDateTo);
      result = result.filter(item => {
        const fMs = item.filing_year
          ? new Date(item.filing_year, 0, 1).getTime()
          : parseDateToMs(item.created_at);
        if (fMs === null) return false;
        if (fromMs !== null && fMs < fromMs) return false;
        if (toMs !== null && fMs > toMs + 86400000) return false;
        return true;
      });
    }

    // E. Next Hearing Date Range Filter
    if (advancedFilters.hearingDateFrom || advancedFilters.hearingDateTo) {
      const fromMs = parseDateToMs(advancedFilters.hearingDateFrom);
      const toMs = parseDateToMs(advancedFilters.hearingDateTo);
      result = result.filter(item => {
        const hMs = parseDateToMs(
          item.effective_next_hearing_date || item.next_hearing_date
        );
        if (hMs === null) return false;
        if (fromMs !== null && hMs < fromMs) return false;
        if (toMs !== null && hMs > toMs + 86400000) return false;
        return true;
      });
    }

    // F. Closed / Disposal Date Range Filter
    if (advancedFilters.closedDateFrom || advancedFilters.closedDateTo) {
      const fromMs = parseDateToMs(advancedFilters.closedDateFrom);
      const toMs = parseDateToMs(advancedFilters.closedDateTo);
      result = result.filter(item => {
        const cMs = parseDateToMs(
          item.judgment_date || item.latest_judgment?.judgment_date
        );
        if (cMs === null) return false;
        if (fromMs !== null && cMs < fromMs) return false;
        if (toMs !== null && cMs > toMs + 86400000) return false;
        return true;
      });
    }

    // G. Court Hall Filter
    if (advancedFilters.courtHallNumber?.trim()) {
      const targetHall = advancedFilters.courtHallNumber.trim().toLowerCase();
      result = result.filter(item => {
        return (
          item.court_hall_number !== null &&
          String(item.court_hall_number).toLowerCase() === targetHall
        );
      });
    }

    // H. Court Name Filter
    if (advancedFilters.court?.trim()) {
      const targetCourt = advancedFilters.court.trim().toLowerCase();
      result = result.filter(item => {
        const cName = `${item.bench || ''}`.toLowerCase();
        return cName.includes(targetCourt);
      });
    }

    // I. Case Type Filter
    if (advancedFilters.caseType?.trim()) {
      const targetType = advancedFilters.caseType.trim().toUpperCase();
      result = result.filter(item => {
        return (item.case_type || '').toUpperCase() === targetType;
      });
    }

    // J. Filing Year Filter
    if (advancedFilters.caseYear?.trim()) {
      const targetYear = parseInt(advancedFilters.caseYear.trim(), 10);
      result = result.filter(item => {
        return item.filing_year === targetYear;
      });
    }

    // 4. Sorting with Consistent Missing Date Handling
    result.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'CASE_DATE') {
        const dateA = a.filing_year
          ? new Date(a.filing_year, 0, 1).getTime()
          : parseDateToMs(a.created_at);
        const dateB = b.filing_year
          ? new Date(b.filing_year, 0, 1).getTime()
          : parseDateToMs(b.created_at);
        if (dateA === null && dateB === null) comparison = 0;
        else if (dateA === null) comparison = -1;
        else if (dateB === null) comparison = 1;
        else comparison = dateA - dateB;
      } else if (sortBy === 'NEXT_HEARING') {
        const dateA = parseDateToMs(a.effective_next_hearing_date || a.next_hearing_date);
        const dateB = parseDateToMs(b.effective_next_hearing_date || b.next_hearing_date);
        if (dateA === null && dateB === null) comparison = 0;
        else if (dateA === null) comparison = -1;
        else if (dateB === null) comparison = 1;
        else comparison = dateA - dateB;
      } else if (sortBy === 'JUDGMENT_DATE') {
        const dateA = parseDateToMs(a.judgment_date || a.latest_judgment?.judgment_date);
        const dateB = parseDateToMs(b.judgment_date || b.latest_judgment?.judgment_date);
        if (dateA === null && dateB === null) comparison = 0;
        else if (dateA === null) comparison = -1;
        else if (dateB === null) comparison = 1;
        else comparison = dateA - dateB;
      } else if (sortBy === 'CLOSED_DATE') {
        const statusA = (a.status || '').toUpperCase();
        const statusB = (b.status || '').toUpperCase();
        const isDisposedA = statusA.includes('DISPOSED') || statusA.includes('CLOSED');
        const isDisposedB = statusB.includes('DISPOSED') || statusB.includes('CLOSED');
        const dateA = isDisposedA
          ? parseDateToMs(a.judgment_date || a.latest_judgment?.judgment_date)
          : null;
        const dateB = isDisposedB
          ? parseDateToMs(b.judgment_date || b.latest_judgment?.judgment_date)
          : null;
        if (dateA === null && dateB === null) comparison = 0;
        else if (dateA === null) comparison = -1;
        else if (dateB === null) comparison = 1;
        else comparison = dateA - dateB;
      } else if (sortBy === 'CASE_NAME') {
        const nameA = `${a.petitioner || ''} vs ${a.respondent || ''}`.toLowerCase();
        const nameB = `${b.petitioner || ''} vs ${b.respondent || ''}`.toLowerCase();
        comparison = nameA.localeCompare(nameB);
      } else if (sortBy === 'CASE_NUMBER') {
        const numA = `${a.case_type || ''} ${a.case_number || ''}/${a.filing_year || ''}`;
        const numB = `${b.case_type || ''} ${b.case_number || ''}/${b.filing_year || ''}`;
        comparison = numA.localeCompare(numB);
      } else if (sortBy === 'RECENTLY_UPDATED') {
        const dateA = parseDateToMs(a.updated_at);
        const dateB = parseDateToMs(b.updated_at);
        if (dateA === null && dateB === null) comparison = 0;
        else if (dateA === null) comparison = -1;
        else if (dateB === null) comparison = 1;
        else comparison = dateA - dateB;
      }

      return sortAsc ? comparison : -comparison;
    });

    return result;
  }, [cases, searchQuery, quickFilter, advancedFilters, sortBy, sortAsc]);

  // Pagination calculation
  const totalCases = filteredAndSortedCases.length;
  const totalPages = Math.max(1, Math.ceil(totalCases / PAGE_SIZE));
  const currentPageSafe = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedCases = useMemo(() => {
    const startIdx = (currentPageSafe - 1) * PAGE_SIZE;
    return filteredAndSortedCases.slice(startIdx, startIdx + PAGE_SIZE);
  }, [filteredAndSortedCases, currentPageSafe]);

  const activeAdvancedFilterCount = countActiveFilters(advancedFilters);

  // Active filter chip removable descriptors
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];

    if (advancedFilters.status !== 'ALL') {
      chips.push({
        key: 'status',
        label: `Status: ${advancedFilters.status}`,
        onRemove: () => setAdvancedFilters(p => ({ ...p, status: 'ALL' })),
      });
    }
    if (advancedFilters.hearing !== 'ALL') {
      chips.push({
        key: 'hearing',
        label: `Schedule: ${advancedFilters.hearing.replace('_', ' ')}`,
        onRemove: () => setAdvancedFilters(p => ({ ...p, hearing: 'ALL' })),
      });
    }
    if (advancedFilters.judgment !== 'ALL') {
      chips.push({
        key: 'judgment',
        label: `Judgment: ${advancedFilters.judgment.replace('_', ' ')}`,
        onRemove: () => setAdvancedFilters(p => ({ ...p, judgment: 'ALL' })),
      });
    }
    if (advancedFilters.filingDateFrom || advancedFilters.filingDateTo) {
      chips.push({
        key: 'filingDate',
        label: `Filing: ${advancedFilters.filingDateFrom || 'Start'} to ${
          advancedFilters.filingDateTo || 'End'
        }`,
        onRemove: () =>
          setAdvancedFilters(p => ({ ...p, filingDateFrom: '', filingDateTo: '' })),
      });
    }
    if (advancedFilters.hearingDateFrom || advancedFilters.hearingDateTo) {
      chips.push({
        key: 'hearingDate',
        label: `Hearing: ${advancedFilters.hearingDateFrom || 'Start'} to ${
          advancedFilters.hearingDateTo || 'End'
        }`,
        onRemove: () =>
          setAdvancedFilters(p => ({ ...p, hearingDateFrom: '', hearingDateTo: '' })),
      });
    }
    if (advancedFilters.closedDateFrom || advancedFilters.closedDateTo) {
      chips.push({
        key: 'closedDate',
        label: `Closed: ${advancedFilters.closedDateFrom || 'Start'} to ${
          advancedFilters.closedDateTo || 'End'
        }`,
        onRemove: () =>
          setAdvancedFilters(p => ({ ...p, closedDateFrom: '', closedDateTo: '' })),
      });
    }
    if (advancedFilters.courtHallNumber?.trim()) {
      chips.push({
        key: 'courtHall',
        label: `Hall ${advancedFilters.courtHallNumber}`,
        onRemove: () => setAdvancedFilters(p => ({ ...p, courtHallNumber: '' })),
      });
    }
    if (advancedFilters.court?.trim()) {
      chips.push({
        key: 'court',
        label: `Court: ${advancedFilters.court}`,
        onRemove: () => setAdvancedFilters(p => ({ ...p, court: '' })),
      });
    }
    if (advancedFilters.caseType?.trim()) {
      chips.push({
        key: 'caseType',
        label: `Type: ${advancedFilters.caseType}`,
        onRemove: () => setAdvancedFilters(p => ({ ...p, caseType: '' })),
      });
    }
    if (advancedFilters.caseYear?.trim()) {
      chips.push({
        key: 'caseYear',
        label: `Year: ${advancedFilters.caseYear}`,
        onRemove: () => setAdvancedFilters(p => ({ ...p, caseYear: '' })),
      });
    }

    return chips;
  }, [advancedFilters]);

  // Case Actions Handlers
  const handleSelectCase = (id: number) => {
    router.push(`/cases/${id}`);
  };

  const handleEditCase = (item: CaseItem) => {
    setCaseToEdit(item);
    setIsEditModalVisible(true);
  };

  const handleDeletePrompt = (item: CaseItem) => {
    setCaseToDelete(item);
    setIsDeleteConfirmVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (!caseToDelete) return;
    try {
      await deleteCaseMutation.mutateAsync(caseToDelete.id);
      showToast(
        `Case ${formatCaseNumber(
          caseToDelete.case_type,
          caseToDelete.case_number,
          caseToDelete.filing_year
        )} removed from your docket.`,
        'success'
      );
      setIsDeleteConfirmVisible(false);
      setCaseToDelete(null);
      refetch();
    } catch {
      showToast('Failed to remove case. Please check connection.', 'error');
    }
  };

  const handleOpenJudgment = (item: CaseItem) => {
    setSelectedCaseForJudgment(item);
    setIsJudgmentModalVisible(true);
  };

  const handleCloseJudgment = () => {
    setIsJudgmentModalVisible(false);
    setSelectedCaseForJudgment(null);
  };

  const handleStatusBadgeClick = (statusText: string) => {
    const s = statusText.toUpperCase();
    if (['PENDING', 'DISPOSED', 'ADJOURNED'].includes(s)) {
      setAdvancedFilters(p => ({ ...p, status: s as CaseFilters['status'] }));
      setCurrentPage(1);
    }
  };

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setQuickFilter('ALL');
    setAdvancedFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
  };

  return (
    <ScreenContainer testID="cases-screen">
      <OfflineBanner onSyncComplete={refetch} />
      <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
        {/* Header Title Row */}
        <View style={styles.headerTitleRow}>
          <Text style={styles.caseCountText}>{t('cases.myCases', 'My Cases')}</Text>
          <Badge label={String(totalCases)} variant="primary" />
        </View>

        {/* Unified Responsive Toolbar */}
        <View style={[styles.toolbarContainer, isDesktop && styles.toolbarDesktop]}>
          {/* Row 1: Search Input (Full width on mobile) with Clear Button & Voice Search */}
          <View
            style={[styles.searchContainer, isDesktop && styles.searchContainerDesktop]}
          >
            <View style={styles.searchInputWrap}>
              <AppIcon name="search" size={16} color={Colors.text.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder={t(
                  'cases.searchPlaceholder',
                  'Search by Case Type, Number, Party or Advocate...'
                )}
                placeholderTextColor={Colors.text.muted}
                value={searchQuery}
                onChangeText={txt => {
                  setSearchQuery(txt);
                  setCurrentPage(1);
                }}
                clearButtonMode="never"
                testID="cases-search-input"
              />
              {Boolean(searchQuery) && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  style={styles.searchClearBtn}
                  testID="cases-search-clear-button"
                  accessibilityLabel="Clear search"
                >
                  <AppIcon name="x" size={15} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.voiceSearchButton}
              onPress={() => setIsVoiceModalVisible(true)}
              testID="cases-voice-mic-button"
              accessibilityLabel={t('voice.openVoiceSearch', 'Voice search')}
            >
              <AppIcon name="mic" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Row 2: Controls Row (Filter dropdown, Sort dropdown, Import, Export CSV) */}
          <View style={[styles.controlsRow, isDesktop && styles.controlsRowDesktop]}>
            {/* Filter Dropdown Button */}
            <View ref={filterBtnRef} collapsable={false} style={styles.controlBtnWrapper}>
              <TouchableOpacity
                style={[
                  styles.toolbarBtn,
                  styles.dropdownBtn,
                  (quickFilter !== 'ALL' || activeAdvancedFilterCount > 0) &&
                    styles.toolbarBtnActive,
                ]}
                onPress={handleOpenFilterDropdown}
                testID="cases-filter-dropdown-btn"
                accessibilityLabel="Filter cases dropdown"
              >
                <AppIcon
                  name="filter"
                  size={13}
                  color={
                    quickFilter !== 'ALL' || activeAdvancedFilterCount > 0
                      ? '#1D4ED8'
                      : '#475569'
                  }
                />
                <Text
                  style={[
                    styles.toolbarBtnText,
                    (quickFilter !== 'ALL' || activeAdvancedFilterCount > 0) &&
                      styles.toolbarBtnTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {getFilterDropdownLabel()}
                </Text>
                {(quickFilter !== 'ALL' || activeAdvancedFilterCount > 0) && (
                  <View style={styles.activeDot} testID="filter-active-dot" />
                )}
                <AppIcon
                  name="chevron-down"
                  size={12}
                  color={
                    quickFilter !== 'ALL' || activeAdvancedFilterCount > 0
                      ? '#1D4ED8'
                      : '#94A3B8'
                  }
                />
              </TouchableOpacity>
            </View>

            {/* Sort Dropdown Button */}
            <View ref={sortBtnRef} collapsable={false} style={styles.controlBtnWrapper}>
              <TouchableOpacity
                style={[styles.toolbarBtn, styles.dropdownBtn]}
                onPress={handleOpenSortDropdown}
                testID="cases-sort-dropdown-btn"
                accessibilityLabel="Sort cases dropdown"
              >
                <AppIcon name="sliders" size={13} color="#475569" />
                <Text style={styles.toolbarBtnText} numberOfLines={1}>
                  {getSortDropdownLabel()}
                </Text>
                <AppIcon name="chevron-down" size={12} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Import Files Button */}
            <TouchableOpacity
              style={[styles.toolbarBtn, styles.importBtn]}
              onPress={() => setIsImportModalVisible(true)}
              testID="import-cases-button"
              accessibilityLabel={t('import.importFiles', 'Import Files')}
            >
              <AppIcon name="upload" size={13} color="#FFFFFF" />
              <Text style={styles.importBtnText} numberOfLines={1}>
                {width < 360 ? 'Import' : isDesktop ? 'Import Files' : 'Import'}
              </Text>
            </TouchableOpacity>

            {/* Export CSV Button */}
            <TouchableOpacity
              style={[styles.toolbarBtn, styles.exportBtn]}
              onPress={handleExportCsv}
              disabled={isExportingCsv}
              testID="export-cases-csv-button"
              accessibilityLabel={t('export.exportCsv', 'Export CSV')}
            >
              <AppIcon
                name="download"
                size={13}
                color={isExportingCsv ? '#94A3B8' : Colors.primary}
              />
              <Text
                style={[
                  styles.exportBtnText,
                  isExportingCsv && styles.exportBtnTextDisabled,
                ]}
                numberOfLines={1}
              >
                {isExportingCsv
                  ? '...'
                  : width < 360
                    ? 'CSV'
                    : isDesktop
                      ? t('export.exportCsv', 'Export CSV')
                      : 'Export'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Removable Filters Chips Bar */}
        {activeChips.length > 0 && (
          <View style={styles.activeChipsBar} testID="active-filter-chips-row">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.activeChipsInner}>
                <Text style={styles.activeChipsLabel}>Active Filters:</Text>
                {activeChips.map(chip => (
                  <TouchableOpacity
                    key={chip.key}
                    style={styles.activeChipPill}
                    onPress={chip.onRemove}
                    testID={`active-chip-${chip.key}`}
                  >
                    <Text style={styles.activeChipText}>{chip.label}</Text>
                    <AppIcon name="x" size={12} color="#1D4ED8" />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={handleClearAllFilters}
                  style={styles.clearAllLink}
                  testID="clear-active-filters-btn"
                >
                  <Text style={styles.clearAllLinkText}>Clear All</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        )}

        {/* Body Content */}
        {isLoading ? (
          <View testID="cases-loading-skeleton">
            <SkeletonCard variant="list-item" count={3} />
            <Text style={styles.loadingText}>{t('common.loading', 'Loading...')}</Text>
          </View>
        ) : isError ? (
          <ErrorState
            title="Could Not Load Cases"
            message="Unable to connect to the APHC docket service. Please verify your connection."
            retryLabel={t('common.retry', 'Retry')}
            onRetry={() => refetch()}
            testID="cases-error-state"
            retryTestID="cases-retry-button"
          />
        ) : totalCases === 0 ? (
          <EmptyState
            title={t('cases.empty', 'No Cases Found')}
            description={
              searchQuery.trim() || activeChips.length > 0
                ? `No matters match your search criteria. Clear your search query or reset active filters.`
                : 'No cases are currently assigned to your practice docket.'
            }
            actionLabel={
              searchQuery.trim() || activeChips.length > 0
                ? 'Clear Filters & Search'
                : 'Refresh Docket'
            }
            onAction={
              searchQuery.trim() || activeChips.length > 0
                ? handleClearAllFilters
                : () => refetch()
            }
            iconName="briefcase"
            testID="cases-empty-state"
          />
        ) : (
          <>
            <FlatList
              data={paginatedCases}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => (
                <CaseCard
                  item={item}
                  onPress={handleSelectCase}
                  onEdit={handleEditCase}
                  onDelete={handleDeletePrompt}
                  onViewJudgment={handleOpenJudgment}
                  onStatusClick={handleStatusBadgeClick}
                />
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={refetch}
                  tintColor={Colors.primary}
                  colors={[Colors.primary]}
                />
              }
              testID="cases-list"
            />

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <View style={styles.paginationRow}>
                <Text style={styles.paginationSummary} testID="cases-pagination-summary">
                  Showing {(currentPageSafe - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPageSafe * PAGE_SIZE, totalCases)} of {totalCases}
                </Text>

                <View style={styles.paginationNav}>
                  {/* Previous Button */}
                  <TouchableOpacity
                    style={[
                      styles.pageNavBtn,
                      currentPageSafe <= 1 && styles.pageNavBtnDisabled,
                    ]}
                    onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPageSafe <= 1}
                    testID="cases-pagination-prev"
                  >
                    <AppIcon
                      name="chevron-left"
                      size={14}
                      color={currentPageSafe <= 1 ? '#CBD5E1' : '#1E293B'}
                    />
                    <Text
                      style={[
                        styles.pageNavBtnText,
                        currentPageSafe <= 1 && styles.pageNavBtnTextDisabled,
                      ]}
                    >
                      Prev
                    </Text>
                  </TouchableOpacity>

                  {/* Compact Page Number Pills */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(
                      p =>
                        p === 1 || p === totalPages || Math.abs(p - currentPageSafe) <= 1
                    )
                    .map((pageNum, idx, arr) => {
                      const showEllipsisBefore = idx > 0 && pageNum - arr[idx - 1] > 1;
                      const isSelected = pageNum === currentPageSafe;
                      return (
                        <React.Fragment key={pageNum}>
                          {showEllipsisBefore ? (
                            <Text style={styles.pageEllipsis}>...</Text>
                          ) : null}
                          <TouchableOpacity
                            style={[
                              styles.pageNumPill,
                              isSelected && styles.pageNumPillActive,
                            ]}
                            onPress={() => setCurrentPage(pageNum)}
                            testID={`cases-pagination-page-${pageNum}`}
                          >
                            <Text
                              style={[
                                styles.pageNumText,
                                isSelected && styles.pageNumTextActive,
                              ]}
                            >
                              {pageNum}
                            </Text>
                          </TouchableOpacity>
                        </React.Fragment>
                      );
                    })}

                  {/* Next Button */}
                  <TouchableOpacity
                    style={[
                      styles.pageNavBtn,
                      currentPageSafe >= totalPages && styles.pageNavBtnDisabled,
                    ]}
                    onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPageSafe >= totalPages}
                    testID="cases-pagination-next"
                  >
                    <Text
                      style={[
                        styles.pageNavBtnText,
                        currentPageSafe >= totalPages && styles.pageNavBtnTextDisabled,
                      ]}
                    >
                      Next
                    </Text>
                    <AppIcon
                      name="chevron-right"
                      size={14}
                      color={currentPageSafe >= totalPages ? '#CBD5E1' : '#1E293B'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      {/* Advanced Filter Modal */}
      <CaseFilterModal
        testID="case-filter-modal"
        visible={isFilterModalVisible}
        onClose={() => setIsFilterModalVisible(false)}
        filters={advancedFilters}
        onApplyFilters={newFilters => {
          setAdvancedFilters(newFilters);
          setCurrentPage(1);
        }}
        onClearAll={() => {
          setAdvancedFilters(DEFAULT_FILTERS);
          setCurrentPage(1);
        }}
      />

      {/* Edit Case Modal */}
      <EditCaseModal
        testID="edit-case-modal"
        visible={isEditModalVisible}
        onClose={() => {
          setIsEditModalVisible(false);
          setCaseToEdit(null);
        }}
        caseItem={caseToEdit}
        onSuccess={() => {
          refetch();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        visible={isDeleteConfirmVisible}
        title="Remove Case from Active Docket?"
        message={`Are you sure you want to remove ${
          caseToDelete
            ? formatCaseNumber(
                caseToDelete.case_type,
                caseToDelete.case_number,
                caseToDelete.filing_year
              )
            : 'this case'
        } from your active practice docket? Underlying registry records remain secure.`}
        confirmLabel="Remove Case"
        cancelLabel="Cancel"
        destructive
        loading={deleteCaseMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!deleteCaseMutation.isPending) {
            setIsDeleteConfirmVisible(false);
            setCaseToDelete(null);
          }
        }}
        testID="delete-case-dialog"
      />

      {/* Certified Judgment Details Modal */}
      <JudgmentDetailsModal
        visible={isJudgmentModalVisible}
        onClose={handleCloseJudgment}
        caseItem={selectedCaseForJudgment}
      />

      {/* Voice Search Modal */}
      <VoiceInputModal
        visible={isVoiceModalVisible}
        onClose={() => setIsVoiceModalVisible(false)}
        onApply={recognizedText => {
          setSearchQuery(recognizedText);
          setCurrentPage(1);
        }}
        title={t('voice.searchTitle', 'Voice Case Search')}
      />

      {/* Document Import Modal */}
      <DocumentImportModal
        testID="document-import-modal"
        visible={isImportModalVisible}
        onClose={() => setIsImportModalVisible(false)}
        cases={cases}
        onImportSuccess={() => {
          refetch();
          showToast(t('import.successToast', 'Case import completed'), 'success');
        }}
      />

      {/* Filter Dropdown Popover Menu */}
      <FilterDropdownMenu
        visible={isFilterDropdownOpen}
        onClose={() => setIsFilterDropdownOpen(false)}
        activeFilter={quickFilter}
        onSelectFilter={f => {
          setQuickFilter(f);
          setCurrentPage(1);
        }}
        onOpenAdvanced={() => setIsFilterModalVisible(true)}
        onResetAll={handleClearAllFilters}
        anchorPosition={filterMenuCoords}
      />

      {/* Sort Dropdown Popover Menu */}
      <SortDropdownMenu
        visible={isSortDropdownOpen}
        onClose={() => setIsSortDropdownOpen(false)}
        sortBy={sortBy}
        sortAsc={sortAsc}
        onSelectSort={(field, asc) => {
          setSortBy(field);
          if (typeof asc === 'boolean') {
            setSortAsc(asc);
          }
          setCurrentPage(1);
        }}
        anchorPosition={sortMenuCoords}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  desktopContainer: {
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.xl,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  caseCountText: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  toolbarContainer: {
    gap: 8,
    marginBottom: Spacing.xs,
  },
  toolbarDesktop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchContainerDesktop: {
    flex: 1,
    maxWidth: 520,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.input,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.text.primary,
    height: '100%',
  },
  searchClearBtn: {
    padding: 4,
  },
  voiceSearchButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.button,
    backgroundColor: Colors.surfaceSubtle,
    borderColor: Colors.border,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  controlsRowDesktop: {
    gap: 8,
  },
  controlBtnWrapper: {
    flexShrink: 1,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    gap: 4,
  },
  dropdownBtn: {
    backgroundColor: '#F8FAFC',
  },
  toolbarBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  toolbarBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  toolbarBtnTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1D4ED8',
  },
  importBtn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  importBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  exportBtn: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  exportBtnText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  exportBtnTextDisabled: {
    color: '#94A3B8',
  },
  activeChipsBar: {
    paddingVertical: 4,
    marginBottom: 4,
  },
  activeChipsInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeChipsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  activeChipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  activeChipText: {
    fontSize: 11,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  clearAllLink: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  clearAllLinkText: {
    fontSize: 11,
    color: Colors.danger,
    fontWeight: '600',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: Spacing.md,
    color: Colors.text.muted,
    fontSize: 13,
  },
  listContent: {
    paddingBottom: Spacing.xl,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexWrap: 'wrap',
    gap: 8,
  },
  paginationSummary: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  paginationNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  pageNavBtnDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  pageNavBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  pageNavBtnTextDisabled: {
    color: '#94A3B8',
  },
  pageNumPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  pageNumPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pageNumText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  pageNumTextActive: {
    color: '#FFFFFF',
  },
  pageEllipsis: {
    fontSize: 12,
    color: '#94A3B8',
    paddingHorizontal: 2,
  },
});
