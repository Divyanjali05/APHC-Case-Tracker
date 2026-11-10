import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '../../components/common/AppIcon';
import { Colors } from '../../constants/colors';
import { Shadows } from '../../constants/theme';

export default function TabLayout() {
  const { t } = useTranslation();

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
          fontSize: 18,
        },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          ...Shadows.subtle,
        },
        tabBarItemStyle: {
          minHeight: 48,
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: 2,
        },
        tabBarLabelStyle: styles.tabLabel,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.text.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home', 'Home'),
          tabBarTestID: 'tab-dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <AppIcon
              name="home"
              size={size || 21}
              color={color}
              strokeWidth={focused ? 2.2 : 1.8}
            />
          ),
          headerTitle: t('common.appName', 'APHC Case Tracker'),
        }}
      />
      <Tabs.Screen
        name="cases"
        options={{
          title: t('tabs.cases', 'Cases'),
          tabBarTestID: 'tab-cases',
          tabBarIcon: ({ color, size, focused }) => (
            <AppIcon
              name="briefcase"
              size={size || 21}
              color={color}
              strokeWidth={focused ? 2.2 : 1.8}
            />
          ),
          headerTitle: t('cases.title', 'My Tracked Cases'),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('tabs.calendar', 'Calendar'),
          tabBarTestID: 'tab-calendar',
          tabBarIcon: ({ color, size, focused }) => (
            <AppIcon
              name="calendar"
              size={size || 21}
              color={color}
              strokeWidth={focused ? 2.2 : 1.8}
            />
          ),
          headerTitle: t('calendar.title', 'Daily Agenda & Calendar'),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('tabs.more', 'More'),
          tabBarTestID: 'tab-more',
          tabBarIcon: ({ color, size, focused }) => (
            <AppIcon
              name="more-horizontal"
              size={size || 21}
              color={color}
              strokeWidth={focused ? 2.2 : 1.8}
            />
          ),
          headerTitle: t('more.title', 'More & Workspace'),
        }}
      />

      {/* Secondary routes hidden from 4-tab bar, accessible via More and Dashboard */}
      <Tabs.Screen
        name="reminders"
        options={{
          href: null,
          title: t('tabs.reminders', 'Reminders'),
          headerTitle: t('reminders.title', 'Deadlines & Reminders'),
        }}
      />
      <Tabs.Screen
        name="tokens"
        options={{
          href: null,
          title: t('tabs.tokens', 'Tokens'),
          headerTitle: t('tokens.title', 'Live Court Display Board & Tokens'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          title: t('tabs.settings', 'Settings'),
          headerTitle: t('settings.title', 'Preferences & Profile'),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
    marginBottom: 1,
    letterSpacing: 0.1,
  },
});
