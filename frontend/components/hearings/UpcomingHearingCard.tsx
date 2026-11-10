import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { AppIcon } from '../common/AppIcon';
import { Colors } from '../../constants/colors';
import { HearingItem } from '../../types';
import { formatDate } from '../../utils/formatters';

export interface UpcomingHearingCardProps {
  item: HearingItem;
  onPressCase?: (caseId: number) => void;
  onReschedule?: (item: HearingItem) => void;
}

export const UpcomingHearingCard: React.FC<UpcomingHearingCardProps> = ({
  item,
  onPressCase,
  onReschedule,
}) => {
  const { t } = useTranslation();

  const getCountdownLabel = (
    dateStr: string
  ): { label: string; variant: 'danger' | 'warning' | 'primary' } => {
    try {
      const target = new Date(dateStr);
      const now = new Date();
      target.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      const diffMs = target.getTime() - now.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 0)
        return { label: t('hearings.today', 'Today'), variant: 'danger' };
      if (diffDays === 1)
        return { label: t('hearings.tomorrow', 'Tomorrow'), variant: 'warning' };
      return {
        label: t('hearings.inDays', `In ${diffDays} days`, { count: diffDays }),
        variant: 'primary',
      };
    } catch {
      return { label: formatDate(dateStr), variant: 'primary' };
    }
  };

  const countdown = getCountdownLabel(item.hearing_date);
  const isRescheduled = Boolean(item.is_rescheduled || item.status === 'RESCHEDULED');
  const caseNumber = item.case_details?.formatted_case_number || `Case #${item.case}`;

  return (
    <Card style={styles.card} testID={`upcoming-hearing-card-${item.id}`}>
      {/* Top Header: Case Identifier, Countdown Badge, Status */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => onPressCase && onPressCase(item.case)}
          activeOpacity={0.7}
          testID={`hearing-case-link-${item.id}`}
        >
          <Text style={styles.caseNumber}>{caseNumber}</Text>
        </TouchableOpacity>

        <View style={styles.badgeGroup}>
          <Badge label={countdown.label} variant={countdown.variant} />
          {isRescheduled ? (
            <Badge
              label={t('hearings.rescheduled', 'Rescheduled')}
              variant="warning"
              testID={`hearing-rescheduled-badge-${item.id}`}
            />
          ) : (
            <Badge label={item.status || 'Scheduled'} variant="primary" />
          )}
        </View>
      </View>

      {/* Parties */}
      {item.case_details ? (
        <Text style={styles.parties} numberOfLines={2}>
          {item.case_details.petitioner} vs {item.case_details.respondent}
        </Text>
      ) : null}

      {/* Date & Court Hall Details */}
      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>{t('cases.nextHearing', 'Date & Time')}:</Text>
          <Text style={styles.detailValue} testID={`hearing-datetime-${item.id}`}>
            {formatDate(item.hearing_date)}{' '}
            {item.hearing_time ? `• ${item.hearing_time}` : '• 10:30 AM'}
          </Text>
        </View>

        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>{t('tokens.hall', 'Court Hall')}:</Text>
          <Text style={styles.detailValue}>
            {item.court_hall_number ? `Hall ${item.court_hall_number}` : 'Unassigned'}
            {item.item_number ? ` (Item #${item.item_number})` : ''}
          </Text>
        </View>
      </View>

      {/* Rescheduled Notice Box */}
      {isRescheduled && item.previous_hearing_date ? (
        <View
          style={styles.rescheduledBox}
          testID={`hearing-rescheduled-info-${item.id}`}
        >
          <View style={styles.rescheduledHeader}>
            <AppIcon name="refresh" size={13} color={Colors.gold} />
            <Text style={styles.rescheduledText}>
              {t('hearings.previouslyListed', 'Prior Date')}:{' '}
              {formatDate(item.previous_hearing_date)}{' '}
              {item.previous_hearing_time ? `at ${item.previous_hearing_time}` : ''}
            </Text>
          </View>
          {item.rescheduled_reason ? (
            <Text style={styles.reasonText}>
              {t('hearings.reason', 'Reason')}: {item.rescheduled_reason}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Footer Action */}
      {onReschedule ? (
        <View style={styles.footer}>
          <Button
            title={t('hearings.rescheduleAction', 'Reschedule Appearance')}
            variant="outline"
            onPress={() => onReschedule(item)}
            style={styles.rescheduleBtn}
            testID={`hearing-reschedule-btn-${item.id}`}
          />
        </View>
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  caseNumber: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  badgeGroup: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  parties: {
    color: Colors.text.secondary,
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexWrap: 'wrap',
    gap: 8,
  },
  detailItem: {
    minWidth: 130,
  },
  detailLabel: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  detailValue: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  rescheduledBox: {
    backgroundColor: Colors.goldSurface,
    borderLeftWidth: 3,
    borderLeftColor: Colors.gold,
    borderRadius: 6,
    padding: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  rescheduledHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rescheduledText: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: '700',
  },
  reasonText: {
    color: Colors.text.secondary,
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic',
  },
  footer: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  rescheduleBtn: {
    width: '100%',
  },
});
