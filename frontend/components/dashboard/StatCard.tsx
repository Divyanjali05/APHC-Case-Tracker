import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Card } from '../common/Card';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  valueColor?: string;
  testID?: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  iconBgColor?: string;
  style?: StyleProp<ViewStyle>;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  valueColor,
  testID,
  onPress,
  icon,
  iconBgColor,
  style,
}) => {
  const content = (
    <Card style={[styles.card, style]} testID={testID}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {icon ? (
          <View
            style={[
              styles.iconWrapper,
              iconBgColor ? { backgroundColor: iconBgColor } : undefined,
            ]}
          >
            {icon}
          </View>
        ) : null}
      </View>
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
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.touchable}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${value}`}
      >
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
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.card,
    ...Shadows.subtle,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    color: Colors.text.secondary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    letterSpacing: 0.2,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSubtle,
    marginLeft: Spacing.xs,
  },
  value: {
    color: Colors.text.primary,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '500',
  },
});
