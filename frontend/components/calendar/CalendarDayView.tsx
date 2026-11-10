import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

export interface CalendarDayViewProps {
  agenda: AgendaResponse;
  onSelectEvent: (event: AgendaEventUnion) => void;
  onToggleCompleteReminder?: (reminder: AgendaReminderItem) => void;
}

export const CalendarDayView: React.FC<CalendarDayViewProps> = ({
  agenda,
  onSelectEvent,
  onToggleCompleteReminder,
}) => {
  const { t } = useTranslation();
  const hearings = agenda.today_hearings || [];
  const reminders = agenda.reminders || [];
  const compliance = agenda.compliance_deadlines || [];
  const tokens = agenda.token_events || [];

  const hasEvents =
    hearings.length > 0 ||
    reminders.length > 0 ||
    compliance.length > 0 ||
    tokens.length > 0;

  return (
    <ScrollView style={styles.container} testID="calendar-day-view">
      {/* Summary Stat Badges */}
      <View style={styles.summaryRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{hearings.length}</Text>
          <Text style={styles.statLabel}>{t('calendar.hearings', 'Hearings')}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: Colors.warning }]}>
            {compliance.length}
          </Text>
          <Text style={styles.statLabel}>{t('calendar.deadlines', 'Deadlines')}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: Colors.gold }]}>
            {reminders.length}
          </Text>
          <Text style={styles.statLabel}>{t('calendar.reminders', 'Reminders')}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: Colors.success }]}>
            {tokens.length}
          </Text>
          <Text style={styles.statLabel}>{t('calendar.tokens', 'Tokens')}</Text>
        </View>
      </View>

      {!hasEvents ? (
        <View style={styles.emptyContainer} testID="day-view-empty">
          <View style={styles.emptyIconCircle}>
            <AppIcon name="calendar" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>
            {t('calendar.no_events_today', 'No events scheduled for this day')}
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
                  onPress={() => onSelectEvent(h)}
                  activeOpacity={0.7}
                >
                  <Card style={styles.eventCard}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{h.case_number}</Text>
                      <Badge
                        label={h.status}
                        variant={h.status === 'COMPLETED' ? 'success' : 'primary'}
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
                          {h.hearing_time || t('calendar.all_day', 'All Day')}
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
                  onPress={() => onSelectEvent(c)}
                  activeOpacity={0.7}
                >
                  <Card style={[styles.eventCard, styles.deadlineCardBorder]}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{c.title}</Text>
                      <Badge label={c.reminder_type} variant="danger" />
                    </View>

                    {c.case_number ? (
                      <Text style={styles.partiesText}>{c.case_number}</Text>
                    ) : null}

                    <View style={styles.cardFooter}>
                      <View style={styles.iconTextRow}>
                        <AppIcon name="alarm-clock" size={12} color={Colors.text.muted} />
                        <Text style={styles.detailText}>{c.time || c.date}</Text>
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

          {/* General Reminders Section */}
          {reminders.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <AppIcon name="file-text" size={14} color={Colors.text.secondary} />
                <Text style={styles.sectionTitle}>
                  {t('calendar.reminders', 'Personal Reminders')} ({reminders.length})
                </Text>
              </View>
              {reminders.map((r: AgendaReminderItem) => (
                <TouchableOpacity
                  key={`r-${r.id}`}
                  testID={`reminder-card-${r.id}`}
                  onPress={() => onSelectEvent(r)}
                  activeOpacity={0.7}
                >
                  <Card style={styles.eventCard}>
                    <View style={styles.cardHeader}>
                      <Text
                        style={[styles.cardTitle, r.is_completed && styles.completedText]}
                      >
                        {r.title}
                      </Text>
                      <TouchableOpacity
                        testID={`reminder-toggle-${r.id}`}
                        onPress={() => onToggleCompleteReminder?.(r)}
                        style={styles.checkButton}
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

                    {r.description ? (
                      <Text style={styles.partiesText} numberOfLines={2}>
                        {r.description}
                      </Text>
                    ) : null}

                    <View style={styles.cardFooter}>
                      <View style={styles.iconTextRow}>
                        <AppIcon name="clock" size={12} color={Colors.text.muted} />
                        <Text style={styles.detailText}>{r.time || r.date}</Text>
                      </View>
                      <Badge label={r.reminder_type} variant="secondary" />
                    </View>
                  </Card>
                </TouchableOpacity>
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
                  onPress={() => onSelectEvent(tk)}
                  activeOpacity={0.7}
                >
                  <Card style={[styles.eventCard, styles.tokenCardBorder]}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>Token #{tk.token_number}</Text>
                      <Badge label={tk.status} variant="gold" />
                    </View>

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
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primaryLight,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eventCard: {
    marginBottom: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deadlineCardBorder: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  tokenCardBorder: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.gold,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    flex: 1,
    marginRight: 8,
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
    fontSize: 12,
    fontWeight: '700',
    color: Colors.warning,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: Colors.text.muted,
  },
  checkButton: {
    padding: 4,
  },
  tokenHighlight: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gold,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 18,
  },
});
