import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { CalendarDayView } from '../../components/calendar/CalendarDayView';
import { CalendarHeader } from '../../components/calendar/CalendarHeader';
import { CalendarMonthView } from '../../components/calendar/CalendarMonthView';
import { CalendarSyncModal } from '../../components/calendar/CalendarSyncModal';
import { CalendarWeekView } from '../../components/calendar/CalendarWeekView';
import { EventDetailModal } from '../../components/calendar/EventDetailModal';
import { PersonalReminderModal } from '../../components/calendar/PersonalReminderModal';
import { LoadingIndicator } from '../../components/common/LoadingIndicator';
import { ScreenContainer } from '../../components/common/ScreenContainer';
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

  // Navigation handlers
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

  // Event handlers
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
      refetch();
    } catch {
      Alert.alert(t('common.error', 'Error'), 'Failed to update reminder status.');
    }
  };

  const handleSaveReminder = async (payload: CreatePersonalReminderPayload) => {
    await createReminderMutation.mutateAsync(payload);
    refetch();
  };

  const handleConnectSync = async (payload: CalendarSyncConnectPayload) => {
    await connectSyncMutation.mutateAsync(payload);
  };

  const handleTriggerSync = async () => {
    const res = await triggerSyncMutation.mutateAsync();
    Alert.alert(
      t('calendar.sync_complete', 'Sync Complete'),
      res.message || 'Events synchronized successfully.'
    );
  };

  const handleDisconnectSync = async () => {
    await disconnectSyncMutation.mutateAsync();
    Alert.alert(
      t('calendar.disconnected', 'Disconnected'),
      'External calendar synchronization disabled.'
    );
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
      Alert.alert(t('common.error', 'Error'), 'Failed to download iCalendar export.');
    }
  };

  return (
    <ScreenContainer testID="calendar-screen">
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
        <View style={styles.centerContainer}>
          <LoadingIndicator />
        </View>
      ) : error && !agenda ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>
            {t('calendar.load_error', 'Failed to load calendar agenda.')}
          </Text>
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
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    textAlign: 'center',
  },
});

