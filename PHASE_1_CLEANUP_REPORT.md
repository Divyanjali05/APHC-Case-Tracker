# APHC Case Tracker — Phase 1: Project Cleanup & Security Audit Report

**Date**: 2026-11-04
**Role**: Senior Django Backend Engineer, React Native Engineer, and Application Security Engineer
**Status**: **PASS** (Ready for Phase 2 upon user approval)

---

## 1. Project Architecture Overview

The **APHC Case Tracker** is a full-stack, enterprise-grade mobile application and API platform designed for legal practitioners to monitor, track, and receive real-time notifications for Andhra Pradesh High Court (APHC) case proceedings, court statuses, cause lists, and judgment deliveries.

The system is architected as:

- **Backend API & Service Layer**: Django 5.1 / Django REST Framework (DRF) with modular domain apps (`accounts`, `cases`, `court_data`, `notifications`, `reminders`, `tokens`).
- **Asynchronous Task & Event Pipeline**: Celery with Redis for asynchronous background polling, automated status synchronization, push notifications, and lock-protected distributed tasks.
- **Real-Time Delivery**: Redis Pub/Sub domain events backed by database fallback and cursor-based synchronization.
- **Frontend Client**: React Native 0.74.5 / Expo SDK 51.0.28 (Old Architecture, `newArchEnabled=false`, Hermes enabled) with TypeScript, Expo Router, React Query (`@tanstack/react-query`), and native multilingual speech recognition (`expo-speech-recognition@0.3.2`).
- **Internationalization**: Multilingual localization supporting English (`en`), Telugu (`te`), and Hindi (`hi`), featuring spoken Indic numeral normalization (Telugu ౧౨౩౪ / Devanagari १२३४ to Arabic digits).

---

## 2. Backend and Frontend Folder Structure

```text
Lawyerr/
├── backend/                               # Django REST Framework application
│   ├── apps/
│   │   ├── accounts/                      # Advocate profiles, authentication, password reset
│   │   ├── cases/                         # Case management, hearing tracking, judgments, history
│   │   ├── court_data/                    # APHC court data adapters, mock/official status syncing
│   │   ├── notifications/                 # In-app alerts, Expo push notifications, realtime events
│   │   ├── reminders/                     # Hearing reminder rules, preferences, Celery tasks
│   │   └── tokens/                        # Token tracking and display alerts
│   ├── common/                            # Shared utilities (distributed lock, etc.)
│   ├── config/                            # Django project configuration & settings
│   │   ├── settings/
│   │   │   ├── base.py                    # Common settings (apps, middleware, JWT, Celery)
│   │   │   ├── development.py             # Dev settings (SQLite default, CORS, console email)
│   │   │   └── production.py              # Prod hardening (SSL redirect, required secrets)
│   │   ├── asgi.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── integrations/                      # High Court API scrapers and integration wrappers
│   ├── tests/
│   │   ├── integration/                   # End-to-end API, security, status, and notification tests
│   │   └── unit/                          # Unit tests (validators, voice query normalizers, Indic digits)
│   ├── manage.py
│   ├── pyproject.toml
│   ├── pytest.ini
│   └── requirements.txt
│
├── frontend/                              # Expo React Native mobile application
│   ├── android/                           # Generated prebuilt native Android project (SDK 51)
│   ├── app/                               # Expo Router file-based screen routing
│   │   ├── (auth)/                        # Login, forgot-password, reset-password screens
│   │   ├── (tabs)/                        # Cases, reminders, dashboard index, settings tabs
│   │   ├── cases/                         # Case detail screen ([id].tsx)
│   │   └── _layout.tsx                    # Root layout with React Query and Theme providers
│   ├── assets/                            # Icons, splash screens, adaptive icons
│   ├── components/                        # Modular React Native UI components
│   │   ├── cases/                         # CaseCard, CaseHistoryTimeline, CourtStatusCard
│   │   ├── common/                        # Badge, Button, Card, RealtimeIndicator
│   │   ├── hearings/                      # RescheduleHearingModal, UpcomingHearingCard
│   │   ├── notifications/                 # NotificationCard
│   │   ├── reminders/                     # ReminderItem
│   │   └── speech/                        # VoiceInputModal with live waveform & editable transcript
│   ├── features/                          # Domain-specific client logic & React Query hooks
│   │   ├── auth/                          # Authentication schemas and hooks
│   │   ├── cases/                         # Case fetching and mutation hooks
│   │   ├── courtStatus/                   # Court status timeline hooks
│   │   ├── notifications/                 # Notification query hooks
│   │   ├── realtime/                      # SSE/long-polling realtime event subscribers
│   │   └── reminders/                     # Reminder preferences and creation hooks
│   ├── i18n/                              # i18next multilingual dictionary
│   │   ├── locales/                       # en.json, te.json, hi.json
│   │   └── index.ts
│   ├── services/                          # API and Native device bridges
│   │   ├── api/                           # Axios client with JWT interceptor and endpoints
│   │   ├── auth/                          # Token storage and session management
│   │   ├── notifications/                 # Expo push registration and badge management
│   │   └── speech/                        # Native speech recognition adapter & Indic normalizer
│   ├── tests/                             # Jest & React Native Testing Library test suites
│   ├── app.json                           # Expo app manifest & config plugins
│   ├── eas.json                           # EAS Build configuration (internal dev APK profile)
│   ├── package.json                       # Dependencies (Expo 51.0.28, RN 0.74.5, React 18.2.0)
│   └── tsconfig.json                      # Strict TypeScript compiler options
│
├── docs/                                  # Architectural specifications and phase blueprints
├── .gitignore                             # Root Git exclusion rules
├── .env.example                           # Safe project environment variable template
├── docker-compose.yml                     # Local Redis, Postgres, and Celery service definition
└── README.md
```

