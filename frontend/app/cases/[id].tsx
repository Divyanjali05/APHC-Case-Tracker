import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { AxiosError } from 'axios';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { LoadingIndicator } from '../../components/common/LoadingIndicator';
import { EmptyState } from '../../components/common/EmptyState';
import { OfflineBanner } from '../../components/offline/OfflineBanner';
import { Colors } from '../../constants/colors';
import { useCaseDetail, useCaseHistory } from '../../features/cases/hooks';
import {
  useCourtStatus,
  useCourtStatusHistory,
  useSyncCourtStatus,
} from '../../features/courtStatus/hooks';
import { formatCaseNumber, formatDate } from '../../utils/formatters';
import { speechService } from '../../services/speech/ttsService';
import { HearingItem, JudgmentItem } from '../../types';
import { CaseHistoryTimeline } from '../../components/cases/CaseHistoryTimeline';
import { CourtStatusCard } from '../../components/cases/CourtStatusCard';
import { CourtStatusTimeline } from '../../components/cases/CourtStatusTimeline';
import { RescheduleHearingModal } from '../../components/hearings/RescheduleHearingModal';

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [rescheduleHearing, setRescheduleHearing] = useState<HearingItem | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{
    message: string | null;
    error: string | null;
  }>({ message: null, error: null });

  const { data: caseItem, isLoading, isError, refetch } = useCaseDetail(id || '');
  const {
    data: historyData,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    refetch: refetchHistory,
  } = useCaseHistory(id || '');

  const {
    data: courtStatusData,
    isLoading: isCourtStatusLoading,
    isError: isCourtStatusError,
    refetch: refetchCourtStatus,
  } = useCourtStatus(id || '');

  const {
    data: courtHistoryData,
    isLoading: isCourtHistoryLoading,
    isError: isCourtHistoryError,
    refetch: refetchCourtHistory,
  } = useCourtStatusHistory(id || '');

  const { mutate: syncCourtStatus, isPending: isSyncing } = useSyncCourtStatus();

  const handleSyncCourtStatus = () => {
    if (!id) return;
    setSyncFeedback({ message: null, error: null });
    syncCourtStatus(
      { caseId: id },
      {
        onSuccess: data => {
          setSyncFeedback({
            message: data.is_meaningful_change
              ? `Status updated: ${data.new_status || 'Synced'} (Alert dispatched)`
              : 'Court status synchronized (No change).',
            error: null,
          });
          refetch();
          refetchHistory();
          refetchCourtStatus();
          refetchCourtHistory();
        },
        onError: (err: unknown) => {
          const axiosError = err as AxiosError<{ detail?: string }>;
          const status = axiosError?.response?.status;
          if (status === 429) {
            setSyncFeedback({
              message: null,
              error: 'Rate limit active. Please wait 5 seconds before refreshing again.',
            });
          } else {
            setSyncFeedback({
              message: null,
              error:
                axiosError?.response?.data?.detail || 'Failed to synchronize with court.',
            });
          }
        },
      }
    );
  };

  if (isLoading) {
    return (
      <ScreenContainer testID="case-detail-loading">
        <LoadingIndicator message="Loading docket details..." />
      </ScreenContainer>
    );
  }

  if (isError || !caseItem) {
    return (
      <ScreenContainer testID="case-detail-error">
        <EmptyState
          title="Case Not Found"
          description="Could not load the requested court matter or the case is not synced."
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
        />
      </ScreenContainer>
    );
  }

  const effectiveJudgment: JudgmentItem | undefined =
    caseItem.latest_judgment || (caseItem.judgments && caseItem.judgments[0]);

  const handleOpenDoc = async (url?: string) => {
    if (!url) {
      Alert.alert(
        t('judgment.noDocTitle', 'No Document Attached'),
        t(
          'judgment.noDocDescription',
          'A certified copy has not yet been uploaded to the court docket repository.'
        )
      );
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          t('common.error', 'Error'),
          t('judgment.docOpenError', 'Unable to open the external document link.')
        );
      }
    } catch {
      Alert.alert(
        t('common.error', 'Error'),
        t('judgment.docOpenError', 'Unable to open the external document link.')
      );
    }
  };

  const handleSpeakSummary = () => {
    const judgmentInfo = effectiveJudgment
      ? ` Judgment delivered on ${formatDate(effectiveJudgment.judgment_date)}.`
      : '';
    const summary = `${caseItem.case_type} ${caseItem.case_number} of ${
      caseItem.filing_year
    }. ${caseItem.petitioner} versus ${caseItem.respondent}. Stage: ${
      caseItem.status || caseItem.current_stage
    }.${judgmentInfo} Next hearing on ${formatDate(caseItem.next_hearing_date)}.`;
    speechService.speak(summary, i18n.language);
  };

  return (
    <ScreenContainer testID="case-detail-screen">
      <OfflineBanner onSyncComplete={refetch} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Case Title Banner */}
        <Card style={styles.bannerCard}>
          <View style={styles.headerRow}>
            <Text style={styles.caseNumber}>
              {formatCaseNumber(
                caseItem.case_type,
                caseItem.case_number,
                caseItem.filing_year
              )}
            </Text>
            <Badge label={caseItem.status || caseItem.current_stage} variant="gold" />
          </View>

          <Text style={styles.parties}>
            {caseItem.petitioner}
            {'\n'}
            <Text style={styles.vsText}>VERSUS</Text>
            {'\n'}
            {caseItem.respondent}
          </Text>

          <Button
            title="Listen to Case Summary"
            variant="outline"
            onPress={handleSpeakSummary}
            style={styles.voiceButton}
            testID="speak-case-button"
          />
        </Card>

        {/* Court Listing & Token Card */}
        <CourtStatusCard
          caseId={caseItem.id}
          statusData={courtStatusData}
          isLoading={isCourtStatusLoading}
          isError={isCourtStatusError}
          onSync={handleSyncCourtStatus}
          isSyncing={isSyncing}
          syncMessage={syncFeedback.message}
          syncError={syncFeedback.error}
        />

        {/* Judgment Information Card */}
        <Card style={styles.sectionCard} testID="case-detail-judgment-card">
          <View style={styles.judgmentCardHeader}>
            <Text style={styles.sectionTitle}>
              {t('judgment.title', 'Judgment Details')}
            </Text>
            <Badge
              label={
                effectiveJudgment
                  ? t('cases.judgmentAvailable', 'Judgment Available')
                  : t('cases.judgmentPending', 'Pending')
              }
              variant={effectiveJudgment ? 'gold' : 'primary'}
            />
          </View>

          {effectiveJudgment ? (
            <View style={styles.judgmentBody}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  {t('judgment.judgmentDate', 'Judgment Date')}
                </Text>
                <Text style={[styles.detailValue, styles.highlightDate]}>
                  {formatDate(effectiveJudgment.judgment_date)}
                </Text>
              </View>
              {effectiveJudgment.order_number ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    {t('judgment.orderNumber', 'Order Number')}
                  </Text>
                  <Text style={styles.detailValue}>{effectiveJudgment.order_number}</Text>
                </View>
              ) : null}
              {effectiveJudgment.summary ? (
                <View style={styles.judgmentSummaryBox}>
                  <Text style={styles.judgmentSummaryLabel}>
                    {t('judgment.summary', 'Summary')}:
                  </Text>
                  <Text style={styles.judgmentSummaryContent}>
                    {effectiveJudgment.summary}
                  </Text>
                </View>
              ) : null}
              {effectiveJudgment.document_link ? (
                <Button
                  title={t('judgment.downloadDoc', 'Open Official Judgment (PDF)')}
                  variant="primary"
                  onPress={() => handleOpenDoc(effectiveJudgment.document_link)}
                  style={styles.docButton}
                  testID="detail-open-judgment-doc-btn"
                />
              ) : (
                <Text style={styles.docPendingText}>
                  {t(
                    'judgment.docPendingRegistry',
                    'Official copy pending registry dispatch.'
                  )}
                </Text>
              )}
            </View>
          ) : (
            <Text style={styles.emptyHearings}>
              {t(
                'judgment.noSummary',
                'No judgment record has been pronounced yet for this court matter.'
              )}
            </Text>
          )}
        </Card>

        {/* Docket Information */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t('cases.details')}</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Filing Year</Text>
            <Text style={styles.detailValue}>{caseItem.filing_year}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Court Hall</Text>
            <Text style={styles.detailValue}>
              {caseItem.court_hall_number
                ? `Hall ${caseItem.court_hall_number}`
                : 'Not assigned'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Bench</Text>
            <Text style={styles.detailValue}>{caseItem.bench || 'Regular Bench'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Petitioner Advocate</Text>
            <Text style={styles.detailValue}>{caseItem.petitioner_advocate || '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Respondent Advocate</Text>
            <Text style={styles.detailValue}>{caseItem.respondent_advocate || '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Next Hearing Date</Text>
            <Text style={[styles.detailValue, styles.highlightDate]}>
              {formatDate(
                caseItem.effective_next_hearing_date || caseItem.next_hearing_date
              )}
            </Text>
          </View>
        </Card>

        {/* Hearing History */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t('cases.hearings')}</Text>

          {caseItem.hearings && caseItem.hearings.length > 0 ? (
            caseItem.hearings.map((hearing: HearingItem) => (
              <View key={hearing.id} style={styles.hearingItem}>
                <View style={styles.hearingHeader}>
                  <Text style={styles.hearingDate}>
                    {formatDate(hearing.hearing_date)}
                    {hearing.hearing_time ? ` • ${hearing.hearing_time}` : ''}
                  </Text>
                  <View style={styles.badgeGroup}>
                    {hearing.status === 'RESCHEDULED' || hearing.is_rescheduled ? (
                      <Badge label="Rescheduled" variant="warning" />
                    ) : (
                      <Badge
                        label={
                          hearing.item_number ? `Item #${hearing.item_number}` : 'Listed'
                        }
                        variant="primary"
                      />
                    )}
                  </View>
                </View>
                {hearing.previous_hearing_date ? (
                  <Text style={styles.hearingPrevDate}>
                    🔄 Prior: {formatDate(hearing.previous_hearing_date)}{' '}
                    {hearing.previous_hearing_time || ''}
                  </Text>
                ) : null}
                {hearing.business_conducted ? (
                  <Text style={styles.hearingBusiness}>{hearing.business_conducted}</Text>
                ) : null}
                {hearing.next_date ? (
                  <Text style={styles.hearingNextDate}>
                    Next Date: {formatDate(hearing.next_date)}
                  </Text>
                ) : null}
                {hearing.status !== 'COMPLETED' && hearing.status !== 'CANCELLED' ? (
                  <TouchableOpacity
                    style={styles.rescheduleLink}
                    onPress={() =>
                      setRescheduleHearing({
                        ...hearing,
                        case_details: {
                          id: caseItem.id,
                          case_type: caseItem.case_type,
                          case_number: caseItem.case_number,
                          filing_year: caseItem.filing_year,
                          petitioner: caseItem.petitioner,
                          respondent: caseItem.respondent,
                          formatted_case_number: formatCaseNumber(
                            caseItem.case_type,
                            caseItem.case_number,
                            caseItem.filing_year
                          ),
                        },
                      })
                    }
                    testID={`reschedule-hearing-${hearing.id}`}
                  >
                    <Text style={styles.rescheduleLinkText}>
                      📅 {t('hearings.rescheduleAction', 'Reschedule Appearance')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={styles.emptyHearings}>
              No previous hearing records synced for this matter.
            </Text>
          )}
        </Card>

        {/* Court Status History Timeline */}
        <Card style={styles.sectionCard} testID="case-detail-court-status-history-card">
          <CourtStatusTimeline
            observations={courtHistoryData || []}
            isLoading={isCourtHistoryLoading}
            isError={isCourtHistoryError}
            onRetry={refetchCourtHistory}
          />
        </Card>

        {/* Case Audit Timeline */}
        <Card style={styles.sectionCard} testID="case-detail-history-card">
          <Text style={styles.sectionTitle}>
            {t('history.title', 'Case Audit Timeline')}
          </Text>
          <CaseHistoryTimeline
            history={historyData || []}
            isLoading={isHistoryLoading}
            isError={isHistoryError}
            onRetry={refetchHistory}
          />
        </Card>
      </ScrollView>

      {/* Reschedule Hearing Modal */}
      <RescheduleHearingModal
        visible={Boolean(rescheduleHearing)}
        hearing={rescheduleHearing}
        onClose={() => setRescheduleHearing(null)}
        onSuccess={() => {
          refetch();
          refetchHistory();
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  bannerCard: {
    padding: 18,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  caseNumber: {
    color: Colors.text.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  parties: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 22,
    marginVertical: 10,
  },
  vsText: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  voiceButton: {
    marginTop: 10,
  },
  sectionCard: {
    padding: 18,
    marginBottom: 16,
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
  detailValue: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  highlightDate: {
    color: Colors.gold,
    fontWeight: '700',
  },
  hearingItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  hearingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  hearingDate: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '700',
  },
  hearingBusiness: {
    color: Colors.text.secondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  hearingNextDate: {
    color: Colors.text.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  emptyHearings: {
    color: Colors.text.muted,
    fontSize: 13,
    paddingVertical: 8,
  },
  judgmentCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  judgmentBody: {
    paddingTop: 4,
  },
  judgmentSummaryBox: {
    marginTop: 10,
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.gold,
  },
  judgmentSummaryLabel: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  judgmentSummaryContent: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  docButton: {
    marginTop: 12,
  },
  docPendingText: {
    color: Colors.text.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 10,
    textAlign: 'center',
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hearingPrevDate: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  rescheduleLink: {
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
  },
  rescheduleLinkText: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: '700',
  },
});
