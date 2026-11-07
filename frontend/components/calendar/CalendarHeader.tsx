import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { CalendarViewType } from '../../types';

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
          {(['day', 'week', 'month'] as CalendarViewType[]).map((view) => (
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
            <Text style={styles.actionIcon}>🔄</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="add-reminder-btn"
            style={styles.addButton}
            onPress={onOpenAddReminder}
            accessibilityLabel={t('calendar.add_reminder', '+ Reminder')}
          >
            <Text style={styles.addButtonText}>+ {t('calendar.reminder_short', 'Reminder')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Navigation Bar */}
      <View style={styles.navRow}>
        <TouchableOpacity
          testID="nav-prev-btn"
          style={styles.navArrow}
          onPress={onPrev}
        >
          <Text style={styles.navArrowText}>◀</Text>
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
        >
          <Text style={styles.navArrowText}>▶</Text>
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
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    fontSize: 14,
  },
  addButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    padding: 8,
    borderRadius: 6,
    backgroundColor: Colors.surfaceSubtle,
  },
  navArrowText: {
    fontSize: 14,
    color: Colors.text.primary,
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  todayButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.gold,
  },
});

