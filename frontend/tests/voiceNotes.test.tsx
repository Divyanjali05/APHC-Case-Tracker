import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { CaseVoiceNotesSection } from '../components/cases/CaseVoiceNotesSection';
import { VoiceNoteCard } from '../components/voice/VoiceNoteCard';
import { VoiceRecorderModal } from '../components/voice/VoiceRecorderModal';
import {
  useCaseVoiceNotes,
  useUploadVoiceNote,
  useUpdateVoiceNote,
  useDeleteVoiceNote,
  useTranscribeVoiceNote,
} from '../features/voice/hooks';
import { audioService } from '../services/voice/audioService';
import { offlineVoiceQueue } from '../services/offline/offlineVoiceQueue';
import { VoiceNoteItem } from '../types';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ id: '101' }),
}));

jest.mock('@tanstack/react-query', () => {
  const original = jest.requireActual('@tanstack/react-query');
  return {
    ...original,
    useQuery: jest.fn(),
    useMutation: jest.fn(),
    useQueryClient: () => ({
      invalidateQueries: jest.fn(),
    }),
  };
});

jest.mock('react-i18next', () => {
  const enTranslations = require('../i18n/locales/en.json');
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string) => {
        const parts = key.split('.');
        let current: unknown = enTranslations;
        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) {
            current = (current as Record<string, unknown>)[part];
          } else {
            return fallback || key;
          }
        }
        return typeof current === 'string' ? current : fallback || key;
      },
      i18n: {
        language: 'en',
        changeLanguage: jest.fn(),
      },
    }),
  };
});

jest.mock('../features/voice/hooks', () => ({
  useCaseVoiceNotes: jest.fn(),
  useVoiceNoteDetail: jest.fn(),
  useUploadVoiceNote: jest.fn(),
  useUpdateVoiceNote: jest.fn(),
  useDeleteVoiceNote: jest.fn(),
  useTranscribeVoiceNote: jest.fn(),
}));

