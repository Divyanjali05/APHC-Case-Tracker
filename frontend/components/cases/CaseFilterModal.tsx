import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '../common/AppIcon';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';

export interface CaseFilters {
  status: 'ALL' | 'PENDING' | 'DISPOSED' | 'ADJOURNED';
  hearing:
    | 'ALL'
    | 'UPCOMING'
    | 'TODAY'
    | 'THIS_WEEK'
    | 'THIS_MONTH'
    | 'PAST'
    | 'NOT_SCHEDULED';
  judgment: 'ALL' | 'AVAILABLE' | 'PENDING' | 'NOT_AVAILABLE';
  filingDateFrom?: string;
  filingDateTo?: string;
  hearingDateFrom?: string;
  hearingDateTo?: string;
  closedDateFrom?: string;
  closedDateTo?: string;
  court?: string;
  courtHallNumber?: string;
  caseType?: string;
  caseYear?: string;
}

export const DEFAULT_FILTERS: CaseFilters = {
  status: 'ALL',
  hearing: 'ALL',
  judgment: 'ALL',
  filingDateFrom: '',
  filingDateTo: '',
  hearingDateFrom: '',
  hearingDateTo: '',
  closedDateFrom: '',
  closedDateTo: '',
  court: '',
  courtHallNumber: '',
  caseType: '',
  caseYear: '',
};

export interface CaseFilterModalProps {
  visible: boolean;
  onClose: () => void;
  filters: CaseFilters;
  onApplyFilters: (newFilters: CaseFilters) => void;
  onClearAll: () => void;
  availableCaseTypes?: string[];
  availableYears?: string[];
  testID?: string;
}

export const countActiveFilters = (filters: CaseFilters): number => {
  let count = 0;
  if (filters.status !== 'ALL') count++;
  if (filters.hearing !== 'ALL') count++;
  if (filters.judgment !== 'ALL') count++;
  if (filters.filingDateFrom || filters.filingDateTo) count++;
  if (filters.hearingDateFrom || filters.hearingDateTo) count++;
  if (filters.closedDateFrom || filters.closedDateTo) count++;
  if (filters.court?.trim()) count++;
  if (filters.courtHallNumber?.trim()) count++;
  if (filters.caseType?.trim()) count++;
  if (filters.caseYear?.trim()) count++;
  return count;
};

