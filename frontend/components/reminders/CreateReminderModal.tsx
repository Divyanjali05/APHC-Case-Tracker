import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { AppIcon } from '../common/AppIcon';
import { useCreateReminder, CreateReminderPayload } from '../../features/reminders/hooks';

export interface CreateReminderModalProps {
  visible: boolean;
  onClose: () => void;
  defaultCaseId?: number | null;
  defaultHearingId?: number | null;
}

export const CreateReminderModal: React.FC<CreateReminderModalProps> = ({
  visible,
  onClose,
  defaultCaseId = null,
  defaultHearingId = null,
}) => {
  const { t } = useTranslation();
  const createMutation = useCreateReminder();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reminderType, setReminderType] = useState<
    'GENERAL' | 'FILING' | 'BATTA' | 'HEARING'
  >('GENERAL');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueDate('');
    setReminderType('GENERAL');
    setErrorMessage(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setErrorMessage(t('reminders.titleRequired', 'Title is required.'));
      return;
    }
    if (!dueDate.trim()) {
      setErrorMessage(
        t('reminders.dueDateRequired', 'Due date is required (YYYY-MM-DD).')
      );
      return;
    }

    setErrorMessage(null);
    const payload: CreateReminderPayload = {
      title: title.trim(),
      description: description.trim(),
      due_date: dueDate.includes('T') ? dueDate.trim() : `${dueDate.trim()}T10:30:00Z`,
      reminder_type: reminderType,
      case: defaultCaseId,
      hearing: defaultHearingId,
    };

    try {
      await createMutation.mutateAsync(payload);
      handleClose();
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { detail?: string; error?: string } } })
        ?.response;
      const msg =
        resp?.data?.detail ||
        resp?.data?.error ||
        t('reminders.createFailed', 'Failed to create reminder. Please try again.');
      setErrorMessage(msg);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      testID="create-reminder-modal"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheetContainer}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.headerRow}>
              <Text style={styles.sheetTitle} testID="create-reminder-heading">
                {t('reminders.newReminderTitle', 'New Compliance Reminder')}
              </Text>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeIconBtn}
                testID="reminder-cancel-btn"
                accessibilityLabel={t('common.close', 'Close')}
              >
                <AppIcon name="x" size={18} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>

            {errorMessage ? (
              <View style={styles.errorBanner} testID="reminder-error-banner">
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Title Input */}
            <Text style={styles.label}>
              {t('reminders.fieldTitle', 'Reminder Title *')}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. File Counter Affidavit"
              placeholderTextColor={Colors.text.muted}
              value={title}
              onChangeText={setTitle}
              testID="reminder-title-input"
            />

            {/* Description Input */}
            <Text style={styles.label}>
              {t('reminders.fieldDescription', 'Description')}
            </Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Add relevant instructions, docket notes..."
              placeholderTextColor={Colors.text.muted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              testID="reminder-description-input"
            />

            {/* Due Date Input */}
            <Text style={styles.label}>
              {t('reminders.fieldDueDate', 'Due Date (YYYY-MM-DD) *')}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="2026-11-20"
              placeholderTextColor={Colors.text.muted}
              value={dueDate}
              onChangeText={setDueDate}
              testID="reminder-due-date-input"
            />

            {/* Type Selector */}
            <Text style={styles.label}>{t('reminders.fieldType', 'Category')}</Text>
            <View style={styles.chipRow}>
              {(['GENERAL', 'FILING', 'BATTA', 'HEARING'] as const).map(typeKey => (
                <TouchableOpacity
                  key={typeKey}
                  style={[
                    styles.typeChip,
                    reminderType === typeKey && styles.typeChipActive,
                  ]}
                  onPress={() => setReminderType(typeKey)}
                  testID={`reminder-type-${typeKey.toLowerCase()}`}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      reminderType === typeKey && styles.typeChipTextActive,
                    ]}
                  >
                    {typeKey}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Action Buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleClose}
                disabled={createMutation.isPending}
              >
                <Text style={styles.cancelBtnText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, createMutation.isPending && styles.disabledBtn]}
                onPress={handleSubmit}
                disabled={createMutation.isPending}
                testID="reminder-submit-btn"
              >
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {t('reminders.saveReminder', 'Save Reminder')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  content: {
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  closeIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    backgroundColor: Colors.dangerSurface,
    borderColor: Colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: Colors.surfaceSubtle,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text.primary,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    marginBottom: 16,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  typeChipTextActive: {
    color: Colors.text.white,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelBtnText: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  submitBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: Colors.text.white,
    fontWeight: '700',
  },
});
