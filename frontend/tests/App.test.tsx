import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Button } from '../components/common/Button';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { Badge } from '../components/common/Badge';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';

describe('Common UI Components', () => {
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

  it('renders Badge with correct label and variant', () => {
    render(<Badge label="Active" variant="success" />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('renders Card with children', () => {
    render(
      <Card testID="test-card">
        <Text>Card Content</Text>
      </Card>
    );
    expect(screen.getByTestId('test-card')).toBeTruthy();
    expect(screen.getByText('Card Content')).toBeTruthy();
  });

  it('renders EmptyState with title, description, and action button', () => {
    const onActionMock = jest.fn();
    render(
      <EmptyState
        title="No Items"
        description="Please check back later."
        actionLabel="Refresh"
        onAction={onActionMock}
        testID="empty-state-view"
      />
    );

    expect(screen.getByText('No Items')).toBeTruthy();
    expect(screen.getByText('Please check back later.')).toBeTruthy();
    const actionBtn = screen.getByText('Refresh');
    fireEvent.press(actionBtn);
    expect(onActionMock).toHaveBeenCalledTimes(1);
  });
});
