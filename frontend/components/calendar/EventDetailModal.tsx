import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { AppIcon } from '../common/AppIcon';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import {
  AgendaEventUnion,
  AgendaHearingItem,
  AgendaReminderItem,
  AgendaTokenItem,
} from '../../types';

export interface EventDetailModalProps {
  visible: boolean;
  event: AgendaEventUnion | null;
  onClose: () => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  visible,
  event,
  onClose,
}) => {
  const router = useRouter();
  const { t } = useTranslation();

  if (!event) return null;

  const isHearing = event.event_type === 'HEARING';
  const isToken = event.event_type === 'TOKEN';
  const hearing = isHearing ? (event as AgendaHearingItem) : null;
  const reminder = !isHearing && !isToken ? (event as AgendaReminderItem) : null;
  const token = isToken ? (event as AgendaTokenItem) : null;

  const caseId = hearing?.case_id || reminder?.case_id || token?.case_id;

  const handleOpenCase = () => {
    if (caseId) {
      onClose();
      router.push(`/cases/${caseId}`);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID="event-detail-modal"
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Badge
                label={event.event_type}
                variant={isHearing ? 'primary' : isToken ? 'gold' : 'secondary'}
              />
              <Text style={styles.title} numberOfLines={2}>
                {event.title}
              </Text>
            </View>
            <TouchableOpacity
              testID="close-detail-modal-btn"
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel={t('common.close', 'Close')}
            >
              <AppIcon name="x" size={18} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            {/* Hearing Details */}
            {hearing && (
              <View style={styles.section}>
                <View style={styles.row}>
                  <Text style={styles.label}>
                    {t('calendar.case_no', 'Case Number')}:
                  </Text>
                  <Text style={styles.value}>{hearing.case_number}</Text>
                </View>
                {hearing.petitioner && hearing.respondent && (
                  <View style={styles.row}>
                    <Text style={styles.label}>{t('calendar.parties', 'Parties')}:</Text>
                    <Text style={styles.value}>
                      {hearing.petitioner} v. {hearing.respondent}
                    </Text>
                  </View>
                )}
                <View style={styles.row}>
                  <Text style={styles.label}>
                    {t('calendar.court_hall', 'Court Hall')}:
                  </Text>
                  <Text style={styles.value}>
                    Hall {hearing.court_hall_number || '—'} (Item #
                    {hearing.item_number || '—'})
                  </Text>
                </View>
                {hearing.bench ? (
                  <View style={styles.row}>
                    <Text style={styles.label}>{t('calendar.bench', 'Bench')}:</Text>
                    <Text style={styles.value}>{hearing.bench}</Text>
                  </View>
                ) : null}
                <View style={styles.row}>
                  <Text style={styles.label}>
                    {t('calendar.date_time', 'Date & Time')}:
                  </Text>
                  <Text style={styles.value}>
                    {hearing.hearing_date} •{' '}
                    {hearing.hearing_time || t('calendar.all_day', 'All Day Session')}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>{t('calendar.status', 'Status')}:</Text>
                  <Text style={styles.value}>{hearing.status}</Text>
                </View>
                {hearing.business_conducted ? (
                  <View style={styles.blockSection}>
                    <Text style={styles.label}>
                      {t('calendar.proceedings', 'Proceedings')}:
                    </Text>
                    <Text style={styles.bodyText}>{hearing.business_conducted}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* Reminder Details */}
            {reminder && (
              <View style={styles.section}>
                <View style={styles.row}>
                  <Text style={styles.label}>{t('calendar.type', 'Type')}:</Text>
                  <Text style={styles.value}>{reminder.reminder_type}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>{t('calendar.due_date', 'Due Date')}:</Text>
                  <Text style={styles.value}>
                    {reminder.due_date
                      ? reminder.due_date.replace('T', ' ').substring(0, 16)
                      : reminder.date}
                  </Text>
                </View>
                {reminder.case_number ? (
                  <View style={styles.row}>
                    <Text style={styles.label}>
                      {t('calendar.case_no', 'Case Number')}:
                    </Text>
                    <Text style={styles.value}>{reminder.case_number}</Text>
                  </View>
                ) : null}
                <View style={styles.row}>
                  <Text style={styles.label}>{t('calendar.status', 'Status')}:</Text>
                  <Text style={styles.value}>
                    {reminder.is_completed ? 'Completed' : 'Pending'}
                  </Text>
                </View>
                {reminder.description ? (
                  <View style={styles.blockSection}>
                    <Text style={styles.label}>{t('calendar.notes', 'Notes')}:</Text>
                    <Text style={styles.bodyText}>{reminder.description}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* Token Alert Details */}
            {token && (
              <View style={styles.section}>
                <View style={styles.row}>
                  <Text style={styles.label}>
                    {t('calendar.token_number', 'Token Number')}:
                  </Text>
                  <Text style={styles.value}>#{token.token_number}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>
                    {t('calendar.court_hall', 'Court Hall')}:
                  </Text>
                  <Text style={styles.value}>Hall {token.court_hall_number}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>
                    {t('calendar.hearing_date', 'Hearing Date')}:
                  </Text>
                  <Text style={styles.value}>{token.hearing_date}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>{t('calendar.status', 'Status')}:</Text>
                  <Text style={styles.value}>{token.status}</Text>
                </View>
                {token.items_remaining !== undefined &&
                  token.items_remaining !== null && (
                    <View style={styles.row}>
                      <Text style={styles.label}>
                        {t('calendar.lead_count', 'Items Remaining')}:
                      </Text>
                      <Text
                        style={[styles.value, { color: Colors.gold, fontWeight: '700' }]}
                      >
                        {token.items_remaining} items
                      </Text>
                    </View>
                  )}
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            {caseId ? (
              <Button
                title={t('calendar.view_case', 'View Case')}
                onPress={handleOpenCase}
                variant="primary"
                style={styles.actionBtn}
                testID="modal-view-case-btn"
              />
            ) : null}
            <Button
              title={t('common.close', 'Close')}
              onPress={onClose}
              variant="outline"
              style={styles.actionBtn}
              testID="modal-close-btn"
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
    maxHeight: '80%',
    padding: 20,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 6,
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
  section: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: 13,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  value: {
    fontSize: 13,
    color: Colors.text.primary,
    fontWeight: '600',
    maxWidth: '65%',
    textAlign: 'right',
  },
  blockSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  bodyText: {
    fontSize: 13,
    color: Colors.text.primary,
    marginTop: 4,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
  },
});
