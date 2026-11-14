import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = 'aphc_access_token';
const REFRESH_TOKEN_KEY = 'aphc_refresh_token';
const USER_ENROLLMENT_KEY = 'aphc_user_enrollment';

export const tokenStorage = {
  async saveTokens(
    accessToken: string,
    refreshToken: string,
    userEnrollment?: string
  ): Promise<void> {
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
