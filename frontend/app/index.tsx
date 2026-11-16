import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../features/auth/AuthContext';
import { MainHomePage } from '../components/home/MainHomePage';
import { LoadingIndicator } from '../components/common/LoadingIndicator';

export default function WelcomeScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, role } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace(role === 'ADMIN' ? '/admin' : '/(tabs)');
    }
  }, [isLoading, isAuthenticated, role, router]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIndicator />
      </View>
    );
  }

  return (
    <MainHomePage
      onLoginPress={() => router.push('/(auth)/login')}
      onRegisterPress={() => router.push('/(auth)/register')}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3FA',
  },
});
