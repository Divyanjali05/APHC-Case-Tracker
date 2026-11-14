import os

from .base import *  # noqa: F403
from .base import BASE_DIR, parse_database_url

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Database: PostgreSQL if DATABASE_URL provided, else local SQLite
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if DATABASE_URL:
    DATABASES = {"default": parse_database_url(DATABASE_URL)}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# Development CORS configuration
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# Console email backend for development
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
ENABLE_API_DOCS = True
