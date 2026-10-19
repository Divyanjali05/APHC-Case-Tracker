import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { ReminderItemComponent } from '../../components/reminders/ReminderItem';
import { LoadingIndicator } from '../../components/common/LoadingIndicator';
import { EmptyState } from '../../components/common/EmptyState';
import { Colors } from '../../constants/colors';
import { useReminders } from '../../features/reminders/hooks';

export default function RemindersScreen() {
  const { t } = useTranslation();
  const { data: reminders, isLoading, isError, refetch, isRefetching } = useReminders();

  return (
    <ScreenContainer testID="reminders-screen">
      <View style={styles.headerRow}>
        <Text style={styles.headerSubtitle}>
          Compliance deadlines, process fee due dates, and petition filing windows.
        </Text>
      </View>

      {isLoading ? (
        <LoadingIndicator message={t('common.loading')} />
      ) : isError ? (
        <EmptyState
          title="Could Not Load Reminders"
          description="Unable to sync reminders with the server."
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
          testID="reminders-error-state"
        />
      ) : !reminders || reminders.length === 0 ? (
        <EmptyState
          title={t('reminders.empty')}
          description="All court deadlines and compliance tasks are up to date."
          testID="reminders-empty-state"
        />
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => <ReminderItemComponent item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.primaryLight}
              colors={[Colors.primary]}
            />
          }
          testID="reminders-list"
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    marginBottom: 16,
  },
  headerSubtitle: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  listContent: {
    paddingBottom: 24,
  },
});
