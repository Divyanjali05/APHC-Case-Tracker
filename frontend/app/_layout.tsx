import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import { queryClient } from '../services/queryClient';
import { Colors } from '../constants/colors';
import { authService } from '../services/auth/authService';
import { AuthProvider, useAuth } from '../features/auth/AuthContext';
import { ToastProvider } from '../components/common/Toast';
import '../i18n';

LogBox.ignoreAllLogs();

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { isLoading, isAuthenticated, isDemo, role } = useAuth();

  useEffect(() => {
    const unsubscribe = authService.onSessionExpired(() => {
      queryClient.clear();
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const topSegment = segments[0] as string | undefined;
    const inAuthGroup = topSegment === '(auth)';
    const inTabsGroup = topSegment === '(tabs)';
    const inAdminGroup = topSegment === 'admin';
    const inCasesDetail = topSegment === 'cases';

    if (!isAuthenticated && !isDemo) {
      if (inTabsGroup || inAdminGroup || inCasesDetail) {
        router.replace('/');
      }
      return;
    }

    if (isDemo && !isAuthenticated) {
      if (inAdminGroup) {
        router.replace('/(tabs)');
      }
      return;
    }

    if (isAuthenticated) {
      if (inAdminGroup && role !== 'ADMIN') {
        router.replace('/(tabs)');
      } else if (inAuthGroup) {
        router.replace(role === 'ADMIN' ? '/admin' : '/(tabs)');
      }
    }
  }, [isLoading, isAuthenticated, isDemo, role, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.surface,
        },
        headerTintColor: Colors.text.primary,
        headerTitleStyle: {
          fontWeight: '700',
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
          title: 'APHC Case Tracker',
          headerShown: false,
        }}
      />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen
        name="(auth)/login"
        options={{
          title: 'Sign In',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="(auth)/forgot-password"
        options={{
          title: 'Reset Password',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="(auth)/reset-password"
        options={{
          title: 'Set New Password',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="cases/[id]"
        options={{
          title: 'Case Docket Details',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="+not-found"
        options={{
          title: 'Page Not Found',
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="dark" />
            <RootLayoutNav />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
