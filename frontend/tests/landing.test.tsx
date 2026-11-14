import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { MainHomePage } from '../components/home/MainHomePage';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

describe('MainHomePage', () => {
  it('renders application branding, tagline, logo, Login and Register buttons', () => {
    render(<MainHomePage />);

    expect(screen.getByTestId('main-home-page')).toBeTruthy();
    expect(screen.getByTestId('landing-logo')).toBeTruthy();
    expect(screen.getByText('APHC Case Tracker')).toBeTruthy();
    expect(screen.getByText('High Court of Andhra Pradesh')).toBeTruthy();
    expect(screen.getByText('Manage Cases. Track Hearings. Stay Informed.')).toBeTruthy();
    expect(screen.getByTestId('landing-login-button')).toBeTruthy();
    expect(screen.getByTestId('landing-register-button')).toBeTruthy();
  });

  it('invokes Login and Register handlers when buttons are pressed', () => {
    const onLoginPress = jest.fn();
    const onRegisterPress = jest.fn();

    render(
      <MainHomePage onLoginPress={onLoginPress} onRegisterPress={onRegisterPress} />
    );

    fireEvent.press(screen.getByTestId('landing-login-button'));
    fireEvent.press(screen.getByTestId('landing-register-button'));

    expect(onLoginPress).toHaveBeenCalledTimes(1);
    expect(onRegisterPress).toHaveBeenCalledTimes(1);
  });
});

