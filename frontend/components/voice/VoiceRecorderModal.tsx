import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { AudioRecordResult, audioService } from '../../services/voice/audioService';
import { CreateVoiceNotePayload, VoiceTranscriptionLanguage } from '../../types';
import { Button } from '../common/Button';

export interface VoiceRecorderModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (payload: CreateVoiceNotePayload) => Promise<void>;
  caseId: number | string;
  isSaving?: boolean;
}

type RecordingState = 'IDLE' | 'RECORDING' | 'PAUSED' | 'STOPPED';

export const VoiceRecorderModal: React.FC<VoiceRecorderModalProps> = ({
  visible,
  onClose,
  onSave,
  isSaving = false,
}) => {
  const { t } = useTranslation();

  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<VoiceTranscriptionLanguage>('en');
  const [recordingState, setRecordingState] = useState<RecordingState>('IDLE');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [recordResult, setRecordResult] = useState<AudioRecordResult | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCancel = useCallback(() => {
    audioService.stopAudio();
    if (recordingState === 'RECORDING' || recordingState === 'PAUSED') {
      audioService.stopRecording();
    }
    setRecordingState('IDLE');
    setDurationSeconds(0);
    setRecordResult(null);
    setIsPreviewPlaying(false);
    setTitle('');
    setErrorMessage(null);
    onClose();
  }, [recordingState, onClose]);

  // Timer while recording
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (recordingState === 'RECORDING') {
      interval = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recordingState]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      handleCancel();
    }
  }, [visible, handleCancel]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartRecord = async () => {
    setErrorMessage(null);
    try {
      await audioService.startRecording();
      setDurationSeconds(0);
      setRecordingState('RECORDING');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start recording');
    }
  };

  const handlePauseRecord = async () => {
    try {
      await audioService.pauseRecording();
      setRecordingState('PAUSED');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to pause recording');
    }
  };

  const handleResumeRecord = async () => {
    try {
      await audioService.resumeRecording();
      setRecordingState('RECORDING');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to resume recording');
    }
  };

  const handleStopRecord = async () => {
    try {
      const result = await audioService.stopRecording();
      setRecordResult(result);
      setRecordingState('STOPPED');
      if (!title.trim()) {
        setTitle(`Note ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to stop recording');
    }
  };

  const handleTogglePreview = async () => {
    if (!recordResult) return;
    if (isPreviewPlaying) {
      await audioService.stopAudio();
      setIsPreviewPlaying(false);
    } else {
      setIsPreviewPlaying(true);
      await audioService.playAudio(
        recordResult.uri,
        recordResult.durationSeconds,
        (pos, dur) => {
          if (pos >= dur) {
            setIsPreviewPlaying(false);
          }
        }
      );
    }
  };

  const handleSave = async () => {
    if (!recordResult) {
      setErrorMessage('Please record an audio note first.');
      return;
    }

    setErrorMessage(null);
    try {
      await onSave({
        title: title.trim() || 'Advocate Voice Note',
        audio_file: {
          uri: recordResult.uri,
          name: recordResult.name,
          type: 'audio/m4a',
          size: recordResult.sizeBytes,
        },
        transcription_language: language,
        audio_duration_seconds: recordResult.durationSeconds,
        auto_transcribe: true,
      });
      handleCancel();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save voice note');
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalContainer} testID="voice-recorder-modal">
          <View style={styles.header}>
            <Text style={styles.title}>{t('voiceNotes.recordingModalTitle', 'Voice Dictation')}</Text>
            <TouchableOpacity onPress={handleCancel} testID="close-modal-button" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* Title Input */}
            <Text style={styles.inputLabel}>{t('voiceNotes.titlePlaceholder', 'Voice Note Title')}</Text>
            <TextInput
              style={styles.textInput}
              value={title}
              onChangeText={setTitle}
              placeholder={t('voiceNotes.titlePlaceholder', 'e.g. Interim Stay Arguments')}
              placeholderTextColor={Colors.text.muted}
              testID="voice-note-title-input"
            />

            {/* Language Selector */}
            <Text style={styles.inputLabel}>{t('voiceNotes.language', 'Dictation Language')}</Text>
            <View style={styles.langRow}>
              {(['en', 'te', 'hi'] as VoiceTranscriptionLanguage[]).map((lang) => {
                const isSelected = language === lang;
                const labels: Record<VoiceTranscriptionLanguage, string> = {
                  en: 'English',
                  te: 'తెలుగు (Telugu)',
                  hi: 'हिन्दी (Hindi)',
                };
                return (
                  <TouchableOpacity
                    key={lang}
                    style={[styles.langChip, isSelected && styles.langChipSelected]}
                    onPress={() => setLanguage(lang)}
                    testID={`lang-${lang}-button`}
                  >
                    <Text style={[styles.langText, isSelected && styles.langTextSelected]}>
                      {labels[lang]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Timer & Waveform Display */}
            <View style={styles.timerContainer}>
              <View
                style={[
                  styles.recordIndicator,
                  recordingState === 'RECORDING' && styles.recordingIndicatorPulse,
                  recordingState === 'PAUSED' && styles.pausedIndicator,
                ]}
              />
              <Text style={styles.timerText} testID="recording-timer">
                {recordingState === 'STOPPED' && recordResult
                  ? formatTime(recordResult.durationSeconds)
                  : formatTime(durationSeconds)}
              </Text>
              <Text style={styles.stateSubtitle}>
                {recordingState === 'RECORDING' && t('voiceNotes.recording', 'Recording in progress...')}
                {recordingState === 'PAUSED' && t('voiceNotes.paused', 'Recording paused')}
                {recordingState === 'STOPPED' && t('voiceNotes.previewTitle', 'Playback Preview')}
                {recordingState === 'IDLE' && t('voiceNotes.idlePrompt', 'Ready to record')}
              </Text>
            </View>

            {/* Recording Controls */}
            <View style={styles.controlsRow}>
              {recordingState === 'IDLE' && (
                <Button
                  title={t('voiceNotes.startRecording', 'Start Recording')}
                  onPress={handleStartRecord}
                  variant="primary"
                  style={styles.actionBtn}
                  testID="record-button"
                />
              )}

              {recordingState === 'RECORDING' && (
                <>
                  <Button
                    title={t('voiceNotes.pauseRecording', 'Pause')}
                    onPress={handlePauseRecord}
                    variant="outline"
                    style={styles.halfBtn}
                    testID="pause-record-button"
                  />
                  <Button
                    title={t('voiceNotes.stopRecording', 'Stop')}
                    onPress={handleStopRecord}
                    variant="danger"
                    style={styles.halfBtn}
                    testID="stop-record-button"
                  />
                </>
              )}

              {recordingState === 'PAUSED' && (
                <>
                  <Button
                    title={t('voiceNotes.resumeRecording', 'Resume')}
                    onPress={handleResumeRecord}
                    variant="primary"
                    style={styles.halfBtn}
                    testID="resume-record-button"
                  />
                  <Button
                    title={t('voiceNotes.stopRecording', 'Stop')}
                    onPress={handleStopRecord}
                    variant="danger"
                    style={styles.halfBtn}
                    testID="stop-record-button"
                  />
                </>
              )}

              {recordingState === 'STOPPED' && (
                <View style={styles.stoppedContainer}>
                  {/* Playback preview */}
                  <TouchableOpacity
                    style={styles.previewBtn}
                    onPress={handleTogglePreview}
                    testID="preview-play-button"
                  >
                    <Text style={styles.previewBtnText}>
                      {isPreviewPlaying ? '⏸ Stop Preview' : '▶ Play Preview'}
                    </Text>
                  </TouchableOpacity>

                  {/* Re-record button */}
                  <TouchableOpacity
                    style={styles.rerecordBtn}
                    onPress={handleStartRecord}
                    testID="rerecord-button"
                  >
                    <Text style={styles.rerecordText}>🔄 Record Again</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {errorMessage && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText} testID="voice-recorder-error">{errorMessage}</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <Button
              title={t('common.cancel', 'Cancel')}
              onPress={handleCancel}
              variant="outline"
              style={styles.footerBtn}
              testID="cancel-voice-recorder-button"
            />
            <Button
              title={
                isSaving
                  ? t('voiceNotes.saving', 'Uploading...')
                  : t('voiceNotes.saveRecording', 'Save & Transcribe')
              }
              onPress={handleSave}
              variant="primary"
              disabled={recordingState !== 'STOPPED' || isSaving}
              loading={isSaving}
              style={styles.footerBtn}
              testID="save-voice-note-button"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  closeText: {
    fontSize: 20,
    color: Colors.text.muted,
  },
  body: {
    padding: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 6,
    marginTop: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text.primary,
    backgroundColor: Colors.background,
  },
  langRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  langChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  langChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  langText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text.secondary,
  },
  langTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  timerContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    marginVertical: 12,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recordIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.text.muted,
    marginBottom: 10,
  },
  recordingIndicatorPulse: {
    backgroundColor: Colors.danger,
  },
  pausedIndicator: {
    backgroundColor: Colors.warning,
  },
  timerText: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  stateSubtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 6,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginVertical: 12,
  },
  actionBtn: {
    flex: 1,
  },
  halfBtn: {
    flex: 1,
  },
  stoppedContainer: {
    flex: 1,
    gap: 10,
  },
  previewBtn: {
    backgroundColor: Colors.primary + '20',
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  previewBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  rerecordBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  rerecordText: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  errorText: {
    fontSize: 13,
    color: '#b91c1c',
  },
  footer: {
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
