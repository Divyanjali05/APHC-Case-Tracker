# Phase 3: Neon PostgreSQL Database Compatibility Audit (Read-Only)

- **Repository Root:** `C:\projects\APHC-Case-Tracker`
- **Active Branch:** `integration/phase-4-7-restoration` (`main` untouched at `6fe54a2`)
- **Database Target:** Neon PostgreSQL `neondb` — PostgreSQL `18.6` (`transaction_read_only = on` verified prior to all inspection queries; credentials redacted)
- **Audit Scope:** Strictly read-only inspection of repository migrations, restored Django models, Neon schema/constraints/indexes/`django_migrations`, and excluded frontend auth/E2E tests. Zero migrations, DDLs, writes, or branch changes were executed.

---

## 1. Current Branch and Working-Tree Status

- **Current Git branch:** `integration/phase-4-7-restoration`
- **Base `main` branch:** Unmodified at `6fe54a2`.
- **Working tree state (`git status --short`):** Holds the restored Phase 4–7 backend/frontend modules merged with Phase 1 security hardening, direct OTP-free registration, light-mode UI, landing page, and `config/settings/test.py` SQLite isolation (uncommitted, matching expectations prior to commit/deployment).
- **`manage.py makemigrations --check --dry-run` (isolated test DB):** Reported `No changes detected`.

---

## 2. Migration Inventory and Dependency Graph

The restored repository contains **52 migration files** across **13 Django apps** (`9` domain/auth apps + `4` built-in Django apps):

| App Label | Migrations on Disk (`integration/phase-4-7-restoration`) | Cross-App Key Dependencies |
|---|---|---|
| `accounts` | `0001_initial`, `0002_passwordresettoken`, `0003_otpverification` | `auth` (`settings.AUTH_USER_MODEL`) |
| `cases` | `0001_initial`, `0002_judgment`, `0003_casehistory`, `0004_hearing_hearing_time_hearing_previous_hearing_date_and_more`, `0005_alter_casehistory_event_type`, `0006_casedocument_casenote` | `auth` |
| `reminders` | `0001_initial`, `0002_reminderpreference_reminder_hearing_and_more`, `0003_reminder_retry_count_alter_reminder_status_and_more`, `0004_reminderpreference_hearing_change_push_notifications_and_more` | `0002` depends on `cases.0004` |
| `tokens` | `0001_initial`, `0002_alter_tokenalertrule_options_and_more` | `0002` depends on `cases.0006` |
| `notifications` | `0001_initial`, `0002_alter_notificationhistory_category`, `0003_realtimeevent`, `0004_alter_deviceregistration_options_and_more` | `auth` |
| `court_data` | `0001_initial` | `cases.0005` |
| `voice` | `0001_initial` | `cases.0006`, `auth` |
| `agenda` | `0001_initial` | `cases.0006`, `reminders.0004`, `auth` |
| `token_blacklist` | `0001_initial` through `0013_alter_blacklistedtoken_options_and_more` (12 built-in SimpleJWT migrations: `0001`–`0008`, `0010`–`0013`) | `auth` |
| Django core (`contenttypes`, `auth`, `admin`, `sessions`) | `contenttypes` (`0001`–`0002`), `auth` (`0001`–`0012`), `admin` (`0001`–`0003`), `sessions` (`0001`) | Built-in |

`manage.py showmigrations --plan --settings=config.settings.development` confirmed **all 52/52 migrations in the restored codebase are already marked `[X]` applied** on Neon.

---

## 3. Neon `django_migrations` History

Neon's `public.django_migrations` contains **54 rows**:
- All **52 migrations** present on disk in `integration/phase-4-7-restoration` (`accounts` `0001`–`0003`, `cases` `0001`–`0006`, `reminders` `0001`–`0004`, `tokens` `0001`–`0002`, `notifications` `0001`–`0004`, `court_data` `0001`, `voice` `0001`, `agenda` `0001`, `token_blacklist` `0001`–`0013`, `contenttypes`, `auth`, `admin`, `sessions`).
- **2 additional migration records** present in Neon that do **not** exist on disk in either `main` or `origin/phase-4-7-backup`:
  1. `accounts.0004_adminauditlog`
  2. `cases.0007_caseassignmenthistory`

---

## 4. Existing Neon Database Table Inventory (`public` Schema — 37 Base Tables)

