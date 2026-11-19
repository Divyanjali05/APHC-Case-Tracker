import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { AppIcon, AppIconName } from '../common/AppIcon';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import {
  AgendaEventUnion,
  AgendaHearingItem,
  AgendaReminderItem,
  AgendaResponse,
  AgendaTokenItem,
  CalendarViewType,
} from '../../types';
import {
  formatDisplayTime,
  formatLongDate,
  formatSummaryScopeLabel,
} from '../../utils/calendarDate';

export type SummaryCategory = 'hearings' | 'deadlines' | 'reminders' | 'tokens';

export interface DerivedAgendaRecords {
  hearings: AgendaHearingItem[];
  deadlines: AgendaReminderItem[];
  reminders: AgendaReminderItem[];
  tokens: AgendaTokenItem[];
  caseNumberById: Record<number, string>;
}

/**
 * Derive all 4 category lists from the backend AgendaResponse using identical
 * date/view filtering rules so card counts and displayed lists always match 1-to-1.
 */
export function deriveAgendaRecords(
  agenda: AgendaResponse | undefined,
  currentView: CalendarViewType,
  selectedDate: string
): DerivedAgendaRecords {
  if (!agenda) {
    return {
      hearings: [],
      deadlines: [],
      reminders: [],
      tokens: [],
      caseNumberById: {},
    };
  }

  const eventsByDate = agenda.events_by_date || {};

  // 1. Collect hearings for the active scope
  const hearingMap = new Map<number, AgendaHearingItem>();
  if (currentView === 'day') {
    const dayEvents = eventsByDate[selectedDate] || [];
    dayEvents.forEach(ev => {
      if (ev.event_type === 'HEARING') {
        hearingMap.set(ev.id, ev as AgendaHearingItem);
      }
    });
    (agenda.today_hearings || []).forEach(h => {
      if (!h.hearing_date || h.hearing_date === selectedDate) {
        hearingMap.set(h.id, h);
      }
    });
  } else {
    Object.values(eventsByDate).forEach(list => {
      list.forEach(ev => {
        if (ev.event_type === 'HEARING') {
          hearingMap.set(ev.id, ev as AgendaHearingItem);
        }
      });
    });
  }

  const hearings = Array.from(hearingMap.values()).sort((a, b) => {
    const cmpDate = (a.hearing_date || '').localeCompare(b.hearing_date || '');
    if (cmpDate !== 0) return cmpDate;
    return (a.hearing_time || '').localeCompare(b.hearing_time || '');
  });

  // 2. Collect reminders and compliance deadlines for the active scope
  const allReminders = agenda.reminders || [];
  const allDeadlines = agenda.compliance_deadlines || [];
  const allTokens = agenda.token_events || [];

  const reminders =
    currentView === 'day'
      ? allReminders.filter(r => (r.date || r.due_date?.slice(0, 10)) === selectedDate)
      : allReminders;

  const deadlines =
    currentView === 'day'
      ? allDeadlines.filter(d => (d.date || d.due_date?.slice(0, 10)) === selectedDate)
      : allDeadlines;

  const tokens =
    currentView === 'day'
      ? allTokens.filter(tk => tk.hearing_date === selectedDate)
      : allTokens;

  // Build real case_id -> case_number lookup from agenda items (never fabricated)
  const caseNumberById: Record<number, string> = {};
  hearings.forEach(h => {
    if (h.case_id && h.case_number) {
      caseNumberById[h.case_id] = h.case_number;
    }
  });
  (agenda.upcoming_hearings || []).forEach(h => {
    if (h.case_id && h.case_number) {
      caseNumberById[h.case_id] = h.case_number;
    }
  });
  allReminders.forEach(r => {
    if (r.case_id && r.case_number) {
      caseNumberById[r.case_id] = r.case_number;
    }
  });

  return {
    hearings,
    deadlines,
    reminders,
    tokens,
    caseNumberById,
  };
}

