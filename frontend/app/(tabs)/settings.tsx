import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Colors } from '../../constants/colors';
import { authService } from '../../services/auth/authService';
import { speechService } from '../../services/speech/ttsService';
import { pushNotificationService } from '../../services/notifications/pushService';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const handleTestSpeech = () => {
    const text = `${t('common.courtName')}. ${t(
      'settings.textToSpeech'
    )} test successful.`;
    speechService.speak(text, i18n.language);
  };

  const handleLogout = async () => {
    Alert.alert(
      t('settings.logout'),
      'Are you sure you want to sign out from APHC Case Tracker?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            await pushNotificationService.deactivatePushNotifications().catch(() => {});
            await authService.logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer testID="settings-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Summary Card */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('settings.profile')}</Text>
            <Badge label="VERIFIED ADVOCATE" variant="gold" />
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Enrollment ID</Text>
            <Text style={styles.profileValue}>AP/1234/2020</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Jurisdiction</Text>
            <Text style={styles.profileValue}>Andhra Pradesh High Court</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Practicing Bar</Text>
            <Text style={styles.profileValue}>APHC Advocates Association</Text>
          </View>
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
                  {isSelected ? <Text style={styles.checkIcon}>✓</Text> : null}
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
                  await pushNotificationService.registerForPushNotifications().catch(() => {});
                } else {
                  await pushNotificationService.deactivatePushNotifications().catch(() => {});
                }
              }}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={notificationsEnabled ? Colors.gold : Colors.text.muted}
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

        {/* Sign Out Button */}
        <View style={styles.logoutContainer}>
          <Button
            title={t('settings.logout')}
            variant="outline"
            onPress={handleLogout}
            testID="settings-logout-button"
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  card: {
    padding: 18,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  profileLabel: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
  profileValue: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  languageOptions: {
    gap: 8,
  },
  langOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  langOptionSelected: {
    borderColor: Colors.primaryLight,
    backgroundColor: '#1E3A8A33',
  },
  langOptionText: {
    color: Colors.text.secondary,
    fontSize: 14,
    fontWeight: '500',
  },
  langOptionTextSelected: {
    color: Colors.primaryLight,
    fontWeight: '700',
  },
  checkIcon: {
    color: Colors.gold,
    fontSize: 16,
    fontWeight: '900',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  },
  logoutContainer: {
    marginTop: 8,
  },
});
