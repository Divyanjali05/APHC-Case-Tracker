import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { VoiceInputModal } from '../speech/VoiceInputModal';
import { Colors } from '../../constants/colors';
import { HearingItem } from '../../types';
import { formatDate } from '../../utils/formatters';
import { useRescheduleHearing } from '../../features/cases/hooks';

export interface RescheduleHearingModalProps {
  visible: boolean;
  hearing: HearingItem | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const RescheduleHearingModal: React.FC<RescheduleHearingModalProps> = ({
  visible,
  hearing,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const rescheduleMutation = useRescheduleHearing();

  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('10:30');
  const [reason, setReason] = useState('');
  const [courtHall, setCourtHall] = useState('');
  const [itemNumber, setItemNumber] = useState('');
  const [validationError, setValidationError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);

  if (!visible || !hearing) {
    return null;
  }

  const handleReset = () => {
    setNewDate('');
    setNewTime('10:30');
    setReason('');
    setCourtHall('');
    setItemNumber('');
    setValidationError('');
    setConfirmed(false);
    onClose();
  };

  const validate = (): boolean => {
    setValidationError('');
    if (!newDate.trim()) {
      setValidationError(
        t('hearings.dateRequired', 'New hearing date is required (YYYY-MM-DD).')
      );
      return false;
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(newDate.trim())) {
      setValidationError(
        t('hearings.dateFormatInvalid', 'Date must be in YYYY-MM-DD format.')
      );
      return false;
    }

    const parsed = new Date(newDate.trim());
    if (isNaN(parsed.getTime())) {
      setValidationError(
        t('hearings.dateInvalid', 'Please enter a valid calendar date.')
      );
      return false;
    }

    return true;
  };

  const handleProceed = () => {
    if (validate()) {
      setConfirmed(true);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!validate()) return;

    try {
      await rescheduleMutation.mutateAsync({
        caseId: hearing.case,
        hearingId: hearing.id,
        payload: {
          new_hearing_date: newDate.trim(),
          new_hearing_time: newTime.trim() ? `${newTime.trim()}:00` : undefined,
          reason: reason.trim(),
          court_hall_number: courtHall.trim()
            ? parseInt(courtHall.trim(), 10)
            : undefined,
          item_number: itemNumber.trim() ? parseInt(itemNumber.trim(), 10) : undefined,
        },
      });

      handleReset();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response
          ?.data?.error?.message ||
        t(
          'hearings.rescheduleFailed',
          'Unable to reschedule hearing. Please verify the date.'
        );
      setValidationError(
        typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)
      );
      setConfirmed(false);
    }
  };

  const caseTitle = hearing.case_details
    ? hearing.case_details.formatted_case_number
    : `Case #${hearing.case}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleReset}
      testID="reschedule-hearing-modal"
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <Text style={styles.headerTitle}>
                {t('hearings.rescheduleTitle', 'Reschedule Hearing')}
              </Text>
              <Text style={styles.headerSubtitle}>{caseTitle}</Text>
            </View>
            <TouchableOpacity
              onPress={handleReset}
              style={styles.closeButton}
              testID="reschedule-modal-close-btn"
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Current Schedule Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {t('hearings.currentDate', 'Current Appearance')}:
                </Text>
                <Text style={styles.summaryValue}>
                  {formatDate(hearing.hearing_date)}{' '}
                  {hearing.hearing_time ? `at ${hearing.hearing_time}` : ''}
                </Text>
              </View>
              {hearing.court_hall_number ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {t('tokens.hall', 'Court Hall')}:
                  </Text>
                  <Text style={styles.summaryValue}>
                    Hall {hearing.court_hall_number} (Item #{hearing.item_number || '—'})
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Error Banner */}
            {validationError ? (
              <View style={styles.errorBanner} testID="reschedule-validation-error">
                <Text style={styles.errorBannerText}>{validationError}</Text>
              </View>
            ) : null}

            {!confirmed ? (
              /* Reschedule Form Inputs */
              <View style={styles.formContainer}>
                <Text style={styles.inputLabel}>
                  {t('hearings.newHearingDate', 'New Hearing Date')} *
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD (e.g. 2026-11-20)"
                  placeholderTextColor={Colors.text.muted}
                  value={newDate}
                  onChangeText={setNewDate}
                  testID="reschedule-input-date"
                  autoCapitalize="none"
                />

                <Text style={styles.inputLabel}>
                  {t('hearings.appearanceTime', 'Appearance Time (HH:MM)')}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="10:30"
                  placeholderTextColor={Colors.text.muted}
                  value={newTime}
                  onChangeText={setNewTime}
                  testID="reschedule-input-time"
                  autoCapitalize="none"
                />

                <View style={styles.inputRow}>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>
                      {t('tokens.hall', 'Court Hall')}
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 3"
                      placeholderTextColor={Colors.text.muted}
                      value={courtHall}
                      onChangeText={setCourtHall}
                      keyboardType="numeric"
                      testID="reschedule-input-hall"
                    />
                  </View>

                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>{t('tokens.item', 'Item #')}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 14"
                      placeholderTextColor={Colors.text.muted}
                      value={itemNumber}
                      onChangeText={setItemNumber}
                      keyboardType="numeric"
                      testID="reschedule-input-item"
                    />
                  </View>
                </View>

                <View style={styles.reasonHeaderRow}>
                  <Text style={styles.inputLabel}>
                    {t('hearings.reason', 'Adjournment / Rescheduling Reason')}
                  </Text>
                  <TouchableOpacity
                    style={styles.voiceReasonBtn}
                    onPress={() => setIsVoiceModalVisible(true)}
                    testID="reschedule-voice-reason-button"
                    accessibilityLabel={t('voice.dictateReason', 'Voice Dictation')}
                    accessibilityRole="button"
                  >
                    <Text style={styles.voiceReasonBtnText}>
                      🎤 {t('voice.dictateReason', 'Dictate')}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder={t(
                    'hearings.reasonPlaceholder',
                    'e.g. Court administrative adjournment / Advocate engagement'
                  )}
                  placeholderTextColor={Colors.text.muted}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={3}
                  testID="reschedule-input-reason"
                />

                <Button
                  title={t('hearings.proceedButton', 'Proceed to Confirmation')}
                  variant="primary"
                  onPress={handleProceed}
                  style={styles.actionBtn}
                  testID="reschedule-proceed-btn"
                />
              </View>
            ) : (
              /* Confirmation Screen Before Saving */
              <View style={styles.confirmationBox} testID="reschedule-confirmation-view">
                <Badge
                  label={t('hearings.confirmRequired', 'Confirmation Required')}
                  variant="warning"
                />
                <Text style={styles.confirmationTitle}>
                  {t('hearings.confirmQuestion', 'Confirm Hearing Rescheduling?')}
                </Text>
                <Text style={styles.confirmationText}>
                  {t(
                    'hearings.confirmNotice',
                    'Rescheduling this appearance will update the official case docket, record an audit event, invalidate pending reminders, and schedule fresh reminders for the new date.'
                  )}
                </Text>

                <View style={styles.diffPreview}>
                  <Text style={styles.diffLine}>
                    <Text style={styles.diffLabel}>
                      {t('history.previous', 'Previous')}:{' '}
                    </Text>
                    {formatDate(hearing.hearing_date)} {hearing.hearing_time || ''}
                  </Text>
                  <Text style={styles.diffLine}>
                    <Text style={styles.diffLabel}>{t('history.new', 'New Date')}: </Text>
                    {newDate} {newTime}
                  </Text>
                  {reason ? (
                    <Text style={styles.diffLine}>
                      <Text style={styles.diffLabel}>
                        {t('hearings.reason', 'Reason')}:{' '}
                      </Text>
                      {reason}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.buttonRow}>
                  <Button
                    title={t('common.cancel', 'Back')}
                    variant="outline"
                    onPress={() => setConfirmed(false)}
                    disabled={rescheduleMutation.isPending}
                    style={styles.backBtn}
                    testID="reschedule-back-btn"
                  />
                  <Button
                    title={
                      rescheduleMutation.isPending
                        ? t('common.save', 'Saving...')
                        : t('hearings.confirmAndSave', 'Confirm & Save')
                    }
                    variant="primary"
                    onPress={handleConfirmSubmit}
                    disabled={rescheduleMutation.isPending}
                    style={styles.confirmBtn}
                    testID="reschedule-confirm-btn"
                  />
                </View>

                {rescheduleMutation.isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={Colors.primaryLight}
                    style={{ marginTop: 12 }}
                  />
                ) : null}
              </View>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Voice Dictation Modal for Reschedule Reason */}
      <VoiceInputModal
        visible={isVoiceModalVisible}
        onClose={() => setIsVoiceModalVisible(false)}
        onApply={recognizedText => setReason(recognizedText)}
        title={t('voice.dictateReason', 'Voice Dictation')}
        placeholder={t(
          'hearings.reasonPlaceholder',
          'e.g. Court administrative adjournment / Advocate engagement'
        )}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitleGroup: {
    flex: 1,
  },
  headerTitle: {
    color: Colors.text.primary,
    fontSize: 17,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    marginLeft: 8,
  },
  closeButtonText: {
    color: Colors.text.secondary,
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 18,
  },
  summaryCard: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.gold,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  summaryLabel: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryValue: {
    color: Colors.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
  },
  formContainer: {
    gap: 8,
  },
  reasonHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  voiceReasonBtn: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  voiceReasonBtnText: {
    fontSize: 11,
    color: Colors.gold,
    fontWeight: '600',
  },
  inputLabel: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: Colors.text.primary,
    fontSize: 14,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  actionBtn: {
    marginTop: 16,
  },
  confirmationBox: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.gold,
    alignItems: 'center',
  },
  confirmationTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 6,
    textAlign: 'center',
  },
  confirmationText: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 14,
  },
  diffPreview: {
    width: '100%',
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  diffLine: {
    color: Colors.text.primary,
    fontSize: 13,
    paddingVertical: 3,
  },
  diffLabel: {
    color: Colors.text.muted,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  backBtn: {
    flex: 1,
  },
  confirmBtn: {
    flex: 1,
  },
});
