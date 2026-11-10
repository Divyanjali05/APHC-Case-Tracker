import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Input } from '../../components/common/Input';
import { AppIcon } from '../../components/common/AppIcon';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useToast } from '../../components/common/Toast';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { useAuth } from '../../features/auth/AuthContext';
import { speechService } from '../../services/speech/ttsService';
import { pushNotificationService } from '../../services/notifications/pushService';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;

  const { user, isAuthenticated, isAdmin, signOut, updateProfile } = useAuth();
  const { showToast } = useToast();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.profile?.phone_number || '');
  const [chamberAddress, setChamberAddress] = useState(
    user?.profile?.chamber_address || ''
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isLogoutDialogVisible, setIsLogoutDialogVisible] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);

  useEffect(() => {
    setFirstName(user?.first_name || '');
    setLastName(user?.last_name || '');
    setEmail(user?.email || '');
    setPhoneNumber(user?.profile?.phone_number || '');
    setChamberAddress(user?.profile?.chamber_address || '');
  }, [user]);

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    showToast('Language updated.', 'info');
  };

  const handleTestSpeech = () => {
    const text = `${t('common.courtName')}. ${t(
      'settings.textToSpeech'
    )} test successful.`;
    speechService.speak(text, i18n.language);
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone_number: phoneNumber.trim(),
        chamber_address: chamberAddress.trim(),
      });
      setIsEditingProfile(false);
      showToast('Profile details saved successfully.', 'success');
    } catch {
      showToast('Unable to update profile details. Please try again.', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleConfirmLogout = async () => {
    setIsSigningOut(true);
    try {
      await pushNotificationService.deactivatePushNotifications().catch(() => {});
      await signOut();
      setIsLogoutDialogVisible(false);
      showToast('Signed out securely.', 'info');
      router.replace('/');
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleOpenPrivacyPolicy = async () => {
    const url = 'https://aphccasetracker.in/privacy-policy';
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert(
        'Privacy Policy (DPDP Act, 2023)',
        'APHC Case Tracker processes your enrollment ID, case dockets, and voice memos strictly with your consent. Voice notes are encrypted and never shared with third parties or used for AI training.\n\nFull policy: https://aphccasetracker.in/privacy-policy'
      );
    }
  };

  const handleOpenTerms = async () => {
    const url = 'https://aphccasetracker.in/terms';
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert(
        'Terms of Use',
        'APHC Case Tracker is an independent productivity tool for advocates. Public court records are displayed AS-IS. Always verify listings against official Registry cause lists.\n\nFull terms: https://aphccasetracker.in/terms'
      );
    }
  };

  const handleShowDisclaimer = () => {
    Alert.alert(
      'Non-Government Affiliation',
      'APHC Case Tracker is an independent application and is NOT an official app of the High Court of Andhra Pradesh or the Government.\n\nఈ అప్లికేషన్ ఆంధ్రప్రదేశ్ హైకోర్టు లేదా ప్రభుత్వ అధికారిక అప్లికేషన్ కాదు. ఇది న్యాయవాదుల వ్యక్తిగత కేస్ నిర్వహణ కొరకు స్వతంత్రంగా రూపొందించబడింది.'
    );
  };

  const enrollmentId =
    user?.profile?.bar_council_enrollment_number || user?.username || 'AP/1234/2020';

  return (
    <ScreenContainer testID="settings-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
          {/* Profile Summary & Edit Card */}
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{t('settings.profile', 'My Profile')}</Text>
              <View style={styles.profileBadges}>
                <Badge
                  label={
                    user?.profile?.is_verified
                      ? 'VERIFIED ADVOCATE'
                      : isAdmin
                        ? 'ADMINISTRATOR'
                        : 'ADVOCATE'
                  }
                  variant="gold"
                />
              </View>
            </View>

            {isEditingProfile ? (
              <View style={styles.editFormWrap} testID="settings-edit-profile-form">
                <Input
                  label="First Name"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  testID="profile-first-name-input"
                />
                <Input
                  label="Last Name"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  testID="profile-last-name-input"
                />
                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="advocate@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  testID="profile-email-input"
                />
                <Input
                  label="Phone Number"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="+91 9876543210"
                  keyboardType="phone-pad"
                  testID="profile-phone-input"
                />
                <Input
                  label="Chamber Address"
                  value={chamberAddress}
                  onChangeText={setChamberAddress}
                  placeholder="Chambers / High Court Road, Amaravati"
                  testID="profile-chamber-input"
                />
                <View style={styles.editActionsRow}>
                  <Button
                    title={t('common.cancel', 'Cancel')}
                    variant="secondary"
                    onPress={() => setIsEditingProfile(false)}
                    style={styles.editActionBtn}
                  />
                  <Button
                    title={t('common.save', 'Save Changes')}
                    variant="primary"
                    onPress={handleSaveProfile}
                    loading={isSavingProfile}
                    style={styles.editActionBtn}
                    testID="settings-save-profile-button"
                  />
                </View>
              </View>
            ) : (
              <>
                {user?.full_name ? (
                  <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>Name</Text>
                    <Text style={styles.profileValue}>{user.full_name}</Text>
                  </View>
                ) : null}
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>Enrollment / Account ID</Text>
                  <Text style={styles.profileValue}>{enrollmentId}</Text>
                </View>
                {user?.email ? (
                  <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>Email</Text>
                    <Text style={styles.profileValue}>{user.email}</Text>
                  </View>
                ) : null}
                {user?.profile?.phone_number ? (
                  <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>Contact Phone</Text>
                    <Text style={styles.profileValue}>{user.profile.phone_number}</Text>
                  </View>
                ) : null}
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>Jurisdiction</Text>
                  <Text style={styles.profileValue}>Andhra Pradesh High Court</Text>
                </View>
                <View style={[styles.profileRow, styles.profileRowLast]}>
                  <Text style={styles.profileLabel}>Chamber</Text>
                  <Text style={styles.profileValue} numberOfLines={1}>
                    {user?.profile?.chamber_address || 'APHC Advocates Association'}
                  </Text>
                </View>

                {isAuthenticated ? (
                  <Button
                    title="Edit My Profile"
                    variant="outline"
                    onPress={() => setIsEditingProfile(true)}
                    style={styles.editProfileBtn}
                    testID="settings-edit-profile-button"
                  />
                ) : null}
              </>
            )}
          </Card>

          {/* Language Selection Card */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('settings.language')}</Text>
            <Text style={styles.cardSubtitle}>
              Select your primary language for court alerts and docket translation.
            </Text>

            <View style={styles.languageOptions}>
              {[
                { code: 'en', label: 'English', native: 'English' },
                { code: 'te', label: 'Telugu', native: 'తెలుగు' },
                { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
              ].map(lang => {
                const isSelected = i18n.language === lang.code;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[styles.langOption, isSelected && styles.langOptionSelected]}
                    onPress={() => changeLanguage(lang.code)}
                    testID={`lang-option-${lang.code}`}
                  >
                    <Text
                      style={[
                        styles.langOptionText,
                        isSelected && styles.langOptionTextSelected,
                      ]}
                    >
                      {lang.native} ({lang.label})
                    </Text>
                    {isSelected ? (
                      <AppIcon name="check" size={16} color={Colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>

          {/* Notifications Preference */}
          <Card style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingTitle}>{t('settings.notifications')}</Text>
                <Text style={styles.settingDescription}>
                  Receive alerts when your matter is 5 tokens away in the cause list.
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={async (enabled: boolean) => {
                  setNotificationsEnabled(enabled);
                  if (enabled) {
                    await pushNotificationService
                      .registerForPushNotifications()
                      .catch(() => {});
                  } else {
                    await pushNotificationService
                      .deactivatePushNotifications()
                      .catch(() => {});
                  }
                  showToast(
                    enabled ? 'Push alerts enabled.' : 'Push alerts paused.',
                    'info'
                  );
                }}
                trackColor={{ false: Colors.borderStrong, true: Colors.primary }}
                thumbColor={Colors.surface}
              />
            </View>
          </Card>

          {/* Speech / Audio Assistance Card */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('settings.textToSpeech')}</Text>
            <Text style={styles.cardSubtitle}>
              Test text-to-speech audio pronunciation in your selected court language.
            </Text>
            <Button
              title="Test Voice Announcement"
              variant="outline"
              onPress={handleTestSpeech}
              style={styles.voiceTestButton}
              testID="test-voice-button"
            />
          </Card>

          {/* Legal, Privacy & Compliance Card */}
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Legal & Privacy Compliance</Text>
              <Badge label="DPDP 2023" variant="secondary" />
            </View>
            <Text style={styles.cardSubtitle}>
              APHC Case Tracker is an independent legal utility. Your case notes and voice
              memos are confidential and encrypted.
            </Text>

            <TouchableOpacity
              style={styles.legalRow}
              onPress={handleOpenPrivacyPolicy}
              testID="settings-privacy-policy-link"
            >
              <View style={styles.legalRowLeft}>
                <AppIcon name="file-text" size={16} color={Colors.primary} />
                <Text style={styles.legalLinkText}>Privacy Policy (DPDP Act, 2023)</Text>
              </View>
              <AppIcon name="chevron-right" size={16} color={Colors.text.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.legalRow}
              onPress={handleOpenTerms}
              testID="settings-terms-link"
            >
              <View style={styles.legalRowLeft}>
                <AppIcon name="scale" size={16} color={Colors.primary} />
                <Text style={styles.legalLinkText}>Terms of Use</Text>
              </View>
              <AppIcon name="chevron-right" size={16} color={Colors.text.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.legalRow}
              onPress={handleShowDisclaimer}
              testID="settings-disclaimer-link"
            >
              <View style={styles.legalRowLeft}>
                <AppIcon name="landmark" size={16} color={Colors.primary} />
                <Text style={styles.legalLinkText}>
                  Non-Government Disclaimer (English / తెలుగు)
                </Text>
              </View>
              <AppIcon name="chevron-right" size={16} color={Colors.text.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.legalRow, styles.deleteRow]}
              onPress={() => setIsDeleteDialogVisible(true)}
              testID="settings-delete-account-link"
            >
              <View style={styles.legalRowLeft}>
                <AppIcon name="trash" size={16} color={Colors.danger} />
                <Text style={styles.deleteLinkText}>Delete Account & Personal Data</Text>
              </View>
              <AppIcon name="chevron-right" size={16} color={Colors.danger} />
            </TouchableOpacity>
          </Card>

          {/* Sign Out Button */}
          <View style={styles.logoutContainer}>
            <Button
              title={t('settings.logout', 'Sign Out')}
              variant="outline"
              onPress={() => setIsLogoutDialogVisible(true)}
              style={styles.logoutBtn}
              testID="settings-logout-button"
            />
          </View>
        </View>
      </ScrollView>

      {/* Sign Out Confirmation */}
      <ConfirmDialog
        visible={isLogoutDialogVisible}
        title={t('settings.logout', 'Sign Out')}
        message="Are you sure you want to sign out from APHC Case Tracker?"
        confirmLabel={t('settings.logout', 'Sign Out')}
        cancelLabel={t('common.cancel', 'Cancel')}
        destructive
        loading={isSigningOut}
        iconName="log-out"
        onConfirm={handleConfirmLogout}
        onCancel={() => setIsLogoutDialogVisible(false)}
        testID="settings-logout-confirm"
      />

      {/* Deletion Request Confirmation */}
      <ConfirmDialog
        visible={isDeleteDialogVisible}
        title="Delete Account & Personal Data"
        message="Under the DPDP Act, 2023, you may request permanent erasure of your account, case dockets, notes, and voice recordings within 30 days."
        confirmLabel="Request Deletion"
        cancelLabel="Cancel"
        destructive
        iconName="trash"
        onConfirm={() => {
          setIsDeleteDialogVisible(false);
          showToast(
            'Deletion request registered. Contact grievance@aphccasetracker.in for expedited review.',
            'info'
          );
        }}
        onCancel={() => setIsDeleteDialogVisible(false)}
        testID="settings-delete-confirm"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  mainWrapper: {
    width: '100%',
  },
  desktopContainer: {
    maxWidth: 900,
    alignSelf: 'center',
    width: '100%',
  },
  card: {
    padding: 18,
    marginBottom: 16,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadows.subtle,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileBadges: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  cardTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  profileRowLast: {
    borderBottomWidth: 0,
  },
  profileLabel: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
  profileValue: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  editProfileBtn: {
    marginTop: Spacing.md,
  },
  editFormWrap: {
    marginTop: Spacing.xs,
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  editActionBtn: {
    flex: 1,
  },
  languageOptions: {
    gap: 8,
  },
  langOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.button,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 48,
  },
  langOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceBlue,
  },
  langOptionText: {
    color: Colors.text.secondary,
    fontSize: 14,
    fontWeight: '500',
  },
  langOptionTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  settingDescription: {
    color: Colors.text.secondary,
    fontSize: 12,
    lineHeight: 16,
  },
  voiceTestButton: {
    marginTop: 8,
    minHeight: 44,
  },
  logoutContainer: {
    marginTop: 8,
  },
  logoutBtn: {
    borderColor: Colors.dangerBorder,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  legalRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  legalLinkText: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  deleteRow: {
    borderBottomWidth: 0,
    marginTop: 4,
  },
  deleteLinkText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
});
