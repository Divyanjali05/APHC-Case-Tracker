import { syncQueue, QueueItem } from './syncQueue';
import { networkStatus } from './networkStatus';
import { offlineStorage } from './offlineStorage';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';

export type ActionExecutor = (item: QueueItem) => Promise<unknown>;

const MAX_RETRIES = 5;

class SynchronizationEngine {
  private isSyncing: boolean = false;
  private autoSyncSubscribed: boolean = false;

  constructor() {
    this.setupAutoSync();
  }

  /**
   * Automatically trigger sync when connectivity is restored.
   */
  private setupAutoSync() {
    if (this.autoSyncSubscribed) return;
    this.autoSyncSubscribed = true;
    networkStatus.onConnectivityRestored(async () => {
      // Small debounce
      setTimeout(() => {
        this.syncPendingActions('current');
      }, 500);
    });
  }

  /**
   * Reset engine state (for testing).
   */
  resetState() {
    this.isSyncing = false;
  }

  /**
   * Check if sync is actively executing.
   */
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  /**
   * Default execution handler for queued actions against backend endpoints.
   */
  private async defaultExecutor(item: QueueItem): Promise<unknown> {
    const headers = {
      'X-Idempotency-Key': item.idempotency_key,
    };

    if (item.action_type === 'CREATE_REMINDER') {
      const response = await apiClient.post(ENDPOINTS.REMINDERS.LIST, item.payload, {
        headers,
      });
      return response.data;
    }

    if (item.action_type === 'DISMISS_REMINDER') {
      const payload = item.payload as { id?: number | string } | number | string;
      const reminderId =
        typeof payload === 'object' && payload !== null && 'id' in payload
          ? (payload.id as number | string)
          : (payload as number | string);
      const response = await apiClient.post(
        ENDPOINTS.REMINDERS.DISMISS(reminderId),
        {},
        { headers }
      );
      return response.data;
    }

    throw new Error(`Unhandled action type: ${item.action_type}`);
  }

  /**
   * Synchronize pending offline actions safely with concurrency protection,
   * bounded retries, conflict detection, and network drop recovery.
   */
  async syncPendingActions(
    userKey: string,
    customExecutor?: ActionExecutor
  ): Promise<{ synced: number; failed: number; conflicts: number }> {
    // Concurrency Lock: prevent multiple simultaneous sync operations
    if (this.isSyncing) {
      return { synced: 0, failed: 0, conflicts: 0 };
    }

    this.isSyncing = true;
    let syncedCount = 0;
    let failedCount = 0;
    let conflictCount = 0;

    const executor = customExecutor || this.defaultExecutor.bind(this);

    try {
      await offlineStorage.saveSyncMetadata(userKey, { status: 'SYNCING' });

      const queue = await syncQueue.getQueue(userKey);
      const eligibleItems = queue.filter(
        item =>
          item.status === 'PENDING' ||
          (item.status === 'FAILED' && item.retry_count < MAX_RETRIES)
      );

      for (const item of eligibleItems) {
        // Safe check: If connectivity drops mid-synchronization, stop cleanly
        if (!networkStatus.isOnline()) {
          await syncQueue.updateQueueItem(userKey, item.id, {
            status: 'PENDING',
          });
          break;
        }

        // Mark as SYNCING
        await syncQueue.updateQueueItem(userKey, item.id, { status: 'SYNCING' });

        try {
          await executor(item);

          // Success: Mark as SYNCED
          await syncQueue.updateQueueItem(userKey, item.id, {
            status: 'SYNCED',
            error_message: undefined,
          });
          syncedCount++;
        } catch (error: unknown) {
          const err = error as {
            response?: { status?: number; data?: { detail?: string } };
            message?: string;
          };
          const status = err?.response?.status;
          const detail =
            err?.response?.data?.detail || err?.message || 'Synchronization error';

          if (status === 409) {
            // Conflict: Record was modified or invalid on server
            await syncQueue.updateQueueItem(userKey, item.id, {
              status: 'CONFLICT',
              error_message: detail,
            });
            conflictCount++;
          } else {
            // Network failure or 5xx: increment retry count
            const newRetryCount = item.retry_count + 1;
            const newStatus = newRetryCount >= MAX_RETRIES ? 'FAILED' : 'PENDING';
            await syncQueue.updateQueueItem(userKey, item.id, {
              status: newStatus,
              retry_count: newRetryCount,
              error_message: detail,
            });
            failedCount++;

            // If network failed completely, stop remaining items
            const axiosErr = error as {
              response?: unknown;
              message?: string;
              code?: string;
            };
            if (
              !axiosErr.response ||
              axiosErr.message?.includes('Network') ||
              axiosErr.code === 'ECONNABORTED'
            ) {
              break;
            }
          }
        }
      }

      // Update metadata
      const remainingPending = await syncQueue.getPendingCount(userKey);
      await offlineStorage.saveSyncMetadata(userKey, {
        lastSyncedAt: new Date().toISOString(),
        status:
          conflictCount > 0 ? 'CONFLICT' : remainingPending > 0 ? 'FAILED' : 'SYNCED',
        pendingCount: remainingPending,
      });
    } finally {
      this.isSyncing = false;
    }

    return { synced: syncedCount, failed: failedCount, conflicts: conflictCount };
  }
}

export const syncEngine = new SynchronizationEngine();
