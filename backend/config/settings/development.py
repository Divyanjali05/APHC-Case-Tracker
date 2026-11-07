from urllib.parse import urlparse

from decouple import config

from .base import *  # noqa: F403
from .base import BASE_DIR

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Database Configuration:
# Connects to PostgreSQL if DATABASE_URL or DB_NAME is provided;
# otherwise falls back to SQLite for local development and rapid testing.
DATABASE_URL = config("DATABASE_URL", default=None)
DB_NAME = config("DB_NAME", default=None)
DB_USER = config("DB_USER", default="postgres")
DB_PASSWORD = config("DB_PASSWORD", default="")
DB_HOST = config("DB_HOST", default="localhost")
DB_PORT = config("DB_PORT", default=5432, cast=int)

if DATABASE_URL:
    parsed_db = urlparse(DATABASE_URL)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": parsed_db.path.lstrip("/"),
            "USER": parsed_db.username or "postgres",
            "PASSWORD": parsed_db.password or "",
            "HOST": parsed_db.hostname or "localhost",
            "PORT": parsed_db.port or 5432,
        }
    }
elif DB_NAME and DB_NAME.lower() not in ("sqlite", "sqlite3"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": DB_NAME,
            "USER": DB_USER,
            "PASSWORD": DB_PASSWORD,
            "HOST": DB_HOST,
            "PORT": DB_PORT,
        }
    }
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

# Execute Celery tasks synchronously in development and automated testing
CELERY_TASK_ALWAYS_EAGER = True

# Development cache: local in-memory cache for single-process development and automated testing
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "aphc-development-cache",
    }
}
