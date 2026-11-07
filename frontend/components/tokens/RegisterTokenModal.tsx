import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Button } from '../common/Button';
import { Colors } from '../../constants/colors';
import { CaseItem, CourtHallItem, CreateTokenAlertPayload } from '../../types';

export interface RegisterTokenModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateTokenAlertPayload) => Promise<void>;
  courtHalls: CourtHallItem[];
  cases: CaseItem[];
  isSubmitting?: boolean;
}

export const RegisterTokenModal: React.FC<RegisterTokenModalProps> = ({
  visible,
  onClose,
  onSubmit,
  courtHalls,
  cases,
  isSubmitting = false,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(
    cases.length > 0 ? cases[0].id : null
  );
  const [selectedHallId, setSelectedHallId] = useState<number | null>(
    courtHalls.length > 0 ? courtHalls[0].id : null
  );
  const [tokenNumber, setTokenNumber] = useState('');
  const [itemNumber, setItemNumber] = useState('');
  const [hearingDate, setHearingDate] = useState(todayStr);
  const [threshold, setThreshold] = useState('5');
  const [alertOnApproach, setAlertOnApproach] = useState(true);
  const [alertOnCalled, setAlertOnCalled] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  if (!visible) return null;

  const handleSubmit = async () => {
    setFormError(null);

    const effectiveCaseId = selectedCaseId || (cases.length > 0 ? cases[0].id : null);
    if (!effectiveCaseId) {
      setFormError('Please select or track an associated case first.');
      return;
    }

    const effectiveHallId =
      selectedHallId || (courtHalls.length > 0 ? courtHalls[0].id : null);
    if (!effectiveHallId) {
      setFormError('Please select an active court hall.');
      return;
    }

    const trimmedToken = tokenNumber.trim();
    if (!trimmedToken) {
      setFormError('Token number is required (e.g. CH1-15 or 15).');
      return;
    }

    const parsedItem = parseInt(itemNumber, 10);
    if (isNaN(parsedItem) || parsedItem <= 0) {
      setFormError('Listed item number must be a valid positive number.');
      return;
    }

    const parsedThreshold = parseInt(threshold, 10);
    if (isNaN(parsedThreshold) || parsedThreshold < 1 || parsedThreshold > 20) {
      setFormError('Alert proximity threshold must be between 1 and 20.');
      return;
    }

    if (!hearingDate || hearingDate < todayStr) {
      setFormError('Hearing date must be today or a future date.');
      return;
    }

    try {
      await onSubmit({
        case: effectiveCaseId,
        court_hall: effectiveHallId,
        token_number: trimmedToken,
        listed_item_number: parsedItem,
        hearing_date: hearingDate,
        alert_threshold: parsedThreshold,
        alert_on_approach: alertOnApproach,
        alert_on_called: alertOnCalled,
      });
      // Reset form
      setTokenNumber('');
      setItemNumber('');
      setFormError(null);
      onClose();
    } catch (err: unknown) {
      const errorObj = err as {
        response?: {
          data?: {
            error?: {
              message?: {
                non_field_errors?: string[];
                token_number?: string[];
                case?: string[];
              };
            };
          };
        };
        message?: string;
      };
      const msg =
        errorObj?.response?.data?.error?.message?.non_field_errors?.[0] ||
        errorObj?.response?.data?.error?.message?.token_number?.[0] ||
        errorObj?.response?.data?.error?.message?.case?.[0] ||
        errorObj?.message ||
        'Failed to register token alert.';
      setFormError(msg);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID="register-token-modal"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Register Court Token Alert</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="close-modal-button"
            >
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {formError && (
              <View style={styles.errorBanner} testID="validation-error">
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}

            {/* Case Selection */}
            <Text style={styles.inputLabel}>Associated Case *</Text>
            {cases.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillScroll}
              >
                {cases.map(c => {
                  const isSelected = (selectedCaseId || cases[0].id) === c.id;
                  const label = `${c.case_type} ${c.case_number}/${c.filing_year}`;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.pill, isSelected && styles.pillSelected]}
                      onPress={() => setSelectedCaseId(c.id)}
                      testID={`case-option-${c.id}`}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          isSelected && styles.pillTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.hintText}>
                No tracked cases found. Please track a case first.
              </Text>
            )}

            {/* Court Hall Selection */}
            <Text style={styles.inputLabel}>Court Hall *</Text>
            {courtHalls.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillScroll}
              >
                {courtHalls.map(h => {
                  const isSelected = (selectedHallId || courtHalls[0].id) === h.id;
                  return (
                    <TouchableOpacity
                      key={h.id}
                      style={[styles.pill, isSelected && styles.pillSelected]}
                      onPress={() => setSelectedHallId(h.id)}
                      testID={`hall-option-${h.id}`}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          isSelected && styles.pillTextSelected,
                        ]}
                      >
                        Hall {h.hall_number}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.hintText}>No active court halls found.</Text>
            )}

            {/* Token Number */}
            <Text style={styles.inputLabel}>Token Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. CH1-15 or 15"
              placeholderTextColor={Colors.text.muted}
              value={tokenNumber}
              onChangeText={setTokenNumber}
              testID="token-number-input"
            />

            {/* Listed Item Number */}
            <Text style={styles.inputLabel}>Cause List Item Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 15"
              placeholderTextColor={Colors.text.muted}
              value={itemNumber}
              onChangeText={setItemNumber}
              keyboardType="number-pad"
              testID="item-number-input"
            />

            {/* Hearing Date */}
            <Text style={styles.inputLabel}>Hearing Date (YYYY-MM-DD) *</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.text.muted}
              value={hearingDate}
              onChangeText={setHearingDate}
              testID="hearing-date-input"
            />

            {/* Alert Threshold */}
            <Text style={styles.inputLabel}>
              Alert Proximity Threshold (Items Before Call)
            </Text>
            <TextInput
              style={styles.input}
              placeholder="5"
              placeholderTextColor={Colors.text.muted}
              value={threshold}
              onChangeText={setThreshold}
              keyboardType="number-pad"
              testID="threshold-input"
            />

            {/* Notification Preferences */}
            <Text style={styles.inputLabel}>Notification Triggers</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, alertOnApproach && styles.toggleBtnActive]}
                onPress={() => setAlertOnApproach(!alertOnApproach)}
                testID="approach-toggle"
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    alertOnApproach && styles.toggleBtnTextActive,
                  ]}
                >
                  {alertOnApproach ? '✓ Approaching Alert ON' : '✗ Approaching Alert OFF'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toggleBtn, alertOnCalled && styles.toggleBtnActive]}
                onPress={() => setAlertOnCalled(!alertOnCalled)}
                testID="called-toggle"
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    alertOnCalled && styles.toggleBtnTextActive,
                  ]}
                >
                  {alertOnCalled ? '✓ Called Alert ON' : '✗ Called Alert OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Transparency Note */}
            <View style={styles.transparencyBox}>
              <Text style={styles.transparencyText}>
                APHC Compliance Notice: Official live token data feeds are used when
                authorized. In testing/demo mode, deterministic simulation data is
                indicated with a DEMO badge.
              </Text>
            </View>
          </ScrollView>

          {/* Modal Actions */}
          <View style={styles.modalFooter}>
            <Button
              title="Cancel"
              variant="outline"
              onPress={onClose}
              style={styles.footerBtn}
            />
            <Button
              title={isSubmitting ? 'Registering...' : 'Register Alert'}
              variant="primary"
              onPress={handleSubmit}
              loading={isSubmitting}
              style={styles.footerBtn}
              testID="submit-alert-button"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: Colors.text.white,
    fontSize: 18,
    fontWeight: '800',
  },
  closeIcon: {
    color: Colors.text.muted,
    fontSize: 20,
    fontWeight: '700',
  },
  formScroll: {
    marginBottom: 16,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  inputLabel: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 8,
  },
  hintText: {
    color: Colors.text.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  pillScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  pill: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
  },
  pillSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryLight,
  },
  pillText: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextSelected: {
    color: Colors.text.white,
    fontWeight: '700',
  },
  input: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    color: Colors.text.white,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: Colors.success,
  },
  toggleBtnText: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: Colors.success,
    fontWeight: '700',
  },
  transparencyBox: {
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    borderWidth: 1,
    borderColor: Colors.gold,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    marginBottom: 10,
  },
  transparencyText: {
    color: Colors.gold,
    fontSize: 11,
    lineHeight: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
  },
  footerBtn: {
    flex: 1,
  },
});
