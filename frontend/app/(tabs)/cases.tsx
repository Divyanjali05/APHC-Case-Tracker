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
  Alert,
  Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { CaseCard } from '../../components/cases/CaseCard';
import { JudgmentDetailsModal } from '../../components/cases/JudgmentDetailsModal';
import { VoiceInputModal } from '../../components/speech/VoiceInputModal';
import { LoadingIndicator } from '../../components/common/LoadingIndicator';
import { EmptyState } from '../../components/common/EmptyState';
import { OfflineBanner } from '../../components/offline/OfflineBanner';
import { Colors } from '../../constants/colors';
import { useCases } from '../../features/cases/hooks';
import { normalizeVoiceQuery } from '../../services/speech/voiceQueryNormalizer';
import { CaseItem } from '../../types';
import { API_BASE_URL } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { tokenStorage } from '../../services/auth/tokenStorage';

type FilterType = 'ALL' | 'UPCOMING' | 'ADJOURNED' | 'WITH_JUDGMENT' | 'WITHOUT_JUDGMENT';
type SortType = 'CASE_DATE' | 'NEXT_HEARING' | 'JUDGMENT_DATE' | 'CASE_NAME';

export default function CasesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string }>();
  const { data: cases, isLoading, isError, refetch, isRefetching } = useCases();

  const [searchQuery, setSearchQuery] = useState(params.search || '');
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [sortBy, setSortBy] = useState<SortType>('CASE_DATE');
  const [sortAsc, setSortAsc] = useState(false);

  // Sync route param if search parameter changes
  useEffect(() => {
    if (params.search !== undefined && params.search !== searchQuery) {
      setSearchQuery(params.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.search]);

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
      const exportUrl = `${API_BASE_URL}${ENDPOINTS.CASES.EXPORT_CSV}?token=${token || ''}`;
      const canOpen = await Linking.canOpenURL(exportUrl);
      if (canOpen) {
        await Linking.openURL(exportUrl);
      } else {
        Alert.alert(
          t('export.exportSuccess', 'Export Complete'),
          t('export.downloadedNotice', 'Cases CSV export available.')
        );
      }
    } catch {
      Alert.alert(t('common.error', 'Error'), t('export.exportFailed', 'Failed to generate CSV export.'));
    } finally {
      setIsExportingCsv(false);
    }
  };

  // Filter chips configuration
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

  // Sorting options
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

  // Filter and sort cases pipeline
  const processedCases = useMemo(() => {
    const rawList: CaseItem[] = Array.isArray(cases)
      ? cases
      : Array.isArray((cases as unknown as { results?: CaseItem[] })?.results)
        ? (cases as unknown as { results: CaseItem[] }).results
        : [];
    let result: CaseItem[] = rawList.slice();

    // 1. Text Search (with Multilingual / Indic numeral normalization)
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

    // 2. Status Filters
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

    // 3. Sorting
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
      {/* Header Action Bar with CSV Export */}
      <View style={styles.headerActionBar}>
        <Text style={styles.caseCountText}>
          {t('cases.title', 'My Tracked Cases')} ({processedCases.length})
        </Text>
        <TouchableOpacity
          style={styles.exportCsvBtn}
          onPress={handleExportCsv}
          disabled={isExportingCsv}
          testID="export-cases-csv-button"
        >
          <Text style={styles.exportCsvText}>
            {isExportingCsv ? '...' : `📥 ${t('export.exportCsv', 'Export CSV')}`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Input with Voice Search Button */}
      <View style={styles.searchContainer}>
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
        <TouchableOpacity
          style={styles.voiceSearchButton}
          onPress={() => setIsVoiceModalVisible(true)}
          testID="cases-voice-mic-button"
          accessibilityLabel={t('voice.openVoiceSearch', 'Voice search')}
          accessibilityRole="button"
        >
          <Text style={styles.voiceSearchButtonText}>🎤</Text>
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
            style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}
            onPress={() => setActiveFilter(f.key)}
            testID={`filter-chip-${f.key.toLowerCase()}`}
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
              >
                <Text
                  style={[styles.sortChipText, isSelected && styles.sortChipTextActive]}
                >
                  {t(s.labelKey, s.fallback)} {isSelected ? (sortAsc ? '↑' : '↓') : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Body States */}
      {isLoading ? (
        <LoadingIndicator message={t('common.loading', 'Loading...')} />
      ) : isError ? (
        <EmptyState
          title="Could Not Load Cases"
          description="Unable to connect to the APHC docket service. Please verify your connection."
          actionLabel={t('common.retry', 'Retry')}
          onAction={() => refetch()}
          testID="cases-error-state"
        />
      ) : processedCases.length === 0 ? (
        <EmptyState
          title={t('cases.empty', 'No cases found')}
          description="Search returned no matching cases, or no cases match the selected filter."
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
              tintColor={Colors.primaryLight}
              colors={[Colors.primary]}
            />
          }
          testID="cases-list"
        />
      )}

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
  headerActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  caseCountText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  exportCsvBtn: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  exportCsvText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text.primary,
    fontSize: 14,
  },
  voiceSearchButton: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceSearchButtonText: {
    fontSize: 16,
  },
  filterScroll: {
    maxHeight: 38,
    marginBottom: 8,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryLight,
  },
  filterChipText: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: Colors.text.primary,
    fontWeight: '700',
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sortLabel: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
    marginRight: 8,
  },
  sortChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    marginRight: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortChipActive: {
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
  },
  sortChipText: {
    color: Colors.text.muted,
    fontSize: 11,
  },
  sortChipTextActive: {
    color: Colors.gold,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 24,
  },
});
