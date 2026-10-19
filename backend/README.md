# APHC Case Tracker — Backend Service

Django REST Framework backend powering case tracking, court token proximity alerts, compliance reminders, and push notifications for advocates at the Andhra Pradesh High Court.

## Tech Stack

- Python 3.12 / 3.13
- Django 5.1 & Django REST Framework
- SimpleJWT (Access/Refresh Token Rotation)
- PostgreSQL (Production / Docker) & SQLite (Local fallback)
- Celery & Redis
- drf-spectacular (OpenAPI / Swagger)
- pytest & pytest-django
- Ruff & Black

## Directory Architecture

```text
backend/
├── config/
│   ├── settings/
│   │   ├── base.py
│   │   ├── development.py
│   │   └── production.py
│   ├── urls.py
│   ├── asgi.py
│   ├── wsgi.py
│   └── celery.py
├── apps/
│   ├── accounts/       # Lawyer profiles, Bar Council enrollment, auth
│   ├── cases/          # Case dockets, hearings, judgments
│   ├── reminders/      # Compliance deadlines & advocate diary
│   ├── tokens/         # Court hall display board & token alerts
│   └── notifications/  # Expo push tokens & message history
├── integrations/
│   └── aphc/           # Isolated APHC external API integration client
├── common/             # Shared permissions, pagination, exceptions, validators
└── tests/
    ├── unit/
    └── integration/
```

## Local Development Setup

```bash
python -m venv .venv
.venv\Scripts\activate   # On Windows
source .venv/bin/activate # On Unix

pip install -r requirements.txt
python manage.py makemigrations
python manage.py migrate
python manage.py runserver
```

Endpoints:

- API Base: `http://localhost:8000/api/`
- Health: `http://localhost:8000/api/health/`
- Swagger UI: `http://localhost:8000/api/docs/`
- OpenAPI Schema: `http://localhost:8000/api/schema/`

## Testing & Linting

```bash
pytest
ruff check .
ruff format --check .
```
