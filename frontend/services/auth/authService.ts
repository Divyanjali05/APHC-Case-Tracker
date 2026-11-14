import { apiClient, setSessionExpiredHandler } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { tokenStorage } from './tokenStorage';
import { offlineStorage } from '../offline/offlineStorage';

export interface PasswordResetConfirmPayload {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

type SessionExpiredListener = () => void;
const sessionExpiredListeners: Set<SessionExpiredListener> = new Set();

// Register the API client trigger for session expiration
setSessionExpiredHandler(() => {
  sessionExpiredListeners.forEach(listener => {
    try {
      listener();
    } catch {
      // Suppress listener callback failure
    }
  });
});

export const authService = {
  /**
   * Register a callback triggered whenever an active session expires.
   */
  onSessionExpired(listener: SessionExpiredListener): () => void {
    sessionExpiredListeners.add(listener);
    return () => {
      sessionExpiredListeners.delete(listener);
    };
  },

  /**
   * Notify all registered listeners that the session has expired.
   */
  notifySessionExpired(): void {
    sessionExpiredListeners.forEach(listener => {
      try {
        listener();
      } catch {
        // Suppress listener error
      }
    });
  },

  /**
   * Request password reset instructions for a given Bar Council enrollment number.
   * Always resolves with a generic confirmation to prevent account enumeration.
   */
  async requestPasswordReset(enrollmentNumber: string): Promise<{ detail: string }> {
    const response = await apiClient.post<{ detail: string }>(
      ENDPOINTS.AUTH.PASSWORD_RESET_REQUEST,
      { enrollment_number: enrollmentNumber.trim().toUpperCase() }
    );
    return response.data;
  },

  /**
   * Confirm password reset with the single-use token and new password.
   */
  async confirmPasswordReset(
    payload: PasswordResetConfirmPayload
  ): Promise<{ detail: string }> {
    const response = await apiClient.post<{ detail: string }>(
      ENDPOINTS.AUTH.PASSWORD_RESET_CONFIRM,
      {
        token: payload.token.trim(),
        new_password: payload.newPassword,
        confirm_password: payload.confirmPassword,
      }
    );
    return response.data;
  },

  /**
   * Log out the current advocate, invalidating the refresh token on the server
   * and clearing tokens from secure storage.
   */
  async logout(): Promise<void> {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (refreshToken) {
        await apiClient.post(ENDPOINTS.AUTH.LOGOUT, { refresh: refreshToken });
      }
    } catch {
      // Invalidate session locally regardless of server error
    } finally {
      const enrollment =
        typeof tokenStorage.getUserEnrollment === 'function'
          ? await tokenStorage.getUserEnrollment()
          : 'default_advocate';
      if (offlineStorage && typeof offlineStorage.clearUserCache === 'function') {
        await offlineStorage.clearUserCache(enrollment);
      }
      await tokenStorage.clearTokens();
      this.notifySessionExpired();
    }
  },
};
