import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
import { useAdminUserDetail, useUpdateAdminUser } from '../../../features/admin/hooks';
import { useAuth } from '../../../features/auth/AuthContext';
import { AdvocateDesignation, UserRole } from '../../../types';

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

export default function AdminUserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;

  const { user: currentUser, isSuperuser } = useAuth();
  const { showToast } = useToast();

  const { data: userDetail, isLoading, isError, refetch } = useAdminUserDetail(id || '');
  const updateMutation = useUpdateAdminUser();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [chamberAddress, setChamberAddress] = useState('');
  const [designation, setDesignation] = useState<AdvocateDesignation>('ASSOCIATE');
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'te' | 'hi'>('en');

  const [pendingAction, setPendingAction] = useState<
    | null
    | { type: 'active'; nextValue: boolean }
    | { type: 'verified'; nextValue: boolean }
    | { type: 'role'; nextRole: UserRole }
  >(null);

  useEffect(() => {
    if (!userDetail) return;
    setFirstName(userDetail.first_name || '');
    setLastName(userDetail.last_name || '');
    setEmail(userDetail.email || '');
    setPhoneNumber(userDetail.profile?.phone_number || '');
    setChamberAddress(userDetail.profile?.chamber_address || '');
    const rawDesig = userDetail.profile?.role;
    setDesignation(
      rawDesig === 'SENIOR' || rawDesig === 'CLERK' ? rawDesig : 'ASSOCIATE'
    );
    const rawLang = userDetail.profile?.preferred_language;
    setPreferredLanguage(rawLang === 'te' || rawLang === 'hi' ? rawLang : 'en');
  }, [userDetail]);

  const isSelf = Boolean(currentUser && userDetail && currentUser.id === userDetail.id);
  const canToggleStatus = Boolean(
    userDetail && !isSelf && (!userDetail.is_admin || isSuperuser)
  );
  const canChangeRole = Boolean(userDetail && isSuperuser && !isSelf);

  const handleSaveProfile = async () => {
    if (!userDetail) return;
    try {
      await updateMutation.mutateAsync({
        id: userDetail.id,
        payload: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone_number: phoneNumber.trim(),
          chamber_address: chamberAddress.trim(),
          designation,
          preferred_language: preferredLanguage,
        },
      });
      showToast(t('admin.userUpdatedToast', 'User profile updated.'), 'success');
    } catch (err) {
      showToast(extractApiError(err, 'Unable to update user profile.'), 'error');
    }
  };

  const handleConfirmPendingAction = async () => {
    if (!userDetail || !pendingAction) return;
    try {
      if (pendingAction.type === 'active') {
        await updateMutation.mutateAsync({
          id: userDetail.id,
          payload: { is_active: pendingAction.nextValue },
        });
        showToast(
          pendingAction.nextValue ? 'Account activated.' : 'Account deactivated.',
          'info'
        );
      } else if (pendingAction.type === 'verified') {
        await updateMutation.mutateAsync({
          id: userDetail.id,
          payload: { is_verified: pendingAction.nextValue },
        });
        showToast(
          pendingAction.nextValue
            ? 'Advocate verification approved.'
            : 'Verification revoked.',
          'success'
        );
      } else if (pendingAction.type === 'role') {
        await updateMutation.mutateAsync({
          id: userDetail.id,
          payload: { account_role: pendingAction.nextRole },
        });
        showToast(`Account role changed to ${pendingAction.nextRole}.`, 'success');
      }
      setPendingAction(null);
    } catch (err) {
      setPendingAction(null);
      showToast(extractApiError(err, 'Permission denied or invalid change.'), 'error');
    }
  };

  const assignedCases = userDetail?.assigned_cases || [];
  const enrollmentId =
    userDetail?.profile?.bar_council_enrollment_number || userDetail?.username || '—';
  const isVerified = Boolean(userDetail?.profile?.is_verified);

  return (
    <ScreenContainer testID="admin-user-detail-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.mainWrapper, isDesktop && styles.desktopContainer]}>
          {isLoading ? (
            <View testID="admin-user-detail-loading">
              <SkeletonCard variant="card" count={2} />
            </View>
          ) : isError || !userDetail ? (
            <ErrorState
              title="Unable to load user details"
              message="The user record could not be loaded."
              onRetry={() => refetch()}
              testID="admin-user-detail-error"
            />
          ) : (
            <>
              {/* Identity Summary Card */}
              <Card style={styles.card} testID="admin-user-identity-card">
                <View style={styles.identityHeader}>
                  <View style={styles.avatarBox}>
                    <AppIcon
                      name={userDetail.is_admin ? 'shield-check' : 'user'}
                      size={22}
                      color={Colors.primary}
                    />
                  </View>
                  <View style={styles.identityTextCol}>
                    <Text style={styles.userName}>
                      {userDetail.full_name || userDetail.username}
                    </Text>
                    <Text style={styles.userEnrollment}>
                      @{userDetail.username} • {enrollmentId}
                    </Text>
                  </View>
                </View>

                <View style={styles.badgesRow}>
                  <Badge
                    label={userDetail.role}
                    variant={userDetail.is_admin ? 'gold' : 'primary'}
                    testID="admin-detail-role-badge"
                  />
                  <Badge
                    label={userDetail.is_active ? 'ACTIVE' : 'INACTIVE'}
                    variant={userDetail.is_active ? 'success' : 'danger'}
                    testID="admin-detail-active-badge"
                  />
                  {userDetail.profile ? (
                    <Badge
                      label={isVerified ? 'VERIFIED' : 'PENDING APPROVAL'}
                      variant={isVerified ? 'info' : 'warning'}
                      testID="admin-detail-verified-badge"
                    />
                  ) : null}
                  {userDetail.is_superuser ? (
                    <Badge label="SUPERUSER" variant="gold" />
                  ) : null}
                </View>
              </Card>

              {/* Status, Verification & Role Controls */}
              <Card style={styles.card} testID="admin-user-controls-card">
                <Text style={styles.cardTitle}>
                  {t('admin.accountGovernance', 'Account Status & Role Governance')}
                </Text>

                <View style={styles.controlsRow}>
                  <Button
                    title={
                      userDetail.is_active ? 'Deactivate Account' : 'Activate Account'
                    }
                    variant={userDetail.is_active ? 'danger' : 'primary'}
                    disabled={!canToggleStatus}
                    onPress={() =>
                      setPendingAction({
                        type: 'active',
                        nextValue: !userDetail.is_active,
                      })
                    }
                    style={styles.controlBtn}
                    testID="admin-detail-toggle-active-btn"
                  />

                  {userDetail.profile ? (
                    <Button
                      title={
                        isVerified ? 'Revoke Verification' : 'Approve / Verify Account'
                      }
                      variant="outline"
                      onPress={() =>
                        setPendingAction({
                          type: 'verified',
                          nextValue: !isVerified,
                        })
                      }
                      style={styles.controlBtn}
                      testID="admin-detail-toggle-verified-btn"
                    />
                  ) : null}
                </View>

                {isSelf ? (
                  <Text style={styles.restrictionHint}>
                    You cannot deactivate or demote your own administrator account.
                  </Text>
                ) : null}

                {/* Role Management */}
                <View style={styles.roleSection} testID="admin-role-management">
                  <Text style={styles.fieldLabel}>Account System Role</Text>
                  {isSuperuser ? (
                    <View style={styles.chipRow}>
                      {(['ADVOCATE', 'ADMIN'] as UserRole[]).map(targetRole => {
                        const selected = userDetail.role === targetRole;
                        return (
                          <TouchableOpacity
                            key={targetRole}
                            disabled={!canChangeRole || selected}
                            onPress={() =>
                              setPendingAction({
                                type: 'role',
                                nextRole: targetRole,
                              })
                            }
                            style={[
                              styles.chipBtn,
                              selected && styles.chipBtnActive,
                              !canChangeRole && styles.chipBtnDisabled,
                            ]}
                            testID={`admin-detail-role-btn-${targetRole.toLowerCase()}`}
                          >
                            <Text
                              style={[
                                styles.chipBtnText,
                                selected && styles.chipBtnTextActive,
                              ]}
                            >
                              {targetRole}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text
                      style={styles.restrictionHint}
                      testID="admin-role-superuser-required"
                    >
                      Only a Superuser Administrator may grant or revoke ADMIN privileges.
                    </Text>
                  )}
                </View>
              </Card>

              {/* Edit Advocate Profile Card */}
              <Card style={styles.card} testID="admin-user-edit-form">
                <Text style={styles.cardTitle}>
                  {t('admin.editUserProfile', 'Edit Profile Metadata')}
                </Text>

                <Input
                  label="First Name"
                  value={firstName}
                  onChangeText={setFirstName}
                  testID="admin-edit-firstname-input"
                />
                <Input
                  label="Last Name"
                  value={lastName}
                  onChangeText={setLastName}
                  testID="admin-edit-lastname-input"
                />
                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  testID="admin-edit-email-input"
                />
                <Input
                  label="Phone Number"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  testID="admin-edit-phone-input"
                />
                <Input
                  label="Chamber Address"
                  value={chamberAddress}
                  onChangeText={setChamberAddress}
                  testID="admin-edit-chamber-input"
                />

                {userDetail.profile ? (
                  <>
                    <Text style={styles.fieldLabel}>Designation</Text>
                    <View style={styles.chipRow}>
                      {(['ASSOCIATE', 'SENIOR', 'CLERK'] as AdvocateDesignation[]).map(
                        d => {
                          const selected = designation === d;
                          return (
                            <TouchableOpacity
                              key={d}
                              style={[styles.chipBtn, selected && styles.chipBtnActive]}
                              onPress={() => setDesignation(d)}
                            >
                              <Text
                                style={[
                                  styles.chipBtnText,
                                  selected && styles.chipBtnTextActive,
                                ]}
                              >
                                {d}
                              </Text>
                            </TouchableOpacity>
                          );
                        }
                      )}
                    </View>

                    <Text style={styles.fieldLabel}>Preferred Language</Text>
                    <View style={styles.chipRow}>
                      {[
                        { code: 'en' as const, label: 'English' },
                        { code: 'te' as const, label: 'తెలుగు' },
                        { code: 'hi' as const, label: 'हिन्दी' },
                      ].map(lang => {
                        const selected = preferredLanguage === lang.code;
                        return (
                          <TouchableOpacity
                            key={lang.code}
                            style={[styles.chipBtn, selected && styles.chipBtnActive]}
                            onPress={() => setPreferredLanguage(lang.code)}
                          >
                            <Text
                              style={[
                                styles.chipBtnText,
                                selected && styles.chipBtnTextActive,
                              ]}
                            >
                              {lang.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : null}

                <Button
                  title={t('admin.saveProfileChanges', 'Save Profile Changes')}
                  variant="primary"
                  onPress={handleSaveProfile}
                  loading={updateMutation.isPending}
                  style={styles.saveBtn}
                  testID="admin-user-save-btn"
                />
              </Card>

              {/* Assigned Cases Metadata Card */}
              <Card style={styles.card} testID="admin-user-assigned-cases">
                <View style={styles.assignedHeader}>
                  <View style={styles.assignedTitleWrap}>
                    <Text style={styles.cardTitle}>Assigned Case Dockets</Text>
                    <Badge label={String(assignedCases.length)} variant="primary" />
                  </View>
                  <Button
                    title="Assign Cases"
                    variant="outline"
                    onPress={() => router.push('/admin/cases')}
                    style={styles.assignShortcutBtn}
                  />
                </View>

                {assignedCases.length === 0 ? (
                  <EmptyState
                    title="No Assigned Cases"
                    description="Assign cases from Case Assignment to grant this advocate authorized access."
                    icon={
                      <AppIcon name="briefcase" size={26} color={Colors.text.muted} />
                    }
                  />
                ) : (
                  assignedCases.map(c => (
                    <View key={c.id} style={styles.assignedCaseRow}>
                      <View style={styles.assignedCaseTop}>
                        <Text style={styles.assignedCaseNum}>
                          {c.formatted_case_number}
                        </Text>
                        <Badge label={c.current_stage} variant="secondary" />
                      </View>
                      <Text style={styles.assignedCaseParties} numberOfLines={1}>
                        {c.petitioner} vs {c.respondent}
                      </Text>
                      <Text style={styles.assignedCaseMeta}>
                        {c.court_hall_number ? `Hall ${c.court_hall_number}` : 'Hall TBD'}
                        {c.next_hearing_date ? ` • Next: ${c.next_hearing_date}` : ''}
                      </Text>
                    </View>
                  ))
                )}
              </Card>
            </>
          )}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={Boolean(pendingAction)}
        title={
          pendingAction?.type === 'role'
            ? `Change Role to ${pendingAction.nextRole}`
            : pendingAction?.type === 'verified'
              ? pendingAction.nextValue
                ? 'Verify Advocate Profile'
                : 'Revoke Verification'
              : pendingAction?.nextValue
                ? 'Activate Account'
                : 'Deactivate Account'
        }
        message={
          pendingAction?.type === 'role'
            ? `Are you sure you want to update @${userDetail?.username}'s system role to ${pendingAction.nextRole}? This action is audit logged.`
            : pendingAction?.type === 'verified'
              ? `Update Bar Council verification status for @${userDetail?.username}?`
              : `Confirm account status update for @${userDetail?.username}?`
        }
        confirmLabel="Confirm"
        cancelLabel={t('common.cancel', 'Cancel')}
        destructive={
          (pendingAction?.type === 'active' && !pendingAction.nextValue) ||
          (pendingAction?.type === 'verified' && !pendingAction.nextValue)
        }
        loading={updateMutation.isPending}
        onConfirm={handleConfirmPendingAction}
        onCancel={() => setPendingAction(null)}
        testID="admin-detail-confirm-dialog"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },
  mainWrapper: {
    width: '100%',
  },
  desktopContainer: {
    maxWidth: 920,
    alignSelf: 'center',
  },
  card: {
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadows.subtle,
  },
  identityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  avatarBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.surfaceBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityTextCol: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  userEnrollment: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 2,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  controlBtn: {
    flexGrow: 1,
    minWidth: 150,
    minHeight: 44,
  },
  restrictionHint: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: Spacing.xs,
    lineHeight: 17,
  },
  roleSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  chipBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipBtnDisabled: {
    opacity: 0.6,
  },
  chipBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  chipBtnTextActive: {
    color: Colors.text.white,
  },
  saveBtn: {
    marginTop: Spacing.sm,
  },
  assignedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  assignedTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  assignShortcutBtn: {
    minHeight: 38,
    paddingHorizontal: Spacing.md,
  },
  assignedCaseRow: {
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  assignedCaseTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 4,
  },
  assignedCaseNum: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  assignedCaseParties: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  assignedCaseMeta: {
    fontSize: 12,
    color: Colors.text.muted,
  },
});
