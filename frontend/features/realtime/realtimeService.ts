import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import {
  RealtimeConnectionStatus,
  RealtimeEvent,
  RealtimeEventsResponse,
  RealtimeEventType,
  RealtimeStatusResponse,
  RealtimeTicketResponse,
} from './types';

type EventCallback = (event: RealtimeEvent) => void;
type StatusCallback = (status: RealtimeConnectionStatus) => void;

export class RealtimeManager {
  private static instance: RealtimeManager | null = null;

  private latestEventId: number = 0;
  private processedUuids: Set<string> = new Set();
  private processedIds: Set<number> = new Set();
  private maxDeduplicationWindow: number = 500;

  private listeners: Map<string, Set<EventCallback>> = new Map();
  private statusListeners: Set<StatusCallback> = new Set();
  private currentStatus: RealtimeConnectionStatus = 'OFFLINE';

  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private isDestroyed: boolean = false;

  private pollingIntervalMs: number = 10000;
  private pollingTimer: NodeJS.Timeout | null = null;

  public static getInstance(): RealtimeManager {
    if (!RealtimeManager.instance) {
      RealtimeManager.instance = new RealtimeManager();
    }
    return RealtimeManager.instance;
  }

  // --- Monotonic Cursor & Deduplication ---

  public getLatestEventId(): number {
    return this.latestEventId;
  }

  public setLatestEventId(id: number): void {
    if (id > this.latestEventId) {
      this.latestEventId = id;
    }
  }

  public isDuplicate(event: RealtimeEvent): boolean {
    if (this.processedIds.has(event.id)) {
      return true;
    }
    if (event.event_uuid && this.processedUuids.has(event.event_uuid)) {
      return true;
    }
    return false;
  }

  public markProcessed(event: RealtimeEvent): void {
    this.processedIds.add(event.id);
    if (event.event_uuid) {
      this.processedUuids.add(event.event_uuid);
    }
    this.setLatestEventId(event.id);

    // Bounded deduplication cache
    if (this.processedIds.size > this.maxDeduplicationWindow) {
      const idsArray = Array.from(this.processedIds);
      const toRemove = idsArray.slice(0, idsArray.length - this.maxDeduplicationWindow);
      toRemove.forEach(id => this.processedIds.delete(id));
    }
    if (this.processedUuids.size > this.maxDeduplicationWindow) {
      const uuidsArray = Array.from(this.processedUuids);
      const toRemove = uuidsArray.slice(
        0,
        uuidsArray.length - this.maxDeduplicationWindow
      );
      toRemove.forEach(uuid => this.processedUuids.delete(uuid));
    }
  }

  public resetDeduplication(): void {
    this.processedIds.clear();
    this.processedUuids.clear();
    this.latestEventId = 0;
  }

  // --- Connection Status Management ---

  public getStatus(): RealtimeConnectionStatus {
    return this.currentStatus;
  }

