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
import { Radius, Spacing, Typography } from '../../constants/theme';
import {
  forgotPasswordSchema,
  ForgotPasswordFormData,
} from '../../features/auth/schemas';
import { authService } from '../../services/auth/authService';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      enrollmentNumber: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setErrorMessage(null);
    try {
      await authService.requestPasswordReset(data.enrollmentNumber);
      setIsSuccess(true);
    } catch {
      setErrorMessage('Unable to connect to the reset service. Please try again later.');
    }
  };

  return (
    <ScreenContainer testID="forgot-password-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Branding Area */}
          <View style={styles.headerContainer}>
            <View style={styles.badgeRow}>
              <Badge
                label={t('common.courtName', 'High Court of Andhra Pradesh')}
                variant="gold"
              />
            </View>
            <Text style={styles.title}>
              {t('auth.forgotPasswordTitle', 'Reset Password')}
            </Text>
            <Text style={styles.subtitle}>
              {t(
                'auth.forgotPasswordSubtitle',
                'Enter your Bar Council enrollment number to receive password reset instructions.'
              )}
            </Text>
          </View>

          {isSuccess ? (
            <Card style={styles.successCard} testID="success-card">
              <View style={styles.successBadgeSlot}>
                <Badge label="INSTRUCTIONS SENT" variant="success" />
              </View>
              <Text style={styles.successTitle}>
                {t('auth.requestSentTitle', 'Instructions Dispatched')}
              </Text>
              <Text style={styles.successMessage}>
                {t(
                  'auth.requestSentMessage',
                  'If an account exists with the provided enrollment number, instructions have been sent.'
                )}
              </Text>

              <Button
                title={t('auth.resetPassword', 'Reset Password')}
                onPress={() => router.push('/(auth)/reset-password')}
                style={styles.actionButton}
                testID="navigate-reset-button"
              />

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
          ) : (
            <Card style={styles.formCard}>
              {errorMessage ? (
                <View style={styles.errorBanner} testID="error-banner">
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}

              <Controller
                control={control}
                name="enrollmentNumber"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('auth.enrollmentNumber', 'Bar Council Enrollment Number')}
                    placeholder={t('auth.enrollmentPlaceholder', 'AP/1234/2020')}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="characters"
                    error={errors.enrollmentNumber?.message}
                    testID="enrollment-input"
                    errorTestID="enrollment-error"
                    helperText="Enter in format AP/1234/2020 as registered with the Bar Council."
                  />
                )}
              />

              <Button
                title={
                  isSubmitting
                    ? t('auth.submitting', 'Submitting...')
                    : t('auth.sendResetInstructions', 'Send Reset Instructions')
                }
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting}
                style={styles.submitButton}
                testID="submit-button"
              />

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
  },
  successCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
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
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    padding: Spacing.md,
    borderRadius: Radius.button,
    marginBottom: Spacing.md,
  },
  errorBannerText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  submitButton: {
    marginTop: Spacing.sm,
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
