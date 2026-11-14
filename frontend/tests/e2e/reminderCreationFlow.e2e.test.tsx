import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import RemindersScreen from '../../app/(tabs)/reminders';
import {
  useReminders,
  useReminderPreferences,
  useUpdateReminderPreferences,
  useDismissReminder,
  useCreateReminder,
} from '../../features/reminders/hooks';
import { useUpcomingHearings } from '../../features/cases/hooks';
import { ReminderItem, HearingItem, ReminderPreferenceItem } from '../../types';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('../../features/cases/hooks', () => ({
  useUpcomingHearings: jest.fn(),
  useRescheduleHearing: jest.fn(() => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
  })),
}));

jest.mock('../../features/reminders/hooks', () => ({
  useReminders: jest.fn(),
  useReminderPreferences: jest.fn(),
  useUpdateReminderPreferences: jest.fn(),
  useDismissReminder: jest.fn(),
  useCreateReminder: jest.fn(),
}));

const mockHearings: HearingItem[] = [
  {
    id: 501,
    case: 101,
    case_details: {
      id: 101,
      case_type: 'WP',
      case_number: '5501',
      filing_year: 2026,
      petitioner: 'Visakhapatnam Stevedores Association',
      respondent: 'Union of India',
      formatted_case_number: 'WP 5501/2026',
    },
    hearing_date: '2026-11-09',
    hearing_time: '10:30:00',
    court_hall_number: 4,
    item_number: 12,
    status: 'SCHEDULED',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const mockInitialReminders: ReminderItem[] = [
  {
    id: 901,
    case: 101,
    case_details: {
      id: 101,
      case_type: 'WP',
      case_number: '5501',
      filing_year: 2026,
      petitioner: 'Visakhapatnam Stevedores Association',
      respondent: 'Union of India',
      formatted_case_number: 'WP 5501/2026',
    },
    hearing: 501,
    title: 'Friday Hearing Reminder: WP 5501/2026',
    description:
      'Upcoming Monday court appearance on 09 Nov 2026 at 10:30 AM in Court Hall 4.',
    reminder_type: 'HEARING',
    reminder_interval_hours: 72,
    status: 'PENDING',
    due_date: '2026-11-06T10:30:00Z',
    is_completed: false,
    created_at: '2026-11-02T10:00:00Z',
    updated_at: '2026-11-02T10:00:00Z',
  },
  {
    id: 902,
    case: 101,
    case_details: {
      id: 101,
      case_type: 'WP',
      case_number: '5501',
      filing_year: 2026,
      petitioner: 'Visakhapatnam Stevedores Association',
      respondent: 'Union of India',
      formatted_case_number: 'WP 5501/2026',
    },
    hearing: 501,
    title: 'Hearing in 24 Hours: WP 5501/2026',
    description: 'Appearance scheduled for 09 Nov 2026 at 10:30 AM.',
    reminder_type: 'HEARING',
    reminder_interval_hours: 24,
    status: 'PENDING',
    due_date: '2026-11-08T10:30:00Z',
    is_completed: false,
    created_at: '2026-11-02T10:00:00Z',
    updated_at: '2026-11-02T10:00:00Z',
  },
  {
    id: 903,
    case: 101,
    case_details: {
      id: 101,
      case_type: 'WP',
      case_number: '5501',
      filing_year: 2026,
      petitioner: 'Visakhapatnam Stevedores Association',
      respondent: 'Union of India',
      formatted_case_number: 'WP 5501/2026',
    },
    hearing: 501,
    title: 'Hearing in 1 Hour: WP 5501/2026',
    description: 'Court session commencing soon.',
    reminder_type: 'HEARING',
    reminder_interval_hours: 1,
    status: 'PENDING',
    due_date: '2026-11-09T09:30:00Z',
    is_completed: false,
    created_at: '2026-11-02T10:00:00Z',
    updated_at: '2026-11-02T10:00:00Z',
  },
];

const mockPreferences: ReminderPreferenceItem = {
  id: 1,
  remind_24h_before: true,
  remind_1h_before: true,
  email_notifications: false,
  push_notifications: true,
  judgment_push_notifications: true,
  hearing_change_push_notifications: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('E2E Flow 3: Reminder Creation and Listing Workflow', () => {
  const mockRefetchReminders = jest.fn();
  const mockDismissMutate = jest.fn();
  const mockCreateMutateAsync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useUpcomingHearings as jest.Mock).mockReturnValue({
      data: mockHearings,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });

    (useReminders as jest.Mock).mockReturnValue({
      data: mockInitialReminders,
      isLoading: false,
      isError: false,
      refetch: mockRefetchReminders,
      isRefetching: false,
    });

    (useReminderPreferences as jest.Mock).mockReturnValue({
      data: mockPreferences,
      isLoading: false,
    });

    (useUpdateReminderPreferences as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
    });

    (useDismissReminder as jest.Mock).mockReturnValue({
      mutate: mockDismissMutate,
    });

    (useCreateReminder as jest.Mock).mockReturnValue({
      mutateAsync: mockCreateMutateAsync,
      isPending: false,
    });
  });

  it('3.1 User navigates to Compliance Diary tab and sees existing 72h Friday, 24h, and 1h reminders', () => {
    render(<RemindersScreen />);

    // Switch to REMINDERS tab
    fireEvent.press(screen.getByTestId('tab-compliance-reminders'));

    // Check list rendered
    expect(screen.getByTestId('reminders-list')).toBeTruthy();
    expect(screen.getByTestId('new-reminder-button')).toBeTruthy();

    // Verify 72h Friday reminder, 24h, and 1h reminders are present
    expect(screen.getByTestId('reminder-item-901')).toBeTruthy();
    expect(screen.getByTestId('reminder-interval-901')).toBeTruthy();
    expect(screen.getByText('72h')).toBeTruthy();
    expect(screen.getByText('Friday Hearing Reminder: WP 5501/2026')).toBeTruthy();

    expect(screen.getByTestId('reminder-item-902')).toBeTruthy();
    expect(screen.getByText('24h')).toBeTruthy();

    expect(screen.getByTestId('reminder-item-903')).toBeTruthy();
    expect(screen.getByText('1h')).toBeTruthy();
  });

  it('3.2 Opens Create Reminder Modal when tapping "+ New Reminder"', () => {
    render(<RemindersScreen />);
    fireEvent.press(screen.getByTestId('tab-compliance-reminders'));

    fireEvent.press(screen.getByTestId('new-reminder-button'));

    expect(screen.getByTestId('create-reminder-modal')).toBeTruthy();
    expect(screen.getByTestId('create-reminder-heading')).toBeTruthy();
    expect(screen.getByTestId('reminder-title-input')).toBeTruthy();
    expect(screen.getByTestId('reminder-description-input')).toBeTruthy();
    expect(screen.getByTestId('reminder-due-date-input')).toBeTruthy();
    expect(screen.getByTestId('reminder-submit-btn')).toBeTruthy();
  });

  it('3.3 Submits a valid manual compliance reminder and invokes backend mutation', async () => {
    mockCreateMutateAsync.mockResolvedValueOnce({
      id: 999,
      title: 'Submit Vakalatnama & Batta',
      description: 'Pay process fee in Registry counter 2',
      reminder_type: 'BATTA',
      due_date: '2026-11-20T10:30:00Z',
      status: 'PENDING',
    });

    render(<RemindersScreen />);
    fireEvent.press(screen.getByTestId('tab-compliance-reminders'));
    fireEvent.press(screen.getByTestId('new-reminder-button'));

    fireEvent.changeText(
      screen.getByTestId('reminder-title-input'),
      'Submit Vakalatnama & Batta'
    );
    fireEvent.changeText(
      screen.getByTestId('reminder-description-input'),
      'Pay process fee in Registry counter 2'
    );
    fireEvent.changeText(screen.getByTestId('reminder-due-date-input'), '2026-11-20');
    fireEvent.press(screen.getByTestId('reminder-type-batta'));

    fireEvent.press(screen.getByTestId('reminder-submit-btn'));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        title: 'Submit Vakalatnama & Batta',
        description: 'Pay process fee in Registry counter 2',
        due_date: '2026-11-20T10:30:00Z',
        reminder_type: 'BATTA',
        case: null,
        hearing: null,
      });
    });
  });

  it('3.4 Displays error banner when required fields are missing', async () => {
    render(<RemindersScreen />);
    fireEvent.press(screen.getByTestId('tab-compliance-reminders'));
    fireEvent.press(screen.getByTestId('new-reminder-button'));

    // Submit with empty title
    fireEvent.press(screen.getByTestId('reminder-submit-btn'));

    expect(screen.getByTestId('reminder-error-banner')).toBeTruthy();
    expect(screen.getByText('Title is required.')).toBeTruthy();
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  it('3.5 Displays API error banner when backend rejects duplicate or invalid submission', async () => {
    mockCreateMutateAsync.mockRejectedValueOnce({
      response: {
        data: {
          detail: 'An active reminder for this hearing and interval already exists.',
        },
      },
    });

    render(<RemindersScreen />);
    fireEvent.press(screen.getByTestId('tab-compliance-reminders'));
    fireEvent.press(screen.getByTestId('new-reminder-button'));

    fireEvent.changeText(
      screen.getByTestId('reminder-title-input'),
      'Duplicate Hearing Reminder'
    );
    fireEvent.changeText(screen.getByTestId('reminder-due-date-input'), '2026-11-06');

    fireEvent.press(screen.getByTestId('reminder-submit-btn'));

    const errorMsg = await screen.findByText(
      'An active reminder for this hearing and interval already exists.'
    );
    expect(errorMsg).toBeTruthy();
  });

  it('3.6 Refresh control triggers reminder refetch query', () => {
    render(<RemindersScreen />);
    fireEvent.press(screen.getByTestId('tab-compliance-reminders'));

    const list = screen.getByTestId('reminders-list');
    const { refreshControl } = list.props;
    refreshControl.props.onRefresh();

    expect(mockRefetchReminders).toHaveBeenCalledTimes(1);
  });

  it('3.7 User can dismiss an active reminder, invoking dismiss mutation', () => {
    render(<RemindersScreen />);
    fireEvent.press(screen.getByTestId('tab-compliance-reminders'));

    // Tap dismiss on reminder 901
    fireEvent.press(screen.getByTestId('reminder-dismiss-btn-901'));

    expect(mockDismissMutate).toHaveBeenCalledWith(901);
  });
});
