import React from 'react';
import {
  render,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import RegisterScreen from '../app/(auth)/register';
import { apiClient } from '../services/api/client';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('../services/api/client', () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

const mockedPost = apiClient.post as jest.Mock;

describe('Advocate Registration Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function fillValidForm() {
    fireEvent.changeText(
      screen.getByTestId('register-enrollment-input'),
      'ap/5555/2023'
    );
    fireEvent.changeText(
      screen.getByTestId('register-email-input'),
      'advocate@example.com'
    );
    fireEvent.changeText(screen.getByTestId('register-firstname-input'), 'Rama');
    fireEvent.changeText(screen.getByTestId('register-lastname-input'), 'Krishna');
    fireEvent.changeText(
      screen.getByTestId('register-password-input'),
      'Advocate#Strong2026!'
    );
    fireEvent.changeText(
      screen.getByTestId('register-confirm-password-input'),
      'Advocate#Strong2026!'
    );
  }

  it('displays backend field validation errors correctly without "not enabled" warning', async () => {
    mockedPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          success: false,
          error: {
            code: 'invalid',
            message: {
              enrollment_number: [
                'An advocate account with this Bar Council enrollment number already exists.',
              ],
              email: ['An account with this email address already exists.'],
            },
            status_code: 400,
          },
        },
      },
    });

    render(<RegisterScreen />);
    fillValidForm();
    fireEvent.press(screen.getByTestId('register-submit-button'));

    await waitFor(() => {
      const enrollmentError = screen.getByTestId('register-enrollment-error');
      expect(
        within(enrollmentError).getByText(
          'An advocate account with this Bar Council enrollment number already exists.'
        )
      ).toBeTruthy();
    });

    const emailError = screen.getByTestId('register-email-error');
    expect(
      within(emailError).getByText(
        'An account with this email address already exists.'
      )
    ).toBeTruthy();
    expect(screen.getByTestId('register-error-banner')).toBeTruthy();
    expect(screen.queryByText(/is not enabled/i)).toBeNull();
  }, 15000);

  it('handles network error gracefully', async () => {
    mockedPost.mockRejectedValueOnce({
      isAxiosError: true,
      message: 'Network Error',
    });

    render(<RegisterScreen />);
    fillValidForm();
    fireEvent.press(screen.getByTestId('register-submit-button'));

    await waitFor(() => {
      const errorBanner = screen.getByTestId('register-error-banner');
      expect(
        within(errorBanner).getByText(
          'Unable to reach the server. Please check your connection and try again.'
        )
      ).toBeTruthy();
    });
  });

  it('submits normalized payload, shows confirmed success banner, and navigates to Login', async () => {
    mockedPost.mockResolvedValueOnce({
      status: 201,
      data: {
        detail:
          'Advocate account registered successfully. You can now log in with your Bar Council enrollment number.',
        enrollment_number: 'AP/5555/2023',
        user: {
          id: 42,
          username: 'AP/5555/2023',
          email: 'advocate@example.com',
          profile: {
            bar_council_enrollment_number: 'AP/5555/2023',
            role: 'ASSOCIATE',
          },
        },
      },
    });

    render(<RegisterScreen />);
    fillValidForm();
    fireEvent.press(screen.getByTestId('register-submit-button'));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/auth/register/', {
        enrollment_number: 'AP/5555/2023',
        email: 'advocate@example.com',
        first_name: 'Rama',
        last_name: 'Krishna',
        password: 'Advocate#Strong2026!',
        confirm_password: 'Advocate#Strong2026!',
      });
    });

    await waitFor(() => {
      const successBanner = screen.getByTestId('register-success-banner');
      expect(
        within(successBanner).getByText(/Advocate account registered successfully\./)
      ).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('register-proceed-login-button'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    expect(screen.queryByTestId('register-otp-input')).toBeNull();
  });

  it('rejects invalid AP/XXXX/YYYY enrollment format and mismatched passwords client-side without API call', async () => {
    render(<RegisterScreen />);

    fireEvent.changeText(screen.getByTestId('register-enrollment-input'), 'BAD_ID');
    fireEvent.changeText(screen.getByTestId('register-email-input'), 'adv@example.com');
    fireEvent.changeText(screen.getByTestId('register-password-input'), 'Valid#Pass123');
    fireEvent.changeText(
      screen.getByTestId('register-confirm-password-input'),
      'Mismatch#Pass999'
    );
    fireEvent.press(screen.getByTestId('register-submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('register-enrollment-error')).toBeTruthy();
      expect(screen.getByTestId('register-confirm-password-error')).toBeTruthy();
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });
});
