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
import { SortType } from '../../app/(tabs)/cases';

export interface SortDropdownMenuProps {
  visible: boolean;
  onClose: () => void;
  sortBy: SortType;
  sortAsc: boolean;
  onSelectSort: (field: SortType, asc?: boolean) => void;
  onToggleDirection?: () => void;
  anchorPosition?: { x: number; y: number; width?: number };
  testID?: string;
}

interface SortOptionItem {
  key: SortType;
  label: string;
  sublabel: string;
  icon: AppIconName;
}

const SORT_OPTIONS: SortOptionItem[] = [
  {
    key: 'CASE_DATE',
    label: 'Case Date (Filing)',
    sublabel: 'Filing registration date',
    icon: 'calendar',
  },
  {
    key: 'NEXT_HEARING',
    label: 'Next Hearing',
    sublabel: 'Upcoming appearance schedule',
    icon: 'clock',
  },
  {
    key: 'JUDGMENT_DATE',
    label: 'Judgment Date',
    sublabel: 'Certified pronouncement date',
    icon: 'file-text',
  },
  {
    key: 'CLOSED_DATE',
    label: 'Closed Date',
    sublabel: 'Disposal completion date',
    icon: 'check-circle',
  },
  {
    key: 'CASE_NAME',
    label: 'Case Name',
    sublabel: 'Petitioner vs Respondent',
    icon: 'user',
  },
  {
    key: 'CASE_NUMBER',
    label: 'Case Number',
    sublabel: 'Type & registry identifier',
    icon: 'hash',
  },
  {
    key: 'RECENTLY_UPDATED',
    label: 'Recently Updated',
    sublabel: 'Latest docket modifications',
    icon: 'refresh',
  },
];

export const SortDropdownMenu: React.FC<SortDropdownMenuProps> = ({
  visible,
  onClose,
  sortBy,
  sortAsc,
  onSelectSort,
  anchorPosition,
  testID = 'cases-sort-dropdown-menu',
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
        {/* Outside click backdrop */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          testID="sort-dropdown-backdrop"
          accessibilityLabel="Dismiss sort menu"
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
              <AppIcon name="sliders" size={14} color={Colors.primary} />
              <Text style={styles.menuTitle}>Sort Matters</Text>
            </View>
          </View>

          {/* Direction Toggle Row */}
          <View style={styles.directionToggleContainer}>
            <TouchableOpacity
              style={[styles.directionBtn, !sortAsc && styles.directionBtnActive]}
              onPress={() => onSelectSort(sortBy, false)}
              testID="sort-direction-desc"
              accessibilityLabel="Sort Descending (Newest)"
            >
              <AppIcon
                name="chevron-down"
                size={13}
                color={!sortAsc ? Colors.primary : '#64748B'}
              />
              <Text
                style={[
                  styles.directionBtnText,
                  !sortAsc && styles.directionBtnTextActive,
                ]}
              >
                Descending (Newest)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.directionBtn, sortAsc && styles.directionBtnActive]}
              onPress={() => onSelectSort(sortBy, true)}
              testID="sort-direction-asc"
              accessibilityLabel="Sort Ascending (Oldest)"
            >
              <AppIcon
                name="chevron-up"
                size={13}
                color={sortAsc ? Colors.primary : '#64748B'}
              />
              <Text
                style={[
                  styles.directionBtnText,
                  sortAsc && styles.directionBtnTextActive,
                ]}
              >
                Ascending (Oldest)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Options List */}
          <ScrollView
            style={styles.optionsList}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {SORT_OPTIONS.map(opt => {
              const isSelected = sortBy === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                  onPress={() => {
                    onSelectSort(opt.key, sortAsc);
                    onClose();
                  }}
                  testID={`sort-option-${opt.key.toLowerCase()}`}
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
                    <View style={styles.selectedIndicatorRow}>
                      <AppIcon
                        name={sortAsc ? 'chevron-up' : 'chevron-down'}
                        size={12}
                        color={Colors.primary}
                      />
                      <AppIcon name="check" size={16} color={Colors.primary} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
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
  directionToggleContainer: {
    flexDirection: 'row',
    padding: 6,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 6,
  },
  directionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  directionBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  directionBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  directionBtnTextActive: {
    color: Colors.primary,
    fontWeight: '700',
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
  selectedIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});
