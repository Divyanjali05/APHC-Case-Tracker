import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { CalendarDayView } from '../../components/calendar/CalendarDayView';
import { CalendarHeader } from '../../components/calendar/CalendarHeader';
import { CalendarMonthView } from '../../components/calendar/CalendarMonthView';
import { CalendarSyncModal } from '../../components/calendar/CalendarSyncModal';
import { CalendarWeekView } from '../../components/calendar/CalendarWeekView';
import { EventDetailModal } from '../../components/calendar/EventDetailModal';
import { PersonalReminderModal } from '../../components/calendar/PersonalReminderModal';
import { SkeletonCard } from '../../components/common/SkeletonCard';
import { ErrorState } from '../../components/common/ErrorState';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { useToast } from '../../components/common/Toast';
import { Spacing } from '../../constants/theme';
import {
  useCalendarSyncStatus,
  useConnectCalendarSync,
  useCreatePersonalReminder,
  useDailyAgenda,
  useDisconnectCalendarSync,
  useTriggerCalendarSync,
  useUpdatePersonalReminder,
} from '../../features/calendar/hooks';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import {
  AgendaEventUnion,
  AgendaReminderItem,
  CalendarSyncConnectPayload,
  CalendarViewType,
  CreatePersonalReminderPayload,
} from '../../types';

