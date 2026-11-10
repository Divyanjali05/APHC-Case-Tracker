import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthUser } from '../../types';

const ACCESS_TOKEN_KEY = 'aphc_access_token';
const REFRESH_TOKEN_KEY = 'aphc_refresh_token';
const USER_ENROLLMENT_KEY = 'aphc_user_enrollment';
const DEMO_MODE_KEY = 'aphc_is_demo_mode';
const USER_SNAPSHOT_KEY = 'aphc_user_snapshot';
const REMEMBERED_IDENTIFIER_KEY = 'aphc_remembered_identifier';

export const tokenStorage = {
  async saveTokens(
    accessToken: string,
    refreshToken: string,
    userEnrollment?: string
  ): Promise<void> {
    await this.setDemoMode(false);
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      if (userEnrollment) {
        await AsyncStorage.setItem(USER_ENROLLMENT_KEY, userEnrollment);
      }
    } else {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
      if (userEnrollment) {
        await AsyncStorage.setItem(USER_ENROLLMENT_KEY, userEnrollment);
      }
    }
  },

  async isDemoMode(): Promise<boolean> {
    try {
      if (Platform.OS === 'web') {
        const val = await AsyncStorage.getItem(DEMO_MODE_KEY);
        return val === 'true';
      }
      const val = await SecureStore.getItemAsync(DEMO_MODE_KEY);
      return val === 'true';
    } catch {
      return false;
    }
  },

  async setDemoMode(isDemo: boolean): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (isDemo) {
          await AsyncStorage.setItem(DEMO_MODE_KEY, 'true');
          await AsyncStorage.setItem(USER_ENROLLMENT_KEY, 'DEMO_ADVOCATE');
        } else {
          await AsyncStorage.removeItem(DEMO_MODE_KEY);
        }
      } else {
        if (isDemo) {
          await SecureStore.setItemAsync(DEMO_MODE_KEY, 'true');
          await AsyncStorage.setItem(USER_ENROLLMENT_KEY, 'DEMO_ADVOCATE');
        } else {
          await SecureStore.deleteItemAsync(DEMO_MODE_KEY);
        }
      }
    } catch {
      // Ignore storage errors in demo mode setter
    }
  },

  async getUserEnrollment(): Promise<string> {
    try {
      const stored = await AsyncStorage.getItem(USER_ENROLLMENT_KEY);
      if (stored) return stored;
    } catch {
      // Fallback
    }
    return 'default_advocate';
  },

  async saveUserEnrollment(userEnrollment: string): Promise<void> {
    await AsyncStorage.setItem(USER_ENROLLMENT_KEY, userEnrollment);
  },

  async saveUserSnapshot(user: AuthUser): Promise<void> {
    try {
      await AsyncStorage.setItem(USER_SNAPSHOT_KEY, JSON.stringify(user));
    } catch {
      // Ignore storage snapshot errors
    }
  },

  async getUserSnapshot(): Promise<AuthUser | null> {
    try {
      const raw = await AsyncStorage.getItem(USER_SNAPSHOT_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },

  async clearUserSnapshot(): Promise<void> {
    try {
      await AsyncStorage.removeItem(USER_SNAPSHOT_KEY);
    } catch {
      // Ignore removal error
    }
  },

  async saveRememberedIdentifier(identifier: string): Promise<void> {
    try {
      const trimmed = identifier.trim();
      if (trimmed) {
        await AsyncStorage.setItem(REMEMBERED_IDENTIFIER_KEY, trimmed);
      } else {
        await AsyncStorage.removeItem(REMEMBERED_IDENTIFIER_KEY);
      }
    } catch {
      // Ignore preference storage errors
    }
  },

  async getRememberedIdentifier(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(REMEMBERED_IDENTIFIER_KEY);
    } catch {
      return null;
    }
  },

  async clearRememberedIdentifier(): Promise<void> {
    try {
      await AsyncStorage.removeItem(REMEMBERED_IDENTIFIER_KEY);
    } catch {
      // Ignore removal error
    }
  },

  async getAccessToken(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    }
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    }
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },

  async clearTokens(): Promise<void> {
    await this.setDemoMode(false);
    await AsyncStorage.removeItem(USER_SNAPSHOT_KEY);
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
      await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
      await AsyncStorage.removeItem(USER_ENROLLMENT_KEY);
    } else {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await AsyncStorage.removeItem(USER_ENROLLMENT_KEY);
    }
  },
};
