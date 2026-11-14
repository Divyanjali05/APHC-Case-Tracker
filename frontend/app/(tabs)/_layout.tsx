import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../features/auth/AuthContext';
import { MainHomePage } from '../../components/home/MainHomePage';
import { LoadingIndicator } from '../../components/common/LoadingIndicator';

export default function TabLayout() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIndicator />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <MainHomePage />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.surface,
          borderBottomColor: Colors.border,
          borderBottomWidth: 1,
        },
        headerTintColor: Colors.text.primary,
        headerTitleStyle: {
          fontWeight: '700',
        },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.text.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.dashboard'),
          tabBarTestID: 'tab-dashboard',
          tabBarLabel: ({ color }) => (
            <Text style={[styles.tabLabel, { color }]}>{t('tabs.dashboard')}</Text>
          ),
          headerTitle: t('common.appName'),
        }}
      />
      <Tabs.Screen
        name="cases"
        options={{
          title: t('tabs.cases'),
          tabBarTestID: 'tab-cases',
          tabBarLabel: ({ color }) => (
            <Text style={[styles.tabLabel, { color }]}>{t('tabs.cases')}</Text>
          ),
          headerTitle: t('cases.title'),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('tabs.calendar', 'Calendar'),
          tabBarTestID: 'tab-calendar',
          tabBarLabel: ({ color }) => (
            <Text style={[styles.tabLabel, { color }]}>{t('tabs.calendar', 'Calendar')}</Text>
          ),
          headerTitle: t('calendar.title', 'Daily Agenda & Calendar'),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: t('tabs.reminders'),
          tabBarTestID: 'tab-reminders',
          tabBarLabel: ({ color }) => (
            <Text style={[styles.tabLabel, { color }]}>{t('tabs.reminders')}</Text>
          ),
          headerTitle: t('reminders.title'),
        }}
      />
      <Tabs.Screen
        name="tokens"
        options={{
          title: t('tabs.tokens'),
          tabBarTestID: 'tab-tokens',
          tabBarLabel: ({ color }) => (
            <Text style={[styles.tabLabel, { color }]}>{t('tabs.tokens')}</Text>
          ),
          headerTitle: t('tokens.title'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarTestID: 'tab-settings',
          tabBarLabel: ({ color }) => (
            <Text style={[styles.tabLabel, { color }]}>{t('tabs.settings')}</Text>
          ),
          headerTitle: t('settings.title'),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
