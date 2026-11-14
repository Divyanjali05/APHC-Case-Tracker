import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { Colors } from '../constants/colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Page Not Found' }} />
      <ScreenContainer>
        <View style={styles.container}>
          <Text style={styles.title}>404</Text>
          <Text style={styles.subtitle}>This court docket or page does not exist.</Text>
          <Link href="/(tabs)" style={styles.link}>
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
    fontSize: 52,
    fontWeight: '900',
    color: Colors.gold,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.text.secondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  link: {
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  linkText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
