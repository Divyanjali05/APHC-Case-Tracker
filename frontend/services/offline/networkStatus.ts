import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';

type NetworkChangeListener = (isOnline: boolean) => void;

class NetworkStatusManager {
  private isOnlineState: boolean = true;
  private isSimulated: boolean = false;
  private simulatedState: boolean = true;
  private listeners: Set<NetworkChangeListener> = new Set();
  private restorationListeners: Set<() => void> = new Set();
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.isOnlineState = true;
  }

  /**
   * Set simulated online/offline state for testing.
   */
  setSimulatedOnline(online: boolean) {
    const previous = this.isOnline();
    this.isSimulated = true;
    this.simulatedState = online;
    if (previous !== online) {
      this.notifyListeners(online);
      if (online) {
        this.notifyRestorationListeners();
      }
    }
  }

  /**
   * Reset simulation to use actual real-world connectivity probes.
   */
  resetSimulation() {
    this.isSimulated = false;
  }

  /**
   * Returns current known online/offline status.
   */
  isOnline(): boolean {
    if (this.isSimulated) {
      return this.simulatedState;
    }
    return this.isOnlineState;
  }

  /**
   * Execute actual HTTP health probe against backend server to verify genuine connectivity.
   */
  async checkConnectivity(): Promise<boolean> {
    if (this.isSimulated) {
      return this.simulatedState;
    }

    try {
      // 3-second timeout probe
      const res = await apiClient.get(ENDPOINTS.HEALTH, {
        timeout: 3000,
        headers: { 'Cache-Control': 'no-cache' },
      });
      const reachable = res.status >= 200 && res.status < 400;
      this.updateState(reachable);
      return reachable;
    } catch {
      this.updateState(false);
      return false;
    }
  }

  private updateState(newState: boolean) {
    const previous = this.isOnlineState;
    this.isOnlineState = newState;
    if (previous !== newState) {
      this.notifyListeners(newState);
      if (!previous && newState) {
        this.notifyRestorationListeners();
      }
    }
  }

  /**
   * Subscribe to network online/offline state changes.
   */
  onStatusChange(listener: NetworkChangeListener): () => void {
    this.listeners.add(listener);
    // Notify immediately with current state
    listener(this.isOnline());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Subscribe to connectivity restoration events (offline -> online transition).
   */
  onConnectivityRestored(listener: () => void): () => void {
    this.restorationListeners.add(listener);
    return () => {
      this.restorationListeners.delete(listener);
    };
  }

  private notifyListeners(isOnline: boolean) {
    this.listeners.forEach(cb => {
      try {
        cb(isOnline);
      } catch {
        // Suppress listener failure
      }
    });
  }

  private notifyRestorationListeners() {
    this.restorationListeners.forEach(cb => {
      try {
        cb();
      } catch {
        // Suppress restoration trigger failure
      }
    });
  }

  startPeriodicMonitoring(intervalMs: number = 30000) {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => {
      this.checkConnectivity();
    }, intervalMs);
  }

  stopPeriodicMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export const networkStatus = new NetworkStatusManager();
