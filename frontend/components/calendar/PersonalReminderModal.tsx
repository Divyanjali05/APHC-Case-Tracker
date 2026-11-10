import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { AppIcon } from '../common/AppIcon';
import { Button } from '../common/Button';
import { CreatePersonalReminderPayload } from '../../types';

export interface PersonalReminderModalProps {
  visible: boolean;
  selectedDate: string;
  onClose: () => void;
  onSave: (payload: CreatePersonalReminderPayload) => Promise<void>;
  isSaving?: boolean;
}

export const PersonalReminderModal: React.FC<PersonalReminderModalProps> = ({
  visible,
  selectedDate,
  onClose,
  onSave,
  isSaving = false,
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(selectedDate);
  const [time, setTime] = useState('10:30');
  const [reminderType, setReminderType] = useState<'GENERAL' | 'FILING' | 'BATTA'>(
    'GENERAL'
  );
  const [description, setDescription] = useState('');
  const [caseId, setCaseId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      setError(t('calendar.title_required', 'Title is required.'));
      return;
    }

    try {
      setError(null);
      const combinedIso = `${date}T${time}:00`;
      await onSave({
        title: title.trim(),
        due_date: combinedIso,
        reminder_type: reminderType,
        description: description.trim(),
        case_id: caseId.trim() ? parseInt(caseId.trim(), 10) : undefined,
      });
      // Reset form
      setTitle('');
      setDescription('');
      setCaseId('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save reminder';
      setError(msg);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID="personal-reminder-modal"
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t('calendar.add_personal_reminder', 'New Reminder / Deadline')}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel={t('common.close', 'Close')}
            >
              <AppIcon name="x" size={18} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Title */}
            <Text style={styles.fieldLabel}>
              {t('calendar.reminder_title', 'Title *')}
            </Text>
            <TextInput
              testID="reminder-title-input"
              style={styles.input}
              placeholder="e.g. File Counter Affidavit or Pay Batta"
              placeholderTextColor={Colors.text.muted}
              value={title}
              onChangeText={setTitle}
            />

            {/* Type Selector */}
            <Text style={styles.fieldLabel}>
              {t('calendar.reminder_type', 'Category')}
            </Text>
            <View style={styles.typeSelectorRow}>
              {(['GENERAL', 'FILING', 'BATTA'] as const).map(tp => (
                <TouchableOpacity
                  key={tp}
                  testID={`reminder-type-${tp.toLowerCase()}`}
                  style={[styles.typeBtn, reminderType === tp && styles.typeBtnActive]}
                  onPress={() => setReminderType(tp)}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      reminderType === tp && styles.typeBtnTextActive,
                    ]}
                  >
                    {tp}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Date & Time */}
            <View style={styles.dateTimeRow}>
              <View style={styles.halfField}>
                <Text style={styles.fieldLabel}>
                  {t('calendar.date', 'Date (YYYY-MM-DD)')}
                </Text>
                <TextInput
                  testID="reminder-date-input"
                  style={styles.input}
                  value={date}
                  onChangeText={setDate}
                  placeholder="2026-11-07"
                  placeholderTextColor={Colors.text.muted}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.fieldLabel}>
                  {t('calendar.time', 'Time (HH:MM)')}
                </Text>
                <TextInput
                  testID="reminder-time-input"
                  style={styles.input}
                  value={time}
                  onChangeText={setTime}
                  placeholder="10:30"
                  placeholderTextColor={Colors.text.muted}
                />
              </View>
            </View>

            {/* Case ID */}
            <Text style={styles.fieldLabel}>
              {t('calendar.optional_case_id', 'Case ID (Optional)')}
            </Text>
            <TextInput
              testID="reminder-case-id-input"
              style={styles.input}
              placeholder="e.g. 1"
              placeholderTextColor={Colors.text.muted}
              keyboardType="numeric"
              value={caseId}
              onChangeText={setCaseId}
            />

            {/* Description */}
            <Text style={styles.fieldLabel}>
              {t('calendar.description', 'Description / Notes')}
            </Text>
            <TextInput
              testID="reminder-description-input"
              style={[styles.input, styles.multilineInput]}
              placeholder="Add preparation notes or checklist items..."
              placeholderTextColor={Colors.text.muted}
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
            />
          </ScrollView>

          <View style={styles.actions}>
            <Button
              title={t('common.cancel', 'Cancel')}
              onPress={onClose}
              variant="outline"
              style={styles.actionBtn}
              testID="cancel-reminder-btn"
            />
            <Button
              title={t('calendar.save_reminder', 'Save Reminder')}
              onPress={handleSave}
              variant="primary"
              loading={isSaving}
              style={styles.actionBtn}
              testID="save-reminder-btn"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    padding: 20,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text.primary,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
  },
  typeBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryLight,
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  typeBtnTextActive: {
    color: Colors.text.white,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
  },
});
