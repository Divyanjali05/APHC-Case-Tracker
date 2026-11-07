import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import {
  AgendaEventUnion,
  AgendaHearingItem,
  AgendaReminderItem,
  AgendaResponse,
} from '../../types';

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
  const [activeDate, setActiveDate] = useState<string>(selectedDate);

  // Compute 7 days from start_date
  const startDate = agenda.start_date ? new Date(agenda.start_date) : new Date();
  const days: { dateStr: string; dayName: string; dayNum: number }[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
    days.push({
      dateStr,
      dayName,
      dayNum: d.getDate(),
    });
  }

  const eventsByDate = agenda.events_by_date || {};
  const currentDayEvents: AgendaEventUnion[] = eventsByDate[activeDate] || [];

  return (
    <View style={styles.container} testID="calendar-week-view">
      {/* 7-day strip */}
      <View style={styles.weekStrip}>
        {days.map((item) => {
          const isSelected = item.dateStr === activeDate;
          const count = (eventsByDate[item.dateStr] || []).length;

          return (
            <TouchableOpacity
              key={item.dateStr}
              testID={`week-day-${item.dateStr}`}
              style={[styles.dayColumn, isSelected && styles.dayColumnActive]}
              onPress={() => {
                setActiveDate(item.dateStr);
                onSelectDate(item.dateStr);
              }}
            >
              <Text
                style={[styles.dayName, isSelected && styles.dayTextActive]}
              >
                {item.dayName}
              </Text>
              <Text
                style={[styles.dayNum, isSelected && styles.dayTextActive]}
              >
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
      <ScrollView style={styles.eventsScroll}>
        <Text style={styles.selectedDayTitle}>
          {t('calendar.agenda_for', 'Agenda for')} {activeDate} ({currentDayEvents.length})
        </Text>

        {currentDayEvents.length === 0 ? (
          <View style={styles.emptyContainer} testID="week-view-empty">
            <Text style={styles.emptyText}>
              {t('calendar.no_events_on_date', 'No court appearances or reminders for this date.')}
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
                activeOpacity={0.7}
              >
                <Card style={styles.eventCard}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{ev.title}</Text>
                    <Badge
                      label={ev.event_type}
                      variant={isHearing ? 'primary' : isToken ? 'gold' : 'secondary'}
                    />
                  </View>

                  {isHearing && (ev as AgendaHearingItem).court_hall_number ? (
                    <Text style={styles.detailText}>
                      Hall {(ev as AgendaHearingItem).court_hall_number} • {(ev as AgendaHearingItem).hearing_time || 'All Day'}
                    </Text>
                  ) : null}

                  {!isHearing && !isToken && (ev as AgendaReminderItem).due_date ? (
                    <Text style={styles.detailText}>
                      Due: {(ev as AgendaReminderItem).due_date.replace('T', ' ').substring(0, 16)}
                    </Text>
                  ) : null}
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dayColumn: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    minWidth: 42,
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
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  dayTextActive: {
    color: Colors.text.white,
  },
  eventDotBadge: {
    marginTop: 4,
    backgroundColor: Colors.gold,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  eventDotText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.surface,
  },
  eventDotPlaceholder: {
    height: 14,
    marginTop: 4,
  },
  eventsScroll: {
    flex: 1,
    padding: 16,
  },
  selectedDayTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginBottom: 12,
    textTransform: 'uppercase',
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
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.text.muted,
    fontSize: 14,
  },
});
