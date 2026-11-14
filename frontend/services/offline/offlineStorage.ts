import AsyncStorage from '@react-native-async-storage/async-storage';
import { CaseItem, HearingItem, ReminderItem, DashboardData, NotificationItem } from '../../types';
import { secureEncryption } from './secureEncryption';

export interface CachedEnvelope<T> {
  data: T;
  lastSyncedAt: string;
  isCached: boolean;
}

export interface SyncMetadata {
  lastSyncedAt: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT';
  pendingCount: number;
  lastError?: string | null;
}

const STORAGE_PREFIX = '@aphc_cache';

const buildKey = (userKey: string, resource: string, id?: string | number) => {
  const sanitizedUser = (userKey || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
  return id !== undefined
    ? `${STORAGE_PREFIX}:${sanitizedUser}:${resource}:${id}`
    : `${STORAGE_PREFIX}:${sanitizedUser}:${resource}`;
};

export const offlineStorage = {
  /**
   * Save cached cases list for the advocate using Authenticated AES-256 encryption.
   */
  async saveCachedCases(userKey: string, cases: CaseItem[]): Promise<void> {
    const key = buildKey(userKey, 'cases');
    const envelope: CachedEnvelope<CaseItem[]> = {
      data: cases,
      lastSyncedAt: new Date().toISOString(),
      isCached: true,
    };
    const encrypted = await secureEncryption.encrypt(userKey, JSON.stringify(envelope));
    await AsyncStorage.setItem(key, encrypted);

    // Also populate individual case details in the encrypted cache
    for (const item of cases) {
      if (item.id) {
        await this.saveCachedCaseDetail(userKey, item);
      }
    }
  },

  /**
   * Retrieve cached cases list for the advocate, decrypting and verifying authenticity.
   */
  async getCachedCases(userKey: string): Promise<CachedEnvelope<CaseItem[]> | null> {
    const key = buildKey(userKey, 'cases');
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      const decrypted = await secureEncryption.decrypt(userKey, raw);
      if (!decrypted) return null;
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  },

  /**
   * Save a single case detail using Authenticated AES-256 encryption.
   */
  async saveCachedCaseDetail(userKey: string, caseItem: CaseItem): Promise<void> {
    const key = buildKey(userKey, 'case_detail', caseItem.id);
    const envelope: CachedEnvelope<CaseItem> = {
      data: caseItem,
      lastSyncedAt: new Date().toISOString(),
      isCached: true,
    };
    const encrypted = await secureEncryption.encrypt(userKey, JSON.stringify(envelope));
    await AsyncStorage.setItem(key, encrypted);
  },

  /**
   * Retrieve a single case detail from encrypted cache.
   */
  async getCachedCaseDetail(
    userKey: string,
    caseId: string | number
  ): Promise<CachedEnvelope<CaseItem> | null> {
    const key = buildKey(userKey, 'case_detail', caseId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      const decrypted = await secureEncryption.decrypt(userKey, raw);
      if (!decrypted) return null;
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  },

  /**
   * Save cached upcoming hearings using Authenticated AES-256 encryption.
   */
  async saveCachedUpcomingHearings(
    userKey: string,
    hearings: HearingItem[]
  ): Promise<void> {
    const key = buildKey(userKey, 'upcoming_hearings');
    const envelope: CachedEnvelope<HearingItem[]> = {
      data: hearings,
      lastSyncedAt: new Date().toISOString(),
      isCached: true,
    };
    const encrypted = await secureEncryption.encrypt(userKey, JSON.stringify(envelope));
    await AsyncStorage.setItem(key, encrypted);
  },

  /**
   * Retrieve cached upcoming hearings from encrypted cache.
   */
  async getCachedUpcomingHearings(
    userKey: string
  ): Promise<CachedEnvelope<HearingItem[]> | null> {
    const key = buildKey(userKey, 'upcoming_hearings');
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      const decrypted = await secureEncryption.decrypt(userKey, raw);
      if (!decrypted) return null;
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  },

  /**
   * Save cached reminders list using Authenticated AES-256 encryption.
   */
  async saveCachedReminders(userKey: string, reminders: ReminderItem[]): Promise<void> {
    const key = buildKey(userKey, 'reminders');
    const envelope: CachedEnvelope<ReminderItem[]> = {
      data: reminders,
      lastSyncedAt: new Date().toISOString(),
      isCached: true,
    };
    const encrypted = await secureEncryption.encrypt(userKey, JSON.stringify(envelope));
    await AsyncStorage.setItem(key, encrypted);
  },

  /**
   * Retrieve cached reminders list from encrypted cache.
   */
  async getCachedReminders(
    userKey: string
  ): Promise<CachedEnvelope<ReminderItem[]> | null> {
    const key = buildKey(userKey, 'reminders');
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      const decrypted = await secureEncryption.decrypt(userKey, raw);
      if (!decrypted) return null;
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  },

  /**
   * Save cached dashboard data using Authenticated AES-256 encryption.
   */
  async saveCachedDashboard(userKey: string, dashboard: DashboardData): Promise<void> {
    const key = buildKey(userKey, 'dashboard');
    const envelope: CachedEnvelope<DashboardData> = {
      data: dashboard,
      lastSyncedAt: new Date().toISOString(),
      isCached: true,
    };
    const encrypted = await secureEncryption.encrypt(userKey, JSON.stringify(envelope));
    await AsyncStorage.setItem(key, encrypted);
  },

  /**
   * Retrieve cached dashboard data from encrypted cache.
   */
  async getCachedDashboard(
    userKey: string
  ): Promise<CachedEnvelope<DashboardData> | null> {
    const key = buildKey(userKey, 'dashboard');
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      const decrypted = await secureEncryption.decrypt(userKey, raw);
      if (!decrypted) return null;
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  },

  /**
   * Save non-sensitive synchronization metadata for this advocate (unencrypted).
   */
  async saveSyncMetadata(userKey: string, meta: Partial<SyncMetadata>): Promise<void> {
    const key = buildKey(userKey, 'sync_metadata');
    const existing = await this.getSyncMetadata(userKey);
    const merged: SyncMetadata = {
      ...existing,
      ...meta,
    };
    await AsyncStorage.setItem(key, JSON.stringify(merged));
  },

  /**
   * Retrieve non-sensitive synchronization metadata for this advocate.
   */
  async getSyncMetadata(userKey: string): Promise<SyncMetadata> {
    const key = buildKey(userKey, 'sync_metadata');
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return {
        lastSyncedAt: null,
        status: 'ONLINE',
        pendingCount: 0,
      };
    }
    try {
      return JSON.parse(raw);
    } catch {
      return {
        lastSyncedAt: null,
        status: 'ONLINE',
        pendingCount: 0,
      };
    }
  },

  /**
   * Save cached notifications list for the advocate using Authenticated AES-256 encryption.
   */
  async saveCachedNotifications(userKey: string, notifications: NotificationItem[]): Promise<void> {
    const key = buildKey(userKey, 'notifications');
    const envelope: CachedEnvelope<NotificationItem[]> = {
      data: notifications,
      lastSyncedAt: new Date().toISOString(),
      isCached: true,
    };
    const encrypted = await secureEncryption.encrypt(userKey, JSON.stringify(envelope));
    await AsyncStorage.setItem(key, encrypted);
  },

  /**
   * Retrieve cached notifications list for the advocate, decrypting and verifying authenticity.
   */
  async getCachedNotifications(userKey: string): Promise<CachedEnvelope<NotificationItem[]> | null> {
    const key = buildKey(userKey, 'notifications');
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      const decrypted = await secureEncryption.decrypt(userKey, raw);
      if (!decrypted) return null;
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  },

  /**
   * Clear all sensitive cached records and delete the encryption key on advocate logout.
   */
  async clearUserCache(userKey: string): Promise<void> {
    const sanitizedUser = (userKey || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
    const userPrefix = `${STORAGE_PREFIX}:${sanitizedUser}:`;

    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const userKeys = allKeys.filter(k => k.startsWith(userPrefix));
      if (userKeys.length > 0) {
        await AsyncStorage.multiRemove(userKeys);
      }
    } catch {
      // Suppress failure during multiRemove
    }

    // Securely delete encryption key from SecureStore
    await secureEncryption.deleteUserKey(userKey);
  },
};
