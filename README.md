# APHC Case Tracker

Production-grade mobile application and REST backend tailored for advocates practicing before the **High Court of Andhra Pradesh at Amaravati**.

The application provides case tracking, cause lists, hearing schedules, judgments, case history, compliance reminders, live court hall display board tracking, multilingual support (English, Telugu, Hindi), and voice reading features.

---

## 1. Project Monorepo Structure

```text
aphc-case-tracker/
│
├── frontend/                     # React Native Expo SDK 51 mobile application
│   ├── app/                      # Expo Router file-based navigation
│   │   ├── (auth)/login.tsx      # Advocate login with Bar Council enrollment validation
│   │   ├── (tabs)/               # Bottom tab bar navigation
│   │   │   ├── index.tsx         # Dashboard with stats, probe, voice welcome
│   │   │   ├── cases.tsx         # My Tracked Cases with instant filter & docket routing
│   │   │   ├── reminders.tsx     # Compliance deadlines & filing diary
│   │   │   ├── tokens.tsx        # Live court hall token tracker (15s polling)
│   │   │   └── settings.tsx      # Language selector (en/te/hi), push toggle, voice test
│   │   ├── cases/[id].tsx        # Case detail view with hearing history & voice summary
│   │   ├── _layout.tsx           # Root provider stack (QueryClient, SafeArea, StatusBar)
│   │   └── +not-found.tsx        # 404 fallback screen
│   │
│   ├── components/               # Modular UI components
│   │   ├── common/               # ScreenContainer, Card, Badge, Button, EmptyState, Loading
│   │   ├── cases/                # CaseCard
│   │   ├── dashboard/            # StatCard
│   │   ├── reminders/            # ReminderItem
│   │   └── tokens/               # CourtHallCard
│   │
│   ├── features/                 # Feature-specific schemas, hooks & domain logic
│   │   ├── auth/                 # Zod login schema
│   │   ├── cases/                # useCases, useCaseDetail hooks
│   │   ├── reminders/            # useReminders hook
│   │   ├── tokens/               # useCourtHalls hook
│   │   └── settings/             # UserPreferences interface & defaults
│   │
│   ├── services/                 # External service clients
│   │   ├── api/                  # Axios API client & REST endpoint routes
│   │   ├── auth/                 # Expo SecureStore token storage
│   │   ├── notifications/        # Expo Push notification integration
│   │   └── speech/               # Expo Speech (TTS) integration
│   │
│   ├── hooks/                    # Reusable React hooks
│   ├── types/                    # TypeScript interfaces (CaseItem, HearingItem, etc.)
│   ├── constants/                # Curated High Court theme color tokens
│   ├── utils/                    # Case number and date formatters
│   ├── i18n/                     # i18next configuration & locales (en, te, hi)
│   ├── assets/                   # Images, icons, fonts
│   ├── tests/                    # Jest & React Native Testing Library suites
│   ├── app.json                  # Expo app configuration
│   ├── package.json              # Frontend dependencies and scripts
│   ├── tsconfig.json             # TypeScript strict configuration
│   ├── eslint.config.js          # ESLint configuration
│   ├── .env.example              # Environment variables template
│   └── README.md                 # Frontend architecture & guide
│
├── backend/                      # Django 5.1 REST API & Celery services
│   ├── config/                   # Core Django project configuration
│   │   ├── settings/             # Modular settings
│   │   │   ├── base.py           # Shared settings & APPS_DIR path resolution
│   │   │   ├── development.py    # Local settings (SQLite default, debug enabled)
│   │   │   └── production.py     # Production settings (PostgreSQL, strict SSL)
│   │   ├── urls.py               # Root API routing & OpenAPI schema
│   │   ├── asgi.py               # ASGI application entry
│   │   ├── wsgi.py               # WSGI application entry
│   │   └── celery.py             # Celery broker configuration
│   │
│   ├── apps/                     # Modular Django applications
│   │   ├── accounts/             # Advocate profiles & SimpleJWT auth
│   │   ├── cases/                # Cases, hearings, cause list dockets
│   │   ├── reminders/            # Compliance rules & scheduled reminders
│   │   ├── tokens/               # Court hall status & token distance rules
│   │   └── notifications/        # Push device registration & audit history
│   │
│   ├── integrations/             # External court integrations
│   │   └── aphc/                 # Isolated APHC client interface & mock fixture
│   │       ├── client.py         # BaseAPHCClient & MockAPHCClient
│   │       ├── services.py       # APHCService wrapper
│   │       └── exceptions.py     # APHC-specific exceptions
│   │
│   ├── common/                   # Shared backend utilities
│   │   ├── permissions.py        # IsAdvocateOwner & IsVerifiedAdvocate
│   │   ├── pagination.py         # StandardPageNumberPagination
│   │   ├── exceptions.py         # Standardized error envelope handler
│   │   └── validators.py         # Bar council number & case year validators
│   │
│   ├── tests/                    # Backend automated tests
│   │   ├── unit/                 # Unit tests (validators, mock client)
│   │   └── integration/          # API integration tests (health, endpoints)
│   │
│   ├── manage.py                 # Django command-line utility
│   ├── requirements.txt          # Python dependencies
│   ├── pyproject.toml            # Ruff & Black tool configuration
│   ├── pytest.ini                # Pytest configuration
│   ├── .env.example              # Environment template
│   └── README.md                 # Backend documentation
│
├── docs/                         # Architecture and technical specifications
│   ├── architecture.md           # High-level architecture & sequence diagrams
│   ├── api-contract.md           # REST API endpoint contracts & payloads
│   ├── database-design.md        # Relational database schema & ER diagrams
│   └── development-setup.md      # Comprehensive setup & troubleshooting guide
│
├── docker-compose.yml            # PostgreSQL 16 & Redis 7 orchestration
├── .gitignore                    # Monorepo ignore rules
├── .editorconfig                 # Monorepo code style configuration
└── README.md                     # Monorepo root guide
```

