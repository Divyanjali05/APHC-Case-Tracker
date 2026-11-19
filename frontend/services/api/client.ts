import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ENDPOINTS } from './endpoints';
import { HealthCheckResponse } from '../../types';
import { tokenStorage } from '../auth/tokenStorage';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Session expired notification hook
let sessionExpiredHandler: (() => void) | null = null;
export const setSessionExpiredHandler = (handler: () => void) => {
  sessionExpiredHandler = handler;
};

const notifySessionExpired = () => {
  if (sessionExpiredHandler) {
    sessionExpiredHandler();
  }
};

// Session lifecycle coordination to prevent token-refresh / logout race conditions.
// Every logout or new login increments `authSessionEpoch`; any in-flight refresh
// or profile call started under an older epoch is discarded and cannot write tokens
// or repopulate authenticated state.
let authSessionEpoch = 0;
let isLoggingOut = false;

// Queue to handle multiple concurrent 401 requests without race conditions
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  const queued = failedQueue;
  failedQueue = [];
  queued.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
};

export const getAuthSessionEpoch = (): number => authSessionEpoch;
export const isLogoutInProgress = (): boolean => isLoggingOut;

/**
 * Immediately invalidate any active/pending token refresh operations and block
 * new authenticated requests while logout is executing.
 */
export const beginLogoutSession = (): number => {
  authSessionEpoch += 1;
  isLoggingOut = true;
  isRefreshing = false;
  processQueue(new axios.Cancel('Session terminated by logout'), null);
  return authSessionEpoch;
};

/**
 * Finalize logout lifecycle after local tokens and state are cleared.
 * Keeps the bumped epoch so late pre-logout promises remain invalidated.
 */
export const completeLogoutSession = (): void => {
  isLoggingOut = false;
  isRefreshing = false;
  processQueue(new axios.Cancel('Session terminated by logout'), null);
};

/**
 * Start a clean authenticated session epoch upon sign-in.
 */
export const markAuthenticatedSession = (): number => {
  authSessionEpoch += 1;
  isLoggingOut = false;
  isRefreshing = false;
  return authSessionEpoch;
};

// Request interceptor: attach Bearer token to authenticated requests
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const isExempt =
      config.url?.includes(ENDPOINTS.AUTH.TOKEN) ||
      config.url?.includes(ENDPOINTS.AUTH.REFRESH) ||
      config.url?.includes(ENDPOINTS.AUTH.LOGOUT) ||
      config.url?.includes(ENDPOINTS.AUTH.REGISTER) ||
      config.url?.includes(ENDPOINTS.AUTH.REGISTER_VERIFY_OTP) ||
      config.url?.includes(ENDPOINTS.AUTH.PASSWORD_RESET_REQUEST) ||
      config.url?.includes(ENDPOINTS.AUTH.PASSWORD_RESET_CONFIRM) ||
      config.url?.includes(ENDPOINTS.HEALTH);

    if (isLoggingOut && !isExempt) {
      return Promise.reject(new axios.Cancel('Request cancelled during logout'));
    }

    if (!isExempt) {
      const accessToken = await tokenStorage.getAccessToken();
      if (isLoggingOut) {
        return Promise.reject(new axios.Cancel('Request cancelled during logout'));
      }
      if (accessToken && config.headers) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
    }
    return config;
  },
  error => Promise.reject(error)
);

// Response interceptor: refresh expired access token once and retry request
apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const isAuthRoute =
      originalRequest.url?.includes(ENDPOINTS.AUTH.TOKEN) ||
      originalRequest.url?.includes(ENDPOINTS.AUTH.REFRESH) ||
      originalRequest.url?.includes(ENDPOINTS.AUTH.LOGOUT) ||
      originalRequest.url?.includes(ENDPOINTS.AUTH.REGISTER) ||
      originalRequest.url?.includes(ENDPOINTS.AUTH.REGISTER_VERIFY_OTP) ||
      originalRequest.url?.includes(ENDPOINTS.AUTH.PASSWORD_RESET_REQUEST) ||
      originalRequest.url?.includes(ENDPOINTS.AUTH.PASSWORD_RESET_CONFIRM);

    // Never attempt automatic token refresh during logout or for auth routes
    if (isLoggingOut) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
      const requestEpoch = authSessionEpoch;

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            if (isLoggingOut || requestEpoch !== authSessionEpoch) {
              return Promise.reject(new axios.Cancel('Retry aborted after logout'));
            }
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await tokenStorage.getRefreshToken();
        if (isLoggingOut || requestEpoch !== authSessionEpoch) {
          const abortedErr = new axios.Cancel('Token refresh aborted by logout');
          processQueue(abortedErr, null);
          return Promise.reject(abortedErr);
        }

        if (!refreshToken) {
          isRefreshing = false;
          processQueue(error, null);
          await tokenStorage.clearTokens();
          notifySessionExpired();
          return Promise.reject(error);
        }

        const refreshResponse = await axios.post<{ access: string; refresh?: string }>(
          `${API_BASE_URL}${ENDPOINTS.AUTH.REFRESH}`,
          { refresh: refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        // Critical race guard: if logout began while refresh was in flight,
        // discard the refreshed tokens and NEVER write them back to storage.
        if (isLoggingOut || requestEpoch !== authSessionEpoch) {
          const abortedErr = new axios.Cancel('Token refresh discarded after logout');
          processQueue(abortedErr, null);
          return Promise.reject(abortedErr);
        }

        const newAccessToken = refreshResponse.data.access;
        const newRefreshToken = refreshResponse.data.refresh || refreshToken;

        await tokenStorage.saveTokens(newAccessToken, newRefreshToken);

        // Re-check after async storage write in case logout raced during saveTokens
        if (isLoggingOut || requestEpoch !== authSessionEpoch) {
          await tokenStorage.clearTokens();
          const abortedErr = new axios.Cancel('Token refresh cleared after logout');
          processQueue(abortedErr, null);
          return Promise.reject(abortedErr);
        }

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }

        processQueue(null, newAccessToken);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (!isLoggingOut && requestEpoch === authSessionEpoch) {
          await tokenStorage.clearTokens();
          notifySessionExpired();
        }
        return Promise.reject(refreshError);
      } finally {
        if (requestEpoch === authSessionEpoch) {
          isRefreshing = false;
        }
      }
    }

    return Promise.reject(error);
  }
);

export const fetchHealthCheck = async (): Promise<HealthCheckResponse> => {
  const response = await apiClient.get<HealthCheckResponse>(ENDPOINTS.HEALTH);
  return response.data;
};
