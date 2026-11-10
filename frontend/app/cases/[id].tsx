import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { AxiosError } from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { AppIcon } from '../../components/common/AppIcon';
import { SkeletonCard } from '../../components/common/SkeletonCard';
import { ErrorState } from '../../components/common/ErrorState';
import { useToast } from '../../components/common/Toast';
import { OfflineBanner } from '../../components/offline/OfflineBanner';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { useCaseDetail, useCaseHistory } from '../../features/cases/hooks';
import {
  useCourtStatus,
  useCourtStatusHistory,
  useSyncCourtStatus,
} from '../../features/courtStatus/hooks';
import { formatCaseNumber, formatDate } from '../../utils/formatters';
import { speechService } from '../../services/speech/ttsService';
import { HearingItem, JudgmentItem } from '../../types';
import { isOfficialJudgmentDocumentAvailable } from '../../components/cases/JudgmentDetailsModal';
import { CaseHistoryTimeline } from '../../components/cases/CaseHistoryTimeline';
import { CaseDocumentsSection } from '../../components/cases/CaseDocumentsSection';
import { CaseNotesSection } from '../../components/cases/CaseNotesSection';
import { CaseVoiceNotesSection } from '../../components/cases/CaseVoiceNotesSection';
import { CourtStatusCard } from '../../components/cases/CourtStatusCard';
import { CourtStatusTimeline } from '../../components/cases/CourtStatusTimeline';
import { RescheduleHearingModal } from '../../components/hearings/RescheduleHearingModal';
import { API_BASE_URL } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { tokenStorage } from '../../services/auth/tokenStorage';

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'HEARINGS' | 'DOCUMENTS' | 'NOTES' | 'VOICE_NOTES' | 'JUDGMENT'
  >('OVERVIEW');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [rescheduleHearing, setRescheduleHearing] = useState<HearingItem | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{
    message: string | null;
    error: string | null;
  }>({ message: null, error: null });

  const { data: caseItem, isLoading, isError, refetch } = useCaseDetail(id || '');

  const handleExportPdf = async () => {
    if (!caseItem?.id) return;
    try {
      setIsExportingPdf(true);
      const token = await tokenStorage.getAccessToken();
      const exportUrl = `${API_BASE_URL}${ENDPOINTS.CASES.EXPORT_PDF(
        caseItem.id
      )}?token=${token || ''}`;
      const canOpen = await Linking.canOpenURL(exportUrl);
      if (canOpen) {
        await Linking.openURL(exportUrl);
      } else {
        showToast(
          `Docket PDF available for ${caseItem.case_type} ${caseItem.case_number}/${caseItem.filing_year}`,
          'success'
        );
      }
    } catch {
      showToast(t('export.exportFailed', 'Failed to generate PDF.'), 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

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
          const msg = data.is_meaningful_change
            ? `Status updated: ${data.new_status || 'Synced'} (Alert dispatched)`
            : 'Court status synchronized (No change).';
          setSyncFeedback({
            message: msg,
            error: null,
          });
          showToast(msg, 'success');
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
        <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
          <SkeletonCard variant="card" count={3} />
          <Text style={styles.loadingText}>Loading docket details...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (isError || !caseItem) {
    return (
      <ScreenContainer testID="case-detail-error">
        <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
          <ErrorState
            title="Case Not Found"
            message="Could not load the requested court matter or you do not have access to this case."
            retryLabel={t('common.retry', 'Retry')}
            onRetry={() => refetch()}
          />
          <Button title="Back to Cases" variant="outline" onPress={() => router.back()} />
        </View>
      </ScreenContainer>
    );
  }

  const effectiveJudgment: JudgmentItem | undefined =
    caseItem.latest_judgment || (caseItem.judgments && caseItem.judgments[0]);
  const hasValidDocument = Boolean(
    effectiveJudgment?.document_link &&
      isOfficialJudgmentDocumentAvailable(effectiveJudgment.document_link)
  );

  const handleOpenDoc = async (url?: string) => {
    if (!url || !isOfficialJudgmentDocumentAvailable(url)) {
      Alert.alert(
        t('judgment.noDocTitle', 'No Document Attached'),
        t('judgment.docNotUploaded', 'Official judgment PDF has not been uploaded yet.')
      );
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        showToast(
          t('judgment.docOpenError', 'Unable to open the external document link.'),
          'error'
        );
      }
    } catch {
      showToast(
        t('judgment.docOpenError', 'Unable to open the external document link.'),
        'error'
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

  const renderJudgmentSection = () => (
    <Card style={styles.sectionCard} testID="case-detail-judgment-card">
      <View style={styles.judgmentCardHeader}>
        <Text style={styles.sectionTitle}>{t('judgment.title', 'Judgment Details')}</Text>
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
          {hasValidDocument && effectiveJudgment.document_link ? (
            <Button
              title={t('judgment.downloadDoc', 'Open Official Judgment (PDF)')}
              variant="primary"
              onPress={() => handleOpenDoc(effectiveJudgment.document_link)}
              style={styles.docButton}
              testID="detail-open-judgment-doc-btn"
            />
          ) : (
            <Text style={styles.docPendingText} testID="detail-judgment-doc-pending">
              {t(
                'judgment.docNotUploaded',
                'Official judgment PDF has not been uploaded yet.'
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
  );

  const renderHearingsTimelineSection = () => (
    <>
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
                <View style={styles.hearingMetaRow}>
                  <AppIcon name="refresh" size={12} color={Colors.gold} />
                  <Text style={styles.hearingPrevDate}>
                    Prior: {formatDate(hearing.previous_hearing_date)}{' '}
                    {hearing.previous_hearing_time || ''}
                  </Text>
                </View>
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
                  <AppIcon name="calendar" size={12} color={Colors.primaryLight} />
                  <Text style={styles.rescheduleLinkText}>
                    {t('hearings.rescheduleAction', 'Reschedule Appearance')}
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
    </>
  );

  return (
    <ScreenContainer testID="case-detail-screen">
      <OfflineBanner onSyncComplete={refetch} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
          {/* Back navigation & Quick header */}
          <View style={styles.topNavRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              testID="case-detail-back-button"
              accessibilityRole="button"
              accessibilityLabel="Back to cases"
            >
              <AppIcon name="arrow-left" size={18} color={Colors.primary} />
              <Text style={styles.backButtonText}>Back to Cases</Text>
            </TouchableOpacity>
            <Badge
              label={
                caseItem.court_hall_number
                  ? `Court Hall ${caseItem.court_hall_number}`
                  : 'High Court Bench'
              }
              variant="secondary"
            />
          </View>

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

            <View style={styles.bannerActionsRow}>
              <Button
                title="Listen to Case Summary"
                variant="outline"
                onPress={handleSpeakSummary}
                style={styles.bannerActionBtn}
                testID="speak-case-button"
              />
              <Button
                title={
                  isExportingPdf
                    ? t('export.pdfExporting', 'Exporting PDF...')
                    : t('export.exportPdf', 'Export Docket PDF')
                }
                variant="secondary"
                onPress={handleExportPdf}
                style={styles.bannerActionBtn}
                disabled={isExportingPdf}
                testID="export-case-pdf-button"
              />
            </View>
          </Card>

          {/* Tab Navigation Segmented Bar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBar}
            testID="case-detail-tabs"
          >
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'OVERVIEW' && styles.tabButtonActive,
              ]}
              onPress={() => setActiveTab('OVERVIEW')}
              testID="tab-overview"
              accessibilityRole="button"
            >
              <Text
                style={[styles.tabText, activeTab === 'OVERVIEW' && styles.tabTextActive]}
              >
                {t('cases.details', 'Overview')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'HEARINGS' && styles.tabButtonActive,
              ]}
              onPress={() => setActiveTab('HEARINGS')}
              testID="tab-hearings"
              accessibilityRole="button"
            >
              <Text
                style={[styles.tabText, activeTab === 'HEARINGS' && styles.tabTextActive]}
              >
                {t('cases.hearings', 'Hearings & Timeline')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'DOCUMENTS' && styles.tabButtonActive,
              ]}
              onPress={() => setActiveTab('DOCUMENTS')}
              testID="tab-documents"
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'DOCUMENTS' && styles.tabTextActive,
                ]}
              >
                {t('documents.title', 'Documents')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'NOTES' && styles.tabButtonActive]}
              onPress={() => setActiveTab('NOTES')}
              testID="tab-notes"
              accessibilityRole="button"
            >
              <Text
                style={[styles.tabText, activeTab === 'NOTES' && styles.tabTextActive]}
              >
                {t('notes.title', 'Private Notes')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'VOICE_NOTES' && styles.tabButtonActive,
              ]}
              onPress={() => setActiveTab('VOICE_NOTES')}
              testID="tab-voice-notes"
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'VOICE_NOTES' && styles.tabTextActive,
                ]}
              >
                {t('voiceNotes.title', 'Voice Notes')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'JUDGMENT' && styles.tabButtonActive,
              ]}
              onPress={() => setActiveTab('JUDGMENT')}
              testID="tab-judgment"
              accessibilityRole="button"
            >
              <Text
                style={[styles.tabText, activeTab === 'JUDGMENT' && styles.tabTextActive]}
              >
                {t('judgment.title', 'Judgment')}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {activeTab === 'DOCUMENTS' && <CaseDocumentsSection caseId={caseItem.id} />}

          {activeTab === 'NOTES' && <CaseNotesSection caseId={caseItem.id} />}

          {activeTab === 'VOICE_NOTES' && <CaseVoiceNotesSection caseId={caseItem.id} />}

          {activeTab === 'HEARINGS' && renderHearingsTimelineSection()}

          {activeTab === 'JUDGMENT' && renderJudgmentSection()}

          {activeTab === 'OVERVIEW' && (
            <>
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
                  <Text style={styles.detailValue}>
                    {caseItem.bench || 'Regular Bench'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Petitioner Advocate</Text>
                  <Text style={styles.detailValue}>
                    {caseItem.petitioner_advocate || '—'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Respondent Advocate</Text>
                  <Text style={styles.detailValue}>
                    {caseItem.respondent_advocate || '—'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Judgment Status</Text>
                  <TouchableOpacity
                    onPress={() => setActiveTab('JUDGMENT')}
                    accessibilityRole="button"
                    testID="overview-judgment-link"
                    style={styles.inlineTabJump}
                  >
                    <Text
                      style={[
                        styles.detailValue,
                        effectiveJudgment ? styles.highlightDate : undefined,
                      ]}
                    >
                      {effectiveJudgment
                        ? `Available (${formatDate(effectiveJudgment.judgment_date)})`
                        : t('cases.judgmentPending', 'Pending')}
                    </Text>
                    <AppIcon name="chevron-right" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={[styles.detailRow, styles.detailRowLast]}>
                  <Text style={styles.detailLabel}>Next Hearing Date</Text>
                  <Text style={[styles.detailValue, styles.highlightDate]}>
                    {formatDate(
                      caseItem.effective_next_hearing_date || caseItem.next_hearing_date
                    )}
                  </Text>
                </View>
              </Card>

              {renderHearingsTimelineSection()}
            </>
          )}
        </View>
      </ScrollView>

      {/* Reschedule Hearing Modal */}
      <RescheduleHearingModal
        visible={Boolean(rescheduleHearing)}
        hearing={rescheduleHearing}
        onClose={() => setRescheduleHearing(null)}
        onSuccess={() => {
          showToast('Hearing appearance rescheduled.', 'success');
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
  mainWrapper: {
    width: '100%',
    paddingHorizontal: Spacing.md,
  },
  desktopContainer: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  loadingText: {
    color: Colors.text.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  topNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 4,
    gap: 6,
  },
  backButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  bannerCard: {
    padding: 18,
    marginBottom: 16,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadows.card,
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
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bannerActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  bannerActionBtn: {
    flex: 1,
    minHeight: 44,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginBottom: 16,
    borderRadius: Radius.card,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
    ...Shadows.subtle,
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.badge + 2,
    minHeight: 44,
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  tabTextActive: {
    color: Colors.text.white,
  },
  sectionCard: {
    padding: 18,
    marginBottom: 16,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadows.subtle,
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
  detailRowLast: {
    borderBottomWidth: 0,
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
  inlineTabJump: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
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
  hearingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  hearingPrevDate: {
    color: Colors.gold,
    fontSize: 12,
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
  rescheduleLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
  },
  rescheduleLinkText: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },
});