| Table Name | App / Domain | Row Count | Audit Status |
|---|---|---:|---|
| `accounts_advocateprofile` | `accounts` | 2 | `MATCH` |
| `accounts_otpverification` | `accounts` | 0 | `MATCH` |
| `accounts_passwordresettoken` | `accounts` | 0 | `MATCH` |
| `accounts_adminauditlog` | `accounts` (Neon extra) | 0 | `EXTRA TABLE` / `MIGRATION HISTORY MISMATCH` |
| `agenda_calendarsyncsetting` | `agenda` | 1 | `MATCH` |
| `agenda_externalcalendareventmap` | `agenda` | 0 | `MATCH` |
| `cases_case` | `cases` | 3 | `MATCH` |
| `cases_case_tracked_by` | `cases` (M2M) | 3 | `MATCH` |
| `cases_hearing` | `cases` | 3 | `MATCH` |
| `cases_judgment` | `cases` | 1 | `MATCH` |
| `cases_casehistory` | `cases` | 0 | `MATCH` |
| `cases_casedocument` | `cases` | 0 | `MATCH` |
| `cases_casenote` | `cases` | 0 | `MATCH` |
| `cases_caseassignmenthistory` | `cases` (Neon extra) | 0 | `EXTRA TABLE` / `MIGRATION HISTORY MISMATCH` |
| `court_data_courtlisting` | `court_data` | 0 | `MATCH` |
| `court_data_courtstatusobservation` | `court_data` | 0 | `MATCH` |
| `notifications_deviceregistration` | `notifications` | 0 | `MATCH` |
| `notifications_notificationhistory` | `notifications` | 0 | `MATCH` |
| `notifications_realtimeevent` | `notifications` | 0 | `MATCH` |
| `reminders_reminder` | `reminders` | 2 | `MATCH` |
| `reminders_reminderpreference` | `reminders` | 1 | `MATCH` |
| `tokens_courthall` | `tokens` | 0 | `MATCH` |
| `tokens_courttokenstatus` | `tokens` | 0 | `MATCH` |
| `tokens_tokenalertrule` | `tokens` | 0 | `MATCH` |
| `voice_voicenote` | `voice` | 0 | `MATCH` |
| `token_blacklist_outstandingtoken` | `token_blacklist` | 17 | `MATCH` |
| `token_blacklist_blacklistedtoken` | `token_blacklist` | 14 | `MATCH` |
| `auth_user`, `auth_group`, `auth_permission`, `auth_group_permissions`, `auth_user_groups`, `auth_user_user_permissions` | `auth` | `2` users / `128` perms | `MATCH` |
| `django_admin_log`, `django_content_type`, `django_migrations`, `django_session` | Django core | `0` / `32` / `54` / `0` | `MATCH` |

---

## 5. Model-to-Database Schema Comparison

Automated read-only comparison across all **25 restored domain and `token_blacklist` tables** (`accounts`, `cases`, `reminders`, `tokens`, `notifications`, `court_data`, `voice`, `agenda`, `token_blacklist`):

| Metric | Result |
|---|---|
| Missing Tables | **0** |
| Missing Columns | **0** |
| Extra Columns on Restored Model Tables | **0** |
| Nullability Mismatches (`model.null` vs `is_nullable`) | **0** |
| Missing Named Model Constraints / Indexes | **0** |
| Unmatched Domain Tables in Neon (`EXTRA TABLE`) | **2** (`accounts_adminauditlog`, `cases_caseassignmenthistory`) |

### Per-App Classification
- `cases` (`cases_case`, `cases_case_tracked_by`, `cases_hearing`, `cases_judgment`, `cases_casehistory`, `cases_casedocument`, `cases_casenote`): **MATCH** (except extra table `cases_caseassignmenthistory` from `cases.0007_caseassignmenthistory` — see Section 7).
- `accounts` (`accounts_advocateprofile`, `accounts_passwordresettoken`, `accounts_otpverification`): **MATCH** (except extra table `accounts_adminauditlog` from `accounts.0004_adminauditlog` — see Section 7).
- `reminders` (`reminders_reminder`, `reminders_reminderpreference`): **MATCH** — all `0002`–`0004` columns, `unique_active_hearing_reminder_interval` constraint, and indexes match.
- `tokens` (`tokens_courthall`, `tokens_courttokenstatus`, `tokens_tokenalertrule`): **MATCH** — all `0002` columns (`hearing_date`, `token_number`, `status`, etc.) and `unique_active_advocate_token_alert` constraint match.
- `notifications` (`notifications_deviceregistration`, `notifications_notificationhistory`, `notifications_realtimeevent`): **MATCH** — all `0002`–`0004` columns (`app_version`, `device_id`, `failure_count`, `last_seen_at`, `delivery_status`, `idempotency_key`) and indexes match.
- `court_data` (`court_data_courtlisting`, `court_data_courtstatusobservation`): **MATCH**.
- `voice` (`voice_voicenote`): **MATCH**.
- `agenda` (`agenda_calendarsyncsetting`, `agenda_externalcalendareventmap`): **MATCH**.
- `token_blacklist` (`token_blacklist_outstandingtoken`, `token_blacklist_blacklistedtoken`): **MATCH**.

