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

export interface CalendarMonthViewProps {
  agenda: AgendaResponse;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSelectEvent: (event: AgendaEventUnion) => void;
}

export const CalendarMonthView: React.FC<CalendarMonthViewProps> = ({
  agenda,
  selectedDate,
  onSelectDate,
  onSelectEvent,
}) => {
  const { t } = useTranslation();
  const [activeDate, setActiveDate] = useState<string>(selectedDate);

  const baseDate = new Date(selectedDate);
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  // 1st day of month & days count
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  // Day of week offset for Monday (0) to Sunday (6)
  // JS getDay(): Sunday is 0, Monday is 1, Saturday is 6
  const startDayOfWeek = (firstDay.getDay() + 6) % 7;

  const eventsByDate = agenda.events_by_date || {};
  const currentDayEvents: AgendaEventUnion[] = eventsByDate[activeDate] || [];

  const dayHeaders = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }

  return (
    <ScrollView style={styles.container} testID="calendar-month-view">
      {/* Month Grid Card */}
      <Card style={styles.gridCard}>
        {/* Day of Week Header */}
        <View style={styles.headerRow}>
          {dayHeaders.map((dh, idx) => (
            <View key={idx} style={styles.headerCell}>
              <Text style={styles.headerText}>{dh}</Text>
            </View>
          ))}
        </View>

        {/* Calendar Cells */}
        <View style={styles.grid}>
          {cells.map((dayNum, idx) => {
            if (dayNum === null) {
              return <View key={`empty-${idx}`} style={styles.cell} />;
            }

            const monthStr = String(month + 1).padStart(2, '0');
            const dayStr = String(dayNum).padStart(2, '0');
            const dateStr = `${year}-${monthStr}-${dayStr}`;
            const isSelected = dateStr === activeDate;
            const eventCount = (eventsByDate[dateStr] || []).length;

            return (
              <TouchableOpacity
                key={dateStr}
                testID={`month-day-${dateStr}`}
                style={[styles.cell, isSelected && styles.cellActive]}
                onPress={() => {
                  setActiveDate(dateStr);
                  onSelectDate(dateStr);
                }}
              >
                <Text
                  style={[styles.dayNumText, isSelected && styles.dayNumTextActive]}
                >
                  {dayNum}
                </Text>
                {eventCount > 0 ? (
                  <View style={styles.dot} />
                ) : (
                  <View style={styles.dotPlaceholder} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* Selected Day Agenda Listing */}
      <View style={styles.agendaSection}>
        <Text style={styles.sectionTitle}>
          {t('calendar.agenda_for', 'Agenda for')} {activeDate} ({currentDayEvents.length})
        </Text>

        {currentDayEvents.length === 0 ? (
          <View style={styles.emptyContainer} testID="month-view-empty">
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
                testID={`month-event-${ev.event_type.toLowerCase()}-${ev.id}`}
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
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  gridCard: {
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
    marginBottom: 8,
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 2,
  },
  cellActive: {
    backgroundColor: Colors.primary,
  },
  dayNumText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  dayNumTextActive: {
    color: Colors.text.white,
    fontWeight: '700',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.gold,
    marginTop: 3,
  },
  dotPlaceholder: {
    height: 5,
    marginTop: 3,
  },
  agendaSection: {
    marginTop: 8,
  },
  sectionTitle: {
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
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.text.muted,
    fontSize: 14,
  },
});

