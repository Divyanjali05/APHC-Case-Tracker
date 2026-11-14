import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
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
              <Text style={styles.viewJudgmentText}>View Judgment ↗</Text>
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
            {effectiveStatus.toLowerCase() === 'adjourned'
              ? `Adjourned to: ${formatDate(nextHearingDate)}`
              : `Next: ${formatDate(nextHearingDate)}`}
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  caseNumber: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  partiesRow: {
    marginBottom: 10,
  },
  parties: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  filingDate: {
    color: Colors.text.muted,
    fontSize: 11,
    marginTop: 2,
  },
  judgmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
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
    color: Colors.text.muted,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderRadius: 6,
    borderColor: Colors.gold,
    borderWidth: 1,
  },
  viewJudgmentText: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  bench: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '600',
  },
  date: {
    color: Colors.text.muted,
    fontSize: 12,
  },
});
