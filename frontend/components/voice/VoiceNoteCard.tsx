import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { audioService } from '../../services/voice/audioService';
import { VoiceNoteItem, VoiceTranscriptionLanguage } from '../../types';
import { Button } from '../common/Button';
import { AppIcon } from '../common/AppIcon';

export interface VoiceNoteCardProps {
  note: VoiceNoteItem;
  onUpdate: (data: {
    title?: string;
    transcript?: string;
    transcription_language?: VoiceTranscriptionLanguage;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onRetrySTT: (language?: VoiceTranscriptionLanguage) => Promise<void>;
  isUpdating?: boolean;
  isDeleting?: boolean;
  isRetrying?: boolean;
}

export const VoiceNoteCard: React.FC<VoiceNoteCardProps> = ({
  note,
  onUpdate,
  onDelete,
  onRetrySTT,
  isUpdating = false,
  isDeleting = false,
  isRetrying = false,
}) => {
  const { t } = useTranslation();

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosMs, setPlaybackPosMs] = useState(0);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState(note.transcript || '');
  const [editedTitle, setEditedTitle] = useState(note.title);

  const formatSeconds = (totalSecs: number) => {
    const m = Math.floor(totalSecs / 60);
    const s = Math.floor(totalSecs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentSeconds = Math.floor(playbackPosMs / 1000);
  const totalSeconds = Math.round(note.audio_duration_seconds) || 1;

  const handleTogglePlay = async () => {
    if (isPlaying) {
      await audioService.stopAudio();
      setIsPlaying(false);
      setPlaybackPosMs(0);
    } else {
      setIsPlaying(true);
      await audioService.playAudio(
        note.audio_stream_url,
        note.audio_duration_seconds,
        (pos, dur) => {
          setPlaybackPosMs(pos);
          if (pos >= dur) {
            setIsPlaying(false);
            setPlaybackPosMs(0);
          }
        }
      );
    }
  };

  const handleConfirmDelete = () => {
    Alert.alert(
      t('voiceNotes.deleteConfirm', 'Delete Voice Note'),
      t(
        'voiceNotes.deleteMessage',
        'Are you sure you want to permanently delete this voice note and its audio recording?'
      ),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            if (isPlaying) {
              await audioService.stopAudio();
              setIsPlaying(false);
            }
            await onDelete();
          },
        },
      ]
    );
  };

  const handleSaveEdit = async () => {
    await onUpdate({
      title: editedTitle.trim() || note.title,
      transcript: editedTranscript,
    });
    setIsEditModalVisible(false);
  };

  const getStatusColor = () => {
    switch (note.transcription_status) {
      case 'COMPLETED':
        return Colors.success;
      case 'PROCESSING':
        return Colors.primary;
      case 'FAILED':
        return Colors.danger;
      default:
        return Colors.text.muted;
    }
  };

  return (
    <View style={styles.card} testID={`voice-note-card-${note.id}`}>
      {/* Header with Title and Badges */}
      <View style={styles.header}>
        <View style={styles.titleCol}>
          <Text style={styles.title} numberOfLines={1}>
            {note.title}
          </Text>
          <Text style={styles.timestamp}>
            {new Date(note.recorded_at).toLocaleDateString([], {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}{' '}
            • {formatSeconds(note.audio_duration_seconds)}
          </Text>
        </View>

        <View style={styles.badgeRow}>
          {/* Mock STT Indicator */}
          {note.is_mock && (
            <View style={styles.mockBadge} testID={`mock-badge-${note.id}`}>
              <Text style={styles.mockText}>DEMO</Text>
            </View>
          )}

          {/* Language Badge */}
          <View style={styles.langBadge}>
            <Text style={styles.langBadgeText}>
              {(note.transcription_language || 'en').toUpperCase()}
            </Text>
          </View>

          {/* STT Status Chip */}
          <View style={[styles.statusChip, { borderColor: getStatusColor() }]}>
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {note.transcription_status_display || note.transcription_status}
            </Text>
          </View>
        </View>
      </View>

      {/* Audio Player Bar */}
      <View style={styles.playerBar}>
        <TouchableOpacity
          style={styles.playBtn}
          onPress={handleTogglePlay}
          testID={`play-audio-button-${note.id}`}
          accessibilityLabel={isPlaying ? 'Pause audio' : 'Play audio'}
        >
          <AppIcon
            name={isPlaying ? 'pause' : 'play'}
            size={16}
            color={Colors.text.white}
          />
        </TouchableOpacity>

        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBar,
                { width: `${Math.min(100, (currentSeconds / totalSeconds) * 100)}%` },
              ]}
            />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatSeconds(currentSeconds)}</Text>
            <Text style={styles.timeText}>{formatSeconds(totalSeconds)}</Text>
          </View>
        </View>
      </View>

