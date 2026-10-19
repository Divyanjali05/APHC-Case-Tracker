import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  message?: string;
  description?: string;
  action?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  description,
  action,
  actionLabel,
  onAction,
  testID,
}) => {
  const displayText = description || message;

  return (
    <View style={styles.container} testID={testID}>
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
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  action: {
    marginTop: 8,
  },
  actionButton: {
    paddingHorizontal: 20,
  },
});
