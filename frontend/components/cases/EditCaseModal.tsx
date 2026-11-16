import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '../common/AppIcon';
import { Button } from '../common/Button';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { CaseItem } from '../../types';
import { useUpdateCase } from '../../features/cases/hooks';
import { useToast } from '../common/Toast';
import { formatCaseNumber } from '../../utils/formatters';

export interface EditCaseModalProps {
  visible: boolean;
  onClose: () => void;
  caseItem: CaseItem | null;
  onSuccess?: () => void;
  testID?: string;
}

export const EditCaseModal: React.FC<EditCaseModalProps> = ({
  visible,
  onClose,
  caseItem,
  onSuccess,
  testID = 'edit-case-modal',
}) => {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { showToast } = useToast();
  const updateCaseMutation = useUpdateCase();

  const [petitioner, setPetitioner] = useState('');
  const [respondent, setRespondent] = useState('');
  const [petitionerAdvocate, setPetitionerAdvocate] = useState('');
  const [respondentAdvocate, setRespondentAdvocate] = useState('');
  const [currentStage, setCurrentStage] = useState('');
  const [bench, setBench] = useState('');
  const [courtHallNumber, setCourtHallNumber] = useState('');
  const [nextHearingDate, setNextHearingDate] = useState('');
  const [status, setStatus] = useState<string>('PENDING');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (caseItem) {
      setPetitioner(caseItem.petitioner || '');
      setRespondent(caseItem.respondent || '');
      setPetitionerAdvocate(caseItem.petitioner_advocate || '');
      setRespondentAdvocate(caseItem.respondent_advocate || '');
      setCurrentStage(caseItem.current_stage || '');
      setBench(caseItem.bench || '');
      setCourtHallNumber(
        caseItem.court_hall_number !== null && caseItem.court_hall_number !== undefined
          ? String(caseItem.court_hall_number)
          : ''
      );
      setNextHearingDate(
        caseItem.effective_next_hearing_date || caseItem.next_hearing_date || ''
      );
      setStatus(caseItem.status || 'PENDING');
      setFormError(null);
    }
  }, [caseItem, visible]);

  if (!caseItem) return null;

  const handleSubmit = async () => {
    setFormError(null);

    if (!petitioner.trim()) {
      setFormError('Petitioner name is required.');
      return;
    }
    if (!respondent.trim()) {
      setFormError('Respondent name is required.');
      return;
    }

    try {
      const parsedCourtHall = courtHallNumber.trim()
        ? parseInt(courtHallNumber.trim(), 10)
        : null;

      await updateCaseMutation.mutateAsync({
        id: caseItem.id,
        payload: {
          petitioner: petitioner.trim(),
          respondent: respondent.trim(),
          petitioner_advocate: petitionerAdvocate.trim() || undefined,
          respondent_advocate: respondentAdvocate.trim() || undefined,
          current_stage: currentStage.trim() || undefined,
          bench: bench.trim() || undefined,
          court_hall_number: isNaN(parsedCourtHall as number) ? null : parsedCourtHall,
          next_hearing_date: nextHearingDate.trim() || null,
          status: status as 'PENDING' | 'DISPOSED' | 'ADJOURNED',
        },
      });

      showToast('Case details updated successfully.', 'success');
      onSuccess?.();
      onClose();
    } catch {
      setFormError('Failed to update case details. Please verify your connection.');
    }
  };

  if (!visible || !caseItem) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.modalContainer,
            isDesktop && styles.modalContainerDesktop,
            { maxHeight: Math.min(height * 0.92, 720) },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>
                {t('cases.editCaseTitle', 'Edit Case Details')}
              </Text>
              <Text style={styles.headerSub}>
                {formatCaseNumber(
                  caseItem.case_type,
                  caseItem.case_number,
                  caseItem.filing_year
                )}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
              testID="edit-case-close-btn"
            >
              <AppIcon name="x" size={18} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Form Scroll Body */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {formError ? (
              <View style={styles.errorBanner} testID="edit-case-error-banner">
                <AppIcon name="alert-circle" size={16} color={Colors.danger} />
                <Text style={styles.errorBannerText}>{formError}</Text>
              </View>
            ) : null}

            {/* Status Selector */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Current Status</Text>
              <View style={styles.statusPills}>
                {(['PENDING', 'ADJOURNED', 'DISPOSED'] as const).map(st => {
                  const isSelected = status.toUpperCase() === st;
                  if (!visible || !caseItem) return null;

                  return (
                    <TouchableOpacity
                      key={st}
                      style={[styles.statusPill, isSelected && styles.statusPillActive]}
                      onPress={() => setStatus(st)}
                      testID={`edit-case-status-${st.toLowerCase()}`}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          isSelected && styles.statusPillTextActive,
                        ]}
                      >
                        {st.charAt(0) + st.slice(1).toLowerCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Petitioner */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Petitioner Name *</Text>
              <TextInput
                style={styles.textInput}
                value={petitioner}
                onChangeText={setPetitioner}
                placeholder="Petitioner name"
                placeholderTextColor={Colors.text.muted}
                testID="edit-case-petitioner-input"
              />
            </View>

            {/* Respondent */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Respondent Name *</Text>
              <TextInput
                style={styles.textInput}
                value={respondent}
                onChangeText={setRespondent}
                placeholder="Respondent name"
                placeholderTextColor={Colors.text.muted}
                testID="edit-case-respondent-input"
              />
            </View>

            {/* Advocates Row */}
            <View style={styles.row}>
              <View style={styles.halfCol}>
                <Text style={styles.fieldLabel}>Petitioner Advocate</Text>
                <TextInput
                  style={styles.textInput}
                  value={petitionerAdvocate}
                  onChangeText={setPetitionerAdvocate}
                  placeholder="Advocate name"
                  placeholderTextColor={Colors.text.muted}
                  testID="edit-case-pet-adv-input"
                />
              </View>
              <View style={styles.halfCol}>
                <Text style={styles.fieldLabel}>Respondent Advocate</Text>
                <TextInput
                  style={styles.textInput}
                  value={respondentAdvocate}
                  onChangeText={setRespondentAdvocate}
                  placeholder="Advocate name"
                  placeholderTextColor={Colors.text.muted}
                  testID="edit-case-res-adv-input"
                />
              </View>
            </View>

            {/* Current Stage */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Case Stage / Listing Stage</Text>
              <TextInput
                style={styles.textInput}
                value={currentStage}
                onChangeText={setCurrentStage}
                placeholder="e.g. Regular List / Notice Stage / Final Hearing"
                placeholderTextColor={Colors.text.muted}
                testID="edit-case-stage-input"
              />
            </View>

            {/* Bench & Court Hall */}
            <View style={styles.row}>
              <View style={styles.halfCol}>
                <Text style={styles.fieldLabel}>Bench</Text>
                <TextInput
                  style={styles.textInput}
                  value={bench}
                  onChangeText={setBench}
                  placeholder="e.g. Single Bench / Division Bench"
                  placeholderTextColor={Colors.text.muted}
                  testID="edit-case-bench-input"
                />
              </View>
              <View style={styles.halfCol}>
                <Text style={styles.fieldLabel}>Court Hall No.</Text>
                <TextInput
                  style={styles.textInput}
                  value={courtHallNumber}
                  onChangeText={setCourtHallNumber}
                  placeholder="e.g. 4, 12"
                  keyboardType="numeric"
                  placeholderTextColor={Colors.text.muted}
                  testID="edit-case-courthall-input"
                />
              </View>
            </View>

            {/* Next Hearing Date */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Next Hearing Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.textInput}
                value={nextHearingDate}
                onChangeText={setNextHearingDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.text.muted}
                testID="edit-case-hearing-date-input"
              />
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={updateCaseMutation.isPending}
              testID="edit-case-cancel-btn"
            >
              <Text style={styles.cancelBtnText}>{t('common.cancel', 'Cancel')}</Text>
            </TouchableOpacity>

            <Button
              title={
                updateCaseMutation.isPending
                  ? t('common.saving', 'Saving...')
                  : t('common.saveChanges', 'Save Changes')
              }
              variant="primary"
              loading={updateCaseMutation.isPending}
              onPress={handleSubmit}
              style={styles.submitBtn}
              testID="edit-case-submit-btn"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.card,
  },
  modalContainerDesktop: {
    maxWidth: 580,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 6,
  },
  scrollArea: {
    flexGrow: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: Radius.button,
  },
  errorBannerText: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: '500',
    flex: 1,
  },
  formGroup: {
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfCol: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    height: 42,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.button,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  statusPills: {
    flexDirection: 'row',
    gap: 8,
  },
  statusPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.button,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusPillActive: {
    backgroundColor: Colors.surfaceBlue,
    borderColor: Colors.primary,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  statusPillTextActive: {
    fontWeight: '700',
    color: Colors.primary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Radius.button,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  submitBtn: {
    minWidth: 130,
    height: 42,
  },
});
