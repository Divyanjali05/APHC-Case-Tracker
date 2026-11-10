import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Radius } from '../../constants/theme';

export interface BadgeProps {
  label: string;
  variant?: 'primary' | 'success' | 'warning' | 'gold' | 'danger' | 'info' | 'secondary';
  testID?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'primary',
  testID,
  style,
  textStyle,
}) => {
  return (
    <View style={[styles.badge, styles[variant], style]} testID={testID}>
      <Text
        style={[styles.text, styles[`${variant}Text` as keyof typeof styles], textStyle]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: Radius.badge,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  primary: {
    backgroundColor: Colors.surfaceBlue,
    borderColor: '#BFDBFE',
  },
  success: {
    backgroundColor: Colors.successSurface,
    borderColor: Colors.successBorder,
  },
  warning: {
    backgroundColor: Colors.warningSurface,
    borderColor: Colors.warningBorder,
  },
  gold: {
    backgroundColor: Colors.goldSurface,
    borderColor: Colors.goldBorder,
  },
  danger: {
    backgroundColor: Colors.dangerSurface,
    borderColor: Colors.dangerBorder,
  },
  info: {
    backgroundColor: Colors.infoSurface,
    borderColor: Colors.infoBorder,
  },
  secondary: {
    backgroundColor: Colors.surfaceSubtle,
    borderColor: Colors.border,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  primaryText: {
    color: Colors.accent,
  },
  successText: {
    color: Colors.success,
  },
  warningText: {
    color: Colors.warning,
  },
  goldText: {
    color: '#92400E',
  },
  dangerText: {
    color: Colors.danger,
  },
  infoText: {
    color: Colors.info,
  },
  secondaryText: {
    color: Colors.text.secondary,
  },
});
