import AsyncStorage from '@react-native-async-storage/async-storage';
import { AgendaResponse, CreatePersonalReminderPayload } from '../../types';
import { secureEncryption } from './secureEncryption';

const CALENDAR_CACHE_PREFIX = '@aphc_calendar_cache';
const REMINDER_QUEUE_PREFIX = '@aphc_offline_reminders';

export interface OfflineReminderQueueItem {
  id: string;
  payload: CreatePersonalReminderPayload;
  queuedAt: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  retryCount: number;
}

const getCacheKey = (userKey: string, dateKey: string) => {
  const sanitized = (userKey || 'advocate').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${CALENDAR_CACHE_PREFIX}:${sanitized}:${dateKey}`;
};

const getQueueKey = (userKey: string) => {
  const sanitized = (userKey || 'advocate').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${REMINDER_QUEUE_PREFIX}:${sanitized}`;
};

export const offlineCalendarStorage = {
  /**
   * Save agenda data encrypted for offline calendar inspection.
   */
  async cacheAgenda(
    userKey: string,
    dateKey: string,
    agenda: AgendaResponse
  ): Promise<void> {
    try {
      const key = getCacheKey(userKey, dateKey);
      const json = JSON.stringify(agenda);
      const encrypted = await secureEncryption.encrypt(userKey, json);
      await AsyncStorage.setItem(key, encrypted);
    } catch {
      // Non-fatal cache write failure
    }
  },

  /**
   * Retrieve encrypted cached agenda data when offline or server unreachable.
   */
  async getCachedAgenda(
    userKey: string,
    dateKey: string
  ): Promise<AgendaResponse | null> {
    try {
      const key = getCacheKey(userKey, dateKey);
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const decrypted = await secureEncryption.decrypt(userKey, raw);
      if (!decrypted) return null;
      return JSON.parse(decrypted) as AgendaResponse;
    } catch {
      return null;
    }
  },

  /**
   * Queue a personal reminder created offline for subsequent server synchronization.
   */
  async enqueueOfflineReminder(
    userKey: string,
    payload: CreatePersonalReminderPayload
  ): Promise<OfflineReminderQueueItem> {
    const queue = await this.getOfflineReminders(userKey);
    const item: OfflineReminderQueueItem = {
      id: `offline_rem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      payload,
      queuedAt: new Date().toISOString(),
      status: 'PENDING',
      retryCount: 0,
    };
    queue.push(item);
    await this.saveQueue(userKey, queue);
    return item;
  },

  /**
   * Retrieve all offline queued personal reminders.
   */
  async getOfflineReminders(userKey: string): Promise<OfflineReminderQueueItem[]> {
    try {
      const key = getQueueKey(userKey);
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return [];
      const decrypted = await secureEncryption.decrypt(userKey, raw);
      if (!decrypted) return [];
      return JSON.parse(decrypted) as OfflineReminderQueueItem[];
    } catch {
      return [];
    }
  },

  /**
   * Remove a processed offline reminder from the queue.
   */
  async removeOfflineReminder(userKey: string, id: string): Promise<void> {
    const queue = await this.getOfflineReminders(userKey);
    const filtered = queue.filter(item => item.id !== id);
    await this.saveQueue(userKey, filtered);
  },

  /**
   * Save the updated queue encrypted in storage.
   */
  async saveQueue(userKey: string, queue: OfflineReminderQueueItem[]): Promise<void> {
    try {
      const key = getQueueKey(userKey);
      const json = JSON.stringify(queue);
      const encrypted = await secureEncryption.encrypt(userKey, json);
      await AsyncStorage.setItem(key, encrypted);
    } catch {
      // Non-fatal
    }
  },
};
