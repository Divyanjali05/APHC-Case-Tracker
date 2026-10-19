# Phase 1 Plan — Authentication and Advocate Profiles

## Goal

Implement end-to-end authentication and advocate profile management for lawyers practicing at the Andhra Pradesh High Court.

## Scope of Work

### Backend (`accounts`)

1. **Custom User Model**:
   - `AdvocateUser` inheriting from `AbstractBaseUser` and `PermissionsMixin`.
   - Fields: `email`, `phone_number`, `bar_council_enrollment_number` (e.g. `AP/1234/2018`), `full_name`, `role` (Senior Advocate / Junior / Clerk), `is_active`, `is_staff`, `date_joined`.
   - Normalized enrollment number validator matching Bar Council of Andhra Pradesh format.
2. **SimpleJWT Configuration**:
   - Access token lifetime: 60 minutes.
   - Refresh token lifetime: 14 days, with token rotation and blacklisting enabled.
   - Custom claims: `enrollment_number`, `full_name`, `role`.
3. **API Endpoints**:
   - `POST /api/auth/register/`: Advocate registration with Bar Council validation.
   - `POST /api/auth/login/`: Token generation using enrollment number / email + password.
   - `POST /api/auth/refresh/`: Refresh token rotation.
   - `GET /api/auth/profile/`: Fetch advocate profile.
   - `PATCH /api/auth/profile/`: Update chamber address, mobile, alert preferences.
4. **Backend Tests**:
   - Unit tests for user creation, enrollment number validation, JWT generation, invalid credentials handling, and profile updates.

### Mobile (`mobile/app/(auth)`)

1. **Auth Screens**:
   - Welcome / Landing screen with bilingual toggle.
   - Sign In screen (Enrollment Number / Email + Password).
   - Sign Up screen (Full Name, Bar Council Enrollment Number, Mobile, Email, Password).
   - Profile & Chamber Settings screen.
2. **State & Storage**:
   - TanStack Query hook `useAuth()` managing JWT tokens via `expo-secure-store` or encrypted storage.
   - Axios / Fetch interceptor for automatic token refresh on `401 Unauthorized`.
3. **Mobile Tests**:
   - Jest unit tests for Auth service and form validation logic.

## Acceptance Criteria

- Advocate can register with a valid Andhra Pradesh Bar Council number.
- JWT tokens are securely issued, stored on device, and refreshed automatically.
- Protected endpoints reject unauthenticated requests.
- All Phase 1 tests pass with >85% code coverage.