---

## 6. Extra or Missing Tables and Columns

- **Missing tables in Neon:** None.
- **Missing columns in Neon:** None.
- **Extra columns on restored model tables:** None.
- **Extra tables in Neon (`EXTRA TABLE` + `MIGRATION HISTORY MISMATCH`):**
  - `accounts_adminauditlog` (0 rows, corresponds to `accounts.0004_adminauditlog` in `django_migrations`).
  - `cases_caseassignmenthistory` (0 rows, corresponds to `cases.0007_caseassignmenthistory` in `django_migrations`).

---

## 7. `accounts_adminauditlog` and `cases_caseassignmenthistory` Findings

1. **`accounts_adminauditlog` (`0` rows)**
   - **Columns:** `id` (`bigint`, PK), `action` (`varchar(50)`, NOT NULL), `summary` (`varchar(500)`, NOT NULL), `metadata` (`jsonb`, NOT NULL), `ip_address` (`inet`, nullable), `created_at` (`timestamptz`, NOT NULL), `actor_id` (`integer` FK → `auth_user.id`, nullable), `target_case_id` (`bigint` FK → `cases_case.id`, nullable), `target_user_id` (`integer` FK → `auth_user.id`, nullable).
   - **Incoming foreign keys from any other table:** **None (`[]`)**.
   - **Origin:** Created by `accounts.0004_adminauditlog` outside both `main` and `origin/phase-4-7-backup` (admin auditing enhancement from a later workspace/branch run).

2. **`cases_caseassignmenthistory` (`0` rows)**
   - **Columns:** `id` (`bigint`, PK), `action` (`varchar(20)`, NOT NULL), `notes` (`text`, NOT NULL), `created_at` (`timestamptz`, NOT NULL), `advocate_id` (`integer` FK → `auth_user.id`, NOT NULL), `assigned_by_id` (`integer` FK → `auth_user.id`, nullable), `case_id` (`bigint` FK → `cases_case.id`, NOT NULL).
   - **Indexes:** Composite B-tree indexes `(advocate_id, created_at DESC)` and `(case_id, created_at DESC)` plus FK/created_at/action indexes.
   - **Incoming foreign keys from any other table:** **None (`[]`)**.
   - **Origin:** Created by `cases.0007_caseassignmenthistory` outside both `main` and `origin/phase-4-7-backup`.

3. **Runtime Impact & Numbering Risk (`MIGRATION HISTORY MISMATCH`):**
   - **Immediate runtime impact:** **None.** Because neither table has incoming FKs from existing tables and no restored model references them, ORM reads/writes across all 25 restored tables succeed without touching either extra table.
   - **Future migration collision risk (`DATA RISK` / migration sequence):** If any future feature adds `accounts/0004_*.py` or `cases/0007_*.py` on this branch, those migration filenames would collide with the existing `(accounts, 0004_adminauditlog)` and `(cases, 0007_caseassignmenthistory)` records in Neon's `django_migrations`, or cause Django's migration history consistency check to report unrepresented applied migrations if a new migration depends on `0003`/`0006`.

---

## 8. Authentication and Frontend Test Coverage Gaps (`tests/auth.test.ts` & `tests/e2e/*`)

Inspected `origin/phase-4-7-backup:frontend/tests/auth.test.ts`, `authFlow.e2e.test.tsx`, `casesTableFlow.e2e.test.tsx`, and `reminderCreationFlow.e2e.test.tsx` (currently excluded from `integration/phase-4-7-restoration`):