      {/* Transcript Area */}
      <View style={styles.transcriptBox}>
        {note.transcription_status === 'PROCESSING' ? (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.processingText}>
              {t('voiceNotes.status.PROCESSING', 'Transcribing audio...')}
            </Text>
          </View>
        ) : note.transcription_status === 'FAILED' ? (
          <View style={styles.failedRow}>
            <Text style={styles.failedText}>
              {note.transcription_error || t('voiceNotes.status.FAILED', 'STT Failed')}
            </Text>
            <Button
              title={
                isRetrying
                  ? 'Retrying...'
                  : t('voiceNotes.retryTranscription', 'Retry STT')
              }
              onPress={() => onRetrySTT(note.transcription_language)}
              variant="outline"
              loading={isRetrying}
              style={styles.retryBtn}
              testID={`retry-stt-button-${note.id}`}
            />
          </View>
        ) : note.transcript ? (
          <Text style={styles.transcriptText} numberOfLines={3}>
            {note.transcript}
          </Text>
        ) : (
          <Text style={styles.emptyTranscriptText}>
            {t('voiceNotes.noTranscript', 'No transcript generated yet.')}
          </Text>
        )}
      </View>

      {/* Actions Row */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            setEditedTitle(note.title);
            setEditedTranscript(note.transcript || '');
            setIsEditModalVisible(true);
          }}
          testID={`edit-transcript-button-${note.id}`}
        >
          <View style={styles.actionInner}>
            <AppIcon name="edit" size={13} color={Colors.primary} />
            <Text style={styles.actionBtnText}>
              {t('voiceNotes.editTranscript', 'Edit Note')}
            </Text>
          </View>
        </TouchableOpacity>

        {note.transcription_status === 'COMPLETED' && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onRetrySTT(note.transcription_language)}
            disabled={isRetrying}
            testID={`retranscribe-button-${note.id}`}
          >
            <View style={styles.actionInner}>
              <AppIcon name="refresh" size={13} color={Colors.primary} />
              <Text style={styles.actionBtnText}>
                {t('voiceNotes.retryTranscription', 'Re-run STT')}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleConfirmDelete}
          disabled={isDeleting}
          testID={`delete-voice-note-button-${note.id}`}
        >
          <View style={styles.actionInner}>
            <AppIcon name="trash" size={13} color={Colors.danger} />
            <Text style={styles.deleteBtnText}>{t('common.delete', 'Delete')}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Transcript Edit Modal */}
      <Modal visible={isEditModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t('voiceNotes.editTranscript', 'Edit Voice Note & Transcript')}
              </Text>
              <TouchableOpacity
                onPress={() => setIsEditModalVisible(false)}
                accessibilityLabel={t('common.close', 'Close')}
              >
                <AppIcon name="x" size={18} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>
                {t('voiceNotes.titlePlaceholder', 'Title')}
              </Text>
              <TextInput
                style={styles.modalInput}
                value={editedTitle}
                onChangeText={setEditedTitle}
                testID="edit-title-input"
              />

              <Text style={styles.modalLabel}>
                {t('voiceNotes.advocateTranscript', 'Advocate Transcript')}
              </Text>
              <TextInput
                style={[styles.modalInput, styles.modalTextArea]}
                value={editedTranscript}
                onChangeText={setEditedTranscript}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                testID="edit-transcript-input"
              />

              {note.original_transcript ? (
                <View style={styles.origBox}>
                  <Text style={styles.origLabel}>
                    {t(
                      'voiceNotes.originalTranscript',
                      'Original STT Output (Immutable):'
                    )}
                  </Text>
                  <Text style={styles.origText}>{note.original_transcript}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.modalFooter}>
              <Button
                title={t('common.cancel', 'Cancel')}
                onPress={() => setIsEditModalVisible(false)}
                variant="outline"
                style={styles.footerBtn}
              />
              <Button
                title={
                  isUpdating
                    ? 'Saving...'
                    : t('voiceNotes.saveTranscript', 'Save Transcript')
                }
                onPress={handleSaveEdit}
                variant="primary"
                loading={isUpdating}
                style={styles.footerBtn}
                testID="save-transcript-button"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleCol: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  timestamp: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  mockBadge: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mockText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
  },
  langBadge: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  langBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  statusChip: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 12,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    flex: 1,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: Colors.text.muted,
  },
  transcriptBox: {
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  transcriptText: {
    fontSize: 13,
    color: Colors.text.primary,
    lineHeight: 18,
  },
  emptyTranscriptText: {
    fontSize: 12,
    color: Colors.text.muted,
    fontStyle: 'italic',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  processingText: {
    fontSize: 12,
    color: Colors.primary,
  },
  failedRow: {
    gap: 6,
  },
  failedText: {
    fontSize: 12,
    color: '#b91c1c',
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  actionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionBtnText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  deleteBtnText: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  modalBody: {
    padding: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 6,
    marginTop: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: Colors.text.primary,
    backgroundColor: Colors.background,
  },
  modalTextArea: {
    minHeight: 100,
  },
  origBox: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  origLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  origText: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
  },
  footerBtn: {
    flex: 1,
  },
});
