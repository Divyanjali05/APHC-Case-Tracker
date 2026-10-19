export interface UserPreferences {
  language: 'en' | 'te' | 'hi';
  notificationsEnabled: boolean;
  proximityAlertDistance: number;
  speechPitch: number;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: 'en',
  notificationsEnabled: true,
  proximityAlertDistance: 5,
  speechPitch: 1.0,
};
