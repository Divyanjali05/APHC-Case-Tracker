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
import { useRouter, Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Button } from '../../components/common/Button';
import { Colors } from '../../constants/colors';
import { loginSchema, LoginFormData } from '../../features/auth/schemas';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { useAuth } from '../../features/auth/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      enrollmentNumber: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setAuthError(null);
    try {
      const response = await apiClient.post(ENDPOINTS.AUTH.TOKEN, {
        username: data.enrollmentNumber.trim().toUpperCase(),
        password: data.password,
      });

      if (response.data?.access && response.data?.refresh) {
        await signIn(response.data.access, response.data.refresh);
        router.replace('/(tabs)');
      }
    } catch {
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
        >
          <View style={styles.header}>
            <Text style={styles.courtName}>{t('common.courtName')}</Text>
            <Text style={styles.title}>{t('auth.title')}</Text>
            <Text style={styles.subtitle}>
              Sign in with your verified Bar Council of Andhra Pradesh credentials.
            </Text>
          </View>

          {authError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{authError}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
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
              <Text style={styles.fieldError}>{errors.enrollmentNumber.message}</Text>
            ) : null}

            <Text style={styles.label}>{t('auth.password')}</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.password && styles.inputError]}
                  placeholder="Enter your password"
                  placeholderTextColor={Colors.text.muted}
                  secureTextEntry
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  testID="password-input"
                />
              )}
            />
            {errors.password ? (
              <Text style={styles.fieldError}>{errors.password.message}</Text>
            ) : null}

            <TouchableOpacity
              onPress={() => router.push('/(auth)/forgot-password' as Href<string>)}
              style={styles.forgotPasswordContainer}
              testID="forgot-password-link"
            >
              <Text style={styles.forgotPasswordText}>
                {t('auth.forgotPassword', 'Forgot Password?')}
              </Text>
            </TouchableOpacity>

            <Button
              title={isSubmitting ? t('auth.submitting') : t('auth.login')}
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              style={styles.submitButton}
              testID="login-submit-button"
            />

            <Button
              title="Return to Dashboard (Demo Mode)"
              variant="outline"
              onPress={() => router.replace('/(tabs)')}
              style={styles.demoButton}
              testID="demo-skip-button"
            />
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
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 4,
  },
  forgotPasswordText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 20,
  },
  demoButton: {
    marginTop: 12,
  },
});
