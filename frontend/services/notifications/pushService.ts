import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';

export const pushNotificationService = {
  async registerForPushNotifications(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;

      // Sync token with backend if authenticated
      await apiClient
        .post(ENDPOINTS.NOTIFICATIONS.DEVICES, {
          expo_push_token: token,
          platform: Platform.OS,
          device_name: `${Platform.OS} Device`,
        })
        .catch(() => {
          // Silently skip if user is unauthenticated during Phase 0 initialization
        });

      return token;
    } catch {
      return null;
    }
  },
};
