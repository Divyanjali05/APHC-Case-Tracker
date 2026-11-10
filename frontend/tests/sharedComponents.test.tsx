import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ScreenHeader } from '../components/common/ScreenHeader';
import { Input } from '../components/common/Input';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { SkeletonCard } from '../components/common/SkeletonCard';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { AppIcon } from '../components/common/AppIcon';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { ToastProvider, useToast } from '../components/common/Toast';

describe('Shared UI Components (Light Design Foundation)', () => {
  describe('ScreenHeader', () => {
    it('renders title, subtitle, and badge correctly', () => {
      const { getByText, getByTestId } = render(
        <ScreenHeader
          title="Advocate Dashboard"
          subtitle="APHC High Court Docket Tracker"
          badge={<Badge label="APHC AMARAVATI" variant="gold" />}
          testID="custom-header"
        />
      );

      expect(getByText('Advocate Dashboard')).toBeTruthy();
      expect(getByText('APHC High Court Docket Tracker')).toBeTruthy();
      expect(getByText('APHC AMARAVATI')).toBeTruthy();
      expect(getByTestId('custom-header')).toBeTruthy();
    });

    it('renders left and right actions', () => {
      const { getByText } = render(
        <ScreenHeader
          title="Cases"
          leftAction={<Text>Back</Text>}
          rightAction={<Text>Filter</Text>}
        />
      );

      expect(getByText('Back')).toBeTruthy();
      expect(getByText('Filter')).toBeTruthy();
    });
  });

  describe('Input', () => {
    it('renders label, placeholder, and forwards onChangeText', () => {
      const handleChange = jest.fn();
      const { getByPlaceholderText, getByText, getByTestId } = render(
        <Input
          label="Enrollment ID"
          placeholder="AP/1234/2020"
          value=""
          onChangeText={handleChange}
          testID="test-input"
        />
      );

      expect(getByText('Enrollment ID')).toBeTruthy();
      const input = getByPlaceholderText('AP/1234/2020');
      expect(input).toBeTruthy();

      fireEvent.changeText(input, 'AP/8888/2021');
      expect(handleChange).toHaveBeenCalledWith('AP/8888/2021');
      expect(getByTestId('test-input')).toBeTruthy();
    });

    it('renders error state when error message provided', () => {
      const { getByText, getByTestId } = render(
        <Input
          label="Password"
          placeholder="Enter password"
          error="Password is required"
          testID="pwd-input"
        />
      );

      expect(getByText('Password is required')).toBeTruthy();
      expect(getByTestId('pwd-input-error')).toBeTruthy();
    });
  });

  describe('SegmentedControl', () => {
    const options = [
      { value: 'HEARINGS', label: 'Hearings', badge: 3, testID: 'seg-hearings' },
      { value: 'REMINDERS', label: 'Compliance', testID: 'seg-reminders' },
      { value: 'SETTINGS', label: 'Preferences', testID: 'seg-settings' },
    ];

    it('renders options, badges, and invokes onChange on selection', () => {
      const handleChange = jest.fn();
      const { getByText, getByTestId } = render(
        <SegmentedControl
          options={options}
          value="HEARINGS"
          onChange={handleChange}
          testID="test-segmented"
        />
      );

      expect(getByText('Hearings')).toBeTruthy();
      expect(getByText('3')).toBeTruthy();
      expect(getByText('Compliance')).toBeTruthy();

      fireEvent.press(getByTestId('seg-reminders'));
      expect(handleChange).toHaveBeenCalledWith('REMINDERS');
    });
  });

  describe('SkeletonCard', () => {
    it('renders card skeleton variant', () => {
      const { getByTestId } = render(
        <SkeletonCard variant="card" count={2} testID="skeleton-test" />
      );
      expect(getByTestId('skeleton-test')).toBeTruthy();
    });

    it('renders list-item and stat variants', () => {
      const { getByTestId } = render(
        <>
          <SkeletonCard variant="list-item" testID="skeleton-list" />
          <SkeletonCard variant="stat" testID="skeleton-stat" />
        </>
      );
      expect(getByTestId('skeleton-list')).toBeTruthy();
      expect(getByTestId('skeleton-stat')).toBeTruthy();
    });
  });

  describe('Card, Button & Badge Foundations', () => {
    it('renders Card with white surface and elevation styling', () => {
      const { getByText, getByTestId } = render(
        <Card testID="test-card">
          <Text>Card Content</Text>
        </Card>
      );
      expect(getByText('Card Content')).toBeTruthy();
      expect(getByTestId('test-card')).toBeTruthy();
    });

    it('renders Button with variants and loading state', () => {
      const handlePress = jest.fn();
      const { getByText, getByTestId, rerender } = render(
        <Button title="Submit Application" onPress={handlePress} testID="action-btn" />
      );

      fireEvent.press(getByTestId('action-btn'));
      expect(handlePress).toHaveBeenCalled();

      rerender(
        <Button
          title="Submit Application"
          onPress={handlePress}
          loading={true}
          testID="action-btn"
        />
      );
      expect(() => getByText('Submit Application')).toThrow();
    });

    it('renders Badge with all variants', () => {
      const { getByText } = render(
        <>
          <Badge label="Primary" variant="primary" />
          <Badge label="Success" variant="success" />
          <Badge label="Warning" variant="warning" />
          <Badge label="Gold" variant="gold" />
          <Badge label="Danger" variant="danger" />
          <Badge label="Info" variant="info" />
          <Badge label="Secondary" variant="secondary" />
        </>
      );
      expect(getByText('Primary')).toBeTruthy();
      expect(getByText('Success')).toBeTruthy();
      expect(getByText('Warning')).toBeTruthy();
      expect(getByText('Gold')).toBeTruthy();
      expect(getByText('Danger')).toBeTruthy();
      expect(getByText('Info')).toBeTruthy();
      expect(getByText('Secondary')).toBeTruthy();
    });

    it('renders AppIcon Lucide vector component', () => {
      const { getByTestId } = render(
        <AppIcon name="scale" size={24} testID="test-app-icon" />
      );
      expect(getByTestId('test-app-icon')).toBeTruthy();
    });

    it('renders ConfirmDialog and triggers confirm/cancel callbacks', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();
      const { getByText, getByTestId } = render(
        <ConfirmDialog
          visible={true}
          title="Confirm Sign Out"
          message="Are you sure you want to sign out?"
          confirmLabel="Sign Out"
          cancelLabel="Stay"
          destructive={true}
          onConfirm={onConfirm}
          onCancel={onCancel}
          testID="test-confirm-dialog"
        />
      );

      expect(getByText('Confirm Sign Out')).toBeTruthy();
      expect(getByText('Are you sure you want to sign out?')).toBeTruthy();

      fireEvent.press(getByTestId('test-confirm-dialog-cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);

      fireEvent.press(getByTestId('test-confirm-dialog-confirm'));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('renders ToastProvider and shows toast via useToast', () => {
      const TriggerToast = () => {
        const { showToast } = useToast();
        return (
          <Button
            title="Show Toast"
            onPress={() =>
              showToast({
                title: 'Saved',
                message: 'Profile changes saved cleanly.',
                variant: 'success',
              })
            }
            testID="trigger-toast-btn"
          />
        );
      };

      const { getByTestId, getByText } = render(
        <ToastProvider>
          <TriggerToast />
        </ToastProvider>
      );

      fireEvent.press(getByTestId('trigger-toast-btn'));
      expect(getByTestId('app-toast')).toBeTruthy();
      expect(getByText('Saved')).toBeTruthy();
      expect(getByText('Profile changes saved cleanly.')).toBeTruthy();
    });
  });
});
