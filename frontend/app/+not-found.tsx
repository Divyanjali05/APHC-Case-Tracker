import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { Card } from '../components/common/Card';
import { AppIcon } from '../components/common/AppIcon';
import { Colors } from '../constants/colors';
import { Radius, Shadows, Spacing } from '../constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Page Not Found' }} />
      <ScreenContainer testID="not-found-screen">
        <View style={styles.container}>
          <Card style={styles.card}>
            <View style={styles.iconBadge}>
              <AppIcon name="scale" size={30} color={Colors.primary} />
            </View>
            <Text style={styles.code}>404</Text>
            <Text style={styles.title}>Page Not Found</Text>
            <Text style={styles.subtitle}>
              This court docket or route does not exist or is no longer available.
            </Text>
            <Link href="/" style={styles.link} testID="not-found-home-link">
              <Text style={styles.linkText}>Return Home</Text>
            </Link>
          </Card>
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
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    padding: Spacing.xl,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadows.card,
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: Colors.surfaceBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  code: {
    fontSize: 44,
    fontWeight: '800',
    color: Colors.gold,
    letterSpacing: -0.5,
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text.secondary,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  link: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.button,
    minHeight: 48,
  },
  linkText: {
    color: Colors.text.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
