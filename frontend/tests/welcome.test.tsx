import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import WelcomeScreen from '../app/index';
import { useAuth } from '../features/auth/AuthContext';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('../features/auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

describe('Public Welcome Landing Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      isDemo: false,
      isLoading: false,
      role: 'ADVOCATE',
      enterDemoMode: jest.fn(),
    });
  });

  it('renders APHC Case Tracker branding, legal pillars, Sign In CTA, and minimal footer without dashboard clutter', () => {
    render(<WelcomeScreen />);

    expect(screen.getByTestId('welcome-screen')).toBeTruthy();
    expect(screen.getByTestId('welcome-logo')).toBeTruthy();
    expect(screen.getByTestId('welcome-legal-visual')).toBeTruthy();
    expect(screen.getByTestId('welcome-signin-button')).toBeTruthy();
    expect(screen.getByTestId('welcome-footer')).toBeTruthy();

    // Ensure main case dashboard widgets are NOT exposed on public landing page
    expect(screen.queryByTestId('stat-total-cases')).toBeNull();
    expect(screen.queryByTestId('dashboard-tokens-card')).toBeNull();
  });

  it('navigates to login and password recovery from public CTAs', () => {
    render(<WelcomeScreen />);

    fireEvent.press(screen.getByTestId('welcome-signin-button'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');

    fireEvent.press(screen.getByTestId('welcome-forgot-link'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/forgot-password');
  });

  it('redirects authenticated ADMIN to /admin workspace automatically', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      isDemo: false,
      isLoading: false,
      role: 'ADMIN',
      enterDemoMode: jest.fn(),
    });

    render(<WelcomeScreen />);
    expect(mockReplace).toHaveBeenCalledWith('/admin');
  });

  it('redirects authenticated ADVOCATE to /(tabs) workspace automatically', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      isDemo: false,
      isLoading: false,
      role: 'ADVOCATE',
      enterDemoMode: jest.fn(),
    });

    render(<WelcomeScreen />);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});
