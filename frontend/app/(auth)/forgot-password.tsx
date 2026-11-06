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
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Button } from '../../components/common/Button';
import { Colors } from '../../constants/colors';
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
      // Even if network error occurs, show handled error state
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
        >
          <View style={styles.header}>
            <Text style={styles.courtName}>{t('common.courtName')}</Text>
            <Text style={styles.title}>{t('auth.forgotPasswordTitle')}</Text>
            <Text style={styles.subtitle}>{t('auth.forgotPasswordSubtitle')}</Text>
          </View>

          {isSuccess ? (
            <View style={styles.successCard} testID="success-card">
              <Text style={styles.successTitle}>{t('auth.requestSentTitle')}</Text>
              <Text style={styles.successMessage}>{t('auth.requestSentMessage')}</Text>

              <Button
                title={t('auth.resetPassword')}
                onPress={() => router.push('/(auth)/reset-password')}
                style={styles.actionButton}
                testID="navigate-reset-button"
              />

              <TouchableOpacity
                onPress={() => router.replace('/(auth)/login')}
                style={styles.backLink}
                testID="back-to-login-link"
              >
                <Text style={styles.backLinkText}>← {t('auth.backToLogin')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              {errorMessage ? (
                <View style={styles.errorBanner} testID="error-banner">
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>{t('auth.enrollmentNumber')}</Text>
              <Controller
                control={control}
                name="enrollmentNumber"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, errors.enrollmentNumber && styles.inputError]}
                    placeholder={t('auth.enrollmentPlaceholder')}
                    placeholderTextColor={Colors.text.muted}
                    autoCapitalize="characters"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    testID="enrollment-input"
                  />
                )}
              />
              {errors.enrollmentNumber ? (
                <Text style={styles.fieldError} testID="enrollment-error">
                  {errors.enrollmentNumber.message}
                </Text>
              ) : null}

              <Button
                title={
                  isSubmitting ? t('auth.submitting') : t('auth.sendResetInstructions')
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
