import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Badge } from '../common/Badge';
import { Colors } from '../../constants/colors';
import { CourtStatusObservationItem } from '../../types';
import { formatDate, formatTime } from '../../utils/formatters';
import { getStatusBadgeVariant } from './CourtStatusCard';

export interface CourtStatusTimelineProps {
  observations: CourtStatusObservationItem[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export const CourtStatusTimeline: React.FC<CourtStatusTimelineProps> = ({
  observations,
  isLoading,
  isError,
  onRetry,
}) => {
  const { t } = useTranslation();
  const [filterMeaningfulOnly, setFilterMeaningfulOnly] = useState(true);

  const displayList = useMemo(() => {
    if (!observations) return [];
    if (filterMeaningfulOnly) {
      return observations.filter(item => item.is_meaningful_change);
    }
    return observations;
  }, [observations, filterMeaningfulOnly]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer} testID="court-timeline-loading">
        <ActivityIndicator size="small" color={Colors.primaryLight} />
        <Text style={styles.loadingText}>
          {t('courtStatus.loadingHistory', 'Loading court observation history...')}
        </Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.errorContainer} testID="court-timeline-error">
        <Text style={styles.errorText}>
          {t(
            'courtStatus.errorLoadingHistory',
            'Unable to load court status observations.'
          )}
        </Text>
        {onRetry && (
          <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>{t('common.retry', 'Retry')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container} testID="court-status-timeline">
      {/* Header with Filter Toggle */}
      <View style={styles.headerRow}>
        <View style={styles.titleCol}>
          <Text style={styles.title}>
            {t('courtStatus.historyTitle', 'Court Status History')}
          </Text>
          <Text style={styles.subtitle}>
            {t(
              'courtStatus.historySubtitle',
              'Chronological verified listing status updates'
            )}
          </Text>
        </View>

        {/* Filter Toggle */}
        <TouchableOpacity
          style={[styles.filterPill, filterMeaningfulOnly && styles.filterPillActive]}
          onPress={() => setFilterMeaningfulOnly(prev => !prev)}
          testID="court-timeline-filter-toggle"
        >
          <Text
            style={[
              styles.filterPillText,
              filterMeaningfulOnly && styles.filterPillTextActive,
            ]}
          >
            {filterMeaningfulOnly
              ? t('courtStatus.filterTransitionsOnly', 'Changes Only')
              : t('courtStatus.filterAll', 'All Observations')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Observation Items */}
      {displayList.length === 0 ? (
        <View style={styles.emptyContainer} testID="court-timeline-empty">
          <Text style={styles.emptyText}>
            {t('courtStatus.noHistory', 'No court status observations recorded yet.')}
          </Text>
        </View>
      ) : (
        <View style={styles.timelineList}>
          {displayList.map((item, index) => {
            const isLast = index === displayList.length - 1;
            const prevStatus =
              typeof item.safe_metadata?.previous_status === 'string'
                ? item.safe_metadata.previous_status
                : null;

            return (
              <View
                key={item.id}
                style={styles.timelineItem}
                testID={`court-timeline-item-${item.id}`}
              >
                {/* Timeline spine and node */}
                <View style={styles.spineColumn}>
                  <View
                    style={[
                      styles.nodeDot,
                      item.is_meaningful_change && styles.nodeDotMeaningful,
                    ]}
                  />
                  {!isLast && <View style={styles.spineLine} />}
                </View>

                {/* Content Card */}
                <View style={styles.contentCard}>
                  {/* Status row */}
                  <View style={styles.statusRow}>
                    <View style={styles.badgeGroup}>
                      {prevStatus && prevStatus !== item.normalized_status && (
                        <>
                          <Badge label={prevStatus} variant="secondary" />
                          <Text style={styles.arrowIcon}>→</Text>
                        </>
                      )}
                      <Badge
                        label={item.normalized_status_display || item.normalized_status}
                        variant={getStatusBadgeVariant(item.normalized_status)}
                      />
                    </View>

                    {item.is_alert_dispatched && (
                      <View style={styles.alertPill} testID="alert-dispatched-pill">
                        <Text style={styles.alertPillText}>🔔 Alert Sent</Text>
                      </View>
                    )}
                  </View>

                  {/* Listing info row if available */}
                  {(item.court_hall != null ||
                    item.token_number ||
                    item.item_number != null) && (
                    <View style={styles.infoRow}>
                      {item.court_hall != null && (
                        <Text style={styles.infoBadge}>Hall {item.court_hall}</Text>
                      )}
                      {item.item_number != null && (
                        <Text style={styles.infoBadge}>Item #{item.item_number}</Text>
                      )}
                      {item.token_number && (
                        <Text style={[styles.infoBadge, styles.tokenBadge]}>
                          Token: {item.token_number}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Metadata: Source, timestamp */}
                  <View style={styles.metaRow}>
                    <Text style={styles.sourceText}>
                      {item.provider_name}
                      {item.source_reference ? ` • ${item.source_reference}` : ''}
                    </Text>
                    <Text style={styles.timestampText}>
                      {formatDate(item.observed_at)} {formatTime(item.observed_at)}
                    </Text>
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
    marginTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleCol: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  subtitle: {
    fontSize: 11,
    color: Colors.text.muted,
    marginTop: 1,
  },
  filterPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterPillActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    borderColor: Colors.primaryLight,
  },
  filterPillText: {
    fontSize: 11,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#93C5FD',
  },
  loadingContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 6,
  },
  errorContainer: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 12,
    color: Colors.danger,
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: Colors.surfaceSubtle,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  retryButtonText: {
    fontSize: 12,
    color: Colors.text.primary,
  },
  emptyContainer: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: Colors.text.muted,
  },
  timelineList: {
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  spineColumn: {
    width: 20,
    alignItems: 'center',
    paddingTop: 6,
  },
  nodeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.border,
    zIndex: 1,
  },
  nodeDotMeaningful: {
    backgroundColor: Colors.primaryLight,
  },
  spineLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.surfaceSubtle,
    marginTop: 2,
  },
  contentCard: {
    flex: 1,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 6,
    padding: 10,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  arrowIcon: {
    color: Colors.text.muted,
    marginHorizontal: 6,
    fontSize: 12,
  },
  alertPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  alertPillText: {
    fontSize: 10,
    color: Colors.gold,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  infoBadge: {
    fontSize: 11,
    color: Colors.text.secondary,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tokenBadge: {
    color: '#93C5FD',
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  sourceText: {
    fontSize: 10,
    color: Colors.text.muted,
  },
  timestampText: {
    fontSize: 10,
    color: Colors.text.muted,
  },
});
