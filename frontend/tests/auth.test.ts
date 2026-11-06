import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { apiClient } from '../services/api/client';
import { tokenStorage } from '../services/auth/tokenStorage';
import { authService } from '../services/auth/authService';
import { ENDPOINTS } from '../services/api/endpoints';

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

describe('Auth Service and Interceptors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

      mockPost.mockRestore();
    });

    it('clears tokens even if backend revoke fails', async () => {
      const mockPost = jest
        .spyOn(apiClient, 'post')
        .mockRejectedValueOnce(new Error('Network error'));
      (tokenStorage.getRefreshToken as jest.Mock).mockResolvedValueOnce(
        'mock_refresh_token'
      );

      await authService.logout();

      expect(tokenStorage.clearTokens).toHaveBeenCalledTimes(1);
      mockPost.mockRestore();
    });
  });

  describe('authService Password Reset Methods', () => {
    it('requestPasswordReset calls the correct endpoint with uppercase enrollment', async () => {
      const mockResponse = {
        data: { detail: 'If an account exists, instructions have been sent.' },
        status: 200,
      } as AxiosResponse;
      const mockPost = jest.spyOn(apiClient, 'post').mockResolvedValueOnce(mockResponse);

      const result = await authService.requestPasswordReset('ap/1234/2020');

      expect(mockPost).toHaveBeenCalledWith(ENDPOINTS.AUTH.PASSWORD_RESET_REQUEST, {
        enrollment_number: 'AP/1234/2020',
      });
      expect(result.detail).toContain('instructions have been sent');
      mockPost.mockRestore();
    });

    it('confirmPasswordReset calls the confirm endpoint with payload', async () => {
      const mockResponse = {
        data: { detail: 'Password has been reset successfully.' },
        status: 200,
      } as AxiosResponse;
      const mockPost = jest.spyOn(apiClient, 'post').mockResolvedValueOnce(mockResponse);

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
      mockPost.mockRestore();
    });

    it('onSessionExpired fires registered listener on notifySessionExpired', () => {
      const listenerMock = jest.fn();
      const unsubscribe = authService.onSessionExpired(listenerMock);

      authService.notifySessionExpired();
      expect(listenerMock).toHaveBeenCalledTimes(1);

      unsubscribe();
      authService.notifySessionExpired();
      expect(listenerMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('API Client Request Interceptor', () => {
    it('attaches Authorization header when access token is present', async () => {
      (tokenStorage.getAccessToken as jest.Mock).mockResolvedValueOnce(
        'mock_valid_access_token'
      );

      const requestHandlers = (
        apiClient.interceptors.request as unknown as {
          handlers: InterceptorHandler<InternalAxiosRequestConfig>[];
        }
      ).handlers;
      const authInterceptor = requestHandlers[0];

      const config = {
        url: '/cases/',
        headers: {} as InternalAxiosRequestConfig['headers'],
      } as InternalAxiosRequestConfig;

      const result = await authInterceptor.fulfilled(config);
      expect(result.headers.Authorization).toBe('Bearer mock_valid_access_token');
    });

    it('does not attach Authorization header to password reset or auth token endpoints', async () => {
      (tokenStorage.getAccessToken as jest.Mock).mockResolvedValueOnce(
        'mock_valid_access_token'
      );

      const requestHandlers = (
        apiClient.interceptors.request as unknown as {
          handlers: InterceptorHandler<InternalAxiosRequestConfig>[];
        }
      ).handlers;
      const authInterceptor = requestHandlers[0];

      const config = {
        url: ENDPOINTS.AUTH.PASSWORD_RESET_REQUEST,
        headers: {} as InternalAxiosRequestConfig['headers'],
      } as InternalAxiosRequestConfig;

      const result = await authInterceptor.fulfilled(config);
      expect(result.headers.Authorization).toBeUndefined();
    });
  });

  describe('API Client Response Interceptor', () => {
    it('refreshes token once on 401 error and saves new tokens', async () => {
      (tokenStorage.getRefreshToken as jest.Mock).mockResolvedValueOnce(
        'valid_refresh_token'
      );
      const axiosPostSpy = jest.spyOn(axios, 'post').mockResolvedValueOnce({
        data: { access: 'new_access_token', refresh: 'new_refresh_token' },
        status: 200,
      } as AxiosResponse);

      const responseHandlers = (
        apiClient.interceptors.response as unknown as {
          handlers: {
            fulfilled: (value: AxiosResponse) => AxiosResponse;
            rejected: (error: unknown) => Promise<unknown>;
          }[];
        }
      ).handlers;
      const errorInterceptor = responseHandlers[0];

      const originalRequest: CustomRequestConfig = {
        url: '/cases/',
        headers: {} as InternalAxiosRequestConfig['headers'],
        _retry: false,
      } as CustomRequestConfig;

      const error = {
        response: { status: 401 },
        config: originalRequest,
      };

      const apiClientSpy = jest.spyOn(apiClient, 'request').mockResolvedValueOnce({
        data: ['case1'],
        status: 200,
      } as AxiosResponse);

      try {
        await errorInterceptor.rejected(error);
      } catch {
        // Handled in test mock
      }

      expect(tokenStorage.getRefreshToken).toHaveBeenCalled();
      expect(axiosPostSpy).toHaveBeenCalledWith(
        expect.stringContaining(ENDPOINTS.AUTH.REFRESH),
        { refresh: 'valid_refresh_token' },
        expect.any(Object)
      );
      expect(tokenStorage.saveTokens).toHaveBeenCalledWith(
        'new_access_token',
        'new_refresh_token'
      );

      axiosPostSpy.mockRestore();
      apiClientSpy.mockRestore();
    });

    it('clears tokens and notifies session expired when refresh fails', async () => {
      (tokenStorage.getRefreshToken as jest.Mock).mockResolvedValueOnce(
        'expired_refresh_token'
      );
      const axiosPostSpy = jest.spyOn(axios, 'post').mockRejectedValueOnce({
        response: { status: 401 },
      });

      const responseHandlers = (
        apiClient.interceptors.response as unknown as {
          handlers: {
            fulfilled: (value: AxiosResponse) => AxiosResponse;
            rejected: (error: unknown) => Promise<unknown>;
          }[];
        }
      ).handlers;
      const errorInterceptor = responseHandlers[0];

      const originalRequest: CustomRequestConfig = {
        url: '/cases/',
        headers: {} as InternalAxiosRequestConfig['headers'],
        _retry: false,
      } as CustomRequestConfig;

      const error = {
        response: { status: 401 },
        config: originalRequest,
      };

      await expect(errorInterceptor.rejected(error)).rejects.toBeDefined();
      expect(tokenStorage.clearTokens).toHaveBeenCalled();

      axiosPostSpy.mockRestore();
    });
  });
});
