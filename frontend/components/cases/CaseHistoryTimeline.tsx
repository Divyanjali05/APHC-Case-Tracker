import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Badge } from '../common/Badge';
import { AppIcon, AppIconName } from '../common/AppIcon';
import { Colors } from '../../constants/colors';
import { CaseHistoryItem } from '../../types';
import { formatDate, formatTime } from '../../utils/formatters';

export interface CaseHistoryTimelineProps {
  history: CaseHistoryItem[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

type FilterCategory = 'ALL' | 'CASE' | 'HEARING' | 'JUDGMENT' | 'SYNC';

export const CaseHistoryTimeline: React.FC<CaseHistoryTimelineProps> = ({
  history,
  isLoading,
  isError,
  onRetry,
}) => {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('ALL');

  const filteredHistory = useMemo(() => {
    if (!history) return [];
    if (selectedCategory === 'ALL') return history;
    if (selectedCategory === 'HEARING') {
      return history.filter(item => item.event_type.toUpperCase().includes('HEARING'));
    }
    if (selectedCategory === 'JUDGMENT') {
      return history.filter(
        item =>
          item.event_type.toUpperCase().includes('JUDGMENT') ||
          item.event_type.toUpperCase().includes('DOCUMENT')
      );
    }
    if (selectedCategory === 'SYNC') {
      return history.filter(
        item => item.source === 'SYNC' || item.event_type.toUpperCase().includes('SYNC')
      );
    }
    if (selectedCategory === 'CASE') {
      return history.filter(
        item =>
          item.event_type.toUpperCase().includes('CASE') ||
          item.event_type.toUpperCase().includes('STAGE')
      );
    }
    return history;
  }, [history, selectedCategory]);

  const getEventIcon = (eventType: string): AppIconName => {
    const type = eventType.toUpperCase();
    if (type.includes('RESCHEDULE')) return 'refresh';
    if (type.includes('HEARING')) return 'calendar';
    if (type.includes('JUDGMENT')) return 'gavel';
    if (type.includes('DOCUMENT')) return 'file-text';
    if (type.includes('STAGE')) return 'activity';
    if (type.includes('SYNC')) return 'globe';
    if (type.includes('CREATED')) return 'clipboard-list';
    return 'scale';
  };

  const getEventBadgeVariant = (
    eventType: string
  ): 'primary' | 'success' | 'warning' | 'gold' | 'danger' => {
    const type = eventType.toUpperCase();
    if (type.includes('JUDGMENT')) return 'gold';
    if (type.includes('RESCHEDULE') || type.includes('STAGE')) return 'warning';
    if (type.includes('COMPLETED') || type.includes('DISPOSED')) return 'success';
    if (type.includes('SYNC')) return 'primary';
    return 'primary';
  };

  const getSourceBadgeVariant = (
    source: string
  ): 'primary' | 'success' | 'warning' | 'gold' | 'danger' => {
    switch (source.toUpperCase()) {
      case 'MANUAL':
        return 'primary';
      case 'SYNC':
        return 'success';
      case 'SYSTEM':
        return 'gold';
      default:
        return 'primary';
    }
  };

  const formatEventTitle = (eventType: string): string => {
    const key = `history.events.${eventType}`;
    const translated = t(key, '');
    if (translated && translated !== key) return translated;

    // Fallback: format snake_case or SCREAMING_SNAKE to Title Case
    return eventType
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer} testID="case-history-loading">
        <Text style={styles.stateText}>
          {t('common.loading', 'Loading audit timeline...')}
        </Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.errorContainer} testID="case-history-error">
        <Text style={styles.errorText}>
          {t('history.error', 'Unable to load case audit history.')}
        </Text>
        {onRetry ? (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={onRetry}
            testID="case-history-retry-btn"
          >
            <Text style={styles.retryButtonText}>{t('common.retry', 'Retry')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container} testID="case-history-timeline">
      {/* Category Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterContainer}
      >
        {(
          [
            { id: 'ALL', label: t('history.filterAll', 'All Events') },
            { id: 'CASE', label: t('history.filterCase', 'Case Updates') },
            { id: 'HEARING', label: t('history.filterHearings', 'Hearings') },
            { id: 'JUDGMENT', label: t('history.filterJudgments', 'Judgments') },
            { id: 'SYNC', label: t('history.filterSync', 'Registry Sync') },
          ] as const
        ).map(tab => {
          const isActive = selectedCategory === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setSelectedCategory(tab.id)}
              testID={`history-filter-${tab.id.toLowerCase()}`}
            >
              <Text
                style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Timeline List */}
      {filteredHistory.length === 0 ? (
        <View style={styles.emptyContainer} testID="case-history-empty">
          <Text style={styles.emptyText}>
            {t('history.empty', 'No audit history records found for this case.')}
          </Text>
        </View>
      ) : (
        <View style={styles.timelineList}>
          {filteredHistory.map((item, index) => {
            const isLast = index === filteredHistory.length - 1;
            const hasDiff = Boolean(item.old_value || item.new_value);
            const userLabel = item.changed_by
              ? item.changed_by.full_name || item.changed_by.username
              : item.source === 'SYNC'
                ? 'APHC Registry Sync'
                : 'Automated System';

            return (
              <View
                key={item.id}
                style={styles.timelineRow}
                testID={`history-item-${item.id}`}
              >
                {/* Left Column: Icon node + connecting line */}
                <View style={styles.trackColumn}>
                  <View style={styles.iconNode}>
                    <AppIcon
                      name={getEventIcon(item.event_type)}
                      size={15}
                      color={Colors.primary}
                    />
                  </View>
                  {!isLast && <View style={styles.trackLine} />}
                </View>

                {/* Right Column: Event Content Card */}
                <View style={styles.contentColumn}>
                  <View style={styles.bubbleCard}>
                    {/* Header Row: Title & Event Type Badge */}
                    <View style={styles.cardHeader}>
                      <Text
                        style={styles.eventTitle}
                        testID={`history-item-title-${item.id}`}
                      >
                        {formatEventTitle(item.event_type)}
                      </Text>
                      <Badge
                        label={item.event_type}
                        variant={getEventBadgeVariant(item.event_type)}
                      />
                    </View>

                    {/* Human readable description */}
                    <Text
                      style={styles.eventDescription}
                      testID={`history-item-description-${item.id}`}
                    >
                      {item.description}
                    </Text>

                    {/* Value Diff Box (Old vs New) */}
                    {hasDiff ? (
                      <View
                        style={styles.diffBox}
                        testID={`history-item-diff-${item.id}`}
                      >
                        {item.field_name ? (
                          <Text style={styles.diffField}>
                            {t('history.fieldChanged', 'Field')}: {item.field_name}
                          </Text>
                        ) : null}
                        <View style={styles.diffValuesRow}>
                          {item.old_value ? (
                            <View style={styles.diffPillOld}>
                              <Text style={styles.diffLabelOld}>
                                {t('history.previous', 'PREV')}:
                              </Text>
                              <Text style={styles.diffValOld}>{item.old_value}</Text>
                            </View>
                          ) : null}
                          {item.old_value && item.new_value ? (
                            <AppIcon
                              name="arrow-right"
                              size={12}
                              color={Colors.text.muted}
                            />
                          ) : null}
                          {item.new_value ? (
                            <View style={styles.diffPillNew}>
                              <Text style={styles.diffLabelNew}>
                                {t('history.new', 'NEW')}:
                              </Text>
                              <Text style={styles.diffValNew}>{item.new_value}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    ) : null}

                    {/* Footer Row: Timestamp, Source Badge & Changed By */}
                    <View style={styles.cardFooter}>
                      <View style={styles.timestampRow}>
                        <Text
                          style={styles.dateText}
                          testID={`history-item-date-${item.id}`}
                        >
                          {formatDate(item.created_at)}
                        </Text>
                        {formatTime(item.created_at) ? (
                          <Text
                            style={styles.timeText}
                            testID={`history-item-time-${item.id}`}
                          >
                            {' • '}
                            {formatTime(item.created_at)}
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.metaRow}>
                        <Badge
                          label={item.source}
                          variant={getSourceBadgeVariant(item.source)}
                          testID={`history-item-source-${item.id}`}
                        />
                        <Text
                          style={styles.userText}
                          numberOfLines={1}
                          testID={`history-item-user-${item.id}`}
                        >
                          {userLabel}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: Colors.text.white,
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  stateText: {
    color: Colors.text.secondary,
    fontSize: 14,
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    marginBottom: 8,
  },
  retryButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  retryButtonText: {
    color: Colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
  },
  emptyText: {
    color: Colors.text.muted,
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  timelineList: {
    position: 'relative',
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  trackColumn: {
    width: 36,
    alignItems: 'center',
    position: 'relative',
  },
  iconNode: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceBlue,
    borderWidth: 1.5,
    borderColor: Colors.infoBorder,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  trackLine: {
    position: 'absolute',
    top: 32,
    bottom: -16,
    width: 2,
    backgroundColor: Colors.border,
    zIndex: 1,
  },
  contentColumn: {
    flex: 1,
    marginLeft: 8,
  },
  bubbleCard: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  eventTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  eventDescription: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  diffBox: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.gold,
  },
  diffField: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  diffValuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  diffPillOld: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dangerSurface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
  },
  diffLabelOld: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700',
    marginRight: 4,
  },
  diffValOld: {
    color: Colors.danger,
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  diffPillNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successSurface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.successBorder,
  },
  diffLabelNew: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '700',
    marginRight: 4,
  },
  diffValNew: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 6,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    color: Colors.text.muted,
    fontSize: 12,
  },
  timeText: {
    color: Colors.text.muted,
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userText: {
    color: Colors.text.secondary,
    fontSize: 12,
    maxWidth: 140,
  },
});