jest.mock('../services/offline/offlineVoiceQueue', () => ({
  offlineVoiceQueue: {
    enqueueRecording: jest.fn().mockResolvedValue({ id: 'offline_1' }),
    getQueue: jest.fn().mockResolvedValue([]),
    getPendingQueue: jest.fn().mockResolvedValue([]),
    processQueue: jest.fn().mockResolvedValue({ synced: 1, failed: 0 }),
    removeFromQueue: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockVoiceNotes: VoiceNoteItem[] = [
  {
    id: 1,
    case: 101,
    case_number: 'WP 4512/2026',
    advocate: 2,
    advocate_name: 'Advocate Rao',
    title: 'Interim Stay Preparation',
    audio_file_name: 'rec_101.m4a',
    audio_duration_seconds: 45.5,
    audio_file_size_bytes: 728000,
    audio_mime_type: 'audio/m4a',
    transcription_status: 'COMPLETED',
    transcription_status_display: 'Transcribed',
    transcription_language: 'en',
    transcription_language_display: 'English',
    original_transcript: 'May it please your Lordship, I appear on behalf of the petitioner.',
    transcript: 'May it please your Lordship, I appear on behalf of the petitioner.',
    transcription_provider: 'MOCK_STT_PROVIDER',
    is_mock: true,
    transcribed_at: '2026-11-07T10:00:00Z',
    recorded_at: '2026-11-07T09:50:00Z',
    created_at: '2026-11-07T09:50:00Z',
    updated_at: '2026-11-07T10:00:00Z',
    audio_stream_url: '/api/voice/notes/1/audio/',
  },
  {
    id: 2,
    case: 101,
    case_number: 'WP 4512/2026',
    advocate: 2,
    advocate_name: 'Advocate Rao',
    title: 'సాక్షుల విచారణ అంశాలు',
    audio_file_name: 'rec_102.m4a',
    audio_duration_seconds: 60.0,
    audio_file_size_bytes: 960000,
    audio_mime_type: 'audio/m4a',
    transcription_status: 'PROCESSING',
    transcription_status_display: 'Transcribing...',
    transcription_language: 'te',
    transcription_language_display: 'Telugu',
    original_transcript: '',
    transcript: '',
    transcription_provider: 'MOCK_STT_PROVIDER',
    is_mock: true,
    transcribed_at: null,
    recorded_at: '2026-11-07T10:15:00Z',
    created_at: '2026-11-07T10:15:00Z',
    updated_at: '2026-11-07T10:15:00Z',
    audio_stream_url: '/api/voice/notes/2/audio/',
  },
  {
    id: 3,
    case: 101,
    case_number: 'WP 4512/2026',
    advocate: 2,
    advocate_name: 'Advocate Rao',
    title: 'Bail Arguments Dictation',
    audio_file_name: 'rec_103.m4a',
    audio_duration_seconds: 30.0,
    audio_file_size_bytes: 480000,
    audio_mime_type: 'audio/m4a',
    transcription_status: 'FAILED',
    transcription_status_display: 'STT Failed',
    transcription_language: 'hi',
    transcription_language_display: 'Hindi',
    original_transcript: '',
    transcript: '',
    transcription_provider: 'MOCK_STT_PROVIDER',
    is_mock: true,
    transcription_error: 'Temporary STT API quota exceeded',
    transcribed_at: null,
    recorded_at: '2026-11-07T10:20:00Z',
    created_at: '2026-11-07T10:20:00Z',
    updated_at: '2026-11-07T10:20:00Z',
    audio_stream_url: '/api/voice/notes/3/audio/',
  },
];

describe('Phase 5: Voice Notes, Speech-to-Text & Audio Playback', () => {
  const mockUploadMutate = jest.fn();
  const mockUpdateMutate = jest.fn();
  const mockDeleteMutate = jest.fn();
  const mockTranscribeMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useCaseVoiceNotes as jest.Mock).mockReturnValue({
      data: mockVoiceNotes,
      isLoading: false,
      refetch: jest.fn(),
    });
    (useUploadVoiceNote as jest.Mock).mockReturnValue({
      mutateAsync: mockUploadMutate.mockResolvedValue(mockVoiceNotes[0]),
      isPending: false,
    });
    (useUpdateVoiceNote as jest.Mock).mockReturnValue({
      mutateAsync: mockUpdateMutate.mockResolvedValue({
        ...mockVoiceNotes[0],
        transcript: 'Updated transcript content',
      }),
      isPending: false,
    });
    (useDeleteVoiceNote as jest.Mock).mockReturnValue({
      mutateAsync: mockDeleteMutate.mockResolvedValue(undefined),
      isPending: false,
    });
    (useTranscribeVoiceNote as jest.Mock).mockReturnValue({
      mutateAsync: mockTranscribeMutate.mockResolvedValue(mockVoiceNotes[0]),
      isPending: false,
    });
  });

  // 1. Renders Voice Notes Section
  it('renders Voice Notes section with search, language filters, and record button', () => {
    render(<CaseVoiceNotesSection caseId={101} />);

    expect(screen.getByTestId('case-voice-notes-section')).toBeTruthy();
    expect(screen.getByTestId('voice-notes-search-input')).toBeTruthy();
    expect(screen.getByTestId('open-record-modal-button')).toBeTruthy();
    expect(screen.getByTestId('filter-lang-all')).toBeTruthy();
    expect(screen.getByTestId('filter-lang-en')).toBeTruthy();
    expect(screen.getByTestId('filter-lang-te')).toBeTruthy();
    expect(screen.getByTestId('filter-lang-hi')).toBeTruthy();
  });

  // 2. Empty state
  it('displays empty state when case has no voice notes', () => {
    (useCaseVoiceNotes as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: jest.fn(),
    });

    render(<CaseVoiceNotesSection caseId={101} />);
    expect(screen.getByTestId('voice-notes-empty')).toBeTruthy();
    expect(screen.getByText(/No voice notes recorded for this case/i)).toBeTruthy();
  });

  // 3. Opens VoiceRecorderModal
  it('opens VoiceRecorderModal when "+ Record" button is pressed', () => {
    render(<CaseVoiceNotesSection caseId={101} />);

    fireEvent.press(screen.getByTestId('open-record-modal-button'));
    expect(screen.getByTestId('voice-recorder-modal')).toBeTruthy();
  });

  // 4. Entering note title
  it('allows entering note title in VoiceRecorderModal', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(<VoiceRecorderModal visible={true} onClose={onClose} onSave={onSave} caseId={101} />);

    const titleInput = screen.getByTestId('voice-note-title-input');
    fireEvent.changeText(titleInput, 'Witness Examination Notes');
    expect(titleInput.props.value).toBe('Witness Examination Notes');
  });

  // 5. Selecting dictation language
  it('allows selecting dictation language between EN, TE, HI', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(<VoiceRecorderModal visible={true} onClose={onClose} onSave={onSave} caseId={101} />);

    fireEvent.press(screen.getByTestId('lang-te-button'));
    fireEvent.press(screen.getByTestId('lang-hi-button'));
    fireEvent.press(screen.getByTestId('lang-en-button'));
  });

  // 6 & 7. Record, pause, resume, stop timer lifecycle
  it('starts recording, allows pause and resume, and stops recording', async () => {
    const startSpy = jest.spyOn(audioService, 'startRecording').mockResolvedValue(undefined);
    const pauseSpy = jest.spyOn(audioService, 'pauseRecording').mockResolvedValue(undefined);
    const resumeSpy = jest.spyOn(audioService, 'resumeRecording').mockResolvedValue(undefined);
    const stopSpy = jest.spyOn(audioService, 'stopRecording').mockResolvedValue({
      uri: 'file:///data/recording_test.m4a',
      durationSeconds: 15,
      name: 'recording_test.m4a',
      sizeBytes: 240000,
    });

    const onSave = jest.fn();
    const onClose = jest.fn();
    render(<VoiceRecorderModal visible={true} onClose={onClose} onSave={onSave} caseId={101} />);

    // 1. Start recording
    await act(async () => {
      fireEvent.press(screen.getByTestId('record-button'));
    });
    expect(startSpy).toHaveBeenCalled();
    expect(screen.getByTestId('pause-record-button')).toBeTruthy();
    expect(screen.getByTestId('stop-record-button')).toBeTruthy();

    // 2. Pause recording
    await act(async () => {
      fireEvent.press(screen.getByTestId('pause-record-button'));
    });
    expect(pauseSpy).toHaveBeenCalled();
    expect(screen.getByTestId('resume-record-button')).toBeTruthy();

    // 3. Resume recording
    await act(async () => {
      fireEvent.press(screen.getByTestId('resume-record-button'));
    });
    expect(resumeSpy).toHaveBeenCalled();

    // 4. Stop recording
    await act(async () => {
      fireEvent.press(screen.getByTestId('stop-record-button'));
    });
    expect(stopSpy).toHaveBeenCalled();
    expect(screen.getByTestId('preview-play-button')).toBeTruthy();
    expect(screen.getByTestId('save-voice-note-button')).toBeTruthy();
  });

  // 8 & 9. Preview playback
  it('toggles playback preview on recorded audio', async () => {
    const playSpy = jest.spyOn(audioService, 'playAudio').mockResolvedValue(undefined);
    const stopAudioSpy = jest.spyOn(audioService, 'stopAudio').mockResolvedValue(undefined);
    jest.spyOn(audioService, 'stopRecording').mockResolvedValue({
      uri: 'file:///data/recording_preview.m4a',
      durationSeconds: 20,
      name: 'recording_preview.m4a',
      sizeBytes: 320000,
    });

    const onSave = jest.fn();
    const onClose = jest.fn();
    render(<VoiceRecorderModal visible={true} onClose={onClose} onSave={onSave} caseId={101} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('record-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('stop-record-button'));
    });

    // Play preview
    await act(async () => {
      fireEvent.press(screen.getByTestId('preview-play-button'));
    });
    expect(playSpy).toHaveBeenCalledWith('file:///data/recording_preview.m4a', 20, expect.any(Function));

    // Stop preview
    await act(async () => {
      fireEvent.press(screen.getByTestId('preview-play-button'));
    });
    expect(stopAudioSpy).toHaveBeenCalled();
  });

  // 10. Saving voice note
  it('calls onSave and upload mutation when Save & Transcribe is pressed', async () => {
    jest.spyOn(audioService, 'stopRecording').mockResolvedValue({
      uri: 'file:///data/save_test.m4a',
      durationSeconds: 30,
      name: 'save_test.m4a',
      sizeBytes: 480000,
    });

    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    render(<VoiceRecorderModal visible={true} onClose={onClose} onSave={onSave} caseId={101} />);

    fireEvent.changeText(screen.getByTestId('voice-note-title-input'), 'Arguments for Bail');
    await act(async () => {
      fireEvent.press(screen.getByTestId('record-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('stop-record-button'));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('save-voice-note-button'));
    });

    expect(onSave).toHaveBeenCalledWith({
      title: 'Arguments for Bail',
      audio_file: {
        uri: 'file:///data/save_test.m4a',
        name: 'save_test.m4a',
        type: 'audio/m4a',
        size: 480000,
      },
      transcription_language: 'en',
      audio_duration_seconds: 30,
      auto_transcribe: true,
    });
  });

  // 11. Renders list of voice note cards
  it('renders list of VoiceNoteCard items with title, date, duration, and status', () => {
    render(<CaseVoiceNotesSection caseId={101} />);

    expect(screen.getByTestId('voice-note-card-1')).toBeTruthy();
    expect(screen.getByTestId('voice-note-card-2')).toBeTruthy();
    expect(screen.getByTestId('voice-note-card-3')).toBeTruthy();
    expect(screen.getByText('Interim Stay Preparation')).toBeTruthy();
    expect(screen.getByText('సాక్షుల విచారణ అంశాలు')).toBeTruthy();
    expect(screen.getByText('Bail Arguments Dictation')).toBeTruthy();
  });

  // 12. DEMO Badge
  it('prominently displays DEMO badge when is_mock is true', () => {
    render(<VoiceNoteCard note={mockVoiceNotes[0]} onUpdate={jest.fn()} onDelete={jest.fn()} onRetrySTT={jest.fn()} />);

    expect(screen.getByTestId('mock-badge-1')).toBeTruthy();
    expect(screen.getByText('DEMO')).toBeTruthy();
  });

  // 13. Status badges
  it('displays STT statuses correctly across notes', () => {
    render(<CaseVoiceNotesSection caseId={101} />);

    expect(screen.getByText('Transcribed')).toBeTruthy();
    expect(screen.getAllByText('Transcribing...').length).toBeGreaterThan(0);
    expect(screen.getByText('STT Failed')).toBeTruthy();
  });

  // 14. Audio playback toggle on card
  it('toggles audio playback on voice note card', async () => {
    const playSpy = jest.spyOn(audioService, 'playAudio').mockResolvedValue(undefined);
    const stopSpy = jest.spyOn(audioService, 'stopAudio').mockResolvedValue(undefined);

    render(
      <VoiceNoteCard
        note={mockVoiceNotes[0]}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
        onRetrySTT={jest.fn()}
      />
    );

    const playBtn = screen.getByTestId('play-audio-button-1');
    await act(async () => {
      fireEvent.press(playBtn);
    });
    expect(playSpy).toHaveBeenCalledWith('/api/voice/notes/1/audio/', 45.5, expect.any(Function));

    await act(async () => {
      fireEvent.press(playBtn);
    });
    expect(stopSpy).toHaveBeenCalled();
  });

  // 15 & 16. Edit Transcript
  it('opens edit modal and allows advocate to edit and save transcript', async () => {
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    render(
      <VoiceNoteCard
        note={mockVoiceNotes[0]}
        onUpdate={onUpdate}
        onDelete={jest.fn()}
        onRetrySTT={jest.fn()}
      />
    );

    // Open edit modal
    fireEvent.press(screen.getByTestId('edit-transcript-button-1'));

    const transcriptInput = screen.getByTestId('edit-transcript-input');
    fireEvent.changeText(transcriptInput, 'Custom argument citing Article 226.');

    await act(async () => {
      fireEvent.press(screen.getByTestId('save-transcript-button'));
    });

    expect(onUpdate).toHaveBeenCalledWith({
      title: 'Interim Stay Preparation',
      transcript: 'Custom argument citing Article 226.',
    });
  });

  // 17. Retry STT on failed note
  it('displays retry STT button on failed note and triggers retry', async () => {
    const onRetrySTT = jest.fn().mockResolvedValue(undefined);
    render(
      <VoiceNoteCard
        note={mockVoiceNotes[2]} // FAILED status
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
        onRetrySTT={onRetrySTT}
      />
    );

    const retryBtn = screen.getByTestId('retry-stt-button-3');
    await act(async () => {
      fireEvent.press(retryBtn);
    });
    expect(onRetrySTT).toHaveBeenCalledWith('hi');
  });

  // 18. Delete voice note
  it('shows confirmation alert and calls onDelete when confirmed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const onDelete = jest.fn().mockResolvedValue(undefined);

    render(
      <VoiceNoteCard
        note={mockVoiceNotes[0]}
        onUpdate={jest.fn()}
        onDelete={onDelete}
        onRetrySTT={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId('delete-voice-note-button-1'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete Voice Note',
      expect.stringContaining('Are you sure you want to permanently delete'),
      expect.any(Array)
    );

    // Simulate clicking delete in alert buttons
    const deleteButtonAction = alertSpy.mock.calls[0][2]?.find((btn) => btn.style === 'destructive');
    if (deleteButtonAction?.onPress) {
      await act(async () => {
        await deleteButtonAction.onPress!();
      });
      expect(onDelete).toHaveBeenCalled();
    }
  });

  // 19. Offline voice queueing
  it('queues offline voice recording when upload fails due to network error', async () => {
    mockUploadMutate.mockRejectedValueOnce(new Error('Network error: Offline'));

    render(<CaseVoiceNotesSection caseId={101} />);

    // Open recorder modal and save
    fireEvent.press(screen.getByTestId('open-record-modal-button'));

    jest.spyOn(audioService, 'stopRecording').mockResolvedValue({
      uri: 'file:///data/offline_rec.m4a',
      durationSeconds: 12,
      name: 'offline_rec.m4a',
      sizeBytes: 192000,
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('record-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('stop-record-button'));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('save-voice-note-button'));
    });

    expect(offlineVoiceQueue.enqueueRecording).toHaveBeenCalledWith(
      'current_user',
      expect.objectContaining({
        caseId: 101,
        audioUri: 'file:///data/offline_rec.m4a',
        audioName: 'offline_rec.m4a',
        audioMimeType: 'audio/m4a',
        audioDurationSeconds: 12,
        audioSizeBytes: 192000,
        language: 'en',
      })
    );
  });
});
