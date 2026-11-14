import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import {
  useCaseVoiceNotes,
  useDeleteVoiceNote,
  useTranscribeVoiceNote,
  useUpdateVoiceNote,
  useUploadVoiceNote,
} from '../../features/voice/hooks';
import { offlineVoiceQueue } from '../../services/offline/offlineVoiceQueue';
import { CreateVoiceNotePayload, VoiceTranscriptionLanguage } from '../../types';
import { Button } from '../common/Button';
import { VoiceNoteCard } from '../voice/VoiceNoteCard';
import { VoiceRecorderModal } from '../voice/VoiceRecorderModal';

export interface CaseVoiceNotesSectionProps {
  caseId: number | string;
}

export const CaseVoiceNotesSection: React.FC<CaseVoiceNotesSectionProps> = ({ caseId }) => {
  const { t } = useTranslation();

  const [search, setSearch] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<VoiceTranscriptionLanguage | undefined>(
    undefined
  );
  const [isRecordModalVisible, setIsRecordModalVisible] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  const {
    data: voiceNotes = [],
    isLoading,
  } = useCaseVoiceNotes(caseId, {
    search: search.trim() || undefined,
    language: selectedLanguage,
  });

  const uploadMutation = useUploadVoiceNote();
  const updateMutation = useUpdateVoiceNote();
  const deleteMutation = useDeleteVoiceNote();
  const transcribeMutation = useTranscribeVoiceNote();

  const handleSaveVoiceNote = async (payload: CreateVoiceNotePayload) => {
    try {
      await uploadMutation.mutateAsync({ caseId, payload });
      setOfflineNotice(null);
    } catch {
      // Offline fallback: queue recording in encrypted storage
      const audioFile = payload.audio_file as { uri: string; name: string; type: string; size?: number };
      await offlineVoiceQueue.enqueueRecording('current_user', {
        caseId: Number(caseId),
        title: payload.title || 'Offline Voice Note',
        audioUri: audioFile.uri || '',
        audioName: audioFile.name || 'recording.m4a',
        audioMimeType: audioFile.type || 'audio/m4a',
        audioDurationSeconds: payload.audio_duration_seconds || 0,
        audioSizeBytes: audioFile.size || 0,
        language: payload.transcription_language || 'en',
        recordedAt: new Date().toISOString(),
      });
      setOfflineNotice(
        t('voiceNotes.offlineNotice', 'Recorded offline. Queued for upload when connected.')
      );
    }
  };

  return (
    <View style={styles.container} testID="case-voice-notes-section">
      {/* Search & Actions Bar */}
      <View style={styles.topBar}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t('voiceNotes.searchPlaceholder', 'Search voice notes or transcripts...')}
          placeholderTextColor={Colors.text.muted}
          testID="voice-notes-search-input"
        />
        <Button
          title={t('voiceNotes.recordNote', '+ Record')}
          onPress={() => setIsRecordModalVisible(true)}
          variant="primary"
          style={styles.recordBtn}
          testID="open-record-modal-button"
        />
      </View>

      {/* Language Filter Chips */}
      <View style={styles.langFilterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={[styles.filterChip, selectedLanguage === undefined && styles.filterChipActive]}
            onPress={() => setSelectedLanguage(undefined)}
            testID="filter-lang-all"
          >
            <Text
              style={[styles.filterText, selectedLanguage === undefined && styles.filterTextActive]}
            >
              All Languages
            </Text>
          </TouchableOpacity>

          {(['en', 'te', 'hi'] as VoiceTranscriptionLanguage[]).map((lang) => {
            const isActive = selectedLanguage === lang;
            const labels: Record<VoiceTranscriptionLanguage, string> = {
              en: 'English',
              te: 'తెలుగు',
              hi: 'हिन्दी',
            };
            return (
              <TouchableOpacity
                key={lang}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setSelectedLanguage(isActive ? undefined : lang)}
                testID={`filter-lang-${lang}`}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {labels[lang]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {offlineNotice && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>{offlineNotice}</Text>
        </View>
      )}

      {/* Voice Notes List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : voiceNotes.length === 0 ? (
        <View style={styles.emptyContainer} testID="voice-notes-empty">
          <Text style={styles.emptyTitle}>
            {t('voiceNotes.empty', 'No voice notes recorded for this case yet.')}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t('voiceNotes.subtitle', 'Tap "+ Record" to record audio dictation with automated STT.')}
          </Text>
          <Button
            title={t('voiceNotes.recordNote', 'Record Voice Note')}
            onPress={() => setIsRecordModalVisible(true)}
            variant="outline"
            style={styles.emptyBtn}
          />
        </View>
      ) : (
        <View style={styles.list}>
          {voiceNotes.map((note) => (
            <VoiceNoteCard
              key={note.id}
              note={note}
              onUpdate={async (data) => {
                await updateMutation.mutateAsync({ noteId: note.id, caseId, data });
              }}
              onDelete={async () => {
                await deleteMutation.mutateAsync({ noteId: note.id, caseId });
              }}
              onRetrySTT={async (lang) => {
                await transcribeMutation.mutateAsync({ noteId: note.id, caseId, language: lang });
              }}
              isUpdating={updateMutation.isPending}
              isDeleting={deleteMutation.isPending}
              isRetrying={transcribeMutation.isPending}
            />
          ))}
        </View>
      )}

      {/* Recording Modal */}
      <VoiceRecorderModal
        visible={isRecordModalVisible}
        onClose={() => setIsRecordModalVisible(false)}
        onSave={handleSaveVoiceNote}
        caseId={caseId}
        isSaving={uploadMutation.isPending}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  topBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: Colors.surface,
    color: Colors.text.primary,
  },
  recordBtn: {
    height: 42,
    paddingHorizontal: 14,
  },
  langFilterRow: {
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: Colors.text.white,
    fontWeight: '700',
  },
  offlineBanner: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  offlineText: {
    fontSize: 12,
    color: '#92400e',
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.text.muted,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyBtn: {
    minWidth: 160,
  },
  list: {
    marginTop: 4,
  },
});