export const CaseFilterModal: React.FC<CaseFilterModalProps> = ({
  visible,
  onClose,
  filters,
  onApplyFilters,
  onClearAll,
  availableCaseTypes = ['WP', 'WA', 'CRLP', 'CC', 'CMA', 'MACMA', 'EP'],
  availableYears = ['2026', '2025', '2024', '2023', '2022', '2021', '2020'],
  testID = 'case-filter-modal',
}) => {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [draftFilters, setDraftFilters] = useState<CaseFilters>(filters);

  useEffect(() => {
    setDraftFilters(filters);
  }, [filters, visible]);

  const activeCount = countActiveFilters(draftFilters);

  const handleApply = () => {
    onApplyFilters(draftFilters);
    onClose();
  };

  const handleReset = () => {
    setDraftFilters(DEFAULT_FILTERS);
    onClearAll();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.modalContainer,
            isDesktop && styles.modalContainerDesktop,
            { maxHeight: Math.min(height * 0.92, 740) },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.filterIconCircle}>
                <AppIcon name="filter" size={16} color={Colors.primary} />
              </View>
              <Text style={styles.headerTitle}>
                {t('cases.filtersTitle', 'Filter Cases')}
              </Text>
              {activeCount > 0 && (
                <Badge
                  label={`${activeCount} active`}
                  variant="gold"
                  style={styles.activeBadge}
                  testID="filter-active-count-badge"
                />
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close filter panel"
              testID="filter-close-btn"
            >
              <AppIcon name="x" size={18} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Scrollable Filter Sections */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 1. Case Status */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {t('cases.filterSectionStatus', 'Case Status')}
              </Text>
              <View style={styles.pillRow}>
                {(['ALL', 'PENDING', 'DISPOSED', 'ADJOURNED'] as const).map(st => {
                  const isSelected = draftFilters.status === st;
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[styles.filterPill, isSelected && styles.filterPillActive]}
                      onPress={() => setDraftFilters(prev => ({ ...prev, status: st }))}
                      testID={`filter-status-${st.toLowerCase()}`}
                    >
                      <Text
                        style={[
                          styles.filterPillText,
                          isSelected && styles.filterPillTextActive,
                        ]}
                      >
                        {st === 'ALL'
                          ? 'All Statuses'
                          : st.charAt(0) + st.slice(1).toLowerCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 2. Hearing Timeframe */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {t('cases.filterSectionHearing', 'Hearing Schedule')}
              </Text>
              <View style={styles.pillRow}>
                {[
                  { key: 'ALL', label: 'Any Schedule' },
                  { key: 'UPCOMING', label: 'Upcoming Hearings' },
                  { key: 'TODAY', label: 'Hearing Today' },
                  { key: 'THIS_WEEK', label: 'Hearing This Week' },
                  { key: 'THIS_MONTH', label: 'Hearing This Month' },
                  { key: 'PAST', label: 'Past Hearings' },
                  { key: 'NOT_SCHEDULED', label: 'No Hearing Scheduled' },
                ].map(opt => {
                  const isSelected = draftFilters.hearing === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.filterPill, isSelected && styles.filterPillActive]}
                      onPress={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          hearing: opt.key as CaseFilters['hearing'],
                        }))
                      }
                      testID={`filter-hearing-${opt.key.toLowerCase().replace('_', '-')}`}
                    >
                      <Text
                        style={[
                          styles.filterPillText,
                          isSelected && styles.filterPillTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 3. Judgment Status */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {t('cases.filterSectionJudgment', 'Certified Judgment')}
              </Text>
              <View style={styles.pillRow}>
                {[
                  { key: 'ALL', label: 'All Cases' },
                  { key: 'AVAILABLE', label: 'Judgment Available' },
                  { key: 'PENDING', label: 'Judgment Pending' },
                  { key: 'NOT_AVAILABLE', label: 'Judgment Not Available' },
                ].map(opt => {
                  const isSelected = draftFilters.judgment === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.filterPill, isSelected && styles.filterPillActive]}
                      onPress={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          judgment: opt.key as CaseFilters['judgment'],
                        }))
                      }
                      testID={`filter-judgment-${opt.key
                        .toLowerCase()
                        .replace('_', '-')}`}
                    >
                      <Text
                        style={[
                          styles.filterPillText,
                          isSelected && styles.filterPillTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 4. Date Ranges */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {t('cases.filterSectionDateRanges', 'Date Ranges (YYYY-MM-DD)')}
              </Text>

              {/* Case Started / Filing Range */}
              <Text style={styles.subLabel}>Filing / Started Date Range</Text>
              <View style={styles.dateRow}>
                <TextInput
                  style={styles.dateInput}
                  placeholder="From (YYYY-MM-DD)"
                  placeholderTextColor={Colors.text.muted}
                  value={draftFilters.filingDateFrom || ''}
                  onChangeText={txt =>
                    setDraftFilters(prev => ({ ...prev, filingDateFrom: txt.trim() }))
                  }
                  testID="filter-filing-date-from"
                />
                <Text style={styles.dateRangeSeparator}>to</Text>
                <TextInput
                  style={styles.dateInput}
                  placeholder="To (YYYY-MM-DD)"
                  placeholderTextColor={Colors.text.muted}
                  value={draftFilters.filingDateTo || ''}
                  onChangeText={txt =>
                    setDraftFilters(prev => ({ ...prev, filingDateTo: txt.trim() }))
                  }
                  testID="filter-filing-date-to"
                />
              </View>

              {/* Next Hearing Range */}
              <Text style={[styles.subLabel, { marginTop: 10 }]}>
                Next Hearing Date Range
              </Text>
              <View style={styles.dateRow}>
                <TextInput
                  style={styles.dateInput}
                  placeholder="From (YYYY-MM-DD)"
                  placeholderTextColor={Colors.text.muted}
                  value={draftFilters.hearingDateFrom || ''}
                  onChangeText={txt =>
                    setDraftFilters(prev => ({ ...prev, hearingDateFrom: txt.trim() }))
                  }
                  testID="filter-hearing-date-from"
                />
                <Text style={styles.dateRangeSeparator}>to</Text>
                <TextInput
                  style={styles.dateInput}
                  placeholder="To (YYYY-MM-DD)"
                  placeholderTextColor={Colors.text.muted}
                  value={draftFilters.hearingDateTo || ''}
                  onChangeText={txt =>
                    setDraftFilters(prev => ({ ...prev, hearingDateTo: txt.trim() }))
                  }
                  testID="filter-hearing-date-to"
                />
              </View>

              {/* Closed / Disposal Range */}
              <Text style={[styles.subLabel, { marginTop: 10 }]}>
                Closed / Disposal Date Range
              </Text>
              <View style={styles.dateRow}>
                <TextInput
                  style={styles.dateInput}
                  placeholder="From (YYYY-MM-DD)"
                  placeholderTextColor={Colors.text.muted}
                  value={draftFilters.closedDateFrom || ''}
                  onChangeText={txt =>
                    setDraftFilters(prev => ({ ...prev, closedDateFrom: txt.trim() }))
                  }
                  testID="filter-closed-date-from"
                />
                <Text style={styles.dateRangeSeparator}>to</Text>
                <TextInput
                  style={styles.dateInput}
                  placeholder="To (YYYY-MM-DD)"
                  placeholderTextColor={Colors.text.muted}
                  value={draftFilters.closedDateTo || ''}
                  onChangeText={txt =>
                    setDraftFilters(prev => ({ ...prev, closedDateTo: txt.trim() }))
                  }
                  testID="filter-closed-date-to"
                />
              </View>
            </View>

            {/* 5. Court Hall & Court */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {t('cases.filterSectionCourt', 'Courtroom & Bench')}
              </Text>
              <View style={styles.inputGrid}>
                <View style={styles.gridHalf}>
                  <Text style={styles.subLabel}>Court Hall No.</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 4, 12"
                    placeholderTextColor={Colors.text.muted}
                    value={draftFilters.courtHallNumber || ''}
                    onChangeText={txt =>
                      setDraftFilters(prev => ({ ...prev, courtHallNumber: txt.trim() }))
                    }
                    testID="filter-court-hall-input"
                  />
                </View>
                <View style={styles.gridHalf}>
                  <Text style={styles.subLabel}>Court / Registry</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. High Court"
                    placeholderTextColor={Colors.text.muted}
                    value={draftFilters.court || ''}
                    onChangeText={txt =>
                      setDraftFilters(prev => ({ ...prev, court: txt }))
                    }
                    testID="filter-court-name-input"
                  />
                </View>
              </View>
            </View>

            {/* 6. Case Type & Year */}
            <View style={[styles.section, { borderBottomWidth: 0 }]}>
              <Text style={styles.sectionLabel}>
                {t('cases.filterSectionClassification', 'Case Type & Filing Year')}
              </Text>

              {/* Quick Case Type Chips */}
              <Text style={styles.subLabel}>Case Type</Text>
              <View style={styles.pillRow}>
                {availableCaseTypes.map(ct => {
                  const isSelected = draftFilters.caseType === ct;
                  return (
                    <TouchableOpacity
                      key={ct}
                      style={[styles.filterPill, isSelected && styles.filterPillActive]}
                      onPress={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          caseType: isSelected ? '' : ct,
                        }))
                      }
                      testID={`filter-type-${ct.toLowerCase()}`}
                    >
                      <Text
                        style={[
                          styles.filterPillText,
                          isSelected && styles.filterPillTextActive,
                        ]}
                      >
                        {ct}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Quick Year Chips */}
              <Text style={[styles.subLabel, { marginTop: 10 }]}>Filing Year</Text>
              <View style={styles.pillRow}>
                {availableYears.map(yr => {
                  const isSelected = draftFilters.caseYear === yr;
                  return (
                    <TouchableOpacity
                      key={yr}
                      style={[styles.filterPill, isSelected && styles.filterPillActive]}
                      onPress={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          caseYear: isSelected ? '' : yr,
                        }))
                      }
                      testID={`filter-year-${yr}`}
                    >
                      <Text
                        style={[
                          styles.filterPillText,
                          isSelected && styles.filterPillTextActive,
                        ]}
                      >
                        {yr}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={handleReset}
              testID="filter-clear-all-btn"
            >
              <AppIcon name="refresh" size={14} color="#64748B" />
              <Text style={styles.resetBtnText}>{t('common.clearAll', 'Clear All')}</Text>
            </TouchableOpacity>

            <Button
              title={`${t('common.applyFilters', 'Apply Filters')} ${
                activeCount > 0 ? `(${activeCount})` : ''
              }`}
              variant="primary"
              onPress={handleApply}
              style={styles.applyBtn}
              testID="filter-apply-btn"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 580,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.card,
  },
  modalContainerDesktop: {
    maxWidth: 620,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  activeBadge: {
    marginLeft: 4,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 6,
  },
  scrollArea: {
    flexGrow: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  section: {
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.badge,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: Colors.surfaceBlue,
    borderColor: Colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  filterPillTextActive: {
    fontWeight: '700',
    color: Colors.primary,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.button,
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  dateRangeSeparator: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  inputGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  gridHalf: {
    flex: 1,
  },
  textInput: {
    height: 38,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.button,
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.button,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  applyBtn: {
    minWidth: 140,
    height: 42,
  },
});
