import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { AppIcon } from '../common/AppIcon';
import { Colors } from '../../constants/colors';
import { CaseItem } from '../../types';
import { formatCaseNumber, formatDate } from '../../utils/formatters';

export interface CaseCardProps {
  item: CaseItem;
  onPress: (id: number) => void;
  onViewJudgment?: (item: CaseItem) => void;
}

export const CaseCard: React.FC<CaseCardProps> = ({ item, onPress, onViewJudgment }) => {
  const effectiveStatus = item.status || item.current_stage || 'Pending';
  const hasJudgment = Boolean(item.judgment_date || item.latest_judgment);
  const judgmentDate = item.judgment_date || item.latest_judgment?.judgment_date;
  const nextHearingDate = item.effective_next_hearing_date || item.next_hearing_date;

  const getStatusBadgeVariant = (statusText: string): 'gold' | 'primary' | 'success' => {
    const s = statusText.toLowerCase();
    if (s.includes('judgment')) return 'gold';
    if (s.includes('adjourn')) return 'gold';
    if (s.includes('upcoming') || s.includes('listed')) return 'primary';
    if (s.includes('disposed')) return 'success';
    return 'primary';
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress(item.id)}
      testID={`case-card-${item.id}`}
    >
      <Card style={styles.card}>
        {/* Header: Case Identifier & Derived Status Badge */}
        <View style={styles.header}>
          <Text style={styles.caseNumber} testID={`case-number-${item.id}`}>
            {formatCaseNumber(item.case_type, item.case_number, item.filing_year)}
          </Text>
          <Badge
            label={effectiveStatus}
            variant={getStatusBadgeVariant(effectiveStatus)}
            testID={`case-status-badge-${item.id}`}
          />
        </View>

        {/* Case Name / Parties & Case Date */}
        <View style={styles.partiesRow}>
          <Text style={styles.parties} numberOfLines={2} testID={`case-name-${item.id}`}>
            {item.petitioner} vs {item.respondent}
          </Text>
          <Text style={styles.filingDate} testID={`case-date-${item.id}`}>
            Filing: {item.filing_year}
          </Text>
        </View>

        {/* Judgment Row */}
        <View style={styles.judgmentRow}>
          <View style={styles.judgmentInfo}>
            <Text style={styles.judgmentLabel}>Judgment:</Text>
            {hasJudgment && judgmentDate ? (
              <Text style={styles.judgmentDateValue} testID={`judgment-date-${item.id}`}>
                {formatDate(judgmentDate)}
              </Text>
            ) : (
              <Text
                style={styles.judgmentPendingValue}
                testID={`judgment-pending-${item.id}`}
              >
                Pending
              </Text>
            )}
          </View>
          {hasJudgment && onViewJudgment ? (
            <TouchableOpacity
              onPress={() => onViewJudgment(item)}
              style={styles.viewJudgmentBtn}
              testID={`view-judgment-btn-${item.id}`}
            >
              <Text style={styles.viewJudgmentText}>View Judgment</Text>
              <AppIcon name="external-link" size={12} color="#92400E" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Footer: Bench & Next Hearing Date */}
        <View style={styles.footer}>
          <Text style={styles.bench}>
            {item.court_hall_number
              ? `Court Hall ${item.court_hall_number}`
              : item.bench || 'Bench unassigned'}
          </Text>
          <Text style={styles.date} testID={`case-next-date-${item.id}`}>
            {nextHearingDate
              ? effectiveStatus.toLowerCase() === 'adjourned'
                ? `Adjourned to: ${formatDate(nextHearingDate)}`
                : `Next: ${formatDate(nextHearingDate)}`
              : 'Not Scheduled'}
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 18,
    marginBottom: 14,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  caseNumber: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  partiesRow: {
    marginBottom: 10,
  },
  parties: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  filingDate: {
    color: Colors.text.muted,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  judgmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 10,
    borderColor: Colors.border,
    borderWidth: 1,
  },
  judgmentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  judgmentLabel: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  judgmentDateValue: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: '700',
  },
  judgmentPendingValue: {
    color: Colors.text.muted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  viewJudgmentBtn: {
    flexDirection: 'row',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Colors.goldSurface,
    borderRadius: 8,
    borderColor: Colors.goldBorder,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewJudgmentText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  bench: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  date: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
});
