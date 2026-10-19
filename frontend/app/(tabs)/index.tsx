import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { StatCard } from '../../components/dashboard/StatCard';
import { Colors } from '../../constants/colors';
import { fetchHealthCheck } from '../../services/api/client';
import { speechService } from '../../services/speech/ttsService';

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const {
    data: health,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['health-check'],
    queryFn: fetchHealthCheck,
    retry: 1,
  });

  const nextLanguage = () => {
    if (i18n.language === 'en') return 'te';
    if (i18n.language === 'te') return 'hi';
    return 'en';
  };

  const getLanguageLabel = () => {
    if (i18n.language === 'te') return 'తెలుగు';
    if (i18n.language === 'hi') return 'हिन्दी';
    return 'English';
  };

  const handleVoiceWelcome = () => {
    const text = `${t('common.courtName')}. ${t('dashboard.title')}.`;
    speechService.speak(text, i18n.language);
  };

  return (
    <ScreenContainer testID="dashboard-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Court Banner */}
        <View style={styles.topBar}>
          <Badge label="APHC AMARAVATI" variant="gold" />
          <TouchableOpacity
            onPress={() => i18n.changeLanguage(nextLanguage())}
            style={styles.langPill}
            testID="dashboard-lang-toggle"
          >
            <Text style={styles.langText}>{getLanguageLabel()}</Text>
          </TouchableOpacity>
        </View>

        {/* Hero Card */}
        <Card style={styles.heroCard}>
          <Text style={styles.courtTitle}>{t('common.courtName')}</Text>
          <Text style={styles.heroHeading}>{t('common.appName')}</Text>
          <Text style={styles.heroSubtext}>
            Comprehensive docket management, daily cause lists, and live court hall
            display board tracking.
          </Text>

          <View style={styles.voiceRow}>
            <Button
              title="Read Court Docket Summary"
              variant="outline"
              onPress={handleVoiceWelcome}
              style={styles.voiceButton}
              testID="voice-read-button"
            />
          </View>
        </Card>

        {/* Quick Stats Grid */}
        <View style={styles.statsGrid}>
          <StatCard
            title={t('dashboard.activeCases')}
            value="12"
            subtitle="Tracked matters"
          />
          <StatCard
            title={t('dashboard.todayHearings')}
            value="3"
            subtitle="Listed today"
          />
        </View>
        <View style={styles.statsGrid}>
          <StatCard
            title={t('dashboard.pendingReminders')}
            value="4"
            subtitle="Action items"
          />
          <StatCard
            title={t('dashboard.displayBoard')}
            value="Live"
            subtitle="Court Halls"
          />
        </View>

        {/* System Health / API Probe Card */}
        <Card>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('dashboard.status')}</Text>
            <Badge
              label={health ? 'CONNECTED' : isLoading ? 'CHECKING' : 'OFFLINE'}
              variant={health ? 'success' : 'danger'}
            />
          </View>

          {health ? (
            <View style={styles.statusDetails}>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Service</Text>
                <Text style={styles.statusValue}>{health.service}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Version</Text>
                <Text style={styles.statusValue}>{health.version}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Database</Text>
                <Text style={styles.statusValue}>
                  {health.engine} ({health.database})
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.offlineBox}>
              <Text style={styles.offlineText}>
                {isError ? t('dashboard.backendDisconnected') : 'Checking API status...'}
              </Text>
              <Button
                title={t('common.retry')}
                variant="outline"
                onPress={() => refetch()}
                style={styles.retryBtn}
              />
            </View>
          )}
        </Card>

        {/* Auth / Profile Shortcut */}
        <Card style={styles.authCard}>
          <Text style={styles.authTitle}>Advocate Account</Text>
          <Text style={styles.authSubtitle}>
            Sign in with your Bar Council enrollment ID to access personalized cause lists
            and token alerts.
          </Text>
          <Button
            title={t('auth.login')}
            onPress={() => router.push('/(auth)/login')}
            style={styles.authButton}
            testID="dashboard-login-button"
          />
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  langPill: {
    backgroundColor: Colors.surfaceSubtle,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  langText: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },
  heroCard: {
    padding: 22,
    marginBottom: 16,
  },
  courtTitle: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  heroHeading: {
    color: Colors.text.primary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroSubtext: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  voiceRow: {
    marginTop: 4,
  },
  voiceButton: {
    paddingVertical: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    marginHorizontal: -4,
    marginBottom: 10,
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
  },
  statusDetails: {
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statusLabel: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
  statusValue: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  offlineBox: {
    paddingVertical: 10,
  },
  offlineText: {
    color: Colors.text.muted,
    fontSize: 13,
    marginBottom: 10,
  },
  retryBtn: {
    paddingVertical: 8,
  },
  authCard: {
    marginTop: 6,
    padding: 18,
  },
  authTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  authSubtitle: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  authButton: {
    marginTop: 4,
  },
});
