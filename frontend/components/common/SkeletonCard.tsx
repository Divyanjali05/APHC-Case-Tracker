import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';

export interface SkeletonCardProps {
  variant?: 'card' | 'list-item' | 'stat';
  count?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  variant = 'card',
  count = 1,
  style,
  testID = 'skeleton-card',
}) => {
  const items = Array.from({ length: count }, (_, i) => i);

  const renderSkeletonContent = () => {
    switch (variant) {
      case 'stat':
        return (
          <View style={styles.statContent}>
            <View style={styles.statLabelPlaceholder} />
            <View style={styles.statNumberPlaceholder} />
            <View style={styles.statSubtitlePlaceholder} />
          </View>
        );

      case 'list-item':
        return (
          <View style={styles.listItemContent}>
            <View style={styles.topRow}>
              <View style={styles.caseBadgePlaceholder} />
              <View style={styles.statusBadgePlaceholder} />
            </View>
            <View style={styles.lineLong} />
            <View style={styles.lineMedium} />
            <View style={styles.bottomRow}>
              <View style={styles.lineShort} />
              <View style={styles.tagPlaceholder} />
            </View>
          </View>
        );

      case 'card':
      default:
        return (
          <View style={styles.cardContent}>
            <View style={styles.topRow}>
              <View style={styles.titlePlaceholder} />
              <View style={styles.badgePlaceholder} />
            </View>
            <View style={styles.lineLong} />
            <View style={styles.lineMedium} />
            <View style={styles.lineShort} />
          </View>
        );
    }
  };

  return (
    <View testID={testID}>
      {items.map(idx => (
        <View
          key={idx}
          style={[styles.baseCard, variant === 'stat' && styles.statCard, style]}
        >
          {renderSkeletonContent()}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  baseCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  statCard: {
    padding: Spacing.md,
    minHeight: 110,
  },
  cardContent: {
    width: '100%',
  },
  listItemContent: {
    width: '100%',
  },
  statContent: {
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  titlePlaceholder: {
    width: '45%',
    height: 18,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surfaceSubtle,
  },
  badgePlaceholder: {
    width: 64,
    height: 20,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surfaceSubtle,
  },
  caseBadgePlaceholder: {
    width: 120,
    height: 16,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surfaceSubtle,
  },
  statusBadgePlaceholder: {
    width: 80,
    height: 18,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surfaceSubtle,
  },
  tagPlaceholder: {
    width: 70,
    height: 20,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surfaceSubtle,
  },
  statLabelPlaceholder: {
    width: '60%',
    height: 14,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surfaceSubtle,
    marginBottom: Spacing.sm,
  },
  statNumberPlaceholder: {
    width: '40%',
    height: 28,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surfaceSubtle,
    marginBottom: Spacing.sm,
  },
  statSubtitlePlaceholder: {
    width: '75%',
    height: 12,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surfaceSubtle,
  },
  lineLong: {
    width: '90%',
    height: 14,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surfaceSubtle,
    marginBottom: Spacing.sm,
  },
  lineMedium: {
    width: '65%',
    height: 14,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surfaceSubtle,
    marginBottom: Spacing.sm,
  },
  lineShort: {
    width: '40%',
    height: 14,
    borderRadius: Radius.badge,
    backgroundColor: Colors.surfaceSubtle,
  },
});
