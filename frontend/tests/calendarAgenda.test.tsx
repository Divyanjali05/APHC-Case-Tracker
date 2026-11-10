import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import CalendarScreen from '../app/(tabs)/calendar';
import { CalendarHeader } from '../components/calendar/CalendarHeader';
import { CalendarDayView } from '../components/calendar/CalendarDayView';
import { CalendarWeekView } from '../components/calendar/CalendarWeekView';
import { CalendarMonthView } from '../components/calendar/CalendarMonthView';
import { EventDetailModal } from '../components/calendar/EventDetailModal';
import { PersonalReminderModal } from '../components/calendar/PersonalReminderModal';
import { CalendarSyncModal } from '../components/calendar/CalendarSyncModal';
import {
  useDailyAgenda,
  useCalendarSyncStatus,
  useCreatePersonalReminder,
  useUpdatePersonalReminder,
  useConnectCalendarSync,
  useTriggerCalendarSync,
  useDisconnectCalendarSync,
} from '../features/calendar/hooks';
import {
  AgendaHearingItem,
  AgendaReminderItem,
  AgendaResponse,
  AgendaTokenItem,
  CalendarSyncSettingItem,
} from '../types';

jest.mock('../features/calendar/hooks');

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('react-i18next', () => {
  const enTranslations = require('../i18n/locales/en.json');
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string) => {
        const parts = key.split('.');
        let current: unknown = enTranslations;
        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) {
            current = (current as Record<string, unknown>)[part];
          } else {
            return fallback || key;
          }
        }
        return typeof current === 'string' ? current : fallback || key;
      },
      i18n: {
        language: 'en',
        changeLanguage: jest.fn(),
      },
    }),
  };
});

const mockHearing: AgendaHearingItem = {
  id: 101,
  event_type: 'HEARING',
  title: 'Hearing: WP 1234/2024',
  case_id: 1,
  case_number: 'WP 1234/2024',
  petitioner: 'K. Srinivas',
  respondent: 'State of Andhra Pradesh',
  court_name: 'High Court of Andhra Pradesh',
  court_hall_number: 4,
  item_number: 5,
  bench: 'Court Hall 04, Single Bench',
  hearing_date: '2026-11-07',
  hearing_time: '10:30:00',
  is_all_day: false,
  status: 'SCHEDULED',
};

const mockReminder: AgendaReminderItem = {
  id: 201,
  event_type: 'REMINDER',
  title: 'Prepare Arguments Note',
  description: 'Review citations for interim prayer',
  case_id: 1,
  case_number: 'WP 1234/2024',
  due_date: '2026-11-07T14:00:00',
  date: '2026-11-07',
  time: '14:00:00',
  reminder_type: 'GENERAL',
  status: 'PENDING',
  is_completed: false,
};

const mockDeadline: AgendaReminderItem = {
  id: 202,
  event_type: 'REMINDER',
  title: 'File Counter Affidavit',
  description: 'Statutory 4 weeks compliance deadline',
  case_id: 1,
  case_number: 'WP 1234/2024',
  due_date: '2026-11-07T16:00:00',
  date: '2026-11-07',
  time: '16:00:00',
  reminder_type: 'FILING',
  status: 'PENDING',
  is_completed: false,
};

const mockToken: AgendaTokenItem = {
  id: 301,
  event_type: 'TOKEN',
  title: 'Token Alert: #45 (Hall 4)',
  token_number: '45',
  item_number: 12,
  court_hall_number: 4,
  court_name: 'High Court of Andhra Pradesh',
  hearing_date: '2026-11-07',
  status: 'APPROACHING',
  items_remaining: 3,
};

const mockAgendaData: AgendaResponse = {
  view: 'day',
  selected_date: '2026-11-07',
  start_date: '2026-11-07',
  end_date: '2026-11-07',
  timezone: 'Asia/Kolkata',
  summary: {
    total_events: 4,
    today_hearings: 1,
    upcoming_hearings: 1,
    pending_reminders: 2,
    completed_events: 0,
  },
  today_hearings: [mockHearing],
  upcoming_hearings: [mockHearing],
  reminders: [mockReminder],
  compliance_deadlines: [mockDeadline],
  token_events: [mockToken],
  events_by_date: {
    '2026-11-07': [mockHearing, mockDeadline, mockReminder, mockToken],
  },
};

