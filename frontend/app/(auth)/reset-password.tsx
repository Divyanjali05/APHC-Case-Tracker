import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
import { resetPasswordSchema, ResetPasswordFormData } from '../../features/auth/schemas';
import { authService } from '../../services/auth/authService';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ token?: string }>();

  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: params.token || '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    setErrorMessage(null);
    try {
      await authService.confirmPasswordReset({
        token: data.token,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });
      setIsSuccess(true);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const res = (err as { response?: { data?: Record<string, unknown> } }).response;
        const dataErrors = res?.data;
        if (dataErrors && typeof dataErrors === 'object') {
          const firstKey = Object.keys(dataErrors)[0];
          const val = dataErrors[firstKey];
          setErrorMessage(Array.isArray(val) ? val.join(' ') : String(val));
          return;
        }
      }
      setErrorMessage(
        'Failed to reset password. Please verify your token and try again.'
      );
    }
  };

  return (
    <ScreenContainer testID="reset-password-screen">
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
            {/* Header Branding Area */}
            <View style={styles.headerContainer}>
              <View style={styles.badgeRow}>
                <Badge
                  label={t('common.courtName', 'High Court of Andhra Pradesh')}
                  variant="gold"
                />
              </View>
              <Text style={styles.title}>
                {t('auth.resetPasswordTitle', 'Set New Password')}
              </Text>
              <Text style={styles.subtitle}>
                {t(
                  'auth.resetPasswordSubtitle',
                  'Enter your single-use reset token and choose a new secure password.'
                )}
              </Text>
            </View>

            {isSuccess ? (
              <Card style={styles.successCard} testID="success-card">
                <View style={styles.successBadgeSlot}>
                  <Badge label="PASSWORD UPDATED" variant="success" />
                </View>
                <Text style={styles.successTitle}>
                  {t('auth.resetSuccess', 'Password Reset Successful')}
                </Text>
                <Text style={styles.successMessage}>
                  {t(
                    'auth.resetSuccessMessage',
                    'Your password has been securely updated. You can now sign in with your new credentials.'
                  )}
                </Text>

                <Button
                  title={t('auth.backToLogin', 'Back to Sign In')}
                  onPress={() => router.replace('/(auth)/login')}
                  style={styles.actionButton}
                  testID="return-to-login-button"
                />
              </Card>
            ) : (
              <Card style={styles.formCard}>
                {errorMessage ? (
                  <View style={styles.errorBanner} testID="error-banner">
                    <AppIcon name="alert-circle" size={16} color={Colors.danger} />
                    <Text style={styles.errorBannerText}>{errorMessage}</Text>
                  </View>
                ) : null}

                {/* Reset Token Input */}
                <Controller
                  control={control}
                  name="token"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label={t('auth.resetToken', 'Reset Token')}
                      placeholder={t(
                        'auth.resetTokenPlaceholder',
                        'Paste your reset token here'
                      )}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      autoCapitalize="none"
                      leftIcon={
                        <AppIcon name="key" size={18} color={Colors.text.muted} />
                      }
                      error={errors.token?.message}
                      testID="token-input"
                      errorTestID="token-error"
                      helperText="Enter the verification token sent to your registered contact."
                    />
                  )}
                />

                {/* Password Controls Header */}
                <View style={styles.visibilityRow}>
                  <Text style={styles.sectionHeaderLabel}>Credentials</Text>
                  <TouchableOpacity
                    onPress={() => setShowPassword(prev => !prev)}
                    testID="toggle-password-visibility"
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
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
                </View>

                {/* New Password Input */}
                <Controller
                  control={control}
                  name="newPassword"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label={t('auth.newPassword', 'New Password')}
                      placeholder={t(
                        'auth.newPasswordPlaceholder',
                        'Min. 8 chars, 1 uppercase, 1 digit'
                      )}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      secureTextEntry={!showPassword}
                      leftIcon={
                        <AppIcon name="lock" size={18} color={Colors.text.muted} />
                      }
                      error={errors.newPassword?.message}
                      testID="new-password-input"
                      errorTestID="new-password-error"
                      helperText="At least 8 characters with 1 uppercase letter and 1 number."
                    />
                  )}
                />

                {/* Confirm Password Input */}
                <Controller
                  control={control}
                  name="confirmPassword"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label={t('auth.confirmPassword', 'Confirm New Password')}
                      placeholder={t(
                        'auth.confirmPasswordPlaceholder',
                        'Re-enter new password'
                      )}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      secureTextEntry={!showPassword}
                      leftIcon={
                        <AppIcon name="lock" size={18} color={Colors.text.muted} />
                      }
                      error={errors.confirmPassword?.message}
                      testID="confirm-password-input"
                      errorTestID="confirm-password-error"
                    />
                  )}
                />

                {/* Submit Button */}
                <Button
                  title={
                    isSubmitting
                      ? t('auth.submitting', 'Submitting...')
                      : t('auth.resetPassword', 'Set New Password')
                  }
                  onPress={handleSubmit(onSubmit)}
                  loading={isSubmitting}
                  style={styles.submitButton}
                  testID="submit-button"
                />

                {/* Back to Login Link */}
                <TouchableOpacity
                  onPress={() => router.replace('/(auth)/login')}
                  style={styles.backLink}
                  testID="back-to-login-link"
                  accessibilityRole="link"
                >
                  <View style={styles.backLinkRow}>
                    <AppIcon name="arrow-left" size={14} color={Colors.primary} />
                    <Text style={styles.backLinkText}>
                      {t('auth.backToLogin', 'Back to Sign In')}
                    </Text>
                  </View>
                </TouchableOpacity>
              </Card>
            )}
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
  headerContainer: {
    marginBottom: Spacing.lg,
  },
  badgeRow: {
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.screenTitle,
    color: Colors.text.primary,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    ...Typography.body,
    fontSize: 14,
    lineHeight: 20,
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
  successCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadows.card,
  },
  successBadgeSlot: {
    marginBottom: Spacing.md,
  },
  successTitle: {
    ...Typography.sectionTitle,
    color: Colors.text.primary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  successMessage: {
    ...Typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  visibilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    marginTop: Spacing.xs,
  },
  sectionHeaderLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.text.muted,
  },
  toggleVisibilityBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  submitButton: {
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  actionButton: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  backLink: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  backLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backLinkText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
