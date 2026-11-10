import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import AdminLayout from '../app/admin/_layout';
import AdminDashboardScreen from '../app/admin/index';
import AdminUsersScreen from '../app/admin/users/index';
import AdminUserDetailScreen from '../app/admin/users/[id]';
import AdminCaseAssignmentScreen from '../app/admin/cases';
import { useAuth } from '../features/auth/AuthContext';
import {
  useAdminCaseAssignments,
  useAdminCases,
  useAdminDashboard,
  useAdminUserDetail,
  useAdminUsers,
  useAssignCase,
  useCreateAdminUser,
  useUpdateAdminUser,
} from '../features/admin/hooks';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const MockStack = ({ children }: { children: React.ReactNode }) =>
    React.createElement('Stack', null, children);
  MockStack.Screen = ({ name }: { name: string }) =>
    React.createElement('Stack.Screen', { name });
  return {
    Stack: MockStack,
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
    }),
    useLocalSearchParams: () => ({ id: '2' }),
  };
});

jest.mock('../features/auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../features/admin/hooks', () => ({
  useAdminDashboard: jest.fn(),
  useAdminUsers: jest.fn(),
  useAdminUserDetail: jest.fn(),
  useCreateAdminUser: jest.fn(),
  useUpdateAdminUser: jest.fn(),
  useAdminCases: jest.fn(),
  useAssignCase: jest.fn(),
  useAdminCaseAssignments: jest.fn(),
}));

