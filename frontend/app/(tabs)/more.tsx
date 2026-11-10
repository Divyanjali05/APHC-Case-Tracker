import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { AppIcon, AppIconName } from '../../components/common/AppIcon';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useToast } from '../../components/common/Toast';
import { NotificationCenterModal } from '../../components/notifications/NotificationCenterModal';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { useAuth } from '../../features/auth/AuthContext';
import { pushNotificationService } from '../../services/notifications/pushService';

interface MenuItemProps {
  icon: AppIconName;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID: string;
  isLast?: boolean;
}

const MenuRow: React.FC<MenuItemProps> = ({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  onPress,
  testID,
  isLast = false,
}) => (
  <TouchableOpacity
    style={[styles.menuRow, isLast && styles.menuRowLast]}
    onPress={onPress}
    testID={testID}
    accessibilityRole="button"
    accessibilityLabel={title}
    activeOpacity={0.75}
  >
    <View style={[styles.menuIconWrap, { backgroundColor: iconBg }]}>
      <AppIcon name={icon} size={18} color={iconColor} />
    </View>
    <View style={styles.menuTextCol}>
      <Text style={styles.menuTitle}>{title}</Text>
      <Text style={styles.menuSubtitle}>{subtitle}</Text>
    </View>
    <AppIcon name="chevron-right" size={18} color={Colors.text.muted} />
  </TouchableOpacity>
);

