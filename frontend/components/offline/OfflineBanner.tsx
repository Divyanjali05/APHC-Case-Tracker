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
          <Text style={styles.conflictText}>
            ⚠️ Sync Conflict:{' '}
            {conflictItems[0].error_message || 'Court record changed on server.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#10B981', // emerald green
  },
  dotOffline: {
    backgroundColor: '#F59E0B', // amber yellow
  },
  statusText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    color: '#64748B',
    marginHorizontal: 6,
    fontSize: 12,
  },
  lastSyncedText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pendingBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  conflictBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
    padding: 6,
    marginTop: 6,
    borderRadius: 4,
  },
  conflictText: {
    color: '#FCA5A5',
    fontSize: 11,
  },
});
