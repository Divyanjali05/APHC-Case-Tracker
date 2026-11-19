import {
  apiClient,
  beginLogoutSession,
  completeLogoutSession,
  setSessionExpiredHandler,
} from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { tokenStorage } from './tokenStorage';
import { offlineStorage } from '../offline/offlineStorage';

export interface PasswordResetConfirmPayload {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AdvocateRegisterPayload {
  enrollment_number: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  chamber_address?: string;
  password: string;
  confirm_password: string;
}

export interface AdvocateRegisterResponse {
  detail: string;
  enrollment_number: string;
}

export interface VerifyRegistrationOtpPayload {
  enrollment_number: string;
  otp: string;
}

export interface VerifyRegistrationOtpResponse {
  detail: string;
  access: string;
  refresh: string;
  user?: {
    id: number;
    username: string;
    email: string;
    is_active: boolean;
    profile?: {
      bar_council_enrollment_number: string;
      is_verified: boolean;
    };
  };
}

type SessionExpiredListener = () => void;
const sessionExpiredListeners: Set<SessionExpiredListener> = new Set();
let activeLogoutPromise: Promise<void> | null = null;

// Register the API client trigger for session expiration
if (typeof setSessionExpiredHandler === 'function') {
  setSessionExpiredHandler(() => {
    sessionExpiredListeners.forEach(listener => {
      try {
        listener();
      } catch {
        // Suppress listener callback failure
      }
    });
  });
}

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
   * Register a new advocate and request registration OTP.
   */
  async register(payload: AdvocateRegisterPayload): Promise<AdvocateRegisterResponse> {
    const response = await apiClient.post<AdvocateRegisterResponse>(
      ENDPOINTS.AUTH.REGISTER,
      payload
    );
    return response.data;
  },

  /**
   * Verify registration OTP and activate advocate account.
   */
  async verifyRegistrationOtp(
    payload: VerifyRegistrationOtpPayload
  ): Promise<VerifyRegistrationOtpResponse> {
    const response = await apiClient.post<VerifyRegistrationOtpResponse>(
      ENDPOINTS.AUTH.REGISTER_VERIFY_OTP,
      {
        enrollment_number: payload.enrollment_number.trim().toUpperCase(),
        otp: payload.otp.trim(),
      }
    );
    return response.data;
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
   *
   * Deduplicates concurrent calls, stops/invalidates pending token refresh queues,
   * and guarantees local session cleanup even if the backend request fails.
   */
  async logout(): Promise<void> {
    if (activeLogoutPromise) {
      return activeLogoutPromise;
    }

    const runLogout = async (): Promise<void> => {
      // 1. Immediately invalidate pending token refreshes and block new authenticated calls
      if (typeof beginLogoutSession === 'function') {
        beginLogoutSession();
      }

      let enrollment = 'default_advocate';
      try {
        enrollment =
          typeof tokenStorage.getUserEnrollment === 'function'
            ? await tokenStorage.getUserEnrollment()
            : 'default_advocate';

        const refreshToken = await tokenStorage.getRefreshToken();
        if (refreshToken) {
          await apiClient.post(
            ENDPOINTS.AUTH.LOGOUT,
            { refresh: refreshToken },
            { timeout: 5000 }
          );
        }
      } catch {
        // Always complete local sign-out regardless of network/server errors
      } finally {
        try {
          if (offlineStorage && typeof offlineStorage.clearUserCache === 'function') {
            await offlineStorage.clearUserCache(enrollment);
          }
        } catch {
          // Ignore offline cache cleanup error
        }

        try {
          await tokenStorage.clearTokens();
        } catch {
          // Ignore storage cleanup error
        }

        this.notifySessionExpired();

        if (typeof completeLogoutSession === 'function') {
          completeLogoutSession();
        }
        activeLogoutPromise = null;
      }
    };

    activeLogoutPromise = runLogout();
    return activeLogoutPromise;
  },
};
