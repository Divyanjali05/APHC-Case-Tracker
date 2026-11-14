import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { queryClient } from '../services/queryClient';
import { Colors } from '../constants/colors';
import { AuthProvider, useAuth } from '../features/auth/AuthContext';
import { authService } from '../services/auth/authService';
import { LoadingIndicator } from '../components/common/LoadingIndicator';
import '../i18n';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, signOut } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const segs = segments as string[];
  const firstSegment = segs[0];
  const secondSegment = segs[1];
  const inAuthGroup = firstSegment === '(auth)';
  const isProtectedNonTab = firstSegment === 'cases';
  const isProtectedTab =
    firstSegment === '(tabs)' && Boolean(secondSegment) && secondSegment !== 'index';

  useEffect(() => {
    const unsubscribe = authService.onSessionExpired(() => {
      void signOut();
    });
    return unsubscribe;
  }, [signOut]);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated && (isProtectedNonTab || isProtectedTab)) {
      router.replace('/');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, inAuthGroup, isProtectedNonTab, isProtectedTab, router]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIndicator />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <AuthGate>
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
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="(auth)/login"
                options={{
                  title: 'Advocate Login',
                  headerShown: true,
                }}
              />
              <Stack.Screen
                name="(auth)/register"
                options={{
                  title: 'Advocate Registration',
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
          </AuthGate>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
