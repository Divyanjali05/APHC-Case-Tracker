import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureEncryption } from './secureEncryption';

export type QueueActionType = 'CREATE_REMINDER' | 'DISMISS_REMINDER';

export type QueueStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT';

export interface QueueItem<T = unknown> {
  id: string;
  action_type: QueueActionType;
  payload: T;
  created_at: string;
  status: QueueStatus;
  retry_count: number;
  idempotency_key: string;
  error_message?: string;
}

const SUPPORTED_ACTIONS: Set<QueueActionType> = new Set([
  'CREATE_REMINDER',
  'DISMISS_REMINDER',
]);

const getQueueKey = (userKey: string) => {
  const sanitizedUser = (userKey || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `@aphc_cache:${sanitizedUser}:action_queue`;
};

const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const syncQueue = {
  /**
   * Retrieve all items in the persistent queue for the user, decrypting payloads.
   */
  async getQueue(userKey: string): Promise<QueueItem[]> {
    const key = getQueueKey(userKey);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    try {
      const decrypted = await secureEncryption.decrypt(userKey, raw);
      if (!decrypted) {
        // Safe error handling: do not wipe raw storage if key is temporarily unavailable
        return [];
      }
      return JSON.parse(decrypted);
    } catch {
      return [];
    }
  },

  /**
   * Save queue items to persistent storage using Authenticated AES-256 encryption.
   */
  async saveQueue(userKey: string, queue: QueueItem[]): Promise<void> {
    const key = getQueueKey(userKey);
    const serialized = JSON.stringify(queue);
    const encrypted = await secureEncryption.encrypt(userKey, serialized);
    await AsyncStorage.setItem(key, encrypted);
  },

  /**
   * Enqueue a supported offline user action.
   */
  async enqueueAction<T = unknown>(
    userKey: string,
    action: {
      action_type: QueueActionType;
      payload: T;
      idempotency_key?: string;
    }
  ): Promise<QueueItem<T>> {
    if (!SUPPORTED_ACTIONS.has(action.action_type)) {
      throw new Error(
        `Unsupported operation: "${action.action_type}" cannot be queued offline.`
      );
    }

    const queue = await this.getQueue(userKey);
    const id = generateUUID();
    const idempotencyKey = action.idempotency_key || `idem-${id}`;

    // Prevent duplicate submission if item with same idempotency key is already queued
    const existing = queue.find(item => item.idempotency_key === idempotencyKey);
    if (existing) {
      return existing as QueueItem<T>;
    }

    const newItem: QueueItem<T> = {
      id,
      action_type: action.action_type,
      payload: action.payload,
      created_at: new Date().toISOString(),
      status: 'PENDING',
      retry_count: 0,
      idempotency_key: idempotencyKey,
    };

    queue.push(newItem);
    await this.saveQueue(userKey, queue);
    return newItem;
  },

  /**
   * Update fields of an existing queue item.
   */
  async updateQueueItem(
    userKey: string,
    id: string,
    updates: Partial<QueueItem>
  ): Promise<void> {
    const queue = await this.getQueue(userKey);
    const index = queue.findIndex(item => item.id === id);
    if (index !== -1) {
      queue[index] = {
        ...queue[index],
        ...updates,
      };
      await this.saveQueue(userKey, queue);
    }
  },

  /**
   * Remove a single item from the queue.
   */
  async removeQueueItem(userKey: string, id: string): Promise<void> {
    const queue = await this.getQueue(userKey);
    const filtered = queue.filter(item => item.id !== id);
    await this.saveQueue(userKey, filtered);
  },

  /**
   * Clear all items marked as SYNCED from the queue.
   */
  async clearSyncedItems(userKey: string): Promise<void> {
    const queue = await this.getQueue(userKey);
    const filtered = queue.filter(item => item.status !== 'SYNCED');
    await this.saveQueue(userKey, filtered);
  },

  /**
   * Return the count of actionable pending/failed queue items.
   */
  async getPendingCount(userKey: string): Promise<number> {
    const queue = await this.getQueue(userKey);
    return queue.filter(item => item.status === 'PENDING' || item.status === 'SYNCING')
      .length;
  },

  /**
   * Return items currently in CONFLICT state.
   */
  async getConflictItems(userKey: string): Promise<QueueItem[]> {
    const queue = await this.getQueue(userKey);
    return queue.filter(item => item.status === 'CONFLICT');
  },
};
