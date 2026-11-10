import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { networkStatus } from '../../services/offline/networkStatus';
import { offlineStorage, SyncMetadata } from '../../services/offline/offlineStorage';
import { syncQueue, QueueItem } from '../../services/offline/syncQueue';
import { syncEngine } from '../../services/offline/syncEngine';
import { tokenStorage } from '../../services/auth/tokenStorage';
import { Colors } from '../../constants/colors';
import { AppIcon } from '../common/AppIcon';

export interface OfflineBannerProps {
  onSyncComplete?: () => void;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ onSyncComplete }) => {
  const [isOnline, setIsOnline] = useState<boolean>(networkStatus.isOnline());
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [metadata, setMetadata] = useState<SyncMetadata | null>(null);
  const [conflictItems, setConflictItems] = useState<QueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refresh = React.useCallback(async () => {
    try {
      const enrollment =
        typeof tokenStorage.getUserEnrollment === 'function'
          ? await tokenStorage.getUserEnrollment()
          : 'default_advocate';
      const count = await syncQueue.getPendingCount(enrollment);
      const meta = await offlineStorage.getSyncMetadata(enrollment);
      const conflicts = await syncQueue.getConflictItems(enrollment);
      setPendingCount(count);
      setMetadata(meta);
      setConflictItems(conflicts);
    } catch {
      // Ignore reading failure
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const unsub = networkStatus.onStatusChange(online => {
      if (mounted) {
        setIsOnline(online);
        refresh();
      }
    });

    let interval: ReturnType<typeof setInterval> | null = null;
    if (process.env.NODE_ENV !== 'test') {
      interval = setInterval(() => {
        if (mounted) refresh();
      }, 5000);
    }

    refresh();

    return () => {
      mounted = false;
      unsub();
      if (interval) clearInterval(interval);
    };
  }, [refresh]);

  const handleManualRetry = async () => {
    setIsSyncing(true);
    try {
      const enrollment =
        typeof tokenStorage.getUserEnrollment === 'function'
          ? await tokenStorage.getUserEnrollment()
          : 'default_advocate';
      await syncEngine.syncPendingActions(enrollment);
      await refresh();
      if (onSyncComplete) {
        onSyncComplete();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const formatSyncTime = (isoString?: string | null): string => {
    if (!isoString) return 'Not synced';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Recently';
    }
  };

  const hasConflicts = conflictItems.length > 0;
  const hasFailures = metadata?.status === 'FAILED' || pendingCount > 0;

  return (
    <View style={styles.container} testID="offline-status-banner">
      <View style={styles.statusRow}>
        <View style={styles.indicatorGroup}>
          <View
            style={[styles.statusDot, isOnline ? styles.dotOnline : styles.dotOffline]}
          />
          <Text style={styles.statusText} testID="offline-status-indicator">
            {isOnline ? 'Online' : 'Offline Mode'}
          </Text>
          <Text style={styles.divider}>•</Text>
          <Text style={styles.lastSyncedText} testID="offline-last-synced-text">
            {isOnline
              ? `Synced ${formatSyncTime(metadata?.lastSyncedAt)}`
              : `Cached (${formatSyncTime(metadata?.lastSyncedAt)})`}
          </Text>
        </View>

        <View style={styles.actionGroup}>
          {pendingCount > 0 ? (
            <View style={styles.pendingBadge} testID="offline-pending-badge">
              <Text style={styles.pendingBadgeText}>
                {pendingCount} {pendingCount === 1 ? 'pending' : 'pending'}
              </Text>
            </View>
          ) : null}

          {isOnline && (hasFailures || pendingCount > 0) ? (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleManualRetry}
              disabled={isSyncing}
              testID="offline-retry-sync-button"
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.retryButtonText}>Retry Sync</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Conflict Alert Banner */}
      {hasConflicts ? (
        <View style={styles.conflictBanner} testID="offline-conflict-alert">
          <AppIcon name="alert-triangle" size={14} color={Colors.danger} />
          <Text style={styles.conflictText}>
            Sync Conflict:{' '}
            {conflictItems[0].error_message || 'Court record changed on server.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  indicatorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotOnline: {
    backgroundColor: Colors.success,
  },
  dotOffline: {
    backgroundColor: Colors.warning,
  },
  statusText: {
    color: Colors.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    color: Colors.text.muted,
    marginHorizontal: 6,
    fontSize: 12,
  },
  lastSyncedText: {
    color: Colors.text.secondary,
    fontSize: 12,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pendingBadgeText: {
    color: Colors.text.white,
    fontSize: 12,
    fontWeight: '700',
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  retryButtonText: {
    color: Colors.text.white,
    fontSize: 12,
    fontWeight: '600',
  },
  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dangerSurface,
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
    padding: 8,
    marginTop: 6,
    borderRadius: 6,
  },
  conflictText: {
    flex: 1,
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
});
