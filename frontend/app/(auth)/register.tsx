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
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Input } from '../../components/common/Input';
import { AppIcon } from '../../components/common/AppIcon';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing, Typography } from '../../constants/theme';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';

interface RegisterFormData {
  enrollmentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  chamberAddress: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    defaultValues: {
      enrollmentNumber: '',
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      chamberAddress: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setAuthError(null);

    if (data.password !== data.confirmPassword) {
      setAuthError(t('auth.passwordMismatch', 'Passwords do not match.'));
      return;
    }

    if (data.password.length < 8) {
      setAuthError(
        t('auth.passwordTooShort', 'Password must be at least 8 characters long.')
      );
      return;
    }

    try {
      await apiClient.post(ENDPOINTS.AUTH.REGISTER, {
        enrollment_number: data.enrollmentNumber.trim().toUpperCase(),
        email: data.email.trim().toLowerCase(),
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        phone_number: data.phoneNumber.trim(),
        chamber_address: data.chamberAddress.trim(),
        password: data.password,
        confirm_password: data.confirmPassword,
      });

      setIsSuccess(true);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const res = (
          err as {
            response?: {
              status?: number;
              data?: Record<string, string | string[]>;
            };
          }
        ).response;
        if (res?.data) {
          const firstKey = Object.keys(res.data)[0];
          const val = res.data[firstKey];
          const msg = Array.isArray(val) ? val[0] : String(val);
          setAuthError(msg || t('auth.registrationFailed', 'Registration failed.'));
          return;
        }
      }
      setAuthError(
        t(
          'auth.registrationFailed',
          'Could not complete registration. Please check your details and try again.'
        )
      );
    }
  };

  if (isSuccess) {
    return (
      <ScreenContainer testID="register-success-screen">
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.centerContainer}>
            <Card style={styles.formCard}>
              <View style={styles.successIconWrapper}>
                <AppIcon name="shield-check" size={36} color={Colors.success} />
              </View>
              <Text style={styles.successHeading}>
                {t('auth.registrationSubmitted', 'Registration Submitted!')}
              </Text>
              <Text style={styles.successMessage}>
                {t(
                  'auth.registrationSuccessBody',
                  'Your advocate account registration has been created. You can now sign in with your Bar Council enrollment ID.'
                )}
              </Text>
              <Button
                title={t('auth.proceedToSignIn', 'Proceed to Sign In')}
                onPress={() => router.replace('/(auth)/login')}
                style={styles.submitButton}
                testID="register-proceed-signin"
              />
            </Card>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer testID="register-screen">
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
              accessibilityRole="link"
              accessibilityLabel={t('auth.backToHome', 'Back to Home')}
              testID="register-back-home"
            >
              <AppIcon name="arrow-left" size={16} color={Colors.primary} />
              <Text style={styles.welcomeBackText}>
                {t('auth.backToHome', 'Back to Home')}
              </Text>
            </TouchableOpacity>

            {/* Branding Header */}
            <View style={styles.brandingContainer}>
              <View style={styles.logoRow}>
                <View style={styles.logoBadge} testID="register-logo">
                  <AppIcon name="scale" size={20} color={Colors.text.white} />
                </View>
                <Text style={styles.appName}>
                  {t('common.appName', 'APHC Case Tracker')}
                </Text>
              </View>
              <Text style={styles.portalSubtitle}>
                {t(
                  'auth.registerSubtitle',
                  'High Court of Andhra Pradesh • Advocate Registration'
                )}
              </Text>
            </View>

            {/* Registration Form Card */}
            <Card style={styles.formCard}>
              <View style={styles.cardHeader}>
                <Badge
                  label={t('auth.advocateBadge', 'ADVOCATE ONBOARDING')}
                  variant="gold"
                  style={styles.roleBadge}
                />
                <Text style={styles.cardHeading}>
                  {t('auth.createAccount', 'Create Advocate Account')}
                </Text>
                <Text style={styles.cardSubtext}>
                  {t(
                    'auth.createAccountDesc',
                    'Enter your Bar Council enrollment credentials to register your digital workspace.'
                  )}
                </Text>
              </View>

              {/* Error Banner */}
              {authError ? (
                <View style={styles.errorBanner} testID="register-error-banner">
                  <AppIcon name="alert-circle" size={16} color={Colors.danger} />
                  <Text style={styles.errorBannerText}>{authError}</Text>
                </View>
              ) : null}

              {/* Bar Council Enrollment Number */}
              <Controller
                control={control}
                name="enrollmentNumber"
                rules={{
                  required: t('auth.enrollmentRequired', 'Enrollment ID is required'),
                }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('auth.enrollmentNumber', 'Bar Council Enrollment No.')}
                    placeholder="AP/1234/2024"
                    value={value}
                    onChangeText={txt => onChange(txt.toUpperCase())}
                    onBlur={onBlur}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    error={errors.enrollmentNumber?.message}
                    testID="register-enrollment-input"
                    leftIcon={
                      <AppIcon name="award" size={18} color={Colors.text.muted} />
                    }
                  />
                )}
              />

              {/* Name Row */}
              <View style={styles.nameRow}>
                <View style={styles.halfCol}>
                  <Controller
                    control={control}
                    name="firstName"
                    rules={{
                      required: t('auth.firstNameRequired', 'First name is required'),
                    }}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <Input
                        label={t('auth.firstName', 'First Name')}
                        placeholder="Venkata"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        error={errors.firstName?.message}
                        testID="register-firstname-input"
                      />
                    )}
                  />
                </View>
                <View style={styles.halfCol}>
                  <Controller
                    control={control}
                    name="lastName"
                    rules={{
                      required: t('auth.lastNameRequired', 'Last name is required'),
                    }}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <Input
                        label={t('auth.lastName', 'Last Name')}
                        placeholder="Rao"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        error={errors.lastName?.message}
                        testID="register-lastname-input"
                      />
                    )}
                  />
                </View>
              </View>

              {/* Email Address */}
              <Controller
                control={control}
                name="email"
                rules={{
                  required: t('auth.emailRequired', 'Email is required'),
                }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('auth.emailAddress', 'Email Address')}
                    placeholder="advocate@example.com"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    error={errors.email?.message}
                    testID="register-email-input"
                    leftIcon={<AppIcon name="mail" size={18} color={Colors.text.muted} />}
                  />
                )}
              />

              {/* Phone Number */}
              <Controller
                control={control}
                name="phoneNumber"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('auth.phoneNumber', 'Mobile Number (Optional)')}
                    placeholder="+91 9876543210"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="phone-pad"
                    testID="register-phone-input"
                    leftIcon={
                      <AppIcon name="phone" size={18} color={Colors.text.muted} />
                    }
                  />
                )}
              />

              {/* Chamber Address */}
              <Controller
                control={control}
                name="chamberAddress"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('auth.chamberAddress', 'Chamber / Office (Optional)')}
                    placeholder="Chamber No. 12, High Court Complex"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    testID="register-chamber-input"
                    leftIcon={
                      <AppIcon name="map-pin" size={18} color={Colors.text.muted} />
                    }
                  />
                )}
              />

              {/* Password */}
              <Controller
                control={control}
                name="password"
                rules={{
                  required: t('auth.passwordRequired', 'Password is required'),
                  minLength: {
                    value: 8,
                    message: t(
                      'auth.passwordTooShort',
                      'Password must be at least 8 characters'
                    ),
                  },
                }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('auth.password', 'Password')}
                    placeholder="••••••••"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry={!showPassword}
                    error={errors.password?.message}
                    testID="register-password-input"
                    leftIcon={<AppIcon name="lock" size={18} color={Colors.text.muted} />}
                    rightAction={
                      <TouchableOpacity
                        onPress={() => setShowPassword(p => !p)}
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

              {/* Confirm Password */}
              <Controller
                control={control}
                name="confirmPassword"
                rules={{
                  required: t(
                    'auth.confirmPasswordRequired',
                    'Please confirm your password'
                  ),
                }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('auth.confirmPassword', 'Confirm Password')}
                    placeholder="••••••••"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry={!showConfirmPassword}
                    error={errors.confirmPassword?.message}
                    testID="register-confirm-password-input"
                    leftIcon={<AppIcon name="lock" size={18} color={Colors.text.muted} />}
                    rightAction={
                      <TouchableOpacity
                        onPress={() => setShowConfirmPassword(p => !p)}
                        style={styles.toggleVisibilityBtn}
                      >
                        <AppIcon
                          name={showConfirmPassword ? 'eye-off' : 'eye'}
                          size={18}
                          color={Colors.primary}
                        />
                      </TouchableOpacity>
                    }
                  />
                )}
              />

              {/* Register Button */}
              <Button
                title={
                  isSubmitting
                    ? t('auth.registering', 'Creating Account...')
                    : t('auth.submitRegistration', 'Register Account')
                }
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting}
                style={styles.submitButton}
                testID="register-submit-button"
              />

              {/* Sign In Prompt */}
              <View style={styles.signInPromptRow}>
                <Text style={styles.signInPromptText}>
                  {t('auth.hasAccountPrompt', 'Already have an account?')}
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/(auth)/login')}
                  style={styles.signInLink}
                  accessibilityRole="link"
                  testID="register-signin-link"
                >
                  <Text style={styles.signInLinkText}>
                    {t('auth.signInLink', 'Sign In')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>

            {/* Footer Notice */}
            <View style={styles.footerContainer}>
              <AppIcon name="shield-check" size={14} color={Colors.text.muted} />
              <Text style={styles.footerNotice}>
                {t(
                  'auth.securityNotice',
                  'All advocate credentials are encrypted and governed under Bar Council compliance standards.'
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
    maxWidth: 480,
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
  roleBadge: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
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
  nameRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  halfCol: {
    flex: 1,
  },
  toggleVisibilityBtn: {
    padding: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButton: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  signInPromptRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  signInPromptText: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  signInLink: {
    paddingVertical: 2,
  },
  signInLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
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
  successIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.successSurface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  successHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  successMessage: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
});
