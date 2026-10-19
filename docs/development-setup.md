# APHC Case Tracker — Development Setup Guide

Complete instructions for setting up, developing, testing, and running both the Django backend and React Native Expo mobile frontend.

---

## 1. Prerequisites

Ensure the following tools are installed on your workstation:

- **Python**: 3.12 or 3.13
- **Node.js**: >= 18.0.0 (LTS recommended)
- **npm**: >= 9.0.0
- **Git**: 2.30+
- **Docker & Docker Compose** _(Optional for local SQLite development, required for production PostgreSQL + Redis stack)_

---

## 2. Repository Structure

```text
aphc-case-tracker/
├── backend/          # Django 5.1 REST API, Celery tasks, SimpleJWT, PostgreSQL/SQLite
├── frontend/         # React Native Expo SDK 51, TypeScript, Expo Router, TanStack Query
├── docs/             # Architecture, API contract, database design, setup guides
├── docker-compose.yml# Multi-container orchestration (PostgreSQL 16 + Redis 7)
└── README.md         # Monorepo root guide
```

---

## 3. Backend Setup

### Step 3.1: Virtual Environment

From the `backend/` directory:

```bash
# Windows PowerShell
python -m venv .venv
.venv\Scripts\Activate.ps1

# Linux / macOS
python3 -m venv .venv
source .venv/bin/activate
```

### Step 3.2: Install Python Dependencies

```bash
pip install -r requirements.txt
```

### Step 3.3: Configure Environment Variables

```bash
cp .env.example .env
```

Key variables in `backend/.env`:

```ini
DEBUG=True
SECRET_KEY=local-dev-insecure-secret-key-change-in-production
ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=sqlite:///db.sqlite3
# For PostgreSQL with Docker:
# DATABASE_URL=postgres://aphc_user:aphc_secret_pwd@localhost:5432/aphc_db
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### Step 3.4: Database Migrations & Initial Setup

```bash
# Run migrations
python manage.py migrate

# (Optional) Create a superuser for Django admin
python manage.py createsuperuser
```

### Step 3.5: Run Backend Tests & Linting

```bash
# Run test suite with pytest
pytest

# Check code formatting and linting
ruff check .
black --check .
```

### Step 3.6: Start Development Server

```bash
python manage.py runserver 8000
```

- Health Check: `http://localhost:8000/api/health/`
- Interactive Swagger UI: `http://localhost:8000/api/docs/`
- Django Admin: `http://localhost:8000/admin/`

### Step 3.7: Start Background Celery Workers (Optional)

When Redis is running:

```bash
# Start Celery Worker
celery -A config worker -l info

# Start Celery Beat Scheduler
celery -A config beat -l info
```

---

## 4. Frontend Setup

### Step 4.1: Install Node Dependencies

From the `frontend/` directory:

```bash
npm install
```

### Step 4.2: Configure Environment Variables

```bash
cp .env.example .env
```

Key variables in `frontend/.env`:

```ini
EXPO_PUBLIC_API_URL=http://localhost:8000/api
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_APP_NAME=APHC Case Tracker
EXPO_PUBLIC_DEFAULT_LOCALE=en
```

> **Android Emulator Tip**: Use `http://10.0.2.2:8000/api` to connect to `localhost:8000` on your host machine.

### Step 4.3: Verify Types, Linting & Tests

```bash
# TypeScript compiler check
npx tsc --noEmit

# ESLint validation (zero-warning policy)
npm run lint

# Jest unit tests
npm test
```

### Step 4.4: Start the Expo Development Server

```bash
npm start
```

Use the terminal QR code or press `a` for Android, `i` for iOS, or `w` for Web.

---

## 5. Docker Compose (PostgreSQL & Redis)

To launch production-grade PostgreSQL and Redis instances:

```bash
# From workspace root
docker compose up -d
```

Verify services:

```bash
docker compose ps
```

To stop services:

```bash
docker compose down
```

---

## 6. Pre-Commit Hooks

Git pre-commit hooks ensure all commits conform to code standards:

```bash
# Install pre-commit hooks
pre-commit install

# Run manually across all files
pre-commit run --all-files
```
