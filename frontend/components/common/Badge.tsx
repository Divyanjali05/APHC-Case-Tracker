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
    backgroundColor: '#1E3A8A',
  },
  success: {
    backgroundColor: '#064E3B',
  },
  warning: {
    backgroundColor: '#7C2D12',
  },
  gold: {
    backgroundColor: '#78350F',
  },
  danger: {
    backgroundColor: '#7F1D1D',
  },
  info: {
    backgroundColor: '#0C4A6E',
  },
  secondary: {
    backgroundColor: '#374151',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  primaryText: {
    color: '#93C5FD',
  },
  successText: {
    color: '#6EE7B7',
  },
  warningText: {
    color: '#FDBA74',
  },
  goldText: {
    color: '#FDE68A',
  },
  dangerText: {
    color: '#FCA5A5',
  },
  infoText: {
    color: '#7DD3FC',
  },
  secondaryText: {
    color: '#D1D5DB',
  },
});
