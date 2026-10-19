import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { CourtHallCard } from '../../components/tokens/CourtHallCard';
import { LoadingIndicator } from '../../components/common/LoadingIndicator';
import { EmptyState } from '../../components/common/EmptyState';
import { Badge } from '../../components/common/Badge';
import { Colors } from '../../constants/colors';
import { useCourtHalls } from '../../features/tokens/hooks';

export default function TokensScreen() {
  const { t } = useTranslation();
  const { data: halls, isLoading, isError, refetch, isRefetching } = useCourtHalls();

  return (
    <ScreenContainer testID="tokens-screen">
      <View style={styles.topInfo}>
        <View style={styles.badgeRow}>
          <Badge label="LIVE CAUSE BOARD" variant="gold" />
          <Text style={styles.autoRefreshText}>Auto-refreshes every 15s</Text>
        </View>
        <Text style={styles.subtext}>
          High Court of Andhra Pradesh active court hall token and cause list item
          tracker.
        </Text>
      </View>

      {isLoading ? (
        <LoadingIndicator message="Fetching live court hall status..." />
      ) : isError ? (
        <EmptyState
          title="Could Not Connect to Display Board"
          description="Unable to fetch live court hall boards. Please verify backend status."
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
          testID="tokens-error-state"
        />
      ) : !halls || halls.length === 0 ? (
        <EmptyState
          title={t('tokens.empty')}
          description="Court halls are currently not in active session or recess is in effect."
          testID="tokens-empty-state"
        />
      ) : (
        <FlatList
          data={halls}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => <CourtHallCard item={item} />}
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
          testID="tokens-list"
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topInfo: {
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  autoRefreshText: {
    color: Colors.text.muted,
    fontSize: 11,
    fontStyle: 'italic',
  },
  subtext: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  listContent: {
    paddingBottom: 24,
  },
});