const mockEmptyAgendaData: AgendaResponse = {
  view: 'day',
  selected_date: '2026-11-07',
  start_date: '2026-11-07',
  end_date: '2026-11-07',
  timezone: 'Asia/Kolkata',
  summary: {
    total_events: 0,
    today_hearings: 0,
    upcoming_hearings: 0,
    pending_reminders: 0,
    completed_events: 0,
  },
  today_hearings: [],
  upcoming_hearings: [],
  reminders: [],
  compliance_deadlines: [],
  token_events: [],
  events_by_date: {},
};

const mockSyncSetting: CalendarSyncSettingItem = {
  sync_enabled: true,
  provider: 'GOOGLE',
  google_account_email: 'advocate.ap@gmail.com',
  sync_hearing_reminders: true,
  sync_compliance_deadlines: true,
  sync_personal_reminders: true,
  sync_status: 'SUCCESS',
  last_synced_at: '2026-11-07T12:00:00Z',
  sync_error: '',
  updated_at: '2026-11-07T12:00:00Z',
};

describe('Calendar & Daily Agenda System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. CalendarHeader view switching
  it('renders calendar header and switches between day, week, and month views', () => {
    const onViewChange = jest.fn();
    render(
      <CalendarHeader
        currentView="day"
        onViewChange={onViewChange}
        selectedDate="2026-11-07"
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onToday={jest.fn()}
        onOpenAddReminder={jest.fn()}
        onOpenSync={jest.fn()}
      />
    );

    expect(screen.getByTestId('calendar-header')).toBeTruthy();
    expect(screen.getByTestId('view-tab-day')).toBeTruthy();
    expect(screen.getByTestId('view-tab-week')).toBeTruthy();
    expect(screen.getByTestId('view-tab-month')).toBeTruthy();

    fireEvent.press(screen.getByTestId('view-tab-week'));
    expect(onViewChange).toHaveBeenCalledWith('week');

    fireEvent.press(screen.getByTestId('view-tab-month'));
    expect(onViewChange).toHaveBeenCalledWith('month');
  });

  // 2. CalendarHeader navigation buttons
  it('triggers navigation controls in calendar header', () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();
    const onToday = jest.fn();
    const onOpenAddReminder = jest.fn();
    const onOpenSync = jest.fn();

    render(
      <CalendarHeader
        currentView="day"
        onViewChange={jest.fn()}
        selectedDate="2026-11-07"
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        onOpenAddReminder={onOpenAddReminder}
        onOpenSync={onOpenSync}
      />
    );

    fireEvent.press(screen.getByTestId('nav-prev-btn'));
    expect(onPrev).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('nav-today-btn'));
    expect(onToday).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('nav-next-btn'));
    expect(onNext).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('add-reminder-btn'));
    expect(onOpenAddReminder).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('open-sync-btn'));
    expect(onOpenSync).toHaveBeenCalledTimes(1);
  });

  // 3. DayView stat badges
  it('renders summary stat counters in day view', () => {
    render(
      <CalendarDayView
        agenda={mockAgendaData}
        onSelectEvent={jest.fn()}
        onToggleCompleteReminder={jest.fn()}
      />
    );

    expect(screen.getByText('Hearings')).toBeTruthy();
    expect(screen.getByText('Deadlines')).toBeTruthy();
    expect(screen.getByText('Reminders')).toBeTruthy();
    expect(screen.getByText('Tokens')).toBeTruthy();
  });

  // 4. DayView hearings list
  it('renders hearing appearance card with case number, hall and time', () => {
    const onSelectEvent = jest.fn();
    render(<CalendarDayView agenda={mockAgendaData} onSelectEvent={onSelectEvent} />);

    expect(screen.getByTestId('hearing-card-101')).toBeTruthy();
    expect(screen.getAllByText('WP 1234/2024')[0]).toBeTruthy();
    expect(screen.getByText('K. Srinivas v. State of Andhra Pradesh')).toBeTruthy();
    expect(screen.getByText('10:30:00')).toBeTruthy();

    fireEvent.press(screen.getByTestId('hearing-card-101'));
    expect(onSelectEvent).toHaveBeenCalledWith(mockHearing);
  });

  // 5. DayView compliance deadlines
  it('renders compliance deadline card with warning border', () => {
    const onSelectEvent = jest.fn();
    render(<CalendarDayView agenda={mockAgendaData} onSelectEvent={onSelectEvent} />);

    expect(screen.getByTestId('deadline-card-202')).toBeTruthy();
    expect(screen.getByText('File Counter Affidavit')).toBeTruthy();
    expect(screen.getByText('FILING')).toBeTruthy();

    fireEvent.press(screen.getByTestId('deadline-card-202'));
    expect(onSelectEvent).toHaveBeenCalledWith(mockDeadline);
  });

  // 6. DayView personal reminders and completion toggle
  it('renders personal reminder card and triggers completion toggle', () => {
    const onToggleComplete = jest.fn();
    render(
      <CalendarDayView
        agenda={mockAgendaData}
        onSelectEvent={jest.fn()}
        onToggleCompleteReminder={onToggleComplete}
      />
    );

    expect(screen.getByTestId('reminder-card-201')).toBeTruthy();
    expect(screen.getByText('Prepare Arguments Note')).toBeTruthy();
    expect(screen.getByText('Review citations for interim prayer')).toBeTruthy();

    // Toggle completion button
    const toggleBtn = screen.getByTestId('reminder-toggle-201');
    fireEvent.press(toggleBtn);
    expect(onToggleComplete).toHaveBeenCalledWith(mockReminder);
  });

  // 7. DayView empty state
  it('renders empty state when no events exist for the day', () => {
    render(<CalendarDayView agenda={mockEmptyAgendaData} onSelectEvent={jest.fn()} />);

    expect(screen.getByTestId('day-view-empty')).toBeTruthy();
    expect(screen.getByText('No events scheduled for this day')).toBeTruthy();
  });

  // 8. WeekView renders 7 days
  it('renders 7 days in week view strip', () => {
    render(
      <CalendarWeekView
        agenda={mockAgendaData}
        selectedDate="2026-11-07"
        onSelectDate={jest.fn()}
        onSelectEvent={jest.fn()}
      />
    );

    expect(screen.getByTestId('calendar-week-view')).toBeTruthy();
    expect(screen.getByTestId('week-day-2026-11-07')).toBeTruthy();
  });

  // 9. WeekView day selection updates event list
  it('switches active date and renders events for selected day in week view', () => {
    const onSelectDate = jest.fn();
    const onSelectEvent = jest.fn();

    render(
      <CalendarWeekView
        agenda={mockAgendaData}
        selectedDate="2026-11-07"
        onSelectDate={onSelectDate}
        onSelectEvent={onSelectEvent}
      />
    );

    fireEvent.press(screen.getByTestId('week-day-2026-11-07'));
    expect(onSelectDate).toHaveBeenCalledWith('2026-11-07');
    expect(screen.getByTestId('week-event-hearing-101')).toBeTruthy();

    fireEvent.press(screen.getByTestId('week-event-hearing-101'));
    expect(onSelectEvent).toHaveBeenCalledWith(mockHearing);
  });

  // 10. MonthView renders grid cells
  it('renders month view grid with day cells', () => {
    const onSelectDate = jest.fn();
    render(
      <CalendarMonthView
        agenda={mockAgendaData}
        selectedDate="2026-11-07"
        onSelectDate={onSelectDate}
        onSelectEvent={jest.fn()}
      />
    );

    expect(screen.getByTestId('calendar-month-view')).toBeTruthy();
    expect(screen.getByTestId('month-day-2026-11-07')).toBeTruthy();

    fireEvent.press(screen.getByTestId('month-day-2026-11-07'));
    expect(onSelectDate).toHaveBeenCalledWith('2026-11-07');
  });

  // 11. EventDetailModal hearing details & case navigation
  it('displays hearing appearance details and navigates to case', () => {
    const onClose = jest.fn();
    render(<EventDetailModal visible={true} event={mockHearing} onClose={onClose} />);

    expect(screen.getByTestId('event-detail-modal')).toBeTruthy();
    expect(screen.getByText('Hearing: WP 1234/2024')).toBeTruthy();
    expect(screen.getByText('WP 1234/2024')).toBeTruthy();
    expect(screen.getByText('K. Srinivas v. State of Andhra Pradesh')).toBeTruthy();

    fireEvent.press(screen.getByTestId('modal-view-case-btn'));
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/cases/1');
  });

  // 12. EventDetailModal reminder details
  it('displays reminder details in detail modal', () => {
    render(<EventDetailModal visible={true} event={mockReminder} onClose={jest.fn()} />);

    expect(screen.getByText('Prepare Arguments Note')).toBeTruthy();
    expect(screen.getByText('Review citations for interim prayer')).toBeTruthy();
    expect(screen.getByText('GENERAL')).toBeTruthy();
  });

  // 13. EventDetailModal token details
  it('displays court token alert details in modal', () => {
    render(<EventDetailModal visible={true} event={mockToken} onClose={jest.fn()} />);

    expect(screen.getByText('#45')).toBeTruthy();
    expect(screen.getByText('Hall 4')).toBeTruthy();
    expect(screen.getByText('APPROACHING')).toBeTruthy();
    expect(screen.getByText('3 items')).toBeTruthy();
  });

  // 14. PersonalReminderModal validation
  it('validates title field before submitting personal reminder', async () => {
    const onSave = jest.fn();
    render(
      <PersonalReminderModal
        visible={true}
        selectedDate="2026-11-07"
        onClose={jest.fn()}
        onSave={onSave}
      />
    );

    fireEvent.press(screen.getByTestId('save-reminder-btn'));
    expect(screen.getByText('Title is required.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  // 15. PersonalReminderModal submits payload
  it('submits valid reminder payload from modal form', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    render(
      <PersonalReminderModal
        visible={true}
        selectedDate="2026-11-07"
        onClose={onClose}
        onSave={onSave}
      />
    );

    fireEvent.changeText(screen.getByTestId('reminder-title-input'), 'Submit Rejoinder');
    fireEvent.press(screen.getByTestId('reminder-type-filing'));
    fireEvent.changeText(screen.getByTestId('reminder-case-id-input'), '1');

    fireEvent.press(screen.getByTestId('save-reminder-btn'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        title: 'Submit Rejoinder',
        due_date: '2026-11-07T10:30:00',
        reminder_type: 'FILING',
        description: '',
        case_id: 1,
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  // 16. CalendarSyncModal connected actions
  it('renders sync settings modal and allows triggering sync or disconnect', async () => {
    const onTriggerSync = jest.fn().mockResolvedValue(undefined);
    const onDisconnect = jest.fn().mockResolvedValue(undefined);
    const onExportIcs = jest.fn();

    render(
      <CalendarSyncModal
        visible={true}
        syncSetting={mockSyncSetting}
        onClose={jest.fn()}
        onConnect={jest.fn()}
        onTriggerSync={onTriggerSync}
        onDisconnect={onDisconnect}
        onExportIcs={onExportIcs}
      />
    );

    expect(screen.getByTestId('calendar-sync-modal')).toBeTruthy();
    expect(screen.getByText(/advocate\.ap@gmail\.com/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('sync-trigger-btn'));
    expect(onTriggerSync).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('sync-disconnect-btn'));
    expect(onDisconnect).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('export-ics-btn'));
    expect(onExportIcs).toHaveBeenCalledTimes(1);
  });

  // 17. CalendarScreen full integration
  it('renders the complete Calendar tab screen with agenda content', () => {
    (useDailyAgenda as jest.Mock).mockReturnValue({
      data: mockAgendaData,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    (useCalendarSyncStatus as jest.Mock).mockReturnValue({
      data: mockSyncSetting,
    });
    (useCreatePersonalReminder as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    (useUpdatePersonalReminder as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
    });
    (useConnectCalendarSync as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    (useTriggerCalendarSync as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    (useDisconnectCalendarSync as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
    });

    render(<CalendarScreen />);

    expect(screen.getByTestId('calendar-screen')).toBeTruthy();
    expect(screen.getByTestId('calendar-header')).toBeTruthy();
    expect(screen.getByTestId('calendar-day-view')).toBeTruthy();
    expect(screen.getAllByText('WP 1234/2024')[0]).toBeTruthy();
  });
});
