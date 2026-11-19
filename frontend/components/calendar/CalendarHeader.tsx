import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { CalendarViewType } from '../../types';
import { AppIcon } from '../common/AppIcon';
import { formatCalendarPeriodLabel, isLocalToday } from '../../utils/calendarDate';

export interface CalendarHeaderProps {
  currentView: CalendarViewType;
  onViewChange: (view: CalendarViewType) => void;
  selectedDate: string;
  startDate?: string;
  endDate?: string;
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
  startDate,
  endDate,
  onPrev,
  onNext,
  onToday,
  onOpenAddReminder,
  onOpenSync,
}) => {
  const { t } = useTranslation();
  const selectedIsToday = isLocalToday(selectedDate);
  const periodLabel = formatCalendarPeriodLabel(
    selectedDate,
    currentView,
    startDate,
    endDate
  );

  return (
    <View style={styles.container} testID="calendar-header">
      {/* Top Bar: View Switcher and Actions */}
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
              accessibilityRole="button"
              accessibilityState={{ selected: currentView === view }}
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
            accessibilityRole="button"
            accessibilityLabel={t('calendar.sync', 'Sync')}
          >
            <AppIcon name="refresh" size={16} color={Colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="add-reminder-btn"
            style={styles.addButton}
            onPress={onOpenAddReminder}
            accessibilityRole="button"
            accessibilityLabel={t('calendar.add_reminder', '+ Reminder')}
          >
            <AppIcon name="plus" size={14} color={Colors.text.white} />
            <Text style={styles.addButtonText} numberOfLines={1}>
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
          accessibilityRole="button"
          accessibilityLabel={t('common.previous', 'Previous')}
        >
          <AppIcon name="chevron-left" size={18} color={Colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.dateLabelContainer}>
          <Text style={styles.dateText} numberOfLines={1} testID="calendar-date-label">
            {periodLabel}
          </Text>
          {selectedIsToday && (
            <View style={styles.todayIndicatorPill} testID="calendar-today-indicator">
              <Text style={styles.todayIndicatorText}>
                {t('calendar.today', 'Today')}
              </Text>
            </View>
          )}
        </View>

        {!selectedIsToday && (
          <TouchableOpacity
            testID="nav-today-btn"
            style={styles.todayButton}
            onPress={onToday}
            accessibilityRole="button"
            accessibilityLabel="Jump to Today"
          >
            <Text style={styles.todayButtonText}>{t('calendar.today', 'Today')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          testID="nav-next-btn"
          style={styles.navArrow}
          onPress={onNext}
          accessibilityRole="button"
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
    padding: 3,
  },
  segmentButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 38,
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
    minWidth: 38,
    minHeight: 38,
    padding: 8,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 38,
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
    gap: 6,
  },
  navArrow: {
    minWidth: 38,
    minHeight: 38,
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabelContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  dateText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  todayIndicatorPill: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  todayIndicatorText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.white,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  todayButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.surfaceBlue,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
  },
  todayButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
});
