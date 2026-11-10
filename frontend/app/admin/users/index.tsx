import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../../../components/common/ScreenContainer';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Input } from '../../../components/common/Input';
import { AppIcon } from '../../../components/common/AppIcon';
import { SkeletonCard } from '../../../components/common/SkeletonCard';
import { ErrorState } from '../../../components/common/ErrorState';
import { EmptyState } from '../../../components/common/EmptyState';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import { Colors } from '../../../constants/colors';
import { Radius, Shadows, Spacing } from '../../../constants/theme';
import {
  useAdminUsers,
  useCreateAdminUser,
  useUpdateAdminUser,
} from '../../../features/admin/hooks';
import { useAuth } from '../../../features/auth/AuthContext';
import { BAR_COUNCIL_ID_REGEX } from '../../../features/auth/schemas';
import { AdminUserItem, AdvocateDesignation, UserRole } from '../../../types';

const extractApiError = (err: unknown, fallback: string): string => {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: Record<string, unknown> } }).response
      ?.data;
    if (data && typeof data === 'object') {
      if (typeof data.detail === 'string') return data.detail;
      if (typeof data.error === 'string') return data.error;
      const firstKey = Object.keys(data)[0];
      if (firstKey) {
        const val = data[firstKey];
        if (Array.isArray(val) && val[0]) return `${firstKey}: ${String(val[0])}`;
        if (typeof val === 'string') return `${firstKey}: ${val}`;
      }
    }
  }
  return fallback;
};

type RoleFilter = 'ALL' | 'ADVOCATE' | 'ADMIN';
type StatusFilter = 'ALL' | 'active' | 'inactive' | 'pending';

