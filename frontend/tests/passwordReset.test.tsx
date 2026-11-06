import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import ForgotPasswordScreen from '../app/(auth)/forgot-password';
import ResetPasswordScreen from '../app/(auth)/reset-password';
import { authService } from '../services/auth/authService';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => ({ token: 'mock-reset-token-123' }),
}));

jest.mock('../services/auth/authService', () => ({
  authService: {
    requestPasswordReset: jest.fn(),
    confirmPasswordReset: jest.fn(),
    logout: jest.fn(),
    onSessionExpired: jest.fn(() => jest.fn()),
  },
}));

describe('Forgot Password Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders enrollment input and submit button', () => {
    render(<ForgotPasswordScreen />);
    expect(screen.getByTestId('enrollment-input')).toBeTruthy();
    expect(screen.getByTestId('submit-button')).toBeTruthy();
  });

  it('displays validation error when enrollment format is invalid', async () => {
    render(<ForgotPasswordScreen />);
    const input = screen.getByTestId('enrollment-input');
    const submitBtn = screen.getByTestId('submit-button');

    fireEvent.changeText(input, 'INVALID_FORMAT');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('enrollment-error')).toBeTruthy();
    });
    expect(authService.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('submits valid enrollment and renders success message without revealing account existence', async () => {
    (authService.requestPasswordReset as jest.Mock).mockResolvedValueOnce({
      detail: 'If an account exists, instructions have been sent.',
    });

    render(<ForgotPasswordScreen />);
    const input = screen.getByTestId('enrollment-input');
    const submitBtn = screen.getByTestId('submit-button');

    fireEvent.changeText(input, 'AP/1234/2020');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(authService.requestPasswordReset).toHaveBeenCalledWith('AP/1234/2020');
      expect(screen.getByTestId('success-card')).toBeTruthy();
    });
  });
});

describe('Reset Password Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders token input prefilled from params and password fields', () => {
    render(<ResetPasswordScreen />);
    const tokenInput = screen.getByTestId('token-input');
    expect(tokenInput.props.value).toBe('mock-reset-token-123');
    expect(screen.getByTestId('new-password-input')).toBeTruthy();
    expect(screen.getByTestId('confirm-password-input')).toBeTruthy();
  });

  it('toggles password visibility', () => {
    render(<ResetPasswordScreen />);
    const newPasswordInput = screen.getByTestId('new-password-input');
    const toggleBtn = screen.getByTestId('toggle-password-visibility');

    expect(newPasswordInput.props.secureTextEntry).toBe(true);
    fireEvent.press(toggleBtn);
    expect(newPasswordInput.props.secureTextEntry).toBe(false);
  });

  it('validates password mismatch before calling service', async () => {
    render(<ResetPasswordScreen />);
    const newPass = screen.getByTestId('new-password-input');
    const confirmPass = screen.getByTestId('confirm-password-input');
    const submitBtn = screen.getByTestId('submit-button');

    fireEvent.changeText(newPass, 'StrongPass123!');
    fireEvent.changeText(confirmPass, 'DifferentPass456!');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('confirm-password-error')).toBeTruthy();
    });
    expect(authService.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('submits valid password reset and displays success state', async () => {
    (authService.confirmPasswordReset as jest.Mock).mockResolvedValueOnce({
      detail: 'Password has been reset successfully.',
    });

    render(<ResetPasswordScreen />);
    const newPass = screen.getByTestId('new-password-input');
    const confirmPass = screen.getByTestId('confirm-password-input');
    const submitBtn = screen.getByTestId('submit-button');

    fireEvent.changeText(newPass, 'StrongPassword123!');
    fireEvent.changeText(confirmPass, 'StrongPassword123!');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(authService.confirmPasswordReset).toHaveBeenCalledWith({
        token: 'mock-reset-token-123',
        newPassword: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!',
      });
      expect(screen.getByTestId('success-card')).toBeTruthy();
      expect(screen.getByTestId('return-to-login-button')).toBeTruthy();
    });
  });
});
