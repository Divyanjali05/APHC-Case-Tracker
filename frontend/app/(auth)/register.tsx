import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Button } from '../../components/common/Button';
import { Colors } from '../../constants/colors';
import { registerSchema, RegisterFormData } from '../../features/auth/schemas';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';

const BACKEND_FIELD_MAP: Record<string, keyof RegisterFormData> = {
  enrollment_number: 'enrollmentNumber',
  email: 'email',
  first_name: 'firstName',
  last_name: 'lastName',
  password: 'password',
  confirm_password: 'confirmPassword',
};

function extractFirstErrorText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractFirstErrorText(item);
      if (text) return text;
    }
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const text = extractFirstErrorText(nested);
      if (text) return text;
    }
  }
  return null;
}

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const isSubmittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [registeredEnrollment, setRegisteredEnrollment] = useState<string | null>(
    null
  );

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      enrollmentNumber: '',
      email: '',
      firstName: '',
      lastName: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setSubmitError(null);
    setSuccessMessage(null);
    const enrollment = data.enrollmentNumber.trim().toUpperCase();

    try {
      const response = await apiClient.post(ENDPOINTS.AUTH.REGISTER, {
        enrollment_number: enrollment,
        email: data.email.trim().toLowerCase(),
        first_name: data.firstName?.trim() || '',
        last_name: data.lastName?.trim() || '',
        password: data.password,
        confirm_password: data.confirmPassword,
      });

      const createdEnrollment =
        response.data?.enrollment_number ||
        response.data?.user?.profile?.bar_council_enrollment_number ||
        enrollment;

      setRegisteredEnrollment(createdEnrollment);
      setSuccessMessage(
        response.data?.detail ||
          `Account created for ${createdEnrollment}. You can now log in.`
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setSubmitError(
            'Unable to reach the server. Please check your connection and try again.'
          );
          return;
        }

        if (err.response.status >= 500) {
          setSubmitError(
            'A server error occurred while creating your account. Please try again shortly.'
          );
          return;
        }

        const payload = err.response.data;
        const messageObj =
          payload?.error?.message && typeof payload.error.message === 'object'
            ? (payload.error.message as Record<string, unknown>)
            : payload && typeof payload === 'object'
              ? (payload as Record<string, unknown>)
              : null;

        let mappedFieldMessage: string | null = null;

        if (messageObj) {
          for (const [backendKey, formField] of Object.entries(BACKEND_FIELD_MAP)) {
            if (backendKey in messageObj) {
              const fieldMsg = extractFirstErrorText(messageObj[backendKey]);
              if (fieldMsg) {
                setError(formField, { type: 'server', message: fieldMsg });
                if (!mappedFieldMessage) {
                  mappedFieldMessage = fieldMsg;
                }
              }
            }
          }

          const topDetail =
            extractFirstErrorText(messageObj.non_field_errors) ||
            extractFirstErrorText(messageObj.detail);
          if (topDetail) {
            setSubmitError(topDetail);
            return;
          }
        }

        const stringDetail =
          extractFirstErrorText(payload?.detail) ||
          extractFirstErrorText(payload?.error?.message);

        setSubmitError(
          mappedFieldMessage ||
            stringDetail ||
            'Unable to complete registration. Please review your details.'
        );
        return;
      }

      setSubmitError('Unable to complete registration. Please check your details.');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  return (
    <ScreenContainer testID="register-screen">
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
            <Text style={styles.title}>Advocate Registration</Text>
            <Text style={styles.subtitle}>
              Create your APHC Case Tracker account using your Bar Council enrollment
              number.
            </Text>
          </View>

          {submitError ? (
            <View style={styles.errorBanner} testID="register-error-banner">
              <Text style={styles.errorBannerText}>{submitError}</Text>
            </View>
          ) : null}

          {successMessage ? (
            <View style={styles.successBanner} testID="register-success-banner">
              <Text style={styles.successBannerText}>{successMessage}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            {!registeredEnrollment ? (
              <>
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
                      editable={!isSubmitting}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      testID="register-enrollment-input"
                    />
                  )}
                />
                {errors.enrollmentNumber ? (
                  <Text
                    style={styles.fieldError}
                    testID="register-enrollment-error"
                  >
                    {errors.enrollmentNumber.message}
                  </Text>
                ) : null}

                <Text style={styles.label}>Email</Text>
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.email && styles.inputError]}
                      placeholder="advocate@example.com"
                      placeholderTextColor={Colors.text.muted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={!isSubmitting}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      testID="register-email-input"
                    />
                  )}
                />
                {errors.email ? (
                  <Text style={styles.fieldError} testID="register-email-error">
                    {errors.email.message}
                  </Text>
                ) : null}

                <Text style={styles.label}>First Name (Optional)</Text>
                <Controller
                  control={control}
                  name="firstName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.firstName && styles.inputError]}
                      placeholder="First name"
                      placeholderTextColor={Colors.text.muted}
                      editable={!isSubmitting}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      testID="register-firstname-input"
                    />
                  )}
                />
                {errors.firstName ? (
                  <Text style={styles.fieldError} testID="register-firstname-error">
                    {errors.firstName.message}
                  </Text>
                ) : null}

                <Text style={styles.label}>Last Name (Optional)</Text>
                <Controller
                  control={control}
                  name="lastName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.lastName && styles.inputError]}
                      placeholder="Last name"
                      placeholderTextColor={Colors.text.muted}
                      editable={!isSubmitting}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      testID="register-lastname-input"
                    />
                  )}
                />
                {errors.lastName ? (
                  <Text style={styles.fieldError} testID="register-lastname-error">
                    {errors.lastName.message}
                  </Text>
                ) : null}

                <Text style={styles.label}>{t('auth.password')}</Text>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.password && styles.inputError]}
                      placeholder="Minimum 8 characters"
                      placeholderTextColor={Colors.text.muted}
                      secureTextEntry
                      editable={!isSubmitting}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      testID="register-password-input"
                    />
                  )}
                />
                {errors.password ? (
                  <Text style={styles.fieldError} testID="register-password-error">
                    {errors.password.message}
                  </Text>
                ) : null}

                <Text style={styles.label}>Confirm Password</Text>
                <Controller
                  control={control}
                  name="confirmPassword"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.confirmPassword && styles.inputError]}
                      placeholder="Re-enter your password"
                      placeholderTextColor={Colors.text.muted}
                      secureTextEntry
                      editable={!isSubmitting}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      testID="register-confirm-password-input"
                    />
                  )}
                />
                {errors.confirmPassword ? (
                  <Text
                    style={styles.fieldError}
                    testID="register-confirm-password-error"
                  >
                    {errors.confirmPassword.message}
                  </Text>
                ) : null}

                <Button
                  title={isSubmitting ? 'Registering...' : 'Register'}
                  onPress={handleSubmit(onSubmit)}
                  loading={isSubmitting}
                  disabled={isSubmitting}
                  style={styles.submitButton}
                  testID="register-submit-button"
                />
                <Button
                  title="Already have an account? Login"
                  variant="outline"
                  onPress={() => router.replace('/(auth)/login')}
                  disabled={isSubmitting}
                  style={styles.secondaryButton}
                  testID="register-login-link-button"
                />
              </>
            ) : (
              <View style={styles.successPanel}>
                <Text style={styles.successDetail}>
                  Bar Council Enrollment: {registeredEnrollment}
                </Text>
                <Button
                  title="Proceed to Login"
                  onPress={() => router.replace('/(auth)/login')}
                  style={styles.submitButton}
                  testID="register-proceed-login-button"
                />
              </View>
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
    paddingVertical: 20,
  },
  header: {
    marginBottom: 20,
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
  errorBanner: {
    backgroundColor: Colors.dangerSoft,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorBannerText: {
    color: Colors.dangerText,
    fontSize: 13,
    fontWeight: '600',
  },
  successBanner: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  successBannerText: {
    color: '#065F46',
    fontSize: 13,
    fontWeight: '600',
  },
  successPanel: {
    paddingVertical: 4,
  },
  successDetail: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
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
    marginTop: 10,
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
  submitButton: {
    marginTop: 20,
  },
  secondaryButton: {
    marginTop: 12,
  },
});
