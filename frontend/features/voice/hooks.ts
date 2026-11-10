import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import {
  CreateVoiceNotePayload,
  UpdateVoiceNotePayload,
  VoiceNoteItem,
  VoiceTranscriptionLanguage,
} from '../../types';

export interface VoiceNoteFilters {
  search?: string;
  language?: VoiceTranscriptionLanguage;
  status?: string;
}

export const useCaseVoiceNotes = (
  caseId: number | string,
  filters?: VoiceNoteFilters
) => {
  return useQuery({
    queryKey: ['case-voice-notes', caseId, filters],
    queryFn: async (): Promise<VoiceNoteItem[]> => {
      const params: Record<string, string> = {};
      if (filters?.search) params.search = filters.search;
      if (filters?.language) params.language = filters.language;
      if (filters?.status) params.status = filters.status;

      const response = await apiClient.get<
        VoiceNoteItem[] | { results?: VoiceNoteItem[] }
      >(ENDPOINTS.VOICE.CASE_NOTES(caseId), { params });
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return response.data?.results || [];
    },
    enabled: !!caseId,
  });
};

export const useVoiceNoteDetail = (noteId: number | string) => {
  return useQuery({
    queryKey: ['voice-note-detail', noteId],
    queryFn: async (): Promise<VoiceNoteItem> => {
      const response = await apiClient.get<VoiceNoteItem>(
        ENDPOINTS.VOICE.NOTE_DETAIL(noteId)
      );
      return response.data;
    },
    enabled: !!noteId,
  });
};

export const useUploadVoiceNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      caseId,
      payload,
    }: {
      caseId: number | string;
      payload: CreateVoiceNotePayload;
    }): Promise<VoiceNoteItem> => {
      const formData = new FormData();
      if (payload.title) {
        formData.append('title', payload.title);
      }
      if (payload.transcription_language) {
        formData.append('transcription_language', payload.transcription_language);
      }
      if (payload.audio_duration_seconds !== undefined) {
        formData.append('audio_duration_seconds', String(payload.audio_duration_seconds));
      }
      if (payload.auto_transcribe !== undefined) {
        formData.append('auto_transcribe', String(payload.auto_transcribe));
      }

      // Append audio file object
      formData.append('audio_file', payload.audio_file as unknown as Blob);

      const response = await apiClient.post<VoiceNoteItem>(
        ENDPOINTS.VOICE.CASE_NOTES(caseId),
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['case-voice-notes', variables.caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-detail', variables.caseId] });
    },
  });
};

export const useUpdateVoiceNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      data,
    }: {
      noteId: number | string;
      caseId?: number | string;
      data: UpdateVoiceNotePayload;
    }): Promise<VoiceNoteItem> => {
      const response = await apiClient.patch<VoiceNoteItem>(
        ENDPOINTS.VOICE.NOTE_DETAIL(noteId),
        data
      );
      return response.data;
    },
    onSuccess: (updatedNote, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['voice-note-detail', variables.noteId],
      });
      if (variables.caseId) {
        queryClient.invalidateQueries({
          queryKey: ['case-voice-notes', variables.caseId],
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['case-voice-notes'] });
      }
    },
  });
};

export const useDeleteVoiceNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
    }: {
      noteId: number | string;
      caseId?: number | string;
    }): Promise<void> => {
      await apiClient.delete(ENDPOINTS.VOICE.NOTE_DETAIL(noteId));
    },
    onSuccess: (_, variables) => {
      if (variables.caseId) {
        queryClient.invalidateQueries({
          queryKey: ['case-voice-notes', variables.caseId],
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['case-voice-notes'] });
      }
    },
  });
};

export const useTranscribeVoiceNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      language,
    }: {
      noteId: number | string;
      caseId?: number | string;
      language?: VoiceTranscriptionLanguage;
    }): Promise<VoiceNoteItem> => {
      const payload = language ? { transcription_language: language } : {};
      const response = await apiClient.post<VoiceNoteItem>(
        ENDPOINTS.VOICE.NOTE_TRANSCRIBE(noteId),
        payload
      );
      return response.data;
    },
    onSuccess: (updatedNote, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['voice-note-detail', variables.noteId],
      });
      if (variables.caseId) {
        queryClient.invalidateQueries({
          queryKey: ['case-voice-notes', variables.caseId],
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['case-voice-notes'] });
      }
    },
  });
};
