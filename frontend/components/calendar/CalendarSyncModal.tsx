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
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { CalendarSyncConnectPayload, CalendarSyncSettingItem } from '../../types';

export interface CalendarSyncModalProps {
  visible: boolean;
  syncSetting?: CalendarSyncSettingItem;
  onClose: () => void;
  onConnect: (payload: CalendarSyncConnectPayload) => Promise<void>;
  onTriggerSync: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onExportIcs: () => void;
  isConnecting?: boolean;
  isSyncing?: boolean;
}

export const CalendarSyncModal: React.FC<CalendarSyncModalProps> = ({
  visible,
  syncSetting,
  onClose,
  onConnect,
  onTriggerSync,
  onDisconnect,
  onExportIcs,
  isConnecting = false,
  isSyncing = false,
}) => {
  const { t } = useTranslation();
  const [googleEmail, setGoogleEmail] = useState(syncSetting?.google_account_email || '');
  const [error, setError] = useState<string | null>(null);

  const isConnected = syncSetting?.sync_enabled && syncSetting.provider !== 'NONE';

  const handleConnectGoogle = async () => {
    if (!googleEmail.trim()) {
      setError(t('calendar.email_required', 'Google account email is required.'));
      return;
    }
    try {
      setError(null);
      await onConnect({
        provider: 'GOOGLE',
        sync_enabled: true,
        google_account_email: googleEmail.trim(),
        google_access_token: 'mock_oauth_token_' + Date.now(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID="calendar-sync-modal"
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <AppIcon name="refresh" size={18} color={Colors.primary} />
              <Text style={styles.title}>
                {t('calendar.sync_settings', 'Calendar Synchronization')}
              </Text>
            </View>
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

            {/* Current Sync Status */}
            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>
                  {t('calendar.provider', 'Provider')}:
                </Text>
                <Text style={styles.statusValue}>{syncSetting?.provider || 'NONE'}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>{t('calendar.status', 'Status')}:</Text>
                <Badge
                  label={syncSetting?.sync_status || 'IDLE'}
                  variant={
                    syncSetting?.sync_status === 'SUCCESS'
                      ? 'success'
                      : syncSetting?.sync_status === 'FAILED'
                        ? 'danger'
                        : 'secondary'
                  }
                />
              </View>
              {syncSetting?.last_synced_at ? (
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>
                    {t('calendar.last_synced', 'Last Synced')}:
                  </Text>
                  <Text style={styles.statusValue}>
                    {syncSetting.last_synced_at.replace('T', ' ').substring(0, 16)}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Provider Section */}
            {isConnected ? (
              <View style={styles.connectedSection}>
                <Text style={styles.sectionSubtitle}>
                  {t('calendar.connected_account', 'Connected Account')}
                </Text>
                <View style={styles.accountEmailRow}>
                  <AppIcon name="mail" size={14} color={Colors.primaryLight} />
                  <Text style={styles.accountEmail}>
                    {syncSetting?.google_account_email || 'Google Calendar'}
                  </Text>
                </View>

                <View style={styles.syncActions}>
                  <Button
                    title={t('calendar.sync_now', 'Sync Now')}
                    onPress={onTriggerSync}
                    variant="primary"
                    loading={isSyncing}
                    style={styles.fullWidthBtn}
                    testID="sync-trigger-btn"
                  />
                  <Button
                    title={t('calendar.disconnect', 'Disconnect Provider')}
                    onPress={onDisconnect}
                    variant="danger"
                    style={styles.fullWidthBtn}
                    testID="sync-disconnect-btn"
                  />
                </View>
              </View>
            ) : (
              <View style={styles.connectForm}>
                <Text style={styles.sectionSubtitle}>
                  {t('calendar.connect_google', 'Connect Google Calendar')}
                </Text>
                <Text style={styles.formHint}>
                  {t(
                    'calendar.google_sync_hint',
                    'Automatically synchronize your High Court hearing appearances and compliance deadlines with Google Calendar.'
                  )}
                </Text>

                <Text style={styles.fieldLabel}>
                  {t('calendar.google_email', 'Google Account Email')}
                </Text>
                <TextInput
                  testID="google-email-input"
                  style={styles.input}
                  placeholder="advocate.name@gmail.com"
                  placeholderTextColor={Colors.text.muted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={googleEmail}
                  onChangeText={setGoogleEmail}
                />

                <Button
                  title={t('calendar.connect_account', 'Connect Google Calendar')}
                  onPress={handleConnectGoogle}
                  variant="primary"
                  loading={isConnecting}
                  style={styles.connectBtn}
                  testID="connect-google-btn"
                />
              </View>
            )}

            {/* iCalendar (.ics) Export */}
            <View style={styles.exportSection}>
              <View style={styles.titleRow}>
                <AppIcon name="calendar" size={15} color={Colors.primary} />
                <Text style={styles.sectionSubtitle}>
                  {t('calendar.ics_export_title', 'Offline iCalendar Export')}
                </Text>
              </View>
              <Text style={styles.formHint}>
                {t(
                  'calendar.ics_export_hint',
                  'Download RFC 5545 compliant (.ics) calendar file to import into Outlook, Apple Calendar, or Thunderbird.'
                )}
              </Text>

              <Button
                title={t('calendar.download_ics', 'Download .ics Calendar')}
                onPress={onExportIcs}
                variant="outline"
                style={styles.fullWidthBtn}
                testID="export-ics-btn"
              />
            </View>
          </ScrollView>

          <Button
            title={t('common.close', 'Close')}
            onPress={onClose}
            variant="outline"
            style={styles.closeModalBtn}
            testID="close-sync-modal-btn"
          />
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
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
  statusCard: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 13,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  statusValue: {
    fontSize: 13,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  accountEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  accountEmail: {
    fontSize: 14,
    color: Colors.primaryLight,
  },
  formHint: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 16,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 6,
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
    marginBottom: 12,
  },
  connectForm: {
    marginBottom: 16,
  },
  connectBtn: {
    marginTop: 4,
  },
  connectedSection: {
    marginBottom: 16,
  },
  syncActions: {
    gap: 8,
  },
  exportSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginBottom: 16,
  },
  fullWidthBtn: {
    marginBottom: 8,
  },
  closeModalBtn: {
    marginTop: 8,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    marginBottom: 10,
  },
});
