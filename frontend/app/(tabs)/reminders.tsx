import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Switch,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { AppIcon } from '../../components/common/AppIcon';
import { SkeletonCard } from '../../components/common/SkeletonCard';
import { ErrorState } from '../../components/common/ErrorState';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';
import { ReminderItemComponent } from '../../components/reminders/ReminderItem';
import { CreateReminderModal } from '../../components/reminders/CreateReminderModal';
import { UpcomingHearingCard } from '../../components/hearings/UpcomingHearingCard';
import { RescheduleHearingModal } from '../../components/hearings/RescheduleHearingModal';
import { OfflineBanner } from '../../components/offline/OfflineBanner';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import {
  useDismissReminder,
  useReminderPreferences,
  useReminders,
  useUpdateReminderPreferences,
} from '../../features/reminders/hooks';
import { useUpcomingHearings } from '../../features/cases/hooks';
import { HearingItem } from '../../types';

type ActiveTab = 'HEARINGS' | 'REMINDERS' | 'PREFERENCES';

export default function RemindersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ActiveTab>('HEARINGS');
  const [reminderFilter, setReminderFilter] = useState<
    'ALL' | 'TODAY' | 'UPCOMING' | 'OVERDUE' | 'COMPLETED'
  >('ALL');
  const [rescheduleTarget, setRescheduleTarget] = useState<HearingItem | null>(null);
  const [isCreateReminderModalVisible, setIsCreateReminderModalVisible] = useState(false);

  // Queries
  const {
    data: hearings,
    isLoading: isHearingsLoading,
    isError: isHearingsError,
    refetch: refetchHearings,
    isRefetching: isHearingsRefetching,
  } = useUpcomingHearings();

  const {
    data: reminders,
    isLoading: isRemindersLoading,
    isError: isRemindersError,
    refetch: refetchReminders,
    isRefetching: isRemindersRefetching,
  } = useReminders();

  const { data: preferences, isLoading: isPrefLoading } = useReminderPreferences();

  // Filtered reminders computation
  const filteredReminders = React.useMemo(() => {
    if (!reminders) return [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    return reminders.filter(rem => {
      const isFinished = Boolean(
        rem.is_completed ||
          (rem.status as string) === 'DISMISSED' ||
          (rem.status as string) === 'COMPLETED'
      );
      if (reminderFilter === 'COMPLETED') return isFinished;
      if (isFinished) return false;

      const dueDate = new Date(rem.due_date);
      const dueStr = rem.due_date ? rem.due_date.split('T')[0] : '';

      if (reminderFilter === 'TODAY') {
        return dueStr === todayStr;
      }
      if (reminderFilter === 'OVERDUE') {
        return dueDate < now && dueStr !== todayStr;
      }
      if (reminderFilter === 'UPCOMING') {
        return dueDate >= now;
      }
      return true;
    });
  }, [reminders, reminderFilter]);

  // Mutations
  const dismissMutation = useDismissReminder();
  const updatePrefMutation = useUpdateReminderPreferences();

  const handleDismiss = (id: number) => {
    dismissMutation.mutate(id);
    showToast('Reminder dismissed.', 'info');
  };

  const handleTogglePref = (
    key:
      | 'remind_24h_before'
      | 'remind_1h_before'
      | 'push_notifications'
      | 'judgment_push_notifications'
      | 'hearing_change_push_notifications'
  ) => {
    if (!preferences) return;
    updatePrefMutation.mutate({
      [key]: !preferences[key],
    });
    showToast('Reminder preference updated.', 'success');
  };

  return (
    <ScreenContainer testID="reminders-screen">
      <OfflineBanner
        onSyncComplete={() => {
          refetchReminders();
          refetchHearings();
        }}
      />
      <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
        {/* Segmented Tab Navigation */}
        <View style={styles.tabBar} testID="reminders-tab-bar">
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'HEARINGS' && styles.tabButtonActive]}
            onPress={() => setActiveTab('HEARINGS')}
            testID="tab-upcoming-hearings"
          >
            <Text
              style={[styles.tabText, activeTab === 'HEARINGS' && styles.tabTextActive]}
            >
              {t('hearings.upcomingTitle', 'Upcoming Hearings')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'REMINDERS' && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab('REMINDERS')}
            testID="tab-compliance-reminders"
          >
            <Text
              style={[styles.tabText, activeTab === 'REMINDERS' && styles.tabTextActive]}
            >
              {t('reminders.title', 'Compliance Diary')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'PREFERENCES' && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab('PREFERENCES')}
            testID="tab-reminder-preferences"
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'PREFERENCES' && styles.tabTextActive,
              ]}
            >
              {t('reminders.preferences', 'Preferences')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab 1: Upcoming Hearings */}
        {activeTab === 'HEARINGS' && (
          <View style={styles.contentFlex}>
            {isHearingsLoading ? (
              <SkeletonCard variant="list-item" count={3} />
            ) : isHearingsError ? (
              <ErrorState
                title={t('hearings.loadError', 'Could Not Load Hearings')}
                message="Unable to sync upcoming court appearances."
                retryLabel={t('common.retry', 'Retry')}
                onRetry={() => refetchHearings()}
                testID="hearings-error-state"
              />
            ) : !hearings || hearings.length === 0 ? (
              <EmptyState
                title={t('hearings.noUpcoming', 'No Upcoming Hearings')}
                description={t(
                  'hearings.noUpcomingDesc',
                  'No hearing appearances are currently scheduled for your tracked dockets.'
                )}
                iconName="calendar-clock"
                testID="hearings-empty-state"
              />
            ) : (
              <FlatList
                data={hearings}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => (
                  <UpcomingHearingCard
                    item={item}
                    onPressCase={caseId => router.push(`/cases/${caseId}`)}
                    onReschedule={h => setRescheduleTarget(h)}
                  />
                )}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isHearingsRefetching}
                    onRefresh={refetchHearings}
                    tintColor={Colors.primary}
                    colors={[Colors.primary]}
                  />
                }
                testID="upcoming-hearings-list"
              />
            )}
          </View>
        )}

        {/* Tab 2: Compliance Reminders */}
        {activeTab === 'REMINDERS' && (
          <View style={styles.contentFlex}>
            <View style={styles.filterBarContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipRow}
              >
                {(['ALL', 'TODAY', 'UPCOMING', 'OVERDUE', 'COMPLETED'] as const).map(
                  f => {
                    const label =
                      f === 'ALL'
                        ? 'All'
                        : f === 'TODAY'
                          ? 'Today'
                          : f === 'UPCOMING'
                            ? 'Upcoming'
                            : f === 'OVERDUE'
                              ? 'Overdue'
                              : 'Completed';
                    const isActive = reminderFilter === f;
                    return (
                      <TouchableOpacity
                        key={f}
                        onPress={() => setReminderFilter(f)}
                        style={[styles.filterChip, isActive && styles.filterChipActive]}
                        testID={`reminder-filter-${f.toLowerCase()}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            isActive && styles.filterChipTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                )}
              </ScrollView>

              <TouchableOpacity
                style={styles.newReminderButton}
                onPress={() => setIsCreateReminderModalVisible(true)}
                testID="new-reminder-button"
                accessibilityRole="button"
              >
                <AppIcon name="plus" size={14} color={Colors.text.white} />
                <Text style={styles.newReminderButtonText}>
                  {t('reminders.newReminder', 'New Reminder')}
                </Text>
              </TouchableOpacity>
            </View>
            {isRemindersLoading ? (
              <SkeletonCard variant="list-item" count={3} />
            ) : isRemindersError ? (
              <ErrorState
                title="Could Not Load Reminders"
                message="Unable to sync reminders with the server."
                retryLabel={t('common.retry', 'Retry')}
                onRetry={() => refetchReminders()}
                testID="reminders-error-state"
              />
            ) : !reminders || reminders.length === 0 ? (
              <EmptyState
                title={t('reminders.empty', 'No pending compliance tasks or reminders.')}
                description="All court deadlines and compliance tasks are up to date."
                actionLabel="+ Create First Reminder"
                onAction={() => setIsCreateReminderModalVisible(true)}
                iconName="bell-ring"
                testID="reminders-empty-state"
              />
            ) : filteredReminders.length === 0 ? (
              <EmptyState
                title="No Reminders Match Filter"
                description="No tasks found for the selected filter."
                actionLabel="Show All Reminders"
                onAction={() => setReminderFilter('ALL')}
                iconName="filter"
              />
            ) : (
              <FlatList
                data={filteredReminders}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => (
                  <ReminderItemComponent item={item} onDismiss={handleDismiss} />
                )}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isRemindersRefetching}
                    onRefresh={refetchReminders}
                    tintColor={Colors.primary}
                    colors={[Colors.primary]}
                  />
                }
                testID="reminders-list"
              />
            )}

            <CreateReminderModal
              visible={isCreateReminderModalVisible}
              onClose={() => setIsCreateReminderModalVisible(false)}
            />
          </View>
        )}

        {/* Tab 3: Reminder Preferences */}
        {activeTab === 'PREFERENCES' && (
          <ScrollView
            contentContainerStyle={styles.prefScroll}
            showsVerticalScrollIndicator={false}
            testID="reminder-preferences-screen"
          >
            {isPrefLoading || !preferences ? (
              <SkeletonCard variant="card" count={1} />
            ) : (
              <Card style={styles.prefCard}>
                <Text style={styles.prefHeading}>
                  {t('reminders.schedulePref', 'Hearing Reminder Schedule')}
                </Text>
                <Text style={styles.prefSubtext}>
                  {t(
                    'reminders.prefDesc',
                    'Configure automated advance notifications prior to scheduled court appearances.'
                  )}
                </Text>

                {/* 24 Hours Before Toggle */}
                <View style={styles.prefRow}>
                  <View style={styles.prefInfo}>
                    <Text style={styles.prefTitle}>
                      {t('reminders.remind24h', '24 Hours Advance Reminder')}
                    </Text>
                    <Text style={styles.prefNotice}>
                      Receive notification 1 day prior to hearing.
                    </Text>
                  </View>
                  <Switch
                    value={preferences.remind_24h_before}
                    onValueChange={() => handleTogglePref('remind_24h_before')}
                    thumbColor={Colors.surface}
                    trackColor={{ false: Colors.borderStrong, true: Colors.primary }}
                    testID="pref-toggle-24h"
                  />
                </View>

                {/* 1 Hour Before Toggle */}
                <View style={styles.prefRow}>
                  <View style={styles.prefInfo}>
                    <Text style={styles.prefTitle}>
                      {t('reminders.remind1h', '1 Hour Prior Reminder')}
                    </Text>
                    <Text style={styles.prefNotice}>
                      Receive urgent notification 60 minutes before session.
                    </Text>
                  </View>
                  <Switch
                    value={preferences.remind_1h_before}
                    onValueChange={() => handleTogglePref('remind_1h_before')}
                    thumbColor={Colors.surface}
                    trackColor={{ false: Colors.borderStrong, true: Colors.primary }}
                    testID="pref-toggle-1h"
                  />
                </View>

                {/* Push Notifications Toggle */}
                <View style={styles.prefRow}>
                  <View style={styles.prefInfo}>
                    <Text style={styles.prefTitle}>
                      {t('settings.notifications', 'Push Notifications')}
                    </Text>
                    <Text style={styles.prefNotice}>
                      Master toggle for mobile push alerts.
                    </Text>
                  </View>
                  <Switch
                    value={preferences.push_notifications}
                    onValueChange={() => handleTogglePref('push_notifications')}
                    thumbColor={Colors.surface}
                    trackColor={{ false: Colors.borderStrong, true: Colors.primary }}
                    testID="pref-toggle-push"
                  />
                </View>

                {/* Judgment & Order Alerts Toggle */}
                <View style={styles.prefRow}>
                  <View style={styles.prefInfo}>
                    <Text style={styles.prefTitle}>
                      {t('notifications.judgmentAlerts', 'Judgment & Order Alerts')}
                    </Text>
                    <Text style={styles.prefNotice}>
                      Instant alerts when judgments or certified order documents are
                      posted.
                    </Text>
                  </View>
                  <Switch
                    value={preferences.judgment_push_notifications}
                    onValueChange={() => handleTogglePref('judgment_push_notifications')}
                    thumbColor={Colors.surface}
                    trackColor={{ false: Colors.borderStrong, true: Colors.primary }}
                    testID="pref-toggle-judgment"
                  />
                </View>

                {/* Hearing Changes Toggle */}
                <View style={[styles.prefRow, styles.prefRowLast]}>
                  <View style={styles.prefInfo}>
                    <Text style={styles.prefTitle}>
                      {t('notifications.hearingChangeAlerts', 'Hearing Change Alerts')}
                    </Text>
                    <Text style={styles.prefNotice}>
                      Alerts for rescheduled appearances, adjournments, cancellations, and
                      hall moves.
                    </Text>
                  </View>
                  <Switch
                    value={preferences.hearing_change_push_notifications}
                    onValueChange={() =>
                      handleTogglePref('hearing_change_push_notifications')
                    }
                    thumbColor={Colors.surface}
                    trackColor={{ false: Colors.borderStrong, true: Colors.primary }}
                    testID="pref-toggle-hearing-change"
                  />
                </View>
              </Card>
            )}
          </ScrollView>
        )}
      </View>

      {/* Reschedule Hearing Modal */}
      <RescheduleHearingModal
        visible={Boolean(rescheduleTarget)}
        hearing={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onSuccess={() => {
          showToast('Hearing appearance rescheduled.', 'success');
          refetchHearings();
          refetchReminders();
        }}
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
    maxWidth: 1120,
    alignSelf: 'center',
    width: '100%',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    padding: 4,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.subtle,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Radius.badge + 2,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    color: Colors.text.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.text.white,
    fontWeight: '700',
  },
  contentFlex: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Spacing.xl,
  },
  filterBarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 36,
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
  newReminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.button,
    minHeight: 42,
    justifyContent: 'center',
  },
  newReminderButtonText: {
    color: Colors.text.white,
    fontSize: 13,
    fontWeight: '700',
  },
  prefScroll: {
    paddingBottom: Spacing.xl,
  },
  prefCard: {
    padding: 20,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadows.subtle,
  },
  prefHeading: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  prefSubtext: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  prefRowLast: {
    borderBottomWidth: 0,
  },
  prefInfo: {
    flex: 1,
    paddingRight: 16,
  },
  prefTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  prefNotice: {
    color: Colors.text.muted,
    fontSize: 12,
  },
});
