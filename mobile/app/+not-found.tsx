import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';
import { ScreenContainer } from '../components/ScreenContainer';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Page Not Found' }} />
      <ScreenContainer>
        <View style={styles.container}>
          <Text style={styles.title}>404</Text>
          <Text style={styles.subtitle}>This screen does not exist.</Text>
          <Link href="/" style={styles.link}>
            <Text style={styles.linkText}>Return to Dashboard</Text>
          </Link>
        </View>
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    color: '#3B82F6',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    marginBottom: 24,
  },
  link: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  linkText: {
    color: '#60A5FA',
    fontSize: 15,
    fontWeight: '600',
  },
});
