import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { AppIcon } from '../../components/common/AppIcon';
import { SkeletonCard } from '../../components/common/SkeletonCard';
import { ErrorState } from '../../components/common/ErrorState';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useToast } from '../../components/common/Toast';
import { StatCard } from '../../components/dashboard/StatCard';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { useAdminDashboard } from '../../features/admin/hooks';
import { useAuth } from '../../features/auth/AuthContext';
import { pushNotificationService } from '../../services/notifications/pushService';
import { AdminAuditLogItem } from '../../types';

const formatAuditAction = (action: string): string =>
  action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, ch => ch.toUpperCase());

export default function AdminDashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const isTablet = width >= 640 && width < 960;

  const { user, isSuperuser, signOut } = useAuth();
  const { showToast } = useToast();

  const {
    data: dashboard,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useAdminDashboard();

  const [isLogoutDialogVisible, setIsLogoutDialogVisible] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleConfirmSignOut = async () => {
    setIsSigningOut(true);
    try {
      await pushNotificationService.deactivatePushNotifications().catch(() => {});
      await signOut();
      setIsLogoutDialogVisible(false);
      showToast(t('more.signedOutNotice', 'Signed out securely.'), 'info');
      router.replace('/');
    } finally {
      setIsSigningOut(false);
    }
  };

  const stats = dashboard?.stats;
  const overview = dashboard?.system_overview;
  const recentActivity = dashboard?.recent_activity || [];
  const isDbHealthy = overview?.database_status === 'healthy';

  return (
    <ScreenContainer testID="admin-dashboard-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
          {/* Streamlined Admin Header Banner */}
          <Card style={styles.heroCard} testID="admin-hero-card">
            <View style={styles.heroTopUtilityRow}>
              <Badge
                label={
                  isSuperuser
                    ? t('admin.superuserBadge', 'SUPERUSER ADMIN')
                    : t('admin.staffBadge', 'STAFF ADMIN')
                }
                variant="gold"
                testID="admin-privilege-badge"
              />
              <View style={styles.utilityControlsRow}>
                <TouchableOpacity
                  style={styles.utilityPillBtn}
                  onPress={() => router.push('/(tabs)')}
                  testID="admin-nav-advocate-view"
                  accessibilityRole="button"
                  accessibilityLabel={t('admin.advocateView', 'Advocate Workspace')}
                >
                  <AppIcon name="briefcase" size={14} color={Colors.primary} />
                  <Text style={styles.utilityPillText}>
                    {t('admin.advocateView', 'Advocate View')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.utilityPillBtn, styles.utilityLogoutBtn]}
                  onPress={() => setIsLogoutDialogVisible(true)}
                  testID="admin-logout-button"
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.logout', 'Sign Out')}
                >
                  <AppIcon name="log-out" size={14} color={Colors.danger} />
                  <Text style={styles.utilityLogoutText}>
                    {t('settings.logout', 'Sign Out')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.heroTitleBlock}>
              <Text style={styles.heroTitle}>
                {t('admin.homeHeading', 'Administration Console')}
              </Text>
              <Text style={styles.heroSubtitle}>
                {user?.full_name || user?.username || 'Administrator'} •{' '}
                {t(
                  'admin.homeSubheading',
                  'Manage advocate accounts, approvals, roles, and case assignments'
                )}
              </Text>
            </View>

            {/* Primary Governance Actions */}
            <View style={[styles.navGrid, isDesktop && styles.navGridDesktop]}>
              <Button
                title={t('admin.manageUsers', 'Manage Users')}
                variant="primary"
                onPress={() => router.push('/admin/users')}
                style={styles.navBtn}
                testID="admin-nav-users"
              />
              <Button
                title={t('admin.assignCases', 'Assign Cases')}
                variant="outline"
                onPress={() => router.push('/admin/cases')}
                style={styles.navBtn}
                testID="admin-nav-cases"
              />
            </View>
          </Card>

          {/* Governance & Data Isolation Notice */}
          <View style={styles.securityNoticeBanner} testID="admin-security-notice">
            <AppIcon name="lock" size={16} color={Colors.primary} />
            <Text style={styles.securityNoticeText}>
              {t(
                'admin.securityNotice',
                'Data Isolation Policy: Administrative oversight covers accounts and docket assignments only. Private advocate notes, documents, and voice memos remain protected by object-level permissions.'
              )}
            </Text>
          </View>

          {isLoading && !dashboard ? (
            <View testID="admin-dashboard-loading">
              <SkeletonCard variant="card" count={2} />
            </View>
          ) : isError && !dashboard ? (
            <ErrorState
              title={t('admin.loadErrorTitle', 'Failed to load administration console')}
              message={t(
                'admin.loadErrorMessage',
                'Verify your administrator permissions and network connection, then retry.'
              )}
              retryLabel={t('common.retry', 'Retry')}
              onRetry={() => refetch()}
              testID="admin-dashboard-error"
              retryTestID="admin-dashboard-retry"
            />
          ) : stats ? (
            <>
              {/* Account & Practice KPI Grid */}
              <View style={styles.sectionHeaderRow}>
                <AppIcon name="users" size={17} color={Colors.primary} />
                <Text style={styles.sectionTitle}>
                  {t('admin.accountsCasesOverview', 'Accounts & Docket Metrics')}
                </Text>
              </View>

              <View
                style={[
                  styles.statsGrid,
                  isDesktop
                    ? styles.statsGridDesktop
                    : isTablet
                      ? styles.statsGridTablet
                      : styles.statsGridMobile,
                ]}
              >
                <StatCard
                  title={t('admin.totalAdvocates', 'Total Advocates')}
                  value={stats.total_advocates}
                  subtitle={`${stats.total_admins} active admins`}
                  valueColor={Colors.primary}
                  icon={<AppIcon name="users" size={16} color={Colors.primary} />}
                  iconBgColor={Colors.surfaceBlue}
                  style={styles.statCardItem}
                  testID="admin-stat-total-advocates"
                  onPress={() =>
                    router.push({
                      pathname: '/admin/users',
                      params: { role: 'ADVOCATE' },
                    })
                  }
                />
                <StatCard
                  title={t('admin.activeAccounts', 'Active Accounts')}
                  value={stats.active_advocates}
                  subtitle={t('admin.verifiedActive', 'Authorized to sign in')}
                  valueColor={Colors.success}
                  icon={<AppIcon name="user-check" size={16} color={Colors.success} />}
                  iconBgColor={Colors.successSurface}
                  style={styles.statCardItem}
                  testID="admin-stat-active-accounts"
                  onPress={() =>
                    router.push({
                      pathname: '/admin/users',
                      params: { status: 'active' },
                    })
                  }
                />
                <StatCard
                  title={t('admin.inactiveAccounts', 'Inactive Accounts')}
                  value={stats.inactive_advocates}
                  subtitle={t('admin.deactivatedSuspended', 'Disabled / suspended')}
                  valueColor={Colors.danger}
                  icon={<AppIcon name="user-x" size={16} color={Colors.danger} />}
                  iconBgColor={Colors.dangerSurface}
                  style={styles.statCardItem}
                  testID="admin-stat-inactive-accounts"
                  onPress={() =>
                    router.push({
                      pathname: '/admin/users',
                      params: { status: 'inactive' },
                    })
                  }
                />
                <StatCard
                  title={t('admin.pendingApprovals', 'Pending Approvals')}
                  value={stats.pending_approvals}
                  subtitle={t('admin.awaitingVerification', 'Unverified profiles')}
                  valueColor={Colors.gold}
                  icon={<AppIcon name="clock" size={16} color={Colors.gold} />}
                  iconBgColor={Colors.goldSurface}
                  style={styles.statCardItem}
                  testID="admin-stat-pending-approvals"
                  onPress={() =>
                    router.push({
                      pathname: '/admin/users',
                      params: { status: 'pending' },
                    })
                  }
                />
                <StatCard
                  title={t('admin.totalCases', 'Total Cases')}
                  value={stats.total_cases}
                  subtitle={t('admin.registeredDockets', 'Registered in system')}
                  valueColor={Colors.primary}
                  icon={<AppIcon name="briefcase" size={16} color={Colors.primary} />}
                  iconBgColor={Colors.surfaceBlue}
                  style={styles.statCardItem}
                  testID="admin-stat-total-cases"
                  onPress={() => router.push('/admin/cases')}
                />
                <StatCard
                  title={t('admin.assignedCases', 'Assigned Cases')}
                  value={stats.assigned_cases}
                  subtitle={`${stats.unassigned_cases} ${t(
                    'admin.unassignedLabel',
                    'unassigned'
                  )}`}
                  valueColor={Colors.accent}
                  icon={
                    <AppIcon name="clipboard-check" size={16} color={Colors.accent} />
                  }
                  iconBgColor={Colors.infoSurface}
                  style={styles.statCardItem}
                  testID="admin-stat-assigned-cases"
                  onPress={() =>
                    router.push({
                      pathname: '/admin/cases',
                      params: { assignment: 'unassigned' },
                    })
                  }
                />
              </View>

              {/* System Health Overview */}
              {overview ? (
                <Card style={styles.overviewCard} testID="admin-system-overview">
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.sectionTitleRow}>
                      <AppIcon name="server" size={17} color={Colors.primary} />
                      <Text style={styles.cardTitle}>
                        {t('admin.systemOverviewTitle', 'System Health & Overview')}
                      </Text>
                    </View>
                    <Badge
                      label={
                        isDbHealthy
                          ? 'DB HEALTHY'
                          : overview.database_status.toUpperCase()
                      }
                      variant={isDbHealthy ? 'success' : 'danger'}
                      testID="admin-db-status-badge"
                    />
                  </View>

                  <View style={styles.overviewGrid}>
                    <View style={styles.overviewItem}>
                      <Text style={styles.overviewLabel}>
                        {t('admin.databaseEngine', 'Database Engine')}
                      </Text>
                      <Text style={styles.overviewValue}>
                        {overview.database_engine || 'postgresql'}
                      </Text>
                    </View>
                    <View style={styles.overviewItem}>
                      <Text style={styles.overviewLabel}>
                        {t('admin.totalAssignments', 'Assignment Events')}
                      </Text>
                      <Text style={styles.overviewValue}>
                        {overview.total_assignments}
                      </Text>
                    </View>
                    <View style={styles.overviewItem}>
                      <Text style={styles.overviewLabel}>
                        {t('admin.auditEntries', 'Audit Log Entries')}
                      </Text>
                      <Text style={styles.overviewValue}>{overview.audit_log_count}</Text>
                    </View>
                    <View style={styles.overviewItem}>
                      <Text style={styles.overviewLabel}>
                        {t('admin.recentRegistrations', 'New Accounts (7d)')}
                      </Text>
                      <Text style={styles.overviewValue}>
                        {overview.recent_registrations_7d}
                      </Text>
                    </View>
                  </View>
                </Card>
              ) : null}

              {/* Recent Administrative Activity */}
              <View style={styles.sectionHeaderRow}>
                <AppIcon name="activity" size={17} color={Colors.primary} />
                <Text style={styles.sectionTitle}>
                  {t('admin.recentActivityTitle', 'Recent Administrative Activity')}
                </Text>
              </View>

              {recentActivity.length === 0 ? (
                <Card style={styles.emptyActivityCard} testID="admin-recent-activity">
                  <EmptyState
                    title={t('admin.noRecentActivity', 'No Administrative Activity Yet')}
                    description={t(
                      'admin.noRecentActivityDesc',
                      'Account creations, role changes, and case assignment actions are audited here without storing secrets.'
                    )}
                    icon={
                      <AppIcon
                        name="clipboard-list"
                        size={28}
                        color={Colors.text.muted}
                      />
                    }
                  />
                </Card>
              ) : (
                <Card style={styles.activityListCard} testID="admin-recent-activity">
                  {recentActivity.map((item: AdminAuditLogItem, idx: number) => {
                    const isLast = idx === recentActivity.length - 1;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.auditRow, isLast && styles.auditRowLast]}
                        activeOpacity={item.target_user || item.target_case ? 0.75 : 1}
                        disabled={!item.target_user && !item.target_case}
                        onPress={() => {
                          if (item.target_user) {
                            router.push(`/admin/users/${item.target_user}`);
                          } else if (item.target_case) {
                            router.push('/admin/cases');
                          }
                        }}
                        testID={`admin-audit-item-${item.id}`}
                      >
                        <View style={styles.auditTopRow}>
                          <Badge
                            label={formatAuditAction(item.action)}
                            variant={
                              item.action.includes('DEACTIVATED')
                                ? 'danger'
                                : item.action.includes('ADMIN')
                                  ? 'gold'
                                  : 'primary'
                            }
                          />
                          <Text style={styles.auditTimestamp}>
                            {new Date(item.created_at).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </View>
                        <Text style={styles.auditSummary}>{item.summary}</Text>
                        <View style={styles.auditMetaRow}>
                          <Text style={styles.auditMetaText}>
                            By: {item.actor_name || item.actor_username || 'System'}
                          </Text>
                          {item.target_case_number ? (
                            <Text style={styles.auditTargetChip}>
                              {item.target_case_number}
                            </Text>
                          ) : item.target_username ? (
                            <Text style={styles.auditTargetChip}>
                              @{item.target_username}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </Card>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={isLogoutDialogVisible}
        title={t('settings.logout', 'Sign Out')}
        message={t(
          'more.logoutConfirmMessage',
          'Are you sure you want to end your current session on this device?'
        )}
        confirmLabel={t('settings.logout', 'Sign Out')}
        cancelLabel={t('common.cancel', 'Cancel')}
        destructive
        loading={isSigningOut}
        iconName="log-out"
        onConfirm={handleConfirmSignOut}
        onCancel={() => setIsLogoutDialogVisible(false)}
        testID="admin-logout-confirm"
      />
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
    maxWidth: 1120,
    alignSelf: 'center',
  },
  heroCard: {
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderRadius: Radius.card,
    borderColor: Colors.border,
    borderWidth: 1,
    backgroundColor: Colors.surface,
    ...Shadows.card,
  },
  heroTopUtilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  utilityControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  utilityPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 38,
    borderRadius: Radius.button,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  utilityPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  utilityLogoutBtn: {
    backgroundColor: Colors.dangerSurface,
    borderColor: Colors.dangerBorder,
  },
  utilityLogoutText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.danger,
  },
  heroTitleBlock: {
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text.secondary,
  },
  navGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  navGridDesktop: {
    flexWrap: 'nowrap',
  },
  navBtn: {
    flex: 1,
    minWidth: 148,
    minHeight: 46,
    paddingHorizontal: Spacing.md,
  },
  securityNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.infoSurface,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
    borderRadius: Radius.card,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  securityNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statsGridMobile: {
    justifyContent: 'space-between',
  },
  statsGridTablet: {
    justifyContent: 'flex-start',
  },
  statsGridDesktop: {
    justifyContent: 'flex-start',
  },
  statCardItem: {
    minWidth: 148,
    marginBottom: 0,
  },
  overviewCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadows.subtle,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  overviewItem: {
    flexGrow: 1,
    minWidth: 135,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.button,
    padding: Spacing.md,
  },
  overviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  overviewValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  emptyActivityCard: {
    padding: Spacing.md,
  },
  activityListCard: {
    padding: 0,
    overflow: 'hidden',
  },
  auditRow: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  auditRowLast: {
    borderBottomWidth: 0,
  },
  auditTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  auditTimestamp: {
    fontSize: 12,
    color: Colors.text.muted,
    fontWeight: '500',
  },
  auditSummary: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  auditMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  auditMetaText: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  auditTargetChip: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    backgroundColor: Colors.surfaceBlue,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.badge,
  },
});