jest.mock('../services/notifications/pushService', () => ({
  pushNotificationService: {
    deactivatePushNotifications: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('Admin Workspace & RBAC Enforcement', () => {
  const mockCreateMutate = jest.fn();
  const mockUpdateMutate = jest.fn();
  const mockAssignMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        id: 1,
        username: 'admin',
        full_name: 'Practice Admin',
        role: 'ADMIN',
        is_admin: true,
        is_superuser: true,
      },
      role: 'ADMIN',
      isAdmin: true,
      isSuperuser: true,
      isAuthenticated: true,
      isDemo: false,
      isLoading: false,
      signOut: jest.fn().mockResolvedValue(undefined),
    });

    (useCreateAdminUser as jest.Mock).mockReturnValue({
      mutateAsync: mockCreateMutate,
      isPending: false,
    });
    (useUpdateAdminUser as jest.Mock).mockReturnValue({
      mutateAsync: mockUpdateMutate,
      isPending: false,
    });
    (useAssignCase as jest.Mock).mockReturnValue({
      mutateAsync: mockAssignMutate,
      isPending: false,
    });
  });

  it('redirects non-admin ADVOCATE away from /admin layout to /(tabs)', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 2, username: 'AP/8888/2021', role: 'ADVOCATE', is_admin: false },
      role: 'ADVOCATE',
      isAdmin: false,
      isSuperuser: false,
      isAuthenticated: true,
      isDemo: false,
      isLoading: false,
    });

    render(<AdminLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('renders Admin Home stats, System Overview, Security Notice, and Audit Activity', () => {
    (useAdminDashboard as jest.Mock).mockReturnValue({
      data: {
        stats: {
          total_advocates: 12,
          active_advocates: 10,
          inactive_advocates: 2,
          pending_approvals: 3,
          total_admins: 1,
          total_cases: 18,
          assigned_cases: 15,
          unassigned_cases: 3,
        },
        system_overview: {
          database_status: 'healthy',
          database_engine: 'postgresql',
          debug_mode: false,
          total_assignments: 21,
          audit_log_count: 42,
          recent_registrations_7d: 4,
        },
        recent_activity: [
          {
            id: 99,
            action: 'CASE_ASSIGNED',
            actor_name: 'Practice Admin',
            target_case: 10,
            target_case_number: 'WP 101/2024',
            summary: 'Assigned WP 101/2024 to AP/8888/2021',
            created_at: '2026-11-10T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });

    render(<AdminDashboardScreen />);

    expect(screen.getByTestId('admin-dashboard-screen')).toBeTruthy();
    expect(screen.getByTestId('admin-security-notice')).toBeTruthy();
    expect(screen.getByTestId('admin-stat-total-advocates-value').props.children).toBe(
      12
    );
    expect(screen.getByTestId('admin-stat-active-accounts-value').props.children).toBe(
      10
    );
    expect(screen.getByTestId('admin-stat-pending-approvals-value').props.children).toBe(
      3
    );
    expect(screen.getByTestId('admin-stat-assigned-cases-value').props.children).toBe(15);
    expect(screen.getByTestId('admin-system-overview')).toBeTruthy();
    expect(screen.getByTestId('admin-audit-item-99')).toBeTruthy();

    fireEvent.press(screen.getByTestId('admin-nav-users'));
    expect(mockPush).toHaveBeenCalledWith('/admin/users');
  });

  it('enforces superuser-only Admin creation option and creates Advocate accounts safely', async () => {
    (useAdminUsers as jest.Mock).mockReturnValue({
      data: [
        {
          id: 2,
          username: 'AP/8888/2021',
          email: 'adv@aphc.in',
          full_name: 'Advocate Rao',
          role: 'ADVOCATE',
          is_admin: false,
          is_active: true,
          is_superuser: false,
          assigned_cases_count: 3,
          profile: {
            bar_council_enrollment_number: 'AP/8888/2021',
            is_verified: true,
          },
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });

    // Staff admin (non-superuser) should NOT see ADMIN role selector
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        id: 5,
        username: 'staffadmin',
        role: 'ADMIN',
        is_admin: true,
        is_superuser: false,
      },
      isAdmin: true,
      isSuperuser: false,
      isAuthenticated: true,
    });

    render(<AdminUsersScreen />);
    expect(screen.getByTestId('admin-user-card-2')).toBeTruthy();

    fireEvent.press(screen.getByTestId('admin-create-user-btn'));
    expect(screen.getByTestId('admin-create-user-modal')).toBeTruthy();
    expect(screen.getByTestId('create-user-role-locked')).toBeTruthy();
    expect(screen.queryByTestId('create-user-role-selector')).toBeNull();

    mockCreateMutate.mockResolvedValueOnce({ id: 9, username: 'AP/5555/2025' });
    fireEvent.changeText(
      screen.getByTestId('create-user-enrollment-input'),
      'ap/5555/2025'
    );
    fireEvent.changeText(
      screen.getByTestId('create-user-password-input'),
      'Advocate999!'
    );
    fireEvent.press(screen.getByTestId('create-user-submit-btn'));

    await waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          enrollment_number: 'AP/5555/2025',
          account_role: 'ADVOCATE',
          designation: 'ASSOCIATE',
        })
      );
    });
  });

  it('allows superuser Admin to view individual user details and update profile metadata', async () => {
    (useAdminUserDetail as jest.Mock).mockReturnValue({
      data: {
        id: 2,
        username: 'AP/8888/2021',
        email: 'adv@aphc.in',
        first_name: 'Lakshmi',
        last_name: 'Rao',
        full_name: 'Lakshmi Rao',
        role: 'ADVOCATE',
        is_admin: false,
        is_active: true,
        is_superuser: false,
        assigned_cases_count: 1,
        assigned_cases: [
          {
            id: 10,
            formatted_case_number: 'WP 101/2024',
            petitioner: 'Ramesh',
            respondent: 'State of AP',
            current_stage: 'HEARING',
            court_hall_number: 4,
            next_hearing_date: '2026-11-15',
          },
        ],
        profile: {
          id: 1,
          bar_council_enrollment_number: 'AP/8888/2021',
          phone_number: '9876543210',
          chamber_address: 'Amaravati',
          role: 'SENIOR',
          preferred_language: 'en',
          is_verified: true,
          created_at: '',
          updated_at: '',
        },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    mockUpdateMutate.mockResolvedValueOnce({ id: 2 });

    render(<AdminUserDetailScreen />);

    expect(screen.getByTestId('admin-user-identity-card')).toBeTruthy();
    expect(screen.getByTestId('admin-detail-role-btn-admin')).toBeTruthy();
    expect(screen.getByTestId('admin-user-assigned-cases')).toBeTruthy();

    fireEvent.changeText(
      screen.getByTestId('admin-edit-chamber-input'),
      'Chamber 12, APHC'
    );
    fireEvent.press(screen.getByTestId('admin-user-save-btn'));

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith({
        id: 2,
        payload: expect.objectContaining({
          chamber_address: 'Chamber 12, APHC',
          designation: 'SENIOR',
        }),
      });
    });
  });

  it('assigns an unassigned case to an active advocate with audit notes', async () => {
    (useAdminCases as jest.Mock).mockReturnValue({
      data: [
        {
          id: 14,
          case_type: 'WP',
          case_number: '204',
          filing_year: 2025,
          formatted_case_number: 'WP 204/2025',
          petitioner: 'Sita Devi',
          respondent: 'Revenue Dept',
          current_stage: 'ADMISSION',
          court_hall_number: 2,
          next_hearing_date: '2026-11-20',
          is_assigned: false,
          assigned_advocates: [],
          created_at: '',
          updated_at: '',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });
    (useAdminUsers as jest.Mock).mockReturnValue({
      data: [
        {
          id: 2,
          username: 'AP/8888/2021',
          full_name: 'Lakshmi Rao',
          role: 'ADVOCATE',
          is_admin: false,
          is_active: true,
          is_superuser: false,
          assigned_cases_count: 1,
          profile: {
            bar_council_enrollment_number: 'AP/8888/2021',
            is_verified: true,
          },
        },
      ],
    });
    (useAdminCaseAssignments as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: jest.fn(),
    });

    mockAssignMutate.mockResolvedValueOnce({
      detail: 'Case WP 204/2025 assigned to Lakshmi Rao.',
      case: {
        id: 14,
        formatted_case_number: 'WP 204/2025',
        petitioner: 'Sita Devi',
        respondent: 'Revenue Dept',
        is_assigned: true,
        assigned_advocates: [
          {
            id: 2,
            username: 'AP/8888/2021',
            full_name: 'Lakshmi Rao',
            enrollment_number: 'AP/8888/2021',
            is_active: true,
            role: 'ADVOCATE',
          },
        ],
      },
    });

    render(<AdminCaseAssignmentScreen />);

    expect(screen.getByTestId('admin-case-card-14')).toBeTruthy();
    fireEvent.press(screen.getByTestId('admin-case-assign-btn-14'));
    expect(screen.getByTestId('admin-assign-modal')).toBeTruthy();

    fireEvent.press(screen.getByTestId('admin-pick-advocate-2'));
    fireEvent.changeText(
      screen.getByTestId('admin-assign-notes-input'),
      'Primary counsel assignment'
    );
    fireEvent.press(screen.getByTestId('admin-assign-confirm-btn'));

    await waitFor(() => {
      expect(mockAssignMutate).toHaveBeenCalledWith({
        caseId: 14,
        payload: {
          advocate_id: 2,
          action: 'assign',
          notes: 'Primary counsel assignment',
          replace_advocate_id: undefined,
        },
      });
    });
  });
});
