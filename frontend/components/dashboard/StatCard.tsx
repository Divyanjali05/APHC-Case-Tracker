import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../common/Card';
import { Colors } from '../../constants/colors';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  valueColor?: string;
  testID?: string;
  onPress?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  valueColor,
  testID,
  onPress,
}) => {
  const content = (
    <Card style={styles.card} testID={testID}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text
        style={[styles.value, valueColor ? { color: valueColor } : undefined]}
        testID={testID ? `${testID}-value` : undefined}
      >
        {value}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </Card>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.touchable}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  touchable: {
    flex: 1,
    minWidth: 140,
  },
  card: {
    flex: 1,
    minWidth: 140,
    marginHorizontal: 4,
    padding: 16,
  },
  title: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  value: {
    color: Colors.text.primary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: Colors.text.muted,
    fontSize: 11,
  },
});
