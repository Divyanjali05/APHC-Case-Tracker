import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { queryClient } from '../services/queryClient';
import { Colors } from '../constants/colors';
import { authService } from '../services/auth/authService';
import { tokenStorage } from '../services/auth/tokenStorage';
import '../i18n';
import { LogBox } from 'react-native';

LogBox.ignoreAllLogs();

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    const checkInitialAuth = async () => {
      try {
        const token = await tokenStorage.getAccessToken();
        if (!token && isMounted) {
          router.replace('/(auth)/login');
        }
      } catch {
        if (isMounted) {
          router.replace('/(auth)/login');
        }
      }
    };
    checkInitialAuth();

    const unsubscribe = authService.onSessionExpired(() => {
      router.replace('/(auth)/login');
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [router]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: Colors.surface,
            },
            headerTintColor: Colors.text.primary,
            headerTitleStyle: {
              fontWeight: '700',
            },
            contentStyle: {
              backgroundColor: Colors.background,
            },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="(auth)/login"
            options={{
              title: 'Advocate Login',
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
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
