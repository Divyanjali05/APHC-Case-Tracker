import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import { fetchHealthCheck } from '../services/api';

export default function HomeScreen() {
  const { t, i18n } = useTranslation();

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

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'te' ? 'en' : 'te';
    i18n.changeLanguage(nextLang);
  };

  return (
    <ScreenContainer testID="home-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Court Header */}
        <View style={styles.courtHeader}>
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>APHC AMARAVATI</Text>
          </View>
          <TouchableOpacity
            onPress={toggleLanguage}
            style={styles.langButton}
            accessibilityLabel="Toggle Language"
            testID="language-toggle-button"
          >
            <Text style={styles.langButtonText}>
              {i18n.language === 'te' ? 'English' : 'తెలుగు'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Hero Section */}
        <View style={styles.heroCard}>
          <Text style={styles.courtTitle}>{t('common.courtName')}</Text>
          <Text style={styles.heroTitle}>{t('common.appName')}</Text>
          <Text style={styles.heroDescription}>{t('dashboard.description')}</Text>
        </View>

        {/* Status / Health Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('dashboard.status')}</Text>
            <View
              style={[
                styles.statusIndicator,
                health ? styles.statusOnline : styles.statusOffline,
              ]}
            >
              <Text style={styles.statusIndicatorText}>
                {health ? 'ONLINE' : isLoading ? 'CHECKING' : 'OFFLINE'}
              </Text>
            </View>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.loadingText}>{t('common.loading')}</Text>
            </View>
          ) : isError || !health ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{t('dashboard.backendDisconnected')}</Text>
              <Text style={styles.errorSubtext}>
                API: {process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api'}
              </Text>
              <Button
                title={t('common.retry')}
                variant="outline"
                onPress={() => refetch()}
                style={styles.retryButton}
                testID="health-retry-button"
              />
            </View>
          ) : (
            <View style={styles.statusDetails}>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Service</Text>
                <Text style={styles.statusValue}>{health.service}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>API Version</Text>
                <Text style={styles.statusValue}>{health.version}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Database</Text>
                <Text style={styles.statusValue}>
                  {health.engine} ({health.database})
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Phase 0 Checkpoint Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Phase 0 Checkpoint</Text>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>✓</Text>
            <Text style={styles.featureText}>
              Django 5.1 REST Framework & Celery Ready
            </Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>✓</Text>
            <Text style={styles.featureText}>
              React Native Expo & TanStack Query Configured
            </Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>✓</Text>
            <Text style={styles.featureText}>
              i18next English & Telugu Localization Setup
            </Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>✓</Text>
            <Text style={styles.featureText}>
              Docker Compose for PostgreSQL & Redis Prepared
            </Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>✓</Text>
            <Text style={styles.featureText}>
              CodeRabbit AI Pull-Request Reviews Configured
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  courtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  badgeContainer: {
    backgroundColor: '#1E293B',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  badgeText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  langButton: {
    backgroundColor: '#1E293B',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  langButtonText: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '600',
  },
  heroCard: {
    backgroundColor: '#0F172A',
    padding: 24,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  courtTitle: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  heroTitle: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 10,
  },
  heroDescription: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#0F172A',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    color: '#F1F5F9',
    fontSize: 17,
    fontWeight: '700',
  },
  statusIndicator: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusOnline: {
    backgroundColor: '#065F46',
  },
  statusOffline: {
    backgroundColor: '#7F1D1D',
  },
  statusIndicatorText: {
    color: '#ECFDF5',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    color: '#94A3B8',
    marginLeft: 10,
    fontSize: 14,
  },
  errorContainer: {
    paddingVertical: 8,
  },
  errorText: {
    color: '#F87171',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorSubtext: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 12,
  },
  retryButton: {
    marginTop: 6,
  },
  statusDetails: {
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  statusLabel: {
    color: '#94A3B8',
    fontSize: 13,
  },
  statusValue: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '600',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  featureIcon: {
    color: '#10B981',
    fontWeight: '900',
    fontSize: 16,
    marginRight: 10,
  },
  featureText: {
    color: '#CBD5E1',
    fontSize: 13,
    flex: 1,
  },
});
