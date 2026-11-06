import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { offlineStorage } from '../../services/offline/offlineStorage';
import { tokenStorage } from '../../services/auth/tokenStorage';
import {
  CaseItem,
  JudgmentItem,
  CaseHistoryItem,
  HearingItem,
  RescheduleHearingPayload,
} from '../../types';

export const useCases = () => {
  return useQuery({
    queryKey: ['cases'],
    queryFn: async (): Promise<CaseItem[]> => {
      const enrollment = await tokenStorage.getUserEnrollment();
      try {
        const response = await apiClient.get<CaseItem[] | { results: CaseItem[] }>(
          ENDPOINTS.CASES.LIST
        );
        const raw = response.data;
        const data = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as { results?: CaseItem[] })?.results)
            ? (raw as { results: CaseItem[] }).results
            : [];
        await offlineStorage.saveCachedCases(enrollment, data);
        await offlineStorage.saveSyncMetadata(enrollment, {
          lastSyncedAt: new Date().toISOString(),
          status: 'ONLINE',
        });
        return data;
      } catch (err) {
        const cached = await offlineStorage.getCachedCases(enrollment);
        if (cached && cached.data) {
          return cached.data;
        }
        throw err;
      }
    },
  });
};

export const useCaseDetail = (id: number | string) => {
  return useQuery({
    queryKey: ['case', id],
    queryFn: async (): Promise<CaseItem> => {
      const enrollment = await tokenStorage.getUserEnrollment();
      try {
        const response = await apiClient.get<CaseItem>(ENDPOINTS.CASES.DETAIL(id));
        await offlineStorage.saveCachedCaseDetail(enrollment, response.data);
        return response.data;
      } catch (err) {
        const cached = await offlineStorage.getCachedCaseDetail(enrollment, id);
        if (cached && cached.data) {
          return cached.data;
        }
        throw err;
      }
    },
    enabled: !!id,
  });
};

export const useCaseJudgments = (caseId: number | string) => {
  return useQuery({
    queryKey: ['case-judgments', caseId],
    queryFn: async (): Promise<JudgmentItem[]> => {
      const response = await apiClient.get<JudgmentItem[] | { results: JudgmentItem[] }>(
        ENDPOINTS.CASES.JUDGMENTS(caseId)
      );
      const raw = response.data;
      if (Array.isArray(raw)) {
        return raw;
      }
      if (
        raw &&
        typeof raw === 'object' &&
        'results' in raw &&
        Array.isArray(raw.results)
      ) {
        return raw.results as JudgmentItem[];
      }
      return [];
    },
    enabled: !!caseId,
  });
};

export interface JudgmentDocResponse {
  id: number;
  case_id: number;
  case_title: string;
  judgment_date: string;
  document_link?: string | null;
  has_document: boolean;
}

export const useJudgmentDocument = (
  caseId: number | string,
  judgmentId: number | string
) => {
  return useQuery({
    queryKey: ['judgment-doc', caseId, judgmentId],
    queryFn: async (): Promise<JudgmentDocResponse> => {
      const response = await apiClient.get<JudgmentDocResponse>(
        ENDPOINTS.CASES.JUDGMENT_DOCUMENT(caseId, judgmentId)
      );
      return response.data;
    },
    enabled: !!caseId && !!judgmentId,
  });
};

export const useCaseHistory = (caseId: number | string, eventType?: string) => {
  return useQuery({
    queryKey: ['case-history', caseId, eventType],
    queryFn: async (): Promise<CaseHistoryItem[]> => {
      const url = eventType
        ? `${ENDPOINTS.CASES.HISTORY(caseId)}?event_type=${encodeURIComponent(eventType)}`
        : ENDPOINTS.CASES.HISTORY(caseId);
      const response = await apiClient.get<
        CaseHistoryItem[] | { results: CaseHistoryItem[] }
      >(url);
      const raw = response.data;
      if (Array.isArray(raw)) {
        return raw;
      }
      if (
        raw &&
        typeof raw === 'object' &&
        'results' in raw &&
        Array.isArray(raw.results)
      ) {
        return raw.results as CaseHistoryItem[];
      }
      return [];
    },
    enabled: !!caseId,
  });
};

export const useUpcomingHearings = (search?: string) => {
  return useQuery({
    queryKey: ['upcoming-hearings', search],
    queryFn: async (): Promise<HearingItem[]> => {
      const enrollment = await tokenStorage.getUserEnrollment();
      try {
        const url = search
          ? `${ENDPOINTS.CASES.UPCOMING_HEARINGS}?search=${encodeURIComponent(search)}`
          : ENDPOINTS.CASES.UPCOMING_HEARINGS;
        const response = await apiClient.get<HearingItem[] | { results: HearingItem[] }>(
          url
        );
        const raw = response.data;
        const data = Array.isArray(raw)
          ? raw
          : (raw as { results?: HearingItem[] })?.results || [];
        if (!search) {
          await offlineStorage.saveCachedUpcomingHearings(enrollment, data);
        }
        return data;
      } catch (err) {
        const cached = await offlineStorage.getCachedUpcomingHearings(enrollment);
        if (cached && cached.data) {
          return cached.data;
        }
        throw err;
      }
    },
  });
};

export interface RescheduleHearingArgs {
  caseId: number | string;
  hearingId: number | string;
  payload: RescheduleHearingPayload;
}

export const useRescheduleHearing = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, hearingId, payload }: RescheduleHearingArgs) => {
      const response = await apiClient.post<{ detail: string; hearing: HearingItem }>(
        ENDPOINTS.CASES.HEARING_RESCHEDULE(caseId, hearingId),
        payload
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['upcoming-hearings'] });
      queryClient.invalidateQueries({ queryKey: ['case', String(variables.caseId)] });
      queryClient.invalidateQueries({
        queryKey: ['case-history', String(variables.caseId)],
      });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
};
