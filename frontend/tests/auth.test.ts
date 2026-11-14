import React from 'react';
import { Text, View } from 'react-native';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { apiClient, API_BASE_URL } from '../services/api/client';
import { tokenStorage } from '../services/auth/tokenStorage';
import { authService } from '../services/auth/authService';
import { ENDPOINTS } from '../services/api/endpoints';
import { AuthProvider, useAuth } from '../features/auth/AuthContext';

jest.mock('../services/auth/tokenStorage', () => ({
  tokenStorage: {
    saveTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
    clearTokens: jest.fn().mockResolvedValue(undefined),
  },
}));

interface InterceptorHandler<T> {
  fulfilled: (value: T) => T | Promise<T>;
  rejected?: (error: unknown) => unknown;
}

interface CustomRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

function makeFakeJwt(expEpochSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url'
  );
  const payload = Buffer.from(
    JSON.stringify({ user_id: 1, exp: expEpochSeconds })
  ).toString('base64url');
  return `${header}.${payload}.signature`;
}

function AuthStateProbe() {
  const { isAuthenticated, isLoading, signIn, signOut } = useAuth();
  return React.createElement(
    View,
    null,
    React.createElement(Text, { testID: 'auth-loading' }, String(isLoading)),
    React.createElement(
      Text,
      { testID: 'auth-status' },
      isAuthenticated ? 'AUTHENTICATED' : 'UNAUTHENTICATED'
    ),
    React.createElement(
      Text,
      {
        testID: 'probe-signin',
        onPress: () => void signIn(makeFakeJwt(1700003600), 'refresh_tok_123'),
      },
      'SignIn'
    ),
    React.createElement(
      Text,
      {
        testID: 'probe-signout',
        onPress: () => void signOut(),
      },
      'SignOut'
    )
  );
}

