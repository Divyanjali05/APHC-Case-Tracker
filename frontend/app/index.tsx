import React, { useEffect } from 'react';
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
import { ScreenContainer } from '../components/common/ScreenContainer';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { AppIcon } from '../components/common/AppIcon';
import { Colors } from '../constants/colors';
import { Radius, Shadows, Spacing } from '../constants/theme';
import { useAuth } from '../features/auth/AuthContext';

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const { isAuthenticated, isDemo, isLoading, role, enterDemoMode } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace(role === 'ADMIN' ? '/admin' : '/(tabs)');
    } else if (isDemo) {
      router.replace('/(tabs)');
    }
  }, [isLoading, isAuthenticated, isDemo, role, router]);

  return (
    <ScreenContainer testID="welcome-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pageWrapper, isWide && styles.pageWrapperWide]}>
          {/* Top Brand & Crest */}
          <View style={styles.brandHeader}>
            <View style={styles.logoCrest} testID="welcome-logo">
              <AppIcon name="scale" size={28} color={Colors.text.white} />
            </View>
            <View style={styles.brandTextWrap}>
              <Text style={styles.appTitle}>
                {t('common.appName', 'APHC Case Tracker')}
              </Text>
              <Text style={styles.courtTagline}>
                {t('common.courtName', 'High Court of Andhra Pradesh')}
              </Text>
            </View>
          </View>

          {/* Hero Section */}
          <View style={[styles.heroGrid, isWide && styles.heroGridWide]}>
            <View style={[styles.heroMain, isWide && styles.heroMainWide]}>
              <Badge
                label={t('welcome.badge', 'LEGAL PRACTICE WORKSPACE')}
                variant="gold"
                style={styles.heroBadge}
              />
              <Text style={styles.heroHeadline}>
                {t(
                  'welcome.headline',
                  'Precision Case Management for High Court Advocates'
                )}
              </Text>
              <Text style={styles.heroDescription}>
                {t(
                  'welcome.description',
                  'Manage your assigned dockets, daily cause lists, hearing calendars, live court tokens, and confidential preparation notes in an isolated, role-protected workspace.'
                )}
              </Text>

              <View style={styles.ctaGroup}>
                <Button
                  title={t('welcome.signInCta', 'Sign In to Your Account')}
                  variant="primary"
                  onPress={() => router.push('/(auth)/login')}
                  style={styles.primaryCta}
                  testID="welcome-signin-button"
                />

                <TouchableOpacity
                  onPress={() => router.push('/(auth)/forgot-password')}
                  style={styles.recoveryLink}
                  accessibilityRole="link"
                  testID="welcome-forgot-link"
                >
                  <AppIcon name="key" size={14} color={Colors.primary} />
                  <Text style={styles.recoveryLinkText}>
                    {t('auth.forgotPassword', 'Forgot Password?')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Subtle Legal Visual Card */}
            <Card
              style={[styles.visualCard, isWide && styles.visualCardWide]}
              testID="welcome-legal-visual"
            >
              <View style={styles.visualHeader}>
                <View style={styles.visualIconBadge}>
                  <AppIcon name="landmark" size={20} color={Colors.primary} />
                </View>
                <View style={styles.visualHeaderText}>
                  <Text style={styles.visualTitle}>
                    {t('welcome.visualTitle', 'Digital Chambers')}
                  </Text>
                  <Text style={styles.visualSubtitle}>
                    {t('welcome.visualSubtitle', 'Amaravati • Role-Verified Access')}
                  </Text>
                </View>
              </View>

              <View style={styles.pillarList}>
                <View style={styles.pillarRow}>
                  <View style={styles.pillarIcon}>
                    <AppIcon name="shield-check" size={18} color={Colors.success} />
                  </View>
                  <View style={styles.pillarCopy}>
                    <Text style={styles.pillarTitle}>
                      {t('welcome.pillar1Title', 'Strict Data Isolation')}
                    </Text>
                    <Text style={styles.pillarDesc}>
                      {t(
                        'welcome.pillar1Desc',
                        'Each advocate accesses only their assigned cases, private notes, and voice memos.'
                      )}
                    </Text>
                  </View>
                </View>

                <View style={styles.pillarRow}>
                  <View style={styles.pillarIcon}>
                    <AppIcon name="calendar-clock" size={18} color={Colors.accent} />
                  </View>
                  <View style={styles.pillarCopy}>
                    <Text style={styles.pillarTitle}>
                      {t('welcome.pillar2Title', 'Cause List & Calendar Sync')}
                    </Text>
                    <Text style={styles.pillarDesc}>
                      {t(
                        'welcome.pillar2Desc',
                        'Track hearings across Day, Week, and Month views with automated reminders.'
                      )}
                    </Text>
                  </View>
                </View>

                <View style={[styles.pillarRow, styles.pillarRowLast]}>
                  <View style={styles.pillarIcon}>
                    <AppIcon name="user-cog" size={18} color={Colors.gold} />
                  </View>
                  <View style={styles.pillarCopy}>
                    <Text style={styles.pillarTitle}>
                      {t('welcome.pillar3Title', 'Controlled Administration')}
                    </Text>
                    <Text style={styles.pillarDesc}>
                      {t(
                        'welcome.pillar3Desc',
                        'Dedicated admin oversight for advocate onboarding and case assignments.'
                      )}
                    </Text>
                  </View>
                </View>
              </View>
            </Card>
          </View>

          {/* Optional Demo Mode button when enabled via env/dev */}
          {(__DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEMO === 'true') && (
            <View style={styles.demoRow}>
              <TouchableOpacity
                onPress={async () => {
                  await enterDemoMode();
                  router.replace('/(tabs)');
                }}
                style={styles.demoButton}
                testID="welcome-demo-button"
                accessibilityRole="button"
              >
                <AppIcon name="play" size={14} color={Colors.text.secondary} />
                <Text style={styles.demoText}>
                  {t('welcome.previewDemo', 'Preview Local Sample Mode')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Minimal Footer */}
          <View style={styles.footer} testID="welcome-footer">
            <View style={styles.footerDivider} />
            <Text style={styles.footerDisclaimer}>
              {t(
                'welcome.footerDisclaimer',
                'APHC Case Tracker is an independent legal productivity application and is not an official portal of the High Court of Andhra Pradesh or the Government.'
              )}
            </Text>
            <Text style={styles.footerMeta}>
              {t('welcome.footerSecurity', 'Encrypted JWT Sessions • DPDP 2023 Aligned')}
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  pageWrapper: {
    width: '100%',
    maxWidth: 1020,
    alignSelf: 'center',
  },
  pageWrapperWide: {
    paddingHorizontal: Spacing.lg,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoCrest: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
    ...Shadows.card,
  },
  brandTextWrap: {
    flex: 1,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: -0.4,
  },
  courtTagline: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.gold,
    marginTop: 2,
  },
  heroGrid: {
    flexDirection: 'column',
    gap: Spacing.xl,
  },
  heroGridWide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroMain: {
    width: '100%',
  },
  heroMainWide: {
    flex: 1.15,
    paddingRight: Spacing.lg,
  },
  heroBadge: {
    marginBottom: Spacing.md,
  },
  heroHeadline: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -0.6,
    marginBottom: Spacing.md,
  },
  heroDescription: {
    fontSize: 15,
    lineHeight: 23,
    color: Colors.text.secondary,
    marginBottom: Spacing.xl,
  },
  ctaGroup: {
    gap: Spacing.md,
  },
  primaryCta: {
    width: '100%',
    maxWidth: 340,
  },
  recoveryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  recoveryLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  visualCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card + 2,
    borderColor: Colors.border,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: 0,
    ...Shadows.card,
  },
  visualCardWide: {
    flex: 0.95,
  },
  visualHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.md,
  },
  visualIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surfaceBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  visualHeaderText: {
    flex: 1,
  },
  visualTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  visualSubtitle: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: 2,
  },
  pillarList: {
    gap: Spacing.md,
  },
  pillarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceSubtle,
  },
  pillarRowLast: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  pillarIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  pillarCopy: {
    flex: 1,
  },
  pillarTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  pillarDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.text.secondary,
  },
  demoRow: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  demoText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  footer: {
    marginTop: Spacing.xxl,
    paddingTop: Spacing.md,
  },
  footerDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: Spacing.md,
  },
  footerDisclaimer: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.text.muted,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  footerMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    textAlign: 'center',
  },
});
