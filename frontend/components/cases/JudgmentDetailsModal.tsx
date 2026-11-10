import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { AppIcon } from '../common/AppIcon';
import { Colors } from '../../constants/colors';
import { CaseItem, JudgmentItem } from '../../types';
import { formatCaseNumber, formatDate } from '../../utils/formatters';

export interface JudgmentDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  caseItem: CaseItem | null;
  judgment?: JudgmentItem | null;
}

export const isOfficialJudgmentDocumentAvailable = (link?: string | null): boolean => {
  if (!link || typeof link !== 'string') return false;
  const trimmed = link.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('example.com') ||
    lower.includes('example.org') ||
    lower.includes('example.net') ||
    lower.includes('placeholder')
  ) {
    return false;
  }
  return true;
};

export const JudgmentDetailsModal: React.FC<JudgmentDetailsModalProps> = ({
  visible,
  onClose,
  caseItem,
  judgment,
}) => {
  const { t } = useTranslation();

  if (!visible || !caseItem) {
    return null;
  }

  const effectiveJudgment = judgment || caseItem.latest_judgment;
  const hasValidDocument = isOfficialJudgmentDocumentAvailable(
    effectiveJudgment?.document_link
  );

  const handleOpenDocument = async () => {
    if (!hasValidDocument || !effectiveJudgment?.document_link) {
      Alert.alert(
        t('judgment.noDocTitle', 'No Document Attached'),
        t('judgment.docNotUploaded', 'Official judgment PDF has not been uploaded yet.')
      );
      return;
    }

    try {
      const supported = await Linking.canOpenURL(effectiveJudgment.document_link);
      if (supported) {
        await Linking.openURL(effectiveJudgment.document_link);
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID="judgment-details-modal"
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <Card style={styles.contentCard}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleWrap}>
                <Text style={styles.title} testID="judgment-modal-title">
                  {formatCaseNumber(
                    caseItem.case_type,
                    caseItem.case_number,
                    caseItem.filing_year
                  )}
                </Text>
                <Text style={styles.parties} numberOfLines={2}>
                  {caseItem.petitioner} vs {caseItem.respondent}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                testID="judgment-modal-close"
                accessibilityLabel={t('common.close', 'Close')}
              >
                <AppIcon name="x" size={16} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Judgment Status Banner */}
              <View style={styles.statusRow}>
                <Badge
                  label={t('cases.judgmentAvailable', 'Judgment Available')}
                  variant="gold"
                />
                <Text style={styles.judgmentDateText} testID="judgment-modal-date">
                  {effectiveJudgment?.judgment_date
                    ? formatDate(effectiveJudgment.judgment_date)
                    : t('cases.judgmentPending', 'Pending')}
                </Text>
              </View>

              {/* Bench & Order Number */}
              <View style={styles.metaSection}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t('judgment.bench', 'Bench')}:</Text>
                  <Text style={styles.metaValue}>
                    {effectiveJudgment?.bench || caseItem.bench || 'Regular Bench'}
                  </Text>
                </View>
                {effectiveJudgment?.order_number ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>
                      {t('judgment.orderNumber', 'Order Number')}:
                    </Text>
                    <Text style={styles.metaValue}>{effectiveJudgment.order_number}</Text>
                  </View>
                ) : null}
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>
                    {t('cases.filingYear', 'Filing Year')}:
                  </Text>
                  <Text style={styles.metaValue}>{caseItem.filing_year}</Text>
                </View>
              </View>

              {/* Summary */}
              <View style={styles.summarySection}>
                <Text style={styles.sectionHeading}>
                  {t('judgment.summary', 'Judgment Summary')}
                </Text>
                <Text style={styles.summaryText} testID="judgment-modal-summary">
                  {effectiveJudgment?.summary
                    ? effectiveJudgment.summary
                    : t(
                        'judgment.noSummary',
                        'Detailed judgment summary not entered yet. Please refer to official order copy.'
                      )}
                </Text>
              </View>

              {/* Document Reference */}
              <View style={styles.documentSection}>
                <Text style={styles.sectionHeading}>
                  {t('judgment.document', 'Official Order Document')}
                </Text>
                {hasValidDocument ? (
                  <Button
                    title={t('judgment.downloadDoc', 'Open Official Judgment (PDF)')}
                    variant="primary"
                    onPress={handleOpenDocument}
                    testID="open-judgment-doc-button"
                  />
                ) : (
                  <View style={styles.noDocNotice} testID="no-judgment-doc-notice">
                    <Text style={styles.noDocText} testID="no-judgment-doc-text">
                      {t(
                        'judgment.docNotUploaded',
                        'Official judgment PDF has not been uploaded yet.'
                      )}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Footer action */}
            <View style={styles.footer}>
              <Button
                title={t('common.close', 'Close')}
                variant="outline"
                onPress={onClose}
              />
            </View>
          </Card>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '85%',
  },
  contentCard: {
    padding: 20,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 12,
    marginBottom: 12,
  },
  headerTitleWrap: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    color: Colors.text.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  parties: {
    color: Colors.text.secondary,
    fontSize: 12,
    marginTop: 4,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSubtle,
  },
  scrollBody: {
    maxHeight: 380,
  },
  scrollContent: {
    paddingVertical: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  judgmentDateText: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '700',
  },
  metaSection: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderColor: Colors.border,
    borderWidth: 1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  metaLabel: {
    color: Colors.text.muted,
    fontSize: 12,
  },
  metaValue: {
    color: Colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  summarySection: {
    marginBottom: 16,
  },
  sectionHeading: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  summaryText: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.gold,
  },
  documentSection: {
    marginBottom: 16,
  },
  noDocNotice: {
    padding: 12,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderColor: Colors.border,
    borderWidth: 1,
  },
  noDocText: {
    color: Colors.text.muted,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginTop: 8,
  },
});