export interface AgendaSummaryPanelProps {
  agenda?: AgendaResponse;
  currentView: CalendarViewType;
  selectedDate: string;
  isLoading?: boolean;
  isFetching?: boolean;
  hasError?: boolean;
  onRetry?: () => void;
  selectedCategory: SummaryCategory | null;
  onSelectCategory: (category: SummaryCategory | null) => void;
  onOpenCase: (caseId: number) => void;
  onOpenTokens: () => void;
  onOpenReminders: () => void;
  onSelectEvent: (event: AgendaEventUnion) => void;
  onToggleCompleteReminder?: (reminder: AgendaReminderItem) => void;
  onDeleteReminder?: (reminder: AgendaReminderItem) => void;
}

interface CardMeta {
  key: SummaryCategory;
  label: string;
  icon: AppIconName;
  accentColor: string;
  count: number;
  emptyNoun: string;
}

export const AgendaSummaryPanel: React.FC<AgendaSummaryPanelProps> = ({
  agenda,
  currentView,
  selectedDate,
  isLoading = false,
  isFetching = false,
  hasError = false,
  onRetry,
  selectedCategory,
  onSelectCategory,
  onOpenCase,
  onOpenTokens,
  onOpenReminders,
  onSelectEvent,
  onToggleCompleteReminder,
  onDeleteReminder,
}) => {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isNarrowMobile = width < 430;

  const derived = useMemo(
    () => deriveAgendaRecords(agenda, currentView, selectedDate),
    [agenda, currentView, selectedDate]
  );

  const scopeLabel = useMemo(
    () =>
      formatSummaryScopeLabel(
        selectedDate,
        currentView,
        agenda?.start_date,
        agenda?.end_date
      ),
    [selectedDate, currentView, agenda?.start_date, agenda?.end_date]
  );

  const scopeUnit =
    currentView === 'day'
      ? 'this date'
      : currentView === 'week'
        ? 'this week'
        : 'this month';

  const cards: CardMeta[] = [
    {
      key: 'hearings',
      label: t('calendar.hearings', 'Hearings'),
      icon: 'landmark',
      accentColor: Colors.primary,
      count: derived.hearings.length,
      emptyNoun: 'hearings scheduled',
    },
    {
      key: 'deadlines',
      label: t('calendar.deadlines', 'Deadlines'),
      icon: 'alert-triangle',
      accentColor: Colors.warning,
      count: derived.deadlines.length,
      emptyNoun: 'compliance deadlines',
    },
    {
      key: 'reminders',
      label: t('calendar.reminders', 'Reminders'),
      icon: 'alarm-clock',
      accentColor: Colors.gold,
      count: derived.reminders.length,
      emptyNoun: 'reminders scheduled',
    },
    {
      key: 'tokens',
      label: t('calendar.tokens', 'Tokens'),
      icon: 'ticket',
      accentColor: Colors.success,
      count: derived.tokens.length,
      emptyNoun: 'token alerts scheduled',
    },
  ];

  const activeCardMeta = cards.find(c => c.key === selectedCategory) || null;

  const handleCardPress = (key: SummaryCategory) => {
    onSelectCategory(selectedCategory === key ? null : key);
  };

  const renderCard = (card: CardMeta) => {
    const isSelected = selectedCategory === card.key;
    return (
      <TouchableOpacity
        key={card.key}
        style={[
          styles.statCard,
          isNarrowMobile && styles.statCardGrid,
          isSelected && styles.statCardSelected,
        ]}
        onPress={() => handleCardPress(card.key)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={`${card.label}: ${card.count}. Tap to view details.`}
        testID={`summary-card-${card.key}`}
      >
        <View style={styles.statCardTopRow}>
          <View
            style={[
              styles.statIconWrap,
              isSelected && { backgroundColor: Colors.primary },
            ]}
          >
            <AppIcon
              name={card.icon}
              size={14}
              color={isSelected ? Colors.text.white : card.accentColor}
            />
          </View>
          <AppIcon
            name={isSelected ? 'chevron-up' : 'chevron-down'}
            size={13}
            color={isSelected ? Colors.primary : Colors.text.muted}
          />
        </View>

        <Text
          style={[
            styles.statNumber,
            { color: isSelected ? Colors.primary : card.accentColor },
          ]}
          testID={`summary-count-${card.key}`}
        >
          {isLoading && !agenda ? '—' : card.count}
        </Text>
        <Text
          style={[styles.statLabel, isSelected && styles.statLabelSelected]}
          numberOfLines={1}
        >
          {card.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderSelectedContent = () => {
    if (!selectedCategory || !activeCardMeta) return null;

    if (isLoading && !agenda) {
      return (
        <View style={styles.panelStateBox} testID="summary-panel-loading">
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.panelStateText}>
            Loading {activeCardMeta.label.toLowerCase()}...
          </Text>
        </View>
      );
    }

    if (hasError && !agenda) {
      return (
        <View style={styles.panelStateBox} testID="summary-panel-error">
          <AppIcon name="alert-circle" size={18} color={Colors.danger} />
          <Text style={styles.panelErrorText}>
            Unable to load {activeCardMeta.label.toLowerCase()}.
          </Text>
          {onRetry && (
            <TouchableOpacity style={styles.retryPillBtn} onPress={onRetry}>
              <Text style={styles.retryPillText}>{t('common.retry', 'Retry')}</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // 1. HEARINGS LIST
    if (selectedCategory === 'hearings') {
      if (derived.hearings.length === 0) {
        return (
          <View style={styles.panelEmptyBox} testID="summary-empty-hearings">
            <AppIcon name="landmark" size={20} color={Colors.text.muted} />
            <Text style={styles.panelEmptyTitle}>
              No hearings scheduled for {scopeUnit}
            </Text>
            <Text style={styles.panelEmptyHint}>
              Switch dates or use Day, Week, or Month views to inspect other hearings.
            </Text>
          </View>
        );
      }

      return derived.hearings.map(h => (
        <TouchableOpacity
          key={`sum-h-${h.id}`}
          onPress={() => (h.case_id ? onOpenCase(h.case_id) : onSelectEvent(h))}
          activeOpacity={0.75}
          testID={`summary-hearing-item-${h.id}`}
        >
          <Card style={styles.recordCard}>
            <View style={styles.recordTopRow}>
              <Text style={styles.recordTitle} numberOfLines={1}>
                {h.case_number}
              </Text>
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

            {h.petitioner || h.respondent ? (
              <Text style={styles.recordParties} numberOfLines={1}>
                {h.petitioner || '—'} v. {h.respondent || '—'}
              </Text>
            ) : null}

            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <AppIcon name="calendar" size={12} color={Colors.text.muted} />
                <Text style={styles.metaText}>
                  {formatLongDate(h.hearing_date)} • {formatDisplayTime(h.hearing_time)}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <AppIcon name="landmark" size={12} color={Colors.text.muted} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {h.bench || h.court_name || 'High Court of Andhra Pradesh'}
                  {h.court_hall_number ? ` • Hall ${h.court_hall_number}` : ''}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <AppIcon name="file-text" size={12} color={Colors.text.muted} />
                <Text style={styles.metaText} numberOfLines={2}>
                  {h.business_conducted?.trim() || `${h.case_type || 'Court'} Hearing`}
                </Text>
              </View>
            </View>

            <View style={styles.recordActionRow}>
              <Text style={styles.recordLinkText}>Open Case Details</Text>
              <AppIcon name="chevron-right" size={14} color={Colors.primary} />
            </View>
          </Card>
        </TouchableOpacity>
      ));
    }

    // 2. DEADLINES LIST
    if (selectedCategory === 'deadlines') {
      if (derived.deadlines.length === 0) {
        return (
          <View style={styles.panelEmptyBox} testID="summary-empty-deadlines">
            <AppIcon name="alert-triangle" size={20} color={Colors.text.muted} />
            <Text style={styles.panelEmptyTitle}>
              No compliance deadlines for {scopeUnit}
            </Text>
            <Text style={styles.panelEmptyHint}>
              Filing and process fee (batta) deadlines appear here automatically.
            </Text>
          </View>
        );
      }

      return derived.deadlines.map(d => (
        <View key={`sum-d-${d.id}`} testID={`summary-deadline-item-${d.id}`}>
          <Card style={[styles.recordCard, styles.deadlineBorder]}>
            <View style={styles.recordTopRow}>
              <TouchableOpacity
                style={styles.flexOne}
                onPress={() => (d.case_id ? onOpenCase(d.case_id) : onSelectEvent(d))}
                activeOpacity={0.75}
              >
                <Text
                  style={[styles.recordTitle, d.is_completed && styles.completedText]}
                  numberOfLines={2}
                >
                  {d.title}
                </Text>
              </TouchableOpacity>
              <Badge label={d.reminder_type} variant="warning" />
            </View>

            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <AppIcon name="briefcase" size={12} color={Colors.text.muted} />
                <Text style={styles.metaText}>
                  {d.case_number || 'General Compliance'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <AppIcon name="calendar" size={12} color={Colors.text.muted} />
                <Text style={styles.metaText}>
                  Due:{' '}
                  {formatLongDate(d.date || d.due_date?.slice(0, 10) || selectedDate)} •{' '}
                  {formatDisplayTime(d.time || d.due_date)}
                </Text>
              </View>
            </View>

            <View style={styles.recordFooterActions}>
              <Badge
                label={d.is_completed ? 'COMPLETED' : 'PENDING'}
                variant={d.is_completed ? 'success' : 'secondary'}
              />
              <View style={styles.inlineActionButtons}>
                {onToggleCompleteReminder && (
                  <TouchableOpacity
                    style={styles.smallActionBtn}
                    onPress={() => onToggleCompleteReminder(d)}
                    testID={`summary-deadline-toggle-${d.id}`}
                  >
                    <AppIcon
                      name={d.is_completed ? 'rotate-ccw' : 'check-circle'}
                      size={13}
                      color={Colors.primary}
                    />
                    <Text style={styles.smallActionText}>
                      {d.is_completed ? 'Reopen' : 'Mark Done'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.smallActionBtn}
                  onPress={() => (d.case_id ? onOpenCase(d.case_id) : onSelectEvent(d))}
                >
                  <Text style={styles.smallActionText}>
                    {d.case_id ? 'Open Case' : 'Details'}
                  </Text>
                  <AppIcon name="chevron-right" size={13} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        </View>
      ));
    }

    // 3. REMINDERS LIST
    if (selectedCategory === 'reminders') {
      if (derived.reminders.length === 0) {
        return (
          <View style={styles.panelEmptyBox} testID="summary-empty-reminders">
            <AppIcon name="alarm-clock" size={20} color={Colors.text.muted} />
            <Text style={styles.panelEmptyTitle}>
              No reminders scheduled for {scopeUnit}
            </Text>
            <TouchableOpacity style={styles.manageAllLink} onPress={onOpenReminders}>
              <Text style={styles.recordLinkText}>Open Reminders Diary</Text>
              <AppIcon name="chevron-right" size={14} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <>
          {derived.reminders.map(r => (
            <View key={`sum-r-${r.id}`} testID={`summary-reminder-item-${r.id}`}>
              <Card style={styles.recordCard}>
                <View style={styles.recordTopRow}>
                  <TouchableOpacity
                    style={styles.flexOne}
                    onPress={() => onSelectEvent(r)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[styles.recordTitle, r.is_completed && styles.completedText]}
                      numberOfLines={2}
                    >
                      {r.title}
                    </Text>
                  </TouchableOpacity>
                  <Badge label={r.reminder_type} variant="secondary" />
                </View>

                <View style={styles.metaGrid}>
                  {r.case_number ? (
                    <View style={styles.metaItem}>
                      <AppIcon name="briefcase" size={12} color={Colors.text.muted} />
                      <Text style={styles.metaText}>{r.case_number}</Text>
                    </View>
                  ) : null}
                  <View style={styles.metaItem}>
                    <AppIcon name="clock" size={12} color={Colors.text.muted} />
                    <Text style={styles.metaText}>
                      {formatLongDate(r.date || r.due_date?.slice(0, 10) || selectedDate)}{' '}
                      • {formatDisplayTime(r.time || r.due_date)}
                    </Text>
                  </View>
                </View>

                <View style={styles.recordFooterActions}>
                  <Badge
                    label={r.is_completed ? 'COMPLETED' : r.status || 'PENDING'}
                    variant={r.is_completed ? 'success' : 'gold'}
                  />
                  <View style={styles.inlineActionButtons}>
                    {onToggleCompleteReminder && (
                      <TouchableOpacity
                        style={styles.smallActionBtn}
                        onPress={() => onToggleCompleteReminder(r)}
                        testID={`summary-reminder-toggle-${r.id}`}
                      >
                        <AppIcon
                          name={r.is_completed ? 'rotate-ccw' : 'check-circle'}
                          size={13}
                          color={Colors.primary}
                        />
                        <Text style={styles.smallActionText}>
                          {r.is_completed ? 'Reopen' : 'Complete'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {onDeleteReminder && (
                      <TouchableOpacity
                        style={styles.smallDangerBtn}
                        onPress={() => onDeleteReminder(r)}
                        testID={`summary-reminder-delete-${r.id}`}
                        accessibilityLabel="Delete reminder"
                      >
                        <AppIcon name="trash" size={13} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.smallActionBtn}
                      onPress={() => onSelectEvent(r)}
                    >
                      <Text style={styles.smallActionText}>View</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            </View>
          ))}
          <TouchableOpacity
            style={styles.manageAllFooterBtn}
            onPress={onOpenReminders}
            testID="summary-manage-all-reminders"
          >
            <Text style={styles.recordLinkText}>Manage All Reminders</Text>
            <AppIcon name="chevron-right" size={14} color={Colors.primary} />
          </TouchableOpacity>
        </>
      );
    }

    // 4. TOKENS LIST
    if (selectedCategory === 'tokens') {
      if (derived.tokens.length === 0) {
        return (
          <View style={styles.panelEmptyBox} testID="summary-empty-tokens">
            <AppIcon name="ticket" size={20} color={Colors.text.muted} />
            <Text style={styles.panelEmptyTitle}>
              No token alerts scheduled for {scopeUnit}
            </Text>
            <TouchableOpacity style={styles.manageAllLink} onPress={onOpenTokens}>
              <Text style={styles.recordLinkText}>Open Live Court Tokens</Text>
              <AppIcon name="chevron-right" size={14} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        );
      }

      return derived.tokens.map(tk => {
        const linkedCaseNum = tk.case_id ? derived.caseNumberById[tk.case_id] : undefined;
        return (
          <TouchableOpacity
            key={`sum-tk-${tk.id}`}
            onPress={onOpenTokens}
            activeOpacity={0.75}
            testID={`summary-token-item-${tk.id}`}
          >
            <Card style={[styles.recordCard, styles.tokenBorder]}>
              <View style={styles.recordTopRow}>
                <Text style={styles.recordTitle} numberOfLines={1}>
                  Token #{tk.token_number}
                </Text>
                <Badge label={tk.status} variant="gold" />
              </View>

              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <AppIcon name="briefcase" size={12} color={Colors.text.muted} />
                  <Text style={styles.metaText}>
                    {linkedCaseNum ||
                      (tk.case_id ? `Case #${tk.case_id}` : 'Tracked Matter')}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <AppIcon name="landmark" size={12} color={Colors.text.muted} />
                  <Text style={styles.metaText}>
                    Court Hall {tk.court_hall_number}
                    {tk.item_number ? ` • Item #${tk.item_number}` : ''}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <AppIcon name="calendar" size={12} color={Colors.text.muted} />
                  <Text style={styles.metaText}>
                    {formatLongDate(tk.hearing_date)}
                    {tk.last_observed_at
                      ? ` • Synced ${formatDisplayTime(tk.last_observed_at)}`
                      : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.recordActionRow}>
                <Text style={styles.recordLinkText}>Open Token Details</Text>
                <AppIcon name="chevron-right" size={14} color={Colors.primary} />
              </View>
            </Card>
          </TouchableOpacity>
        );
      });
    }

    return null;
  };

  return (
    <View style={styles.wrapper} testID="calendar-summary-panel">
      {/* 4 Interactive Summary Cards (2x2 on narrow mobile, 4-col on wider screens) */}
      {isNarrowMobile ? (
        <View style={styles.gridContainer}>
          <View style={styles.gridRow}>
            {renderCard(cards[0])}
            {renderCard(cards[1])}
          </View>
          <View style={styles.gridRow}>
            {renderCard(cards[2])}
            {renderCard(cards[3])}
          </View>
        </View>
      ) : (
        <View style={styles.fourColRow}>{cards.map(renderCard)}</View>
      )}

      {/* Selected Category Detail Section */}
      {selectedCategory && activeCardMeta && (
        <View
          style={styles.detailPanel}
          testID={`summary-detail-panel-${selectedCategory}`}
        >
          <View style={styles.detailHeader}>
            <View style={styles.detailHeaderLeft}>
              <AppIcon name={activeCardMeta.icon} size={15} color={Colors.primary} />
              <Text style={styles.detailHeading} numberOfLines={2}>
                {activeCardMeta.label} for {scopeLabel}
              </Text>
              {isFetching && <ActivityIndicator size="small" color={Colors.primary} />}
            </View>
            <TouchableOpacity
              onPress={() => onSelectCategory(null)}
              style={styles.closePanelBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Close ${activeCardMeta.label} section`}
              testID="summary-panel-close-btn"
            >
              <AppIcon name="x" size={16} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.detailList}>{renderSelectedContent()}</View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  gridContainer: {
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fourColRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 78,
    backgroundColor: Colors.surface,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'space-between',
    ...Shadows.subtle,
  },
  statCardGrid: {
    minHeight: 76,
  },
  statCardSelected: {
    backgroundColor: Colors.surfaceBlue,
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  statCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginTop: 2,
  },
  statLabelSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  detailPanel: {
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
    ...Shadows.card,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  detailHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  detailHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    flex: 1,
  },
  closePanelBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailList: {
    padding: 12,
    gap: 10,
  },
  panelStateBox: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  panelStateText: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  panelErrorText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.danger,
  },
  retryPillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.button,
    backgroundColor: Colors.primary,
  },
  retryPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.white,
  },
  panelEmptyBox: {
    paddingVertical: 22,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
  },
  panelEmptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  panelEmptyHint: {
    fontSize: 12,
    color: Colors.text.muted,
    textAlign: 'center',
    lineHeight: 17,
  },
  recordCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.button,
    backgroundColor: Colors.surface,
  },
  deadlineBorder: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  tokenBorder: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.gold,
  },
  recordTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  flexOne: {
    flex: 1,
  },
  recordTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    flex: 1,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: Colors.text.muted,
  },
  recordParties: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.secondary,
    marginBottom: 6,
  },
  metaGrid: {
    gap: 4,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: Colors.text.secondary,
    flex: 1,
  },
  recordActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  recordLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  recordFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: Colors.surfaceBlue,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  smallActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  smallDangerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: Colors.dangerSurface,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
  },
  manageAllLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingVertical: 4,
  },
  manageAllFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: Radius.button,
    backgroundColor: Colors.surfaceBlue,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
