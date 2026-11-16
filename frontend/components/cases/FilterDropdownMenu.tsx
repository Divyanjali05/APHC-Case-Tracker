import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { AppIcon, AppIconName } from '../common/AppIcon';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { QuickFilterType } from '../../app/(tabs)/cases';

export interface FilterDropdownMenuProps {
  visible: boolean;
  onClose: () => void;
  activeFilter: QuickFilterType;
  onSelectFilter: (filter: QuickFilterType) => void;
  onOpenAdvanced?: () => void;
  onResetAll?: () => void;
  anchorPosition?: { x: number; y: number; width?: number };
  testID?: string;
}

interface FilterOptionItem {
  key: QuickFilterType;
  label: string;
  sublabel: string;
  icon: AppIconName;
}

const FILTER_OPTIONS: FilterOptionItem[] = [
  { key: 'ALL', label: 'All Cases', sublabel: 'Entire active docket', icon: 'briefcase' },
  {
    key: 'UPCOMING',
    label: 'Upcoming',
    sublabel: 'Hearings listed soon',
    icon: 'calendar',
  },
  { key: 'PENDING', label: 'Pending', sublabel: 'Active ongoing matters', icon: 'clock' },
  {
    key: 'ADJOURNED',
    label: 'Adjourned',
    sublabel: 'Matters adjourned to future date',
    icon: 'alert-circle',
  },
  {
    key: 'DISPOSED',
    label: 'Disposed',
    sublabel: 'Matters closed or resolved',
    icon: 'check-circle',
  },
  {
    key: 'WITH_JUDGMENT',
    label: 'With Judgment',
    sublabel: 'Certified judgment pronounced',
    icon: 'file-text',
  },
  {
    key: 'WITHOUT_JUDGMENT',
    label: 'Pending Judgment',
    sublabel: 'Awaiting court ruling',
    icon: 'clock',
  },
];

export const FilterDropdownMenu: React.FC<FilterDropdownMenuProps> = ({
  visible,
  onClose,
  activeFilter,
  onSelectFilter,
  onOpenAdvanced,
  onResetAll,
  anchorPosition,
  testID = 'cases-filter-dropdown-menu',
}) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  if (!visible) return null;

  const menuWidth = Math.min(270, windowWidth - 24);
  const leftPos = anchorPosition?.x
    ? Math.max(12, Math.min(anchorPosition.x, windowWidth - menuWidth - 12))
    : 12;
  const topPos = anchorPosition?.y ? Math.min(anchorPosition.y, windowHeight - 440) : 140;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.modalRoot}>
        {/* Outside click dismiss backdrop */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          testID="filter-dropdown-backdrop"
          accessibilityLabel="Dismiss filter menu"
        />

        {/* Dropdown Card */}
        <View
          style={[
            styles.menuCard,
            {
              width: menuWidth,
              top: Math.max(50, topPos),
              left: leftPos,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.menuHeader}>
            <View style={styles.headerTitleRow}>
              <AppIcon name="filter" size={14} color={Colors.primary} />
              <Text style={styles.menuTitle}>Filter Cases</Text>
            </View>
            {activeFilter !== 'ALL' && (
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>Active</Text>
              </View>
            )}
          </View>

          {/* Options List */}
          <ScrollView
            style={styles.optionsList}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {FILTER_OPTIONS.map(opt => {
              const isSelected = activeFilter === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                  onPress={() => {
                    onSelectFilter(opt.key);
                    onClose();
                  }}
                  testID={`filter-option-${opt.key.toLowerCase()}`}
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${opt.label}: ${opt.sublabel}`}
                >
                  <View style={styles.optionLeft}>
                    <View
                      style={[styles.iconCircle, isSelected && styles.iconCircleSelected]}
                    >
                      <AppIcon
                        name={opt.icon}
                        size={14}
                        color={isSelected ? Colors.primary : '#64748B'}
                      />
                    </View>
                    <View style={styles.optionTextWrap}>
                      <Text
                        style={[
                          styles.optionLabel,
                          isSelected && styles.optionLabelSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={styles.optionSub}>{opt.sublabel}</Text>
                    </View>
                  </View>
                  {isSelected && (
                    <AppIcon name="check" size={16} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Separator */}
            <View style={styles.separator} />

            {/* Advanced Filters Option */}
            {onOpenAdvanced && (
              <TouchableOpacity
                style={styles.extraActionRow}
                onPress={() => {
                  onClose();
                  onOpenAdvanced();
                }}
                testID="filter-option-advanced"
                accessibilityLabel="Open custom and date filters"
              >
                <AppIcon name="sliders" size={14} color="#0284C7" />
                <Text style={styles.extraActionText}>Custom / Date Filters...</Text>
              </TouchableOpacity>
            )}

            {/* Reset All Option */}
            {onResetAll && (
              <TouchableOpacity
                style={styles.extraActionRow}
                onPress={() => {
                  onResetAll();
                  onClose();
                }}
                testID="filter-option-reset"
                accessibilityLabel="Reset all filters"
              >
                <AppIcon name="refresh" size={14} color={Colors.danger} />
                <Text style={[styles.extraActionText, styles.resetText]}>
                  Reset All Filters
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
  },
  menuCard: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    maxHeight: 460,
    overflow: 'hidden',
    ...Shadows.card,
    elevation: 12,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  activePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  optionsList: {
    paddingVertical: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  optionRowSelected: {
    backgroundColor: '#EFF6FF',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleSelected: {
    backgroundColor: '#DBEAFE',
  },
  optionTextWrap: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  optionLabelSelected: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  optionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  separator: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  extraActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  extraActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284C7',
  },
  resetText: {
    color: Colors.danger,
  },
});
