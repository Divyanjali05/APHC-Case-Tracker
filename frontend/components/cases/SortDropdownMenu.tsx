import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { AppIcon, AppIconName } from '../common/AppIcon';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { SortType } from '../../utils/caseFiltering';

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
    key: 'CASE_NUMBER',
    label: 'Case Number',
    sublabel: 'Type & registry identifier',
    icon: 'hash',
  },
  {
    key: 'CASE_DATE',
    label: 'Filing Date',
    sublabel: 'Filing year & registration date',
    icon: 'calendar',
  },
  {
    key: 'NEXT_HEARING',
    label: 'Next Hearing',
    sublabel: 'Upcoming appearance schedule',
    icon: 'clock',
  },
  {
    key: 'CLOSED_DATE',
    label: 'Closed Date',
    sublabel: 'Disposal completion date',
    icon: 'check-circle',
  },
  {
    key: 'JUDGMENT_DATE',
    label: 'Judgment Date',
    sublabel: 'Certified pronouncement date',
    icon: 'file-text',
  },
  {
    key: 'RECENTLY_UPDATED',
    label: 'Last Updated',
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

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const prevOverflow =
      typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const isMobile = windowWidth < 768;
  const menuWidth = Math.min(290, windowWidth - 24);
  const leftPos = anchorPosition?.x
    ? Math.max(12, Math.min(anchorPosition.x, windowWidth - menuWidth - 12))
    : 12;
  const topPos = anchorPosition?.y ? Math.min(anchorPosition.y, windowHeight - 440) : 140;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isMobile ? 'slide' : 'fade'}
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={[styles.modalRoot, isMobile && styles.modalRootMobile]}>
        {/* Outside click dismiss backdrop */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          testID="sort-dropdown-backdrop"
          accessibilityLabel="Dismiss sort menu"
        />

        {/* Bottom Sheet (Mobile) or Popover Card (Desktop) */}
        <View
          style={[
            isMobile ? styles.mobileSheet : styles.desktopCard,
            isMobile
              ? { maxHeight: Math.round(windowHeight * 0.8) }
              : {
                  width: menuWidth,
                  top: Math.max(50, topPos),
                  left: leftPos,
                },
          ]}
        >
          {/* Mobile Drag Handle */}
          {isMobile && (
            <View style={styles.dragHandleWrap}>
              <View style={styles.dragHandle} />
            </View>
          )}

          {/* Header */}
          <View style={styles.menuHeader}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconCircle}>
                <AppIcon name="sliders" size={14} color={Colors.primary} />
              </View>
              <Text style={styles.menuTitle}>Sort Cases</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close sort menu"
              testID="sort-close-btn"
            >
              <AppIcon name="x" size={16} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Ascending / Descending Segmented Toggle */}
          <View style={styles.directionToggleContainer}>
            <TouchableOpacity
              style={[styles.directionBtn, !sortAsc && styles.directionBtnActive]}
              onPress={() => {
                onSelectSort(sortBy, false);
                onClose();
              }}
              testID="sort-direction-desc"
              accessibilityRole="button"
              accessibilityState={{ selected: !sortAsc }}
              accessibilityLabel="Sort Descending"
            >
              <AppIcon
                name="chevron-down"
                size={14}
                color={!sortAsc ? Colors.text.white : Colors.text.secondary}
              />
              <Text
                style={[
                  styles.directionBtnText,
                  !sortAsc && styles.directionBtnTextActive,
                ]}
              >
                Descending
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.directionBtn, sortAsc && styles.directionBtnActive]}
              onPress={() => {
                onSelectSort(sortBy, true);
                onClose();
              }}
              testID="sort-direction-asc"
              accessibilityRole="button"
              accessibilityState={{ selected: sortAsc }}
              accessibilityLabel="Sort Ascending"
            >
              <AppIcon
                name="chevron-up"
                size={14}
                color={sortAsc ? Colors.text.white : Colors.text.secondary}
              />
              <Text
                style={[
                  styles.directionBtnText,
                  sortAsc && styles.directionBtnTextActive,
                ]}
              >
                Ascending
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sort Field Options List */}
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
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${opt.label}: ${opt.sublabel}`}
                >
                  <View style={styles.optionLeft}>
                    <View
                      style={[styles.iconCircle, isSelected && styles.iconCircleSelected]}
                    >
                      <AppIcon
                        name={opt.icon}
                        size={15}
                        color={isSelected ? Colors.primary : Colors.text.muted}
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
                      <View style={styles.directionPill}>
                        <Text style={styles.directionPillText}>
                          {sortAsc ? 'ASC' : 'DESC'}
                        </Text>
                      </View>
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
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  modalRootMobile: {
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  desktopCard: {
    position: 'absolute',
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    maxHeight: 480,
    overflow: 'hidden',
    ...Shadows.card,
    elevation: 12,
  },
  mobileSheet: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    paddingBottom: Spacing.md,
    ...Shadows.card,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  directionToggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  directionBtn: {
    flex: 1,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.button,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    gap: 6,
  },
  directionBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  directionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  directionBtnTextActive: {
    color: Colors.text.white,
    fontWeight: '700',
  },
  optionsList: {
    paddingVertical: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    minHeight: 54,
  },
  optionRowSelected: {
    backgroundColor: Colors.surfaceBlue,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleSelected: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  optionLabelSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  optionSub: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: 1,
  },
  selectedIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  directionPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  directionPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.white,
    letterSpacing: 0.4,
  },
});