| Backup Test File | Current Compatibility & Identified Coverage Gaps |
|---|---|
| `frontend/tests/auth.test.ts` | Tests `authService.logout()`, `requestPasswordReset()`, `confirmPasswordReset()`, `onSessionExpired()`, and `apiClient` Bearer/refresh interceptors. **Needs updates:** (1) `tokenStorage` mock omits `getUserEnrollment`; (2) `apiClient` request interceptor test does not verify `ENDPOINTS.AUTH.REGISTER` (`/auth/register/`) is exempt from attaching stale Bearer tokens; (3) does not cover `AuthContext.signOut()` server revocation + state clear. |
| `frontend/tests/e2e/authFlow.e2e.test.tsx` | Tests `LoginScreen` validation, login error states, token storage on login, `authService.logout()`, and `forgot-password-link`. **Fails / needs updates:** (1) Asserts `getByTestId('forgot-password-link')` inside `LoginScreen`, which does not exist in `main`'s [login.tsx](file:///c:/projects/APHC-Case-Tracker/frontend/app/(auth)/login.tsx) (`demo-skip-button` is present instead); (2) does not test Landing Page (`MainHomePage`) → Register → direct OTP-free `/auth/register/` → Login → authenticated Dashboard → reload session persistence → Settings Logout → redirect to Landing Page (`/`). |
| `frontend/tests/e2e/casesTableFlow.e2e.test.tsx` | Mock-hook E2E tests for `CasesScreen` (`useCases`, loading/error/empty, `CaseCard` status/judgment modal, search, detail push). Compatible with restored `cases.tsx` & `CaseCard.tsx` after review for light-mode/pagination alignment. |
| `frontend/tests/e2e/reminderCreationFlow.e2e.test.tsx` | Mock-hook E2E tests for `RemindersScreen` & `CreateReminderModal`. Compatible with restored `reminders.tsx` & `CreateReminderModal.tsx`. |

