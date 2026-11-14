import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import {
  speechRecognitionService,
  VoiceLanguage,
  VoiceErrorType,
} from '../../services/speech/speechRecognitionService';
import { normalizeVoiceQuery } from '../../services/speech/voiceQueryNormalizer';

export interface VoiceInputModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (recognizedText: string) => void;
  title?: string;
  initialLanguage?: VoiceLanguage;
  sampleQueries?: string[];
  placeholder?: string;
  autoStart?: boolean;
}

type UIState =
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'ERROR'
  | 'PERMISSION_DENIED'
  | 'NOT_SUPPORTED';

export const VoiceInputModal: React.FC<VoiceInputModalProps> = ({
  visible,
  onClose,
  onApply,
  title,
  initialLanguage,
  placeholder,
  autoStart = false,
}) => {
  const { t, i18n } = useTranslation();

  // Resolve current active language with fallback
  const resolveCurrentLang = (): VoiceLanguage => {
    if (initialLanguage) return initialLanguage;
    const current = i18n.language;
    if (current === 'te') return 'te';
    if (current === 'hi') return 'hi';
    return 'en';
  };

  const [selectedLanguage, setSelectedLanguage] =
    useState<VoiceLanguage>(resolveCurrentLang);
  const [uiState, setUiState] = useState<UIState>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [transcript, setTranscript] = useState<string>('');
  const [normalizedSuggestion, setNormalizedSuggestion] = useState<string>('');

  // Animated pulse for microphone recording state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startPulseAnimation = useCallback(() => {
    pulseAnim.setValue(1);
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.current.start();
  }, [pulseAnim]);

  const stopPulseAnimation = useCallback(() => {
    if (pulseLoop.current) {
      pulseLoop.current.stop();
      pulseLoop.current = null;
    }
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  // Handle Voice Listening Lifecycle
  const stopListening = useCallback(() => {
    stopPulseAnimation();
    speechRecognitionService.stopRecognition();
    if (uiState === 'LISTENING') {
      setUiState(transcript.trim() ? 'SUCCESS' : 'IDLE');
    }
  }, [stopPulseAnimation, uiState, transcript]);

  const startListening = useCallback(
    async (lang: VoiceLanguage = selectedLanguage) => {
      setErrorMessage('');

      if (!speechRecognitionService.isSupported()) {
        setUiState('NOT_SUPPORTED');
        setErrorMessage(
          t(
            'voice.notSupported',
            'Speech recognition is not supported on this platform. Please type manually.'
          )
        );
        return;
      }

      setUiState('REQUESTING_PERMISSION');
      const hasPermission = await speechRecognitionService.requestPermission();
      if (!hasPermission) {
        setUiState('PERMISSION_DENIED');
        setErrorMessage(
          t(
            'voice.permissionDenied',
            'Microphone permission was denied. Please allow microphone access in settings or type manually.'
          )
        );
        return;
      }

      setUiState('LISTENING');
      startPulseAnimation();

      await speechRecognitionService.startRecognition({
        language: lang,
        onStart: () => {
          setUiState('LISTENING');
        },
        onResult: result => {
          const text = result.transcript;
          setTranscript(text);

          // Real-time voice query normalization suggestion
          const normResult = normalizeVoiceQuery(text);
          if (
            normResult.normalized &&
            normResult.normalized.toLowerCase() !== text.toLowerCase()
          ) {
            setNormalizedSuggestion(normResult.normalized);
          } else {
            setNormalizedSuggestion('');
          }

          if (result.isFinal) {
            setUiState('SUCCESS');
            stopPulseAnimation();
          }
        },
        onError: (err: { type: VoiceErrorType; message: string }) => {
          stopPulseAnimation();
          if (err.type === 'PERMISSION_DENIED') {
            setUiState('PERMISSION_DENIED');
            setErrorMessage(
              t(
                'voice.permissionDenied',
                'Microphone permission was denied. Please allow microphone access in settings or type manually.'
              )
            );
          } else if (err.type === 'NOT_SUPPORTED') {
            setUiState('NOT_SUPPORTED');
            setErrorMessage(
              t(
                'voice.notSupported',
                'Speech recognition is not supported on this platform. Please type manually.'
              )
            );
          } else if (err.type === 'NO_SPEECH') {
            setUiState('ERROR');
            setErrorMessage(
              t(
                'voice.noSpeech',
                'No speech detected. Please speak closer to the microphone and try again.'
              )
            );
          } else if (err.type === 'NETWORK') {
            setUiState('ERROR');
            setErrorMessage(
              t(
                'voice.networkError',
                'Speech service network error. Please try again or type manually.'
              )
            );
          } else if (err.type === 'AUDIO_CAPTURE') {
            setUiState('ERROR');
            setErrorMessage(
              t(
                'voice.audioError',
                'Audio capture error. Please verify microphone hardware.'
              )
            );
          } else if (err.type !== 'ABORTED') {
            setUiState('ERROR');
            setErrorMessage(err.message || 'Speech recognition error occurred.');
          }
        },
        onEnd: () => {
          stopPulseAnimation();
          setUiState(prev =>
            prev === 'LISTENING' ? (transcript.trim() ? 'SUCCESS' : 'IDLE') : prev
          );
        },
      });
    },
    [selectedLanguage, startPulseAnimation, stopPulseAnimation, t, transcript]
  );

  // Sync state when modal opens or closes
  useEffect(() => {
    if (visible) {
      const initialLang = resolveCurrentLang();
      setSelectedLanguage(initialLang);
      setTranscript('');
      setNormalizedSuggestion('');
      setErrorMessage('');
      setUiState('IDLE');

      if (autoStart) {
        startListening(initialLang);
      }
    } else {
      stopPulseAnimation();
      speechRecognitionService.abortRecognition();
    }

    return () => {
      stopPulseAnimation();
      speechRecognitionService.abortRecognition();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Handle switching recognition language
  const handleLanguageChange = (lang: VoiceLanguage) => {
    setSelectedLanguage(lang);
    if (uiState === 'LISTENING') {
      stopListening();
      startListening(lang);
    }
  };

  const handleApply = () => {
    const finalText = transcript.trim();
    if (!finalText) return;
    onApply(finalText);
    onClose();
  };

  const handleApplySuggestion = () => {
    if (normalizedSuggestion) {
      setTranscript(normalizedSuggestion);
      setNormalizedSuggestion('');
    }
  };

  const handleManualFallback = () => {
    stopListening();
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID="voice-input-modal"
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent} testID="voice-input-dialog">
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.modalTitle}>
              {title || t('voice.searchTitle', 'Voice Case Search')}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              testID="voice-close-modal"
              accessibilityLabel="Close voice modal"
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Language Selection Pills */}
          <View style={styles.languageContainer}>
            <Text style={styles.sectionLabel}>{t('voice.language', 'Language')}:</Text>
            <View style={styles.langPillsRow}>
              {(['en', 'te', 'hi'] as VoiceLanguage[]).map(lang => {
                const isSelected = selectedLanguage === lang;
                const label =
                  lang === 'en'
                    ? t('voice.langEn', 'English')
                    : lang === 'te'
                      ? t('voice.langTe', 'తెలుగు')
                      : t('voice.langHi', 'हिन्दी');

                return (
                  <TouchableOpacity
                    key={lang}
                    style={[styles.langPill, isSelected && styles.langPillActive]}
                    onPress={() => handleLanguageChange(lang)}
                    testID={`voice-lang-${lang}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.langPillText,
                        isSelected && styles.langPillTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Status Banner */}
          <View style={styles.statusBox}>
            {uiState === 'LISTENING' && (
              <View style={styles.statusRow}>
                <Badge label={t('voice.speakNow', 'Listening...')} variant="gold" />
                <Text style={styles.statusDescription}>
                  {t(
                    'voice.statusListening',
                    'Listening... Speak your case number, party name, or query.'
                  )}
                </Text>
              </View>
            )}

            {uiState === 'REQUESTING_PERMISSION' && (
              <View style={styles.statusRow}>
                <ActivityIndicator size="small" color={Colors.gold} />
                <Text style={styles.statusDescription}>
                  {t(
                    'voice.permissionPrompt',
                    'Microphone permission is required for voice input.'
                  )}
                </Text>
              </View>
            )}

            {uiState === 'PROCESSING' && (
              <View style={styles.statusRow}>
                <ActivityIndicator size="small" color={Colors.primaryLight} />
                <Text style={styles.statusDescription}>
                  {t('voice.processing', 'Processing speech...')}
                </Text>
              </View>
            )}

            {uiState === 'IDLE' && (
              <View style={styles.statusRow}>
                <Badge label="READY" variant="secondary" />
                <Text style={styles.statusDescription}>
                  {t(
                    'voice.statusIdle',
                    'Ready. Select language and tap microphone to speak.'
                  )}
                </Text>
              </View>
            )}

            {uiState === 'SUCCESS' && (
              <View style={styles.statusRow}>
                <Badge label="RECOGNIZED" variant="success" />
                <Text style={styles.statusDescription}>
                  {t(
                    'voice.statusSuccess',
                    'Speech recognized. You can edit text before submitting.'
                  )}
                </Text>
              </View>
            )}

            {(uiState === 'ERROR' ||
              uiState === 'PERMISSION_DENIED' ||
              uiState === 'NOT_SUPPORTED') && (
              <View style={styles.statusRow}>
                <Badge
                  label={uiState === 'PERMISSION_DENIED' ? 'BLOCKED' : 'ALERT'}
                  variant="danger"
                />
                <Text style={[styles.statusDescription, styles.errorText]}>
                  {errorMessage || t('voice.noSpeech', 'No speech detected.')}
                </Text>
              </View>
            )}
          </View>

          {/* Microphone Action Button with Animated Pulse */}
          <View style={styles.micCenterContainer}>
            <Animated.View
              style={[
                styles.pulseRing,
                uiState === 'LISTENING' && styles.pulseRingActive,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />
            <TouchableOpacity
              style={[
                styles.micButton,
                uiState === 'LISTENING'
                  ? styles.micButtonListening
                  : styles.micButtonIdle,
              ]}
              onPress={() => {
                if (uiState === 'LISTENING') {
                  stopListening();
                } else {
                  startListening(selectedLanguage);
                }
              }}
              testID="voice-mic-trigger"
              accessibilityLabel={
                uiState === 'LISTENING'
                  ? t('voice.stopListening', 'Stop listening')
                  : t('voice.startListening', 'Start listening')
              }
              accessibilityRole="button"
            >
              <Text style={styles.micIcon}>{uiState === 'LISTENING' ? '⏹' : '🎤'}</Text>
            </TouchableOpacity>
            <Text style={styles.micSubLabel}>
              {uiState === 'LISTENING'
                ? t('voice.tapToStop', 'Tap to stop listening')
                : t('voice.tapToSpeak', 'Tap microphone to speak')}
            </Text>
          </View>

          {/* Editable Transcript Text Area */}
          <View style={styles.transcriptSection}>
            <View style={styles.transcriptHeader}>
              <Text style={styles.sectionLabel}>
                {t('voice.recognizedText', 'Recognized Text')}:
              </Text>
              {Boolean(transcript) && (
                <TouchableOpacity
                  onPress={() => {
                    setTranscript('');
                    setNormalizedSuggestion('');
                  }}
                  testID="voice-clear-text"
                >
                  <Text style={styles.clearTextLink}>{t('voice.clear', 'Clear')}</Text>
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={styles.transcriptInput}
              value={transcript}
              onChangeText={text => {
                setTranscript(text);
                const norm = normalizeVoiceQuery(text);
                if (
                  norm.normalized &&
                  norm.normalized.toLowerCase() !== text.toLowerCase()
                ) {
                  setNormalizedSuggestion(norm.normalized);
                } else {
                  setNormalizedSuggestion('');
                }
              }}
              placeholder={
                placeholder ||
                t(
                  'voice.editableNotice',
                  'Spoken text will appear here. You can edit it manually before applying.'
                )
              }
              placeholderTextColor={Colors.text.muted}
              multiline
              numberOfLines={3}
              testID="voice-transcript-input"
              accessibilityLabel="Recognized speech text input"
            />

            {/* Normalized Suggestion Chip */}
            {Boolean(normalizedSuggestion) && (
              <TouchableOpacity
                style={styles.suggestionChip}
                onPress={handleApplySuggestion}
                testID="voice-use-normalized"
              >
                <Text style={styles.suggestionLabel}>
                  {t('voice.normalizedSuggestion', 'Suggested')}:
                </Text>
                <Text style={styles.suggestionValue}>{normalizedSuggestion}</Text>
                <Badge label={t('voice.useSuggested', 'Apply')} variant="gold" />
              </TouchableOpacity>
            )}
          </View>

          {/* Examples Hint */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.hintScroll}
          >
            <Text style={styles.hintText}>
              {t(
                'voice.sampleQueries',
                'Try saying: "WP 101/2024", "Ramesh Kumar", "Adjourned"'
              )}
            </Text>
          </ScrollView>

          {/* Action Buttons Footer */}
          <View style={styles.actionButtonsRow}>
            <Button
              title={t('voice.manualFallback', 'Type Manually Instead')}
              variant="outline"
              onPress={handleManualFallback}
              style={styles.fallbackButton}
              testID="voice-manual-fallback-button"
            />
            <Button
              title={t('voice.apply', 'Apply Search')}
              variant="primary"
              disabled={!transcript.trim()}
              onPress={handleApply}
              style={styles.applyButton}
              testID="voice-apply-button"
            />
          </View>
        </View>
      </View>
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
  modalContent: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  closeButton: {
    padding: 6,
  },
  closeText: {
    fontSize: 18,
    color: Colors.text.muted,
  },
  languageContainer: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 6,
  },
  langPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  langPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  langPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryLight,
  },
  langPillText: {
    fontSize: 13,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  langPillTextActive: {
    color: Colors.text.white,
    fontWeight: '700',
  },
  statusBox: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusDescription: {
    fontSize: 12,
    color: Colors.text.secondary,
    flex: 1,
  },
  errorText: {
    color: Colors.danger,
  },
  micCenterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    height: 100,
  },
  pulseRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'transparent',
  },
  pulseRingActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
    borderWidth: 2,
    borderColor: Colors.primaryLight,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  micButtonIdle: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  micButtonListening: {
    backgroundColor: Colors.danger,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  micIcon: {
    fontSize: 26,
    color: Colors.text.white,
  },
  micSubLabel: {
    marginTop: 8,
    fontSize: 11,
    color: Colors.text.muted,
  },
  transcriptSection: {
    marginTop: 8,
    marginBottom: 12,
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearTextLink: {
    fontSize: 11,
    color: Colors.gold,
    fontWeight: '600',
  },
  transcriptInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    color: Colors.text.primary,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.gold,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 6,
    gap: 6,
  },
  suggestionLabel: {
    fontSize: 11,
    color: Colors.text.muted,
  },
  suggestionValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gold,
    flex: 1,
  },
  hintScroll: {
    marginBottom: 16,
  },
  hintText: {
    fontSize: 11,
    color: Colors.text.muted,
    fontStyle: 'italic',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  fallbackButton: {
    flex: 1,
  },
  applyButton: {
    flex: 1,
  },
});
