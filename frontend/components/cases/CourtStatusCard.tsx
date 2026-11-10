import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '../common/Card';
import { Badge, BadgeProps } from '../common/Badge';
import { AppIcon } from '../common/AppIcon';
import { Colors } from '../../constants/colors';
import { CaseCourtStatusSummary, NormalizedCourtStatusType } from '../../types';
import { formatDate, formatTime } from '../../utils/formatters';

export interface CourtStatusCardProps {
  caseId: number | string;
  statusData?: CaseCourtStatusSummary | null;
  isLoading?: boolean;
  isError?: boolean;
  onSync?: () => void;
  isSyncing?: boolean;
  syncMessage?: string | null;
  syncError?: string | null;
}

export const getStatusBadgeVariant = (
  status: NormalizedCourtStatusType
): BadgeProps['variant'] => {
  switch (status) {
    case 'CALLED':
      return 'danger';
    case 'IN_PROGRESS':
      return 'gold';
    case 'TOKEN_ALLOCATED':
      return 'primary';
    case 'WAITING':
    case 'LISTED':
      return 'info';
    case 'COMPLETED':
      return 'success';
    case 'ADJOURNED':
      return 'warning';
    case 'NOT_LISTED':
    case 'CANCELLED':
    case 'UNKNOWN':
    default:
      return 'secondary';
  }
};

