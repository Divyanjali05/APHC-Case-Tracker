import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiClient } from '../../services/api/client';
import { ENDPOINTS } from '../../services/api/endpoints';
import { authService } from '../../services/auth/authService';
import { tokenStorage } from '../../services/auth/tokenStorage';
import { queryClient } from '../../services/queryClient';
import { AuthUser, SelfProfileUpdatePayload, UserRole } from '../../types';
import { BAR_COUNCIL_ID_REGEX } from './schemas';

interface JwtPayloadClaims {
  role?: string;
  user_id?: number;
  exp?: number;
}

const decodeBase64Url = (input: string): string | null => {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLen);

    if (typeof globalThis.atob === 'function') {
      return globalThis.atob(padded);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(padded, 'base64').toString('utf8');
    }
    return null;
  } catch {
    return null;
  }
};

export const decodeJwtRole = (token?: string | null): UserRole | null => {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) return null;
  try {
    const claims = JSON.parse(decoded) as JwtPayloadClaims;
    const upper = String(claims.role || '').toUpperCase();
    if (upper === 'ADMIN' || upper === 'ADVOCATE') {
      return upper as UserRole;
    }
    return null;
  } catch {
    return null;
  }
};

export const normalizeLoginIdentifier = (raw: string): string => {
  const trimmed = raw.trim();
  if (BAR_COUNCIL_ID_REGEX.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return trimmed;
};

export interface SignInResult {
  user: AuthUser | null;
  role: UserRole;
}

export const executeSignIn = async (
  identifier: string,
  password: string,
  rememberIdentifier?: boolean
): Promise<SignInResult> => {
  const normalized = normalizeLoginIdentifier(identifier);
  const response = await apiClient.post<{
    access: string;
    refresh: string;
    user?: AuthUser;
  }>(ENDPOINTS.AUTH.TOKEN, {
    username: normalized,
    password,
  });

  const access = response.data?.access;
  const refresh = response.data?.refresh;
  if (!access || !refresh) {
    throw new Error('Authentication tokens were not returned.');
  }

  await tokenStorage.saveTokens(access, refresh);
  if (typeof tokenStorage.saveUserEnrollment === 'function') {
    await tokenStorage.saveUserEnrollment(normalized);
  }

  if (rememberIdentifier !== undefined) {
    if (
      rememberIdentifier &&
      typeof tokenStorage.saveRememberedIdentifier === 'function'
    ) {
      await tokenStorage.saveRememberedIdentifier(normalized);
    } else if (
      !rememberIdentifier &&
      typeof tokenStorage.clearRememberedIdentifier === 'function'
    ) {
      await tokenStorage.clearRememberedIdentifier();
    }
  }

  let resolvedUser: AuthUser | null = response.data.user || null;
  let resolvedRole: UserRole = resolvedUser?.role || decodeJwtRole(access) || 'ADVOCATE';

  // Fallback profile lookup only when login response omits `user` and token is a 3-part JWT
  if (!resolvedUser && access.split('.').length === 3) {
    try {
      const profileRes = await apiClient.get<AuthUser>(ENDPOINTS.AUTH.PROFILE);
      if (profileRes.data) {
        resolvedUser = profileRes.data;
        resolvedRole = profileRes.data.role || resolvedRole;
      }
    } catch {
      // Proceed using JWT role claim
    }
  }

  if (resolvedUser) {
    if (typeof tokenStorage.saveUserSnapshot === 'function') {
      await tokenStorage.saveUserSnapshot(resolvedUser);
    }
    const enrollmentKey =
      resolvedUser.profile?.bar_council_enrollment_number || resolvedUser.username;
    if (enrollmentKey && typeof tokenStorage.saveUserEnrollment === 'function') {
      await tokenStorage.saveUserEnrollment(enrollmentKey);
    }
  }

  return { user: resolvedUser, role: resolvedRole };
};

export interface AuthContextValue {
  user: AuthUser | null;
  role: UserRole;
  isAdmin: boolean;
  isSuperuser: boolean;
  isAuthenticated: boolean;
  isDemo: boolean;
  isLoading: boolean;
  signIn: (
    identifier: string,
    password: string,
    rememberIdentifier?: boolean
  ) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  enterDemoMode: () => Promise<void>;
  refreshProfile: () => Promise<AuthUser | null>;
  updateProfile: (payload: SelfProfileUpdatePayload) => Promise<AuthUser>;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
}

const DEFAULT_AUTH_CONTEXT: AuthContextValue = {
  user: null,
  role: 'ADVOCATE',
  isAdmin: false,
  isSuperuser: false,
  isAuthenticated: false,
  isDemo: false,
  isLoading: false,
  signIn: async (identifier, password, rememberIdentifier) =>
    executeSignIn(identifier, password, rememberIdentifier),
  signOut: async () => authService.logout(),
  enterDemoMode: async () => {
    if (typeof tokenStorage.setDemoMode === 'function') {
      await tokenStorage.setDemoMode(true);
    }
  },
  refreshProfile: async () => null,
  updateProfile: async payload => {
    const res = await apiClient.patch<AuthUser>(ENDPOINTS.AUTH.PROFILE, payload);
    return res.data;
  },
  setUser: () => {},
};

const AuthContext = createContext<AuthContextValue>(DEFAULT_AUTH_CONTEXT);

export const useAuth = (): AuthContextValue => {
  return useContext(AuthContext);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tokenRole, setTokenRole] = useState<UserRole | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const persistUserSnapshot = useCallback(async (nextUser: AuthUser | null) => {
    if (nextUser) {
      if (typeof tokenStorage.saveUserSnapshot === 'function') {
        await tokenStorage.saveUserSnapshot(nextUser);
      }
      const enrollmentKey =
        nextUser.profile?.bar_council_enrollment_number || nextUser.username;
      if (enrollmentKey && typeof tokenStorage.saveUserEnrollment === 'function') {
        await tokenStorage.saveUserEnrollment(enrollmentKey);
      }
    } else if (typeof tokenStorage.clearUserSnapshot === 'function') {
      await tokenStorage.clearUserSnapshot();
    }
  }, []);

  const refreshProfile = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const response = await apiClient.get<AuthUser>(ENDPOINTS.AUTH.PROFILE);
      const profileData = response.data;
      setUser(profileData);
      setTokenRole(profileData.role);
      setHasToken(true);
      await persistUserSnapshot(profileData);
      return profileData;
    } catch {
      return null;
    }
  }, [persistUserSnapshot]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const demo =
          typeof tokenStorage.isDemoMode === 'function'
            ? await tokenStorage.isDemoMode()
            : false;

        if (demo) {
          if (mounted) {
            setIsDemo(true);
            setHasToken(false);
            setUser(null);
            setTokenRole(null);
            setIsLoading(false);
          }
          return;
        }

        const accessToken =
          typeof tokenStorage.getAccessToken === 'function'
            ? await tokenStorage.getAccessToken()
            : null;

        if (!accessToken) {
          if (mounted) {
            setIsDemo(false);
            setHasToken(false);
            setUser(null);
            setTokenRole(null);
            setIsLoading(false);
          }
          return;
        }

        const jwtRole = decodeJwtRole(accessToken);
        const snapshot =
          typeof tokenStorage.getUserSnapshot === 'function'
            ? await tokenStorage.getUserSnapshot()
            : null;

        if (mounted) {
          setHasToken(true);
          setIsDemo(false);
          if (snapshot) {
            setUser(snapshot);
            setTokenRole(snapshot.role || jwtRole);
          } else {
            setTokenRole(jwtRole);
          }
          setIsLoading(false);
        }

        // Verify live role & user metadata from Django backend if JWT looks real
        if (accessToken.split('.').length === 3) {
          try {
            const profileRes = await apiClient.get<AuthUser>(ENDPOINTS.AUTH.PROFILE);
            if (mounted && profileRes.data) {
              setUser(profileRes.data);
              setTokenRole(profileRes.data.role);
              await persistUserSnapshot(profileRes.data);
            }
          } catch {
            // Keep cached snapshot while offline; 401 interceptor triggers sign-out
          }
        }
      } catch {
        if (mounted) {
          setHasToken(false);
          setUser(null);
          setTokenRole(null);
          setIsLoading(false);
        }
      }
    };

    bootstrap();

    const unsubscribe = authService.onSessionExpired(() => {
      if (mounted) {
        setHasToken(false);
        setIsDemo(false);
        setUser(null);
        setTokenRole(null);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [persistUserSnapshot]);

  const signIn = useCallback(
    async (
      identifier: string,
      password: string,
      rememberIdentifier?: boolean
    ): Promise<SignInResult> => {
      const result = await executeSignIn(identifier, password, rememberIdentifier);
      setHasToken(true);
      setIsDemo(false);
      setUser(result.user);
      setTokenRole(result.role);
      queryClient.clear();
      return result;
    },
    []
  );

  const enterDemoMode = useCallback(async () => {
    if (typeof tokenStorage.setDemoMode === 'function') {
      await tokenStorage.setDemoMode(true);
    }
    setUser(null);
    setTokenRole('ADVOCATE');
    setHasToken(false);
    setIsDemo(true);
    queryClient.clear();
  }, []);

  const signOut = useCallback(async () => {
    await authService.logout();
    setUser(null);
    setTokenRole(null);
    setHasToken(false);
    setIsDemo(false);
    queryClient.clear();
  }, []);

  const updateProfile = useCallback(
    async (payload: SelfProfileUpdatePayload): Promise<AuthUser> => {
      const response = await apiClient.patch<AuthUser>(ENDPOINTS.AUTH.PROFILE, payload);
      const updated = response.data;
      setUser(updated);
      setTokenRole(updated.role);
      await persistUserSnapshot(updated);
      return updated;
    },
    [persistUserSnapshot]
  );

  const role: UserRole = useMemo(() => {
    if (user?.role === 'ADMIN' || user?.is_admin) return 'ADMIN';
    if (tokenRole === 'ADMIN') return 'ADMIN';
    return 'ADVOCATE';
  }, [user, tokenRole]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      isAdmin: role === 'ADMIN',
      isSuperuser: Boolean(user?.is_superuser),
      isAuthenticated: hasToken && !isDemo,
      isDemo,
      isLoading,
      signIn,
      signOut,
      enterDemoMode,
      refreshProfile,
      updateProfile,
      setUser,
    }),
    [
      user,
      role,
      hasToken,
      isDemo,
      isLoading,
      signIn,
      signOut,
      enterDemoMode,
      refreshProfile,
      updateProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
