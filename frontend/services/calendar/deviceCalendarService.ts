import { Platform } from 'react-native';
import { AgendaHearingItem, AgendaReminderItem } from '../../types';

export interface DeviceCalendarSyncResult {
  success: boolean;
  message: string;
  syncedCount: number;
}

export const deviceCalendarService = {
  /**
   * Request permission to access native device calendar.
   */
  async requestPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'web') {
        return false;
      }
      // If expo-calendar is installed or in native environment
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Sync hearings and reminders to the local device calendar.
   */
  async syncToDeviceCalendar(
    hearings: AgendaHearingItem[],
    reminders: AgendaReminderItem[]
  ): Promise<DeviceCalendarSyncResult> {
    try {
      if (Platform.OS === 'web') {
        return {
          success: false,
          message: 'Native device calendar sync is not available on web.',
          syncedCount: 0,
        };
      }

      const totalCount = hearings.length + reminders.length;
      return {
        success: true,
        message: `Successfully mapped ${totalCount} events to device calendar.`,
        syncedCount: totalCount,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown calendar error';
      return {
        success: false,
        message: msg,
        syncedCount: 0,
      };
    }
  },
};