---

## 2. Technology Stack

| Domain              | Technology                          | Details                                       |
| ------------------- | ----------------------------------- | --------------------------------------------- |
| **Mobile Frontend** | React Native 0.74, Expo SDK 51      | Cross-platform iOS/Android/Web client         |
| **Language**        | TypeScript 5.3                      | Strict type checking throughout               |
| **Navigation**      | Expo Router                         | File-based typed routing with tab layouts     |
| **Data Fetching**   | TanStack Query v5 + Axios           | Server-state caching and background polling   |
| **Localization**    | i18next & react-i18next             | English (`en`), Telugu (`te`), Hindi (`hi`)   |
| **Voice & Speech**  | Expo Speech                         | Text-to-speech voice readout of court dockets |
| **Backend API**     | Django 5.1 + Django REST Framework  | Clean modular apps with OpenAPI 3.0 docs      |
| **Authentication**  | djangorestframework-simplejwt       | RFC 7519 JWT with Bar Council enrollment ID   |
| **Database**        | PostgreSQL 16 (Prod) / SQLite (Dev) | Clean migrations applied                      |
| **Job Queue**       | Celery 5.4 + Redis 7                | Asynchronous cause list parsing & alert tasks |
| **Testing**         | pytest, Jest, RTL                   | Unit and integration test suites              |

---

## 3. Quick Start

### 3.1 Backend (Django)

```bash
cd backend
python -m venv .venv

# Activate virtual environment (Windows PowerShell)
.venv\Scripts\Activate.ps1
# (Linux/macOS) source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Run tests
pytest

# Start backend server
python manage.py runserver 8000
```

- API Health Check: `http://localhost:8000/api/health/`
- Interactive Swagger UI: `http://localhost:8000/api/docs/`

### 3.2 Frontend (Expo React Native)

```bash
cd frontend
npm install

# Run TypeScript checks & linting
npx tsc --noEmit
npm run lint

# Run unit tests
npm test

# Start Expo dev server
npm start
```

---

## 4. Verification Status

- **Frontend Tests**: 2 test suites passed, 8 tests passed (`PASS tests/App.test.tsx`, `PASS tests/health.test.ts`).
- **Frontend TypeScript**: Passed with 0 errors (`npx tsc --noEmit`).
- **Frontend ESLint**: Passed with 0 errors and 0 warnings (`npm run lint`).
- **Backend Tests**: 13 passed in 0.45s (`pytest`).
- **Backend Ruff & Black**: 65 files checked, 0 errors.
- **Backend Django System Checks**: 0 issues identified (`python manage.py check`).
- **Database Migrations**: All 5 Django apps migrated successfully.
