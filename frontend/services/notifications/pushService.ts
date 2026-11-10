import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { DeviceDeactivationPayload, DeviceRegistrationPayload } from '../../types';

const DEVICE_ID_KEY = 'aphc_device_identifier';
const LAST_TOKEN_KEY = 'aphc_registered_push_token';
export const APHC_NOTIFICATION_CHANNEL_ID = 'aphc_court_alerts';

// Configure default notification handler for foreground presentations
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const pushNotificationService = {
  /**
   * Configure Android Notification Channels for High Court legal alerts.
   */
  async setupNotificationChannels(): Promise<void> {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(APHC_NOTIFICATION_CHANNEL_ID, {
        name: 'APHC High Court Alerts',
        description:
          'Instant hearing calls, cause list tokens, and court docket updates.',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#D4AF37', // Gold accent
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }
  },

  /**
   * Retrieve or create a stable hardware/client UUID for device tracking.
   */
  async getOrCreateDeviceId(): Promise<string> {
    try {
      let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (!deviceId) {
        deviceId = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
      }
      return deviceId;
    } catch {
      return `fallback-${Date.now()}`;
    }
  },

  /**
   * Request permissions, initialize Android channels, get token, and register device.
   */
  async registerForPushNotifications(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return null;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return null;
      }

      // Configure Android channel
      await this.setupNotificationChannels();

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

      if (!projectId) {
        console.warn(
          '[pushService] EAS projectId is not configured in app.json. Push token registration skipped.'
        );
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenData.data;
      if (!token) {
        return null;
      }

      const deviceId = await this.getOrCreateDeviceId();
      const payload: DeviceRegistrationPayload = {
        expo_push_token: token,
        platform: Platform.OS,
        device_name: `${Platform.OS === 'ios' ? 'Apple' : 'Android'} Device`,
        device_id: deviceId,
        app_version: '1.0.0',
      };

      // Register device on backend
      await apiClient.post(ENDPOINTS.NOTIFICATIONS.DEVICES, payload).catch(() => {
        // Silently skip if user is not currently authenticated
      });

      await SecureStore.setItemAsync(LAST_TOKEN_KEY, token).catch(() => {});
      return token;
    } catch {
      return null;
    }
  },

  /**
   * Deactivate push token registration on the backend upon advocate logout.
   */
  async deactivatePushNotifications(all: boolean = false): Promise<boolean> {
    try {
      const token = await SecureStore.getItemAsync(LAST_TOKEN_KEY);
      const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);

      const payload: DeviceDeactivationPayload = {
        all,
        ...(token ? { expo_push_token: token } : {}),
        ...(deviceId ? { device_id: deviceId } : {}),
      };

      await apiClient.post(ENDPOINTS.NOTIFICATIONS.DEACTIVATE_DEVICE, payload);
      await SecureStore.deleteItemAsync(LAST_TOKEN_KEY).catch(() => {});
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Subscribe to notifications received while the app is in foreground.
   */
  addForegroundNotificationListener(
    callback: (notification: Notifications.Notification) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(callback);
  },

  /**
   * Subscribe to notification tap/responses from background or lock-screen.
   */
  addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  },

  /**
   * Resolve deep link destination from notification data payload.
   */
  resolveNavigationRoute(data?: Record<string, unknown>): {
    pathname: string;
    params?: Record<string, string>;
  } {
    if (!data) {
      return { pathname: '/(tabs)' };
    }

    if (data.case_id) {
      return {
        pathname: `/cases/${data.case_id}`,
      };
    }

    const category = String(data.category || data.event || '').toUpperCase();
    if (category.includes('TOKEN')) {
      return { pathname: '/(tabs)/tokens' };
    }
    if (category.includes('CALENDAR') || category.includes('DEADLINE')) {
      return { pathname: '/(tabs)/calendar' };
    }
    if (category.includes('REMINDER')) {
      return { pathname: '/(tabs)/reminders' };
    }

    return { pathname: '/(tabs)' };
  },
};
