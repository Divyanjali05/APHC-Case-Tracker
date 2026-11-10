import { TextStyle, ViewStyle } from 'react-native';
import { Colors } from './colors';

export const Typography = {
  displayTitle: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    letterSpacing: -0.3,
    color: Colors.text.primary,
  } as TextStyle,
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: -0.2,
    color: Colors.text.primary,
  } as TextStyle,
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
    color: Colors.text.primary,
  } as TextStyle,
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    color: Colors.text.primary,
  } as TextStyle,
  body: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
    color: Colors.text.primary,
  } as TextStyle,
  bodySmall: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 19,
    color: Colors.text.secondary,
  } as TextStyle,
  label: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: Colors.text.secondary,
  } as TextStyle,
  caption: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    color: Colors.text.muted,
  } as TextStyle,
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    color: Colors.text.primary,
  } as TextStyle,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  screenHorizontal: 16,
} as const;

export const Radius = {
  card: 14,
  button: 12,
  input: 12,
  badge: 6,
  pill: 999,
} as const;

export const Shadows = {
  card: {
    shadowColor: '#0F2942',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  } as ViewStyle,
  subtle: {
    shadowColor: '#0F2942',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  } as ViewStyle,
} as const;

export const Theme = {
  Colors,
  Typography,
  Spacing,
  Radius,
  Shadows,
} as const;

export default Theme;
