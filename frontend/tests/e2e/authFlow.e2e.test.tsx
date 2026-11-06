import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../../app/(auth)/login';
import { apiClient } from '../../services/api/client';
import { tokenStorage } from '../../services/auth/tokenStorage';
import { authService } from '../../services/auth/authService';
import { ENDPOINTS } from '../../services/api/endpoints';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('../../services/auth/tokenStorage', () => ({
  tokenStorage: {
    saveTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
    clearTokens: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('E2E Flow 1: Authentication Workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1.1 App launches and renders the complete login screen interface', () => {
    const { getByTestId } = render(<LoginScreen />);

    expect(getByTestId('login-screen')).toBeTruthy();
    expect(getByTestId('enrollment-input')).toBeTruthy();
    expect(getByTestId('password-input')).toBeTruthy();
    expect(getByTestId('login-submit-button')).toBeTruthy();
    expect(getByTestId('forgot-password-link')).toBeTruthy();
  });

  it('1.2 Empty credentials submission displays field validation errors and halts login', async () => {
    const { getByTestId, findByText } = render(<LoginScreen />);

    fireEvent.press(getByTestId('login-submit-button'));

    const enrollmentError = await findByText('Enrollment number is required');
    const passwordError = await findByText('Password must be at least 6 characters');

    expect(enrollmentError).toBeTruthy();
    expect(passwordError).toBeTruthy();
    expect(tokenStorage.saveTokens).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('1.3 Failed login with invalid credentials displays error banner and preserves unauthenticated state', async () => {
    jest.spyOn(apiClient, 'post').mockRejectedValueOnce({
      response: {
        status: 401,
        data: { detail: 'No active account found with the given credentials' },
      },
    });

    const { getByTestId, findByText } = render(<LoginScreen />);

    fireEvent.changeText(getByTestId('enrollment-input'), 'AP/0000/2020');
    fireEvent.changeText(getByTestId('password-input'), 'WrongPassword123!');
    fireEvent.press(getByTestId('login-submit-button'));

    const errorBanner = await findByText('auth.invalidCredentials');
    expect(errorBanner).toBeTruthy();
    expect(tokenStorage.saveTokens).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('1.4 Network failure during authentication displays error banner gracefully', async () => {
    jest.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('Network Error'));

    const { getByTestId, findByText } = render(<LoginScreen />);

    fireEvent.changeText(getByTestId('enrollment-input'), 'AP/8888/2021');
    fireEvent.changeText(getByTestId('password-input'), 'ValidPassword123!');
    fireEvent.press(getByTestId('login-submit-button'));

    const errorBanner = await findByText('auth.invalidCredentials');
    expect(errorBanner).toBeTruthy();
    expect(tokenStorage.saveTokens).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('1.5 Successful login persists auth tokens and navigates to the authenticated dashboard', async () => {
    jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        access: 'mock_e2e_jwt_access_token',
        refresh: 'mock_e2e_jwt_refresh_token',
      },
      status: 200,
    });

    const { getByTestId } = render(<LoginScreen />);

    fireEvent.changeText(getByTestId('enrollment-input'), 'AP/8888/2021');
    fireEvent.changeText(getByTestId('password-input'), 'ValidPassword123!');
    fireEvent.press(getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(tokenStorage.saveTokens).toHaveBeenCalledWith(
        'mock_e2e_jwt_access_token',
        'mock_e2e_jwt_refresh_token'
      );
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('1.6 User logout revokes backend refresh session and purges local secure credentials', async () => {
    const mockPost = jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { detail: 'Successfully logged out' },
      status: 200,
    });
    (tokenStorage.getRefreshToken as jest.Mock).mockResolvedValueOnce(
      'active_refresh_token'
    );

    await authService.logout();

    expect(tokenStorage.getRefreshToken).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(ENDPOINTS.AUTH.LOGOUT, {
      refresh: 'active_refresh_token',
    });
    expect(tokenStorage.clearTokens).toHaveBeenCalledTimes(1);

    mockPost.mockRestore();
  });

  it('1.7 Navigation link transitions to forgot-password recovery screen', () => {
    const { getByTestId } = render(<LoginScreen />);

    fireEvent.press(getByTestId('forgot-password-link'));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/forgot-password');
  });
});