*(Note: Direct registration, field validation error mapping, and Landing Page navigation are currently covered by [landing.test.tsx](file:///c:/projects/APHC-Case-Tracker/frontend/tests/landing.test.tsx) and [register.test.tsx](file:///c:/projects/APHC-Case-Tracker/frontend/tests/register.test.tsx), and live end-to-end flows were tested in Chrome against an isolated SQLite server. Porting and updating `auth.test.ts`, `authFlow.e2e.test.tsx`, `casesTableFlow.e2e.test.tsx`, and `reminderCreationFlow.e2e.test.tsx` on an isolated test runner will close the remaining Jest suite gap.)*

---

## 9. Risks to Existing Neon Data

Neon currently stores live rows in:
- `auth_user` (`2`), `accounts_advocateprofile` (`2`)
- `cases_case` (`3`), `cases_case_tracked_by` (`3`), `cases_hearing` (`3`), `cases_judgment` (`1`)
- `reminders_reminder` (`2`), `reminders_reminderpreference` (`1`)
- `agenda_calendarsyncsetting` (`1`)
- `token_blacklist_outstandingtoken` (`17`), `token_blacklist_blacklistedtoken` (`14`)

**Risks if handled carelessly:**
1. **Deleting or dropping `accounts_adminauditlog` / `cases_caseassignmenthistory` without confirming origin:** Could break an admin microservice/branch if another deployment still uses those tables (even though they have 0 rows today). **Do NOT drop them automatically.**
2. **Adding future `accounts/0004_*` or `cases/0007_*` migrations without checking Neon `django_migrations`:** Causes numbering conflict or inconsistent migration history (`InconsistentMigrationHistory`) against Neon.
3. **Blindly running `migrate --fake` or deleting `django_migrations` rows:** Risks desynchronizing future schema evolution on live `auth_user`, `cases_case`, `cases_hearing`, and `reminders_reminder` data.

---

## 10. Recommended Reconciliation Sequence (Requires Explicit Approval)

Because **all 52 migrations in `integration/phase-4-7-restoration` are already `[X]` applied on Neon and all 25 restored tables match 100%**, **zero destructive or DDL database changes are needed to run the restored app against Neon today.**

Recommended step-by-step plan:

1. **Immediate (Zero-Risk, Recommended Before Deploy):**
   - **No Neon DDL / no `migrate` execution required right now:** All 52 codebase migrations are already applied in `neondb` and every column/constraint/index on all 25 active tables matches.
   - Verify `.env` / production environment secrets (`DJANGO_SECRET_KEY`, `JWT_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `DATABASE_URL`) and deploy `integration/phase-4-7-restoration` without running destructive DB commands.
   - **Purpose:** Restores full Phase 4–7 functionality on Neon immediately with zero risk to existing records.
   - **Impact & Rollback:** Zero database mutation; rollback is a pure application code revert.

2. **Governance / Future Migration Safety (Two Clean Options — Pick One With Explicit Approval):**
   - **Option A (Preferred if Admin Audit / Assignment History feature branch will be restored later):** Keep `accounts_adminauditlog` and `cases_caseassignmenthistory` untouched in Neon until that branch's `accounts/0004_adminauditlog.py` and `cases/0007_caseassignmenthistory.py` models/migrations are recovered, **and** ensure any brand-new repository migrations on `accounts` or `cases` are only added after recovering or explicitly ordering past `0004` / `0007`.
     - *Purpose:* Preserves future compatibility with zero DB changes.
     - *Rollback:* None required.
   - **Option B (Explicit Schema Cleanup Only If Admin Audit / Assignment History Are Permanently Retired):** After taking a Neon database branch/snapshot backup, run a reviewed SQL cleanup (or no-op migration state alignment) to drop the empty `accounts_adminauditlog` and `cases_caseassignmenthistory` tables and remove their 2 rows from `django_migrations`.
     - *Purpose:* Achieves exact 52/52 parity in `django_migrations` and `public` tables.
     - *Impact:* Removes two empty (`0`-row) tables; breaks any external tool expecting `AdminAuditLog` or `CaseAssignmentHistory`.
     - *Rollback:* Restore from Neon snapshot or re-run the two `CREATE TABLE` DDLs + insert the 2 `django_migrations` rows.

3. **Frontend Test Completion (Isolated, No Neon Touch):**
   - Port & update `frontend/tests/auth.test.ts` (cover `ENDPOINTS.AUTH.REGISTER` exemption + `AuthContext.signOut()`), `frontend/tests/e2e/authFlow.e2e.test.tsx` (align with Landing Page → direct `/auth/register/` → `/login` → reload persistence → logout flow, and either add `forgot-password-link` to `LoginScreen` if desired or update selector), `casesTableFlow.e2e.test.tsx`, and `reminderCreationFlow.e2e.test.tsx`.

---

## 11. Exact Migrations Requiring Attention

| Migration Record in Neon | Status on Disk (`integration/phase-4-7-restoration`) | Action Needed |
|---|---|---|
| `accounts.0004_adminauditlog` | Missing on disk (`accounts_adminauditlog` exists, `0` rows) | **Leave untouched** in Neon unless Admin Audit feature is restored or explicitly retired; do not create a conflicting `accounts/0004_*` migration. |
| `cases.0007_caseassignmenthistory` | Missing on disk (`cases_caseassignmenthistory` exists, `0` rows) | **Leave untouched** in Neon unless Case Assignment History feature is restored or explicitly retired; do not create a conflicting `cases/0007_*` migration. |
| All other `52` migrations (`accounts` `0001`–`0003`, `cases` `0001`–`0006`, `reminders` `0001`–`0004`, `tokens` `0001`–`0002`, `notifications` `0001`–`0004`, `court_data` `0001`, `voice` `0001`, `agenda` `0001`, `token_blacklist` `0001`–`0013`, Django core) | Exact `52/52` match & `[X]` applied in Neon | **None.** Safe to reuse as-is with zero `--fake` or schema changes. |

---

## 12. Safe Production-Readiness Assessment

- **Database Schema Compatibility (`integration/phase-4-7-restoration` vs Neon `neondb`):** **SAFE / COMPATIBLE FOR READS AND WRITES.** All 25 restored model tables, columns, nullability flags, primary keys, foreign keys, unique constraints, and indexes match Neon cleanly (`25/25 MATCH`), and all 52 codebase migrations are already applied on Neon. This resolves the prior `main`-branch schema incompatibility on `cases_hearing`, `reminders_reminder`, `tokens_tokenalertrule`, and `notifications_*`.
- **Remaining Operational Gates Before Production Traffic:**
  1. Complete and run updated `frontend/tests/auth.test.ts` and `frontend/tests/e2e/*` against isolated mocks/test DBs.
  2. Supply real production environment variables (`DJANGO_SECRET_KEY`, `JWT_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `DATABASE_URL`, `REDIS_URL`/`CELERY_BROKER_URL`, and HTTPS `EXPO_PUBLIC_API_URL`) and confirm Redis availability for SSE/Celery locking in production.
  3. Explicitly approve **Option A** (leave the 2 extra empty tables untouched) or **Option B** (snapshot + clean removal) for `accounts_adminauditlog` & `cases_caseassignmenthistory` before creating any future `accounts`/`cases` migrations.

