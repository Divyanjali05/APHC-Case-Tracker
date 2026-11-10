import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import LoginScreen from '../app/(auth)/login';
import { decodeJwtRole, normalizeLoginIdentifier } from '../features/auth/AuthContext';
import { apiClient } from '../services/api/client';
import { tokenStorage } from '../services/auth/tokenStorage';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('../services/auth/tokenStorage', () => ({
  tokenStorage: {
    saveTokens: jest.fn().mockResolvedValue(undefined),
    saveUserEnrollment: jest.fn().mockResolvedValue(undefined),
    saveRememberedIdentifier: jest.fn().mockResolvedValue(undefined),
    clearRememberedIdentifier: jest.fn().mockResolvedValue(undefined),
    getRememberedIdentifier: jest.fn().mockResolvedValue(null),
    saveUserSnapshot: jest.fn().mockResolvedValue(undefined),
    clearUserSnapshot: jest.fn().mockResolvedValue(undefined),
    getUserSnapshot: jest.fn().mockResolvedValue(null),
    getAccessToken: jest.fn().mockResolvedValue(null),
    getRefreshToken: jest.fn().mockResolvedValue(null),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    isDemoMode: jest.fn().mockResolvedValue(false),
    setDemoMode: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('Login Experience & Role-Based Routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('decodes role claim from JWT payload accurately and rejects malformed tokens', () => {
    const adminPayload = Buffer.from(
      JSON.stringify({ user_id: 1, role: 'ADMIN' })
    ).toString('base64url');
    const advocatePayload = Buffer.from(
      JSON.stringify({ user_id: 2, role: 'ADVOCATE' })
    ).toString('base64url');

    expect(decodeJwtRole(`hdr.${adminPayload}.sig`)).toBe('ADMIN');
    expect(decodeJwtRole(`hdr.${advocatePayload}.sig`)).toBe('ADVOCATE');
    expect(decodeJwtRole('invalid-token')).toBeNull();

    expect(normalizeLoginIdentifier('  ap/8888/2021  ')).toBe('AP/8888/2021');
    expect(normalizeLoginIdentifier('  admin  ')).toBe('admin');
  });

  it('toggles password visibility via eye icon button', () => {
    render(<LoginScreen />);
    const passwordInput = screen.getByTestId('password-input');
    const toggleBtn = screen.getByTestId('toggle-password-visibility');

    expect(passwordInput.props.secureTextEntry).toBe(true);
    fireEvent.press(toggleBtn);
    expect(passwordInput.props.secureTextEntry).toBe(false);
    fireEvent.press(toggleBtn);
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });

  it('routes authenticated ADMIN login using username to /admin and stores remembered identifier safely without password', async () => {
    const postSpy = jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        access: 'admin.jwt.token',
        refresh: 'admin.refresh.token',
        user: {
          id: 1,
          username: 'admin',
          email: 'admin@aphc.in',
          first_name: 'System',
          last_name: 'Admin',
          full_name: 'System Admin',
          role: 'ADMIN',
          is_admin: true,
          is_active: true,
          is_staff: true,
          is_superuser: true,
          profile: null,
        },
      },
      status: 200,
    });

    render(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId('enrollment-input'), 'admin');
    fireEvent.changeText(screen.getByTestId('password-input'), 'AdminPass123!');
    fireEvent.press(screen.getByTestId('remember-me-toggle'));
    fireEvent.press(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(tokenStorage.saveRememberedIdentifier).toHaveBeenCalledWith('admin');
      expect(tokenStorage.saveRememberedIdentifier).not.toHaveBeenCalledWith(
        'AdminPass123!'
      );
      expect(mockReplace).toHaveBeenCalledWith('/admin');
    });

    postSpy.mockRestore();
  });

  it('routes authenticated ADVOCATE login to /(tabs)', async () => {
    const postSpy = jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        access: 'adv.jwt.token',
        refresh: 'adv.refresh.token',
        user: {
          id: 2,
          username: 'AP/8888/2021',
          email: 'adv@aphc.in',
          first_name: 'Lakshmi',
          last_name: 'Rao',
          full_name: 'Lakshmi Rao',
          role: 'ADVOCATE',
          is_admin: false,
          is_active: true,
          is_staff: false,
          is_superuser: false,
          profile: {
            id: 1,
            bar_council_enrollment_number: 'AP/8888/2021',
            phone_number: '',
            chamber_address: '',
            role: 'ASSOCIATE',
            preferred_language: 'en',
            is_verified: true,
            created_at: '',
            updated_at: '',
          },
        },
      },
      status: 200,
    });

    render(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId('enrollment-input'), 'ap/8888/2021');
    fireEvent.changeText(screen.getByTestId('password-input'), 'AdvocatePass123!');
    fireEvent.press(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/auth/token/', {
        username: 'AP/8888/2021',
        password: 'AdvocatePass123!',
      });
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });

    postSpy.mockRestore();
  });
});