  private setStatus(status: RealtimeConnectionStatus): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this.statusListeners.forEach(cb => {
        try {
          cb(status);
        } catch {
          // ignore callback error
        }
      });
    }
  }

  public onStatusChange(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.currentStatus);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  // --- Subscription Listeners ---

  public subscribe(
    eventType: RealtimeEventType | '*',
    callback: EventCallback
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    return () => {
      const set = this.listeners.get(eventType);
      if (set) {
        set.delete(callback);
      }
    };
  }

  public dispatchEvent(event: RealtimeEvent): boolean {
    if (this.isDuplicate(event)) {
      return false;
    }
    this.markProcessed(event);

    // Specific listeners
    const specificListeners = this.listeners.get(event.event_type);
    if (specificListeners) {
      specificListeners.forEach(cb => {
        try {
          cb(event);
        } catch {
          // preserve listener isolation
        }
      });
    }

    // Wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach(cb => {
        try {
          cb(event);
        } catch {
          // preserve listener isolation
        }
      });
    }
    return true;
  }

  // --- Delta Sync API ---

  public async fetchMissedEvents(
    sinceId?: number,
    limit: number = 50
  ): Promise<RealtimeEventsResponse> {
    const cursor = sinceId !== undefined ? sinceId : this.latestEventId;
    const response = await apiClient.get<RealtimeEventsResponse>(
      `${ENDPOINTS.NOTIFICATIONS.REALTIME_EVENTS}?since_id=${cursor}&limit=${limit}`
    );
    return response.data;
  }

  public async fetchStatus(): Promise<RealtimeStatusResponse> {
    const response = await apiClient.get<RealtimeStatusResponse>(
      ENDPOINTS.NOTIFICATIONS.REALTIME_STATUS
    );
    return response.data;
  }

  public async fetchStreamTicket(): Promise<string | null> {
    try {
      const response = await apiClient.post<RealtimeTicketResponse>(
        ENDPOINTS.NOTIFICATIONS.REALTIME_TICKET
      );
      return response.data.ticket;
    } catch {
      return null;
    }
  }

  public async syncMissedEvents(): Promise<number> {
    try {
      let hasMore = true;
      let totalDispatched = 0;

      while (hasMore && !this.isDestroyed) {
        const result = await this.fetchMissedEvents(this.latestEventId, 50);
        if (result.cursor_expired || result.requires_full_sync) {
          // Cursor was pruned on backend; signal wildcard listeners to perform full-state refresh
          this.dispatchEvent({
            id: result.latest_event_id,
            event_uuid: `full-sync-${Date.now()}`,
            event_type: 'COURT_TOKEN_UPDATED',
            payload: { requires_full_sync: true },
            created_at: new Date().toISOString(),
          });
        }
        for (const ev of result.events) {
          const wasNew = this.dispatchEvent(ev);
          if (wasNew) totalDispatched++;
        }
        this.setLatestEventId(result.latest_event_id);
        hasMore = result.has_more && result.events.length > 0;
      }
      return totalDispatched;
    } catch {
      return 0;
    }
  }

  // --- Connection Lifecycle (Adaptive Poll / Sync) ---

  public async start(): Promise<void> {
    this.isDestroyed = false;
    if (this.isConnecting || this.currentStatus === 'CONNECTED') {
      return;
    }
    this.isConnecting = true;
    this.setStatus('CONNECTING');

    try {
      const statusData = await this.fetchStatus();
      this.setLatestEventId(statusData.latest_event_id);
      await this.syncMissedEvents();
      this.reconnectAttempts = 0;
      this.setStatus('CONNECTED');
      this.startPolling();
    } catch {
      this.setStatus('OFFLINE');
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  public stop(): void {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPolling();
    this.setStatus('OFFLINE');
  }

  public async handleAppForeground(): Promise<void> {
    // When returning from background or network restore, sync immediately
    if (this.isDestroyed) return;
    try {
      this.setStatus('CONNECTING');
      await this.syncMissedEvents();
      this.setStatus('CONNECTED');
    } catch {
      this.setStatus('RECONNECTING');
      this.scheduleReconnect();
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollingTimer = setInterval(async () => {
      if (this.isDestroyed) return;
      try {
        await this.syncMissedEvents();
      } catch {
        this.setStatus('RECONNECTING');
        this.scheduleReconnect();
      }
    }, this.pollingIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed || this.reconnectTimer) {
      return;
    }
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus('OFFLINE');
      return;
    }

    this.setStatus('RECONNECTING');
    this.reconnectAttempts++;
    // Exponential backoff with jitter: 1s, 2s, 4s, 8s, capped at 30s + up to 500ms random jitter
    const baseBackoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    const jitterMs = Math.floor(Math.random() * 500);
    const backoffMs = baseBackoffMs + jitterMs;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.isDestroyed) return;
      try {
        await this.start();
      } catch {
        this.scheduleReconnect();
      }
    }, backoffMs);
  }
}

export const realtimeService = RealtimeManager.getInstance();
