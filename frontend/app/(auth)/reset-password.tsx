import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { Button } from '../../components/common/Button';
import { Colors } from '../../constants/colors';
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
        >
          <View style={styles.header}>
            <Text style={styles.courtName}>{t('common.courtName')}</Text>
            <Text style={styles.title}>{t('auth.resetPasswordTitle')}</Text>
            <Text style={styles.subtitle}>{t('auth.resetPasswordSubtitle')}</Text>
          </View>

          {isSuccess ? (
            <View style={styles.successCard} testID="success-card">
              <Text style={styles.successTitle}>{t('auth.resetSuccess')}</Text>
              <Text style={styles.successMessage}>{t('auth.resetSuccessMessage')}</Text>

              <Button
                title={t('auth.backToLogin')}
                onPress={() => router.replace('/(auth)/login')}
                style={styles.actionButton}
                testID="return-to-login-button"
              />
            </View>
          ) : (
            <View style={styles.form}>
              {errorMessage ? (
                <View style={styles.errorBanner} testID="error-banner">
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>{t('auth.resetToken')}</Text>
              <Controller
                control={control}
                name="token"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, errors.token && styles.inputError]}
                    placeholder={t('auth.resetTokenPlaceholder')}
                    placeholderTextColor={Colors.text.muted}
                    autoCapitalize="none"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    testID="token-input"
                  />
                )}
              />
              {errors.token ? (
                <Text style={styles.fieldError} testID="token-error">
                  {errors.token.message}
                </Text>
              ) : null}

              <View style={styles.passwordHeader}>
                <Text style={styles.label}>{t('auth.newPassword')}</Text>
                <TouchableOpacity
                  onPress={() => setShowPassword(prev => !prev)}
                  testID="toggle-password-visibility"
                >
                  <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
              <Controller
                control={control}
                name="newPassword"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, errors.newPassword && styles.inputError]}
                    placeholder={t('auth.newPasswordPlaceholder')}
                    placeholderTextColor={Colors.text.muted}
                    secureTextEntry={!showPassword}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    testID="new-password-input"
                  />
                )}
              />
              {errors.newPassword ? (
                <Text style={styles.fieldError} testID="new-password-error">
                  {errors.newPassword.message}
                </Text>
              ) : null}

              <Text style={styles.label}>{t('auth.confirmPassword')}</Text>
              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, errors.confirmPassword && styles.inputError]}
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    placeholderTextColor={Colors.text.muted}
                    secureTextEntry={!showPassword}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    testID="confirm-password-input"
                  />
                )}
              />
              {errors.confirmPassword ? (
                <Text style={styles.fieldError} testID="confirm-password-error">
                  {errors.confirmPassword.message}
                </Text>
              ) : null}

              <Button
                title={isSubmitting ? t('auth.submitting') : t('auth.resetPassword')}
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting}
                style={styles.submitButton}
                testID="submit-button"
              />

              <TouchableOpacity
                onPress={() => router.replace('/(auth)/login')}
                style={styles.backLink}
                testID="back-to-login-link"
              >
                <Text style={styles.backLinkText}>← {t('auth.backToLogin')}</Text>
              </TouchableOpacity>
            </View>
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
    paddingVertical: 20,
  },
  header: {
    marginBottom: 24,
  },
  courtName: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  title: {
    color: Colors.text.primary,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: Colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  form: {
    backgroundColor: Colors.surface,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  label: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  toggleText: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text.primary,
    fontSize: 15,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  fieldError: {
    color: Colors.danger,
    fontSize: 12,
    marginTop: 4,
  },
  errorBanner: {
    backgroundColor: '#7F1D1D',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#FEE2E2',
    fontSize: 13,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 20,
  },
  backLink: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 8,
  },
  backLinkText: {
    color: Colors.primaryLight,
    fontSize: 14,
    fontWeight: '600',
  },
  successCard: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  successTitle: {
    color: Colors.gold,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  successMessage: {
    color: Colors.text.primary,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  actionButton: {
    marginBottom: 12,
  },
});
