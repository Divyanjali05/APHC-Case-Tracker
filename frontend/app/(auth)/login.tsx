import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Input } from '../../components/common/Input';
import { AppIcon } from '../../components/common/AppIcon';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing, Typography } from '../../constants/theme';
import { loginSchema, LoginFormData } from '../../features/auth/schemas';
import { useAuth } from '../../features/auth/AuthContext';
import { tokenStorage } from '../../services/auth/tokenStorage';

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { signIn, enterDemoMode } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      enrollmentNumber: '',
      password: '',
    },
  });

  useEffect(() => {
    let mounted = true;
    const loadRemembered = async () => {
      if (typeof tokenStorage.getRememberedIdentifier !== 'function') return;
      try {
        const saved = await tokenStorage.getRememberedIdentifier();
        if (mounted && saved) {
          setValue('enrollmentNumber', saved);
          setRememberMe(true);
        }
      } catch {
        // Ignore storage read failure
      }
    };
    loadRemembered();
    return () => {
      mounted = false;
    };
  }, [setValue]);

  const onSubmit = async (data: LoginFormData) => {
    setAuthError(null);
    try {
      const { role } = await signIn(data.enrollmentNumber, data.password, rememberMe);
      router.replace(role === 'ADMIN' ? '/admin' : '/(tabs)');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const res = (
          err as { response?: { status?: number; data?: { detail?: string } } }
        ).response;
        if (res?.status === 403 && res.data?.detail) {
          setAuthError(res.data.detail);
          return;
        }
      }
      setAuthError(t('auth.invalidCredentials'));
    }
  };

  return (
    <ScreenContainer testID="login-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.centerContainer}>
            {/* Top Back Link */}
            <TouchableOpacity
              onPress={() => router.replace('/')}
              style={styles.welcomeBackLink}
              testID="back-to-welcome-link"
              accessibilityRole="button"
              accessibilityLabel="Back to Welcome Page"
            >
              <AppIcon name="arrow-left" size={16} color={Colors.primary} />
              <Text style={styles.welcomeBackText}>
                {t('welcome.backHome', 'Back to Welcome')}
              </Text>
            </TouchableOpacity>

            {/* Top Branding Area */}
            <View style={styles.brandingContainer}>
              <View style={styles.logoRow}>
                <View style={styles.logoBadge}>
                  <AppIcon name="scale" size={22} color={Colors.text.white} />
                </View>
                <Badge
                  label={t('common.courtName', 'High Court of Andhra Pradesh')}
                  variant="gold"
                />
              </View>
              <Text style={styles.appName}>
                {t('common.appName', 'APHC Case Tracker')}
              </Text>
              <Text style={styles.portalSubtitle}>
                {t('auth.portalSubtitle', 'Role-Verified Advocate & Admin Workspace')}
              </Text>
            </View>

            {/* Form Card */}
            <Card style={styles.formCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardHeading}>{t('auth.login', 'Sign In')}</Text>
                <Text style={styles.cardSubtext}>
                  {t(
                    'auth.loginDescription',
                    'Sign in with your Bar Council Enrollment ID or assigned username.'
                  )}
                </Text>
              </View>

              {authError ? (
                <View style={styles.errorBanner} testID="login-error-banner">
                  <AppIcon name="alert-circle" size={16} color={Colors.danger} />
                  <Text style={styles.errorBannerText}>{authError}</Text>
                </View>
              ) : null}

              {/* Username or Bar Council ID Field */}
              <Controller
                control={control}
                name="enrollmentNumber"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('auth.identifierLabel', 'Username or Bar Council ID')}
                    placeholder={t(
                      'auth.identifierPlaceholder',
                      'AP/1234/2020 or username'
                    )}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<AppIcon name="user" size={18} color={Colors.text.muted} />}
                    error={errors.enrollmentNumber?.message}
                    testID="enrollment-input"
                    errorTestID="enrollment-error"
                  />
                )}
              />

              {/* Password Field with Show/Hide Toggle */}
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('auth.password', 'Password')}
                    placeholder={t('auth.passwordPlaceholder', 'Enter your password')}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry={!showPassword}
                    leftIcon={<AppIcon name="lock" size={18} color={Colors.text.muted} />}
                    error={errors.password?.message}
                    testID="password-input"
                    errorTestID="password-error"
                    rightAction={
                      <TouchableOpacity
                        onPress={() => setShowPassword(prev => !prev)}
                        testID="toggle-password-visibility"
                        accessibilityRole="button"
                        accessibilityLabel={
                          showPassword ? 'Hide password' : 'Show password'
                        }
                        accessibilityState={{ checked: showPassword }}
                        accessibilityHint="Toggles password visibility between plain text and hidden"
                        style={styles.toggleVisibilityBtn}
                      >
                        <AppIcon
                          name={showPassword ? 'eye-off' : 'eye'}
                          size={18}
                          color={Colors.primary}
                        />
                      </TouchableOpacity>
                    }
                  />
                )}
              />

              {/* Remember-me & Forgot Password Row */}
              <View style={styles.optionsRow}>
                <TouchableOpacity
                  onPress={() => setRememberMe(prev => !prev)}
                  style={styles.rememberRow}
                  testID="remember-me-toggle"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: rememberMe }}
                  accessibilityLabel={t('auth.rememberMe', 'Remember username')}
                >
                  <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                    {rememberMe ? (
                      <AppIcon name="check" size={12} color={Colors.text.white} />
                    ) : null}
                  </View>
                  <Text style={styles.rememberText}>
                    {t('auth.rememberMe', 'Remember ID')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push('/(auth)/forgot-password')}
                  style={styles.forgotPasswordContainer}
                  testID="forgot-password-link"
                  accessibilityRole="link"
                >
                  <Text style={styles.forgotPasswordText}>
                    {t('auth.forgotPassword', 'Forgot Password?')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Submit Button */}
              <Button
                title={isSubmitting ? t('auth.submitting') : t('auth.login')}
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting}
                style={styles.submitButton}
                testID="login-submit-button"
              />

              {/* Development / Demo Mode Bypass */}
              {(__DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEMO === 'true') && (
                <Button
                  title={t('auth.demoMode', 'Preview Local Sample Mode')}
                  variant="outline"
                  onPress={async () => {
                    await enterDemoMode();
                    router.replace('/(tabs)');
                  }}
                  style={styles.demoButton}
                  testID="demo-skip-button"
                />
              )}
            </Card>

            {/* Footer Notice */}
            <View style={styles.footerContainer}>
              <AppIcon name="shield-check" size={14} color={Colors.text.muted} />
              <Text style={styles.footerNotice}>
                {t(
                  'auth.securityFooter',
                  'Only the identifier is stored when remembered. Passwords are never saved locally.'
                )}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  centerContainer: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  welcomeBackLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    minHeight: 40,
    marginBottom: Spacing.md,
  },
  welcomeBackText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  brandingContainer: {
    marginBottom: Spacing.lg,
    alignItems: 'flex-start',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.subtle,
  },
  appName: {
    ...Typography.screenTitle,
    color: Colors.text.primary,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  portalSubtitle: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: Spacing.xs,
  },
  formCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  cardHeader: {
    marginBottom: Spacing.lg,
  },
  cardHeading: {
    ...Typography.sectionTitle,
    color: Colors.text.primary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  cardSubtext: {
    ...Typography.body,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text.muted,
    marginTop: Spacing.xs,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.dangerSurface,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    padding: Spacing.md,
    borderRadius: Radius.button,
    marginBottom: Spacing.md,
  },
  errorBannerText: {
    flex: 1,
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  toggleVisibilityBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 36,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  rememberText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.secondary,
  },
  forgotPasswordContainer: {
    paddingVertical: Spacing.xs,
  },
  forgotPasswordText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  submitButton: {
    marginBottom: Spacing.sm,
  },
  demoButton: {
    marginTop: Spacing.sm,
  },
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  footerNotice: {
    fontSize: 12,
    color: Colors.text.muted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
