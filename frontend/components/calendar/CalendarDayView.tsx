import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { AppIcon } from '../common/AppIcon';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import {
  AgendaEventUnion,
  AgendaHearingItem,
  AgendaReminderItem,
  AgendaResponse,
  AgendaTokenItem,
} from '../../types';
import { deriveAgendaRecords } from './AgendaSummaryPanel';
import { formatDisplayTime, formatLongDate } from '../../utils/calendarDate';

export interface CalendarDayViewProps {
  agenda: AgendaResponse;
  selectedDate?: string;
  onSelectEvent: (event: AgendaEventUnion) => void;
  onOpenCase?: (caseId: number) => void;
  onOpenTokens?: () => void;
  onToggleCompleteReminder?: (reminder: AgendaReminderItem) => void;
}

export const CalendarDayView: React.FC<CalendarDayViewProps> = ({
  agenda,
  selectedDate,
  onSelectEvent,
  onOpenCase,
  onOpenTokens,
  onToggleCompleteReminder,
}) => {
  const { t } = useTranslation();
  const effectiveDate = selectedDate || agenda.selected_date;

  const {
    hearings,
    deadlines: compliance,
    reminders,
    tokens,
    caseNumberById,
  } = useMemo(
    () => deriveAgendaRecords(agenda, 'day', effectiveDate),
    [agenda, effectiveDate]
  );

  const hasEvents =
    hearings.length > 0 ||
    reminders.length > 0 ||
    compliance.length > 0 ||
    tokens.length > 0;

  return (
    <View style={styles.container} testID="calendar-day-view">
      {!hasEvents ? (
        <View style={styles.emptyContainer} testID="day-view-empty">
          <View style={styles.emptyIconCircle}>
            <AppIcon name="calendar" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>
            No events scheduled for {formatLongDate(effectiveDate)}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t(
              'calendar.empty_hint',
              'Court appearances, filing deadlines and diary notes will appear here.'
            )}
          </Text>
        </View>
      ) : (
        <>
          {/* Hearings Section */}
          {hearings.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <AppIcon name="landmark" size={14} color={Colors.primary} />
                <Text style={styles.sectionTitle}>
                  {t('calendar.hearings', 'Hearings')} ({hearings.length})
                </Text>
              </View>
              {hearings.map((h: AgendaHearingItem) => (
                <TouchableOpacity
                  key={`h-${h.id}`}
                  testID={`hearing-card-${h.id}`}
                  onPress={() =>
                    h.case_id && onOpenCase ? onOpenCase(h.case_id) : onSelectEvent(h)
                  }
                  activeOpacity={0.75}
                >
                  <Card style={styles.eventCard}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{h.case_number}</Text>
                      <Badge
                        label={h.status}
                        variant={
                          h.status === 'COMPLETED'
                            ? 'success'
                            : h.status === 'RESCHEDULED'
                              ? 'warning'
                              : 'primary'
                        }
                      />
                    </View>

                    {h.petitioner && h.respondent ? (
                      <Text style={styles.partiesText} numberOfLines={1}>
                        {h.petitioner} v. {h.respondent}
                      </Text>
                    ) : null}

                    <View style={styles.cardFooter}>
                      <View style={styles.iconTextRow}>
                        <AppIcon name="map-pin" size={12} color={Colors.text.muted} />
                        <Text style={styles.detailText}>
                          Hall {h.court_hall_number || '—'} • Item #{h.item_number || '—'}
                        </Text>
                      </View>
                      <View style={styles.iconTextRow}>
                        <AppIcon name="clock" size={12} color={Colors.primaryLight} />
                        <Text style={styles.timeText}>
                          {formatDisplayTime(h.hearing_time)}
                        </Text>
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Compliance Deadlines Section */}
          {compliance.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <AppIcon name="alert-triangle" size={14} color={Colors.warning} />
                <Text style={styles.sectionTitle}>
                  {t('calendar.compliance_deadlines', 'Compliance Deadlines')} (
                  {compliance.length})
                </Text>
              </View>
              {compliance.map((c: AgendaReminderItem) => (
                <TouchableOpacity
                  key={`c-${c.id}`}
                  testID={`deadline-card-${c.id}`}
                  onPress={() =>
                    c.case_id && onOpenCase ? onOpenCase(c.case_id) : onSelectEvent(c)
                  }
                  activeOpacity={0.75}
                >
                  <Card style={[styles.eventCard, styles.deadlineCardBorder]}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{c.title}</Text>
                      <Badge label={c.reminder_type} variant="warning" />
                    </View>

                    {c.case_number ? (
                      <Text style={styles.partiesText}>{c.case_number}</Text>
                    ) : null}

                    <View style={styles.cardFooter}>
                      <View style={styles.iconTextRow}>
                        <AppIcon name="alarm-clock" size={12} color={Colors.text.muted} />
                        <Text style={styles.detailText}>
                          {formatDisplayTime(c.time || c.due_date)}
                        </Text>
                      </View>
                      {c.is_completed ? (
                        <Badge label="COMPLETED" variant="success" />
                      ) : (
                        <Text style={styles.pendingText}>PENDING</Text>
                      )}
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Reminders Section */}
          {reminders.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <AppIcon name="file-text" size={14} color={Colors.text.secondary} />
                <Text style={styles.sectionTitle}>
                  {t('calendar.reminders', 'Reminders')} ({reminders.length})
                </Text>
              </View>
              {reminders.map((r: AgendaReminderItem) => (
                <View key={`r-${r.id}`} testID={`reminder-card-${r.id}`}>
                  <Card style={styles.eventCard}>
                    <View style={styles.cardHeader}>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => onSelectEvent(r)}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            styles.cardTitle,
                            r.is_completed && styles.completedText,
                          ]}
                        >
                          {r.title}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`reminder-toggle-${r.id}`}
                        onPress={() => onToggleCompleteReminder?.(r)}
                        style={styles.checkButton}
                        accessibilityRole="button"
                        accessibilityLabel={
                          r.is_completed ? 'Mark incomplete' : 'Mark complete'
                        }
                      >
                        <AppIcon
                          name={r.is_completed ? 'check-circle' : 'circle'}
                          size={18}
                          color={r.is_completed ? Colors.success : Colors.text.muted}
                        />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      onPress={() => onSelectEvent(r)}
                      activeOpacity={0.75}
                    >
                      {r.description ? (
                        <Text style={styles.partiesText} numberOfLines={2}>
                          {r.description}
                        </Text>
                      ) : null}

                      <View style={styles.cardFooter}>
                        <View style={styles.iconTextRow}>
                          <AppIcon name="clock" size={12} color={Colors.text.muted} />
                          <Text style={styles.detailText}>
                            {formatDisplayTime(r.time || r.due_date)}
                          </Text>
                        </View>
                        <Badge label={r.reminder_type} variant="secondary" />
                      </View>
                    </TouchableOpacity>
                  </Card>
                </View>
              ))}
            </View>
          )}

          {/* Live Court Token Alerts */}
          {tokens.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <AppIcon name="bell" size={14} color={Colors.gold} />
                <Text style={styles.sectionTitle}>
                  {t('calendar.live_tokens', 'Court Token Alerts')} ({tokens.length})
                </Text>
              </View>
              {tokens.map((tk: AgendaTokenItem) => (
                <TouchableOpacity
                  key={`tk-${tk.id}`}
                  testID={`token-card-${tk.id}`}
                  onPress={() => (onOpenTokens ? onOpenTokens() : onSelectEvent(tk))}
                  activeOpacity={0.75}
                >
                  <Card style={[styles.eventCard, styles.tokenCardBorder]}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>Token #{tk.token_number}</Text>
                      <Badge label={tk.status} variant="gold" />
                    </View>

                    {tk.case_id && caseNumberById[tk.case_id] ? (
                      <Text style={styles.partiesText}>{caseNumberById[tk.case_id]}</Text>
                    ) : null}

                    <View style={styles.cardFooter}>
                      <Text style={styles.detailText}>
                        Court Hall {tk.court_hall_number} • Item #{tk.item_number || '—'}
                      </Text>
                      {tk.items_remaining !== undefined && tk.items_remaining !== null ? (
                        <Text style={styles.tokenHighlight}>
                          {tk.items_remaining} items left
                        </Text>
                      ) : null}
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.text.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  eventCard: {
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deadlineCardBorder: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  tokenCardBorder: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.gold,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    flex: 1,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: Colors.text.muted,
  },
  partiesText: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  iconTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: Colors.text.muted,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primaryLight,
  },
  pendingText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.warning,
  },
  tokenHighlight: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gold,
  },
  checkButton: {
    padding: 4,
  },
});