---

## 3. Sensitive Files Identified

| File Location                         | Classification   | Git Status                | Description & Protection Strategy                                                                                                                           |
| :------------------------------------ | :--------------- | :------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/.env`                        | Sensitive Config | **Ignored** (Not tracked) | Contains local development settings (`DJANGO_SECRET_KEY`, `JWT_SECRET_KEY`). Preserved locally for developer workstation usage; strictly excluded from Git. |
| `frontend/.env`                       | Client Config    | **Ignored** (Not tracked) | Contains public client environment variables (`EXPO_PUBLIC_API_URL`). Preserved locally; excluded from Git.                                                 |
| `frontend/android/app/debug.keystore` | Development Key  | Tracked (Prebuilt)        | Standard open-source Android debug keystore generated by Expo prebuild for local APK signing. Not for production release.                                   |

> [!NOTE]
> No hardcoded AWS access keys, GitHub tokens, production passwords, or private key blocks were detected in the codebase during automated static security scanning.

---

## 4. Unnecessary & Generated Files/Folders Identified

1. `frontend/dist/`: Empty build output artifact directory.
2. `.pytest_cache/` (root & backend): Test execution cache directories.
3. `.ruff_cache/` (root & backend): Linter cache directories.
4. `frontend/.expo/`: Expo CLI local bundling and web development cache.
5. `backend/**/__pycache__/`: Python compiled bytecode files (`*.pyc`).

---

## 5. Files & Folders Safely Removed

The following disposable cache and empty artifact directories were safely deleted without modifying any source code, database records, or application behavior:

- `frontend/dist/` (empty directory deleted).
- `.pytest_cache/` (root directory deleted).
- `.ruff_cache/` (root directory deleted).
- `backend/.pytest_cache/` (backend cache deleted).
- `backend/.ruff_cache/` (backend cache deleted).
- `frontend/.expo/` (local Expo web cache deleted).
- 22 `__pycache__/` directories across `backend/` domain packages.

---

## 6. Files Preserved (Crucial Assets Kept Intact)

The following essential files and environments were explicitly verified and preserved:

- **Database**: [`backend/db.sqlite3`](file:///c:/Users/divya/OneDrive/Documents/Lawyerr/backend/db.sqlite3) (contains local development database with all schema migrations and case records intact).
- **Environment Files**: `backend/.env` and `frontend/.env` (retained locally for immediate running without losing configuration).
- **Virtual Environments & Modules**: `backend/.venv/` (Python dependencies) and `frontend/node_modules/` (npm packages) preserved to maintain zero-downtime test and development readiness.
- **Native Android Project**: [`frontend/android/`](file:///c:/Users/divya/OneDrive/Documents/Lawyerr/frontend/android/) (SDK 51 prebuilt project with autolinked `expo-speech-recognition 0.3.2` and permissions).
- **All Source Code & Migrations**: 100% of Django models, views, serializers, tasks, migrations, React Native components, tests, and translation dictionaries from Phases 0–8 are intact.

---

## 7. `.gitignore` Changes

The root [`.gitignore`](file:///c:/Users/divya/OneDrive/Documents/Lawyerr/.gitignore) was enhanced to ensure comprehensive protection against accidental credential or artifact leakage:

```diff
 # Environment variables
 .env
-.env.local
-.env.*.local
+.env.*
+!.env.example
 *.env

 # Python & Django
 ...
 db.sqlite3
 db.sqlite3-journal
