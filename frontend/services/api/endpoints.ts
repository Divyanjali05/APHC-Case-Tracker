export const ENDPOINTS = {
  HEALTH: '/health/',
  AUTH: {
    TOKEN: '/auth/token/',
    REFRESH: '/auth/token/refresh/',
    PROFILE: '/auth/profile/',
    STATUS: '/auth/status/',
  },
  CASES: {
    LIST: '/cases/',
    DETAIL: (id: number | string) => `/cases/${id}/`,
    STATUS: '/cases/status/',
  },
  REMINDERS: {
    LIST: '/reminders/',
    DETAIL: (id: number | string) => `/reminders/${id}/`,
    STATUS: '/reminders/status/',
  },
  TOKENS: {
    HALLS: '/tokens/halls/',
    ALERTS: '/tokens/alerts/',
    STATUS: '/tokens/status/',
  },
  NOTIFICATIONS: {
    DEVICES: '/notifications/devices/',
    HISTORY: '/notifications/history/',
    STATUS: '/notifications/status/',
  },
  SCHEMA: '/schema/',
};
