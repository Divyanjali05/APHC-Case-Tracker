import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { AppIcon } from '../common/AppIcon';
import { Colors } from '../../constants/colors';
import { Radius, Spacing } from '../../constants/theme';
import { CaseItem } from '../../types';
import { formatCaseNumber, formatDate } from '../../utils/formatters';

export interface CaseCardProps {
  item: CaseItem;
  onPress: (id: number) => void;
  onEdit?: (item: CaseItem) => void;
  onDelete?: (item: CaseItem) => void;
  onViewJudgment?: (item: CaseItem) => void;
  onStatusClick?: (status: string) => void;
}

export const CaseCard: React.FC<CaseCardProps> = ({
  item,
  onPress,
  onEdit,
  onDelete,
  onViewJudgment,
  onStatusClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const effectiveStatus = item.status || item.current_stage || 'Pending';
  const hasJudgment = Boolean(item.judgment_date || item.latest_judgment);
  const judgmentDate = item.judgment_date || item.latest_judgment?.judgment_date;
  const nextHearingDate = item.effective_next_hearing_date || item.next_hearing_date;

  const getStatusBadgeVariant = (statusText: string): 'gold' | 'primary' | 'success' => {
    const s = statusText.toLowerCase();
    if (s.includes('judgment') || s.includes('adjourn')) return 'gold';
    if (s.includes('disposed') || s.includes('closed')) return 'success';
    return 'primary';
  };

  const formattedCaseNum = formatCaseNumber(
    item.case_type,
    item.case_number,
    item.filing_year
  );

  return (
    <Card style={styles.card} testID={`case-card-${item.id}`}>
      {/* Header: Case Identifier & Status Badge */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => onPress(item.id)}
          style={styles.caseNumberTouchable}
          testID={`case-number-${item.id}`}
        >
          <Text style={styles.caseNumber}>{formattedCaseNum}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onStatusClick?.(effectiveStatus)}
          testID={`case-status-badge-${item.id}`}
          activeOpacity={onStatusClick ? 0.75 : 1}
        >
          <Badge
            label={effectiveStatus}
            variant={getStatusBadgeVariant(effectiveStatus)}
          />
        </TouchableOpacity>
      </View>

      {/* Case Name / Parties & Case Date */}
      <TouchableOpacity
        onPress={() => onPress(item.id)}
        activeOpacity={0.85}
        style={styles.partiesRow}
        testID={`case-name-${item.id}`}
      >
        <Text style={styles.parties} numberOfLines={2}>
          {item.petitioner || 'Petitioner'} vs {item.respondent || 'Respondent'}
        </Text>
        <Text style={styles.filingDate} testID={`case-date-${item.id}`}>
          Filing: {item.filing_year || 'N/A'}
        </Text>
      </TouchableOpacity>

      {/* Judgment Summary Strip */}
      <View style={styles.judgmentRow}>
        <View style={styles.judgmentInfo}>
          <AppIcon name="file-text" size={13} color={Colors.text.secondary} />
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

      {/* Bench & Next Hearing Date */}
      <View style={styles.metaRow}>
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

      {/* Inline Quick Details (Expandable Drawer) */}
      {isExpanded && (
        <View style={styles.expandedDrawer} testID={`case-expanded-${item.id}`}>
          <View style={styles.drawerRow}>
            <View style={styles.drawerCol}>
              <Text style={styles.drawerLabel}>Petitioner Details</Text>
              <Text style={styles.drawerVal}>{item.petitioner || 'N/A'}</Text>
              {item.petitioner_advocate ? (
                <Text style={styles.drawerSub}>Adv: {item.petitioner_advocate}</Text>
              ) : null}
            </View>
            <View style={styles.drawerCol}>
              <Text style={styles.drawerLabel}>Respondent Details</Text>
              <Text style={styles.drawerVal}>{item.respondent || 'N/A'}</Text>
              {item.respondent_advocate ? (
                <Text style={styles.drawerSub}>Adv: {item.respondent_advocate}</Text>
              ) : null}
            </View>
          </View>

          <View style={[styles.drawerRow, { marginTop: 8 }]}>
            <View style={styles.drawerCol}>
              <Text style={styles.drawerLabel}>Current Stage</Text>
              <Text style={styles.drawerVal}>{item.current_stage || 'Regular List'}</Text>
            </View>
            <View style={styles.drawerCol}>
              <Text style={styles.drawerLabel}>Courtroom</Text>
              <Text style={styles.drawerVal}>
                {item.court_hall_number
                  ? `Court Hall ${item.court_hall_number}`
                  : item.bench || 'AP High Court'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Action Toolbar */}
      <View style={styles.actionToolbar}>
        {/* Expand / Collapse Button */}
        <TouchableOpacity
          style={styles.expandBtn}
          onPress={() => setIsExpanded(prev => !prev)}
          testID={`case-card-expand-btn-${item.id}`}
        >
          <AppIcon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="#64748B"
          />
          <Text style={styles.expandBtnText}>
            {isExpanded ? 'Less' : 'Quick Details'}
          </Text>
        </TouchableOpacity>

        {/* Action Buttons: View, Edit, Delete */}
        <View style={styles.actionButtonsRight}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onPress(item.id)}
            testID={`case-card-view-btn-${item.id}`}
          >
            <AppIcon name="eye" size={13} color={Colors.primary} />
            <Text style={styles.actionBtnText}>View</Text>
          </TouchableOpacity>

          {onEdit && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => onEdit(item)}
              testID={`case-card-edit-btn-${item.id}`}
            >
              <AppIcon name="edit" size={13} color="#475569" />
              <Text style={styles.actionBtnText}>Edit</Text>
            </TouchableOpacity>
          )}

          {onDelete && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={() => onDelete(item)}
              testID={`case-card-delete-btn-${item.id}`}
            >
              <AppIcon name="trash" size={13} color={Colors.danger} />
              <Text style={[styles.actionBtnText, styles.deleteBtnText]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  caseNumberTouchable: {
    paddingVertical: 2,
  },
  caseNumber: {
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  partiesRow: {
    marginBottom: 8,
  },
  parties: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
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
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.button,
    marginBottom: 8,
    borderColor: '#E2E8F0',
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Colors.goldSurface,
    borderRadius: 6,
    borderColor: Colors.goldBorder,
    borderWidth: 1,
    alignItems: 'center',
  },
  viewJudgmentText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    marginBottom: 8,
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
  expandedDrawer: {
    backgroundColor: '#F8FAFC',
    padding: Spacing.sm,
    borderRadius: Radius.button,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  drawerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  drawerCol: {
    flex: 1,
  },
  drawerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  drawerVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  drawerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  actionToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
    marginTop: 2,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  expandBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  actionButtonsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.badge,
    backgroundColor: '#F1F5F9',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  deleteBtn: {
    backgroundColor: '#FEF2F2',
  },
  deleteBtnText: {
    color: Colors.danger,
  },
});
