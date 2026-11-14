import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Colors } from '../../constants/colors';
import { TokenAlertRuleItem, TokenAlertStatus } from '../../types';

export interface TokenAlertCardProps {
  item: TokenAlertRuleItem;
  onCancel?: (id: number) => void;
  onSync?: (id: number) => void;
  isCancelling?: boolean;
  isSyncing?: boolean;
}

const getStatusBadge = (status: TokenAlertStatus) => {
  switch (status) {
    case 'CALLED':
      return { label: 'CALLED', variant: 'success' as const };
    case 'APPROACHING':
      return { label: 'APPROACHING', variant: 'gold' as const };
    case 'WAITING':
      return { label: 'WAITING', variant: 'info' as const };
    case 'REGISTERED':
      return { label: 'REGISTERED', variant: 'primary' as const };
    case 'CANCELLED':
      return { label: 'CANCELLED', variant: 'secondary' as const };
    default:
      return { label: status, variant: 'secondary' as const };
  }
};

export const TokenAlertCard: React.FC<TokenAlertCardProps> = ({
  item,
  onCancel,
  onSync,
  isCancelling = false,
  isSyncing = false,
}) => {
  const badgeConfig = getStatusBadge(item.status);
  const hallNumber = item.court_hall_details?.hall_number || item.court_hall;
  const bench = item.bench_name || item.court_hall_details?.bench_name || 'AP High Court';
  const caseNumber =
    item.case_details?.formatted_case_number ||
    (item.case ? `Case #${item.case}` : '—');
  const parties =
    item.case_details?.petitioner && item.case_details?.respondent
      ? `${item.case_details.petitioner} v. ${item.case_details.respondent}`
      : null;

  const currentItem = item.current_called_token || '—';
  const remaining =
    item.items_remaining !== null && item.items_remaining !== undefined
      ? item.items_remaining
      : item.distance;

  return (
    <Card style={styles.card} testID={`token-alert-card-${item.id}`}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.tokenTitleRow}>
          <Text style={styles.tokenNumber} testID={`token-number-${item.id}`}>
            Token #{item.token_number}
          </Text>
          {item.is_mock && (
            <View style={styles.mockBadgeWrap}>
              <Badge label="DEMO" variant="gold" testID={`mock-badge-${item.id}`} />
            </View>
          )}
        </View>
        <Badge
          label={badgeConfig.label}
          variant={badgeConfig.variant}
          testID={`status-badge-${item.id}`}
        />
      </View>

      {/* Case and Hall details */}
      <Text style={styles.caseText} numberOfLines={1}>
        {caseNumber}
      </Text>
      {parties && (
        <Text style={styles.partiesText} numberOfLines={1}>
          {parties}
        </Text>
      )}

      <Text style={styles.hallText} numberOfLines={1}>
        Court Hall {hallNumber} • {bench}
      </Text>

      {/* Progress / Status Board */}
      <View style={styles.statusGrid}>
        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>LISTED ITEM</Text>
          <Text style={styles.statusValue}>#{item.listed_item_number}</Text>
        </View>

        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>CURRENT ITEM</Text>
          <Text style={styles.statusValue}>{currentItem}</Text>
        </View>

        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>REMAINING</Text>
          <Text
            style={[
              styles.statusValue,
              item.status === 'APPROACHING' ? styles.approachingText : undefined,
              item.status === 'CALLED' ? styles.calledText : undefined,
            ]}
          >
            {item.status === 'CALLED'
              ? 'CALLED'
              : remaining <= 0
                ? '0'
                : `${remaining}`}
          </Text>
        </View>
      </View>

      {/* Stale Warning Indicator */}
      {item.is_stale && (
        <View style={styles.staleBanner} testID={`stale-banner-${item.id}`}>
          <Text style={styles.staleText}>
            Notice: Display data may be stale (&gt;5m since court board sync).
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        {onSync && (
          <Button
            title={isSyncing ? 'Syncing...' : 'Sync Now'}
            variant="outline"
            onPress={() => onSync(item.id)}
            loading={isSyncing}
            style={styles.actionBtn}
            testID={`sync-button-${item.id}`}
          />
        )}
        {item.is_active && onCancel && (
          <Button
            title={isCancelling ? 'Cancelling...' : 'Cancel Alert'}
            variant="danger"
            onPress={() => onCancel(item.id)}
            loading={isCancelling}
            style={styles.actionBtn}
            testID={`cancel-button-${item.id}`}
          />
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tokenTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenNumber: {
    color: Colors.text.white,
    fontSize: 17,
    fontWeight: '800',
    marginRight: 8,
  },
  mockBadgeWrap: {
    marginRight: 4,
  },
  caseText: {
    color: Colors.gold,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  partiesText: {
    color: Colors.text.secondary,
    fontSize: 12,
    marginBottom: 4,
  },
  hallText: {
    color: Colors.text.muted,
    fontSize: 12,
    marginBottom: 12,
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  statusBox: {
    flex: 1,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusLabel: {
    color: Colors.text.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statusValue: {
    color: Colors.text.white,
    fontSize: 16,
    fontWeight: '800',
  },
  approachingText: {
    color: Colors.gold,
  },
  calledText: {
    color: Colors.success,
  },
  staleBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
  staleText: {
    color: Colors.danger,
    fontSize: 11,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
});

