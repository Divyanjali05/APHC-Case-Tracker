jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { offlineStorage } from '../services/offline/offlineStorage';
import { networkStatus } from '../services/offline/networkStatus';
import { syncQueue, QueueActionType } from '../services/offline/syncQueue';
import { syncEngine } from '../services/offline/syncEngine';
import { CaseItem, HearingItem, ReminderItem } from '../types';

describe('Phase 7: Offline Mode & Safe Data Synchronization', () => {
  const USER_A = 'AP/8888/2021';
  const USER_B = 'AP/9999/2022';

  const mockCases: CaseItem[] = [
    {
      id: 101,
      case_type: 'WP',
      case_number: '1234',
      filing_year: 2024,
      petitioner: 'Sita Ram',
      respondent: 'State of AP',
      current_stage: 'PENDING',
      status: 'Upcoming',
      next_hearing_date: '2026-11-20',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ];

  const mockHearings: HearingItem[] = [
    {
      id: 201,
      case: 101,
      hearing_date: '2026-11-20',
      hearing_time: '10:30:00',
      status: 'SCHEDULED',
      court_hall_number: 2,
      item_number: 5,
      is_rescheduled: false,
      created_at: '2024-01-01T00:00:00Z',
    },
  ];

  const mockReminders: ReminderItem[] = [
    {
      id: 301,
      title: 'Submit Vakalatnama',
      due_date: '2026-11-15T10:00:00Z',
      status: 'PENDING',
      reminder_type: 'FILING',
      is_completed: false,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    await AsyncStorage.clear();
    networkStatus.setSimulatedOnline(true);
    syncEngine.resetState();
  });

  // Scenario 1: Previously synchronized cases load while offline
  it('1. loads previously synchronized cases while offline', async () => {
    await offlineStorage.saveCachedCases(USER_A, mockCases);
    networkStatus.setSimulatedOnline(false);

    const cached = await offlineStorage.getCachedCases(USER_A);
    expect(cached).not.toBeNull();
    expect(cached?.data).toHaveLength(1);
    expect(cached?.data[0].case_number).toBe('1234');
    expect(cached?.isCached).toBe(true);
    expect(cached?.lastSyncedAt).toBeDefined();
  });

  // Scenario 2: Case details open using cached data
  it('2. opens case details using cached data', async () => {
    await offlineStorage.saveCachedCaseDetail(USER_A, mockCases[0]);
    networkStatus.setSimulatedOnline(false);

    const cachedDetail = await offlineStorage.getCachedCaseDetail(USER_A, 101);
    expect(cachedDetail).not.toBeNull();
    expect(cachedDetail?.data.petitioner).toBe('Sita Ram');
    expect(cachedDetail?.data.respondent).toBe('State of AP');
  });

  // Scenario 3: Cached hearings and reminders remain accessible
  it('3. cached hearings and reminders remain accessible', async () => {
    await offlineStorage.saveCachedUpcomingHearings(USER_A, mockHearings);
    await offlineStorage.saveCachedReminders(USER_A, mockReminders);
    networkStatus.setSimulatedOnline(false);

    const hearings = await offlineStorage.getCachedUpcomingHearings(USER_A);
    const reminders = await offlineStorage.getCachedReminders(USER_A);

    expect(hearings?.data).toHaveLength(1);
    expect(hearings?.data[0].court_hall_number).toBe(2);
    expect(reminders?.data).toHaveLength(1);
    expect(reminders?.data[0].title).toBe('Submit Vakalatnama');
  });

  // Scenario 4: Empty cache displays an appropriate offline state
  it('4. returns null/empty when cache has never been synchronized', async () => {
    networkStatus.setSimulatedOnline(false);

    const cachedCases = await offlineStorage.getCachedCases(USER_A);
    const cachedDetail = await offlineStorage.getCachedCaseDetail(USER_A, 999);
    const cachedReminders = await offlineStorage.getCachedReminders(USER_A);

    expect(cachedCases).toBeNull();
    expect(cachedDetail).toBeNull();
    expect(cachedReminders).toBeNull();
  });

  // Scenario 5: Offline reminder creation enters the persistent queue
  it('5. offline reminder creation enters the persistent queue', async () => {
    networkStatus.setSimulatedOnline(false);

    const queuedItem = await syncQueue.enqueueAction(USER_A, {
      action_type: 'CREATE_REMINDER',
      payload: {
        title: 'Draft Counter Affidavit',
        due_date: '2026-11-25T10:30:00Z',
        reminder_type: 'FILING',
      },
    });

    expect(queuedItem.id).toBeDefined();
    expect(queuedItem.idempotency_key).toBeDefined();
    expect(queuedItem.status).toBe('PENDING');
    expect(queuedItem.retry_count).toBe(0);

    const pendingCount = await syncQueue.getPendingCount(USER_A);
    expect(pendingCount).toBe(1);
  });

  // Scenario 6: Pending actions survive application restart
  it('6. pending actions survive application restart (persisted in AsyncStorage)', async () => {
    await syncQueue.enqueueAction(USER_A, {
      action_type: 'CREATE_REMINDER',
      payload: { title: 'Action 1', due_date: '2026-11-20' },
    });
    await syncQueue.enqueueAction(USER_A, {
      action_type: 'DISMISS_REMINDER',
      payload: { id: 301 },
    });

    // Simulate app restart by re-reading from storage
    const reloadedQueue = await syncQueue.getQueue(USER_A);
    expect(reloadedQueue).toHaveLength(2);
    expect(reloadedQueue[0].action_type).toBe('CREATE_REMINDER');
    expect(reloadedQueue[1].action_type).toBe('DISMISS_REMINDER');
    expect(reloadedQueue[0].status).toBe('PENDING');
  });

  // Scenario 7: Connectivity restoration triggers synchronization
  it('7. connectivity restoration triggers synchronization', async () => {
    networkStatus.setSimulatedOnline(false);
    await syncQueue.enqueueAction(USER_A, {
      action_type: 'CREATE_REMINDER',
      payload: { title: 'Auto Sync Reminder', due_date: '2026-11-20' },
    });

    let syncTriggered = false;
    const unsub = networkStatus.onConnectivityRestored(() => {
      syncTriggered = true;
    });

    // Connectivity restored
    networkStatus.setSimulatedOnline(true);
    expect(syncTriggered).toBe(true);
    unsub();
  });

  // Scenario 8: Successful synchronization clears pending queue items
  it('8. successful synchronization marks queue items as SYNCED', async () => {
    await syncQueue.enqueueAction(USER_A, {
      action_type: 'CREATE_REMINDER',
      payload: { title: 'Online Sync Item', due_date: '2026-11-20' },
    });

    const mockApiExecutor = jest.fn().mockResolvedValue({ id: 999, status: 'PENDING' });
    await syncEngine.syncPendingActions(USER_A, mockApiExecutor);

    const queue = await syncQueue.getQueue(USER_A);
    expect(queue[0].status).toBe('SYNCED');
    expect(mockApiExecutor).toHaveBeenCalledTimes(1);

    const pendingCount = await syncQueue.getPendingCount(USER_A);
    expect(pendingCount).toBe(0);
  });

  // Scenario 9: Failed synchronization preserves queue items
  it('9. failed synchronization preserves queue items with error message and increments retry_count', async () => {
    await syncQueue.enqueueAction(USER_A, {
      action_type: 'CREATE_REMINDER',
      payload: { title: 'Failing Item', due_date: '2026-11-20' },
    });

    const mockApiExecutor = jest.fn().mockRejectedValue(new Error('Network timeout'));
    await syncEngine.syncPendingActions(USER_A, mockApiExecutor);

    const queue = await syncQueue.getQueue(USER_A);
    expect(queue).toHaveLength(1);
    expect(queue[0].retry_count).toBe(1);
    expect(queue[0].error_message).toContain('Network timeout');
  });

  // Scenario 10: Repeated retries do not create duplicates (idempotency key preserved)
  it('10. repeated retries preserve the same idempotency key across executions', async () => {
    const item = await syncQueue.enqueueAction(USER_A, {
      action_type: 'CREATE_REMINDER',
      payload: { title: 'Idempotent Item', due_date: '2026-11-20' },
    });
    const key = item.idempotency_key;

    const mockExecutor = jest.fn().mockResolvedValue({ id: 1001 });
    await syncEngine.syncPendingActions(USER_A, mockExecutor);

    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotency_key: key,
      })
    );
  });

  // Scenario 11: Network failure during synchronization is recoverable
  it('11. network failure during synchronization stops safely and retains uncompleted items', async () => {
    await syncQueue.enqueueAction(USER_A, {
      action_type: 'CREATE_REMINDER',
      payload: { title: 'Item 1' },
    });
    await syncQueue.enqueueAction(USER_A, {
      action_type: 'CREATE_REMINDER',
      payload: { title: 'Item 2' },
    });

    // First item succeeds, network drops before second
    let callCount = 0;
    const mockExecutor = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        networkStatus.setSimulatedOnline(false);
        return { id: 1 };
      }
      throw new Error('Network offline');
    });

    await syncEngine.syncPendingActions(USER_A, mockExecutor);

    const queue = await syncQueue.getQueue(USER_A);
    expect(queue[0].status).toBe('SYNCED');
    expect(queue[1].status).toBe('PENDING'); // Retained for next online sync
  });

  // Scenario 12: Conflicting server updates are detected
  it('12. conflicting server updates are detected and marked as CONFLICT', async () => {
    await syncQueue.enqueueAction(USER_A, {
      action_type: 'CREATE_REMINDER',
      payload: { title: 'Conflicting Item', hearing_id: 888 },
    });

    const conflictError = Object.assign(new Error('Hearing cancelled on court server'), {
      response: { status: 409, data: { detail: 'Hearing cancelled' } },
    });

    const mockExecutor = jest.fn().mockRejectedValue(conflictError);
    await syncEngine.syncPendingActions(USER_A, mockExecutor);

    const queue = await syncQueue.getQueue(USER_A);
    expect(queue[0].status).toBe('CONFLICT');
    expect(queue[0].error_message).toContain('Hearing cancelled');
  });

  // Scenario 13: User-specific cached data remains isolated
  it('13. user-specific cached data remains completely isolated between advocates', async () => {
    await offlineStorage.saveCachedCases(USER_A, mockCases);

    const casesUserA = await offlineStorage.getCachedCases(USER_A);
    const casesUserB = await offlineStorage.getCachedCases(USER_B);

    expect(casesUserA?.data).toHaveLength(1);
    expect(casesUserB).toBeNull();
  });

  // Scenario 14: Logout does not expose previous user's cached data
  it('14. logout clears user cache and does not expose protected data', async () => {
    await offlineStorage.saveCachedCases(USER_A, mockCases);
    await offlineStorage.saveCachedReminders(USER_A, mockReminders);
    await syncQueue.enqueueAction(USER_A, {
      action_type: 'CREATE_REMINDER',
      payload: {},
    });

    // Advocate logs out
    await offlineStorage.clearUserCache(USER_A);

    const casesAfterLogout = await offlineStorage.getCachedCases(USER_A);
    const remindersAfterLogout = await offlineStorage.getCachedReminders(USER_A);
    const queueAfterLogout = await syncQueue.getQueue(USER_A);

    expect(casesAfterLogout).toBeNull();
    expect(remindersAfterLogout).toBeNull();
    expect(queueAfterLogout).toHaveLength(0);
  });

  // Scenario 15: Stale cached information is clearly identified
  it('15. stale cached information is clearly identified with timestamp and isCached flag', async () => {
    await offlineStorage.saveCachedCases(USER_A, mockCases);
    const cached = await offlineStorage.getCachedCases(USER_A);

    expect(cached?.isCached).toBe(true);
    expect(typeof cached?.lastSyncedAt).toBe('string');
    expect(new Date(cached!.lastSyncedAt!).getTime()).toBeLessThanOrEqual(Date.now());
  });

  // Scenario 16: Multiple synchronization triggers do not execute concurrently
  it('16. multiple synchronization triggers do not execute concurrently (mutex lock)', async () => {
    await syncQueue.enqueueAction(USER_A, {
      action_type: 'CREATE_REMINDER',
      payload: {},
    });

    let activeExecutions = 0;
    let maxConcurrent = 0;

    const slowExecutor = jest.fn().mockImplementation(async () => {
      activeExecutions++;
      maxConcurrent = Math.max(maxConcurrent, activeExecutions);
      await new Promise(r => setTimeout(r, 50));
      activeExecutions--;
      return { id: 1 };
    });

    // Trigger two syncs concurrently
    const p1 = syncEngine.syncPendingActions(USER_A, slowExecutor);
    const p2 = syncEngine.syncPendingActions(USER_A, slowExecutor);

    await Promise.all([p1, p2]);

    expect(maxConcurrent).toBe(1);
  });

  // Scenario 17: Unsupported operations are not queued
  it('17. unsupported operations are rejected and not queued', async () => {
    await expect(
      syncQueue.enqueueAction(USER_A, {
        action_type: 'MODIFY_COURT_RECORD' as unknown as QueueActionType,
        payload: { stage: 'DISMISSED' },
      })
    ).rejects.toThrow(/unsupported/i);

    const queue = await syncQueue.getQueue(USER_A);
    expect(queue).toHaveLength(0);
  });
});
