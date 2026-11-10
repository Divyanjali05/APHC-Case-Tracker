import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { Radius, Spacing } from '../../constants/theme';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  badge?: string | number;
  testID?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  segmentStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  style,
  segmentStyle,
  labelStyle,
  testID = 'segmented-control',
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.container, style]} testID={testID} accessibilityRole="tablist">
      {options.map(option => {
        const isSelected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            testID={option.testID}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            activeOpacity={0.8}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              isSelected ? styles.selectedSegment : styles.unselectedSegment,
              segmentStyle,
            ]}
          >
            <View style={styles.segmentInner}>
              <Text
                style={[
                  styles.label,
                  isSelected ? styles.selectedLabel : styles.unselectedLabel,
                  labelStyle,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>

              {option.badge !== undefined && option.badge !== null ? (
                <View
                  style={[
                    styles.badge,
                    isSelected ? styles.selectedBadge : styles.unselectedBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      isSelected ? styles.selectedBadgeText : styles.unselectedBadgeText,
                    ]}
                  >
                    {option.badge}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: Radius.button,
    padding: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    width: '100%',
  },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: Radius.badge + 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  selectedSegment: {
    backgroundColor: Colors.primary,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  unselectedSegment: {
    backgroundColor: 'transparent',
  },
  segmentInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  selectedLabel: {
    color: Colors.text.white,
  },
  unselectedLabel: {
    color: Colors.text.secondary,
  },
  badge: {
    marginLeft: Spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  selectedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  unselectedBadge: {
    backgroundColor: Colors.border,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  selectedBadgeText: {
    color: Colors.text.white,
  },
  unselectedBadgeText: {
    color: Colors.text.secondary,
  },
});
