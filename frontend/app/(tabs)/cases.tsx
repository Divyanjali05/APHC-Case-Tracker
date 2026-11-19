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
import { SortDropdownMenu } from '../../components/cases/SortDropdownMenu';
import { exportCasesToCsvFile } from '../../utils/csvExport';
import { OfflineBanner } from '../../components/offline/OfflineBanner';
import { Colors } from '../../constants/colors';
import { Radius, Spacing } from '../../constants/theme';
import { useCases, useDeleteCase } from '../../features/cases/hooks';
import { useAuth } from '../../features/auth/AuthContext';
import { CaseItem } from '../../types';
import { formatCaseNumber } from '../../utils/formatters';
import {
  SortType,
  extractCaseFilterOptions,
  filterAndSortCases,
  getSortButtonLabel,
  buildActiveFilterChips,
} from '../../utils/caseFiltering';

export type { SortType };

export type QuickFilterType =
  | 'ALL'
  | 'UPCOMING'
  | 'PENDING'
  | 'ADJOURNED'
  | 'DISPOSED'
  | 'WITH_JUDGMENT'
  | 'WITHOUT_JUDGMENT';

const PAGE_SIZE = 10;

const mapRouteFilterParam = (rawFilter?: string): Partial<CaseFilters> | null => {
  if (!rawFilter) return null;
  const upper = rawFilter.trim().toUpperCase();
  if (
    upper === 'UPCOMING' ||
    upper === 'PENDING' ||
    upper === 'ADJOURNED' ||
    upper === 'DISPOSED'
  ) {
    return { status: upper };
  }
  if (upper === 'WITH_JUDGMENT') {
    return { judgment: 'AVAILABLE' };
  }
  if (upper === 'WITHOUT_JUDGMENT') {
    return { judgment: 'NOT_AVAILABLE' };
  }
  return null;
};

