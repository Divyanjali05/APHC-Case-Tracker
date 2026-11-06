export const ENDPOINTS = {
  HEALTH: '/health/',
  AUTH: {
    TOKEN: '/auth/token/',
    REFRESH: '/auth/token/refresh/',
    LOGOUT: '/auth/logout/',
    PASSWORD_RESET_REQUEST: '/auth/password-reset/request/',
    PASSWORD_RESET_CONFIRM: '/auth/password-reset/confirm/',
    PROFILE: '/auth/profile/',
    STATUS: '/auth/status/',
  },
  CASES: {
    LIST: '/cases/',
    DETAIL: (id: number | string) => `/cases/${id}/`,
    STATUS: '/cases/status/',
    UPCOMING_HEARINGS: '/cases/hearings/upcoming/',
    HEARINGS: (caseId: number | string) => `/cases/${caseId}/hearings/`,
    HEARING_DETAIL: (caseId: number | string, id: number | string) =>
      `/cases/${caseId}/hearings/${id}/`,
    HEARING_RESCHEDULE: (caseId: number | string, id: number | string) =>
      `/cases/${caseId}/hearings/${id}/reschedule/`,
    JUDGMENTS: (caseId: number | string) => `/cases/${caseId}/judgments/`,
    JUDGMENT_DETAIL: (caseId: number | string, id: number | string) =>
      `/cases/${caseId}/judgments/${id}/`,
    JUDGMENT_DOCUMENT: (caseId: number | string, id: number | string) =>
      `/cases/${caseId}/judgments/${id}/document/`,
    HISTORY: (caseId: number | string) => `/cases/${caseId}/history/`,
    COURT_STATUS: (caseId: number | string) => `/cases/${caseId}/court-status/`,
    COURT_STATUS_HISTORY: (caseId: number | string) =>
      `/cases/${caseId}/court-status/history/`,
    COURT_LISTINGS: (caseId: number | string) => `/cases/${caseId}/court-listings/`,
    COURT_STATUS_SYNC: (caseId: number | string) => `/cases/${caseId}/court-status/sync/`,
  },
  COURT_STATUS: {
    SYNC_STATUS: '/court-status/sync-status/',
  },
  REMINDERS: {
    LIST: '/reminders/',
    DETAIL: (id: number | string) => `/reminders/${id}/`,
    PREFERENCES: '/reminders/preferences/',
    DISMISS: (id: number | string) => `/reminders/${id}/dismiss/`,
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
    MARK_READ: (id: number | string) => `/notifications/${id}/read/`,
    MARK_ALL_READ: '/notifications/mark-all-read/',
    STATUS: '/notifications/status/',
    REALTIME_TICKET: '/notifications/realtime/ticket/',
    REALTIME_EVENTS: '/notifications/realtime/events/',
    REALTIME_STREAM: '/notifications/realtime/stream/',
    REALTIME_STATUS: '/notifications/realtime/status/',
  },
  SCHEMA: '/schema/',
};
