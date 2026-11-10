import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import {
  AdminAuditLogItem,
  AdminCaseItem,
  AdminCreateUserPayload,
  AdminDashboardResponse,
  AdminUpdateUserPayload,
  AdminUserDetail,
  AdminUserItem,
  CaseAssignmentHistoryItem,
  CaseAssignmentPayload,
} from '../../types';

interface PaginatedResponse<T> {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
}

const unwrapResults = <T>(raw: T[] | PaginatedResponse<T> | undefined): T[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.results)) return raw.results;
  return [];
};

export const useAdminDashboard = () => {
  return useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async (): Promise<AdminDashboardResponse> => {
      const response = await apiClient.get<AdminDashboardResponse>(
        ENDPOINTS.ADMIN.DASHBOARD
      );
      return response.data;
    },
  });
};

export interface AdminUserFilters {
  search?: string;
  role?: 'ALL' | 'ADVOCATE' | 'ADMIN';
  status?: 'ALL' | 'active' | 'inactive' | 'pending';
}

export const useAdminUsers = (filters?: AdminUserFilters) => {
  return useQuery({
    queryKey: ['admin-users', filters],
    queryFn: async (): Promise<AdminUserItem[]> => {
      const params: Record<string, string> = {};
      if (filters?.search?.trim()) params.search = filters.search.trim();
      if (filters?.role && filters.role !== 'ALL') params.role = filters.role;
      if (filters?.status && filters.status !== 'ALL') params.status = filters.status;

      const response = await apiClient.get<
        AdminUserItem[] | PaginatedResponse<AdminUserItem>
      >(ENDPOINTS.ADMIN.USERS, { params });
      return unwrapResults(response.data);
    },
  });
};

export const useAdminUserDetail = (userId: number | string) => {
  return useQuery({
    queryKey: ['admin-user', String(userId)],
    queryFn: async (): Promise<AdminUserDetail> => {
      const response = await apiClient.get<AdminUserDetail>(
        ENDPOINTS.ADMIN.USER_DETAIL(userId)
      );
      return response.data;
    },
    enabled: Boolean(userId),
  });
};

export const useCreateAdminUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AdminCreateUserPayload): Promise<AdminUserItem> => {
      const response = await apiClient.post<AdminUserItem>(
        ENDPOINTS.ADMIN.USERS,
        payload
      );
      return response.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
    },
  });
};

export const useUpdateAdminUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: number | string;
      payload: AdminUpdateUserPayload;
    }): Promise<AdminUserItem> => {
      const response = await apiClient.patch<AdminUserItem>(
        ENDPOINTS.ADMIN.USER_DETAIL(id),
        payload
      );
      return response.data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-user', String(vars.id)] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
    },
  });
};

export interface AdminCaseFilters {
  search?: string;
  assignment?: 'all' | 'unassigned' | 'assigned';
}

export const useAdminCases = (filters?: AdminCaseFilters) => {
  return useQuery({
    queryKey: ['admin-cases', filters],
    queryFn: async (): Promise<AdminCaseItem[]> => {
      const params: Record<string, string> = {};
      if (filters?.search?.trim()) params.search = filters.search.trim();
      if (filters?.assignment && filters.assignment !== 'all') {
        params.assignment = filters.assignment;
      }

      const response = await apiClient.get<
        AdminCaseItem[] | PaginatedResponse<AdminCaseItem>
      >(ENDPOINTS.ADMIN.CASES, { params });
      return unwrapResults(response.data);
    },
  });
};

export const useAssignCase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      caseId,
      payload,
    }: {
      caseId: number | string;
      payload: CaseAssignmentPayload;
    }): Promise<{ detail: string; case: AdminCaseItem }> => {
      const response = await apiClient.post<{ detail: string; case: AdminCaseItem }>(
        ENDPOINTS.ADMIN.CASE_ASSIGN(caseId),
        payload
      );
      return response.data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-cases'] });
      qc.invalidateQueries({ queryKey: ['admin-case-assignments', String(vars.caseId)] });
      qc.invalidateQueries({ queryKey: ['admin-assignments'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
    },
  });
};

export const useAdminCaseAssignments = (caseId?: number | string) => {
  return useQuery({
    queryKey: caseId ? ['admin-case-assignments', String(caseId)] : ['admin-assignments'],
    queryFn: async (): Promise<CaseAssignmentHistoryItem[]> => {
      const endpoint = caseId
        ? ENDPOINTS.ADMIN.CASE_ASSIGNMENTS(caseId)
        : ENDPOINTS.ADMIN.ASSIGNMENTS;
      const response = await apiClient.get<
        CaseAssignmentHistoryItem[] | PaginatedResponse<CaseAssignmentHistoryItem>
      >(endpoint);
      return unwrapResults(response.data);
    },
  });
};

export const useAdminAuditLogs = (action?: string) => {
  return useQuery({
    queryKey: ['admin-audit-logs', action || 'ALL'],
    queryFn: async (): Promise<AdminAuditLogItem[]> => {
      const params: Record<string, string> = {};
      if (action && action !== 'ALL') params.action = action;
      const response = await apiClient.get<
        AdminAuditLogItem[] | PaginatedResponse<AdminAuditLogItem>
      >(ENDPOINTS.ADMIN.AUDIT_LOGS, { params });
      return unwrapResults(response.data);
    },
  });
};
