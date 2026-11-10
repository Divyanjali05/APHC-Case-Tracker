import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { AppIcon } from '../../components/common/AppIcon';
import { SkeletonCard } from '../../components/common/SkeletonCard';
import { ErrorState } from '../../components/common/ErrorState';
import { StatCard } from '../../components/dashboard/StatCard';
import { VoiceInputModal } from '../../components/speech/VoiceInputModal';
import { NotificationCenterModal } from '../../components/notifications/NotificationCenterModal';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { fetchHealthCheck } from '../../services/api/client';
import { speechService } from '../../services/speech/ttsService';
import { useDashboard } from '../../features/cases/hooks';
import { useAuth } from '../../features/auth/AuthContext';
import {
  DashboardActivityItem,
  DashboardHearingItem,
  DashboardNotificationItem,
  DashboardReminderItem,
} from '../../types';

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const isTablet = width >= 640 && width < 960;

  const { user } = useAuth();

  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);
  const [isNotificationCenterVisible, setIsNotificationCenterVisible] = useState(false);

  const {
    data: health,
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    const salutation =
      hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const name = user?.full_name?.trim() || user?.username?.trim();
    return name ? `${salutation}, ${name}` : `${salutation}, Advocate`;
  };

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
    let text = `${t('common.courtName', 'High Court of Andhra Pradesh')}. ${t(
      'dashboard.title',
      'APHC Case Tracker'
    )}.`;
    if (summary) {
      text += ` ${t('dashboard.totalCases', 'Total Cases')}: ${summary.total_cases}. ${t(
        'dashboard.pendingCases',
        'Pending'
      )}: ${summary.pending_cases}. ${t(
        'dashboard.todayHearings',
        "Today's Hearings"
      )}: ${dashboard?.today_hearings?.length ?? 0}.`;
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
  const recentActivity = dashboard?.recent_activity || [];
  const syncStatus = dashboard?.sync_status;
  const unreadCount = recentNotifications.filter(n => !n.is_read).length;

  return (
    <ScreenContainer testID="dashboard-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
          {/* Unified Practice Header & Personal Greeting Hero */}
          <Card style={styles.heroCard}>
            <View style={styles.topHeaderBar}>
              <View style={styles.brandRow}>
                <Badge label="APHC AMARAVATI" variant="gold" />
                <View style={styles.brandTextCol}>
                  <Text style={styles.courtIdentityText}>
                    {t('common.courtName', 'High Court of Andhra Pradesh')}
                  </Text>
                  <Text style={styles.appNameHeading}>
                    {t('common.appName', 'APHC Case Tracker')}
                  </Text>
                </View>
              </View>

              <View style={styles.headerControlsRow}>
                <TouchableOpacity
                  onPress={() => i18n.changeLanguage(nextLanguage())}
                  style={styles.langPill}
                  testID="dashboard-lang-toggle"
                  accessibilityRole="button"
                  accessibilityLabel={`Language selector: ${getLanguageLabel()}`}
                >
                  <AppIcon name="globe" size={14} color={Colors.primary} />
                  <Text style={styles.langText}>{getLanguageLabel()}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setIsNotificationCenterVisible(true)}
                  style={styles.notifIconButton}
                  testID="open-notifications-center-btn"
                  accessibilityRole="button"
                  accessibilityLabel={`Notifications: ${unreadCount} unread`}
                >
                  <AppIcon name="bell" size={20} color={Colors.text.primary} />
                  {unreadCount > 0 && <View style={styles.notifDotBadge} />}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.welcomeRow}>
              <View style={styles.welcomeInfoCol}>
                <Text style={styles.welcomeGreetingTitle}>{getGreeting()}</Text>
                <Text style={styles.welcomeDate}>
                  {new Date().toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              </View>

              {syncStatus ? (
                <View style={styles.syncStatusContainer}>
                  <Badge
                    label={
                      dashboard?.isDemoData
                        ? 'DEMO ENVIRONMENT'
                        : syncStatus.status === 'FRESH'
                          ? 'REGISTRY FRESH'
                          : syncStatus.status === 'STALE'
                            ? 'SYNC STALE'
                            : 'UNSYNCED'
                    }
                    variant={
                      dashboard?.isDemoData
                        ? 'warning'
                        : syncStatus.status === 'FRESH'
                          ? 'success'
                          : syncStatus.status === 'STALE'
                            ? 'warning'
                            : 'secondary'
                    }
                    testID="sync-status-badge"
                  />
                  {dashboard?.isDemoData ? (
                    <Text style={styles.syncTimeLabel}>Local Sample</Text>
                  ) : syncStatus.last_synced_at ? (
                    <Text style={styles.syncTimeLabel}>
                      Synced{' '}
                      {new Date(syncStatus.last_synced_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </Card>

          {/* Contextual Notices (Demo / Offline / Silent API Outage) */}
          {dashboard?.isDemoData ? (
            <View style={styles.demoBanner} testID="dashboard-demo-banner">
              <AppIcon name="info" size={18} color={Colors.accent} />
              <View style={styles.demoBannerTextCol}>
                <Text style={styles.demoBannerTitle}>
                  {t('dashboard.demoModeTitle', 'DEMO MODE — LOCAL SAMPLE DATA')}
                </Text>
                <Text style={styles.demoBannerSubtext}>
                  {t(
                    'dashboard.demoModeNotice',
                    'Displaying offline demonstration causelist data. Real advocate features require signing in with valid APHC Bar Council credentials.'
                  )}
                </Text>
              </View>
            </View>
          ) : dashboard?.isOfflineCached ? (
            <View style={styles.offlineBanner} testID="dashboard-offline-banner">
              <AppIcon name="lock" size={15} color={Colors.warning} />
              <Text style={styles.offlineBannerText}>
                {t('dashboard.offlineNotice', 'Displaying encrypted offline snapshot')}
                {dashboard.cachedAt
                  ? ` (${new Date(dashboard.cachedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })})`
                  : ''}
              </Text>
            </View>
          ) : isHealthError && !health ? (
            <View style={styles.healthWarningBanner} testID="dashboard-health-warning">
              <AppIcon name="alert-circle" size={16} color={Colors.danger} />
              <Text style={styles.healthWarningText}>
                {t(
                  'dashboard.backendDisconnected',
                  'Unable to reach server — showing available workspace data'
                )}
              </Text>
              <TouchableOpacity
                onPress={() => refetchHealth()}
                style={styles.healthRetryChip}
                accessibilityRole="button"
              >
                <Text style={styles.healthRetryText}>{t('common.retry', 'Retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Loading Skeleton / Error / Main Workspace Content */}
          {isDashboardLoading && !dashboard ? (
            <View style={styles.loadingWrap} testID="dashboard-loading-skeleton">
              <SkeletonCard variant="card" count={2} />
              <Text style={styles.loadingText}>{t('common.loading', 'Loading...')}</Text>
            </View>
          ) : isDashboardError && !dashboard ? (
            <ErrorState
              title="Failed to load dashboard data"
              message="Please check your network connection and try again."
              retryLabel={t('common.retry', 'Retry')}
              onRetry={() => refetchDashboard()}
              retryTestID="dashboard-retry-button"
              testID="dashboard-error-state"
            />
          ) : (
            <>
              {/* Practice Overview / KPI Grid */}
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <AppIcon name="activity" size={18} color={Colors.primary} />
                  <Text style={styles.sectionHeadingText}>
                    {t('dashboard.practiceOverview', 'My Cases Overview')}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.statsGridRow,
                  isDesktop
                    ? styles.statsGridDesktop
                    : isTablet
                      ? styles.statsGridTablet
                      : styles.statsGridMobile,
                ]}
              >
                <StatCard
                  title={t('dashboard.totalCases', 'Total Cases')}
                  value={summary.total_cases}
                  subtitle="Tracked matters"
                  valueColor={Colors.primary}
                  icon={<AppIcon name="briefcase" size={16} color={Colors.primary} />}
                  iconBgColor={Colors.surfaceBlue}
                  testID="stat-total-cases"
                  style={styles.statCardItem}
                  onPress={() => router.push('/cases')}
                />
                <StatCard
                  title={t('dashboard.pendingCases', 'Pending')}
                  value={summary.pending_cases}
                  subtitle="Active hearings"
                  valueColor={Colors.gold}
                  icon={<AppIcon name="clock" size={16} color={Colors.gold} />}
                  iconBgColor={Colors.goldSurface}
                  testID="stat-pending-cases"
                  style={styles.statCardItem}
                  onPress={() =>
                    router.push({ pathname: '/cases', params: { filter: 'UPCOMING' } })
                  }
                />
                <StatCard
                  title={t('dashboard.disposedCases', 'Disposed')}
                  value={summary.disposed_cases}
                  subtitle="Judgments entered"
                  valueColor={Colors.success}
                  icon={<AppIcon name="check-circle" size={16} color={Colors.success} />}
                  iconBgColor={Colors.successSurface}
                  testID="stat-disposed-cases"
                  style={styles.statCardItem}
                  onPress={() =>
                    router.push({
                      pathname: '/cases',
                      params: { filter: 'WITH_JUDGMENT' },
                    })
                  }
                />
                <StatCard
                  title={t('dashboard.adjournedCases', 'Adjourned')}
                  value={summary.adjourned_cases}
                  subtitle="Future dates"
                  valueColor={Colors.warning}
                  icon={
                    <AppIcon name="calendar-clock" size={16} color={Colors.warning} />
                  }
                  iconBgColor={Colors.warningSurface}
                  testID="stat-adjourned-cases"
                  style={styles.statCardItem}
                  onPress={() =>
                    router.push({ pathname: '/cases', params: { filter: 'ADJOURNED' } })
                  }
                />
              </View>

              {/* Unified Quick Workspace Tools & Live Court Display Board */}
              <Card style={styles.workspaceToolsCard}>
                <View style={styles.quickActionsHeader}>
                  <AppIcon name="clipboard-list" size={16} color={Colors.primary} />
                  <Text style={styles.quickActionsTitle}>Practice Tools</Text>
                </View>

                <View
                  style={[
                    styles.quickActionsGrid,
                    isDesktop && styles.quickActionsGridDesktop,
                  ]}
                >
                  <Button
                    title="Read Docket Summary"
                    variant="outline"
                    onPress={handleVoiceWelcome}
                    style={styles.actionBtn}
                    testID="voice-read-button"
                  />
                  <Button
                    title={t('dashboard.voiceAssistant', 'Voice Case Search')}
                    variant="secondary"
                    onPress={() => setIsVoiceModalVisible(true)}
                    style={styles.actionBtn}
                    testID="dashboard-voice-search-button"
                  />
                  <Button
                    title="My Cases"
                    variant="outline"
                    onPress={() => router.push('/cases')}
                    style={styles.actionBtn}
                  />
                  <Button
                    title="My Reminders"
                    variant="outline"
                    onPress={() => router.push('/(tabs)/reminders')}
                    style={styles.actionBtn}
                  />
                </View>

                <View style={styles.toolsDivider} />

                <View style={styles.tokensInlineRow} testID="dashboard-tokens-card">
                  <View style={styles.tokensIconTitleRow}>
                    <View style={styles.tokensNavIconWrap}>
                      <AppIcon name="landmark" size={18} color={Colors.primary} />
                    </View>
                    <View style={styles.tokensNavTitleContainer}>
                      <Text style={styles.tokensNavTitle}>
                        {t('tokens.title', 'Live Court Display Board & Tokens')}
                      </Text>
                      <Text style={styles.tokensNavSubtitle}>
                        Active court hall boards and appearance queue alerts
                      </Text>
                    </View>
                  </View>

                  <Button
                    title={t('tokens.openBoard', 'Open Live Display Board & Tokens')}
                    variant="outline"
                    onPress={() => router.push('/(tabs)/tokens')}
                    style={styles.tokensInlineButton}
                    testID="dashboard-tokens-action"
                  />
                </View>
              </Card>

              {/* Two-Column Hearings, Reminders, Notifications & Recent Activity */}
              <View style={[styles.columnsContainer, isDesktop && styles.columnsDesktop]}>
                <View style={[styles.columnItem, isDesktop && styles.leftColumnDesktop]}>
                  {/* Today's Scheduled Appearances */}
                  <View style={styles.sectionContainer} testID="today-hearings-section">
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionTitleWithBadge}>
                        <Text style={styles.sectionTitle}>
                          {t(
                            'dashboard.todayHearingsTitle',
                            "Today's Scheduled Appearances"
                          )}
                        </Text>
                        <Text style={styles.countChip}>{todayHearings.length}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => router.push('/calendar')}
                        testID="open-calendar-tab-btn"
                        style={styles.calendarLinkBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Open Calendar"
                      >
                        <AppIcon name="calendar" size={14} color={Colors.primary} />
                        <Text style={styles.calendarLinkText}>
                          {t('calendar.view_calendar', 'Calendar')}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {todayHearings.length === 0 ? (
                      <Card style={styles.emptyCard}>
                        <Text style={styles.emptyText}>
                          {t(
                            'dashboard.noHearingsToday',
                            'No hearings listed for today.'
                          )}
                        </Text>
                      </Card>
                    ) : (
                      todayHearings.map((h: DashboardHearingItem) => (
                        <TouchableOpacity
                          key={`today-${h.id}`}
                          activeOpacity={0.75}
                          onPress={() => router.push(`/cases/${h.case_id}`)}
                          testID={`today-hearing-item-${h.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Hearing for case ${h.case_number}`}
                        >
                          <Card style={[styles.hearingCard, styles.todayHearingCard]}>
                            <View style={styles.itemTopRow}>
                              <Text style={styles.caseNumber}>{h.case_number}</Text>
                              <View style={styles.neutralMetaGroup}>
                                {h.court_hall ? (
                                  <View style={styles.neutralMetaPill}>
                                    <Text style={styles.neutralMetaText}>
                                      Hall {h.court_hall}
                                    </Text>
                                  </View>
                                ) : null}
                                {h.item_number ? (
                                  <View style={styles.neutralMetaPill}>
                                    <Text style={styles.neutralMetaText}>
                                      Item #{h.item_number}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                            <Text style={styles.partiesText} numberOfLines={1}>
                              {h.petitioner} vs {h.respondent}
                            </Text>
                            {h.judge ? (
                              <View style={styles.metaIconRow}>
                                <AppIcon
                                  name="landmark"
                                  size={12}
                                  color={Colors.text.muted}
                                />
                                <Text style={styles.judgeText} numberOfLines={1}>
                                  {h.judge}
                                </Text>
                              </View>
                            ) : null}
                            <View style={styles.itemBottomRow}>
                              <View style={styles.metaIconRow}>
                                <AppIcon
                                  name="clock"
                                  size={12}
                                  color={Colors.text.muted}
                                />
                                <Text style={styles.timeText}>
                                  {h.hearing_time
                                    ? String(h.hearing_time).substring(0, 5)
                                    : '10:30 AM'}
                                </Text>
                              </View>
                              <Badge label={h.status} variant="primary" />
                            </View>
                          </Card>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>

                  {/* Upcoming Hearings */}
                  <View
                    style={styles.sectionContainer}
                    testID="upcoming-hearings-section"
                  >
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionTitleWithBadge}>
                        <Text style={styles.sectionTitle}>
                          {t('dashboard.upcomingHearingsTitle', 'Upcoming Hearings')}
                        </Text>
                        <Text style={styles.countChip}>{upcomingHearings.length}</Text>
                      </View>
                    </View>

                    {upcomingHearings.length === 0 ? (
                      <Card style={styles.emptyCard}>
                        <Text style={styles.emptyText}>
                          {t(
                            'dashboard.noUpcomingHearings',
                            'No upcoming hearings found.'
                          )}
                        </Text>
                      </Card>
                    ) : (
                      upcomingHearings.map((uh: DashboardHearingItem) => (
                        <TouchableOpacity
                          key={`upcoming-${uh.id}`}
                          activeOpacity={0.75}
                          onPress={() => router.push(`/cases/${uh.case_id}`)}
                          testID={`upcoming-hearing-item-${uh.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Upcoming hearing for ${uh.case_number}`}
                        >
                          <Card style={styles.hearingCard}>
                            <View style={styles.itemTopRow}>
                              <Text style={styles.caseNumber}>{uh.case_number}</Text>
                              <View style={styles.neutralMetaPill}>
                                <Text style={styles.neutralMetaText}>
                                  {uh.hearing_date}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.partiesText} numberOfLines={1}>
                              {uh.petitioner} vs {uh.respondent}
                            </Text>
                            <View style={styles.itemBottomRow}>
                              <Text style={styles.timeText}>
                                {uh.court_hall
                                  ? `Hall ${uh.court_hall}`
                                  : 'Court Hall TBD'}
                                {uh.item_number ? ` • Item #${uh.item_number}` : ''}
                              </Text>
                              <Badge label={uh.status} variant="info" />
                            </View>
                          </Card>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                </View>

                <View style={[styles.columnItem, isDesktop && styles.rightColumnDesktop]}>
                  {/* Compliance Reminders */}
                  <View
                    style={styles.sectionContainer}
                    testID="upcoming-reminders-section"
                  >
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionTitleWithBadge}>
                        <Text style={styles.sectionTitle}>
                          {t('dashboard.actionRemindersTitle', 'Compliance Reminders')}
                        </Text>
                        <Text style={styles.countChip}>{upcomingReminders.length}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => router.push('/(tabs)/reminders')}
                        testID="open-reminders-link-btn"
                        style={styles.calendarLinkBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Open Reminders"
                      >
                        <AppIcon name="bell-ring" size={14} color={Colors.primary} />
                        <Text style={styles.calendarLinkText}>View</Text>
                      </TouchableOpacity>
                    </View>

                    {upcomingReminders.length === 0 ? (
                      <Card style={styles.emptyCard}>
                        <Text style={styles.emptyText}>
                          {t('dashboard.noReminders', 'No pending reminders.')}
                        </Text>
                      </Card>
                    ) : (
                      upcomingReminders.map((rem: DashboardReminderItem) => (
                        <Card
                          key={`rem-${rem.id}`}
                          style={styles.hearingCard}
                          testID={`reminder-item-${rem.id}`}
                        >
                          <View style={styles.itemTopRow}>
                            <Text style={styles.reminderTitle} numberOfLines={1}>
                              {rem.title}
                            </Text>
                            <View style={styles.neutralMetaPill}>
                              <Text style={styles.neutralMetaText}>
                                {rem.reminder_type}
                              </Text>
                            </View>
                          </View>
                          {rem.case_number ? (
                            <Text style={styles.reminderCaseRef}>{rem.case_number}</Text>
                          ) : null}
                          <View style={styles.itemBottomRow}>
                            <View style={styles.metaIconRow}>
                              <AppIcon
                                name="calendar"
                                size={12}
                                color={Colors.text.muted}
                              />
                              <Text style={styles.timeText}>
                                Due: {new Date(rem.due_date).toLocaleDateString()}
                              </Text>
                            </View>
                            <Badge label={rem.status} variant="warning" />
                          </View>
                        </Card>
                      ))
                    )}
                  </View>

                  {/* Recent Notifications */}
                  <View
                    style={styles.sectionContainer}
                    testID="recent-notifications-section"
                  >
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionTitleWithBadge}>
                        <Text style={styles.sectionTitle}>
                          {t('dashboard.recentAlertsTitle', 'Recent Notifications')}
                        </Text>
                        <Text style={styles.countChip}>{recentNotifications.length}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setIsNotificationCenterVisible(true)}
                        testID="recent-notifications-view-all-btn"
                        style={styles.calendarLinkBtn}
                        accessibilityRole="button"
                        accessibilityLabel="View All Notifications"
                      >
                        <AppIcon name="bell" size={14} color={Colors.primary} />
                        <Text style={styles.calendarLinkText}>
                          {t('notifications.viewAll', 'View All')}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {recentNotifications.length === 0 ? (
                      <Card style={styles.emptyCard}>
                        <Text style={styles.emptyText}>
                          {t('dashboard.noNotifications', 'No recent notifications.')}
                        </Text>
                      </Card>
                    ) : (
                      recentNotifications.map((notif: DashboardNotificationItem) => (
                        <Card
                          key={`notif-${notif.id}`}
                          style={styles.hearingCard}
                          testID={`notification-item-${notif.id}`}
                        >
                          <View style={styles.itemTopRow}>
                            <View style={styles.notifTitleWrap}>
                              {!notif.is_read ? <View style={styles.unreadDot} /> : null}
                              <Text style={styles.notifTitle} numberOfLines={1}>
                                {notif.title}
                              </Text>
                            </View>
                            <Badge label={notif.category} variant="info" />
                          </View>
                          <Text style={styles.notifBody} numberOfLines={2}>
                            {notif.body}
                          </Text>
                          <View style={styles.itemBottomRow}>
                            <View style={styles.metaIconRow}>
                              <AppIcon name="clock" size={12} color={Colors.text.muted} />
                              <Text style={styles.timeText}>
                                {new Date(notif.sent_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </Text>
                            </View>
                          </View>
                        </Card>
                      ))
                    )}
                  </View>

                  {/* Recent Case Activity */}
                  <View style={styles.sectionContainer} testID="recent-activity-section">
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionTitleWithBadge}>
                        <Text style={styles.sectionTitle}>
                          {t('dashboard.recentActivityTitle', 'Recent Activity')}
                        </Text>
                        <Text style={styles.countChip}>{recentActivity.length}</Text>
                      </View>
                    </View>

                    {recentActivity.length === 0 ? (
                      <Card style={styles.emptyCard}>
                        <Text style={styles.emptyText}>
                          {t(
                            'dashboard.noRecentActivity',
                            'No recent docket activity recorded yet.'
                          )}
                        </Text>
                      </Card>
                    ) : (
                      <Card style={styles.activityListCard}>
                        {recentActivity.map((act: DashboardActivityItem, idx: number) => {
                          const isLast = idx === recentActivity.length - 1;
                          return (
                            <TouchableOpacity
                              key={`act-${act.id}`}
                              activeOpacity={0.75}
                              onPress={() => router.push(`/cases/${act.case_id}`)}
                              style={[
                                styles.activityRow,
                                isLast && styles.activityRowLast,
                              ]}
                              testID={`recent-activity-item-${act.id}`}
                              accessibilityRole="button"
                            >
                              <View style={styles.activityTopRow}>
                                <Text style={styles.activityCaseNum}>
                                  {act.case_number}
                                </Text>
                                <Text style={styles.activityTime}>
                                  {new Date(act.created_at).toLocaleDateString()}
                                </Text>
                              </View>
                              <Text style={styles.activityDesc} numberOfLines={2}>
                                {act.description}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </Card>
                    )}
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
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
    paddingBottom: Spacing.xxl,
  },
  mainWrapper: {
    width: '100%',
  },
  desktopContainer: {
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
  },
  heroCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.card,
    ...Shadows.card,
  },
  topHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 1,
  },
  brandTextCol: {
    justifyContent: 'center',
  },
  courtIdentityText: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  appNameHeading: {
    color: Colors.text.primary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceSubtle,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 44,
  },
  langText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  notifIconButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifDotBadge: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  heroDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  welcomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  welcomeInfoCol: {
    flex: 1,
    minWidth: 220,
  },
  welcomeGreetingTitle: {
    color: Colors.text.primary,
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  welcomeDate: {
    color: Colors.text.secondary,
    fontSize: 13,
    fontWeight: '500',
  },
  syncStatusContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  syncTimeLabel: {
    color: Colors.text.muted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.goldSurface,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.card,
    marginBottom: Spacing.md,
  },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.infoSurface,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.card,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  demoBannerTextCol: {
    flex: 1,
  },
  demoBannerTitle: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  demoBannerSubtext: {
    color: Colors.primaryLight,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  offlineBannerText: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  healthWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.dangerSurface,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.card,
    marginBottom: Spacing.md,
  },
  healthWarningText: {
    flex: 1,
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  healthRetryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
  },
  healthRetryText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingWrap: {
    marginBottom: Spacing.lg,
  },
  loadingText: {
    color: Colors.text.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: 2,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionHeadingText: {
    color: Colors.text.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  statsGridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.xs,
    marginBottom: Spacing.lg,
  },
  statsGridDesktop: {
    flexDirection: 'row',
  },
  statsGridTablet: {
    flexDirection: 'row',
  },
  statsGridMobile: {
    flexDirection: 'row',
  },
  statCardItem: {
    flex: 1,
    minWidth: 140,
    margin: Spacing.xs,
  },
  workspaceToolsCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.card,
    ...Shadows.subtle,
  },
  quickActionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  quickActionsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  quickActionsGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
  actionBtn: {
    flex: 1,
    minWidth: 145,
  },
  toolsDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  tokensInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  tokensIconTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 220,
    gap: Spacing.sm,
  },
  tokensNavIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.surfaceBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokensNavTitleContainer: {
    flex: 1,
  },
  tokensNavTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  tokensNavSubtitle: {
    color: Colors.text.muted,
    fontSize: 12,
    marginTop: 2,
  },
  tokensInlineButton: {
    borderColor: Colors.primary,
    minHeight: 42,
  },
  columnsContainer: {
    flexDirection: 'column',
    width: '100%',
  },
  columnsDesktop: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  columnItem: {
    width: '100%',
  },
  leftColumnDesktop: {
    flex: 6,
    width: 'auto',
  },
  rightColumnDesktop: {
    flex: 4,
    width: 'auto',
  },
  sectionContainer: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: 2,
  },
  sectionTitleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  countChip: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
    overflow: 'hidden',
  },
  calendarLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 40,
  },
  calendarLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  emptyCard: {
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.card,
    minHeight: 70,
  },
  emptyText: {
    color: Colors.text.muted,
    fontSize: 13,
  },
  hearingCard: {
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.card,
    ...Shadows.subtle,
  },
  todayHearingCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  neutralMetaGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  neutralMetaPill: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.badge,
  },
  neutralMetaText: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
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
  metaIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  judgeText: {
    color: Colors.text.muted,
    fontSize: 12,
    flex: 1,
  },
  itemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
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
    marginRight: Spacing.sm,
  },
  reminderCaseRef: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  notifTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.sm,
    gap: Spacing.xs,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  notifTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  notifBody: {
    color: Colors.text.secondary,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 6,
  },
  activityListCard: {
    padding: 0,
    overflow: 'hidden',
    borderRadius: Radius.card,
    borderColor: Colors.border,
    borderWidth: 1,
    backgroundColor: Colors.surface,
    ...Shadows.subtle,
  },
  activityRow: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  activityRowLast: {
    borderBottomWidth: 0,
  },
  activityTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  activityCaseNum: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  activityTime: {
    fontSize: 12,
    color: Colors.text.muted,
  },
  activityDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
});
