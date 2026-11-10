import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/theme';
import { AppIcon, AppIconName } from './AppIcon';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  message?: string;
  description?: string;
  action?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
  icon?: React.ReactNode;
  iconName?: AppIconName;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  description,
  action,
  actionLabel,
  onAction,
  testID,
  icon,
  iconName,
  style,
}) => {
  const displayText = description || message;
  const resolvedIcon =
    icon ??
    (iconName ? <AppIcon name={iconName} size={30} color={Colors.text.muted} /> : null);

  return (
    <View style={[styles.container, style]} testID={testID}>
      {resolvedIcon ? <View style={styles.iconContainer}>{resolvedIcon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {displayText ? <Text style={styles.message}>{displayText}</Text> : null}
      {action ? (
        <View style={styles.action}>{action}</View>
      ) : actionLabel && onAction ? (
        <View style={styles.action}>
          <Button
            title={actionLabel}
            variant="outline"
            onPress={onAction}
            style={styles.actionButton}
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginBottom: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
    textAlign: 'center',
    lineHeight: 24,
  },
  message: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.lg,
    maxWidth: 320,
  },
  action: {
    marginTop: Spacing.xs,
  },
  actionButton: {
    paddingHorizontal: Spacing.xl,
    minHeight: 44,
  },
});
