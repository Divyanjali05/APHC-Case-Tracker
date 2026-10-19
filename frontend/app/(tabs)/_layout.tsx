import React from 'react';
import { Tabs } from 'expo-router';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.surface,
        },
        headerTintColor: Colors.text.primary,
        headerTitleStyle: {
          fontWeight: '700',
        },
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.primaryLight,
        tabBarInactiveTintColor: Colors.text.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.dashboard'),
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
          tabBarLabel: ({ color }) => (
            <Text style={[styles.tabLabel, { color }]}>{t('tabs.cases')}</Text>
          ),
          headerTitle: t('cases.title'),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: t('tabs.reminders'),
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
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
