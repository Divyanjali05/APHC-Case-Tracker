import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Spacing, Typography } from '../../constants/theme';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  badge?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  leftAction,
  rightAction,
  badge,
  style,
  titleStyle,
  subtitleStyle,
  testID = 'screen-header',
  accessibilityLabel,
}) => {
  return (
    <View
      style={[styles.container, style]}
      testID={testID}
      accessibilityRole="header"
      accessibilityLabel={accessibilityLabel || title}
    >
      <View style={styles.topRow}>
        <View style={styles.leftContainer}>
          {leftAction ? <View style={styles.actionSlot}>{leftAction}</View> : null}
          <View style={styles.titleWrapper}>
            <View style={styles.titleRow}>
              <Text
                style={[styles.title, titleStyle]}
                numberOfLines={1}
                accessibilityRole="header"
              >
                {title}
              </Text>
              {badge ? <View style={styles.badgeSlot}>{badge}</View> : null}
            </View>
          </View>
        </View>

        {rightAction ? <View style={styles.rightContainer}>{rightAction}</View> : null}
      </View>

      {subtitle ? (
        <Text style={[styles.subtitle, subtitleStyle]} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: 'transparent',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionSlot: {
    marginRight: Spacing.sm,
  },
  titleWrapper: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  title: {
    ...Typography.screenTitle,
    color: Colors.text.primary,
  },
  badgeSlot: {
    marginLeft: Spacing.sm,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: Spacing.md,
  },
  subtitle: {
    ...Typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text.secondary,
    marginTop: Spacing.xs,
  },
});
