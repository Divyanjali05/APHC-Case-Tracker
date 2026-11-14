import AsyncStorage from '@react-native-async-storage/async-storage';
import { OfflineVoiceQueueItem } from '../../types';
import { secureEncryption } from './secureEncryption';

const QUEUE_STORAGE_PREFIX = '@aphc_voice_queue';

const getQueueKey = (userKey: string) => {
  const sanitized = (userKey || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${QUEUE_STORAGE_PREFIX}:${sanitized}`;
};

export const offlineVoiceQueue = {
  /**
   * Enqueue a newly recorded voice note captured offline.
   */
  async enqueueRecording(
    userKey: string,
    data: Omit<OfflineVoiceQueueItem, 'id' | 'status' | 'retryCount'>
  ): Promise<OfflineVoiceQueueItem> {
    const queue = await this.getQueue(userKey);
    const item: OfflineVoiceQueueItem = {
      ...data,
      id: `offline_voice_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      status: 'PENDING',
      retryCount: 0,
    };
    queue.push(item);
    await this.saveQueue(userKey, queue);
    return item;
  },

  /**
   * Retrieve all items in the advocate's offline voice queue.
   */
  async getQueue(userKey: string): Promise<OfflineVoiceQueueItem[]> {
    const key = getQueueKey(userKey);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    try {
      const decrypted = await secureEncryption.decrypt(userKey, raw);
      if (!decrypted) return [];
      return JSON.parse(decrypted) as OfflineVoiceQueueItem[];
    } catch {
      return [];
    }
  },

  /**
   * Retrieve only pending items awaiting upload.
   */
  async getPendingQueue(userKey: string): Promise<OfflineVoiceQueueItem[]> {
    const queue = await this.getQueue(userKey);
    return queue.filter((item) => item.status === 'PENDING' || item.status === 'FAILED');
  },

  /**
   * Save the updated queue encrypted in storage.
   */
  async saveQueue(userKey: string, queue: OfflineVoiceQueueItem[]): Promise<void> {
    const key = getQueueKey(userKey);
    const serialized = JSON.stringify(queue);
    const encrypted = await secureEncryption.encrypt(userKey, serialized);
    await AsyncStorage.setItem(key, encrypted);
  },

  /**
   * Remove a successfully synced recording from the queue.
   */
  async removeFromQueue(userKey: string, id: string): Promise<void> {
    const queue = await this.getQueue(userKey);
    const updated = queue.filter((item) => item.id !== id);
    await this.saveQueue(userKey, updated);
  },

  /**
   * Clear the entire voice queue for the advocate.
   */
  async clearQueue(userKey: string): Promise<void> {
    const key = getQueueKey(userKey);
    await AsyncStorage.removeItem(key);
  },

  /**
   * Process all pending recordings via upload function when back online.
   */
  async processQueue(
    userKey: string,
    uploadFn: (item: OfflineVoiceQueueItem) => Promise<unknown>
  ): Promise<{ synced: number; failed: number }> {
    const queue = await this.getQueue(userKey);
    let synced = 0;
    let failed = 0;

    for (const item of queue) {
      if (item.status === 'PENDING' || item.status === 'FAILED') {
        try {
          item.status = 'UPLOADING';
          await uploadFn(item);
          item.status = 'PENDING'; // marks ready for removal
          await this.removeFromQueue(userKey, item.id);
          synced += 1;
        } catch (err: unknown) {
          item.status = 'FAILED';
          item.retryCount = (item.retryCount || 0) + 1;
          item.errorMessage = err instanceof Error ? err.message : String(err);
          failed += 1;
        }
      }
    }

    if (failed > 0) {
      await this.saveQueue(userKey, queue);
    }

    return { synced, failed };
  },
};

