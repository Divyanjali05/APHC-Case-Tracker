import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AgendaSummaryPanel,
  SummaryCategory,
} from '../../components/calendar/AgendaSummaryPanel';
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
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/theme';
import {
  useCalendarSyncStatus,
  useConnectCalendarSync,
  useCreatePersonalReminder,
  useDailyAgenda,
  useDeletePersonalReminder,
  useDisconnectCalendarSync,
  useTriggerCalendarSync,
  useUpdatePersonalReminder,
} from '../../features/calendar/hooks';
import { useAuth } from '../../features/auth/AuthContext';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import {
  AgendaEventUnion,
  AgendaReminderItem,
  CalendarSyncConnectPayload,
  CalendarViewType,
  CreatePersonalReminderPayload,
} from '../../types';
import { addDaysLocal, addMonthsLocal, getLocalTodayIso } from '../../utils/calendarDate';

export default function CalendarScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const { showToast } = useToast();

  // Always initialize from the user's actual local date (never UTC-shifted)
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalTodayIso());
  const [currentView, setCurrentView] = useState<CalendarViewType>('day');
  const [selectedSummaryCategory, setSelectedSummaryCategory] =
    useState<SummaryCategory | null>(null);

  // Modals
  const [selectedEvent, setSelectedEvent] = useState<AgendaEventUnion | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [addReminderVisible, setAddReminderVisible] = useState(false);
  const [syncModalVisible, setSyncModalVisible] = useState(false);

  // Queries & Mutations
  const { isAuthenticated, isDemo, user } = useAuth();
  const isAuthOrDemo = Boolean(isAuthenticated || isDemo);
  const userCacheKey = user?.username || (isDemo ? 'demo' : 'advocate');

  const {
    data: agenda,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useDailyAgenda({
    date: selectedDate,
    view: currentView,
    userKey: userCacheKey,
    enabled: isAuthOrDemo,
  });

  const { data: syncSetting } = useCalendarSyncStatus({ enabled: isAuthOrDemo });
  const createReminderMutation = useCreatePersonalReminder(userCacheKey);
  const updateReminderMutation = useUpdatePersonalReminder();
  const deleteReminderMutation = useDeletePersonalReminder();
  const connectSyncMutation = useConnectCalendarSync();
  const triggerSyncMutation = useTriggerCalendarSync();
  const disconnectSyncMutation = useDisconnectCalendarSync();

  const handlePrev = () => {
    setSelectedDate(prev => {
      if (currentView === 'week') return addDaysLocal(prev, -7);
      if (currentView === 'month') return addMonthsLocal(prev, -1);
      return addDaysLocal(prev, -1);
    });
  };

  const handleNext = () => {
    setSelectedDate(prev => {
      if (currentView === 'week') return addDaysLocal(prev, 7);
      if (currentView === 'month') return addMonthsLocal(prev, 1);
      return addDaysLocal(prev, 1);
    });
  };

  const handleToday = () => {
    setSelectedDate(getLocalTodayIso());
  };

  const handleSelectEvent = (event: AgendaEventUnion) => {
    setSelectedEvent(event);
    setDetailModalVisible(true);
  };

  const handleOpenCase = (caseId: number) => {
    router.push(`/cases/${caseId}`);
  };

  const handleOpenTokens = () => {
    router.push('/(tabs)/tokens');
  };

  const handleOpenReminders = () => {
    router.push('/(tabs)/reminders');
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

  const handleDeleteReminder = async (reminder: AgendaReminderItem) => {
    try {
      await deleteReminderMutation.mutateAsync(reminder.id);
      showToast('Reminder deleted.', 'success');
      refetch();
    } catch {
      showToast('Failed to delete reminder.', 'error');
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
      const baseURL = apiClient.defaults.baseURL || 'http://127.0.0.1:8000/api';
      const exportUrl = `${baseURL}${ENDPOINTS.CALENDAR.EXPORT_ICS}`;
      if (Platform.OS === 'web') {
        window.open(exportUrl, '_blank');
      } else {
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
    <ScreenContainer testID="calendar-screen" contentStyle={styles.screenInner}>
      <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
        {/* Header with View Switcher, Local Date Navigation & Today Indicator */}
        <CalendarHeader
          currentView={currentView}
          onViewChange={setCurrentView}
          selectedDate={selectedDate}
          startDate={agenda?.start_date}
          endDate={agenda?.end_date}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
          onOpenAddReminder={() => setAddReminderVisible(true)}
          onOpenSync={() => setSyncModalVisible(true)}
        />

        {/* Scrollable Synchronized Summary Cards + Calendar Body */}
        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.bodyScrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && Boolean(agenda)}
              onRefresh={refetch}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
        >
          {/* Interactive 4-Card Summary & Clickable Detail Section */}
          <AgendaSummaryPanel
            agenda={agenda}
            currentView={currentView}
            selectedDate={selectedDate}
            isLoading={isLoading}
            isFetching={isFetching}
            hasError={Boolean(error)}
            onRetry={() => refetch()}
            selectedCategory={selectedSummaryCategory}
            onSelectCategory={setSelectedSummaryCategory}
            onOpenCase={handleOpenCase}
            onOpenTokens={handleOpenTokens}
            onOpenReminders={handleOpenReminders}
            onSelectEvent={handleSelectEvent}
            onToggleCompleteReminder={handleToggleCompleteReminder}
            onDeleteReminder={handleDeleteReminder}
          />

          {/* Main Calendar View Content */}
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
                selectedDate={selectedDate}
                onSelectEvent={handleSelectEvent}
                onOpenCase={handleOpenCase}
                onOpenTokens={handleOpenTokens}
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
        </ScrollView>
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
        isSyncing={triggerSyncMutation.isPending || disconnectSyncMutation.isPending}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenInner: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  mainWrapper: {
    flex: 1,
  },
  desktopContainer: {
    maxWidth: 1080,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
  },
  bodyScroll: {
    flex: 1,
  },
  bodyScrollContent: {
    paddingBottom: Spacing.xxl,
  },
  stateContainer: {
    padding: 20,
    flex: 1,
  },
});