export default function CalendarScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const { showToast } = useToast();

  const getTodayStr = () => new Date().toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [currentView, setCurrentView] = useState<CalendarViewType>('day');

  // Modals
  const [selectedEvent, setSelectedEvent] = useState<AgendaEventUnion | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [addReminderVisible, setAddReminderVisible] = useState(false);
  const [syncModalVisible, setSyncModalVisible] = useState(false);

  // Queries & Mutations
  const {
    data: agenda,
    isLoading,
    error,
    refetch,
  } = useDailyAgenda({
    date: selectedDate,
    view: currentView,
  });

  const { data: syncSetting } = useCalendarSyncStatus();
  const createReminderMutation = useCreatePersonalReminder();
  const updateReminderMutation = useUpdatePersonalReminder();
  const connectSyncMutation = useConnectCalendarSync();
  const triggerSyncMutation = useTriggerCalendarSync();
  const disconnectSyncMutation = useDisconnectCalendarSync();

  const handlePrev = () => {
    const cur = new Date(selectedDate);
    if (currentView === 'day') {
      cur.setDate(cur.getDate() - 1);
    } else if (currentView === 'week') {
      cur.setDate(cur.getDate() - 7);
    } else if (currentView === 'month') {
      cur.setMonth(cur.getMonth() - 1);
    }
    setSelectedDate(cur.toISOString().split('T')[0]);
  };

  const handleNext = () => {
    const cur = new Date(selectedDate);
    if (currentView === 'day') {
      cur.setDate(cur.getDate() + 1);
    } else if (currentView === 'week') {
      cur.setDate(cur.getDate() + 7);
    } else if (currentView === 'month') {
      cur.setMonth(cur.getMonth() + 1);
    }
    setSelectedDate(cur.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setSelectedDate(getTodayStr());
  };

  const handleSelectEvent = (event: AgendaEventUnion) => {
    setSelectedEvent(event);
    setDetailModalVisible(true);
  };

  const handleToggleCompleteReminder = async (reminder: AgendaReminderItem) => {
    try {
      await updateReminderMutation.mutateAsync({
        id: reminder.id,
        data: {
          is_completed: !reminder.is_completed,
        },
      });
      showToast(
        !reminder.is_completed ? 'Reminder marked as complete.' : 'Reminder reopened.',
        'success'
      );
      refetch();
    } catch {
      showToast('Failed to update reminder status.', 'error');
    }
  };

  const handleSaveReminder = async (payload: CreatePersonalReminderPayload) => {
    await createReminderMutation.mutateAsync(payload);
    showToast('Personal reminder added to diary.', 'success');
    refetch();
  };

  const handleConnectSync = async (payload: CalendarSyncConnectPayload) => {
    await connectSyncMutation.mutateAsync(payload);
    showToast('External calendar connected.', 'success');
  };

  const handleTriggerSync = async () => {
    const res = await triggerSyncMutation.mutateAsync();
    showToast(res.message || 'Events synchronized successfully.', 'success');
  };

  const handleDisconnectSync = async () => {
    await disconnectSyncMutation.mutateAsync();
    showToast('External calendar synchronization disabled.', 'info');
  };

  const handleExportIcs = async () => {
    try {
      if (Platform.OS === 'web') {
        const baseURL = apiClient.defaults.baseURL || 'http://127.0.0.1:8000/api';
        const exportUrl = `${baseURL}${ENDPOINTS.CALENDAR.EXPORT_ICS}`;
        window.open(exportUrl, '_blank');
      } else {
        const baseURL = apiClient.defaults.baseURL || 'http://127.0.0.1:8000/api';
        const exportUrl = `${baseURL}${ENDPOINTS.CALENDAR.EXPORT_ICS}`;
        const canOpen = await Linking.canOpenURL(exportUrl);
        if (canOpen) {
          await Linking.openURL(exportUrl);
        } else {
          Alert.alert(
            t('calendar.export_ready', 'Export Ready'),
            `Download URL: ${exportUrl}`
          );
        }
      }
    } catch {
      showToast('Failed to download iCalendar export.', 'error');
    }
  };

  return (
    <ScreenContainer testID="calendar-screen">
      <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
        {/* Header with View Switcher & Nav */}
        <CalendarHeader
          currentView={currentView}
          onViewChange={setCurrentView}
          selectedDate={selectedDate}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
          onOpenAddReminder={() => setAddReminderVisible(true)}
          onOpenSync={() => setSyncModalVisible(true)}
        />

        {/* Main Content Area */}
        {isLoading && !agenda ? (
          <View style={styles.stateContainer} testID="calendar-loading-skeleton">
            <SkeletonCard variant="card" count={2} />
          </View>
        ) : error && !agenda ? (
          <View style={styles.stateContainer}>
            <ErrorState
              title={t('calendar.load_error', 'Failed to load calendar agenda.')}
              message="Unable to synchronize court calendar and reminders."
              retryLabel={t('common.retry', 'Retry')}
              onRetry={() => refetch()}
              testID="calendar-error-state"
            />
          </View>
        ) : agenda ? (
          currentView === 'day' ? (
            <CalendarDayView
              agenda={agenda}
              onSelectEvent={handleSelectEvent}
              onToggleCompleteReminder={handleToggleCompleteReminder}
            />
          ) : currentView === 'week' ? (
            <CalendarWeekView
              agenda={agenda}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onSelectEvent={handleSelectEvent}
            />
          ) : (
            <CalendarMonthView
              agenda={agenda}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onSelectEvent={handleSelectEvent}
            />
          )
        ) : null}
      </View>

      {/* Modals */}
      <EventDetailModal
        visible={detailModalVisible}
        event={selectedEvent}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedEvent(null);
        }}
      />

      <PersonalReminderModal
        visible={addReminderVisible}
        selectedDate={selectedDate}
        onClose={() => setAddReminderVisible(false)}
        onSave={handleSaveReminder}
        isSaving={createReminderMutation.isPending}
      />

      <CalendarSyncModal
        visible={syncModalVisible}
        syncSetting={syncSetting}
        onClose={() => setSyncModalVisible(false)}
        onConnect={handleConnectSync}
        onTriggerSync={handleTriggerSync}
        onDisconnect={handleDisconnectSync}
        onExportIcs={handleExportIcs}
        isConnecting={connectSyncMutation.isPending}
        isSyncing={triggerSyncMutation.isPending}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    width: '100%',
  },
  desktopContainer: {
    maxWidth: 1120,
    alignSelf: 'center',
    width: '100%',
  },
  stateContainer: {
    paddingTop: Spacing.md,
  },
});
