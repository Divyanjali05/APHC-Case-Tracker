import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ENDPOINTS } from './endpoints';
import { HealthCheckResponse, PaginatedResponse } from '../../types';
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

// Queue to handle multiple concurrent 401 requests without race conditions
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor: attach Bearer token to authenticated requests
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const isExempt =
      config.url?.includes(ENDPOINTS.AUTH.TOKEN) ||
      config.url?.includes(ENDPOINTS.AUTH.REFRESH) ||
      config.url?.includes(ENDPOINTS.AUTH.REGISTER) ||
      config.url?.includes(ENDPOINTS.AUTH.PASSWORD_RESET_REQUEST) ||
      config.url?.includes(ENDPOINTS.AUTH.PASSWORD_RESET_CONFIRM) ||
      config.url?.includes(ENDPOINTS.HEALTH);

    if (!isExempt) {
      try {
        const accessToken = await tokenStorage.getAccessToken();
        if (accessToken && config.headers) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
      } catch {
        // Ignore storage read errors when running unauthenticated or in restricted environments.
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
      originalRequest.url?.includes(ENDPOINTS.AUTH.REGISTER) ||
      originalRequest.url?.includes(ENDPOINTS.AUTH.PASSWORD_RESET_REQUEST) ||
      originalRequest.url?.includes(ENDPOINTS.AUTH.PASSWORD_RESET_CONFIRM);

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
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

        const newAccessToken = refreshResponse.data.access;
        const newRefreshToken = refreshResponse.data.refresh || refreshToken;

        await tokenStorage.saveTokens(newAccessToken, newRefreshToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }

        processQueue(null, newAccessToken);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        await tokenStorage.clearTokens();
        notifySessionExpired();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

/** Unwrap DRF paginated list responses while remaining compatible with plain arrays. */
export const unwrapListResponse = <T>(data: T[] | PaginatedResponse<T>): T[] => {
  if (Array.isArray(data)) {
    return data;
  }
  return Array.isArray(data?.results) ? data.results : [];
};

export const fetchHealthCheck = async (): Promise<HealthCheckResponse> => {
  const response = await apiClient.get<HealthCheckResponse>(ENDPOINTS.HEALTH);
  return response.data;
};
