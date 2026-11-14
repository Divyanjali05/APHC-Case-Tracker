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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { ReminderItemComponent } from '../../components/reminders/ReminderItem';
import { CreateReminderModal } from '../../components/reminders/CreateReminderModal';
import { UpcomingHearingCard } from '../../components/hearings/UpcomingHearingCard';
import { RescheduleHearingModal } from '../../components/hearings/RescheduleHearingModal';
import { LoadingIndicator } from '../../components/common/LoadingIndicator';
import { EmptyState } from '../../components/common/EmptyState';
import { OfflineBanner } from '../../components/offline/OfflineBanner';
import { Colors } from '../../constants/colors';
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('HEARINGS');
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

  // Mutations
  const dismissMutation = useDismissReminder();
  const updatePrefMutation = useUpdateReminderPreferences();

  const handleDismiss = (id: number) => {
    dismissMutation.mutate(id);
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
  };

  return (
    <ScreenContainer testID="reminders-screen">
      <OfflineBanner
        onSyncComplete={() => {
          refetchReminders();
          refetchHearings();
        }}
      />
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
          style={[styles.tabButton, activeTab === 'REMINDERS' && styles.tabButtonActive]}
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
            style={[styles.tabText, activeTab === 'PREFERENCES' && styles.tabTextActive]}
          >
            {t('reminders.preferences', 'Preferences')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab 1: Upcoming Hearings */}
      {activeTab === 'HEARINGS' && (
        <View style={styles.contentFlex}>
          {isHearingsLoading ? (
            <LoadingIndicator message={t('common.loading')} />
          ) : isHearingsError ? (
            <EmptyState
              title={t('hearings.loadError', 'Could Not Load Hearings')}
              description="Unable to sync upcoming court appearances."
              actionLabel={t('common.retry')}
              onAction={() => refetchHearings()}
              testID="hearings-error-state"
            />
          ) : !hearings || hearings.length === 0 ? (
            <EmptyState
              title={t('hearings.noUpcoming', 'No Upcoming Hearings')}
              description={t(
                'hearings.noUpcomingDesc',
                'No hearing appearances are currently scheduled for your tracked dockets.'
              )}
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
                  tintColor={Colors.primaryLight}
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
          <View style={styles.tabActionRow}>
            <TouchableOpacity
              style={styles.newReminderButton}
              onPress={() => setIsCreateReminderModalVisible(true)}
              testID="new-reminder-button"
            >
              <Text style={styles.newReminderButtonText}>
                + {t('reminders.newReminder', 'New Reminder')}
              </Text>
            </TouchableOpacity>
          </View>
          {isRemindersLoading ? (
            <LoadingIndicator message={t('common.loading')} />
          ) : isRemindersError ? (
            <EmptyState
              title="Could Not Load Reminders"
              description="Unable to sync reminders with the server."
              actionLabel={t('common.retry')}
              onAction={() => refetchReminders()}
              testID="reminders-error-state"
            />
          ) : !reminders || reminders.length === 0 ? (
            <EmptyState
              title={t('reminders.empty')}
              description="All court deadlines and compliance tasks are up to date."
              actionLabel="+ Create First Reminder"
              onAction={() => setIsCreateReminderModalVisible(true)}
              testID="reminders-empty-state"
            />
          ) : (
            <FlatList
              data={reminders}
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
                  tintColor={Colors.primaryLight}
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
            <LoadingIndicator message={t('common.loading')} />
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
                  thumbColor={
                    preferences.remind_24h_before ? Colors.primaryLight : '#94A3B8'
                  }
                  trackColor={{ false: Colors.border, true: '#1E3A8A' }}
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
                  thumbColor={
                    preferences.remind_1h_before ? Colors.primaryLight : '#94A3B8'
                  }
                  trackColor={{ false: Colors.border, true: '#1E3A8A' }}
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
                  thumbColor={
                    preferences.push_notifications ? Colors.primaryLight : '#94A3B8'
                  }
                  trackColor={{ false: Colors.border, true: '#1E3A8A' }}
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
                    Instant alerts when judgments or certified order documents are posted.
                  </Text>
                </View>
                <Switch
                  value={preferences.judgment_push_notifications}
                  onValueChange={() => handleTogglePref('judgment_push_notifications')}
                  thumbColor={
                    preferences.judgment_push_notifications
                      ? Colors.primaryLight
                      : '#94A3B8'
                  }
                  trackColor={{ false: Colors.border, true: '#1E3A8A' }}
                  testID="pref-toggle-judgment"
                />
              </View>

              {/* Hearing Changes Toggle */}
              <View style={[styles.prefRow, { borderBottomWidth: 0 }]}>
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
                  thumbColor={
                    preferences.hearing_change_push_notifications
                      ? Colors.primaryLight
                      : '#94A3B8'
                  }
                  trackColor={{ false: Colors.border, true: '#1E3A8A' }}
                  testID="pref-toggle-hearing-change"
                />
              </View>
            </Card>
          )}
        </ScrollView>
      )}

      {/* Reschedule Hearing Modal */}
      <RescheduleHearingModal
        visible={Boolean(rescheduleTarget)}
        hearing={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onSuccess={() => {
          refetchHearings();
          refetchReminders();
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    color: Colors.text.secondary,
    fontSize: 12,
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
    paddingBottom: 24,
  },
  prefScroll: {
    paddingBottom: 24,
  },
  prefCard: {
    padding: 18,
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
  tabActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  newReminderButton: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newReminderButtonText: {
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: '700',
  },
});
