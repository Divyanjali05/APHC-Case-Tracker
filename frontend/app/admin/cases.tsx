import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { AppIcon } from '../../components/common/AppIcon';
import { SkeletonCard } from '../../components/common/SkeletonCard';
import { ErrorState } from '../../components/common/ErrorState';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import {
  useAdminCaseAssignments,
  useAdminCases,
  useAdminUsers,
  useAssignCase,
} from '../../features/admin/hooks';
import {
  AdminCaseAdvocateSummary,
  AdminCaseItem,
  AdminUserItem,
  CaseAssignmentHistoryItem,
} from '../../types';

const extractApiError = (err: unknown, fallback: string): string => {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: Record<string, unknown> } }).response
      ?.data;
    if (data && typeof data === 'object') {
      if (typeof data.detail === 'string') return data.detail;
      if (typeof data.error === 'string') return data.error;
      const firstKey = Object.keys(data)[0];
      if (firstKey) {
        const val = data[firstKey];
        if (Array.isArray(val) && val[0]) return String(val[0]);
        if (typeof val === 'string') return val;
      }
    }
  }
  return fallback;
};

type AssignmentFilter = 'all' | 'unassigned' | 'assigned';

export default function AdminCaseAssignmentScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ assignment?: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;

  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>(
    params.assignment === 'unassigned' || params.assignment === 'assigned'
      ? params.assignment
      : 'all'
  );

  useEffect(() => {
    if (
      params.assignment === 'all' ||
      params.assignment === 'unassigned' ||
      params.assignment === 'assigned'
    ) {
      setAssignmentFilter(params.assignment);
    }
  }, [params.assignment]);

  const filters = useMemo(
    () => ({
      search: searchQuery,
      assignment: assignmentFilter,
    }),
    [searchQuery, assignmentFilter]
  );

  const {
    data: cases = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useAdminCases(filters);

  const { data: activeAdvocates = [] } = useAdminUsers({
    role: 'ADVOCATE',
    status: 'active',
  });

  const assignMutation = useAssignCase();

  // Assign / Reassign Modal State
  const [selectedCase, setSelectedCase] = useState<AdminCaseItem | null>(null);
  const [selectedAdvocateId, setSelectedAdvocateId] = useState<number | null>(null);
  const [replaceAdvocateId, setReplaceAdvocateId] = useState<number | null>(null);
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [advocateSearch, setAdvocateSearch] = useState('');

  // History Modal State
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyCaseId, setHistoryCaseId] = useState<number | undefined>(undefined);
  const [historyCaseLabel, setHistoryCaseLabel] = useState<string>('All Cases');

  const {
    data: assignmentHistory = [],
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
  } = useAdminCaseAssignments(historyCaseId);

  const filteredAdvocates = useMemo(() => {
    const q = advocateSearch.trim().toLowerCase();
    if (!q) return activeAdvocates;
    return activeAdvocates.filter(a => {
      const enr = a.profile?.bar_council_enrollment_number?.toLowerCase() || '';
      return (
        a.full_name.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        enr.includes(q)
      );
    });
  }, [activeAdvocates, advocateSearch]);

  const openAssignModal = (caseItem: AdminCaseItem) => {
    setSelectedCase(caseItem);
    setSelectedAdvocateId(null);
    setReplaceAdvocateId(
      caseItem.assigned_advocates.length === 1 ? caseItem.assigned_advocates[0].id : null
    );
    setAssignmentNotes('');
    setAdvocateSearch('');
  };

  const openHistoryModal = (caseItem?: AdminCaseItem) => {
    setHistoryCaseId(caseItem?.id);
    setHistoryCaseLabel(
      caseItem ? caseItem.formatted_case_number : 'All Assignment Events'
    );
    setHistoryModalOpen(true);
  };

  const handleAssignSubmit = async () => {
    if (!selectedCase || !selectedAdvocateId) return;
    try {
      const res = await assignMutation.mutateAsync({
        caseId: selectedCase.id,
        payload: {
          advocate_id: selectedAdvocateId,
          action: 'assign',
          notes: assignmentNotes.trim() || undefined,
          replace_advocate_id:
            replaceAdvocateId && replaceAdvocateId !== selectedAdvocateId
              ? replaceAdvocateId
              : undefined,
        },
      });
      setSelectedCase(res.case);
      setSelectedAdvocateId(null);
      setReplaceAdvocateId(null);
      setAssignmentNotes('');
      showToast(res.detail || 'Case assigned successfully.', 'success');
    } catch (err) {
      showToast(extractApiError(err, 'Unable to assign case.'), 'error');
    }
  };

  const handleUnassignAdvocate = async (
    caseId: number,
    advocate: AdminCaseAdvocateSummary
  ) => {
    try {
      const res = await assignMutation.mutateAsync({
        caseId,
        payload: {
          advocate_id: advocate.id,
          action: 'unassign',
          notes: assignmentNotes.trim() || undefined,
        },
      });
      if (selectedCase?.id === caseId) {
        setSelectedCase(res.case);
      }
      showToast(res.detail || 'Advocate unassigned from case.', 'info');
    } catch (err) {
      showToast(extractApiError(err, 'Unable to unassign advocate.'), 'error');
    }
  };

  const renderCaseCard = ({ item }: { item: AdminCaseItem }) => (
    <Card style={styles.caseCard} testID={`admin-case-card-${item.id}`}>
      <View style={styles.caseTopRow}>
        <Text style={styles.caseNumberText}>{item.formatted_case_number}</Text>
        <Badge
          label={item.is_assigned ? 'ASSIGNED' : 'UNASSIGNED'}
          variant={item.is_assigned ? 'success' : 'warning'}
        />
      </View>

      <Text style={styles.partiesText} numberOfLines={2}>
        {item.petitioner} vs {item.respondent}
      </Text>

      <View style={styles.caseMetaRow}>
        <Text style={styles.metaItem}>Stage: {item.current_stage}</Text>
        {item.court_hall_number ? (
          <Text style={styles.metaItem}>Hall {item.court_hall_number}</Text>
        ) : null}
        {item.next_hearing_date ? (
          <Text style={styles.metaItem}>Next: {item.next_hearing_date}</Text>
        ) : null}
      </View>

      {/* Assigned Advocates Chips */}
      <View style={styles.assignedListWrap}>
        <Text style={styles.assignedLabel}>Assigned Advocates:</Text>
        {item.assigned_advocates.length === 0 ? (
          <Text style={styles.unassignedHint}>
            No advocate currently assigned (isolated from advocate views).
          </Text>
        ) : (
          <View style={styles.advocateChipsRow}>
            {item.assigned_advocates.map(adv => (
              <View key={adv.id} style={styles.advocateChip}>
                <AppIcon name="user-check" size={13} color={Colors.primary} />
                <Text style={styles.advocateChipText}>
                  {adv.full_name} ({adv.enrollment_number || adv.username})
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.caseActionsRow}>
        <Button
          title={
            item.is_assigned
              ? t('admin.reassignManage', 'Assign / Reassign')
              : t('admin.assignNow', 'Assign Advocate')
          }
          variant="primary"
          onPress={() => openAssignModal(item)}
          style={styles.caseActionBtn}
          testID={`admin-case-assign-btn-${item.id}`}
        />
        <Button
          title={t('admin.historyBtn', 'History')}
          variant="outline"
          onPress={() => openHistoryModal(item)}
          style={styles.historyActionBtn}
          testID={`admin-case-history-btn-${item.id}`}
        />
      </View>
    </Card>
  );

  return (
    <ScreenContainer testID="admin-cases-screen">
      <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
        {/* Top Header */}
        <View style={styles.topHeaderRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.screenHeading}>
              {t('admin.caseAssignment', 'Case Assignment & Ownership')}
            </Text>
            <Text style={styles.screenSubheading}>
              {cases.length} {cases.length === 1 ? 'case docket' : 'case dockets'} •
              Metadata-only view
            </Text>
          </View>
          <Button
            title={t('admin.allHistoryBtn', 'Audit History')}
            variant="outline"
            onPress={() => openHistoryModal()}
            style={styles.topHistoryBtn}
            testID="admin-cases-all-history-btn"
          />
        </View>

        {/* Search Input */}
        <Input
          placeholder={t(
            'admin.searchCasesPlaceholder',
            'Search by case number, type, petitioner, or respondent...'
          )}
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon={<AppIcon name="search" size={18} color={Colors.text.muted} />}
          rightAction={
            searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <AppIcon name="x" size={16} color={Colors.text.muted} />
              </TouchableOpacity>
            ) : undefined
          }
          testID="admin-cases-search"
        />

        {/* Assignment Filter Chips */}
        <View style={styles.filterRow}>
          {(
            [
              { key: 'all', label: 'All Cases' },
              { key: 'unassigned', label: 'Unassigned Only' },
              { key: 'assigned', label: 'Assigned' },
            ] as Array<{ key: AssignmentFilter; label: string }>
          ).map(opt => {
            const selected = assignmentFilter === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.filterChip, selected && styles.filterChipActive]}
                onPress={() => setAssignmentFilter(opt.key)}
                testID={`admin-cases-filter-${opt.key}`}
              >
                <Text
                  style={[styles.filterChipText, selected && styles.filterChipTextActive]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Cases List */}
        {isLoading ? (
          <View testID="admin-cases-loading">
            <SkeletonCard variant="list-item" count={3} />
          </View>
        ) : isError ? (
          <ErrorState
            title="Unable to load case assignments"
            message="Please verify administrator access and retry."
            onRetry={() => refetch()}
            testID="admin-cases-error"
            retryTestID="admin-cases-retry"
          />
        ) : (
          <FlatList
            data={cases}
            keyExtractor={item => String(item.id)}
            renderItem={renderCaseCard}
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                title="No Matching Cases"
                description="No case dockets match your current assignment filter."
                icon={<AppIcon name="briefcase" size={32} color={Colors.text.muted} />}
              />
            }
          />
        )}
      </View>

      {/* Assign / Reassign Modal */}
      <Modal
        visible={Boolean(selectedCase)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedCase(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="admin-assign-modal">
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCol}>
                <Text style={styles.modalTitle}>Assign Case to Advocate</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedCase?.formatted_case_number} • {selectedCase?.petitioner} vs{' '}
                  {selectedCase?.respondent}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedCase(null)}
                accessibilityLabel="Close assignment modal"
              >
                <AppIcon name="x" size={20} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Currently Assigned Section */}
              {selectedCase && selectedCase.assigned_advocates.length > 0 ? (
                <View style={styles.currentAssignedBox}>
                  <Text style={styles.sectionMiniLabel}>
                    Currently Assigned ({selectedCase.assigned_advocates.length})
                  </Text>
                  {selectedCase.assigned_advocates.map(adv => {
                    const willReplace = replaceAdvocateId === adv.id;
                    return (
                      <View key={adv.id} style={styles.currentAdvRow}>
                        <View style={styles.currentAdvInfo}>
                          <Text style={styles.currentAdvName}>{adv.full_name}</Text>
                          <Text style={styles.currentAdvId}>
                            {adv.enrollment_number || adv.username}
                          </Text>
                        </View>
                        <View style={styles.currentAdvActions}>
                          <TouchableOpacity
                            style={[
                              styles.miniToggleBtn,
                              willReplace && styles.miniToggleBtnActive,
                            ]}
                            onPress={() =>
                              setReplaceAdvocateId(prev =>
                                prev === adv.id ? null : adv.id
                              )
                            }
                            testID={`admin-replace-toggle-${adv.id}`}
                          >
                            <Text
                              style={[
                                styles.miniToggleText,
                                willReplace && styles.miniToggleTextActive,
                              ]}
                            >
                              {willReplace ? 'Replacing' : 'Replace'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.unassignChipBtn}
                            onPress={() => handleUnassignAdvocate(selectedCase.id, adv)}
                            disabled={assignMutation.isPending}
                            testID={`admin-unassign-btn-${adv.id}`}
                          >
                            <Text style={styles.unassignChipText}>Unassign</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {/* Select Target Advocate */}
              <Text style={styles.sectionMiniLabel}>
                Select Active Advocate to Assign
              </Text>
              <Input
                placeholder="Filter advocates..."
                value={advocateSearch}
                onChangeText={setAdvocateSearch}
                leftIcon={<AppIcon name="search" size={16} color={Colors.text.muted} />}
              />

              <View style={styles.advocatePickerList}>
                {filteredAdvocates.length === 0 ? (
                  <Text style={styles.noAdvocatesText}>
                    No active advocates match your search.
                  </Text>
                ) : (
                  filteredAdvocates.map((adv: AdminUserItem) => {
                    const isPicked = selectedAdvocateId === adv.id;
                    return (
                      <TouchableOpacity
                        key={adv.id}
                        style={[
                          styles.advocateOptionRow,
                          isPicked && styles.advocateOptionRowActive,
                        ]}
                        onPress={() => setSelectedAdvocateId(adv.id)}
                        testID={`admin-pick-advocate-${adv.id}`}
                      >
                        <View style={styles.advOptionCopy}>
                          <Text style={styles.advOptionName}>
                            {adv.full_name || adv.username}
                          </Text>
                          <Text style={styles.advOptionMeta}>
                            {adv.profile?.bar_council_enrollment_number || adv.username} •{' '}
                            {adv.assigned_cases_count} cases
                          </Text>
                        </View>
                        {isPicked ? (
                          <AppIcon name="check-circle" size={18} color={Colors.primary} />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              <Input
                label="Assignment Notes (Optional Audit Memo)"
                placeholder="e.g. Chamber transfer / Senior counsel appearance"
                value={assignmentNotes}
                onChangeText={setAssignmentNotes}
                testID="admin-assign-notes-input"
              />

              <View style={styles.modalFooterActions}>
                <Button
                  title={t('common.cancel', 'Close')}
                  variant="secondary"
                  onPress={() => setSelectedCase(null)}
                  style={styles.modalBtn}
                />
                <Button
                  title={replaceAdvocateId ? 'Reassign Case' : 'Confirm Assignment'}
                  variant="primary"
                  disabled={!selectedAdvocateId}
                  loading={assignMutation.isPending}
                  onPress={handleAssignSubmit}
                  style={styles.modalBtn}
                  testID="admin-assign-confirm-btn"
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Assignment History Modal */}
      <Modal
        visible={historyModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setHistoryModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="admin-assignment-history-modal">
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCol}>
                <Text style={styles.modalTitle}>Assignment Audit History</Text>
                <Text style={styles.modalSubtitle}>{historyCaseLabel}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setHistoryModalOpen(false)}
                accessibilityLabel="Close assignment history"
              >
                <AppIcon name="x" size={20} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>

            {isHistoryLoading ? (
              <SkeletonCard variant="list-item" count={2} />
            ) : assignmentHistory.length === 0 ? (
              <EmptyState
                title="No Assignment History"
                description="No assignment or reassignment events have been logged yet."
                actionLabel="Refresh"
                onAction={() => refetchHistory()}
                icon={
                  <AppIcon name="clipboard-list" size={28} color={Colors.text.muted} />
                }
              />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {assignmentHistory.map((evt: CaseAssignmentHistoryItem) => (
                  <View key={evt.id} style={styles.historyRow}>
                    <View style={styles.historyTopRow}>
                      <Badge
                        label={evt.action}
                        variant={evt.action === 'ASSIGNED' ? 'success' : 'danger'}
                      />
                      <Text style={styles.historyDate}>
                        {new Date(evt.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <Text style={styles.historyMain}>
                      {evt.case_number} • {evt.advocate_name}
                      {evt.advocate_enrollment ? ` (${evt.advocate_enrollment})` : ''}
                    </Text>
                    <Text style={styles.historyActor}>
                      Authorized by {evt.assigned_by_name}
                    </Text>
                    {evt.notes ? (
                      <Text style={styles.historyNotes}>Note: {evt.notes}</Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            )}

            <Button
              title="Close"
              variant="outline"
              onPress={() => setHistoryModalOpen(false)}
              style={styles.historyCloseBtn}
            />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    width: '100%',
  },
  desktopContainer: {
    maxWidth: 1020,
    alignSelf: 'center',
  },
  topHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 180,
  },
  screenHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  screenSubheading: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: 2,
  },
  topHistoryBtn: {
    minHeight: 42,
    paddingHorizontal: Spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  filterChipTextActive: {
    color: Colors.text.white,
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  caseCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadows.subtle,
  },
  caseTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 4,
  },
  caseNumberText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primary,
  },
  partiesText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  caseMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  metaItem: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  assignedListWrap: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.button,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  assignedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.muted,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  unassignedHint: {
    fontSize: 12,
    color: Colors.warning,
    fontWeight: '500',
  },
  advocateChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  advocateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceBlue,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  advocateChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  caseActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  caseActionBtn: {
    flex: 2,
    minHeight: 42,
  },
  historyActionBtn: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: Spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.card + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    ...Shadows.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  modalTitleCol: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  currentAssignedBox: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.button,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionMiniLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.muted,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  currentAdvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  currentAdvInfo: {
    flex: 1,
  },
  currentAdvName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  currentAdvId: {
    fontSize: 12,
    color: Colors.text.muted,
  },
  currentAdvActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  miniToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.badge,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
  },
  miniToggleBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  miniToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  miniToggleTextActive: {
    color: Colors.text.white,
  },
  unassignChipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.badge,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    backgroundColor: Colors.dangerSurface,
  },
  unassignChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.danger,
  },
  advocatePickerList: {
    maxHeight: 200,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  noAdvocatesText: {
    fontSize: 12,
    color: Colors.text.muted,
    paddingVertical: Spacing.sm,
  },
  advocateOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  advocateOptionRowActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceBlue,
  },
  advOptionCopy: {
    flex: 1,
  },
  advOptionName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  advOptionMeta: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  modalFooterActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  modalBtn: {
    flex: 1,
  },
  historyRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  historyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 12,
    color: Colors.text.muted,
  },
  historyMain: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  historyActor: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  historyNotes: {
    fontSize: 12,
    color: Colors.primary,
    marginTop: 3,
    fontStyle: 'italic',
  },
  historyCloseBtn: {
    marginTop: Spacing.md,
  },
});
