import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  TextInput,
  BackHandler,
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
import { authService, AdvocateRegisterPayload } from '../../services/auth/authService';
import { OtpCodeInput, OTP_LENGTH } from '../../components/auth/OtpCodeInput';

type RegistrationStep = 'form' | 'otp' | 'success';

const OTP_RESEND_COOLDOWN_SECONDS = 60;
const POST_VERIFY_REDIRECT_MS = 1800;

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

const maskEmailAddress = (email: string): string => {
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0) return '';
  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx);
  if (local.length <= 2) {
    return `${local[0]}***${domain}`;
  }
  return `${local.slice(0, 2)}${'*'.repeat(Math.min(local.length - 2, 6))}${domain}`;
};

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  // Multi-step flow state
  const [step, setStep] = useState<RegistrationStep>('form');
  const [registeredEnrollment, setRegisteredEnrollment] = useState<string>('');
  const [registeredEmail, setRegisteredEmail] = useState<string>('');

  // In-memory ref only (never persisted to storage, cleared on verify/unmount)
  const pendingPayloadRef = useRef<AdvocateRegisterPayload | null>(null);
  const registerInFlightRef = useRef<boolean>(false);
  const verifyInFlightRef = useRef<boolean>(false);
  const resendInFlightRef = useRef<boolean>(false);

  // OTP State (strictly in-memory)
  const [otp, setOtp] = useState<string>('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState<boolean>(false);
  const [isResendingOtp, setIsResendingOtp] = useState<boolean>(false);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState<boolean>(false);

  // Form errors & display state
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Clear sensitive in-memory refs on unmount
  useEffect(() => {
    return () => {
      pendingPayloadRef.current = null;
    };
  }, []);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => {
      setResendCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Safe hardware back handling on Android OTP verification step
  useEffect(() => {
    if (Platform.OS !== 'android' || step !== 'otp') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowLeaveConfirm(true);
      return true;
    });
    return () => subscription.remove();
  }, [step]);

  // Navigate to Login automatically after verification success banner is shown
  useEffect(() => {
    if (step !== 'success') return;
    const redirectTimer = setTimeout(() => {
      router.replace('/(auth)/login');
    }, POST_VERIFY_REDIRECT_MS);
    return () => clearTimeout(redirectTimer);
  }, [step, router]);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    shouldUnregister: false,
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

  const unwrapErrorValue = (value: unknown): string | null => {
    if (!value) return null;
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const extracted = unwrapErrorValue(item);
        if (extracted) return extracted;
      }
      return null;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      // Handle DRF custom_exception_handler shape: { success: false, error: { code, message, status_code } }
      if ('error' in record) {
        const extracted = unwrapErrorValue(record.error);
        if (extracted) return extracted;
      }
      if ('message' in record) {
        const extracted = unwrapErrorValue(record.message);
        if (extracted) return extracted;
      }
      if ('detail' in record) {
        const extracted = unwrapErrorValue(record.detail);
        if (extracted) return extracted;
      }
      if ('non_field_errors' in record) {
        const extracted = unwrapErrorValue(record.non_field_errors);
        if (extracted) return extracted;
      }
      for (const [key, val] of Object.entries(record)) {
        if (key === 'success' || key === 'code' || key === 'status_code') continue;
        const extracted = unwrapErrorValue(val);
        if (extracted) return extracted;
      }
    }
    return null;
  };

  const extractApiError = (
    err: unknown,
    defaultFallback: string
  ): { status?: number; message: string } => {
    if (err && typeof err === 'object' && 'response' in err) {
      const res = (
        err as {
          response?: {
            status?: number;
            data?: Record<string, unknown>;
          };
        }
      ).response;

      const status = res?.status;
      const extracted = unwrapErrorValue(res?.data);
      return { status, message: extracted || defaultFallback };
    }
    return { message: defaultFallback };
  };

  // Step 1: Submit Registration Form
  const onSubmitRegistration = async (data: RegisterFormData) => {
    if (registerInFlightRef.current) return;
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

    const trimmedPhone = data.phoneNumber.trim();
    const trimmedChamber = data.chamberAddress.trim();

    const payload: AdvocateRegisterPayload = {
      enrollment_number: data.enrollmentNumber.trim().toUpperCase(),
      email: data.email.trim().toLowerCase(),
      first_name: data.firstName.trim(),
      last_name: data.lastName.trim(),
      ...(trimmedPhone ? { phone_number: trimmedPhone } : {}),
      ...(trimmedChamber ? { chamber_address: trimmedChamber } : {}),
      password: data.password,
      confirm_password: data.confirmPassword,
    };

    registerInFlightRef.current = true;
    try {
      const response = await authService.register(payload);

      const confirmedEnrollment =
        response?.enrollment_number?.trim().toUpperCase() || payload.enrollment_number;
      setRegisteredEnrollment(confirmedEnrollment);
      setRegisteredEmail(payload.email);
      pendingPayloadRef.current = payload;
      setOtp('');
      setOtpError(null);
      setShowLeaveConfirm(false);
      setOtpNotice(
        t(
          'auth.otpInitialSentNotice',
          'Registration submitted. Enter the 6-digit OTP sent to your email to activate your account.'
        )
      );
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setStep('otp');
    } catch (err: unknown) {
      const { status, message } = extractApiError(
        err,
        t(
          'auth.registrationFailed',
          'Could not complete registration. Please check your details and try again.'
        )
      );
      if (status === 429) {
        setAuthError(
          t(
            'auth.otpRateLimitError',
            'Too many requests. Please wait a moment before trying again.'
          )
        );
      } else {
        setAuthError(message);
      }
    } finally {
      registerInFlightRef.current = false;
    }
  };

  // Step 2: Submit OTP Verification
  const onVerifyOtp = async () => {
    if (verifyInFlightRef.current || isVerifyingOtp) return;
    setOtpError(null);
    setOtpNotice(null);
    setShowLeaveConfirm(false);

    const cleanedOtp = otp.trim();
    if (!cleanedOtp) {
      setOtpError(t('auth.otpRequired', 'Please enter the 6-digit OTP.'));
      return;
    }

    if (cleanedOtp.length !== OTP_LENGTH || !/^\d{6}$/.test(cleanedOtp)) {
      setOtpError(t('auth.otpInvalidLength', 'OTP must be a 6-digit numeric code.'));
      return;
    }

    verifyInFlightRef.current = true;
    setIsVerifyingOtp(true);
    try {
      const response = await authService.verifyRegistrationOtp({
        enrollment_number: registeredEnrollment,
        otp: cleanedOtp,
      });

      // Confirm backend activation (do not store/bypass login JWTs)
      const isActivated =
        response?.user?.is_active !== false &&
        response?.user?.profile?.is_verified !== false;

      if (!isActivated) {
        setOtpError(
          t(
            'auth.otpActivationUnconfirmed',
            'Verification response could not confirm account activation. Please try again.'
          )
        );
        return;
      }

      // Clear sensitive in-memory state immediately upon verified activation
      pendingPayloadRef.current = null;
      setOtp('');
      setOtpError(null);
      setOtpNotice(null);
      setStep('success');
    } catch (err: unknown) {
      const { status, message } = extractApiError(
        err,
        t(
          'auth.otpVerificationFailed',
          'OTP verification failed. Please check the code and try again.'
        )
      );
      const lower = message.toLowerCase();
      if (status === 429) {
        setOtpError(
          t(
            'auth.otpRateLimitError',
            'Too many requests. Please wait a moment before trying again.'
          )
        );
      } else if (lower.includes('expired')) {
        setOtpError(
          t(
            'auth.otpExpiredError',
            'This OTP has expired. Please request a new OTP to continue.'
          )
        );
      } else if (
        lower.includes('maximum verification attempts') ||
        lower.includes('attempts exceeded')
      ) {
        setOtpError(
          t(
            'auth.otpMaxAttemptsError',
            'Maximum verification attempts exceeded. Please request a new OTP.'
          )
        );
      } else {
        setOtpError(message);
      }
    } finally {
      verifyInFlightRef.current = false;
      setIsVerifyingOtp(false);
    }
  };

  // Step 2 Action: Resend OTP using existing POST /api/auth/register/ contract
  const onResendOtp = async () => {
    if (
      resendCooldown > 0 ||
      resendInFlightRef.current ||
      isResendingOtp ||
      !pendingPayloadRef.current
    ) {
      return;
    }

    setOtpError(null);
    setOtpNotice(null);
    setShowLeaveConfirm(false);
    resendInFlightRef.current = true;
    setIsResendingOtp(true);

    try {
      await authService.register(pendingPayloadRef.current);
      setOtpNotice(
        t(
          'auth.otpResentSuccess',
          'A new 6-digit verification OTP has been sent to your email.'
        )
      );
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setOtp('');
    } catch (err: unknown) {
      const { status, message } = extractApiError(
        err,
        t('auth.otpResendFailed', 'Could not resend OTP. Please try again.')
      );
      if (status === 429) {
        setOtpError(
          t(
            'auth.otpRateLimitError',
            'Too many requests. Please wait a moment before trying again.'
          )
        );
      } else {
        setOtpError(message);
      }
    } finally {
      resendInFlightRef.current = false;
      setIsResendingOtp(false);
    }
  };

  // Step 2 Action: Confirmed return to Registration Form
  const onConfirmBackToForm = () => {
    setOtp('');
    setOtpError(null);
    setOtpNotice(null);
    setShowLeaveConfirm(false);
    setStep('form');
  };

  // =========================================================================
  // Screen 3: Verification Success View
  // =========================================================================
  if (step === 'success') {
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
              <Text style={styles.successHeading} testID="register-success-heading">
                {t('auth.otpVerifiedTitle', 'Account Verified & Activated!')}
              </Text>
              <Text style={styles.successMessage} testID="register-success-message">
                {t(
                  'auth.otpVerifiedMessage',
                  'Your advocate account ({{enrollmentNumber}}) has been verified and activated. You can now sign in with your Bar Council enrollment ID.',
                  { enrollmentNumber: registeredEnrollment }
                )}
              </Text>
              <Text style={styles.redirectingText}>
                {t('auth.redirectingToLogin', 'Redirecting to Sign In...')}
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

  // =========================================================================
  // Screen 2: OTP Verification View
  // =========================================================================
  if (step === 'otp') {
    const maskedEmail = maskEmailAddress(registeredEmail);

    return (
      <ScreenContainer testID="register-otp-screen">
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
              {/* Back to Form link (returns directly to registration form with fields preserved) */}
              <TouchableOpacity
                onPress={onConfirmBackToForm}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.welcomeBackLink}
                accessibilityRole="button"
                accessibilityLabel={t('auth.otpBackToForm', 'Edit Registration Details')}
                testID="register-otp-back-button"
              >
                <AppIcon name="arrow-left" size={16} color={Colors.primary} />
                <Text style={styles.welcomeBackText}>
                  {t('auth.otpBackToForm', 'Edit Registration Details')}
                </Text>
              </TouchableOpacity>

              {/* Branding Header */}
              <View style={styles.brandingContainer}>
                <View style={styles.logoRow}>
                  <View style={styles.logoBadge} testID="register-otp-logo">
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

              {/* Safe Back Navigation Warning Banner */}
              {showLeaveConfirm ? (
                <View style={styles.warningBanner} testID="register-otp-leave-confirm">
                  <View style={styles.warningHeaderRow}>
                    <AppIcon name="alert-triangle" size={16} color={Colors.warning} />
                    <Text style={styles.warningTitle}>
                      {t('auth.otpLeaveWarningTitle', 'Account Not Yet Verified')}
                    </Text>
                  </View>
                  <Text style={styles.warningBody}>
                    {t(
                      'auth.otpLeaveWarningBody',
                      'Your account remains inactive until OTP verification is complete. Do you want to go back and edit your registration details?'
                    )}
                  </Text>
                  <View style={styles.warningActionsRow}>
                    <TouchableOpacity
                      onPress={() => setShowLeaveConfirm(false)}
                      style={styles.warningStayButton}
                      testID="register-otp-stay-button"
                    >
                      <Text style={styles.warningStayText}>
                        {t('auth.otpStayHere', 'Stay & Verify')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={onConfirmBackToForm}
                      style={styles.warningConfirmButton}
                      testID="register-otp-confirm-back-button"
                    >
                      <Text style={styles.warningConfirmText}>
                        {t('auth.otpConfirmBack', 'Back to Form')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {/* OTP Verification Card */}
              <Card style={styles.formCard}>
                <View style={styles.cardHeader}>
                  <Badge
                    label={t('auth.otpVerificationBadge', 'OTP VERIFICATION')}
                    variant="gold"
                    style={styles.roleBadge}
                  />
                  <Text style={styles.cardHeading} testID="register-otp-title">
                    {t('auth.otpTitle', 'Verify Your Account')}
                  </Text>
                  <Text style={styles.cardSubtext}>
                    {maskedEmail
                      ? t(
                          'auth.otpSubtitle',
                          'Enter the 6-digit verification code sent to {{email}} to activate your advocate account.',
                          { email: maskedEmail }
                        )
                      : t(
                          'auth.otpSubtitleNoEmail',
                          'Enter the 6-digit verification code sent to your registered email to activate your advocate account.'
                        )}
                  </Text>
                </View>

                {/* Enrollment ID Badge Display */}
                <View
                  style={styles.enrollmentDisplayBox}
                  testID="register-otp-enrollment-display"
                >
                  <AppIcon name="award" size={18} color={Colors.primary} />
                  <View style={styles.enrollmentDisplayTextGroup}>
                    <Text style={styles.enrollmentDisplayLabel}>
                      {t('auth.otpEnrollmentLabel', 'Bar Council Enrollment ID')}
                    </Text>
                    <Text style={styles.enrollmentDisplayValue}>
                      {registeredEnrollment}
                    </Text>
                  </View>
                </View>

                {/* Notice Banner (e.g. OTP sent / resent) */}
                {otpNotice ? (
                  <View style={styles.noticeBanner} testID="register-otp-success-banner">
                    <AppIcon name="check-circle" size={16} color={Colors.success} />
                    <Text style={styles.noticeBannerText}>{otpNotice}</Text>
                  </View>
                ) : null}

                {/* Error Banner */}
                {otpError ? (
                  <View style={styles.errorBanner} testID="register-otp-error-banner">
                    <AppIcon name="alert-circle" size={16} color={Colors.danger} />
                    <Text style={styles.errorBannerText}>{otpError}</Text>
                  </View>
                ) : null}

                {/* OTP Input Section */}
                <View style={styles.otpInputSection}>
                  <Text style={styles.otpInputLabel}>
                    {t('auth.otpCodeLabel', '6-Digit Verification Code (OTP)')}
                  </Text>

                  {/* 6 Digit Box Input */}
                  <OtpCodeInput
                    value={otp}
                    onChange={val => {
                      setOtp(val);
                      if (otpError) setOtpError(null);
                    }}
                    disabled={isVerifyingOtp}
                    hasError={Boolean(otpError)}
                    digitAccessibilityLabel={idx =>
                      t('auth.otpDigitAccessibility', 'OTP digit {{index}} of 6', {
                        index: idx,
                      })
                    }
                    testIDPrefix="register-otp-digit"
                  />

                  {/* Accessible Direct Input Field for Assistive Tools */}
                  <TextInput
                    value={otp}
                    onChangeText={txt => {
                      const numeric = txt.replace(/\D/g, '').slice(0, OTP_LENGTH);
                      setOtp(numeric);
                      if (otpError) setOtpError(null);
                    }}
                    editable={!isVerifyingOtp}
                    maxLength={OTP_LENGTH}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    pointerEvents="none"
                    style={styles.accessibleDirectInput}
                    testID="register-otp-input"
                    accessibilityLabel={t(
                      'auth.otpCodeLabel',
                      '6-Digit Verification Code (OTP)'
                    )}
                  />

                  <Text style={styles.otpHelperText}>
                    {t(
                      'auth.otpHelperHint',
                      'Enter or paste the 6-digit numeric code. Valid for 10 minutes.'
                    )}
                  </Text>
                </View>

                {/* Verify & Activate Button */}
                <Button
                  title={
                    isVerifyingOtp
                      ? t('auth.verifyingOtp', 'Verifying OTP...')
                      : t('auth.verifyOtpButton', 'Verify & Activate Account')
                  }
                  onPress={onVerifyOtp}
                  loading={isVerifyingOtp}
                  disabled={isVerifyingOtp}
                  style={styles.submitButton}
                  testID="register-otp-submit-button"
                />

                {/* Resend OTP Row */}
                <View style={styles.resendRow}>
                  <Text style={styles.resendPromptText}>
                    {t('auth.resendOtpPrompt', "Didn't receive the code?")}
                  </Text>
                  {resendCooldown > 0 ? (
                    <Text
                      style={styles.resendCooldownText}
                      testID="register-otp-cooldown-text"
                    >
                      {t('auth.resendOtpCooldown', 'Resend available in {{seconds}}s', {
                        seconds: resendCooldown,
                      })}
                    </Text>
                  ) : (
                    <TouchableOpacity
                      onPress={onResendOtp}
                      disabled={isResendingOtp}
                      style={styles.resendButton}
                      accessibilityRole="button"
                      testID="register-otp-resend-button"
                    >
                      <Text style={styles.resendButtonText}>
                        {isResendingOtp
                          ? t('auth.resendingOtp', 'Resending OTP...')
                          : t('auth.resendOtpButton', 'Resend OTP')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Card>

              {/* Security Compliance Footer */}
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

  // =========================================================================
  // Screen 1: Registration Form View (Default)
  // =========================================================================
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
                onPress={handleSubmit(onSubmitRegistration)}
                loading={isSubmitting}
                disabled={isSubmitting}
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
  enrollmentDisplayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceBlue,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    borderRadius: Radius.button,
    marginBottom: Spacing.md,
  },
  enrollmentDisplayTextGroup: {
    flex: 1,
  },
  enrollmentDisplayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  enrollmentDisplayValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 2,
  },
  warningBanner: {
    backgroundColor: Colors.warningSurface,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: Radius.card,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  warningHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.warning,
  },
  warningBody: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.text.secondary,
    marginBottom: Spacing.md,
  },
  warningActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  warningStayButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.button,
    backgroundColor: Colors.primary,
  },
  warningStayText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.white,
  },
  warningConfirmButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    backgroundColor: Colors.surface,
  },
  warningConfirmText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.warning,
  },
  otpInputSection: {
    marginVertical: Spacing.md,
  },
  otpInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  accessibleDirectInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
  otpHelperText: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: Spacing.sm,
    lineHeight: 16,
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
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.successSurface,
    borderWidth: 1,
    borderColor: Colors.successBorder,
    padding: Spacing.md,
    borderRadius: Radius.button,
    marginBottom: Spacing.md,
  },
  noticeBannerText: {
    flex: 1,
    color: Colors.success,
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
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  resendPromptText: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  resendCooldownText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.muted,
  },
  resendButton: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  resendButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
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
    marginBottom: Spacing.sm,
  },
  redirectingText: {
    fontSize: 12,
    color: Colors.text.muted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
});