export default function AdminUsersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string; status?: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;

  const { user: currentUser, isSuperuser } = useAuth();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(
    params.role === 'ADMIN' || params.role === 'ADVOCATE' ? params.role : 'ALL'
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    params.status === 'active' ||
      params.status === 'inactive' ||
      params.status === 'pending'
      ? params.status
      : 'ALL'
  );

  useEffect(() => {
    if (params.role === 'ADMIN' || params.role === 'ADVOCATE' || params.role === 'ALL') {
      setRoleFilter(params.role);
    }
    if (
      params.status === 'active' ||
      params.status === 'inactive' ||
      params.status === 'pending' ||
      params.status === 'ALL'
    ) {
      setStatusFilter(params.status);
    }
  }, [params.role, params.status]);

  const filters = useMemo(
    () => ({
      search: searchQuery,
      role: roleFilter,
      status: statusFilter,
    }),
    [searchQuery, roleFilter, statusFilter]
  );

  const {
    data: users = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useAdminUsers(filters);

  const createMutation = useCreateAdminUser();
  const updateMutation = useUpdateAdminUser();

  // Create Account Modal State
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [enrollmentNumber, setEnrollmentNumber] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [chamberAddress, setChamberAddress] = useState('');
  const [designation, setDesignation] = useState<AdvocateDesignation>('ASSOCIATE');
  const [accountRole, setAccountRole] = useState<UserRole>('ADVOCATE');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isActiveNew, setIsActiveNew] = useState(true);
  const [isVerifiedNew, setIsVerifiedNew] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  // Status Confirmation State
  const [statusTarget, setStatusTarget] = useState<AdminUserItem | null>(null);

  const resetCreateForm = () => {
    setEnrollmentNumber('');
    setUsername('');
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhoneNumber('');
    setChamberAddress('');
    setDesignation('ASSOCIATE');
    setAccountRole('ADVOCATE');
    setPassword('');
    setShowPassword(false);
    setIsActiveNew(true);
    setIsVerifiedNew(true);
    setCreateError(null);
  };

  const handleCreateAccount = async () => {
    setCreateError(null);
    const normalizedEnrollment = enrollmentNumber.trim().toUpperCase();
    if (!BAR_COUNCIL_ID_REGEX.test(normalizedEnrollment)) {
      setCreateError('Bar Council Enrollment ID must match AP/1234/2020 format.');
      return;
    }
    if (password.length < 8) {
      setCreateError('Initial password must be at least 8 characters.');
      return;
    }

    const safeRole: UserRole =
      accountRole === 'ADMIN' && isSuperuser ? 'ADMIN' : 'ADVOCATE';

    try {
      await createMutation.mutateAsync({
        enrollment_number: normalizedEnrollment,
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: phoneNumber.trim(),
        chamber_address: chamberAddress.trim(),
        designation,
        account_role: safeRole,
        is_active: isActiveNew,
        is_verified: isVerifiedNew,
      });
      setIsCreateModalVisible(false);
      resetCreateForm();
      showToast(t('admin.userCreatedToast', 'Account created successfully.'), 'success');
    } catch (err) {
      setCreateError(extractApiError(err, 'Unable to create user account.'));
    }
  };

  const handleConfirmToggleActive = async () => {
    if (!statusTarget) return;
    try {
      const nextActive = !statusTarget.is_active;
      await updateMutation.mutateAsync({
        id: statusTarget.id,
        payload: { is_active: nextActive },
      });
      setStatusTarget(null);
      showToast(
        nextActive ? 'Account activated.' : 'Account deactivated.',
        nextActive ? 'success' : 'info'
      );
    } catch (err) {
      setStatusTarget(null);
      showToast(extractApiError(err, 'Unable to update account status.'), 'error');
    }
  };

  const canModifyTargetStatus = (item: AdminUserItem): boolean => {
    if (currentUser && item.id === currentUser.id) return false;
    if (item.is_admin && !isSuperuser) return false;
    return true;
  };

  const renderUserCard = ({ item }: { item: AdminUserItem }) => {
    const canToggle = canModifyTargetStatus(item);
    const enrollment = item.profile?.bar_council_enrollment_number || item.username;
    const isVerified = Boolean(item.profile?.is_verified);

    return (
      <Card style={styles.userCard} testID={`admin-user-card-${item.id}`}>
        <View style={styles.userTopRow}>
          <View style={styles.userIdentityCol}>
            <Text style={styles.userFullName}>{item.full_name || item.username}</Text>
            <Text style={styles.userSubMeta}>
              @{item.username} • {enrollment}
            </Text>
          </View>
          <View style={styles.userBadgesRow}>
            <Badge label={item.role} variant={item.is_admin ? 'gold' : 'primary'} />
            <Badge
              label={item.is_active ? 'ACTIVE' : 'INACTIVE'}
              variant={item.is_active ? 'success' : 'danger'}
            />
          </View>
        </View>

        <View style={styles.userMetaRow}>
          <View style={styles.metaChipRow}>
            <AppIcon name="briefcase" size={13} color={Colors.text.muted} />
            <Text style={styles.metaText}>
              {item.assigned_cases_count}{' '}
              {item.assigned_cases_count === 1 ? 'case' : 'cases'}
            </Text>
          </View>
          {item.profile ? (
            <Badge
              label={isVerified ? 'VERIFIED' : 'PENDING APPROVAL'}
              variant={isVerified ? 'info' : 'warning'}
            />
          ) : null}
          {item.email ? (
            <Text style={styles.emailText} numberOfLines={1}>
              {item.email}
            </Text>
          ) : null}
        </View>

        <View style={styles.userActionsRow}>
          <Button
            title={t('admin.viewManageUser', 'View & Edit')}
            variant="outline"
            onPress={() => router.push(`/admin/users/${item.id}`)}
            style={styles.userActionBtn}
            testID={`admin-user-detail-btn-${item.id}`}
          />
          <Button
            title={
              item.is_active
                ? t('admin.deactivate', 'Deactivate')
                : t('admin.activate', 'Activate')
            }
            variant={item.is_active ? 'secondary' : 'primary'}
            disabled={!canToggle}
            onPress={() => setStatusTarget(item)}
            style={styles.userActionBtn}
            testID={`admin-user-toggle-active-${item.id}`}
          />
        </View>
      </Card>
    );
  };

  return (
    <ScreenContainer testID="admin-users-screen">
      <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
        {/* Top Action Header */}
        <View style={styles.topActionRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.screenHeading}>
              {t('admin.userManagement', 'Advocate & User Directory')}
            </Text>
            <Text style={styles.screenSubheading}>
              {users.length} {users.length === 1 ? 'account' : 'accounts'} matching
              filters
            </Text>
          </View>
          <Button
            title={t('admin.createUserBtn', '+ Create Account')}
            variant="primary"
            onPress={() => {
              resetCreateForm();
              setIsCreateModalVisible(true);
            }}
            style={styles.createBtn}
            testID="admin-create-user-btn"
          />
        </View>

        {/* Search Input */}
        <Input
          placeholder={t(
            'admin.searchUsersPlaceholder',
            'Search by name, Bar Council ID, username, or email...'
          )}
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon={<AppIcon name="search" size={18} color={Colors.text.muted} />}
          rightAction={
            searchQuery ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                accessibilityLabel="Clear user search"
              >
                <AppIcon name="x" size={16} color={Colors.text.muted} />
              </TouchableOpacity>
            ) : undefined
          }
          testID="admin-users-search"
        />

        {/* Role Filters */}
        <View style={styles.filtersGroup}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {(['ALL', 'ADVOCATE', 'ADMIN'] as RoleFilter[]).map(r => {
              const selected = roleFilter === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.filterChip, selected && styles.filterChipActive]}
                  onPress={() => setRoleFilter(r)}
                  testID={`admin-filter-role-${r.toLowerCase()}`}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selected && styles.filterChipTextActive,
                    ]}
                  >
                    {r === 'ALL' ? 'All Roles' : r}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {(['active', 'inactive', 'pending'] as StatusFilter[]).map(st => {
              const selected = statusFilter === st;
              return (
                <TouchableOpacity
                  key={st}
                  style={[styles.filterChip, selected && styles.filterChipActive]}
                  onPress={() => setStatusFilter(prev => (prev === st ? 'ALL' : st))}
                  testID={`admin-filter-status-${st}`}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selected && styles.filterChipTextActive,
                    ]}
                  >
                    {st === 'active'
                      ? 'Active'
                      : st === 'inactive'
                        ? 'Inactive'
                        : 'Pending Verification'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Users List */}
        {isLoading ? (
          <View testID="admin-users-loading">
            <SkeletonCard variant="list-item" count={3} />
          </View>
        ) : isError ? (
          <ErrorState
            title="Unable to load user directory"
            message="Please verify administrator privileges and retry."
            onRetry={() => refetch()}
            testID="admin-users-error"
            retryTestID="admin-users-retry"
          />
        ) : (
          <FlatList
            data={users}
            keyExtractor={item => String(item.id)}
            renderItem={renderUserCard}
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                title="No Matching Accounts"
                description="No advocates or admin accounts matched the current search or filters."
                icon={<AppIcon name="users" size={32} color={Colors.text.muted} />}
              />
            }
          />
        )}
      </View>

      {/* Create Account Modal */}
      <Modal
        visible={isCreateModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="admin-create-user-modal">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t('admin.createUserModalTitle', 'Create Advocate Account')}
              </Text>
              <TouchableOpacity
                onPress={() => setIsCreateModalVisible(false)}
                accessibilityLabel="Close create account modal"
              >
                <AppIcon name="x" size={20} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {createError ? (
                <View style={styles.modalErrorBanner} testID="admin-create-user-error">
                  <AppIcon name="alert-circle" size={16} color={Colors.danger} />
                  <Text style={styles.modalErrorText}>{createError}</Text>
                </View>
              ) : null}

              <Input
                label="Bar Council Enrollment ID *"
                placeholder="AP/1234/2020"
                value={enrollmentNumber}
                onChangeText={setEnrollmentNumber}
                autoCapitalize="characters"
                testID="create-user-enrollment-input"
              />
              <Input
                label="Username (optional, defaults to Enrollment ID)"
                placeholder="e.g. adv.lakshmi"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                testID="create-user-username-input"
              />
              <View style={styles.twoColRow}>
                <View style={styles.halfCol}>
                  <Input
                    label="First Name"
                    placeholder="First name"
                    value={firstName}
                    onChangeText={setFirstName}
                    testID="create-user-firstname-input"
                  />
                </View>
                <View style={styles.halfCol}>
                  <Input
                    label="Last Name"
                    placeholder="Last name"
                    value={lastName}
                    onChangeText={setLastName}
                    testID="create-user-lastname-input"
                  />
                </View>
              </View>
              <Input
                label="Email"
                placeholder="advocate@aphc.in"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                testID="create-user-email-input"
              />
              <Input
                label="Phone Number"
                placeholder="+91 9876543210"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                testID="create-user-phone-input"
              />
              <Input
                label="Chamber Address"
                placeholder="High Court Chambers, Amaravati"
                value={chamberAddress}
                onChangeText={setChamberAddress}
                testID="create-user-chamber-input"
              />
              <Input
                label="Temporary Password *"
                placeholder="Min. 8 chars (letters + numbers)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                testID="create-user-password-input"
                rightAction={
                  <TouchableOpacity onPress={() => setShowPassword(p => !p)}>
                    <AppIcon
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={18}
                      color={Colors.primary}
                    />
                  </TouchableOpacity>
                }
              />

              {/* Advocate Designation Chips */}
              <Text style={styles.fieldLabel}>Chamber Designation</Text>
              <View style={styles.chipSelectorRow}>
                {(['ASSOCIATE', 'SENIOR', 'CLERK'] as AdvocateDesignation[]).map(d => {
                  const selected = designation === d;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.selectorChip, selected && styles.selectorChipActive]}
                      onPress={() => setDesignation(d)}
                      testID={`create-user-designation-${d.toLowerCase()}`}
                    >
                      <Text
                        style={[
                          styles.selectorChipText,
                          selected && styles.selectorChipTextActive,
                        ]}
                      >
                        {d}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Superuser-only Account Role Selection */}
              <Text style={styles.fieldLabel}>System Role</Text>
              {isSuperuser ? (
                <View style={styles.chipSelectorRow} testID="create-user-role-selector">
                  {(['ADVOCATE', 'ADMIN'] as UserRole[]).map(r => {
                    const selected = accountRole === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[
                          styles.selectorChip,
                          selected && styles.selectorChipActive,
                        ]}
                        onPress={() => setAccountRole(r)}
                        testID={`create-user-role-${r.toLowerCase()}`}
                      >
                        <Text
                          style={[
                            styles.selectorChipText,
                            selected && styles.selectorChipTextActive,
                          ]}
                        >
                          {r}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.roleRestrictedNote} testID="create-user-role-locked">
                  Role fixed to ADVOCATE (only a Superuser Administrator may create ADMIN
                  accounts).
                </Text>
              )}

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Account Active Immediately</Text>
                <Switch
                  value={isActiveNew}
                  onValueChange={setIsActiveNew}
                  trackColor={{ false: Colors.borderStrong, true: Colors.primary }}
                  thumbColor={Colors.surface}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Mark Bar Council Profile Verified</Text>
                <Switch
                  value={isVerifiedNew}
                  onValueChange={setIsVerifiedNew}
                  trackColor={{ false: Colors.borderStrong, true: Colors.primary }}
                  thumbColor={Colors.surface}
                />
              </View>

              <View style={styles.modalFooterActions}>
                <Button
                  title={t('common.cancel', 'Cancel')}
                  variant="secondary"
                  onPress={() => setIsCreateModalVisible(false)}
                  style={styles.modalBtn}
                />
                <Button
                  title={t('admin.submitCreateUser', 'Create Account')}
                  variant="primary"
                  onPress={handleCreateAccount}
                  loading={createMutation.isPending}
                  style={styles.modalBtn}
                  testID="create-user-submit-btn"
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Activate / Deactivate Confirm Dialog */}
      <ConfirmDialog
        visible={Boolean(statusTarget)}
        title={
          statusTarget?.is_active ? 'Deactivate User Account' : 'Activate User Account'
        }
        message={
          statusTarget?.is_active
            ? `Deactivating @${statusTarget.username} will prevent sign-in until reactivated.`
            : `Activate @${statusTarget?.username || ''} to restore workspace access.`
        }
        confirmLabel={statusTarget?.is_active ? 'Deactivate' : 'Activate'}
        cancelLabel={t('common.cancel', 'Cancel')}
        destructive={Boolean(statusTarget?.is_active)}
        loading={updateMutation.isPending}
        onConfirm={handleConfirmToggleActive}
        onCancel={() => setStatusTarget(null)}
        testID="admin-user-status-confirm"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    width: '100%',
  },
  desktopContainer: {
    maxWidth: 1020,
    alignSelf: 'center',
  },
  topActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerCopy: {
    flex: 1,
    minWidth: 180,
  },
  screenHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  screenSubheading: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: 2,
  },
  createBtn: {
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
  },
  filtersGroup: {
    marginBottom: Spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  filterChipTextActive: {
    color: Colors.text.white,
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  userCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadows.subtle,
  },
  userTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  userIdentityCol: {
    flex: 1,
  },
  userFullName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  userSubMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 2,
  },
  userBadgesRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  metaChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  emailText: {
    fontSize: 12,
    color: Colors.text.muted,
    flexShrink: 1,
  },
  userActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  userActionBtn: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: Spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.card + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    ...Shadows.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  modalErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.dangerSurface,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    borderRadius: Radius.button,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  modalErrorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.danger,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  halfCol: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  chipSelectorRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  selectorChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  selectorChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  selectorChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  selectorChipTextActive: {
    color: Colors.text.white,
  },
  roleRestrictedNote: {
    fontSize: 12,
    color: Colors.text.muted,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.button,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  modalFooterActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  modalBtn: {
    flex: 1,
  },
});