export default function CasesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string; filter?: string }>();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isDesktop = width >= 1024;
  const { showToast } = useToast();
  const { isAuthenticated, isDemo } = useAuth();

  // Search state + debounced backend query
  const [searchQuery, setSearchQuery] = useState(params.search || '');
  const [debouncedSearch, setDebouncedSearch] = useState((params.search || '').trim());

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setDebouncedSearch('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(trimmed);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
    data: cases,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useCases({
    enabled: Boolean(isAuthenticated || isDemo),
    search: debouncedSearch,
  });

  const deleteCaseMutation = useDeleteCase();

  // Unified Filter Panel state
  const [advancedFilters, setAdvancedFilters] = useState<CaseFilters>(() => {
    const mapped = mapRouteFilterParam(params.filter);
    return mapped ? { ...DEFAULT_FILTERS, ...mapped } : DEFAULT_FILTERS;
  });
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);

  // Sorting state
  const [sortBy, setSortBy] = useState<SortType>('RECENTLY_UPDATED');
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

  // Sort Menu State & Anchor Position (desktop popover / mobile bottom sheet)
  const sortBtnRef = React.useRef<View>(null);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [sortMenuCoords, setSortMenuCoords] = useState<
    { x: number; y: number } | undefined
  >(undefined);

  const handleOpenFilterPanel = () => {
    setIsSortDropdownOpen(false);
    setIsFilterModalVisible(true);
  };

  const handleOpenSortMenu = () => {
    setIsFilterModalVisible(false);
    setIsSortDropdownOpen(true);
    if (
      !isMobile &&
      sortBtnRef.current &&
      typeof (sortBtnRef.current as unknown as { measureInWindow?: unknown })
        .measureInWindow === 'function'
    ) {
      try {
        (
          sortBtnRef.current as unknown as {
            measureInWindow: (
              cb: (x: number, y: number, w: number, h: number) => void
            ) => void;
          }
        ).measureInWindow((x, y, _w, h) => {
          if (typeof y === 'number' && typeof h === 'number') {
            setSortMenuCoords({ x, y: y + h + 4 });
          }
        });
      } catch {
        // fallback when measureInWindow is unavailable
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
    const mapped = mapRouteFilterParam(params.filter);
    if (mapped) {
      setAdvancedFilters(prev => ({ ...prev, ...mapped }));
      setCurrentPage(1);
    }
  }, [params.filter]);

  // Dynamically derive drawer options from loaded cases + backend choices
  const { availableCaseTypes, availableCourts, availableYears } = useMemo(
    () => extractCaseFilterOptions(cases),
    [cases]
  );

  const activeFilterCount = countActiveFilters(advancedFilters);

  const sortButtonLabel = getSortButtonLabel(sortBy, sortAsc);

  // Combined Search, Multi-Filter, and Multi-Sort Pipeline
  const filteredAndSortedCases = useMemo(
    () => filterAndSortCases(cases, searchQuery, advancedFilters, sortBy, sortAsc),
    [cases, searchQuery, advancedFilters, sortBy, sortAsc]
  );

  const handleExportCsv = async () => {
    if (isExportingCsv) return;
    try {
      setIsExportingCsv(true);

      if (!filteredAndSortedCases || filteredAndSortedCases.length === 0) {
        const hasAnyCases = Array.isArray(cases) && cases.length > 0;
        const emptyMessage = hasAnyCases
          ? t('export.emptyRecords', 'No cases match your current filters to export.')
          : t(
              'export.noCasesInDocket',
              'No cases in your docket yet. Import cases first to export CSV.'
            );
        showToast(emptyMessage, 'warning');
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

  // Pagination calculation (preserves applied filters, search, and sort)
  const totalCases = filteredAndSortedCases.length;
  const totalPages = Math.max(1, Math.ceil(totalCases / PAGE_SIZE));
  const currentPageSafe = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedCases = useMemo(() => {
    const startIdx = (currentPageSafe - 1) * PAGE_SIZE;
    return filteredAndSortedCases.slice(startIdx, startIdx + PAGE_SIZE);
  }, [filteredAndSortedCases, currentPageSafe]);

  // Active filter chip removable descriptors (rendered ONLY when filters are applied)
  const activeChips = useMemo(
    () =>
      buildActiveFilterChips(advancedFilters, updater => {
        setAdvancedFilters(updater);
        setCurrentPage(1);
      }),
    [advancedFilters]
  );

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
    if (['PENDING', 'UPCOMING', 'DISPOSED', 'ADJOURNED'].includes(s)) {
      setAdvancedFilters(p => ({ ...p, status: s as CaseFilters['status'] }));
      setCurrentPage(1);
    }
  };

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setAdvancedFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
  };

  const renderFilterButton = (fullWidth: boolean) => {
    const isActive = activeFilterCount > 0;
    return (
      <TouchableOpacity
        style={[
          styles.toolbarBtn,
          styles.secondaryToolbarBtn,
          fullWidth && styles.mobileGridBtn,
          isActive && styles.toolbarBtnActive,
        ]}
        onPress={handleOpenFilterPanel}
        activeOpacity={0.75}
        testID="cases-filter-dropdown-btn"
        accessibilityRole="button"
        accessibilityLabel={
          isActive ? `Filter cases, ${activeFilterCount} active` : 'Filter cases'
        }
      >
        <AppIcon
          name="filter"
          size={15}
          color={isActive ? Colors.primary : Colors.text.secondary}
        />
        <Text
          style={[styles.toolbarBtnText, isActive && styles.toolbarBtnTextActive]}
          numberOfLines={1}
        >
          {t('cases.filterButton', 'Filter')}
        </Text>
        {isActive && (
          <View style={styles.filterCountPill} testID="filter-active-count-pill">
            <Text style={styles.filterCountPillText}>{activeFilterCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderSortButton = (fullWidth: boolean) => (
    <View
      ref={sortBtnRef}
      collapsable={false}
      style={fullWidth ? styles.mobileGridCell : styles.desktopBtnWrap}
    >
      <TouchableOpacity
        style={[
          styles.toolbarBtn,
          styles.secondaryToolbarBtn,
          fullWidth && styles.mobileGridBtn,
        ]}
        onPress={handleOpenSortMenu}
        activeOpacity={0.75}
        testID="cases-sort-dropdown-btn"
        accessibilityRole="button"
        accessibilityLabel={`Sort cases: ${sortButtonLabel}`}
      >
        <AppIcon name="sliders" size={15} color={Colors.text.secondary} />
        <Text style={styles.toolbarBtnText} numberOfLines={1}>
          {sortButtonLabel}
        </Text>
        <AppIcon name="chevron-down" size={14} color={Colors.text.muted} />
      </TouchableOpacity>
    </View>
  );

  const renderImportButton = (fullWidth: boolean) => (
    <TouchableOpacity
      style={[styles.toolbarBtn, styles.importBtn, fullWidth && styles.mobileGridBtn]}
      onPress={() => setIsImportModalVisible(true)}
      activeOpacity={0.8}
      testID="import-cases-button"
      accessibilityRole="button"
      accessibilityLabel={t('import.importFiles', 'Import')}
    >
      <AppIcon name="upload" size={15} color={Colors.text.white} />
      <Text style={styles.importBtnText} numberOfLines={1}>
        {isDesktop
          ? t('import.importFiles', 'Import Files')
          : t('import.importShort', 'Import')}
      </Text>
    </TouchableOpacity>
  );

  const renderExportButton = (fullWidth: boolean) => (
    <TouchableOpacity
      style={[
        styles.toolbarBtn,
        styles.exportBtn,
        fullWidth && styles.mobileGridBtn,
        isExportingCsv && styles.toolbarBtnDisabled,
      ]}
      onPress={handleExportCsv}
      disabled={isExportingCsv}
      activeOpacity={0.75}
      testID="export-cases-csv-button"
      accessibilityRole="button"
      accessibilityLabel={t('export.exportCsv', 'Export CSV')}
    >
      <AppIcon
        name="download"
        size={15}
        color={isExportingCsv ? Colors.text.muted : Colors.primary}
      />
      <Text
        style={[styles.exportBtnText, isExportingCsv && styles.exportBtnTextDisabled]}
        numberOfLines={1}
      >
        {isExportingCsv
          ? '...'
          : isDesktop
            ? t('export.exportCsv', 'Export CSV')
            : t('export.exportShort', 'Export')}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScreenContainer testID="cases-screen">
      <OfflineBanner onSyncComplete={refetch} />
      <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
        {/* Header Title Row */}
        <View style={styles.headerTitleRow}>
          <Text style={styles.caseCountText}>{t('cases.myCases', 'My Cases')}</Text>
          <Badge label={String(totalCases)} variant="primary" />
        </View>

        {/* Responsive Toolbar */}
        <View style={[styles.toolbarContainer, isDesktop && styles.toolbarDesktop]}>
          {/* Row 1: Full-width Search Input with Search Icon, Clear Action & Voice Search */}
          <View
            style={[styles.searchContainer, isDesktop && styles.searchContainerDesktop]}
          >
            <View style={styles.searchInputWrap}>
              <AppIcon name="search" size={16} color={Colors.text.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by case number, petitioner, respondent"
                placeholderTextColor={Colors.text.muted}
                value={searchQuery}
                onChangeText={txt => {
                  setSearchQuery(txt);
                  setCurrentPage(1);
                }}
                clearButtonMode="never"
                returnKeyType="search"
                testID="cases-search-input"
              />
              {Boolean(searchQuery) && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery('');
                    setDebouncedSearch('');
                    setCurrentPage(1);
                  }}
                  style={styles.searchClearBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  testID="cases-search-clear-button"
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <AppIcon name="x" size={15} color={Colors.text.muted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.voiceSearchButton}
              onPress={() => setIsVoiceModalVisible(true)}
              testID="cases-voice-mic-button"
              accessibilityRole="button"
              accessibilityLabel={t('voice.openVoiceSearch', 'Voice search')}
            >
              <AppIcon name="mic" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Mobile: Clean 2-Column Grid (Row 2: Filter & Sort | Row 3: Import & Export) */}
          {isMobile ? (
            <View style={styles.mobileControlsGrid} testID="cases-mobile-toolbar-grid">
              <View style={styles.mobileGridRow}>
                <View style={styles.mobileGridCell}>{renderFilterButton(true)}</View>
                {renderSortButton(true)}
              </View>
              <View style={styles.mobileGridRow}>
                <View style={styles.mobileGridCell}>{renderImportButton(true)}</View>
                <View style={styles.mobileGridCell}>{renderExportButton(true)}</View>
              </View>
            </View>
          ) : (
            /* Tablet & Desktop: Preserved Single-Row Controls */
            <View
              style={[styles.controlsRowDesktop, !isDesktop && styles.controlsRowTablet]}
            >
              <View style={!isDesktop ? styles.mobileGridCell : styles.desktopBtnWrap}>
                {renderFilterButton(!isDesktop)}
              </View>
              {renderSortButton(!isDesktop)}
              <View style={!isDesktop ? styles.mobileGridCell : styles.desktopBtnWrap}>
                {renderImportButton(!isDesktop)}
              </View>
              <View style={!isDesktop ? styles.mobileGridCell : styles.desktopBtnWrap}>
                {renderExportButton(!isDesktop)}
              </View>
            </View>
          )}
        </View>

        {/* Active Removable Filters Chips Bar (shown only when filters are applied) */}
        {activeChips.length > 0 && (
          <View style={styles.activeChipsBar} testID="active-filter-chips-row">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.activeChipsInner}>
                <Text style={styles.activeChipsLabel}>Filters:</Text>
                {activeChips.map(chip => (
                  <TouchableOpacity
                    key={chip.key}
                    style={styles.activeChipPill}
                    onPress={chip.onRemove}
                    testID={`active-chip-${chip.key}`}
                  >
                    <Text style={styles.activeChipText}>{chip.label}</Text>
                    <AppIcon name="x" size={12} color={Colors.primary} />
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
            title={
              searchQuery.trim() || activeChips.length > 0
                ? 'No Matching Cases Found'
                : t('cases.empty', 'No Cases Found')
            }
            description={
              searchQuery.trim() || activeChips.length > 0
                ? 'No matters match your search query or applied filters. Adjust or clear your filters to view all cases.'
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
                      color={
                        currentPageSafe <= 1 ? Colors.borderStrong : Colors.text.primary
                      }
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
                      color={
                        currentPageSafe >= totalPages
                          ? Colors.borderStrong
                          : Colors.text.primary
                      }
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      {/* Filter Bottom Sheet (Mobile) / Modal (Desktop) */}
      <CaseFilterModal
        testID="case-filter-modal"
        visible={isFilterModalVisible}
        onClose={() => setIsFilterModalVisible(false)}
        filters={advancedFilters}
        availableCaseTypes={availableCaseTypes}
        availableCourts={availableCourts}
        availableYears={availableYears}
        onApplyFilters={newFilters => {
          setAdvancedFilters(newFilters);
          setCurrentPage(1);
        }}
        onClearAll={() => {
          setAdvancedFilters(DEFAULT_FILTERS);
          setCurrentPage(1);
        }}
      />

      {/* Sort Bottom Sheet (Mobile) / Popover (Desktop) */}
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    paddingTop: Spacing.xs,
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
    gap: 10,
    marginBottom: Spacing.sm,
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
    width: '100%',
  },
  searchContainerDesktop: {
    flex: 1,
    maxWidth: 500,
    width: undefined,
  },
  searchInputWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.borderStrong,
    borderWidth: 1,
    borderRadius: Radius.input,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: Colors.text.primary,
    height: '100%',
  },
  searchClearBtn: {
    padding: 4,
  },
  voiceSearchButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.input,
    backgroundColor: Colors.surface,
    borderColor: Colors.borderStrong,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileControlsGrid: {
    gap: 10,
    width: '100%',
  },
  mobileGridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  mobileGridCell: {
    flex: 1,
    minWidth: 0,
  },
  mobileGridBtn: {
    width: '100%',
    height: 44,
    paddingHorizontal: 10,
  },
  controlsRowDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlsRowTablet: {
    width: '100%',
    gap: 10,
  },
  desktopBtnWrap: {
    flexShrink: 0,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    paddingHorizontal: 12,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    gap: 6,
  },
  secondaryToolbarBtn: {
    backgroundColor: Colors.surface,
  },
  toolbarBtnActive: {
    backgroundColor: Colors.surfaceBlue,
    borderColor: Colors.primary,
  },
  toolbarBtnDisabled: {
    opacity: 0.6,
  },
  toolbarBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    flexShrink: 1,
  },
  toolbarBtnTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  filterCountPill: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterCountPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.white,
  },
  importBtn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  importBtnText: {
    color: Colors.text.white,
    fontSize: 13,
    fontWeight: '600',
  },
  exportBtn: {
    backgroundColor: Colors.surface,
    borderColor: Colors.primary,
  },
  exportBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  exportBtnTextDisabled: {
    color: Colors.text.muted,
  },
  activeChipsBar: {
    paddingVertical: 4,
    marginBottom: 6,
  },
  activeChipsInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeChipsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.muted,
    textTransform: 'uppercase',
  },
  activeChipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceBlue,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  activeChipText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  clearAllLink: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  clearAllLinkText: {
    fontSize: 12,
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
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    flexWrap: 'wrap',
    gap: 8,
  },
  paginationSummary: {
    fontSize: 12,
    color: Colors.text.muted,
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
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
  },
  pageNavBtnDisabled: {
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  pageNavBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  pageNavBtnTextDisabled: {
    color: Colors.text.muted,
  },
  pageNumPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
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
    color: Colors.text.secondary,
  },
  pageNumTextActive: {
    color: Colors.text.white,
  },
  pageEllipsis: {
    fontSize: 12,
    color: Colors.text.muted,
    paddingHorizontal: 2,
  },
});
