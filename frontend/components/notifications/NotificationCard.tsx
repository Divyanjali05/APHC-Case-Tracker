import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Badge, BadgeProps } from '../common/Badge';
import { Card } from '../common/Card';
import { Colors } from '../../constants/colors';
import { NotificationItem, NotificationCategory } from '../../types';

interface NotificationCardProps {
  notification: NotificationItem;
  onMarkRead?: (id: number) => void;
  testID?: string;
}

const getCategoryBadge = (
  category: NotificationCategory
): { label: string; variant: BadgeProps['variant'] } => {
  switch (category) {
    case 'JUDGMENT':
      return { label: 'Judgment & Orders', variant: 'gold' };
    case 'HEARING_CHANGE':
      return { label: 'Hearing Change', variant: 'warning' };
    case 'REMINDER':
      return { label: 'Hearing Reminder', variant: 'info' };
    case 'TOKEN_ALERT':
      return { label: 'Court Token Alert', variant: 'success' };
    case 'CAUSELIST':
      return { label: 'Cause List', variant: 'primary' };
    default:
      return { label: 'General Alert', variant: 'secondary' };
  }
};

export const NotificationCard: React.FC<NotificationCardProps> = ({
  notification,
  onMarkRead,
  testID,
}) => {
  const { label, variant } = getCategoryBadge(notification.category);

  return (
    <Card
      style={[styles.card, !notification.is_read && styles.unreadCard]}
      testID={testID || `notification-card-${notification.id}`}
    >
      <View style={styles.headerRow}>
        <View style={styles.badgeContainer}>
          <Badge
            label={label}
            variant={variant}
            testID={`notification-badge-${notification.id}`}
          />
          {!notification.is_read && (
            <View style={styles.unreadDot} testID={`unread-dot-${notification.id}`} />
          )}
        </View>
        <Text style={styles.timestamp}>
          {new Date(notification.sent_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>

      <Text style={[styles.title, !notification.is_read && styles.unreadTitle]}>
        {notification.title}
      </Text>

      <Text style={styles.body}>{notification.body}</Text>

      {/* Action Footer */}
      {!notification.is_read && onMarkRead && (
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={styles.markReadButton}
            onPress={() => onMarkRead(notification.id)}
            testID={`mark-read-button-${notification.id}`}
          >
            <Text style={styles.markReadText}>Mark as read</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  unreadCard: {
    borderColor: '#3B82F6',
    backgroundColor: '#0B1528',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  timestamp: {
    fontSize: 11,
    color: Colors.text.muted,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  unreadTitle: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  markReadButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: '#1E293B',
  },
  markReadText: {
    fontSize: 12,
    color: '#93C5FD',
    fontWeight: '600',
  },
});