export default function MoreScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;

  const { user, role, isAdmin, isAuthenticated, isDemo, signOut } = useAuth();
  const { showToast } = useToast();

  const [isNotifModalVisible, setIsNotifModalVisible] = useState(false);
  const [isLogoutConfirmVisible, setIsLogoutConfirmVisible] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName =
    user?.full_name ||
    user?.username ||
    (isDemo
      ? t('more.demoUser', 'Demo Advocate')
      : t('more.defaultAdvocate', 'Advocate'));

  const enrollmentId =
    user?.profile?.bar_council_enrollment_number ||
    user?.username ||
    (isDemo ? 'DEMO-APHC' : '—');

  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(p => p[0]?.toUpperCase() || '')
      .join('') || 'AP';

  const handleLanguageChange = (langCode: 'en' | 'te' | 'hi', label: string) => {
    i18n.changeLanguage(langCode);
    showToast(t('more.languageUpdated', `Language switched to ${label}`), 'info');
  };

  const handleConfirmSignOut = async () => {
    setIsSigningOut(true);
    try {
      await pushNotificationService.deactivatePushNotifications().catch(() => {});
      await signOut();
      setIsLogoutConfirmVisible(false);
      showToast(t('more.signedOutNotice', 'Signed out securely.'), 'info');
      router.replace('/');
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <ScreenContainer testID="more-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
          {/* Profile Summary Card */}
          <Card style={styles.profileCard} testID="more-profile-card">
            <View style={styles.profileTopRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
              <View style={styles.profileIdentity}>
                <Text style={styles.profileName}>{displayName}</Text>
                <Text style={styles.profileIdentifier}>{enrollmentId}</Text>
                {user?.email ? (
                  <Text style={styles.profileEmail}>{user.email}</Text>
                ) : null}
              </View>
              <View style={styles.roleBadgesCol}>
                <Badge
                  label={isDemo ? 'DEMO' : role}
                  variant={isAdmin ? 'gold' : 'primary'}
                  testID="more-role-badge"
                />
                {user?.profile?.is_verified ? (
                  <Badge label="VERIFIED" variant="success" />
                ) : null}
              </View>
            </View>

            <View style={styles.profileActionsRow}>
              {isAuthenticated ? (
                <Button
                  title={t('more.viewEditProfile', 'View & Edit Profile')}
                  variant="outline"
                  onPress={() => router.push('/(tabs)/settings')}
                  style={styles.profileBtn}
                  testID="more-edit-profile-btn"
                />
              ) : (
                <Button
                  title={t('auth.login', 'Sign In')}
                  variant="primary"
                  onPress={() => router.push('/(auth)/login')}
                  style={styles.profileBtn}
                  testID="more-signin-btn"
                />
              )}
            </View>
          </Card>

          {/* Admin Console Access (Strictly for Admin role, non-demo) */}
          {isAdmin && !isDemo ? (
            <Card style={styles.adminCard} testID="more-admin-card">
              <View style={styles.adminHeaderRow}>
                <View style={styles.adminIconWrap}>
                  <AppIcon name="shield-check" size={20} color={Colors.gold} />
                </View>
                <View style={styles.adminHeaderText}>
                  <Text style={styles.adminTitle}>
                    {t('admin.workspaceTitle', 'Administration Console')}
                  </Text>
                  <Text style={styles.adminSubtitle}>
                    {t(
                      'admin.workspaceSubtitle',
                      'Manage advocate accounts, approvals, roles, and case assignments.'
                    )}
                  </Text>
                </View>
              </View>
              <Button
                title={t('admin.openWorkspace', 'Open Admin Workspace')}
                variant="primary"
                onPress={() => router.push('/admin')}
                testID="more-admin-workspace-button"
              />
            </Card>
          ) : null}

          {/* Legal Practice Tools */}
          <Text style={styles.sectionLabel}>
            {t('more.practiceTools', 'Practice Tools')}
          </Text>
          <Card style={styles.groupCard}>
            <MenuRow
              icon="bell-ring"
              iconBg={Colors.warningSurface}
              iconColor={Colors.warning}
              title={t('tabs.reminders', 'Reminders & Hearings')}
              subtitle={t(
                'more.remindersSubtitle',
                'Upcoming appearances, compliance tasks & alert schedule'
              )}
              onPress={() => router.push('/(tabs)/reminders')}
              testID="more-nav-reminders"
            />
            <MenuRow
              icon="radio"
              iconBg={Colors.goldSurface}
              iconColor={Colors.gold}
              title={t('tabs.tokens', 'Live Court Tokens')}
              subtitle={t(
                'more.tokensSubtitle',
                'Active court hall boards and appearance queue alerts'
              )}
              onPress={() => router.push('/(tabs)/tokens')}
              testID="more-nav-tokens"
            />
            <MenuRow
              icon="bell"
              iconBg={Colors.surfaceBlue}
              iconColor={Colors.primary}
              title={t('notifications.title', 'Notifications & Alerts')}
              subtitle={t(
                'more.notificationsSubtitle',
                'View courtroom, hearing, and registry alert history'
              )}
              onPress={() => setIsNotifModalVisible(true)}
              testID="more-nav-notifications"
              isLast
            />
          </Card>

          {/* Preferences & Security */}
          <Text style={styles.sectionLabel}>
            {t('more.preferencesSecurity', 'Preferences & Account')}
          </Text>
          <Card style={styles.groupCard}>
            <MenuRow
              icon="settings"
              iconBg={Colors.surfaceSubtle}
              iconColor={Colors.primary}
              title={t('tabs.settings', 'Profile & Settings')}
              subtitle={t(
                'more.settingsSubtitle',
                'Chamber details, voice alerts, DPDP privacy & compliance'
              )}
              onPress={() => router.push('/(tabs)/settings')}
              testID="more-nav-settings"
              isLast
            />
          </Card>

          {/* Quick Language Selector */}
          <Text style={styles.sectionLabel}>{t('common.language', 'Language')}</Text>
          <Card style={styles.langCard}>
            <View style={styles.langHeader}>
              <AppIcon name="globe" size={16} color={Colors.primary} />
              <Text style={styles.langTitle}>
                {t('settings.language', 'Select Language')}
              </Text>
            </View>
            <View style={styles.langPillRow}>
              {[
                { code: 'en' as const, label: 'English' },
                { code: 'te' as const, label: 'తెలుగు' },
                { code: 'hi' as const, label: 'हिन्दी' },
              ].map(item => {
                const selected = i18n.language === item.code;
                return (
                  <TouchableOpacity
                    key={item.code}
                    style={[styles.langPill, selected && styles.langPillActive]}
                    onPress={() => handleLanguageChange(item.code, item.label)}
                    testID={`more-lang-${item.code}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[styles.langPillText, selected && styles.langPillTextActive]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>

          {/* Sign Out Action */}
          <Button
            title={
              isDemo && !isAuthenticated
                ? t('more.exitDemo', 'Exit Sample Mode')
                : t('settings.logout', 'Sign Out')
            }
            variant="outline"
            onPress={() => setIsLogoutConfirmVisible(true)}
            style={styles.logoutBtn}
            testID="more-logout-button"
          />
        </View>
      </ScrollView>

      {/* Notification Center Modal */}
      {isNotifModalVisible ? (
        <NotificationCenterModal
          visible={isNotifModalVisible}
          onClose={() => setIsNotifModalVisible(false)}
          testID="more-notification-center-modal"
        />
      ) : null}

      {/* Sign Out Confirmation */}
      <ConfirmDialog
        visible={isLogoutConfirmVisible}
        title={
          isDemo && !isAuthenticated
            ? t('more.exitDemo', 'Exit Sample Mode')
            : t('settings.logout', 'Sign Out')
        }
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
        onCancel={() => setIsLogoutConfirmVisible(false)}
        testID="more-logout-confirm"
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
    maxWidth: 920,
    alignSelf: 'center',
  },
  profileCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadows.card,
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: Colors.text.white,
    fontSize: 16,
    fontWeight: '800',
  },
  profileIdentity: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  profileIdentifier: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 2,
  },
  profileEmail: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: 2,
  },
  roleBadgesCol: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  profileActionsRow: {
    flexDirection: 'row',
  },
  profileBtn: {
    flex: 1,
  },
  adminCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
    backgroundColor: Colors.surface,
    ...Shadows.subtle,
  },
  adminHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  adminIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminHeaderText: {
    flex: 1,
  },
  adminTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  adminSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.text.secondary,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginLeft: 2,
  },
  groupCard: {
    padding: 0,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadows.subtle,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextCol: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 16,
  },
  langCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadows.subtle,
  },
  langHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  langTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  langPillRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  langPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  langPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  langPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  langPillTextActive: {
    color: Colors.text.white,
    fontWeight: '700',
  },
  logoutBtn: {
    marginTop: Spacing.xs,
    borderColor: Colors.dangerBorder,
  },
});
