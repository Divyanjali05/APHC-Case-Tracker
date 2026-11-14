import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { CourtHallCard } from '../../components/tokens/CourtHallCard';
import { TokenAlertCard } from '../../components/tokens/TokenAlertCard';
import { RegisterTokenModal } from '../../components/tokens/RegisterTokenModal';
import { LoadingIndicator } from '../../components/common/LoadingIndicator';
import { EmptyState } from '../../components/common/EmptyState';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Colors } from '../../constants/colors';
import {
  useCourtHalls,
  useTokenAlerts,
  useCreateTokenAlert,
  useCancelTokenAlert,
  useSyncTokenAlert,
} from '../../features/tokens/hooks';
import { useCases } from '../../features/cases/hooks';
import { CreateTokenAlertPayload } from '../../types';

type TokenTab = 'alerts' | 'halls';

export default function TokensScreen() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TokenTab>('alerts');
  const [isRegisterModalVisible, setIsRegisterModalVisible] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  const {
    data: halls = [],
    isLoading: isHallsLoading,
    isError: isHallsError,
    refetch: refetchHalls,
    isRefetching: isHallsRefetching,
  } = useCourtHalls();

  const {
    data: alerts = [],
    isLoading: isAlertsLoading,
    isError: isAlertsError,
    refetch: refetchAlerts,
    isRefetching: isAlertsRefetching,
  } = useTokenAlerts();

  const { data: cases = [] } = useCases();

  const createAlertMutation = useCreateTokenAlert();
  const cancelAlertMutation = useCancelTokenAlert();
  const syncAlertMutation = useSyncTokenAlert();

  const handleRegisterSubmit = async (payload: CreateTokenAlertPayload) => {
    await createAlertMutation.mutateAsync(payload);
  };

  const handleCancelAlert = async (id: number) => {
    try {
      setCancellingId(id);
      await cancelAlertMutation.mutateAsync(id);
    } finally {
      setCancellingId(null);
    }
  };

  const handleSyncAlert = async (id: number) => {
    try {
      setSyncingId(id);
      await syncAlertMutation.mutateAsync(id);
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <ScreenContainer testID="tokens-screen">
      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'alerts' && styles.tabButtonActive]}
          onPress={() => setActiveTab('alerts')}
          testID="my-alerts-tab"
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'alerts' && styles.tabButtonTextActive,
            ]}
          >
            My Token Alerts {alerts.length > 0 ? `(${alerts.length})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'halls' && styles.tabButtonActive]}
          onPress={() => setActiveTab('halls')}
          testID="court-halls-tab"
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'halls' && styles.tabButtonTextActive,
            ]}
          >
            Live Court Halls
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab 1: My Token Alerts */}
      {activeTab === 'alerts' && (
        <View style={styles.tabContent}>
          {/* Header row with register button */}
          <View style={styles.alertsHeaderRow}>
            <View style={styles.demoNoticeBadge}>
              <Badge label="DEMO / MOCK DATA SOURCE" variant="gold" />
            </View>
            <Button
              title="+ Register Token"
              variant="primary"
              onPress={() => setIsRegisterModalVisible(true)}
              style={styles.registerBtn}
              testID="register-token-button"
            />
          </View>

          {isAlertsLoading ? (
            <LoadingIndicator message="Loading court token alerts..." />
          ) : isAlertsError ? (
            <EmptyState
              title="Failed to Load Alerts"
              description="Unable to connect to the token alert service. Please verify network or retry."
              actionLabel={t('common.retry', 'Retry')}
              onAction={() => refetchAlerts()}
              testID="alerts-error-state"
            />
          ) : alerts.length === 0 ? (
            <EmptyState
              title="No Active Token Alerts"
              description="You have not registered any court hall token alerts. Register a token number to receive approach and call alerts."
              actionLabel="+ Register Token Alert"
              onAction={() => setIsRegisterModalVisible(true)}
              testID="empty-alerts-state"
            />
          ) : (
            <FlatList
              data={alerts}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => (
                <TokenAlertCard
                  item={item}
                  onCancel={handleCancelAlert}
                  onSync={handleSyncAlert}
                  isCancelling={cancellingId === item.id}
                  isSyncing={syncingId === item.id}
                />
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isAlertsRefetching}
                  onRefresh={refetchAlerts}
                  tintColor={Colors.primaryLight}
                  colors={[Colors.primary]}
                />
              }
              testID="token-alerts-list"
            />
          )}
        </View>
      )}

      {/* Tab 2: Live Court Halls */}
      {activeTab === 'halls' && (
        <View style={styles.tabContent}>
          <View style={styles.topInfo}>
            <View style={styles.badgeRow}>
              <Badge label="LIVE CAUSE BOARD" variant="gold" />
              <Text style={styles.autoRefreshText}>Auto-refreshes every 15s</Text>
            </View>
            <Text style={styles.subtext}>
              High Court of Andhra Pradesh active court hall token and cause list item tracker.
            </Text>
          </View>

          {isHallsLoading ? (
            <LoadingIndicator message="Fetching live court hall status..." />
          ) : isHallsError ? (
            <EmptyState
              title="Could Not Connect to Display Board"
              description="Unable to fetch live court hall boards. Please verify backend status."
              actionLabel={t('common.retry', 'Retry')}
              onAction={() => refetchHalls()}
              testID="tokens-error-state"
            />
          ) : halls.length === 0 ? (
            <EmptyState
              title={t('tokens.empty', 'No Active Halls')}
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
                  refreshing={isHallsRefetching}
                  onRefresh={refetchHalls}
                  tintColor={Colors.primaryLight}
                  colors={[Colors.primary]}
                />
              }
              testID="tokens-list"
            />
          )}
        </View>
      )}

      {/* Registration Modal */}
      <RegisterTokenModal
        visible={isRegisterModalVisible}
        onClose={() => setIsRegisterModalVisible(false)}
        onSubmit={handleRegisterSubmit}
        courtHalls={halls}
        cases={cases}
        isSubmitting={createAlertMutation.isPending}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
  },
  tabButtonText: {
    color: Colors.text.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: Colors.text.white,
  },
  tabContent: {
    flex: 1,
  },
  alertsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  demoNoticeBadge: {
    flex: 1,
    marginRight: 12,
  },
  registerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
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
