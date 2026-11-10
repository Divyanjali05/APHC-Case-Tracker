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
import { CaseCard } from '../../components/cases/CaseCard';
import { JudgmentDetailsModal } from '../../components/cases/JudgmentDetailsModal';
import { VoiceInputModal } from '../../components/speech/VoiceInputModal';
import { OfflineBanner } from '../../components/offline/OfflineBanner';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { useCases } from '../../features/cases/hooks';
import { normalizeVoiceQuery } from '../../services/speech/voiceQueryNormalizer';
import { CaseItem } from '../../types';
import { API_BASE_URL } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { tokenStorage } from '../../services/auth/tokenStorage';

type FilterType = 'ALL' | 'UPCOMING' | 'ADJOURNED' | 'WITH_JUDGMENT' | 'WITHOUT_JUDGMENT';
type SortType = 'CASE_DATE' | 'NEXT_HEARING' | 'JUDGMENT_DATE' | 'CASE_NAME';

const VALID_FILTERS: FilterType[] = [
  'ALL',
  'UPCOMING',
  'ADJOURNED',
  'WITH_JUDGMENT',
  'WITHOUT_JUDGMENT',
];

export default function CasesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string; filter?: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const { showToast } = useToast();
  const { data: cases, isLoading, isError, refetch, isRefetching } = useCases();

  const initialFilter =
    params.filter && VALID_FILTERS.includes(params.filter as FilterType)
      ? (params.filter as FilterType)
      : 'ALL';

  const [searchQuery, setSearchQuery] = useState(params.search || '');
  const [activeFilter, setActiveFilter] = useState<FilterType>(initialFilter);
  const [sortBy, setSortBy] = useState<SortType>('CASE_DATE');
  const [sortAsc, setSortAsc] = useState(false);

  // Sync route param if search parameter changes
  useEffect(() => {
    if (params.search !== undefined && params.search !== searchQuery) {
      setSearchQuery(params.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.search]);

  // Sync route filter param when navigating from dashboard StatCards
  useEffect(() => {
    if (params.filter && VALID_FILTERS.includes(params.filter as FilterType)) {
      setActiveFilter(params.filter as FilterType);
    }
  }, [params.filter]);

  // Judgment Modal State
  const [selectedCaseForJudgment, setSelectedCaseForJudgment] = useState<CaseItem | null>(
    null
  );
  const [isJudgmentModalVisible, setIsJudgmentModalVisible] = useState(false);
  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const handleExportCsv = async () => {
    try {
      setIsExportingCsv(true);
      const token = await tokenStorage.getAccessToken();
      const exportUrl = `${API_BASE_URL}${ENDPOINTS.CASES.EXPORT_CSV}?token=${
        token || ''
      }`;
      const canOpen = await Linking.canOpenURL(exportUrl);
      if (canOpen) {
        await Linking.openURL(exportUrl);
      } else {
        showToast(t('export.downloadedNotice', 'Cases CSV export available.'), 'success');
      }
    } catch {
      showToast(t('export.exportFailed', 'Failed to generate CSV export.'), 'error');
    } finally {
      setIsExportingCsv(false);
    }
  };

  const filterOptions: { key: FilterType; labelKey: string; fallback: string }[] = [
    { key: 'ALL', labelKey: 'cases.filterAll', fallback: 'All' },
    { key: 'UPCOMING', labelKey: 'cases.filterUpcoming', fallback: 'Upcoming' },
    { key: 'ADJOURNED', labelKey: 'cases.filterAdjourned', fallback: 'Adjourned' },
    {
      key: 'WITH_JUDGMENT',
      labelKey: 'cases.filterWithJudgment',
      fallback: 'With Judgment',
    },
    {
      key: 'WITHOUT_JUDGMENT',
      labelKey: 'cases.filterWithoutJudgment',
      fallback: 'Pending Judgment',
    },
  ];

  const sortOptions: { key: SortType; labelKey: string; fallback: string }[] = [
    { key: 'CASE_DATE', labelKey: 'cases.sortCaseDate', fallback: 'Case Date' },
    { key: 'NEXT_HEARING', labelKey: 'cases.sortNextHearing', fallback: 'Next Hearing' },
    {
      key: 'JUDGMENT_DATE',
      labelKey: 'cases.sortJudgmentDate',
      fallback: 'Judgment Date',
    },
    { key: 'CASE_NAME', labelKey: 'cases.sortCaseName', fallback: 'Case Name' },
  ];

  const processedCases = useMemo(() => {
    const rawList: CaseItem[] = Array.isArray(cases)
      ? cases
      : Array.isArray((cases as unknown as { results?: CaseItem[] })?.results)
        ? (cases as unknown as { results: CaseItem[] }).results
        : [];
    let result: CaseItem[] = rawList.slice();

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const normResult = normalizeVoiceQuery(searchQuery);
      const normalizedQ = normResult.normalized.toLowerCase().trim();
      result = result.filter(item => {
        const fullCaseNumber =
          `${item.case_type} ${item.case_number}/${item.filing_year}`.toLowerCase();
        const parties = `${item.petitioner} ${item.respondent}`.toLowerCase();
        const advocate = `${item.petitioner_advocate || ''} ${
          item.respondent_advocate || ''
        }`.toLowerCase();
        return (
          fullCaseNumber.includes(q) ||
          fullCaseNumber.includes(normalizedQ) ||
          item.case_number.toLowerCase().includes(q) ||
          item.case_number.toLowerCase().includes(normalizedQ) ||
          parties.includes(q) ||
          parties.includes(normalizedQ) ||
          advocate.includes(q) ||
          advocate.includes(normalizedQ)
        );
      });
    }

    if (activeFilter === 'UPCOMING') {
      result = result.filter(item => {
        const status = (item.status || item.current_stage || '').toLowerCase();
        return status.includes('upcoming') || status.includes('listed');
      });
    } else if (activeFilter === 'ADJOURNED') {
      result = result.filter(item => {
        const status = (item.status || item.current_stage || '').toLowerCase();
        return status.includes('adjourn');
      });
    } else if (activeFilter === 'WITH_JUDGMENT') {
      result = result.filter(item => Boolean(item.judgment_date || item.latest_judgment));
    } else if (activeFilter === 'WITHOUT_JUDGMENT') {
      result = result.filter(item => !item.judgment_date && !item.latest_judgment);
    }

    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'CASE_DATE') {
        comparison = (a.filing_year || 0) - (b.filing_year || 0);
      } else if (sortBy === 'NEXT_HEARING') {
        const dateA = a.effective_next_hearing_date || a.next_hearing_date || '';
        const dateB = b.effective_next_hearing_date || b.next_hearing_date || '';
        comparison = dateA.localeCompare(dateB);
      } else if (sortBy === 'JUDGMENT_DATE') {
        const jDateA = a.judgment_date || a.latest_judgment?.judgment_date || '';
        const jDateB = b.judgment_date || b.latest_judgment?.judgment_date || '';
        comparison = jDateA.localeCompare(jDateB);
      } else if (sortBy === 'CASE_NAME') {
        const nameA = `${a.petitioner} vs ${a.respondent}`.toLowerCase();
        const nameB = `${b.petitioner} vs ${b.respondent}`.toLowerCase();
        comparison = nameA.localeCompare(nameB);
      }

      return sortAsc ? comparison : -comparison;
    });

    return result;
  }, [cases, searchQuery, activeFilter, sortBy, sortAsc]);

  const handleSelectCase = (id: number) => {
    router.push(`/cases/${id}`);
  };

  const handleOpenJudgment = (item: CaseItem) => {
    setSelectedCaseForJudgment(item);
    setIsJudgmentModalVisible(true);
  };

  const handleCloseJudgment = () => {
    setIsJudgmentModalVisible(false);
    setSelectedCaseForJudgment(null);
  };

  return (
    <ScreenContainer testID="cases-screen">
      <OfflineBanner onSyncComplete={refetch} />
      <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
        {/* Header Action Bar with CSV Export */}
        <View style={styles.headerActionBar}>
          <View style={styles.titleWithBadge}>
            <Text style={styles.caseCountText}>{t('cases.myCases', 'My Cases')}</Text>
            <Badge label={String(processedCases.length)} variant="primary" />
          </View>
          <TouchableOpacity
            style={styles.exportCsvBtn}
            onPress={handleExportCsv}
            disabled={isExportingCsv}
            testID="export-cases-csv-button"
            accessibilityRole="button"
            accessibilityLabel={t('export.exportCsv', 'Export CSV')}
          >
            <AppIcon name="download" size={14} color={Colors.primary} />
            <Text style={styles.exportCsvText}>
              {isExportingCsv ? '...' : t('export.exportCsv', 'Export CSV')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Input with Voice Search Button */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrap}>
            <AppIcon name="search" size={16} color={Colors.text.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder={t(
                'cases.searchPlaceholder',
                'Search by Case Type, Number or Party...'
              )}
              placeholderTextColor={Colors.text.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
              testID="cases-search-input"
            />
          </View>
          <TouchableOpacity
            style={styles.voiceSearchButton}
            onPress={() => setIsVoiceModalVisible(true)}
            testID="cases-voice-mic-button"
            accessibilityLabel={t('voice.openVoiceSearch', 'Voice search')}
            accessibilityRole="button"
          >
            <AppIcon name="mic" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Filter Chips Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
          testID="cases-filter-bar"
        >
          {filterOptions.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterChip,
                activeFilter === f.key && styles.filterChipActive,
              ]}
              onPress={() => setActiveFilter(f.key)}
              testID={`filter-chip-${f.key.toLowerCase()}`}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === f.key && styles.filterChipTextActive,
                ]}
              >
                {t(f.labelKey, f.fallback)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sorting Controls */}
        <View style={styles.sortBar} testID="cases-sort-bar">
          <Text style={styles.sortLabel}>{t('cases.sortBy', 'Sort By')}:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {sortOptions.map(s => {
              const isSelected = sortBy === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.sortChip, isSelected && styles.sortChipActive]}
                  onPress={() => {
                    if (isSelected) {
                      setSortAsc(!sortAsc);
                    } else {
                      setSortBy(s.key);
                      setSortAsc(false);
                    }
                  }}
                  testID={`sort-option-${s.key.toLowerCase()}`}
                  accessibilityRole="button"
                >
                  <View style={styles.sortChipInner}>
                    <Text
                      style={[
                        styles.sortChipText,
                        isSelected && styles.sortChipTextActive,
                      ]}
                    >
                      {t(s.labelKey, s.fallback)}
                    </Text>
                    {isSelected ? (
                      <AppIcon
                        name={sortAsc ? 'chevron-up' : 'chevron-down'}
                        size={13}
                        color={Colors.primary}
                      />
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Body States */}
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
        ) : processedCases.length === 0 ? (
          <EmptyState
            title={t('cases.empty', 'No Cases Found')}
            description={
              searchQuery.trim()
                ? `No matters match "${searchQuery}". Clear your search query or reset your filters.`
                : 'No cases match the selected filter criteria.'
            }
            actionLabel={searchQuery.trim() ? 'Clear Search' : 'Show All Cases'}
            onAction={() => {
              setSearchQuery('');
              setActiveFilter('ALL');
            }}
            iconName="briefcase"
            testID="cases-empty-state"
          />
        ) : (
          <FlatList
            data={processedCases}
            keyExtractor={item => item.id.toString()}
            renderItem={({ item }) => (
              <CaseCard
                item={item}
                onPress={handleSelectCase}
                onViewJudgment={handleOpenJudgment}
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
        )}
      </View>

      {/* Judgment Details Modal */}
      <JudgmentDetailsModal
        visible={isJudgmentModalVisible}
        onClose={handleCloseJudgment}
        caseItem={selectedCaseForJudgment}
      />

      {/* Voice Search Modal */}
      <VoiceInputModal
        visible={isVoiceModalVisible}
        onClose={() => setIsVoiceModalVisible(false)}
        onApply={recognizedText => setSearchQuery(recognizedText)}
        title={t('voice.searchTitle', 'Voice Case Search')}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    width: '100%',
  },
  desktopContainer: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  headerActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: 2,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  caseCountText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  exportCsvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.badge + 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 38,
    ...Shadows.subtle,
  },
  exportCsvText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
    ...Shadows.subtle,
  },
  searchInput: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 14,
    paddingVertical: 10,
  },
  voiceSearchButton: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.input,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
    minWidth: 48,
    ...Shadows.subtle,
  },
  filterScroll: {
    maxHeight: 44,
    marginBottom: 10,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: Colors.text.white,
    fontWeight: '700',
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  sortLabel: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceBlue,
  },
  sortChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortChipText: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
  sortChipTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  loadingText: {
    color: Colors.text.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  listContent: {
    paddingBottom: 24,
  },
});
