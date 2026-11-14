import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface BadgeProps {
  label: string;
  variant?: 'primary' | 'success' | 'warning' | 'gold' | 'danger' | 'info' | 'secondary';
  testID?: string;
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'primary', testID }) => {
  return (
    <View style={[styles.badge, styles[variant]]} testID={testID}>
      <Text style={[styles.text, styles[`${variant}Text` as keyof typeof styles]]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  primary: {
    backgroundColor: '#DBEAFE',
  },
  success: {
    backgroundColor: '#DCFCE7',
  },
  warning: {
    backgroundColor: '#FFEDD5',
  },
  gold: {
    backgroundColor: '#FEF3C7',
  },
  danger: {
    backgroundColor: '#FEE2E2',
  },
  info: {
    backgroundColor: '#E0F2FE',
  },
  secondary: {
    backgroundColor: '#F1F5F9',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  primaryText: {
    color: '#1D4ED8',
  },
  successText: {
    color: '#15803D',
  },
  warningText: {
    color: '#C2410C',
  },
  goldText: {
    color: '#B45309',
  },
  dangerText: {
    color: '#B91C1C',
  },
  infoText: {
    color: '#0369A1',
  },
  secondaryText: {
    color: '#475569',
  },
});
