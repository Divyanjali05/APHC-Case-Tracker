import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { Button } from '../components/Button';
import { ScreenContainer } from '../components/ScreenContainer';
import { Text } from 'react-native';

describe('UI Components', () => {
  it('renders Button correctly and responds to press', () => {
    const onPressMock = jest.fn();
    render(<Button title="Test Button" onPress={onPressMock} testID="sample-button" />);

    const button = screen.getByTestId('sample-button');
    expect(screen.getByText('Test Button')).toBeTruthy();

    fireEvent.press(button);
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('disables Button when disabled prop is true', () => {
    const onPressMock = jest.fn();
    render(
      <Button
        title="Disabled Button"
        onPress={onPressMock}
        disabled={true}
        testID="disabled-button"
      />
    );

    const button = screen.getByTestId('disabled-button');
    fireEvent.press(button);
    expect(onPressMock).not.toHaveBeenCalled();
  });

  it('renders ScreenContainer with children', () => {
    render(
      <ScreenContainer testID="custom-screen">
        <Text>Screen Content</Text>
      </ScreenContainer>
    );

    expect(screen.getByTestId('custom-screen')).toBeTruthy();
    expect(screen.getByText('Screen Content')).toBeTruthy();
  });
});