+*.sqlite
+*.sqlite3
+*.sqlite3-journal
 media/
 staticfiles/

 # Testing & Coverage
 .pytest_cache/
 .ruff_cache/
+.mypy_cache/
 .coverage
+coverage/
 htmlcov/
```

Key enhancements:

- Wildcard coverage `.env.*` ensures any newly created environment files (e.g. `.env.production`, `.env.staging`) are automatically ignored.
- Exception rule `!.env.example` guarantees public safe templates remain tracked.
- Added explicit coverage for `.mypy_cache/`, `coverage/`, and all SQLite extension variants (`*.sqlite`, `*.sqlite3`).

---

## 8. `.env.example` Changes

Created a unified root [`.env.example`](file:///c:/Users/divya/OneDrive/Documents/Lawyerr/.env.example) with clear categorization and safe placeholder values:

- Documents all backend variables: `DJANGO_DEBUG`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DATABASE_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`, `JWT_SECRET_KEY`, `JWT_ACCESS_MINUTES`, `JWT_REFRESH_DAYS`, `CORS_ALLOWED_ORIGINS`, and `SECURE_SSL_REDIRECT`.
- Documents all frontend variables: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_ENV`, `EXPO_PUBLIC_APP_NAME`, `EXPO_PUBLIC_DEFAULT_LOCALE`, and `EXPO_PUBLIC_ENABLE_DEMO`.
- Zero actual credentials or production secrets are contained in any `.env.example` file.

---

## 9. Security Recommendations

1. **Production Secret Generation**:
   In production deployments, ensure `DJANGO_SECRET_KEY` and `JWT_SECRET_KEY` are generated using cryptographically strong random strings (e.g., `python -c "import secrets; print(secrets.token_urlsafe(50))"`), and injected via environment variables or a secret vault (AWS Secrets Manager, HashiCorp Vault, Doppler).
2. **Database Hardening**:
   For staging and production environments, configure PostgreSQL via `DATABASE_URL` with SSL connection enforcement (`sslmode=require`).
3. **CORS & Allowed Hosts**:
   Strictly constrain `CORS_ALLOWED_ORIGINS` and `DJANGO_ALLOWED_HOSTS` to the verified production domains. `production.py` already enforces that insecure default secrets or wildcard hosts halt server startup.
4. **Android Release Keystore**:
   When preparing production release APK/AAB bundles, replace `debug.keystore` with an encrypted production upload keystore managed securely via EAS Credentials or local secure keystore storage.

---

## 10. Remaining Risks & Pending Actions

| Item                                   | Current Status                  | Recommended Action                                                                                                                |
| :------------------------------------- | :------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------- |
| **EAS Authentication for Android APK** | Unauthenticated                 | When ready for physical device testing, execute `npx eas-cli login` in `frontend/` to link the EAS project and trigger the build. |
| **Production Redis & Celery**          | Local Redis defaults configured | Ensure production infrastructure provides authenticated Redis (`rediss://:password@host:port/0`).                                 |
| **Phase 2 Implementation**             | Pending approval                | Await user review of Phase 1 before initiating Phase 2.                                                                           |

---

## 11. Final Verification Results

All automated verification suites were executed against the cleaned project:

| Component / Verification              | Target / Scope                                      | Result                                      | Status   |
| :------------------------------------ | :-------------------------------------------------- | :------------------------------------------ | :------- |
| **Backend Unit & Integration Tests**  | `pytest -v` (193 tests)                             | 192 passed, 1 skipped (100% pass) in 90.15s | **PASS** |
| **Backend Static Linter**             | `ruff check .`                                      | All checks passed                           | **PASS** |
| **Django Framework System Check**     | `python manage.py check`                            | 0 issues identified                         | **PASS** |
| **Django Migration Integrity**        | `python manage.py makemigrations --check --dry-run` | No changes detected (schemas synced)        | **PASS** |
| **Frontend Unit & Integration Tests** | `npm test` (14 suites, 155 tests)                   | 155 passed, 0 failed in 12.25s              | **PASS** |
| **Frontend Static Typing**            | `npx tsc --noEmit`                                  | 0 errors                                    | **PASS** |
| **Frontend Linter**                   | `npm run lint` (ESLint 8 / React rules)             | 0 errors, 0 warnings                        | **PASS** |
| **Database Preservation**             | SQLite integrity check                              | `backend/db.sqlite3` intact and accessible  | **PASS** |
| **Secret Protection**                 | Static regex audit                                  | 0 high-risk secrets exposed                 | **PASS** |

---

**Phase 1 Status**: **PASS**
_Phase 2 has NOT been started. Awaiting user authorization._
