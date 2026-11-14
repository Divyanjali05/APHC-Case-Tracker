import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useRouter, Href } from 'expo-router';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { StatCard } from '../../components/dashboard/StatCard';
import { VoiceInputModal } from '../../components/speech/VoiceInputModal';
import { NotificationCenterModal } from '../../components/notifications/NotificationCenterModal';
import { Colors } from '../../constants/colors';
import { fetchHealthCheck } from '../../services/api/client';
import { speechService } from '../../services/speech/ttsService';
import { useDashboard } from '../../features/cases/hooks';
import {
  DashboardHearingItem,
  DashboardReminderItem,
  DashboardNotificationItem,
} from '../../types';

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);
  const [isNotificationCenterVisible, setIsNotificationCenterVisible] = useState(false);

  const {
    data: health,
    isLoading: isHealthLoading,
    isError: isHealthError,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ['health-check'],
    queryFn: fetchHealthCheck,
    retry: 1,
  });

  const {
    data: dashboard,
    isLoading: isDashboardLoading,
    isError: isDashboardError,
    refetch: refetchDashboard,
    isRefetching: isDashboardRefetching,
  } = useDashboard();

  const isRefreshing = isDashboardRefetching;

  const onRefresh = async () => {
    await Promise.all([refetchDashboard(), refetchHealth()]);
  };

  const nextLanguage = () => {
    if (i18n.language === 'en') return 'te';
    if (i18n.language === 'te') return 'hi';
    return 'en';
  };

  const getLanguageLabel = () => {
    if (i18n.language === 'te') return 'తెలుగు';
    if (i18n.language === 'hi') return 'हिन्दी';
    return 'English';
  };

  const handleVoiceWelcome = () => {
    const summary = dashboard?.summary;
    let text = `${t('common.courtName')}. ${t('dashboard.title')}.`;
    if (summary) {
      text += ` ${t('dashboard.totalCases', 'Total Cases')}: ${summary.total_cases}. ${t('dashboard.pendingCases', 'Pending')}: ${summary.pending_cases}. ${t('dashboard.todayHearings', "Today's Hearings")}: ${dashboard.today_hearings?.length ?? 0}.`;
    }
    speechService.speak(text, i18n.language);
  };

  const summary = dashboard?.summary || {
    total_cases: 0,
    pending_cases: 0,
    disposed_cases: 0,
    adjourned_cases: 0,
  };

  const todayHearings = dashboard?.today_hearings || [];
  const upcomingHearings = dashboard?.upcoming_hearings || [];
  const upcomingReminders = dashboard?.upcoming_reminders || [];
  const recentNotifications = dashboard?.recent_notifications || [];
  const syncStatus = dashboard?.sync_status;

  return (
    <ScreenContainer testID="dashboard-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primaryLight}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Top Court Banner */}
        <View style={styles.topBar}>
          <Badge label="APHC AMARAVATI" variant="gold" />
          <TouchableOpacity
            onPress={() => i18n.changeLanguage(nextLanguage())}
            style={styles.langPill}
            testID="dashboard-lang-toggle"
          >
            <Text style={styles.langText}>{getLanguageLabel()}</Text>
          </TouchableOpacity>
        </View>

        {/* Offline Cache Indicator */}
        {dashboard?.isOfflineCached ? (
          <View style={styles.offlineBanner} testID="dashboard-offline-banner">
            <Text style={styles.offlineBannerText}>
              🔒 {t('dashboard.offlineNotice', 'Displaying encrypted offline snapshot')}
              {dashboard.cachedAt
                ? ` (${new Date(dashboard.cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
                : ''}
            </Text>
          </View>
        ) : null}

        {/* Hero Card */}
        <Card style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.courtTitle}>{t('common.courtName')}</Text>
            {syncStatus ? (
              <Badge
                label={
                  syncStatus.status === 'FRESH'
                    ? 'REGISTRY FRESH'
                    : syncStatus.status === 'STALE'
                      ? 'SYNC STALE'
                      : 'UNSYNCED'
                }
                variant={
                  syncStatus.status === 'FRESH'
                    ? 'success'
                    : syncStatus.status === 'STALE'
                      ? 'warning'
                      : 'secondary'
                }
                testID="sync-status-badge"
              />
            ) : null}
          </View>

          <Text style={styles.heroHeading}>{t('common.appName')}</Text>
          <Text style={styles.heroSubtext}>
            Comprehensive docket management, daily cause lists, and live court hall
            display board tracking.
          </Text>

          <View style={styles.voiceRow}>
            <Button
              title="Read Docket Summary"
              variant="outline"
              onPress={handleVoiceWelcome}
              style={styles.voiceButton}
              testID="voice-read-button"
            />
            <Button
              title={`🎤 ${t('dashboard.voiceAssistant', 'Voice Case Search')}`}
              variant="secondary"
              onPress={() => setIsVoiceModalVisible(true)}
              style={styles.voiceButton}
              testID="dashboard-voice-search-button"
            />
          </View>
        </Card>

        {/* Loading Skeleton / Indicator */}
        {isDashboardLoading && !dashboard ? (
          <Card style={styles.loadingCard}>
            <ActivityIndicator size="small" color={Colors.primaryLight} />
            <Text style={styles.loadingText}>{t('common.loading')}</Text>
          </Card>
        ) : isDashboardError && !dashboard ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Failed to load dashboard data</Text>
            <Text style={styles.errorSubtext}>
              Please check your network connection and try again.
            </Text>
            <Button
              title={t('common.retry')}
              variant="outline"
              onPress={() => refetchDashboard()}
              style={styles.retryButton}
              testID="dashboard-retry-button"
            />
          </Card>
        ) : (
          <>
            {/* Quick Stats Grid */}
            <View style={styles.statsGrid}>
              <StatCard
                title={t('dashboard.totalCases', 'Total Cases')}
                value={summary.total_cases}
                subtitle="Tracked matters"
                valueColor={Colors.text.primary}
                testID="stat-total-cases"
              />
              <StatCard
                title={t('dashboard.pendingCases', 'Pending')}
                value={summary.pending_cases}
                subtitle="Active hearings"
                valueColor={Colors.gold}
                testID="stat-pending-cases"
              />
            </View>
            <View style={styles.statsGrid}>
              <StatCard
                title={t('dashboard.disposedCases', 'Disposed')}
                value={summary.disposed_cases}
                subtitle="Judgments entered"
                valueColor={Colors.success}
                testID="stat-disposed-cases"
              />
              <StatCard
                title={t('dashboard.adjournedCases', 'Adjourned')}
                value={summary.adjourned_cases}
                subtitle="Future dates"
                valueColor={Colors.warning}
                testID="stat-adjourned-cases"
              />
            </View>

            {/* Today's Scheduled Hearings */}
            <View style={styles.sectionContainer} testID="today-hearings-section">
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {t('dashboard.todayHearingsTitle', "Today's Scheduled Appearances")}
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/calendar' as Href<string>)}
                  testID="open-calendar-tab-btn"
                  style={styles.calendarLinkBtn}
                >
                  <Text style={styles.calendarLinkText}>📅 {t('calendar.view_calendar', 'Calendar')}</Text>
                </TouchableOpacity>
                <Badge
                  label={String(todayHearings.length)}
                  variant={todayHearings.length > 0 ? 'gold' : 'secondary'}
                />
              </View>

              {todayHearings.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    {t('dashboard.noHearingsToday', 'No hearings listed for today.')}
                  </Text>
                </Card>
              ) : (
                todayHearings.map((h: DashboardHearingItem) => (
                  <TouchableOpacity
                    key={`today-${h.id}`}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/cases/${h.case_id}`)}
                    testID={`today-hearing-item-${h.id}`}
                  >
                    <Card style={styles.itemCard}>
                      <View style={styles.itemTopRow}>
                        <Text style={styles.caseNumber}>{h.case_number}</Text>
                        <View style={styles.badgeGroup}>
                          {h.court_hall ? (
                            <Badge label={`Hall ${h.court_hall}`} variant="gold" />
                          ) : null}
                          {h.item_number ? (
                            <Badge label={`Item #${h.item_number}`} variant="info" />
                          ) : null}
                        </View>
                      </View>
                      <Text style={styles.partiesText} numberOfLines={1}>
                        {h.petitioner} vs {h.respondent}
                      </Text>
                      {h.judge ? (
                        <Text style={styles.judgeText} numberOfLines={1}>
                          🏛️ {h.judge}
                        </Text>
                      ) : null}
                      <View style={styles.itemBottomRow}>
                        <Text style={styles.timeText}>
                          ⏰ {h.hearing_time ? String(h.hearing_time).substring(0, 5) : '10:30 AM'}
                        </Text>
                        <Badge label={h.status} variant="primary" />
                      </View>
                    </Card>
                  </TouchableOpacity>
                ))
              )}
            </View>

            {/* Upcoming Hearings */}
            <View style={styles.sectionContainer} testID="upcoming-hearings-section">
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {t('dashboard.upcomingHearingsTitle', 'Upcoming Hearings')}
                </Text>
                <Badge label={String(upcomingHearings.length)} variant="secondary" />
              </View>

              {upcomingHearings.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    {t('dashboard.noUpcomingHearings', 'No upcoming hearings found.')}
                  </Text>
                </Card>
              ) : (
                upcomingHearings.map((uh: DashboardHearingItem) => (
                  <TouchableOpacity
                    key={`upcoming-${uh.id}`}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/cases/${uh.case_id}`)}
                    testID={`upcoming-hearing-item-${uh.id}`}
                  >
                    <Card style={styles.itemCard}>
                      <View style={styles.itemTopRow}>
                        <Text style={styles.caseNumber}>{uh.case_number}</Text>
                        <Badge label={uh.hearing_date} variant="secondary" />
                      </View>
                      <Text style={styles.partiesText} numberOfLines={1}>
                        {uh.petitioner} vs {uh.respondent}
                      </Text>
                      <View style={styles.itemBottomRow}>
                        <Text style={styles.timeText}>
                          {uh.court_hall ? `Hall ${uh.court_hall}` : 'Court Hall TBD'}
                          {uh.item_number ? ` • Item #${uh.item_number}` : ''}
                        </Text>
                        <Badge label={uh.status} variant="info" />
                      </View>
                    </Card>
                  </TouchableOpacity>
                ))
              )}
            </View>

            {/* Compliance Reminders */}
            <View style={styles.sectionContainer} testID="upcoming-reminders-section">
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {t('dashboard.actionRemindersTitle', 'Compliance Reminders')}
                </Text>
                <Badge
                  label={String(upcomingReminders.length)}
                  variant={upcomingReminders.length > 0 ? 'warning' : 'secondary'}
                />
              </View>

              {upcomingReminders.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    {t('dashboard.noReminders', 'No pending reminders.')}
                  </Text>
                </Card>
              ) : (
                upcomingReminders.map((rem: DashboardReminderItem) => (
                  <Card key={`rem-${rem.id}`} style={styles.itemCard} testID={`reminder-item-${rem.id}`}>
                    <View style={styles.itemTopRow}>
                      <Text style={styles.reminderTitle} numberOfLines={1}>
                        {rem.title}
                      </Text>
                      <Badge label={rem.reminder_type} variant="warning" />
                    </View>
                    {rem.case_number ? (
                      <Text style={styles.reminderCaseRef}>{rem.case_number}</Text>
                    ) : null}
                    <View style={styles.itemBottomRow}>
                      <Text style={styles.timeText}>
                        📅 Due: {new Date(rem.due_date).toLocaleDateString()}
                      </Text>
                      <Badge label={rem.status} variant="secondary" />
                    </View>
                  </Card>
                ))
              )}
            </View>

            {/* Recent Notifications */}
            <View style={styles.sectionContainer} testID="recent-notifications-section">
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {t('dashboard.recentAlertsTitle', 'Recent Notifications')}
                </Text>
                <TouchableOpacity
                  onPress={() => setIsNotificationCenterVisible(true)}
                  testID="open-notifications-center-btn"
                  style={styles.calendarLinkBtn}
                >
                  <Text style={styles.calendarLinkText}>🔔 {t('notifications.viewAll', 'View All')}</Text>
                </TouchableOpacity>
                <Badge label={String(recentNotifications.length)} variant="secondary" />
              </View>

              {recentNotifications.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    {t('dashboard.noNotifications', 'No recent notifications.')}
                  </Text>
                </Card>
              ) : (
                recentNotifications.map((notif: DashboardNotificationItem) => (
                  <Card key={`notif-${notif.id}`} style={styles.itemCard} testID={`notification-item-${notif.id}`}>
                    <View style={styles.itemTopRow}>
                      <Text style={styles.notifTitle} numberOfLines={1}>
                        {!notif.is_read ? '🔴 ' : ''}{notif.title}
                      </Text>
                      <Badge label={notif.category} variant="info" />
                    </View>
                    <Text style={styles.notifBody} numberOfLines={2}>
                      {notif.body}
                    </Text>
                    <View style={styles.itemBottomRow}>
                      <Text style={styles.timeText}>
                        🕒 {new Date(notif.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      {!notif.is_read ? <Badge label="NEW" variant="danger" /> : null}
                    </View>
                  </Card>
                ))
              )}
            </View>
          </>
        )}

        {/* System Health / API Probe Card */}
        <Card style={styles.healthCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('dashboard.status')}</Text>
            <Badge
              label={health ? 'CONNECTED' : isHealthLoading ? 'CHECKING' : 'OFFLINE'}
              variant={health ? 'success' : 'danger'}
            />
          </View>

          {health ? (
            <View style={styles.statusDetails}>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Service</Text>
                <Text style={styles.statusValue}>{health.service}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Version</Text>
                <Text style={styles.statusValue}>{health.version}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Database</Text>
                <Text style={styles.statusValue}>
                  {health.engine} ({health.database})
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.offlineBox}>
              <Text style={styles.offlineText}>
                {isHealthError ? t('dashboard.backendDisconnected') : 'Checking API status...'}
              </Text>
              <Button
                title={t('common.retry')}
                variant="outline"
                onPress={() => refetchHealth()}
                style={styles.retryBtn}
              />
            </View>
          )}
        </Card>

        {/* Auth / Profile Shortcut */}
        <Card style={styles.authCard}>
          <Text style={styles.authTitle}>Advocate Account</Text>
          <Text style={styles.authSubtitle}>
            Sign in with your Bar Council enrollment ID to access personalized cause lists
            and token alerts.
          </Text>
          <Button
            title={t('auth.login')}
            onPress={() => router.push('/(auth)/login')}
            style={styles.authButton}
            testID="dashboard-login-button"
          />
        </Card>
      </ScrollView>

      {/* Voice Assistant Search Modal */}
      <VoiceInputModal
        visible={isVoiceModalVisible}
        onClose={() => setIsVoiceModalVisible(false)}
        onApply={query => {
          setIsVoiceModalVisible(false);
          router.push({ pathname: '/cases', params: { search: query } });
        }}
        title={t('dashboard.voiceAssistant', 'Voice Case Search')}
      />

      {/* In-App Notification Center Modal */}
      {isNotificationCenterVisible && (
        <NotificationCenterModal
          visible={isNotificationCenterVisible}
          onClose={() => setIsNotificationCenterVisible(false)}
          testID="dashboard-notification-center-modal"
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  langPill: {
    backgroundColor: Colors.surfaceSubtle,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  langText: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },
  offlineBanner: {
    backgroundColor: '#78350F',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  offlineBannerText: {
    color: Colors.text.white,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  heroCard: {
    padding: 22,
    marginBottom: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  courtTitle: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroHeading: {
    color: Colors.text.primary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroSubtext: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  voiceRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  voiceButton: {
    flex: 1,
    paddingVertical: 10,
  },
  loadingCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  loadingText: {
    color: Colors.text.secondary,
    marginTop: 8,
    fontSize: 13,
  },
  errorCard: {
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    color: Colors.danger,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorSubtext: {
    color: Colors.text.secondary,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    marginHorizontal: -4,
    marginBottom: 10,
  },
  sectionContainer: {
    marginTop: 14,
    marginBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyCard: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
  },
  emptyText: {
    color: Colors.text.muted,
    fontSize: 13,
  },
  itemCard: {
    padding: 14,
    marginBottom: 8,
    backgroundColor: Colors.surface,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  caseNumber: {
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  partiesText: {
    color: Colors.text.secondary,
    fontSize: 13,
    marginBottom: 4,
  },
  judgeText: {
    color: Colors.text.muted,
    fontSize: 12,
    marginBottom: 6,
  },
  itemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  timeText: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  reminderTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  reminderCaseRef: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  notifTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  notifBody: {
    color: Colors.text.secondary,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 6,
  },
  healthCard: {
    marginTop: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  statusDetails: {
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statusLabel: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
  statusValue: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  offlineBox: {
    paddingVertical: 10,
  },
  offlineText: {
    color: Colors.text.muted,
    fontSize: 13,
    marginBottom: 10,
  },
  retryBtn: {
    paddingVertical: 8,
  },
  authCard: {
    marginTop: 14,
    padding: 18,
  },
  authTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  authSubtitle: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  authButton: {
    marginTop: 4,
  },
  calendarLinkBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calendarLinkText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primaryLight,
  },
});