export const CourtStatusCard: React.FC<CourtStatusCardProps> = ({
  statusData,
  isLoading,
  isError,
  onSync,
  isSyncing,
  syncMessage,
  syncError,
}) => {
  const { t } = useTranslation();

  const listing = statusData?.listing;
  const normalizedStatus = statusData?.normalized_status || 'UNKNOWN';
  const statusDisplay =
    statusData?.normalized_status_display ||
    t(`courtStatus.statuses.${normalizedStatus}`, normalizedStatus);

  return (
    <Card style={styles.card} testID="court-status-card">
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>
            {t('courtStatus.title', 'Court Listing & Token Status')}
          </Text>
          <Text style={styles.subtitle}>
            {t('courtStatus.subtitle', 'Live courtroom listing and token progression')}
          </Text>
        </View>
        <Badge
          label={statusDisplay}
          variant={getStatusBadgeVariant(normalizedStatus)}
          testID="court-status-badge"
        />
      </View>

      {/* Mock Provider Warning Banner */}
      {listing?.is_mock && (
        <View style={styles.mockBanner} testID="mock-adapter-banner">
          <AppIcon name="alert-triangle" size={15} color={Colors.gold} />
          <Text style={styles.mockBannerText}>
            {t(
              'courtStatus.mockNotice',
              'SIMULATED DATA: Provided by deterministic mock adapter. Not official APHC live stream.'
            )}
          </Text>
        </View>
      )}

      {/* Loading state */}
      {isLoading && (
        <View style={styles.loadingContainer} testID="court-status-loading">
          <ActivityIndicator size="small" color={Colors.primaryLight} />
          <Text style={styles.loadingText}>
            {t('courtStatus.loading', 'Loading court listing...')}
          </Text>
        </View>
      )}

      {/* Error state */}
      {!isLoading && isError && (
        <View style={styles.errorContainer} testID="court-status-error">
          <Text style={styles.errorText}>
            {t('courtStatus.providerUnavailable', 'Court status service unavailable.')}
          </Text>
        </View>
      )}

      {/* Content when available */}
      {!isLoading && !isError && (
        <>
          {listing ? (
            <View style={styles.detailsContainer} testID="court-listing-details">
              {/* Token Highlight Box if allocated */}
              {listing.token_number && (
                <View style={styles.tokenHighlightBox} testID="token-highlight-box">
                  <View style={styles.tokenLeft}>
                    <Text style={styles.tokenLabel}>
                      {t('courtStatus.tokenNumber', 'Court Token')}
                    </Text>
                    <Text style={styles.tokenValue}>{listing.token_number}</Text>
                  </View>
                  {listing.item_number != null && (
                    <View style={styles.itemRight}>
                      <Text style={styles.itemLabel}>
                        {t('courtStatus.itemNumber', 'Item No.')}
                      </Text>
                      <Text style={styles.itemValue}>#{listing.item_number}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Grid of listing metadata */}
              <View style={styles.metaGrid}>
                <View style={styles.gridRow}>
                  <Text style={styles.gridLabel}>
                    {t('courtStatus.courtName', 'Court')}
                  </Text>
                  <Text style={styles.gridValue}>
                    {listing.court_name || 'High Court of Andhra Pradesh'}
                  </Text>
                </View>

                {listing.court_hall != null && (
                  <View style={styles.gridRow}>
                    <Text style={styles.gridLabel}>
                      {t('courtStatus.courtHall', 'Court Hall')}
                    </Text>
                    <Text style={[styles.gridValue, styles.highlightValue]}>
                      Court Hall {listing.court_hall}
                    </Text>
                  </View>
                )}

                {listing.bench && (
                  <View style={styles.gridRow}>
                    <Text style={styles.gridLabel}>
                      {t('courtStatus.bench', 'Bench')}
                    </Text>
                    <Text style={styles.gridValue}>{listing.bench}</Text>
                  </View>
                )}

                {listing.listing_date && (
                  <View style={styles.gridRow}>
                    <Text style={styles.gridLabel}>
                      {t('courtStatus.listingDate', 'Listing Date')}
                    </Text>
                    <Text style={styles.gridValue}>
                      {formatDate(listing.listing_date)}
                    </Text>
                  </View>
                )}

                {listing.session && (
                  <View style={styles.gridRow}>
                    <Text style={styles.gridLabel}>
                      {t('courtStatus.session', 'Session')}
                    </Text>
                    <Text style={styles.gridValue}>{listing.session}</Text>
                  </View>
                )}

                {listing.item_number != null && !listing.token_number && (
                  <View style={styles.gridRow}>
                    <Text style={styles.gridLabel}>
                      {t('courtStatus.itemNumber', 'Item Number')}
                    </Text>
                    <Text style={styles.gridValue}>#{listing.item_number}</Text>
                  </View>
                )}

                {listing.source_status && (
                  <View style={styles.gridRow}>
                    <Text style={styles.gridLabel}>
                      {t('courtStatus.sourceStatus', 'Source Status')}
                    </Text>
                    <Text style={styles.gridValueMuted}>{listing.source_status}</Text>
                  </View>
                )}

                <View style={styles.gridRow}>
                  <Text style={styles.gridLabel}>
                    {t('courtStatus.dataSource', 'Data Source')}
                  </Text>
                  <Text style={styles.gridValueMuted}>{listing.provider_name}</Text>
                </View>

                {listing.last_synced_at && (
                  <View style={styles.gridRow}>
                    <Text style={styles.gridLabel}>
                      {t('courtStatus.lastSynced', 'Last Synchronized')}
                    </Text>
                    <Text style={styles.gridValueMuted}>
                      {formatDate(listing.last_synced_at)}{' '}
                      {formatTime(listing.last_synced_at)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.emptyContainer} testID="court-status-empty">
              <View style={styles.emptyIconCircle}>
                <AppIcon name="clipboard-list" size={24} color={Colors.text.muted} />
              </View>
              <Text style={styles.emptyTitle}>
                {t('courtStatus.noListing', 'No Active Court Listing')}
              </Text>
              <Text style={styles.emptyDescription}>
                {t(
                  'courtStatus.noListingDesc',
                  'This matter is not currently scheduled on today cause list or board.'
                )}
              </Text>
            </View>
          )}
        </>
      )}

      {/* Sync feedback messages */}
      {syncMessage && (
        <View style={styles.feedbackSuccess} testID="court-status-sync-success">
          <Text style={styles.feedbackSuccessText}>{syncMessage}</Text>
        </View>
      )}
      {syncError && (
        <View style={styles.feedbackError} testID="court-status-sync-error">
          <Text style={styles.feedbackErrorText}>{syncError}</Text>
        </View>
      )}

      {/* Sync Button */}
      {onSync && (
        <TouchableOpacity
          style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
          onPress={onSync}
          disabled={isSyncing}
          testID="court-status-sync-button"
        >
          {isSyncing ? (
            <ActivityIndicator
              size="small"
              color="#FFFFFF"
              style={styles.buttonSpinner}
            />
          ) : (
            <View style={styles.syncIconWrap}>
              <AppIcon name="refresh" size={15} color="#FFFFFF" />
            </View>
          )}
          <Text style={styles.syncButtonText}>
            {isSyncing
              ? t('courtStatus.syncing', 'Syncing with Court...')
              : t('courtStatus.syncNow', 'Refresh Court Status')}
          </Text>
        </TouchableOpacity>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.text.muted,
  },
  mockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.goldSurface,
    borderColor: Colors.goldBorder,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  mockBannerText: {
    flex: 1,
    fontSize: 12,
    color: Colors.text.primary,
    fontWeight: '500',
    lineHeight: 17,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 8,
  },
  errorContainer: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    color: Colors.danger,
    textAlign: 'center',
  },
  detailsContainer: {
    marginTop: 4,
  },
  tokenHighlightBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceBlue,
    borderColor: Colors.infoBorder,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  tokenLeft: {
    flex: 1,
  },
  tokenLabel: {
    fontSize: 12,
    color: Colors.primaryLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  tokenValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
    marginTop: 2,
    letterSpacing: 0.8,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemLabel: {
    fontSize: 12,
    color: Colors.primaryLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  itemValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.gold,
    marginTop: 2,
  },
  metaGrid: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  gridLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    flex: 1,
  },
  gridValue: {
    fontSize: 12,
    color: Colors.text.primary,
    fontWeight: '600',
    flex: 1.4,
    textAlign: 'right',
  },
  highlightValue: {
    color: Colors.primary,
  },
  gridValueMuted: {
    fontSize: 12,
    color: Colors.text.muted,
    flex: 1.4,
    textAlign: 'right',
  },
  emptyContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  emptyDescription: {
    fontSize: 12,
    color: Colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  feedbackSuccess: {
    backgroundColor: Colors.successSurface,
    borderColor: Colors.successBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  feedbackSuccessText: {
    fontSize: 12,
    color: Colors.success,
    fontWeight: '600',
    textAlign: 'center',
  },
  feedbackError: {
    backgroundColor: Colors.dangerSurface,
    borderColor: Colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  feedbackErrorText: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: '600',
    textAlign: 'center',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 11,
    borderRadius: 8,
    marginTop: 4,
  },
  syncButtonDisabled: {
    opacity: 0.65,
  },
  syncIconWrap: {
    marginRight: 6,
  },
  buttonSpinner: {
    marginRight: 6,
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
