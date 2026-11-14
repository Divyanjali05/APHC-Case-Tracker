import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Badge, BadgeProps } from '../common/Badge';
import { Card } from '../common/Card';
import { Colors } from '../../constants/colors';
import { NotificationItem, NotificationCategory } from '../../types';

interface NotificationCardProps {
  notification: NotificationItem;
  onMarkRead?: (id: number) => void;
  onPress?: (notification: NotificationItem) => void;
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
    case 'CASE_UPDATE':
      return { label: 'Docket Update', variant: 'warning' };
    case 'REMINDER':
    case 'HEARING_REMINDER':
      return { label: 'Hearing Reminder', variant: 'info' };
    case 'TOKEN_ALERT':
      return { label: 'Court Token Alert', variant: 'warning' };
    case 'TOKEN_APPROACHING':
      return { label: 'Token Approaching', variant: 'warning' };
    case 'TOKEN_CALLED':
      return { label: 'Token Called', variant: 'success' };
    case 'VOICE_TRANSCRIPTION_COMPLETED':
      return { label: 'Voice Transcribed', variant: 'success' };
    case 'VOICE_TRANSCRIPTION_FAILED':
      return { label: 'Voice Failed', variant: 'danger' };
    case 'CALENDAR_REMINDER':
    case 'COMPLIANCE_DEADLINE':
      return { label: 'Agenda / Deadline', variant: 'warning' };
    case 'CAUSELIST':
      return { label: 'Cause List', variant: 'primary' };
    default:
      return { label: 'General Alert', variant: 'secondary' };
  }
};

export const NotificationCard: React.FC<NotificationCardProps> = ({
  notification,
  onMarkRead,
  onPress,
  testID,
}) => {
  const { label, variant } = getCategoryBadge(notification.category);

  const content = (
    <>
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
            onPress={e => {
              e?.stopPropagation?.();
              onMarkRead(notification.id);
            }}
            testID={`mark-read-button-${notification.id}`}
          >
            <Text style={styles.markReadText}>Mark as read</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={() => onPress(notification)}
        activeOpacity={0.7}
        testID={testID || `notification-card-${notification.id}`}
      >
        <Card style={[styles.card, !notification.is_read && styles.unreadCard]}>
          {content}
        </Card>
      </TouchableOpacity>
    );
  }

  return (
    <Card
      style={[styles.card, !notification.is_read && styles.unreadCard]}
      testID={testID || `notification-card-${notification.id}`}
    >
      {content}
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
    backgroundColor: Colors.primarySoft,
  },
  markReadText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
});
