# Project Rules and Engineering Guidelines

## 1. Monorepo Principles

- Maintain strict boundary between `backend/` and `mobile/`.
- All shared contracts (data types, error codes, enum constants) must be documented in API docs or shared schema.
- Common infrastructure (Docker, CI/CD, pre-commit, CodeRabbit) resides at the repository root.

## 2. Backend Guidelines (Django & DRF)

- **Python Version**: Python 3.12/3.13 compatibility.
- **Code Style**: Ruff for linting and formatting. Follow PEP 8 standards.
- **Database**:
  - Always write database-agnostic Django ORM queries compatible with both PostgreSQL and SQLite.
  - Never hardcode SQL queries unless indexed search optimization mandates it.
  - Migrations must be committed for all model modifications.
- **Authentication**:
  - Use Django REST Framework with `rest_framework_simplejwt`.
  - Never store plain-text passwords or unhashed sensitive tokens.
- **Background Jobs**:
  - Offload scraping, long-running queries, and notification dispatches to Celery.
  - Ensure all Celery tasks are idempotent.
- **Zero Secrets**:
  - Always read configurations via `os.environ` or `django-environ`.
  - Keep secrets strictly in `.env` (gitignored). `.env.example` must contain placeholder keys only.

## 3. Mobile Guidelines (React Native & Expo)

- **Framework**: Expo with Expo Router file-based navigation.
- **Language**: Strict TypeScript (`noImplicitAny: true`, properly typed props and API responses).
- **Styling**: Clean, performant React Native `StyleSheet.create` or designated CSS-in-JS design system.
- **State & Data Fetching**: Use TanStack Query (React Query) for server state; avoid redundant global state.
- **Offline First**: All critical case data must be cached locally using AsyncStorage or expo-sqlite.
- **Localization**: All user-facing strings must use `t('key')` from `react-i18next`.

## 4. Code Quality & Review Workflow

- **Pre-commit**: Must pass `ruff check`, `ruff format`, `prettier`, and secret scans prior to committing.
- **Pull Requests & CodeRabbit**:
  - Every PR will be automatically reviewed by CodeRabbit.
  - AI-flagged security vulnerabilities, unhandled nulls, or performance regressions must be resolved before merging.
- **Testing**:
  - Backend: pytest + pytest-django unit and integration tests.
  - Mobile: Jest + React Native Testing Library component and hook tests.
