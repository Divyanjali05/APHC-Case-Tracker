# APHC Case Tracker

Production-oriented mobile application and backend services for advocates practicing at the High Court of Andhra Pradesh (APHC, Amaravati).

## Monorepo Layout

```text
aphc-case-tracker/
├── backend/            # Django 5 REST Framework, SimpleJWT, Celery
│   ├── config/         # Root settings, urls, celery app
│   ├── accounts/       # User & Advocate identity, Bar Council enrollment
│   ├── cases/          # Case dockets, status timelines, documents
│   ├── reminders/      # Compliance deadlines and advocate diary
│   ├── tokens/         # Live court hall display board tracking
│   ├── notifications/  # Expo push notification services
│   └── tests/          # Pytest backend test suite
├── mobile/             # React Native, Expo Router, TypeScript
│   ├── app/            # File-based navigation & screens
│   ├── components/     # Reusable UI components
│   ├── services/       # API clients, TanStack Query client
│   ├── i18n/           # Internationalization (English & Telugu)
│   └── tests/          # Jest & Testing Library suites
├── docs/               # Architecture, environment, workflow docs
├── .planning/          # GSD workflow roadmaps and phase plans
├── docker-compose.yml  # PostgreSQL 16 and Redis 7 containers
├── .coderabbit.yaml    # CodeRabbit AI PR review configuration
├── .pre-commit-config.yaml # Pre-commit hook definitions
├── .gitignore          # Repository ignore rules
└── README.md
```

## Quick Start

### 1. Prerequisites

- Python 3.12+ (Python 3.13 supported)
- Node.js 20+ (v22 installed) & npm
- Docker Desktop (for containerized PostgreSQL and Redis)

### 2. Backend Setup

```bash
cd backend
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Unix:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

Health check endpoint: `http://localhost:8000/api/health/`

### 3. Mobile Setup

```bash
cd mobile
npm install
cp .env.example .env
npx expo start
```

### 4. Running Tests & Quality Checks

```bash
# Backend tests & linting
cd backend
pytest
ruff check .
ruff format --check .

# Mobile tests & linting
cd mobile
npm test
npm run lint
```
