import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { AppIcon } from '../common/AppIcon';
import { Colors } from '../../constants/colors';
import { ReminderItem as ReminderType } from '../../types';
import { formatDate } from '../../utils/formatters';

export interface ReminderItemProps {
  item: ReminderType;
  onDismiss?: (id: number) => void;
}

export const ReminderItemComponent: React.FC<ReminderItemProps> = ({
  item,
  onDismiss,
}) => {
  const isFinished = item.is_completed || item.status === 'DISMISSED';

  const getStatusVariant = (): 'success' | 'warning' | 'primary' | 'gold' => {
    if (isFinished) return 'success';
    if (item.status === 'SENT') return 'gold';
    if (item.status === 'CANCELLED') return 'warning';
    return 'primary';
  };

  const getStatusLabel = (): string => {
    if (isFinished) return 'Completed';
    if (item.status === 'SENT') return 'Notification Sent';
    if (item.status === 'CANCELLED') return 'Cancelled';
    return item.status || 'Pending';
  };

  return (
    <Card style={styles.card} testID={`reminder-item-${item.id}`}>
      <View style={styles.header}>
        <Text style={styles.title} testID={`reminder-title-${item.id}`}>
          {item.title}
        </Text>
        <View style={styles.badgeGroup}>
          {item.reminder_interval_hours ? (
            <Badge
              label={`${item.reminder_interval_hours}h`}
              variant="gold"
              testID={`reminder-interval-${item.id}`}
            />
          ) : null}
          <Badge
            label={getStatusLabel()}
            variant={getStatusVariant()}
            testID={`reminder-status-${item.id}`}
          />
        </View>
      </View>

      {item.description ? (
        <Text style={styles.description} testID={`reminder-desc-${item.id}`}>
          {item.description}
        </Text>
      ) : null}

      <View style={styles.footerRow}>
        <Text style={styles.date} testID={`reminder-due-${item.id}`}>
          Due: {formatDate(item.due_date)}
        </Text>

        {!isFinished && onDismiss ? (
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={() => onDismiss(item.id)}
            testID={`reminder-dismiss-btn-${item.id}`}
          >
            <AppIcon name="check" size={14} color={Colors.success} />
            <Text style={styles.dismissBtnText}>Mark Done</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  title: {
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  badgeGroup: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  description: {
    color: Colors.text.secondary,
    fontSize: 13,
    marginBottom: 8,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  date: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  dismissBtn: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 14,
    minHeight: 48,
    backgroundColor: Colors.successSurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.successBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissBtnText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
});
