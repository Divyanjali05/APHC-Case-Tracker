import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { CalendarViewType } from '../../types';
import { AppIcon } from '../common/AppIcon';

export interface CalendarHeaderProps {
  currentView: CalendarViewType;
  onViewChange: (view: CalendarViewType) => void;
  selectedDate: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onOpenAddReminder: () => void;
  onOpenSync: () => void;
}

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  currentView,
  onViewChange,
  selectedDate,
  onPrev,
  onNext,
  onToday,
  onOpenAddReminder,
  onOpenSync,
}) => {
  const { t } = useTranslation();

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <View style={styles.container} testID="calendar-header">
      {/* Top Bar: View Tabs and Actions */}
      <View style={styles.topRow}>
        <View style={styles.segmentedControl}>
          {(['day', 'week', 'month'] as CalendarViewType[]).map(view => (
            <TouchableOpacity
              key={view}
              testID={`view-tab-${view}`}
              style={[
                styles.segmentButton,
                currentView === view && styles.segmentButtonActive,
              ]}
              onPress={() => onViewChange(view)}
            >
              <Text
                style={[
                  styles.segmentText,
                  currentView === view && styles.segmentTextActive,
                ]}
              >
                {t(`calendar.views.${view}`, view.toUpperCase())}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            testID="open-sync-btn"
            style={styles.iconButton}
            onPress={onOpenSync}
            accessibilityLabel={t('calendar.sync', 'Sync')}
          >
            <AppIcon name="refresh" size={16} color={Colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="add-reminder-btn"
            style={styles.addButton}
            onPress={onOpenAddReminder}
            accessibilityLabel={t('calendar.add_reminder', '+ Reminder')}
          >
            <AppIcon name="plus" size={14} color={Colors.text.white} />
            <Text style={styles.addButtonText}>
              {t('calendar.reminder_short', 'Reminder')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Navigation Bar */}
      <View style={styles.navRow}>
        <TouchableOpacity
          testID="nav-prev-btn"
          style={styles.navArrow}
          onPress={onPrev}
          accessibilityLabel={t('common.previous', 'Previous')}
        >
          <AppIcon name="chevron-left" size={18} color={Colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.dateLabelContainer}>
          <Text style={styles.dateText}>{formatDateDisplay(selectedDate)}</Text>
        </View>

        <TouchableOpacity
          testID="nav-today-btn"
          style={styles.todayButton}
          onPress={onToday}
        >
          <Text style={styles.todayButtonText}>{t('calendar.today', 'Today')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="nav-next-btn"
          style={styles.navArrow}
          onPress={onNext}
          accessibilityLabel={t('common.next', 'Next')}
        >
          <AppIcon name="chevron-right" size={18} color={Colors.text.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
    padding: 3,
  },
  segmentButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentButtonActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  segmentTextActive: {
    color: Colors.text.white,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    minWidth: 40,
    minHeight: 40,
    padding: 9,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 40,
    borderRadius: 8,
  },
  addButtonText: {
    color: Colors.text.white,
    fontSize: 12,
    fontWeight: '600',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navArrow: {
    minWidth: 40,
    minHeight: 40,
    padding: 9,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabelContainer: {
    flex: 1,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.surfaceBlue,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
    marginRight: 8,
  },
  todayButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
});
