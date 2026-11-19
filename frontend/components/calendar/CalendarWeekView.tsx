import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import {
  AgendaEventUnion,
  AgendaHearingItem,
  AgendaReminderItem,
  AgendaResponse,
  AgendaTokenItem,
} from '../../types';
import {
  formatDisplayTime,
  formatLongDate,
  getWeekDatesLocal,
  isLocalToday,
  parseLocalDate,
} from '../../utils/calendarDate';

export interface CalendarWeekViewProps {
  agenda: AgendaResponse;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSelectEvent: (event: AgendaEventUnion) => void;
}

export const CalendarWeekView: React.FC<CalendarWeekViewProps> = ({
  agenda,
  selectedDate,
  onSelectDate,
  onSelectEvent,
}) => {
  const { t } = useTranslation();

  // Compute 7 local dates cleanly (zero UTC shift, always synced with selectedDate)
  const week = getWeekDatesLocal(agenda.start_date || selectedDate);
  const days = week.dates.map(dateStr => {
    const d = parseLocalDate(dateStr);
    return {
      dateStr,
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      isToday: isLocalToday(dateStr),
    };
  });

  const eventsByDate = agenda.events_by_date || {};
  const currentDayEvents: AgendaEventUnion[] = eventsByDate[selectedDate] || [];

  return (
    <View style={styles.container} testID="calendar-week-view">
      {/* 7-day strip */}
      <View style={styles.weekStrip}>
        {days.map(item => {
          const isSelected = item.dateStr === selectedDate;
          const count = (eventsByDate[item.dateStr] || []).length;

          return (
            <TouchableOpacity
              key={item.dateStr}
              testID={`week-day-${item.dateStr}`}
              style={[
                styles.dayColumn,
                item.isToday && !isSelected && styles.dayColumnToday,
                isSelected && styles.dayColumnActive,
              ]}
              onPress={() => onSelectDate(item.dateStr)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.dayName, isSelected && styles.dayTextActive]}>
                {item.dayName}
              </Text>
              <Text style={[styles.dayNum, isSelected && styles.dayTextActive]}>
                {item.dayNum}
              </Text>
              {count > 0 ? (
                <View style={styles.eventDotBadge}>
                  <Text style={styles.eventDotText}>{count}</Text>
                </View>
              ) : (
                <View style={styles.eventDotPlaceholder} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Events List for selected day */}
      <View style={styles.eventsContainer}>
        <Text style={styles.selectedDayTitle}>
          {t('calendar.agenda_for', 'Agenda for')} {formatLongDate(selectedDate)} (
          {currentDayEvents.length})
        </Text>

        {currentDayEvents.length === 0 ? (
          <View style={styles.emptyContainer} testID="week-view-empty">
            <Text style={styles.emptyText}>
              {t(
                'calendar.no_events_on_date',
                'No court appearances or reminders for this date.'
              )}
            </Text>
          </View>
        ) : (
          currentDayEvents.map((ev, index) => {
            const isHearing = ev.event_type === 'HEARING';
            const isToken = ev.event_type === 'TOKEN';

            return (
              <TouchableOpacity
                key={`${ev.event_type}-${ev.id}-${index}`}
                testID={`week-event-${ev.event_type.toLowerCase()}-${ev.id}`}
                onPress={() => onSelectEvent(ev)}
                activeOpacity={0.75}
              >
                <Card style={styles.eventCard}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{ev.title}</Text>
                    <Badge
                      label={ev.event_type}
                      variant={isHearing ? 'primary' : isToken ? 'gold' : 'secondary'}
                    />
                  </View>

                  {isHearing && (
                    <Text style={styles.detailText}>
                      Hall {(ev as AgendaHearingItem).court_hall_number || '—'} •{' '}
                      {formatDisplayTime((ev as AgendaHearingItem).hearing_time)}
                    </Text>
                  )}

                  {isToken && (
                    <Text style={styles.detailText}>
                      Hall {(ev as AgendaTokenItem).court_hall_number} •{' '}
                      {(ev as AgendaTokenItem).status}
                    </Text>
                  )}

                  {!isHearing && !isToken && (ev as AgendaReminderItem).due_date ? (
                    <Text style={styles.detailText}>
                      Due:{' '}
                      {formatDisplayTime(
                        (ev as AgendaReminderItem).time ||
                          (ev as AgendaReminderItem).due_date
                      )}
                    </Text>
                  ) : null}
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
  },
  dayColumn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
  },
  dayColumnToday: {
    backgroundColor: Colors.surfaceBlue,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
  },
  dayColumnActive: {
    backgroundColor: Colors.primary,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  dayNum: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  dayTextActive: {
    color: Colors.text.white,
  },
  eventDotBadge: {
    marginTop: 4,
    backgroundColor: Colors.gold,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  eventDotText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.white,
  },
  eventDotPlaceholder: {
    height: 16,
    marginTop: 4,
  },
  eventsContainer: {
    padding: 16,
  },
  selectedDayTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  eventCard: {
    marginBottom: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    flex: 1,
    marginRight: 8,
  },
  detailText: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  emptyContainer: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.text.muted,
    fontSize: 13,
    textAlign: 'center',
  },
});
