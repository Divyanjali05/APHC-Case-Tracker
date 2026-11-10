import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../features/auth/AuthContext';

export default function AdminLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isLoading, isAuthenticated, isAdmin, isDemo } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || isDemo) {
      router.replace('/');
      return;
    }
    if (!isAdmin) {
      router.replace('/(tabs)');
    }
  }, [isLoading, isAuthenticated, isAdmin, isDemo, router]);

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.surface,
        },
        headerTintColor: Colors.text.primary,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 17,
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: Colors.background,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('admin.consoleTitle', 'Admin Console'),
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="users/index"
        options={{
          title: t('admin.userManagement', 'User Management'),
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="users/[id]"
        options={{
          title: t('admin.accountDetails', 'Account Details'),
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="cases"
        options={{
          title: t('admin.caseAssignment', 'Case Assignment'),
          headerShown: true,
        }}
      />
    </Stack>
  );
}
