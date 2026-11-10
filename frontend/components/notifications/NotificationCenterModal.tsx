import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { AppIcon } from '../common/AppIcon';
import { NotificationCard } from './NotificationCard';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../../features/notifications/hooks';
import { pushNotificationService } from '../../services/notifications/pushService';
import { NotificationItem } from '../../types';

interface NotificationCenterModalProps {
  visible: boolean;
  onClose: () => void;
  testID?: string;
}

type FilterCategoryKey = 'ALL' | 'HEARINGS' | 'TOKENS' | 'CASES' | 'VOICE';

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  visible,
  onClose,
  testID = 'notification-center-modal',
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState<FilterCategoryKey>('ALL');

  const { data: notifications = [], refetch, isRefetching } = useNotifications();
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  const filteredNotifications = notifications.filter(notif => {
    if (selectedFilter === 'ALL') return true;
    const cat = notif.category.toUpperCase();
    if (selectedFilter === 'HEARINGS') {
      return cat === 'REMINDER' || cat === 'HEARING_REMINDER';
    }
    if (selectedFilter === 'TOKENS') {
      return (
        cat === 'TOKEN_ALERT' || cat === 'TOKEN_APPROACHING' || cat === 'TOKEN_CALLED'
      );
    }
    if (selectedFilter === 'CASES') {
      return (
        cat === 'CASE_UPDATE' ||
        cat === 'HEARING_CHANGE' ||
        cat === 'JUDGMENT' ||
        cat === 'CAUSELIST'
      );
    }
    if (selectedFilter === 'VOICE') {
      return (
        cat === 'VOICE_TRANSCRIPTION_COMPLETED' || cat === 'VOICE_TRANSCRIPTION_FAILED'
      );
    }
    return true;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleNotificationPress = (item: NotificationItem) => {
    if (!item.is_read) {
      markReadMutation.mutate(item.id);
    }
    onClose();
    const route = pushNotificationService.resolveNavigationRoute(item.data_payload);
    router.push(route.pathname as Parameters<typeof router.push>[0]);
  };

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>
              {t('notifications.title', 'Court Notifications')}
            </Text>
            {unreadCount > 0 ? (
              <Badge
                label={`${unreadCount} ${t('notifications.unread', 'Unread')}`}
                variant="danger"
                testID="unread-count-badge"
              />
            ) : (
              <Badge
                label={t('notifications.allCaughtUp', 'Caught up')}
                variant="success"
                testID="unread-count-badge"
              />
            )}
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            testID="close-notifications-btn"
            accessibilityLabel={t('common.close', 'Close')}
          >
            <AppIcon name="x" size={18} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* Action Bar */}
        <View style={styles.actionBar}>
          {unreadCount > 0 && (
            <Button
              title={t('notifications.markAllRead', 'Mark All Read')}
              variant="outline"
              onPress={handleMarkAllRead}
              loading={markAllReadMutation.isPending}
              testID="mark-all-read-button"
            />
          )}
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {(['ALL', 'HEARINGS', 'TOKENS', 'CASES', 'VOICE'] as FilterCategoryKey[]).map(
              key => {
                const isActive = selectedFilter === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.filterPill, isActive && styles.filterPillActive]}
                    onPress={() => setSelectedFilter(key)}
                    testID={`filter-tab-${key.toLowerCase()}`}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        isActive && styles.filterPillTextActive,
                      ]}
                    >
                      {t(`notifications.filter_${key.toLowerCase()}`, key)}
                    </Text>
                  </TouchableOpacity>
                );
              }
            )}
          </ScrollView>
        </View>

        {/* Notifications List */}
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          testID="notifications-list"
        >
          {filteredNotifications.length === 0 ? (
            <View style={styles.emptyContainer} testID="notifications-empty-state">
              <View style={styles.emptyIconCircle}>
                <AppIcon name="bell" size={32} color={Colors.primaryLight} />
              </View>
              <Text style={styles.emptyTitle}>
                {t('notifications.noAlerts', 'No notifications found')}
              </Text>
              <Text style={styles.emptySubtitle}>
                {t(
                  'notifications.emptySubtitle',
                  'Court listings and hearing alerts will appear here.'
                )}
              </Text>
            </View>
          ) : (
            filteredNotifications.map(notif => (
              <NotificationCard
                key={`notif-${notif.id}`}
                notification={notif}
                onMarkRead={id => markReadMutation.mutate(id)}
                onPress={handleNotificationPress}
                testID={`notification-item-${notif.id}`}
              />
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.surfaceBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.text.muted,
    textAlign: 'center',
    maxWidth: 260,
  },
});