describe('Auth Service, Interceptors, and AuthContext', () => {
  const originalAtob = globalThis.atob;

  beforeEach(() => {
    jest.clearAllMocks();
    (tokenStorage.getAccessToken as jest.Mock).mockReset();
    (tokenStorage.getRefreshToken as jest.Mock).mockReset();
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    if (typeof globalThis.atob !== 'function') {
      globalThis.atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    globalThis.atob = originalAtob;
  });

  describe('authService.logout', () => {
    it('revokes refresh token via backend and clears tokens locally', async () => {
      const mockResponse = { data: { detail: 'ok' }, status: 200 } as AxiosResponse;
      const mockPost = jest.spyOn(apiClient, 'post').mockResolvedValueOnce(mockResponse);
      (tokenStorage.getRefreshToken as jest.Mock).mockResolvedValueOnce(
        'mock_refresh_token'
      );

      await authService.logout();

      expect(tokenStorage.getRefreshToken).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith(ENDPOINTS.AUTH.LOGOUT, {
        refresh: 'mock_refresh_token',
      });
      expect(tokenStorage.clearTokens).toHaveBeenCalledTimes(1);
    });

    it('clears tokens even if backend revoke fails', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('Network error'));
      (tokenStorage.getRefreshToken as jest.Mock).mockResolvedValueOnce(
        'mock_refresh_token'
      );

      await authService.logout();
      expect(tokenStorage.clearTokens).toHaveBeenCalledTimes(1);
    });
  });

  describe('authService Password Reset Methods', () => {
    it('requestPasswordReset calls endpoint with uppercase enrollment', async () => {
      const mockPost = jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
        data: { detail: 'If an account exists, instructions have been sent.' },
        status: 200,
      } as AxiosResponse);

      const result = await authService.requestPasswordReset('ap/1234/2020');

      expect(mockPost).toHaveBeenCalledWith(ENDPOINTS.AUTH.PASSWORD_RESET_REQUEST, {
        enrollment_number: 'AP/1234/2020',
      });
      expect(result.detail).toContain('instructions have been sent');
    });

    it('confirmPasswordReset calls confirm endpoint with reset payload', async () => {
      const mockPost = jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
        data: { detail: 'Password has been reset successfully.' },
        status: 200,
      } as AxiosResponse);

      const result = await authService.confirmPasswordReset({
        token: 'reset-tok-xyz',
        newPassword: 'BrandNewPassword123!',
        confirmPassword: 'BrandNewPassword123!',
      });

      expect(mockPost).toHaveBeenCalledWith(ENDPOINTS.AUTH.PASSWORD_RESET_CONFIRM, {
        token: 'reset-tok-xyz',
        new_password: 'BrandNewPassword123!',
        confirm_password: 'BrandNewPassword123!',
      });
      expect(result.detail).toContain('reset successfully');
    });
  });

  describe('API Client Request Interceptor', () => {
    const requestHandlers = (
      apiClient.interceptors.request as unknown as {
        handlers: InterceptorHandler<InternalAxiosRequestConfig>[];
      }
    ).handlers;
    const authInterceptor = requestHandlers[0];

    it('attaches Authorization Bearer header to protected endpoints', async () => {
      (tokenStorage.getAccessToken as jest.Mock).mockResolvedValueOnce(
        'mock_valid_access_token'
      );

      const config = {
        url: '/cases/',
        headers: {} as InternalAxiosRequestConfig['headers'],
      } as InternalAxiosRequestConfig;

      const result = await authInterceptor.fulfilled(config);
      expect(result.headers.Authorization).toBe('Bearer mock_valid_access_token');
    });

    it.each([
      ENDPOINTS.AUTH.REGISTER,
      ENDPOINTS.AUTH.TOKEN,
      ENDPOINTS.AUTH.REFRESH,
      ENDPOINTS.AUTH.PASSWORD_RESET_REQUEST,
      ENDPOINTS.AUTH.PASSWORD_RESET_CONFIRM,
      ENDPOINTS.HEALTH,
    ])('does NOT attach Bearer token to public endpoint %s', async publicUrl => {
      (tokenStorage.getAccessToken as jest.Mock).mockResolvedValueOnce(
        'stale_access_token'
      );

      const config = {
        url: publicUrl,
        headers: {} as InternalAxiosRequestConfig['headers'],
      } as InternalAxiosRequestConfig;

      const result = await authInterceptor.fulfilled(config);
      expect(result.headers.Authorization).toBeUndefined();
      expect(tokenStorage.getAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('API Client Response Interceptor & Refresh Queue', () => {
    const responseHandlers = (
      apiClient.interceptors.response as unknown as {
        handlers: {
          fulfilled: (value: AxiosResponse) => AxiosResponse;
          rejected: (error: unknown) => Promise<unknown>;
        }[];
      }
    ).handlers;
    const errorInterceptor = responseHandlers[0];

    it('queues simultaneous 401 requests so refresh runs only once and retries both', async () => {
      (tokenStorage.getRefreshToken as jest.Mock).mockResolvedValueOnce(
        'valid_refresh_token'
      );

      let resolveRefresh!: (val: AxiosResponse) => void;
      const pendingRefresh = new Promise<AxiosResponse>(resolve => {
        resolveRefresh = resolve;
      });
      const axiosPostSpy = jest.spyOn(axios, 'post').mockReturnValueOnce(pendingRefresh);
      const originalAdapter = apiClient.defaults.adapter;
      const mockAdapter = jest.fn(async config => ({
        data: { ok: true, url: config.url },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }));
      apiClient.defaults.adapter = mockAdapter;

      try {
        const err1 = {
          response: { status: 401 },
          config: {
            url: '/cases/',
            headers: {} as InternalAxiosRequestConfig['headers'],
            _retry: false,
          } as CustomRequestConfig,
        };
        const err2 = {
          response: { status: 401 },
          config: {
            url: '/reminders/',
            headers: {} as InternalAxiosRequestConfig['headers'],
            _retry: false,
          } as CustomRequestConfig,
        };

        const p1 = errorInterceptor.rejected(err1);
        const p2 = errorInterceptor.rejected(err2);

        // Allow microtasks to enqueue both requests while refresh is still in flight
        await Promise.resolve();
        await Promise.resolve();

        resolveRefresh({
          data: { access: 'new_access_token', refresh: 'new_refresh_token' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        });

        const [res1, res2] = (await Promise.all([p1, p2])) as AxiosResponse[];
        expect(axiosPostSpy).toHaveBeenCalledTimes(1);
        expect(axiosPostSpy).toHaveBeenCalledWith(
          `${API_BASE_URL}${ENDPOINTS.AUTH.REFRESH}`,
          { refresh: 'valid_refresh_token' },
          expect.any(Object)
        );
        expect(tokenStorage.saveTokens).toHaveBeenCalledWith(
          'new_access_token',
          'new_refresh_token'
        );
        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);
      } finally {
        apiClient.defaults.adapter = originalAdapter;
      }
    });

    it('clears tokens and notifies session expired when refresh fails', async () => {
      const expiredSpy = jest.fn();
      const unsub = authService.onSessionExpired(expiredSpy);
      (tokenStorage.getRefreshToken as jest.Mock).mockResolvedValueOnce(
        'expired_refresh_token'
      );
      jest.spyOn(axios, 'post').mockRejectedValueOnce({
        response: { status: 401 },
      });

      const originalRequest: CustomRequestConfig = {
        url: '/cases/',
        headers: {} as InternalAxiosRequestConfig['headers'],
        _retry: false,
      } as CustomRequestConfig;

      await expect(
        errorInterceptor.rejected({
          response: { status: 401 },
          config: originalRequest,
        })
      ).rejects.toBeDefined();

      expect(tokenStorage.clearTokens).toHaveBeenCalled();
      expect(expiredSpy).toHaveBeenCalledTimes(1);
      unsub();
    });
  });

  describe('AuthProvider session persistence and revocation', () => {
    it('restores authenticated session when persisted JWT is valid', async () => {
      (tokenStorage.getAccessToken as jest.Mock).mockResolvedValueOnce(
        makeFakeJwt(1700003600)
      );

      render(
        React.createElement(AuthProvider, null, React.createElement(AuthStateProbe))
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-loading').props.children).toBe('false');
      });
      expect(screen.getByTestId('auth-status').props.children).toBe('AUTHENTICATED');
    });

    it('clears expired JWT on mount and stays unauthenticated', async () => {
      (tokenStorage.getAccessToken as jest.Mock).mockResolvedValueOnce(
        makeFakeJwt(1699990000)
      );

      render(
        React.createElement(AuthProvider, null, React.createElement(AuthStateProbe))
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-loading').props.children).toBe('false');
      });
      expect(screen.getByTestId('auth-status').props.children).toBe('UNAUTHENTICATED');
      expect(tokenStorage.clearTokens).toHaveBeenCalledTimes(1);
    });

    it('signOut revokes backend refresh token and resets authenticated state', async () => {
      (tokenStorage.getAccessToken as jest.Mock).mockResolvedValueOnce(
        makeFakeJwt(1700003600)
      );
      (tokenStorage.getRefreshToken as jest.Mock).mockResolvedValueOnce('rt_active_1');
      const postSpy = jest
        .spyOn(apiClient, 'post')
        .mockResolvedValueOnce({ data: { detail: 'ok' }, status: 200 } as AxiosResponse);

      render(
        React.createElement(AuthProvider, null, React.createElement(AuthStateProbe))
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status').props.children).toBe('AUTHENTICATED');
      });

      await act(async () => {
        screen.getByTestId('probe-signout').props.onPress();
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status').props.children).toBe('UNAUTHENTICATED');
      });
      expect(postSpy).toHaveBeenCalledWith(ENDPOINTS.AUTH.LOGOUT, {
        refresh: 'rt_active_1',
      });
      expect(tokenStorage.clearTokens).toHaveBeenCalled();
    });
  });
});
