# Phase 0 Plan — Repository Audit and Foundation Setup

## Goal

Establish a clean, production-oriented monorepo foundation for APHC Case Tracker with fully working Django and Expo starter applications, Docker configurations, linting, formatting, pre-commit hooks, testing frameworks, and documentation.

## Scope of Work

1. **Repository Audit**:
   - Inspect existing files, git state, tool installations (Python, Node.js, npm, Docker).
   - Document any environmental limits (such as absence of Docker Desktop on local host).
2. **Directory Architecture**:
   - Establish `backend/`, `mobile/`, `docs/`, and root orchestrators.
   - Set up modular Django apps (`accounts`, `cases`, `reminders`, `tokens`, `notifications`).
   - Set up Expo structure (`app`, `components`, `services`, `i18n`, `tests`).
3. **Tooling & Configuration**:
   - Pre-commit hooks (`.pre-commit-config.yaml`).
   - Ruff & Black formatting configuration via `backend/pyproject.toml`.
   - ESLint and Prettier for mobile.
   - CodeRabbit configuration (`.coderabbit.yaml`).
   - Docker Compose configuration (`docker-compose.yml`) for PostgreSQL 16 and Redis 7.
4. **Environment Isolation**:
   - Backend `.env.example` and local `.env`.
   - Mobile `.env.example` and local `.env`.
   - Guarantee zero hardcoded secrets or production credentials.
5. **Minimal Working Applications**:
   - Backend: Django starts without error, health check endpoint (`/api/health/`), SQLite fallback when PostgreSQL service is not running locally.
   - Mobile: Expo application boots cleanly, displays Welcome screen, validates i18n and theme.
6. **Testing Verification**:
   - Pytest executes backend tests cleanly.
   - Jest executes mobile tests cleanly.

## Acceptance Criteria

- [x] Initial audit findings documented.
- [x] Root monorepo structure conforms to architecture plan.
- [x] Django backend starts and passes system checks.
- [x] Mobile Expo app starts and passes TypeScript compilation and tests.
- [x] Linting and formatting commands functional.
- [x] Docker Compose configured for PostgreSQL and Redis.
- [x] CodeRabbit workflow documented.
- [x] No secrets exposed.
